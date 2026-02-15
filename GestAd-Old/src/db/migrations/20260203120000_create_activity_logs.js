export function up(knex) {
  return knex.schema.createTable('activity_logs', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('action', 100).notNullable();
    table.string('entity_type', 50);
    table.integer('entity_id');
    table.json('metadata');
    table.string('ip_address', 45);
    table.text('user_agent');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.index(['user_id', 'created_at']);
    table.index(['entity_type', 'entity_id']);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('activity_logs');
}