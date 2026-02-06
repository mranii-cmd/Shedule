import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/gestad.db');
const migrationsPath = path.join(__dirname, '../database/migrations');

// Créer le dossier data s'il n'existe pas
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Erreur connexion base de données:', err.message);
  } else {
    console.log('✅ Connecté à la base de données SQLite');
  }
});

// Activer les clés étrangères
db.run('PRAGMA foreign_keys = ON');

// Fonction pour exécuter les migrations
async function runMigrations() {
  return new Promise((resolve, reject) => {
    // Créer la table de suivi des migrations
    db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('❌ Erreur création table migrations:', err);
        return reject(err);
      }

      // Lire tous les fichiers de migration
      if (!fs.existsSync(migrationsPath)) {
        console.log('⚠️  Pas de dossier migrations');
        return resolve();
      }

      const migrationFiles = fs.readdirSync(migrationsPath)
        .filter(f => f.endsWith('.sql'))
        .sort();

      console.log(`📁 ${migrationFiles.length} fichiers de migration trouvés`);

      // Vérifier quelles migrations ont déjà été exécutées
      db.all('SELECT name FROM migrations', [], (err, rows) => {
        if (err) {
          console.error('❌ Erreur lecture migrations:', err);
          return reject(err);
        }

        const executedMigrations = rows.map(r => r.name);
        const pendingMigrations = migrationFiles.filter(f => !executedMigrations.includes(f));

        if (pendingMigrations.length === 0) {
          console.log('✅ Toutes les migrations sont à jour');
          return resolve();
        }

        console.log(`🔄 ${pendingMigrations.length} migrations à exécuter`);

        // Exécuter les migrations pendantes
        let completed = 0;
        pendingMigrations.forEach((file, index) => {
          const filePath = path.join(migrationsPath, file);
          const sql = fs.readFileSync(filePath, 'utf8');

          db.exec(sql, (err) => {
            if (err) {
              console.error(`❌ Erreur migration ${file}:`, err);
              return reject(err);
            }

            // Enregistrer la migration
            db.run('INSERT INTO migrations (name) VALUES (?)', [file], (err) => {
              if (err) {
                console.error(`❌ Erreur enregistrement migration ${file}:`, err);
                return reject(err);
              }

              console.log(`✅ Migration ${file} exécutée`);
              completed++;

              if (completed === pendingMigrations.length) {
                console.log('✅ Toutes les migrations sont terminées');
                resolve();
              }
            });
          });
        });
      });
    });
  });
}

// ✅ Export ES6
export { db, runMigrations };
export default db;