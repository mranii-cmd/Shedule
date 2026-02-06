import express from 'express';
const router = express.Router();

/* GET /api/types */
router.get('/types', async (req, res) => {
  const knex = req.app.get('knex');
  try {
    const types = await knex('types').select('id', 'name', 'slug', 'description').orderBy('name');
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/documents/facets */
router.get('/documents/facets', async (req, res) => {
  const knex = req.app.get('knex');
  const { q, category, type, fromYear, toYear } = req.query;
  try {
    // base filtering builder: include created_at so we can compute YEAR(...)
    const base = knex('documents').select('documents.id', 'documents.created_at');

    if (q) {
      base.whereRaw('MATCH(documents.title, documents.original_name, documents.path) AGAINST(? IN BOOLEAN MODE)', [q + '*']);
    }

    if (category) {
      base.join('document_categories', 'documents.id', 'document_categories.document_id')
          .join('categories', 'document_categories.category_id', 'categories.id')
          .where('categories.slug', category);
    }

    if (type) {
      base.join('types', 'documents.type_id', 'types.id').where('types.slug', type);
    }

    if (fromYear) base.whereRaw('YEAR(documents.created_at) >= ?', [Number(fromYear)]);
    if (toYear) base.whereRaw('YEAR(documents.created_at) <= ?', [Number(toYear)]);

    // facets: by year (derive year from created_at)
    const yearsQuery = knex.from(base.clone().as('filtered'))
      .select(knex.raw('YEAR(filtered.created_at) as year'))
      .count('* as count')
      .groupByRaw('YEAR(filtered.created_at)')
      .orderBy('year', 'desc');

    // facets: by type
    const typesQuery = knex('documents')
      .join('types', 'documents.type_id', 'types.id')
      .modify((qb) => {
        if (q) qb.whereRaw('MATCH(documents.title, documents.original_name, documents.path) AGAINST(? IN BOOLEAN MODE)', [q + '*']);
        if (category) qb.join('document_categories', 'documents.id', 'document_categories.document_id')
                       .join('categories', 'document_categories.category_id', 'categories.id')
                       .where('categories.slug', category);
        if (fromYear) qb.whereRaw('YEAR(documents.created_at) >= ?', [Number(fromYear)]);
        if (toYear) qb.whereRaw('YEAR(documents.created_at) <= ?', [Number(toYear)]);
        if (type) qb.where('types.slug', type);
      })
      .select('types.slug as slug', 'types.name as name')
      .count('documents.id as count')
      .groupBy('types.id')
      .orderBy('count', 'desc');

    const [years, typesRes] = await Promise.all([yearsQuery, typesQuery]);
    res.json({ years: years.filter(y => y.year !== null), types: typesRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* GET /api/documents (extended: supports ?year= & ?type= & ?q=) */
router.get('/documents', async (req, res) => {
  const knex = req.app.get('knex');
  const { year, type, page = 1, per_page = 20, q } = req.query;
  try {
    const offset = (Number(page) - 1) * Number(per_page);
    let qBuilder = knex('documents').select('documents.*');

    if (type) {
      qBuilder = qBuilder.join('types', 'documents.type_id', 'types.id').where('types.slug', type);
    }

    if (year) {
      // filter by YEAR(created_at) since there's no documents.year column
      qBuilder = qBuilder.whereRaw('YEAR(documents.created_at) = ?', [Number(year)]);
    }

    if (q) {
      qBuilder = qBuilder.whereRaw('MATCH(documents.title, documents.original_name, documents.path) AGAINST(? IN BOOLEAN MODE)', [q + '*']);
    }

    const rows = await qBuilder.limit(Number(per_page)).offset(offset).orderBy('documents.created_at', 'desc');
    res.json({ data: rows, page: Number(page), per_page: Number(per_page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// PATCH /api/documents/:id — update type (by id or slug) and/or year
router.patch('/documents/:id', async (req, res) => {
  const knex = req.app.get('knex');
  const id = Number(req.params.id);
  const { type_id, type_slug, year } = req.body || {};

  try {
    const updates = {};
    if (typeof year !== 'undefined') {
      // allow clearing with null or empty string
      // now we store year into a dedicated column only if your schema has it;
      // if not, consider mapping year -> created_at or add a year column via migration.
      updates.year = (year === null || year === '' ) ? null : Number(year);
    }

    if (typeof type_id !== 'undefined' && type_id !== null && type_id !== '') {
      updates.type_id = Number(type_id);
    } else if (typeof type_slug !== 'undefined' && type_slug !== null) {
      if (type_slug === '') {
        // explicit clear
        updates.type_id = null;
      } else {
        const t = await knex('types').where({ slug: type_slug }).first();
        if (!t) return res.status(400).json({ error: 'unknown_type' });
        updates.type_id = t.id;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no_updates_provided' });
    }

    await knex('documents').where({ id }).update(updates);
    const doc = await knex('documents').where({ id }).first();
    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('PATCH /documents/:id error', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;