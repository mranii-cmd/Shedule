export async function up(knex) {
  const hasTypes = await knex.schema.hasTable('types');
  if (!hasTypes) {
    await knex.schema.createTable('types', (t) => {
      t.increments('id').primary();
      t.string('name', 150).notNullable().unique();
      t.string('slug', 150).notNullable().unique();
      t.text('description').nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  const hasTypeId = await knex.schema.hasColumn('documents', 'type_id');
  if (!hasTypeId) {
    await knex.schema.alterTable('documents', (t) => {
      t.integer('type_id').unsigned().nullable().references('id').inTable('types').onDelete('SET NULL');
    });
  }

  const hasYear = await knex.schema.hasColumn('documents', 'year');
  if (!hasYear) {
    await knex.schema.alterTable('documents', (t) => {
      t.integer('year').nullable();
    });
  }
}

export async function down(knex) {
  const hasYear = await knex.schema.hasColumn('documents', 'year');
  if (hasYear) {
    await knex.schema.alterTable('documents', (t) => t.dropColumn('year'));
  }

  const hasTypeId = await knex.schema.hasColumn('documents', 'type_id');
  if (hasTypeId) {
    await knex.schema.alterTable('documents', (t) => t.dropColumn('type_id'));
  }

  const hasTypes = await knex.schema.hasTable('types');
  if (hasTypes) {
    await knex.schema.dropTable('types');
  }
}
