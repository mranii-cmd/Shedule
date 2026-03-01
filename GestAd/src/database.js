import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const db = knex({
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST || 'db',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'gestad',
    password: process.env.MYSQL_PASSWORD || 'gestadpwd',
    database: process.env.MYSQL_DATABASE || 'gestad'
  },
  pool: {
    min: 2,
    max: 10
  }
});

export { db };
export default db;