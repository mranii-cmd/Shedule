export function up(knex) {
  return knex.schema.table('users', (table) => {
    // Informations personnelles
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('email', 255).unique();
    table.string('phone', 20);
    table.text('bio');
    
    // Avatar
    table.string('avatar_url', 500);
    
    // Statut
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_login');
    
    // Métadonnées
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export function down(knex) {
  return knex.schema.table('users', (table) => {
    table.dropColumn('first_name');
    table.dropColumn('last_name');
    table.dropColumn('email');
    table.dropColumn('phone');
    table.dropColumn('bio');
    table.dropColumn('avatar_url');
    table.dropColumn('is_active');
    table.dropColumn('last_login');
    table.dropColumn('updated_at');
  });
}