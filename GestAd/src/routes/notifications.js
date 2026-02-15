import express from 'express';
import { jwtAuth } from '../middleware/auth.js';
import { createNotification, batchInsertNotifications } from '../utils/notifications.js';

const router = express.Router();

// GET /api/notifications
router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;

    let notifications = await db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(50);

    notifications = notifications.map(n => {
      try {
        if (n.data && typeof n.data === 'string') n.data = JSON.parse(n.data);
      } catch (e) {}
      return n;
    });

    const unreadCountRow = await db('notifications')
      .where({ user_id: userId, read: false })
      .count('* as count')
      .first();

    res.json({
      ok: true,
      notifications,
      unreadCount: parseInt(unreadCountRow.count, 10) || 0
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { id } = req.params;
    const userId = req.user.id;

    await db('notifications')
      .where({ id, user_id: userId })
      .update({ read: true, updated_at: db.fn.now() });

    // Emit update to the user so front can refresh
    const io = req.app.get('io');
    if (io) io.to(`user_${userId}`).emit('notification:updated', { id, read: true });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;

    const updated = await db('notifications')
      .where({ user_id: userId, read: false })
      .update({ read: true, updated_at: db.fn.now() });

    const io = req.app.get('io');
    if (io) io.to(`user_${userId}`).emit('notification:updated:all');

    res.json({ ok: true, updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications (création utilitaire)
router.post('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const io = req.app.get('io'); // may be undefined if Socket.IO not initialized
    const currentUser = req.user;

    const {
      user_id, user_ids, type, title, message, link = null, event_id = null, data = null
    } = req.body;

    if (!title || !type) return res.status(422).json({ ok: false, error: 'missing title or type' });

    if (Array.isArray(user_ids) && user_ids.length > 0) {
      if (!currentUser.is_admin) return res.status(403).json({ ok: false, error: 'forbidden' });

      const rows = user_ids.map(uid => [
        event_id ?? null,
        uid,
        type,
        title,
        message ?? null,
        data ? JSON.stringify(data) : null,
        link ?? null
      ]);

      const result = await batchInsertNotifications(db, rows, 500);

      if (io) {
        for (const uid of user_ids) {
          io.to(`user_${uid}`).emit('notification:refresh');
        }
      }

      return res.json({ ok: true, inserted: result.inserted });
    }

    let targetUserId = currentUser.id;
    if (user_id && currentUser.is_admin) targetUserId = user_id;

    const notif = await createNotification(db, targetUserId, type, title, message, link, { eventId: event_id, data });

    if (!notif) return res.status(500).json({ ok: false, error: 'create_failed' });

    try {
      if (notif.data && typeof notif.data === 'string') notif.data = JSON.parse(notif.data);
    } catch (e) {}

    if (io) {
      io.to(`user_${targetUserId}`).emit('notification:new', notif);
    }

    res.json({ ok: true, notification: notif });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/:id
 * - Supprime une notification identifiée par id.
 * - Seul le propriétaire (user_id) ou un admin peut supprimer.
 * - Emission Socket.IO: 'notification:deleted' (payload { id })
 */
router.delete('/:id', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const io = req.app.get('io');
    const { id } = req.params;
    const currentUser = req.user;

    const row = await db('notifications').where({ id }).first();
    if (!row) return res.status(404).json({ ok: false, error: 'not_found' });

    if (row.user_id !== currentUser.id && !currentUser.is_admin) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    await db('notifications').where({ id }).del();

    if (io) {
      io.to(`user_${row.user_id}`).emit('notification:deleted', { id: Number(id) });
    }

    res.json({ ok: true, deletedId: Number(id) });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications
 * - Supprime toutes les notifications de l'utilisateur courant,
 *   ou (admin only) celles d'un user passé en query ?user_id=NN
 * - Retourne le nombre de lignes supprimées.
 */
router.delete('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const io = req.app.get('io');
    const currentUser = req.user;
    const { user_id } = req.query;

    let targetUserId = currentUser.id;
    if (user_id) {
      if (!currentUser.is_admin) return res.status(403).json({ ok: false, error: 'forbidden' });
      targetUserId = Number(user_id);
    }

    const deleted = await db('notifications').where({ user_id: targetUserId }).del();

    if (io) {
      io.to(`user_${targetUserId}`).emit('notification:deleted:all', { count: deleted });
    }

    res.json({ ok: true, deleted });
  } catch (error) {
    next(error);
  }
});

export default router;