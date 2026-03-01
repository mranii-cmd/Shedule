import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// storage config (uploads/documents)
const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, name);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

/**
 * POST /api/documents/upload
 * form-data:
 *  - file: file to upload (required)
 *  - title: optional title
 *  - category: optional category slug (will create document_categories linkage if tables exist)
 *  - type_slug or type_id: optional to set document type
 *  - created_by: optional user id
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  const knex = req.app.get('knex');
  if (!knex) return res.status(500).json({ error: 'no_db' });

  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const { title, category, type_slug, type_id, year, created_by } = req.body || {};
  const file = req.file;
  const filename = file.filename;
  const mimetype = file.mimetype;
  const size = file.size;
  const original_name = file.originalname;
  const stored_path = path.posix.join('uploads', 'documents', filename);
  const now = new Date();
  const createdBy = created_by ? Number(created_by) : (req.user && req.user.id ? Number(req.user.id) : null);

  try {
    // resolve type_id if type_slug provided
    let resolvedTypeId = null;
    if (type_id) resolvedTypeId = Number(type_id);
    else if (type_slug) {
      const t = await knex('types').where({ slug: String(type_slug) }).first().catch(() => null);
      if (t) resolvedTypeId = t.id;
    }

    const insert = {
      title: title || original_name,
      original_name,
      filename,
      mimetype,
      size,
      path: stored_path,
      url: null,
      created_at: now,
      updated_at: now,
      created_by: createdBy,
      type_id: resolvedTypeId
      // do not set year here unless schema has it
    };

    // Insert document (handle different DB behaviors regarding .returning)
    let insertedId = null;
    try {
      const insertResult = await knex('documents').insert(insert).returning('id');
      if (Array.isArray(insertResult) && insertResult.length) {
        const first = insertResult[0];
        insertedId = (typeof first === 'object') ? (first.id || first) : first;
      } else if (typeof insertResult === 'number' || typeof insertResult === 'string') {
        insertedId = insertResult;
      }
    } catch (e) {
      // fallback for MySQL: insert then SELECT LAST_INSERT_ID()
      await knex('documents').insert(insert);
      const rows = await knex.raw('SELECT LAST_INSERT_ID() as id');
      // rows shape may vary; try common shapes
      if (rows && rows[0] && rows[0][0] && rows[0][0].id) insertedId = rows[0][0].id;
      else if (rows && rows[0] && rows[0].id) insertedId = rows[0].id;
    }

    // Attempt to link category ONLY if tables exist
    if (category && insertedId) {
      try {
        const hasCategories = await knex.schema.hasTable('categories');
        const hasDocCats = await knex.schema.hasTable('document_categories');
        if (hasCategories && hasDocCats) {
          const cat = await knex('categories').where({ slug: String(category) }).first().catch(() => null);
          if (cat) {
            await knex('document_categories').insert({ document_id: insertedId, category_id: cat.id }).catch(() => {});
          } else {
            // category slug not found: ignore silently
            console.debug('documents-upload: category slug not found, skipping linking:', category);
          }
        } else {
          console.debug('documents-upload: categories or document_categories table missing, skipping linking.');
        }
      } catch (catErr) {
        // don't fail the whole request if category linking fails
        console.debug('documents-upload: category linking failed, continuing upload', catErr && catErr.message ? catErr.message : catErr);
      }
    }

    // fetch inserted document if possible
    let doc = null;
    if (insertedId) {
      try {
        doc = await knex('documents').where({ id: insertedId }).first().catch(() => null);
      } catch (e) {
        doc = null;
      }
    }

    return res.status(201).json({ success: true, document: doc || { id: insertedId, filename, original_name, path: stored_path } });
  } catch (err) {
    console.error('Upload error:', err && err.stack ? err.stack : err);
    // cleanup stored file on error
    try { fs.unlinkSync(path.join(uploadsDir, filename)); } catch (e) { /* ignore */ }
    return res.status(500).json({ error: err.message || 'upload_failed' });
  }
});

export default router;