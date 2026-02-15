import express from 'express';
const router = express.Router();

// GET /api/categories
router.get('/', async (req, res) => {
  const knex = req.app.get('knex');
  try {
    const cats = await knex('categories').select('*').orderBy('name');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories
router.post('/', async (req, res) => {
  const knex = req.app.get('knex');
  const { name, slug, description, parent_id } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
  try {
    const [id] = await knex('categories').insert({ name, slug, description, parent_id });
    const category = await knex('categories').where({ id }).first();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  const knex = req.app.get('knex');
  const id = Number(req.params.id);
  try {
    const category = await knex('categories').where({ id }).first();
    if (!category) return res.status(404).json({ error: 'not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;