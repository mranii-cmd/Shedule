import express from 'express';
import getKnex from '../db/knex.js';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { jwtAuth } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const db = getKnex();

// Base directory for stored files
const STORAGE_BASE = process.env.DOCUMENTS_STORAGE_PATH || path.resolve(process.cwd(), 'uploads');

console.log('[documents] 📁 STORAGE_BASE =', STORAGE_BASE);

// Créer le dossier uploads s'il n'existe pas
await fs.mkdir(STORAGE_BASE, { recursive: true }).catch(err => {
  console.error('[documents] ❌ Erreur création dossier uploads:', err);
});

// ==========================================
// CONFIGURATION MULTER
// ==========================================
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const category = req.body.category || 'divers';
    const categoryDir = path.join(STORAGE_BASE, category);
    
    try {
      await fs.mkdir(categoryDir, { recursive: true });
      cb(null, categoryDir);
    } catch (err) {
      console.error('[documents] ❌ Erreur création dossier catégorie:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 50);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`));
    }
  }
});

// Catégories autorisées
const ALLOWED_CATEGORIES = [
  'procès-verbaux',
  'attestations',
  'bordereaux',
  'annonces',
  'demandes',
  'divers',
  'budget',
  'législation',
  'ressources'
];

// ==========================================
// ROUTES
// ==========================================

/**
 * GET /api/documents
 * Liste tous les documents (avec filtrage optionnel par catégorie)
 * Supporte pagination via ?page=&limit= et renvoie X-Total-Count header
 * ✅ Inclut les tags et l'état favori
 */
router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const { category } = req.query;
    const limit = Math.min(1000, parseInt(req.query.limit, 10) || 100); // sécurité : max 1000
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * limit;
    const userId = req.user.id;

    // Count query
    const countQuery = db('documents').count('* as count');
    if (category) countQuery.where({ category });

    // Data query
    const dataQuery = db('documents')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (category) dataQuery.where({ category });

    // Execute in parallel
    const [countResult, documents] = await Promise.all([countQuery.first(), dataQuery]);

    const total = countResult ? parseInt(countResult.count, 10) : 0;

    // If no documents, return empty array but provide total header
    if (!documents || documents.length === 0) {
      res.set('X-Total-Count', String(total));
      console.log(`[documents] 📋 Retrieved 0 documents (page=${page}, limit=${limit}, total=${total})`);
      return res.json([]);
    }

    // Collect document IDs
    const docIds = documents.map(d => d.id);

    // Fetch tags for all docs in one query and group them
    const tagRows = await db('tags')
      .join('document_tags', 'tags.id', 'document_tags.tag_id')
      .whereIn('document_tags.document_id', docIds)
      .select('tags.*', 'document_tags.document_id as document_id');

    const tagsByDoc = {};
    for (const row of tagRows) {
      if (!tagsByDoc[row.document_id]) tagsByDoc[row.document_id] = [];
      // remove document_id from tag object for cleanliness
      const { document_id, ...tag } = row;
      tagsByDoc[row.document_id].push(tag);
    }

    // Fetch favorites for the current user for these documents
    const favRows = await db('favorites')
      .where({ user_id: userId })
      .whereIn('document_id', docIds)
      .select('document_id');

    const favSet = new Set(favRows.map(r => r.document_id));

    // Attach tags and isFavorite to each document
    for (const doc of documents) {
      doc.tags = tagsByDoc[doc.id] || [];
      doc.isFavorite = favSet.has(doc.id);
    }

    // Provide the total via header for client-side pagination
    res.set('X-Total-Count', String(total));

    console.log(`[documents] 📋 Retrieved ${documents.length} documents (page=${page}, limit=${limit}, total=${total})`);
    res.json(documents);
  } catch (err) {
    console.error('[documents] ❌ Error listing documents:', err);
    next(err);
  }
});

/**
 * GET /api/documents/categories
 * Liste les catégories avec le nombre de documents
 */
