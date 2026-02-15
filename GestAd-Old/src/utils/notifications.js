// utils/notifications.js
// - createNotification(db, ...) : idempotent si eventId fourni
// - batchInsertNotifications(db, rows, batchSize)
// - checkUpcomingEvents(db) uses batchInsertNotifications
export async function createNotification(db, userId, type, title, message, link = null, opts = {}) {
  const { eventId = null, data = null } = opts || {};

  try {
    if (eventId) {
      const sql = `
        INSERT INTO notifications (event_id, user_id, type, title, message, data, link, \`read\`, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
        ON DUPLICATE KEY UPDATE updated_at = NOW()
      `;
      const bindings = [
        eventId,
        userId,
        type,
        title,
        message,
        data ? JSON.stringify(data) : null,
        link
      ];
      await db.raw(sql, bindings);

      const rows = await db('notifications').where({ event_id: eventId, user_id: userId }).limit(1);
      return rows[0] || null;
    } else {
      const insertPayload = {
        user_id: userId,
        type,
        title,
        message,
        link,
        data: data ? JSON.stringify(data) : null,
        read: 0
      };
      const insertResult = await db('notifications').insert(insertPayload);
      const insertId = Array.isArray(insertResult) ? insertResult[0] : insertResult;
      const rows = await db('notifications').where({ id: insertId }).limit(1);
      return rows[0] || null;
    }
  } catch (error) {
    console.error('Erreur création notification:', error);
    return null;
  }
}

/**
 * Batch insert helper using multi-row INSERT ... ON DUPLICATE KEY UPDATE
 * rows: array of arrays matching columns: [event_id, user_id, type, title, message, dataJson, link]
 */
export async function batchInsertNotifications(db, rows, batchSize = 500) {
  if (!rows || rows.length === 0) return { inserted: 0 };

  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())').join(', ');
    const sql = `
      INSERT INTO notifications (event_id, user_id, type, title, message, data, link, \`read\`, created_at, updated_at)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE updated_at = NOW()
    `;
    const bindings = [];
    for (const r of chunk) {
      bindings.push(
        r[0] ?? null,
        r[1],
        r[2],
        r[3],
        r[4] ?? null,
        r[5] ?? null,
        r[6] ?? null
      );
    }
    try {
      await db.raw(sql, bindings);
      total += chunk.length;
    } catch (err) {
      console.error('batchInsertNotifications error on chunk', i, err);
    }
  }
  return { inserted: total };
}

export async function checkUpcomingEvents(db) {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const events = await db('events')
      .whereBetween('start_date', [tomorrow.toISOString(), dayAfter.toISOString()])
      .where('status', '!=', 'cancelled');

    if (!events || events.length === 0) return;

    const users = await db('users').select('id');
    if (!users || users.length === 0) return;

    for (const event of events) {
      const baseEventId = `event:${event.id}:reminder`;

      const rows = users.map((u) => {
        const eventIdForUser = baseEventId;
        const title = '📅 Événement demain';
        const message = `${event.title} est prévu demain à ${event.start_time || '00:00'}`;
        const data = { eventId: event.id, start_time: event.start_time || null };
        return [
          eventIdForUser,
          u.id,
          'reminder',
          title,
          message,
          JSON.stringify(data),
          'tab-agenda'
        ];
      });

      const res = await batchInsertNotifications(db, rows, 500);
      console.log(`Notifications for event ${event.id}: attempted ${res.inserted}`);
    }
  } catch (error) {
    console.error('Erreur vérification événements:', error);
  }
}