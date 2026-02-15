import express from 'express';
const router = express.Router();

/**
 * GET /api/documents/classify?category=slug&tag=slug
 */
router.get('/classify', async (req, res) => {
  const knex = req.app.get('knex');
  const { category, tag } = req.query;

  try {
    let q = knex('documents').select('documents.*');

    if (category) {
      q = q
        .join('document_categories', 'documents.id', 'document_categories.document_id')
        .join('categories', 'document_categories.category_id', 'categories.id')
        .where('categories.slug', category);
    }

    if (tag) {
      q = q
        .join('document_tags', 'documents.id', 'document_tags.document_id')
        .join('tags', 'document_tags.tag_id', 'tags.id')
        .where('tags.slug', tag);
    }

    const docs = await q.groupBy('documents.id');
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/documents/:id/categories
 * body: { category_id }
 */
router.post('/:id/categories', async (req, res) => {
  const knex = req.app.get('knex');
  const documentId = Number(req.params.id);
  const { category_id } = req.body;
  if (!category_id) return res.status(400).json({ error: 'category_id required' });

  try {
    await knex('document_categories').insert({ document_id: documentId, category_id }).onConflict(['document_id','category_id']).ignore();
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/documents/:id/categories/:categoryId
 */
router.delete('/:id/categories/:categoryId', async (req, res) => {
  const knex = req.app.get('knex');
  const documentId = Number(req.params.id);
  const categoryId = Number(req.params.categoryId);
  try {
    await knex('document_categories').where({ document_id: documentId, category_id: categoryId }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/documents/:id/tags
 * body: { name } // creates tag if missing
 */
router.post('/:id/tags', async (req, res) => {
  const knex = req.app.get('knex');
  const documentId = Number(req.params.id);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const slug = name.toLowerCase().replace(/\s+/g, '-');

  try {
    let tag = await knex('tags').where({ slug }).first();
    if (!tag) {
      const [tagId] = await knex('tags').insert({ name, slug });
      tag = await knex('tags').where({ id: tagId }).first();
    }

    await knex('document_tags').insert({ document_id: documentId, tag_id: tag.id }).onConflict(['document_id','tag_id']).ignore();
    res.status(201).json({ success: true, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/documents/:id/tags/:tagId
 */
router.delete('/:id/tags/:tagId', async (req, res) => {
  const knex = req.app.get('knex');
  const documentId = Number(req.params.id);
  const tagId = Number(req.params.tagId);
  try {
    await knex('document_tags').where({ document_id: documentId, tag_id: tagId }).del();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/documents/:id/classification
 */
router.get('/:id/classification', async (req, res) => {
  const knex = req.app.get('knex');
  const documentId = Number(req.params.id);
  try {
    const categories = await knex('categories')
      .join('document_categories', 'categories.id', 'document_categories.category_id')
      .where('document_categories.document_id', documentId)
      .select('categories.*');

    const tags = await knex('tags')
      .join('document_tags', 'tags.id', 'document_tags.tag_id')
      .where('document_tags.document_id', documentId)
      .select('tags.*');

    res.json({ categories, tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;