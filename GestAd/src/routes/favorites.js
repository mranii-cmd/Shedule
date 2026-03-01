import express from 'express';
import { jwtAuth } from '../middleware/auth.js';

const router = express.Router();

// Obtenir les favoris de l'utilisateur
router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;
    
    const favorites = await db('documents')
      .join('favorites', 'documents.id', 'favorites.document_id')
      .where('favorites.user_id', userId)
      .select('documents.*', 'favorites.created_at as favorited_at')
      .orderBy('favorites.created_at', 'desc');
    
    // Ajouter les tags et l'état favori pour chaque document
    for (const doc of favorites) {
      const tags = await db('tags')
        .join('document_tags', 'tags.id', 'document_tags.tag_id')
        .where('document_tags.document_id', doc.id)
        .select('tags.*');
      doc.tags = tags;
      doc.isFavorite = true;
    }
    
    res.json({ ok: true, favorites });
  } catch (error) {
    next(error);
  }
});

// Ajouter un document aux favoris
router.post('/:documentId', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;
    const { documentId } = req.params;
    
    const existing = await db('favorites')
      .where({ user_id: userId, document_id: documentId })
      .first();
    
    if (existing) {
      return res.json({ ok: true, message: 'Déjà en favori' });
    }
    
    await db('favorites').insert({
      user_id: userId,
      document_id: documentId
    });
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Retirer un document des favoris
router.delete('/:documentId', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;
    const { documentId } = req.params;
    
    await db('favorites')
      .where({ user_id: userId, document_id: documentId })
      .delete();
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Vérifier si un document est en favori
router.get('/check/:documentId', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const userId = req.user.id;
    const { documentId } = req.params;
    
    const favorite = await db('favorites')
      .where({ user_id: userId, document_id: documentId })
      .first();
    
    res.json({ ok: true, isFavorite: !!favorite });
  } catch (error) {
    next(error);
  }
});

export default router;