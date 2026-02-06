export async function up(knex) {
  // Vérifier si la colonne original_name existe
  const hasOriginalName = await knex.schema.hasColumn('documents', 'original_name');
  
  if (!hasOriginalName) {
    console.log('Adding original_name column...');
    await knex.schema.table('documents', (table) => {
      table.string('original_name', 500);
    });
  }
  
  // Vérifier si la colonne path existe
  const hasPath = await knex.schema.hasColumn('documents', 'path');
  
  if (!hasPath) {
    console.log('Adding path column...');
    await knex.schema.table('documents', (table) => {
      table.string('path', 500);
    });
  }
  
  // Ajouter l'index fulltext
  try {
    await knex.raw(`
      ALTER TABLE documents
      ADD FULLTEXT idx_documents_fulltext (title, original_name, path)
    `);
    console.log('✅ Fulltext index added');
  } catch (error) {
    if (error.code === 'ER_DUP_KEYNAME') {
      console.log('⚠️  Fulltext index already exists, skipping');
    } else {
      console.error('Error adding fulltext index:', error);
      throw error;
    }
  }
}

export async function down(knex) {
  // Supprimer l'index fulltext
  try {
    await knex.raw('ALTER TABLE documents DROP INDEX IF EXISTS idx_documents_fulltext');
  } catch (error) {
    console.error('Error dropping fulltext index:', error);
  }
  
  // Supprimer les colonnes ajoutées
  await knex.schema.table('documents', (table) => {
    table.dropColumn('original_name');
    table.dropColumn('path');
  });
}