export async function up(knex) {
  console.log('🔧 Fixing documents foreign keys...');
  
  // Supprimer les contraintes existantes
  await knex.raw('ALTER TABLE documents DROP FOREIGN KEY IF EXISTS documents_created_by_foreign').catch(() => {});
  await knex.raw('ALTER TABLE documents DROP FOREIGN KEY IF EXISTS documents_uploaded_by_foreign').catch(() => {});
  
  // Modifier les types pour correspondre à users.id (unsigned)
  await knex.raw('ALTER TABLE documents MODIFY COLUMN created_by int(10) unsigned NULL');
  await knex.raw('ALTER TABLE documents MODIFY COLUMN uploaded_by int(10) unsigned NULL');
  
  // Recréer les contraintes
  await knex.raw('ALTER TABLE documents ADD CONSTRAINT documents_created_by_foreign FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL');
  await knex.raw('ALTER TABLE documents ADD CONSTRAINT documents_uploaded_by_foreign FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL');
  
  console.log('✅ Documents foreign keys fixed');
}

export async function down(knex) {
  await knex.raw('ALTER TABLE documents DROP FOREIGN KEY IF EXISTS documents_created_by_foreign');
  await knex.raw('ALTER TABLE documents DROP FOREIGN KEY IF EXISTS documents_uploaded_by_foreign');
}