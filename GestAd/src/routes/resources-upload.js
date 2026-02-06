import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

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

// POST /api/resources/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });

    // Construire une URL publique (ton app sert déjà /uploads en static)
    const publicUrl = '/uploads/resources/' + req.file.filename;

    // Optionnel : sauvegarder métadonnées en base (req.app.get('knex')) si nécessaire
    const knex = req.app && req.app.get && req.app.get('knex');
    const resourceRow = {
      original_name: req.file.originalname,
      stored_name: req.file.filename,
      url: publicUrl,
      mime: req.file.mimetype,
      size: req.file.size,
      title: req.body.title || null,
      description: req.body.desc || null,
      user_id: req.user ? req.user.id : null
    };

    if (knex) {
      try {
        const [id] = await knex('resources').insert(resourceRow);
        resourceRow.id = id;
      } catch (e) {
        // ignore DB failure but continue returning file info
        console.debug('resources: db insert failed', e && e.message ? e.message : e);
      }
    }

    return res.json({
      resource: {
        id: resourceRow.id || req.file.filename,
        url: publicUrl,
        filename: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype
      }
    });
  } catch (err) {
    console.error('resources upload error', err);
    return res.status(500).json({ error: 'upload_failed' });
  }
});

// GET /api/resources
// Retourne la liste des ressources enregistrées (BDD si disponible, sinon filesystem)
router.get('/', async (req, res) => {
  try {
    const knex = req.app && req.app.get && req.app.get('knex');
    if (knex) {
      try {
        const has = await knex.schema.hasTable('resources');
        if (has) {
          const rows = await knex('resources').select('*').orderBy('created_at', 'desc').limit(500);
          return res.json({ resources: rows });
        }
      } catch (e) {
        console.debug('knex resources read failed, falling back to fs', e && e.message ? e.message : e);
      }
    }

    // Fallback: lire le dossier uploads/resources
    let files = [];
    try {
      const names = fs.readdirSync(UPLOAD_DIR);
      files = names.map(fn => ({
        id: fn,
        filename: fn,
        original_name: fn,
        stored_name: fn,
        url: '/uploads/resources/' + fn
      }));
    } catch (e) {
      console.debug('read uploads dir failed', e && e.message ? e.message : e);
      files = [];
    }
    return res.json({ resources: files });
  } catch (err) {
    console.error('resources list error', err);
    return res.status(500).json({ error: 'list_failed' });
  }
});

export default router;