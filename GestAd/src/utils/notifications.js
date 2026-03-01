// src/utils/notifications.js
// Helpers pour créer et insérer des notifications de manière sûre.
// - Assure que les nouvelles notifications sont créées non-lues (read = 0) par défaut.
// - Filtre dynamiquement les colonnes présentes dans la table pour éviter
//   les erreurs "Unknown column" sur différents schémas (MySQL/MariaDB/Postgres).
// - Gère returning() (Postgres) et fallback pour MySQL/MariaDB.

export async function createNotification(db, userId, type, title, message = null, link = null, opts = {}) {
  const { eventId = null, data = null, read = false } = opts;

  const payload = {
    event_id: eventId,
    user_id: userId,
    type,
    title,
    message: message ?? null,
    data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null,
    link: link ?? null,
    // Par défaut : non lu
    //read: read ? 1 : 0,
    read: (typeof read !== 'undefined') ? (read ? 1 : 0) : 0,
    // read_at peut ne pas exister sur certains schémas ; sera filtré si absent
    read_at: null,
    created_at: db.fn.now(),
    updated_at: db.fn.now()
  };

  // Filtrer pour garder uniquement les colonnes réellement présentes dans la table
  const colsInfo = await db('notifications').columnInfo();
  const filtered = {};
  for (const [k, v] of Object.entries(payload)) {
    if (Object.prototype.hasOwnProperty.call(colsInfo, k)) filtered[k] = v;
  }

  // Tentative Postgres avec returning(), fallback pour MySQL/MariaDB
  try {
    const inserted = await db('notifications').insert(filtered).returning('*');
    // returning peut renvoyer un tableau de lignes (PG)
    if (Array.isArray(inserted)) return inserted[0];
    return inserted;
  } catch (err) {
    // Fallback : insert puis select de la ligne par id ou par best-effort
    const res = await db('notifications').insert(filtered);
    // Knex/MySQL peut renvoyer [insertId] ou le insertId directement selon la config
    let insertId = null;
    if (Array.isArray(res) && res.length > 0) insertId = res[0];
    else if (typeof res === 'number') insertId = res;

    if (insertId) {
      const row = await db('notifications').where({ id: insertId }).first();
      if (row) return row;
    }

    // Si on n'a pas d'insertId, essaye de récupérer la ligne la plus récente correspondant à user/title
    const row = await db('notifications')
      .where({ user_id: userId, title })
      .orderBy('created_at', 'desc')
      .first();

    return row;
  }
}

/**
 * Batch insert notifications.
 * rowsInput: Array of arrays (legacy) or array of objects.
 * If arrays: expected order [event_id, user_id, type, title, message, data, link]
 * chunkSize: taille des paquets d'insertion pour éviter des requêtes trop grosses.
 */
export async function batchInsertNotifications(db, rowsInput = [], chunkSize = 500) {
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) return { inserted: 0 };

  // Normaliser en objets complets
  const normalized = rowsInput.map(r => {
    if (Array.isArray(r)) {
      const [event_id = null, user_id, type, title, message = null, data = null, link = null] = r;
      return {
        event_id,
        user_id,
        type,
        title,
        message,
        data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null,
        link,
        read: 0,
        read_at: null,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      };
    } else {
      return {
        event_id: r.event_id ?? null,
        user_id: r.user_id,
        type: r.type,
        title: r.title,
        message: r.message ?? null,
        data: r.data ? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)) : null,
        link: r.link ?? null,
        read: (typeof r.read !== 'undefined') ? (r.read ? 1 : 0) : 0,
        read_at: r.read_at ?? null,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      };
    }
  });

  // Filtrer selon colonnes existantes (une seule récupération de columnInfo)
  const colsInfo = await db('notifications').columnInfo();
  const allowedKeys = new Set(Object.keys(colsInfo));
  const filterObj = obj => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (allowedKeys.has(k)) out[k] = v;
    }
    return out;
  };

  let inserted = 0;
  await db.transaction(async trx => {
    for (let i = 0; i < normalized.length; i += chunkSize) {
      const chunk = normalized.slice(i, i + chunkSize).map(filterObj);
      await trx('notifications').insert(chunk);
      inserted += chunk.length;
    }
  });

  return { inserted };
}