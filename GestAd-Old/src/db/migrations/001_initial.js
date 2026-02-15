export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username').notNullable().unique();
    t.string('password').notNullable();
    t.string('email').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('events', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.text('description').nullable();
    t.date('start_date').notNullable();
    t.time('start_time').nullable();
    t.date('end_date').nullable();
    t.time('end_time').nullable();
    t.integer('created_by').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('documents', (t) => {
    t.increments('id').primary();
    t.string('title').notNullable();
    t.string('filename').notNullable();
    t.string('mimetype').nullable();
    t.integer('size').nullable();
    t.string('category').nullable();
    t.integer('created_by').nullable();
    t.text('metadata').nullable();
    t.timestamps(true, true);
  });

  // knex_migrations table is created automatically by knex when running migrations
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('documents');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('users');
}