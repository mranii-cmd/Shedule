export async function up(knex) {
  console.log('🔧 Fixing events created_by...');
  
  const hasColumn = await knex.schema.hasColumn('events', 'created_by');
  
  if (!hasColumn) {
    await knex.schema.table('events', (table) => {
      table.integer('created_by').unsigned().nullable();
      table.foreign('created_by').references('users.id').onDelete('SET NULL');
    });
    console.log('✅ Events created_by added');
  } else {
    // Vérifier le type
    await knex.raw('ALTER TABLE events MODIFY COLUMN created_by int(10) unsigned NULL');
    console.log('✅ Events created_by type fixed');
  }
}

export async function down(knex) {
  return knex.schema.table('events', (table) => {
    table.dropForeign('created_by');
    table.dropColumn('created_by');
  });
}