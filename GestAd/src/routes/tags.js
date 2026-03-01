import express from 'express';
import { jwtAuth } from '../middleware/auth.js';

const router = express.Router();

// Obtenir tous les tags
router.get('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const tags = await db('tags').select('*').orderBy('name', 'asc');
    res.json({ ok: true, tags });
  } catch (error) {
    next(error);
  }
});

// Créer un nouveau tag
router.post('/', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Le nom du tag est requis' });
    }
    
    const existing = await db('tags').where({ name }).first();
    if (existing) {
      return res.json({ ok: true, tag: existing });
    }
    
    const [id] = await db('tags').insert({
      name,
      color: color || '#1976d2'
    });
    
    const tag = await db('tags').where({ id }).first();
    res.json({ ok: true, tag });
  } catch (error) {
    next(error);
  }
});

// Ajouter un tag à un document
router.post('/document/:documentId', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { documentId } = req.params;
    const { tagId, tagName } = req.body;
    
    let actualTagId = tagId;
    
    if (tagName && !tagId) {
      let tag = await db('tags').where({ name: tagName }).first();
      if (!tag) {
        const [id] = await db('tags').insert({ name: tagName });
        tag = await db('tags').where({ id }).first();
      }
      actualTagId = tag.id;
    }
    
    const existing = await db('document_tags')
      .where({ document_id: documentId, tag_id: actualTagId })
      .first();
    
    if (!existing) {
      await db('document_tags').insert({
        document_id: documentId,
        tag_id: actualTagId
      });
    }
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Retirer un tag d'un document
router.delete('/document/:documentId/:tagId', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { documentId, tagId } = req.params;
    
    await db('document_tags')
      .where({ document_id: documentId, tag_id: tagId })
      .delete();
    
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Obtenir les tags d'un document
router.get('/document/:documentId', jwtAuth, async (req, res, next) => {
  try {
    const db = req.app.get('knex');
    const { documentId } = req.params;
    
    const tags = await db('tags')
      .join('document_tags', 'tags.id', 'document_tags.tag_id')
      .where('document_tags.document_id', documentId)
      .select('tags.*');
    
    res.json({ ok: true, tags });
  } catch (error) {
    next(error);
  }
});

export default router;