import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// helper: format Date -> 'YYYY-MM-DD HH:MM:SS' (MySQL DATETIME)
function mysqlDatetime(d = null) {
  const dt = d ? new Date(d) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

// Dossier de stockage pour les ressources
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'resources');

// assure que le dossier existe
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* ignore */ }

// storage multer sur disque (nom fichier unique)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = (Date.now() + '-' + Math.random().toString(36).slice(2,8) + '-' + file.originalname).replace(/\s+/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({ storage });

// --- In-memory fallback for links if DB not available ---
let _linkStore = [];
let _linkNextId = 1;

// POST /api/resources/upload  (file upload)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });

    const publicUrl = '/uploads/resources/' + req.file.filename;

    const knex = req.app && req.app.get && req.app.get('knex');
    const createdAt = mysqlDatetime();

    const resourceRow = {
      original_name: req.file.originalname,
      stored_name: req.file.filename,
      url: publicUrl,
      mime: req.file.mimetype,
      size: req.file.size,
      title: req.body.title || req.file.originalname || null,
      description: req.body.desc || null,
      user_id: req.user ? req.user.id : null,
      created_at: createdAt
    };

    if (knex) {
      try {
        const hasDocs = await knex.schema.hasTable('documents');
        if (hasDocs) {
          // Insert into documents as a persisted resource file
          const [id] = await knex('documents').insert({
            title: resourceRow.title || resourceRow.original_name || '',
            description: resourceRow.description,
            category: 'ressources',
            original_name: resourceRow.original_name || (resourceRow.title || ''),
            path: resourceRow.stored_name || '',
            url: resourceRow.url,
            file_size: resourceRow.size,
            mime_type: resourceRow.mime,
            uploaded_by: resourceRow.user_id,
            created_at: resourceRow.created_at
          });
          const row = await knex('documents').where({ id }).first();
          return res.json({ resource: row });
        }
      } catch (e) {
        console.debug('knex insert file failed, returning file info', e && e.message ? e.message : e);
      }
    }

    // fallback: return file info (not persisted)
    return res.json({
      resource: {
        id: resourceRow.stored_name,
        url: resourceRow.url,
        filename: resourceRow.original_name,
        size: resourceRow.size,
        mime: resourceRow.mime
      }
    });
  } catch (err) {
    console.error('resources upload error', err);
    return res.status(500).json({ error: 'upload_failed' });
  }
});

// GET /api/resources
// Return persisted documents with category 'ressources' if possible,
// else fallback to filesystem + in-memory links.
router.get('/', async (req, res) => {
  try {
    const knex = req.app && req.app.get && req.app.get('knex');
    if (knex) {
      try {
        const hasDocs = await knex.schema.hasTable('documents');
        if (hasDocs) {
          const rows = await knex('documents')
            .where({ category: 'ressources' })
            .orderBy('created_at', 'desc')
            .limit(500);
          return res.json(rows);
        }
      } catch (e) {
        console.debug('knex documents read failed, falling back to fs', e && e.message ? e.message : e);
      }
    }

    // Fallback: read uploads/resources and in-memory links
    let files = [];
    try {
      const names = fs.readdirSync(UPLOAD_DIR);
      files = names.map(fn => ({
        id: fn,
        filename: fn,
        original_name: fn,
        stored_name: fn,
        url: '/uploads/resources/' + fn,
        created_at: null
      }));
    } catch (e) {
      console.debug('read uploads dir failed', e && e.message ? e.message : e);
      files = [];
    }

    const combined = [..._linkStore.slice().reverse(), ...files];
    return res.json(combined);
  } catch (err) {
    console.error('resources list error', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

// POST /api/resources/links  (create a persistent link in documents)
router.post('/links', express.json(), async (req, res) => {
  try {
    const { url, title } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    try { new URL(url); } catch (e) { return res.status(400).json({ error: 'invalid url' }); }

    const knex = req.app && req.app.get && req.app.get('knex');

    // Normalize required fields to match DB constraints (title, original_name, path are NOT NULL)
    const titleVal = (title && String(title).trim()) || url || 'Lien';
    const originalNameVal = titleVal;
    const pathVal = ''; // for links we keep an empty path (table requires NOT NULL)
    const createdAt = mysqlDatetime();

    if (knex) {
      try {
        const hasDocs = await knex.schema.hasTable('documents');
        if (hasDocs) {
          const insert = {
            title: titleVal,
            description: null,
            category: 'ressources',
            original_name: originalNameVal,
            path: pathVal,
            url: url,
            file_size: null,
            mime_type: 'link',
            uploaded_by: req.user ? req.user.id : null,
            created_at: createdAt
          };
          const [id] = await knex('documents').insert(insert);
          const row = await knex('documents').where({ id }).first();
          return res.status(201).json(row);
        }
      } catch (e) {
        console.debug('knex documents insert failed, falling back to in-memory', e && e.message ? e.message : e);
      }
    }

    // fallback: store in-memory
    const item = {
      id: String(_linkNextId++),
      url,
      title: titleVal,
      mime: 'link',
      created_at: new Date().toISOString()
    };
    _linkStore.push(item);
    return res.status(201).json(item);
  } catch (err) {
    console.error('create link error', err);
    return res.status(500).json({ error: 'create_failed' });
  }
});

// DELETE /api/resources/links/:id
router.delete('/links/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const knex = req.app && req.app.get && req.app.get('knex');
    if (knex) {
      try {
        const hasDocs = await knex.schema.hasTable('documents');
        if (hasDocs) {
          const row = await knex('documents').where({ id, category: 'ressources' }).first();
          if (!row) return res.status(404).json({ error: 'not_found' });
          await knex('documents').where({ id }).del();
          return res.status(204).end();
        }
      } catch (e) {
        console.debug('knex documents delete failed, falling back to in-memory', e && e.message ? e.message : e);
      }
    }

    // fallback in-memory
    const idx = _linkStore.findIndex(x => String(x.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    _linkStore.splice(idx, 1);
    return res.status(204).end();
  } catch (err) {
    console.error('delete link error', err);
    return res.status(500).json({ error: 'delete_failed' });
  }
});

export default router;