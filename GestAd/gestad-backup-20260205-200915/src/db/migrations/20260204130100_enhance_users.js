export async function up(knex) {
  console.log('🔧 Enhancing users table...');
  
  const hasFirstName = await knex.schema.hasColumn('users', 'first_name');
  
  if (!hasFirstName) {
    await knex.schema.table('users', (table) => {
      table.string('first_name', 100).nullable();
      table.string('last_name', 100).nullable();
      table.string('phone', 20).nullable();
      table.text('bio').nullable();
      table.string('avatar_url', 500).nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_login').nullable();
    });
    console.log('✅ Users table enhanced');
  } else {
    console.log('⚠️  Users columns already exist');
  }
}

export async function down(knex) {
  return knex.schema.table('users', (table) => {
    table.dropColumn('first_name');
    table.dropColumn('last_name');
    table.dropColumn('phone');
    table.dropColumn('bio');
    table.dropColumn('avatar_url');
    table.dropColumn('is_active');
    table.dropColumn('last_login');
  });
}