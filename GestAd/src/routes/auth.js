import express from 'express';
import knexConfig from '../db/knexfile.js';
import knex from 'knex';
import { createUser, verifyCredentials } from '../middleware/auth.js';
import { signToken } from '../auth/jwt.js';
import { jwtAuth } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validation.js';

const router = express.Router();
const db = knex(knexConfig);

// Register
router.post('/register', validate(schemas.register), async (req, res, next) => {
  try {
    const { username, password, email } = req.body;

    const exists = await db('users').where({ username }).first();
    if (exists) return res.status(409).json({ error: 'username already taken' });

    const newUser = await createUser({ username, password, email });
    const token = signToken({ id: newUser.id, username: newUser.username });
    res.json({ ok: true, user: { id: newUser.id, username: newUser.username }, token });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', validate(schemas.login), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await verifyCredentials(username, password);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken({ id: user.id, username: user.username });
    res.json({ ok: true, user, token });
  } catch (err) {
    next(err);
  }
});

// Me - return current user (requires JWT)
router.get('/me', jwtAuth, async (req, res, next) => {
  try {
    // jwtAuth already attached minimal user to req.user
    res.json({ ok: true, user: req.user });
  } catch (err) {
    next(err);
  }
});

export default router;