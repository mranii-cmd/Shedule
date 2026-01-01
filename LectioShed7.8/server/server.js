/**
 * Minimal EDT API server (Express + mysql2/promise)
 * + JWT authentication (minimal)
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(helmet());
app.use(bodyParser.json({ limit: '10mb' }));

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  message: { ok: false, error: 'Too many login attempts' }
});

app.use('/api/login', loginLimiter);
const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'edt_user',
  password: process.env.DB_PASS || 'secret',
  database: process.env.DB_NAME || 'edt_db',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  queueLimit: 0
};

let pool;

/** Initialize DB and ensure tables exist */
async function initDb() {
  pool = mysql.createPool(DB_CONFIG);
  // Create minimal tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS global_data (
      id INT PRIMARY KEY DEFAULT 1,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      name VARCHAR(191) PRIMARY KEY,
      data JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

initDb().catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

// ---------- AUTH CONFIG ----------
// ✅ APRÈS (sécurisé)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ FATAL: JWT_SECRET must be set in . env (min 32 chars)');
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'; // configurable
const ADMIN_USER = process.env.ADMIN_USER || process.env.ADM_USER || 'admin';
// ADMIN_PASSWORD can be plain (not recommended) OR provide ADMIN_PASSWORD_HASH (bcrypt hash)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';

// Helper: verify admin credentials
async function verifyAdminCredentials(username, password) {
  if (username !== ADMIN_USER) return false;
  // If a bcrypt hash is provided, use it
  if (ADMIN_PASSWORD_HASH && ADMIN_PASSWORD_HASH.length > 0) {
    try {
      return await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    } catch (e) {
      return false;
    }
  }
  // Fallback: compare plain text
  if (ADMIN_PASSWORD && ADMIN_PASSWORD.length > 0) {
    // constant-time comparison
    try {
      const a = Buffer.from(String(password));
      const b = Buffer.from(String(ADMIN_PASSWORD));
      if (a.length !== b.length) return false;
      return cryptoTimingSafeEqual(a, b);
    } catch (e) {
      return false;
    }
  }
  return false;
}

// small timing-safe equal (Node <-> safe alternative)
function cryptoTimingSafeEqual(aBuf, bBuf) {
  if (!Buffer.isBuffer(aBuf)) aBuf = Buffer.from(aBuf);
  if (!Buffer.isBuffer(bBuf)) bBuf = Buffer.from(bBuf);
  if (aBuf.length !== bBuf.length) return false;
  // use crypto.timingSafeEqual if available
  try {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch (e) {
    // fallback
    let res = 0;
    for (let i = 0; i < aBuf.length; i++) {
      res |= aBuf[i] ^ bBuf[i];
    }
    return res === 0;
  }
}

// Generate token
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Middleware to protect routes
function authenticateJWT(req, res, next) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Missing Authorization header' });
  const token = auth.slice('Bearer '.length).trim();
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ ok: false, error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// ---------- UTILITY DB HELPERS ----------
async function readGlobal() {
  const [rows] = await pool.query('SELECT data FROM global_data WHERE id = 1');
  if (!rows || rows.length === 0) return null;
  return rows[0].data;
}

async function writeGlobal(data) {
  const json = JSON.stringify(data || {});
  await pool.query('INSERT INTO global_data (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)', [json]);
}

async function readSession(name) {
  const [rows] = await pool.query('SELECT data FROM sessions WHERE name = ?', [name]);
  if (!rows || rows.length === 0) return null;
  return rows[0].data;
}

async function writeSession(name, data) {
  const json = JSON.stringify(data || {});
  await pool.query('INSERT INTO sessions (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)', [name, json]);
}

async function deleteSession(name) {
  await pool.query('DELETE FROM sessions WHERE name = ?', [name]);
}

async function listSessions() {
  const [rows] = await pool.query('SELECT name, updated_at FROM sessions ORDER BY updated_at DESC');
  return rows;
}

// ---------- AUTH ENDPOINT ----------
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'username and password required' });

    const ok = await verifyAdminCredentials(username, password);
    if (!ok) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    const token = signToken({ username });
    return res.json({ ok: true, token, expiresIn: JWT_EXPIRES_IN });
  } catch (err) {
    console.error('POST /api/login error', err);
    return res.status(500).json({ ok: false, error: 'server error' });
  }
});

// ---------- PUBLIC / PROTECTED ROUTES ----------
// Health (public)
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, status: 'healthy' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message) });
  }
});

// Public read global
app.get('/api/global', async (req, res) => {
  try {
    const data = await readGlobal();
    res.json({ ok: true, data });
  } catch (err) {
    console.error('GET /api/global error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Protected write global
app.post('/api/global', authenticateJWT, async (req, res) => {
  try {
    const payload = req.body && req.body.data !== undefined ? req.body.data : req.body;
    await writeGlobal(payload || {});
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/global error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Session routes (GET public, POST/DELETE protected)
app.get('/api/session/:name', async (req, res) => {
  try {
    const name = req.params.name;
    const data = await readSession(name);
    res.json({ ok: true, data });
  } catch (err) {
    console.error('GET /api/session/:name', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/session/:name', authenticateJWT, async (req, res) => {
  try {
    const name = req.params.name;
    const payload = req.body && req.body.data !== undefined ? req.body.data : req.body;
    await writeSession(name, payload || {});
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/session/:name', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/session/:name', authenticateJWT, async (req, res) => {
  try {
    const name = req.params.name;
    await deleteSession(name);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/session/:name', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const rows = await listSessions();
    res.json({ ok: true, sessions: rows });
  } catch (err) {
    console.error('GET /api/sessions', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* Backup import: accept { global?:{}, sessions?: { name: data, ... }, activeSession? } */
app.post('/api/backup/import', authenticateJWT, async (req, res) => {
  try {
    const backup = req.body && req.body.backup !== undefined ? req.body.backup : req.body;
    if (!backup) return res.status(400).json({ ok: false, error: 'backup payload required' });

    if (backup.global) {
      await writeGlobal(backup.global);
    }
    if (backup.sessions && typeof backup.sessions === 'object') {
      for (const [name, sdata] of Object.entries(backup.sessions)) {
        await writeSession(name, sdata);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/backup/import', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/backup/export', async (req, res) => {
  try {
    const global = await readGlobal();
    const rows = await pool.query('SELECT name, data FROM sessions');
    const sessions = {};
    (rows[0] || []).forEach(r => {
      sessions[r.name] = r.data;
    });
    res.json({ ok: true, global, sessions });
  } catch (err) {
    console.error('GET /api/backup/export', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* Admin clear: delete all sessions and reset global (protected) */
app.delete('/api/clear', authenticateJWT, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM global_data WHERE id = 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/clear', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start server
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`EDT API server listening on port ${PORT}, CORS origin: ${CORS_ORIGIN}`);
});