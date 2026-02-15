export async function up(knex) {
  console.log('🔧 Creating roles table...');
  
  const hasTable = await knex.schema.hasTable('roles');
  
  if (!hasTable) {
    await knex.schema.createTable('roles', (table) => {
      table.increments('id').primary();
      table.string('name', 50).notNullable().unique();
      table.string('label', 100).notNullable();
      table.text('description').nullable();
      table.json('permissions').nullable();
      table.timestamps(true, true);
    });
    console.log('✅ Roles table created');
  } else {
    console.log('⚠️  Roles table already exists');
  }
}

export async function down(knex) {
  return knex.schema.dropTableIfExists('roles');
}