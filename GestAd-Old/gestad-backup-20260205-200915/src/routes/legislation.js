import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { URL } from 'url';

const router = express.Router();

// Base storage dir (configurable)
const STORAGE_BASE = process.env.DOCUMENTS_STORAGE_PATH || path.resolve(process.cwd(), 'uploads', 'legislation');

// Ensure storage dir exists
(async () => {
  try {
    await fs.mkdir(STORAGE_BASE, { recursive: true });
    console.debug('[legislation] STORAGE_BASE =', STORAGE_BASE);
  } catch (e) {
    console.error('Could not create storage directory', STORAGE_BASE, e);
  }
})();

// multer storage config: we set filename to generated id + ext
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_BASE),
  filename: (req, file, cb) => {
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(file.originalname) || '';
    const storedName = id + ext;
    cb(null, storedName);
  }
});
const upload = multer({ storage });

// Helper to write metadata file alongside stored file or for link-only entries
async function writeMeta(storedName, originalName, fields = {}) {
  const id = path.parse(storedName || (fields.id || '')).name || (fields.id || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)));
  const meta = {
    id,
    storedName: storedName || null,
    originalName: originalName || null,
    size: fields.size || null,
    mimetype: fields.mimetype || null,
    title: fields.title || null,
    desc: fields.desc || null,
    uploadedAt: new Date().toISOString(),
    url: fields.url || (storedName ? `/uploads/legislation/${storedName}` : null),
    link: fields.link || null, // for external links
    kind: fields.link ? 'link' : (storedName ? 'file' : 'unknown')
  };
  const metaPath = path.join(STORAGE_BASE, id + '.json');
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

// simple URL validation (allow http/https)
function normalizeAndValidateUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // strip credentials if any
    u.username = '';
    u.password = '';
    return u.toString();
  } catch (e) {
    return null;
  }
}

/**
 * POST /api/legislation/upload
 * form-data: file (required), title (optional), desc (optional)
 * Existing behavior: upload file and create meta JSON pointing to stored file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const { filename: storedName, originalname } = req.file;
    const { title, desc } = req.body || {};
    // Save meta
    const meta = await writeMeta(storedName, originalname, { title, desc, size: req.file.size, mimetype: req.file.mimetype });
    return res.json(meta);
  } catch (err) {
    console.error('legislation upload error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/legislation/link
 * Body JSON: { url: string (required), title?: string, desc?: string }
 * Creates a meta JSON representing an external link (no file stored).
 */
router.post('/link', express.json(), async (req, res) => {
  try {
    const { url: rawUrl, title, desc } = req.body || {};
    const url = normalizeAndValidateUrl(String(rawUrl || '').trim());
    if (!url) return res.status(400).json({ error: 'invalid url' });

    // generate an id-like storedName for consistency (no real file)
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    // store meta with link
    const meta = await writeMeta(null, null, { id, title, desc, link: url, url });
    return res.status(201).json(meta);
  } catch (err) {
    console.error('legislation link create error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation
 * Return array of metadata (reads *.json files in storage)
 */
router.get('/', async (req, res) => {
  try {
    const files = await fs.readdir(STORAGE_BASE);
    const metaFiles = files.filter(f => f.endsWith('.json'));
    const items = await Promise.all(metaFiles.map(async mf => {
      try {
        const txt = await fs.readFile(path.join(STORAGE_BASE, mf), 'utf8');
        return JSON.parse(txt);
      } catch (e) { return null; }
    }));
    return res.json(items.filter(Boolean));
  } catch (err) {
    console.error('legislation list error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation/:id
 * Return metadata for one item
 */
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const metaPath = path.join(STORAGE_BASE, id + '.json');
    try {
      const txt = await fs.readFile(metaPath, 'utf8');
      return res.json(JSON.parse(txt));
    } catch (e) {
      return res.status(404).json({ error: 'not found' });
    }
  } catch (err) {
    console.error('legislation GET /:id error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation/:id/download
 * For file entries redirect to stored file; for link entries redirect to external link.
 */
router.get('/:id/download', async (req, res) => {
  try {
    const id = req.params.id;
    const metaPath = path.join(STORAGE_BASE, id + '.json');
    try {
      const txt = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(txt);
      if (meta.kind === 'link' && meta.link) {
        return res.redirect(meta.link);
      }
      if (meta.url) {
        return res.redirect(meta.url);
      }
      return res.status(404).json({ error: 'not found' });
    } catch (e) {
      return res.status(404).json({ error: 'not found' });
    }
  } catch (err) {
    console.error('legislation download error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * DELETE /api/legislation/:id
 * Remove the metadata JSON and the stored file if present.
 */
router.delete('/:id', /* jwtAuth, */ async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'missing id' });

    const metaPath = path.join(STORAGE_BASE, id + '.json');
    let meta;
    try {
      const txt = await fs.readFile(metaPath, 'utf8');
      meta = JSON.parse(txt);
    } catch (e) {
      // metadata not found
      return res.status(404).json({ error: 'not found' });
    }

    // Determine stored filename
    let storedName = meta.storedName || null;
    if (!storedName && meta.url && meta.url.startsWith('/uploads/')) {
      storedName = path.basename(meta.url);
    }

    // Unlink stored file if exists
    if (storedName) {
      try {
        let cand = String(storedName).replace(/^\/+/, ''); // remove leading slashes
        if (cand.startsWith('uploads/')) cand = cand.replace(/^uploads\//, '');
        if (cand.startsWith('legislation/')) cand = cand.replace(/^legislation\//, '');

        const filePath = path.resolve(STORAGE_BASE, cand);
        if (filePath.startsWith(STORAGE_BASE)) {
          await fs.unlink(filePath).catch(err => {
            if (err && err.code !== 'ENOENT') console.warn('[legislation] unlink error', { filePath, err });
          });
        } else {
          console.warn('[legislation] resolved filePath outside STORAGE_BASE, skipping unlink', { cand, filePath, STORAGE_BASE });
        }
      } catch (e) {
        console.warn('[legislation] failed to unlink file', e);
      }
    }

    // Remove metadata JSON
    try {
      await fs.unlink(metaPath).catch(err => {
        if (err && err.code !== 'ENOENT') console.warn('[legislation] unlink meta error', { metaPath, err });
      });
    } catch (e) {
      console.warn('[legislation] failed to unlink meta', e);
    }

    return res.status(204).end();
  } catch (err) {
    console.error('legislation DELETE /:id error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

export default router;