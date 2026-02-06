/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('documents');
  if (exists) {
    console.log('✅ Table documents existe déjà');
    return;
  }

  await knex.schema.createTable('documents', (table) => {
    table.increments('id').primary();
    table.string('title', 255).notNullable();
    table.text('description');
    table.string('category', 50).notNullable().index();
    table.string('original_name', 255).notNullable();
    table.string('path', 500).notNullable();
    table.string('url', 500);
    table.integer('file_size');
    table.string('mime_type', 100);
    table.integer('uploaded_by').unsigned();
    table.timestamps(true, true);
    
    table.index('created_at');
    table.index(['category', 'created_at']);
  });

  console.log('✅ Table documents créée avec succès');
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('documents');
  console.log('✅ Table documents supprimée');
}