export function up(knex) {
  return knex.schema.table('documents', (table) => {
    // Ajouter la colonne created_by si elle n'existe pas
    table.integer('created_by').unsigned();
    table.foreign('created_by').references('users.id').onDelete('SET NULL');
  }).catch(err => {
    console.log('⚠️  Column created_by may already exist:', err.message);
  });
}

export function down(knex) {
  return knex.schema.table('documents', (table) => {
    table.dropForeign('created_by');
    table.dropColumn('created_by');
  });
}