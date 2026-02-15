import bcrypt from 'bcryptjs';
import { verifyToken } from '../auth/jwt.js';
import knexConfig from '../db/knexfile.js';
import knex from 'knex';

const db = knex(knexConfig);

// Middleware to protect routes and attach user to req.user
export async function jwtAuth(req, res, next) {
  try {
    const h = req.headers.authorization || req.headers.Authorization;
    if (!h) return res.status(401).json({ error: 'no auth header' });
    const parts = h.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) return res.status(401).json({ error: 'bad auth header' });
    const token = parts[1];
    const decoded = verifyToken(token);
    // load fresh user information
    const user = await db('users').where({ id: decoded.id }).first();
    if (!user) return res.status(401).json({ error: 'user not found' });
    // sanitize minimal fields
    req.user = { id: user.id, username: user.username, role: user.role || 'user' };
    next();
  } catch (err) {
    console.error('jwtAuth', err.message);
    return res.status(401).json({ error: 'invalid token' });
  }
}

// Helper for local registration / password checking
export async function createUser({ username, password, email, role = 'user' }) {
  const hash = await bcrypt.hash(password, 10);
  const [id] = await db('users').insert({ username, password: hash, email, role });
  return { id, username, email, role };
}

export async function verifyCredentials(username, password) {
  const user = await db('users').where({ username }).first();
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return null;
  return { id: user.id, username: user.username, role: user.role || 'user' };
}