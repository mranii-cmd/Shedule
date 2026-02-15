// helper to create a singleton Knex instance (ESM)
import Knex from 'knex';
import knexConfig from './knexfile.js';

let instance = null;

export default function getKnex() {
  if (!instance) {
    const cfg = typeof knexConfig === 'function' ? knexConfig() : knexConfig;
    instance = Knex(cfg);
  }
  return instance;
}