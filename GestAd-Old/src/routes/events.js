import express from 'express';

const router = express.Router();

/**
 * Parse une date/heure ISO en objet {date, time}
 * Supporte : "2026-02-15T10:00:00" ou "2026-02-15T10:00:00.000Z"
 */
function parseDateTime(isoString) {
  if (!isoString) return { date: null, time: null };
  
  // Si c'est juste une date (YYYY-MM-DD)
  if (!isoString.includes('T')) {
    return { date: isoString, time: null };
  }
  
  // Regex pour parser ISO datetime : YYYY-MM-DDTHH:MM:SS
  const regex = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/;
  const match = isoString.match(regex);
  
  if (match) {
    return {
      date: match[1],  // 2026-02-15
      time: match[2]   // 10:00:00
    };
  }
  
  // Fallback : extraire manuellement
  const parts = isoString.split('T');
  if (parts.length === 2) {
    const datePart = parts[0];
    const timePart = parts[1].split('.')[0].split('Z')[0]; // Enlever les millisecondes et Z
    return { date: datePart, time: timePart };
  }
  
  return { date: null, time: null };
}

// GET /api/events - Liste tous les événements
router.get('/', async (req, res, next) => {
  try {
    const knex = req.app.get('knex');
    
    const events = await knex('events')
      .select('*')
      .orderBy('start_date', 'desc')
      .orderBy('start_time', 'desc');
    
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    next(error);
  }
});

// GET /api/events/:id - Obtenir un événement spécifique
router.get('/:id', async (req, res, next) => {
  try {
    const knex = req.app.get('knex');
    const { id } = req.params;
    
    const event = await knex('events')
      .where({ id })
      .first();
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    next(error);
  }
});

// POST /api/events - Créer un événement
router.post('/', async (req, res, next) => {
  try {
    const knex = req.app.get('knex');
    const { 
      title, 
      description, 
      start_date, 
      start_time,
      end_date,
      end_time,
      location,
      status,
      all_day,
      created_by 
    } = req.body;
    
    // Validation
    if (!title || !start_date) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Title and start_date are required' 
      });
    }
    
    // Parser les dates/heures
    const startParsed = parseDateTime(start_date);
    const endParsed = parseDateTime(end_date);
    
    // Log pour debug
    console.log('Input start_date:', start_date);
    console.log('Parsed start:', startParsed);
    console.log('Input end_date:', end_date);
    console.log('Parsed end:', endParsed);
    
    // Préparer les données
    const eventData = {
      title,
      description: description || null,
      start_date: startParsed.date,
      start_time: start_time || startParsed.time,
      end_date: endParsed.date,
      end_time: end_time || endParsed.time,
      location: location || null,
      status: status || 'planned',
      all_day: all_day ? 1 : 0,
      created_by: created_by || null
    };
    
    console.log('Event data to insert:', eventData);
    
    const [id] = await knex('events').insert(eventData);
    const event = await knex('events').where({ id }).first();
    
    res.status(201).json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    next(error);
  }
});

// PUT /api/events/:id - Mettre à jour un événement
router.put('/:id', async (req, res, next) => {
  try {
    const knex = req.app.get('knex');
    const { id } = req.params;
    const { 
      title, 
      description, 
      start_date,
      start_time,
      end_date,
      end_time,
      location,
      status,
      all_day 
    } = req.body;
    
    // Parser les dates/heures
    const startParsed = parseDateTime(start_date);
    const endParsed = parseDateTime(end_date);
    
    const updateData = {
      title,
      description,
      start_date: startParsed.date || start_date,
      start_time: start_time || startParsed.time,
      end_date: endParsed.date || end_date,
      end_time: end_time || endParsed.time,
      location,
      status,
      all_day: all_day ? 1 : 0,
      updated_at: knex.fn.now()
    };
    
    const updated = await knex('events')
      .where({ id })
      .update(updateData);
    
    if (!updated) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const event = await knex('events').where({ id }).first();
    res.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    next(error);
  }
});

// DELETE /api/events/:id - Supprimer un événement
router.delete('/:id', async (req, res, next) => {
  try {
    const knex = req.app.get('knex');
    const { id } = req.params;
    
    const deleted = await knex('events')
      .where({ id })
      .delete();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting event:', error);
    next(error);
  }
});

export default router;