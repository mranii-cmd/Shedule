import getKnex from './knex.js';

const db = getKnex();

async function checkSchema() {
  console.log('📋 Schéma de la table documents:');
  const documentsInfo = await db.raw('PRAGMA table_info(documents)');
  console.table(documentsInfo);

  console.log('\n📋 Schéma de la table events:');
  const eventsInfo = await db.raw('PRAGMA table_info(events)');
  console.table(eventsInfo);

  console.log('\n📋 Schéma de la table users:');
  const usersInfo = await db.raw('PRAGMA table_info(users)');
  console.table(usersInfo);

  console.log('\n📋 Liste des migrations:');
  const migrations = await db('knex_migrations').select('*').orderBy('id', 'desc').limit(10);
  console.table(migrations);

  process.exit(0);
}

checkSchema().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});