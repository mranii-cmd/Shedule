export async function up(knex) {
  // add role column to users (if not present)
  const hasRole = await knex.schema.hasColumn('users', 'role');
  if (!hasRole) {
    await knex.schema.alterTable('users', (t) => {
      t.string('role').notNullable().defaultTo('user');
    });
  }

  // add fulltext index for events on (title, description)
  // fulltext indexes require MyISAM or InnoDB (supported on modern MySQL)
  const hasIndex = await knex.raw("SHOW INDEX FROM `events` WHERE Key_name = 'events_fulltext'");
  // If query returns rows length 0, create index
  try {
    const rows = hasIndex[0] || hasIndex;
    if (!rows || rows.length === 0) {
      await knex.raw('ALTER TABLE events ADD FULLTEXT `events_fulltext` (title, description)');
    }
  } catch (e) {
    // ignore if already exists or engine doesn't support; keep things robust
    console.warn('could not create fulltext index:', e.message);
  }
}

export async function down(knex) {
  const hasRole = await knex.schema.hasColumn('users', 'role');
  if (hasRole) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('role');
    });
  }
  try {
    await knex.raw('ALTER TABLE events DROP INDEX events_fulltext');
  } catch (e) {
    // ignore
  }
}