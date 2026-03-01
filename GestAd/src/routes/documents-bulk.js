import express from 'express';
import getKnex from '../db/knex.js';

const router = express.Router();
// POST /api/documents/bulk
// Body: { operations: [ { id: <int>, type_id?, type_slug?, year? }, ... ] }
// Returns: { updated: n, errors: [ { id, error } ] }
router.post('/bulk', async (req, res) => {
  const knex = getKnex();
  const ops = Array.isArray(req.body && req.body.operations) ? req.body.operations : (Array.isArray(req.body) ? req.body : []);
  if (!ops || ops.length === 0) return res.status(400).json({ error: 'no_operations' });

  const errors = [];
  let updatedCount = 0;

  try {
    await knex.transaction(async (trx) => {
      for (const op of ops) {
        try {
          const id = op.id || op.document_id;
          if (!id) {
            errors.push({ id: null, error: 'missing_id', payload: op });
            continue;
          }

          const updates = {};
          if (typeof op.year !== 'undefined') {
            updates.year = op.year === '' || op.year === null ? null : Number(op.year);
          }

          if (typeof op.type_id !== 'undefined' && op.type_id !== null && op.type_id !== '') {
            updates.type_id = Number(op.type_id);
          } else if (typeof op.type_slug !== 'undefined' && op.type_slug !== null) {
            if (op.type_slug === '') {
              updates.type_id = null;
            } else {
              const t = await trx('types').where({ slug: String(op.type_slug) }).first();
              if (!t) throw new Error('unknown_type_slug:' + op.type_slug);
              updates.type_id = t.id;
            }
          }

          // support other fields optionally (title, category handling omitted here)
          if (Object.keys(updates).length === 0) {
            errors.push({ id, error: 'no_updates_provided' });
            continue;
          }

          const cnt = await trx('documents').where({ id }).update(updates);
          if (!cnt) {
            errors.push({ id, error: 'not_found' });
            continue;
          }
          updatedCount += 1;
        } catch (e) {
          console.error('bulk op error', e && e.message ? e.message : e);
          errors.push({ id: (op && (op.id || op.document_id)) || null, error: e && e.message ? e.message : String(e) });
        }
      }
    });
    return res.json({ ok: true, updated: updatedCount, errors });
  } catch (err) {
    console.error('bulk transaction failed', err);
    return res.status(500).json({ error: 'bulk_failed', message: err && err.message ? err.message : String(err) });
  }
});

export default router;