router.get('/categories', async (req, res, next) => {
  try {
    const counts = await db('documents')
      .select('category')
      .count('* as count')
      .groupBy('category');
    
    const result = ALLOWED_CATEGORIES.map(cat => {
      const found = counts.find(c => c.category === cat);
      return {
        category: cat,
        count: found ? parseInt(found.count) : 0
      };
    });
    
    res.json(result);
  } catch (err) {
    console.error('[documents] ❌ Error getting categories:', err);
    next(err);
  }
});
// + Nouvelle route : retourner position/page d'un document (utile pour jump)
router.get('/:id/position', jwtAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    // Limit (page size) peut être passé en query ?limit=9, sinon fallback
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 9);

    const doc = await db('documents').where({ id }).first();
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    // On suppose ordering = created_at DESC (comme dans la liste)
    // compter le nombre de documents dans la même catégorie ayant created_at > doc.created_at
    // (ceux-ci sont "avant" dans l'ordre DESC)
    const countRow = await db('documents')
      .where({ category: doc.category })
      .andWhere('created_at', '>', doc.created_at)
      .count('* as cnt')
      .first();

    const beforeCount = countRow ? parseInt(countRow.cnt, 10) : 0;
    const position = beforeCount + 1; // position 1-based
    const page = Math.ceil(position / limit);

    // Optionnel : total documents in category
    const totalRow = await db('documents')
      .where({ category: doc.category })
      .count('* as total')
      .first();
    const totalInCategory = totalRow ? parseInt(totalRow.total, 10) : 0;

    return res.json({
      documentId: doc.id,
      category: doc.category,
      position,
      page,
      pageSize: limit,
      totalInCategory
    });
  } catch (err) {
    console.error('[documents] ❌ position error:', err);
    next(err);
  }
});
/**
 * POST /api/documents/upload
 * Upload un nouveau document
 */
router.post('/upload', jwtAuth, upload.single('file'), async (req, res, next) => {
  try {
    console.log('[documents] 📤 Upload request:', { body: req.body, file: req.file ? req.file.originalname : 'none' });
    
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    
    const { title, description, category } = req.body;
    
    if (!title || !category) {
      await fs.unlink(req.file.path).catch(err => console.warn('[documents] Unlink error:', err));
      return res.status(400).json({ error: 'Titre et catégorie requis' });
    }
    
    if (!ALLOWED_CATEGORIES.includes(category)) {
      await fs.unlink(req.file.path).catch(err => console.warn('[documents] Unlink error:', err));
      return res.status(400).json({ error: `Catégorie invalide. Valeurs autorisées: ${ALLOWED_CATEGORIES.join(', ')}` });
    }
    
    // Chemin relatif pour stocker en DB
    const relativePath = path.relative(STORAGE_BASE, req.file.path);
    
    const [id] = await db('documents').insert({
      title,
      description: description || null,
      category,
      original_name: req.file.originalname,
      path: relativePath,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      uploaded_by: req.user ? req.user.id : null,
    });
    
    const document = await db('documents').where({ id }).first();
    
    // ✅ Ajouter tags et favoris vides
    document.tags = [];
    document.isFavorite = false;
    
    console.log(`[documents] ✅ Document uploaded: ID=${id}, file=${req.file.originalname}`);
    res.status(201).json(document);
  } catch (err) {
    console.error('[documents] ❌ Upload error:', err);
    if (req.file) {
      await fs.unlink(req.file.path).catch(err => console.warn('[documents] Unlink error:', err));
    }
    next(err);
  }
});

/**
 * GET /api/documents/search?q=...
 */
