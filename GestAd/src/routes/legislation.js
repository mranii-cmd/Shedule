// (fichier entier, remplace la version actuelle)
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

// multer storage config...
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

// Helper to write metadata file...
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
// Normalize metadata shape for the client (add commonly expected aliases)
function normalizeMetaForClient(meta) {
  if (!meta) return meta;
  return {
    ...meta,
    // aliases used by the front-end (some parts expect these names)
    original_name: meta.originalName || meta.original_name || null,
    file_size: meta.size || meta.file_size || null,
    mime_type: meta.mimetype || meta.mime_type || null,
    created_at: meta.uploadedAt || meta.created_at || null
  };
}
// simple URL validation
function normalizeAndValidateUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.username = '';
    u.password = '';
    return u.toString();
  } catch (e) {
    return null;
  }
}

/**
 * POST /api/legislation/upload
 * (inchangé)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const { filename: storedName, originalname } = req.file;
    const { title, desc } = req.body || {};
    const meta = await writeMeta(storedName, originalname, { title, desc, size: req.file.size, mimetype: req.file.mimetype });
    return res.json(normalizeMetaForClient(meta));
  } catch (err) {
    console.error('legislation upload error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * POST /api/legislation/link
 * (inchangé)
 */
router.post('/link', express.json(), async (req, res) => {
  try {
    const { url: rawUrl, title, desc } = req.body || {};
    const url = normalizeAndValidateUrl(String(rawUrl || '').trim());
    if (!url) return res.status(400).json({ error: 'invalid url' });
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const meta = await writeMeta(null, null, { id, title, desc, link: url, url });
    return res.json(normalizeMetaForClient(meta));
  } catch (err) {
    console.error('legislation link create error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation
 * Now supports pagination via ?page=&limit= and returns X-Total-Count header.
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 20)); // default 20
    const offset = (page - 1) * limit;

    const files = await fs.readdir(STORAGE_BASE);
    const metaFiles = files.filter(f => f.endsWith('.json'));
    // read all metas (we need ordering by uploadedAt desc)
    const allItems = (await Promise.all(metaFiles.map(async mf => {
      try {
        const txt = await fs.readFile(path.join(STORAGE_BASE, mf), 'utf8');
        return JSON.parse(txt);
      } catch (e) { return null; }
    }))).filter(Boolean);

    // Sort by uploadedAt desc (ISO date strings)
    allItems.sort((a, b) => {
      const ta = a.uploadedAt || a.uploadedAt;
      const tb = b.uploadedAt || b.uploadedAt;
      return (tb || '').localeCompare(ta || '');
    });

    const total = allItems.length;
    const pageItems = allItems.slice(offset, offset + limit);

    res.set('X-Total-Count', String(total));
    return res.json(pageItems.map(normalizeMetaForClient));
  } catch (err) {
    console.error('legislation list error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation/search?q=...
 * Simple full-text-ish search over title, originalName, desc.
 */
router.get('/search', async (req, res) => {
  try {
    const rawQ = String(req.query.q || '').trim();
    if (!rawQ) return res.json([]);

    // normalize: remove diacritics and lowercase
    const normalize = s => String(s || '')
      .normalize('NFD')                       // decompose accents
      .replace(/\p{Diacritic}/gu, '')        // remove diacritic marks
      .toLowerCase();

    const tokens = normalize(rawQ).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return res.json([]);

    const files = await fs.readdir(STORAGE_BASE);
    const metaFiles = files.filter(f => f.endsWith('.json'));
    const items = await Promise.all(metaFiles.map(async mf => {
      try {
        const txt = await fs.readFile(path.join(STORAGE_BASE, mf), 'utf8');
        return JSON.parse(txt);
      } catch (e) { return null; }
    }));

    const matched = (items.filter(Boolean)).filter(item => {
      // Build haystack from multiple fields
      const hay = [
        item.title,
        item.originalName,
        item.original_name,
        item.desc,
        item.description,
        item.storedName,
        item.url,
        item.link
      ].filter(Boolean).join(' ');
      const hayNorm = normalize(hay);
      // require all tokens to be present (AND); change to some() for OR behavior
      return tokens.every(t => hayNorm.indexOf(t) !== -1);
    }).sort((a,b) => (b.uploadedAt||'').localeCompare(a.uploadedAt||''));

    // limit results to reasonable number
    const limited = matched.slice(0, 100);
    return res.json(limited);
  } catch (err) {
    console.error('legislation search error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation/:id/position?limit=PAGE_SIZE
 * Returns { page: number, index: number, total } where index is 0-based index in ordered list.
 * Client uses page to load the right page then highlight.
 */
router.get('/:id/position', async (req, res) => {
  try {
    const id = req.params.id;
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 20));

    const files = await fs.readdir(STORAGE_BASE);
    const metaFiles = files.filter(f => f.endsWith('.json'));
    const items = await Promise.all(metaFiles.map(async mf => {
      try {
        const txt = await fs.readFile(path.join(STORAGE_BASE, mf), 'utf8');
        return JSON.parse(txt);
      } catch (e) { return null; }
    }));
    const list = (items.filter(Boolean)).sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
    const total = list.length;
    const idx = list.findIndex(it => String(it.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const page = Math.floor(idx / limit) + 1;
    return res.json({ page, index: idx, total });
  } catch (err) {
    console.error('legislation position error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

/**
 * GET /api/legislation/:id
 * (unchanged)
 */
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const metaPath = path.join(STORAGE_BASE, id + '.json');
    try {
      const txt = await fs.readFile(metaPath, 'utf8');
      const parsed = JSON.parse(txt);
      return res.json(normalizeMetaForClient(parsed));
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
 * (unchanged)
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
 * (unchanged)
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
      return res.status(404).json({ error: 'not found' });
    }

    let storedName = meta.storedName || null;
    if (!storedName && meta.url && meta.url.startsWith('/uploads/')) {
      storedName = path.basename(meta.url);
    }

    if (storedName) {
      try {
        let cand = String(storedName).replace(/^\/+/, '');
        if (cand.startsWith('uploads/')) cand = cand.replace(/^uploads\//, '');
        if (cand.startsWith('legislation/')) cand = cand.replace(/^legislation\//, '');
        const filePath = path.resolve(STORAGE_BASE, cand);
        if (filePath.startsWith(STORAGE_BASE)) {
          await fs.unlink(filePath).catch(err => { if (err && err.code !== 'ENOENT') console.warn('[legislation] unlink error', { filePath, err }); });
        } else {
          console.warn('[legislation] resolved filePath outside STORAGE_BASE, skipping unlink', { cand, filePath, STORAGE_BASE });
        }
      } catch (e) {
        console.warn('[legislation] failed to unlink file', e);
      }
    }

    try {
      await fs.unlink(metaPath).catch(err => { if (err && err.code !== 'ENOENT') console.warn('[legislation] unlink meta error', { metaPath, err }); });
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