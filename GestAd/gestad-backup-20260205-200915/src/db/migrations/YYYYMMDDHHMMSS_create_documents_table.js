/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // Créer la table documents si elle n'existe pas
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
    table.string('url', 500); // Pour les liens externes
    table.integer('file_size');
    table.string('mime_type', 100);
    table.integer('uploaded_by');
    table.timestamps(true, true); // created_at, updated_at
    
    // Index pour améliorer les performances
    table.index('created_at');
    table.index('uploaded_by');
  });

  console.log('✅ Table documents créée');
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('documents');
  console.log('✅ Table documents supprimée');
}