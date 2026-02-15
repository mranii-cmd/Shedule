import knex from 'knex';
import knexConfig from './knexfile.js';
import dotenv from 'dotenv';
dotenv.config();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDb(db, retries = 15, interval = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.raw('SELECT 1');
      console.log('Database reachable (SELECT 1 succeeded).');
      return true;
    } catch (err) {
      console.log(`DB not ready (${i + 1}/${retries}): ${err.message}`);
      await delay(interval);
    }
  }
  return false;
}

(async () => {
  const db = knex(knexConfig);
  try {
    console.log('Migrations directory resolved to:', knexConfig.migrations.directory);
    const ok = await waitForDb(db, 20, 2000);
    if (!ok) {
      console.error('Database not reachable after retries. Exiting.');
      process.exit(1);
    }

    console.log('Running migrations...');
    await db.migrate.latest();
    console.log('Migrations finished.');

    // Optionally run seeds in development or when --seed passed
    const seedFlag = process.argv.includes('--seed') || process.env.NODE_ENV === 'development';
    if (seedFlag) {
      try {
        console.log('Running seeds...');
        await db.seed.run();
        console.log('Seeds finished.');
      } catch (e) {
        console.warn('Seed error', e.message);
      }
    }
  } catch (err) {
    console.error('Migration error', err);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();