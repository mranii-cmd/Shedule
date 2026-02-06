// Migration : create table `resources`
// Ajuste les types/colonnes si ton schéma diffère.
export async function up(knex) {
  const exists = await knex.schema.hasTable('resources');
  if (exists) return;

  await knex.schema.createTable('resources', (t) => {
    t.increments('id').primary();
    t.string('slug').unique().nullable(); // facultatif, si tu veux référence unique
    t.string('original_name').notNullable();
    t.string('stored_name').notNullable(); // nom sur disque
    t.string('url').notNullable(); // chemin public (ex: /uploads/resources/<stored_name>)
    t.string('mime').nullable();
    t.integer('size').nullable();
    t.string('title').nullable();
    t.text('description').nullable();
    t.integer('user_id').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  const exists = await knex.schema.hasTable('resources');
  if (exists) {
    await knex.schema.dropTable('resources');
  }
}