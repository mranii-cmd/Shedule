export async function up(knex) {
  // rendre la migration idempotente : ne rien faire si la colonne existe déjà
  const has = await knex.schema.hasColumn('events', 'end_time');
  if (!has) {
    await knex.schema.alterTable('events', (table) => {
      table.time('end_time').nullable();
    });
    console.info('Migration applied: added events.end_time');
  } else {
    console.info('Migration skipped: column events.end_time already exists.');
  }
}

export async function down(knex) {
  // rollback sécurisé : supprimer seulement si la colonne existe
  const has = await knex.schema.hasColumn('events', 'end_time');
  if (has) {
    await knex.schema.alterTable('events', (table) => {
      table.dropColumn('end_time');
    });
    console.info('Rollback applied: dropped events.end_time');
  } else {
    console.info('Rollback skipped: column events.end_time does not exist.');
  }
}