import getKnex from './knex.js';

const db = getKnex();

async function fix() {
  try {
    console.log('🔧 Vérification et ajout de created_by (MySQL)...');
    
    // Documents
    console.log('\n📄 Table documents:');
    const documentsInfo = await db.raw(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'documents'
    `);
    
    const docColumns = documentsInfo[0].map(row => row.COLUMN_NAME);
    console.log('Colonnes actuelles:', docColumns.join(', '));
    
    const hasCreatedBy = docColumns.includes('created_by');
    
    if (!hasCreatedBy) {
      console.log('➕ Ajout de created_by à documents...');
      await db.schema.table('documents', (table) => {
        table.integer('created_by').unsigned().nullable();
        table.foreign('created_by').references('users.id').onDelete('SET NULL');
      });
      console.log('✅ Colonne created_by ajoutée à documents');
    } else {
      console.log('✅ Colonne created_by existe déjà dans documents');
    }

    // Events
    console.log('\n📅 Table events:');
    const eventsInfo = await db.raw(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'events'
    `);
    
    const eventColumns = eventsInfo[0].map(row => row.COLUMN_NAME);
    console.log('Colonnes actuelles:', eventColumns.join(', '));
    
    const eventsHasCreatedBy = eventColumns.includes('created_by');
    
    if (!eventsHasCreatedBy) {
      console.log('➕ Ajout de created_by à events...');
      await db.schema.table('events', (table) => {
        table.integer('created_by').unsigned().nullable();
        table.foreign('created_by').references('users.id').onDelete('SET NULL');
      });
      console.log('✅ Colonne created_by ajoutée à events');
    } else {
      console.log('✅ Colonne created_by existe déjà dans events');
    }

    // Users
    console.log('\n👤 Table users:');
    const usersInfo = await db.raw(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users'
    `);
    
    const userColumns = usersInfo[0].map(row => row.COLUMN_NAME);
    console.log('Colonnes actuelles:', userColumns.join(', '));

    console.log('\n🎉 Terminé !');
    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    await db.destroy();
    process.exit(1);
  }
}

fix();