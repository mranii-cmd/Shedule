import getKnex from './knex.js';

const db = getKnex();

async function fix() {
  try {
    console.log('🔧 Vérification et ajout de created_by...');
    
    // Documents
    console.log('\n📄 Table documents:');
    const documentsInfo = await db.raw('PRAGMA table_info(documents)');
    console.log('Colonnes actuelles:', documentsInfo.map(c => c.name).join(', '));
    
    const hasCreatedBy = documentsInfo.some(col => col.name === 'created_by');
    
    if (!hasCreatedBy) {
      console.log('➕ Ajout de la colonne created_by...');
      await db.schema.table('documents', (table) => {
        table.integer('created_by').unsigned().nullable();
      });
      console.log('✅ Colonne created_by ajoutée à documents');
    } else {
      console.log('✅ Colonne created_by existe déjà dans documents');
    }

    // Events
    console.log('\n📅 Table events:');
    const eventsInfo = await db.raw('PRAGMA table_info(events)');
    console.log('Colonnes actuelles:', eventsInfo.map(c => c.name).join(', '));
    
    const eventsHasCreatedBy = eventsInfo.some(col => col.name === 'created_by');
    
    if (!eventsHasCreatedBy) {
      console.log('➕ Ajout de la colonne created_by...');
      await db.schema.table('events', (table) => {
        table.integer('created_by').unsigned().nullable();
      });
      console.log('✅ Colonne created_by ajoutée à events');
    } else {
      console.log('✅ Colonne created_by existe déjà dans events');
    }

    // Users
    console.log('\n👤 Table users:');
    const usersInfo = await db.raw('PRAGMA table_info(users)');
    console.log('Colonnes actuelles:', usersInfo.map(c => c.name).join(', '));

    console.log('\n🎉 Terminé !');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

fix();