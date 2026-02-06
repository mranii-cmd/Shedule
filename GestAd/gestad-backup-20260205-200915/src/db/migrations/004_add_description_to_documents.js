/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('documents', 'description');
  
  if (!hasColumn) {
    await knex.schema.table('documents', (table) => {
      table.text('description').after('title');
    });
    console.log('✅ Colonne description ajoutée à la table documents');
  } else {
    console.log('✅ Colonne description existe déjà');
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.table('documents', (table) => {
    table.dropColumn('description');
  });
  console.log('✅ Colonne description supprimée');
}