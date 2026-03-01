import express from 'express';
import bcrypt from 'bcryptjs';
import { jwtAuth } from '../middleware/auth.js';
import { requireAdmin, checkPermission } from '../middleware/permissions.js';
import getKnex from '../db/knex.js';

const router = express.Router();
const db = getKnex();

/**
 * GET /api/users
 */
router.get('/', jwtAuth, checkPermission('users', 'read'), async (req, res, next) => {
  try {
    const { search, role, is_active, limit = 50 } = req.query;

    let query = db('users')
      .select(
        'id', 'username', 'first_name', 'last_name', 'email', 'phone',
        'role', 'avatar_url', 'is_active', 'last_login', 'created_at'
      )
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit));

    if (search) {
      query = query.where(function() {
        this.where('username', 'like', `%${search}%`)
          .orWhere('first_name', 'like', `%${search}%`)
          .orWhere('last_name', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`);
      });
    }

    if (role) query = query.where({ role });
    if (is_active !== undefined) query = query.where({ is_active: is_active === 'true' });

    const users = await query;
    res.json({ ok: true, users });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/me
 */
router.get('/me', jwtAuth, async (req, res, next) => {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select(
        'id', 'username', 'first_name', 'last_name', 'email', 'phone',
        'bio', 'role', 'avatar_url', 'is_active', 'last_login', 'created_at'
      )
      .first();

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 */
router.get('/:id', jwtAuth, checkPermission('users', 'read'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await db('users')
      .where({ id })
      .select(
        'id', 'username', 'first_name', 'last_name', 'email', 'phone',
        'bio', 'role', 'avatar_url', 'is_active', 'last_login', 'created_at'
      )
      .first();

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users
 */
router.post('/', jwtAuth, checkPermission('users', 'create'), async (req, res, next) => {
  try {
    const { username, password, first_name, last_name, email, phone, role, bio } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password requis' });
    }

    const existing = await db('users').where({ username }).first();
    if (existing) {
      return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    }

    if (email) {
      const existingEmail = await db('users').where({ email }).first();
      if (existingEmail) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [id] = await db('users').insert({
      username,
      password: hashedPassword,
      first_name: first_name || null,
      last_name: last_name || null,
      email: email || null,
      phone: phone || null,
      bio: bio || null,
      role: role || 'viewer',
      is_active: true
    });

    const user = await db('users')
      .where({ id })
      .select('id', 'username', 'first_name', 'last_name', 'email', 'role', 'created_at')
      .first();

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user.created',
      entity_type: 'user',
      entity_id: id,
      metadata: JSON.stringify({ username })
    });

    console.log(`[users] ✅ User created: ${username} by ${req.user.username}`);

    res.status(201).json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/users/:id
 */
router.put('/:id', jwtAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const canEdit = 
      req.user.id === parseInt(id) ||
      await checkIfAdmin(req.user.id);

    if (!canEdit) {
      return res.status(403).json({ error: 'Permission refusée' });
    }

    if (updates.role && !await checkIfAdmin(req.user.id)) {
      delete updates.role;
    }

    delete updates.password;
    delete updates.id;
    delete updates.created_at;

    updates.updated_at = db.fn.now();

    await db('users').where({ id }).update(updates);

    const user = await db('users')
      .where({ id })
      .select('id', 'username', 'first_name', 'last_name', 'email', 'phone', 'bio', 'role', 'avatar_url', 'is_active')
      .first();

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user.updated',
      entity_type: 'user',
      entity_id: id,
      metadata: JSON.stringify({ fields: Object.keys(updates) })
    });

    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/:id
 */
router.delete('/:id', jwtAuth, checkPermission('users', 'delete'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.id === parseInt(id)) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const user = await db('users').where({ id }).first();

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    await db('users').where({ id }).del();

    await db('activity_logs').insert({
      user_id: req.user.id,
      action: 'user.deleted',
      entity_type: 'user',
      entity_id: id,
      metadata: JSON.stringify({ username: user.username })
    });

    console.log(`[users] 🗑️  User deleted: ${user.username} by ${req.user.username}`);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id/activity
 */
router.get('/:id/activity', jwtAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const activities = await db('activity_logs')
      .where({ user_id: id })
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit));

    res.json({ ok: true, activities });
  } catch (error) {
    next(error);
  }
});

async function checkIfAdmin(userId) {
  const user = await db('users').where({ id: userId }).first();
  return user && user.role === 'admin';
}

export default router;