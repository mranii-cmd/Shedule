import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// knexfile résout maintenant les chemins à partir du dossier contenant ce fichier
export default {
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST || 'db',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'gestad',
    password: process.env.MYSQL_PASSWORD || 'gestadpwd',
    database: process.env.MYSQL_DATABASE || 'gestad',
    timezone: 'Z',
    dateStrings: true
  },
  migrations: {
    // migrations se trouvent dans le répertoire src/db/migrations, à côté de ce fichier
    directory: path.resolve(__dirname, 'migrations')
  },
  seeds: {
    directory: path.resolve(__dirname, 'seeds')
  },
  pool: { min: 0, max: 10 }
};