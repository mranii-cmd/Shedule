export async function up(knex) {
  console.log('🔧 Creating activity_logs table...');
  
  const hasTable = await knex.schema.hasTable('activity_logs');
  
  if (!hasTable) {
    await knex.schema.createTable('activity_logs', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('action', 100).notNullable();
      table.string('entity_type', 50).nullable();
      table.integer('entity_id').nullable();
      table.json('metadata').nullable();
      table.string('ip_address', 45).nullable();
      table.text('user_agent').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.foreign('user_id').references('users.id').onDelete('CASCADE');
      table.index(['user_id', 'created_at']);
      table.index(['entity_type', 'entity_id']);
    });
    console.log('✅ Activity logs table created');
  } else {
    console.log('⚠️  Activity logs table already exists');
  }
}

export async function down(knex) {
  return knex.schema.dropTableIfExists('activity_logs');
}