router.get('/search', jwtAuth, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const userId = req.user.id;
    
    if (!q) return res.json([]);

    const like = `%${q}%`;
    const rows = await db('documents')
      .where('title', 'like', like)
      .orWhere('original_name', 'like', like)
      .orWhere('description', 'like', like)
      .orderBy('created_at', 'desc')
      .limit(50);
    
    // ✅ Ajouter tags et favoris
    for (const doc of rows) {
      const tags = await db('tags')
        .join('document_tags', 'tags.id', 'document_tags.tag_id')
        .where('document_tags.document_id', doc.id)
        .select('tags.*');
      doc.tags = tags;
      
      const favorite = await db('favorites')
        .where({ user_id: userId, document_id: doc.id })
        .first();
      doc.isFavorite = !!favorite;
    }
    
    console.log(`[documents] 🔍 Search "${q}" found ${rows.length} results`);
    return res.json(rows);
  } catch (err) {
    console.error('[documents] ❌ Search error:', err);
    next(err);
  }
});

/**
 * GET /api/documents/:id
 */
router.get('/:id', jwtAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const row = await db('documents').where({ id }).first();
    
    if (!row) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    
    // ✅ Ajouter tags et favoris
    const tags = await db('tags')
      .join('document_tags', 'tags.id', 'document_tags.tag_id')
      .where('document_tags.document_id', id)
      .select('tags.*');
    row.tags = tags;
    
    const favorite = await db('favorites')
      .where({ user_id: userId, document_id: id })
      .first();
    row.isFavorite = !!favorite;
    
    return res.json(row);
  } catch (err) {
    console.error('[documents] ❌ Get document error:', err);
    next(err);
  }
});

/**
 * GET /api/documents/:id/download
 */
router.get('/:id/download', async (req, res, next) => {
  try {
    const { id } = req.params;
    const row = await db('documents').where({ id }).first();
    
    if (!row) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    if (row.url && String(row.url).trim() !== '') {
      return res.redirect(String(row.url));
    }

    const candidateRaw = row.path;
    if (!candidateRaw) {
      console.warn('[documents] ⚠️  No path for document ID=', id);
      return res.status(404).json({ error: 'Fichier non disponible' });
    }

    let rel = String(candidateRaw).replace(/^\/+/, '');
    if (rel.startsWith('uploads/')) {
      rel = rel.slice('uploads/'.length);
    }

    const filePath = path.resolve(STORAGE_BASE, rel);

    if (!filePath.startsWith(STORAGE_BASE)) {
      console.warn('[documents] ⚠️  Path outside STORAGE_BASE:', { id, filePath });
      return res.status(400).json({ error: 'Chemin de fichier invalide' });
    }

    try {
      await fs.access(filePath);
    } catch (e) {
      console.warn('[documents] ⚠️  File not found:', { id, filePath });
      return res.status(404).json({ error: 'Fichier introuvable sur le disque' });
    }

    console.log(`[documents] 📥 Download: ${row.original_name}`);
    return res.download(filePath, row.original_name || path.basename(filePath), (err) => {
      if (err) console.error('[documents] ❌ Download error:', err);
    });
  } catch (err) {
    console.error('[documents] ❌ Download route error:', err);
    next(err);
  }
});

/**
 * DELETE /api/documents/:id
 */
router.delete('/:id', jwtAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const row = await db('documents').where({ id }).first();
    
    if (!row) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }

    const candidateRaw = row.path;
    if (candidateRaw) {
      try {
        let rel = String(candidateRaw).replace(/^\/+/, '');
        if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);
        const filePath = path.resolve(STORAGE_BASE, rel);
        
        if (filePath.startsWith(STORAGE_BASE)) {
          await fs.unlink(filePath).catch(err => {
            if (err && err.code !== 'ENOENT') {
              console.warn('[documents] ⚠️  Unlink error:', { filePath, err });
            }
          });
          console.log(`[documents] 🗑️  File deleted: ${filePath}`);
        }
      } catch (e) {
        console.warn('[documents] ⚠️  Delete file error:', e);
      }
    }

    // ✅ Supprimer aussi les tags et favoris liés (CASCADE devrait le faire automatiquement)
    await db('documents').where({ id }).del();
    console.log(`[documents] ✅ Document deleted: ID=${id}`);

    return res.status(204).end();
  } catch (err) {
    console.error('[documents] ❌ Delete error:', err);
    next(err);
  }
});

export default router;