export async function up(knex) {
  const hasAllDay = await knex.schema.hasColumn('events', 'all_day');
  if (!hasAllDay) {
    await knex.schema.alterTable('events', (t) => {
      t.boolean('all_day').notNullable().defaultTo(false);
    });
  }

  const hasCreatedBy = await knex.schema.hasColumn('events', 'created_by');
  if (!hasCreatedBy) {
    await knex.schema.alterTable('events', (t) => {
      t.integer('created_by').nullable();
    });
  }

  const hasUpdatedAt = await knex.schema.hasColumn('events', 'updated_at');
  if (!hasUpdatedAt) {
    await knex.schema.alterTable('events', (t) => {
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex) {
  const hasAllDay = await knex.schema.hasColumn('events', 'all_day');
  if (hasAllDay) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('all_day'));
  }

  const hasCreatedBy = await knex.schema.hasColumn('events', 'created_by');
  if (hasCreatedBy) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('created_by'));
  }

  const hasUpdatedAt = await knex.schema.hasColumn('events', 'updated_at');
  if (hasUpdatedAt) {
    await knex.schema.alterTable('events', (t) => t.dropColumn('updated_at'));
  }
}
