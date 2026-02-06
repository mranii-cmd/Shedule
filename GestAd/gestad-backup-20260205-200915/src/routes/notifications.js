import express from 'express';
import { jwtAuth } from '../middleware/auth.js';

const router = express.Router();

// Obtenir les notifications de l'utilisateur
router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;

    const notifications = await db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(50);

    const unreadCount = await db('notifications')
      .where({ user_id: userId, read: false })
      .count('* as count')
      .first();

    res.json({
      ok: true,
      notifications,
      unreadCount: parseInt(unreadCount.count)
    });
  } catch (error) {
    next(error);
  }
});

// Marquer une notification comme lue
router.put('/:id/read', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { id } = req.params;
    const userId = req.user.id;

    await db('notifications')
      .where({ id, user_id: userId })
      .update({ read: true });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Marquer toutes les notifications comme lues
router.put('/mark-all-read', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;

    await db('notifications')
      .where({ user_id: userId, read: false })
      .update({ read: true });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Créer une notification (fonction utilitaire)
router.post('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { type, title, message, link } = req.body;
    const userId = req.user.id;

    const [notification] = await db('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        link
      })
      .returning('*');

    res.json({ ok: true, notification });
  } catch (error) {
    next(error);
  }
});

export default router;