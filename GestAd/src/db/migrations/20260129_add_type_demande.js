// migration: add type slug 'demande' to table `types` if missing
export async function up(knex) {
  // check existing
  const exists = await knex('types').where({ slug: 'demande' }).first();
  if (exists) return;

  // build insert object based on available columns
  const insertObj = { slug: 'demande' };

  // prefer column 'label', fallback to 'name'
  const hasLabel = await knex.schema.hasColumn('types', 'label');
  const hasName = await knex.schema.hasColumn('types', 'name');
  if (hasLabel) insertObj.label = 'Demande';
  else if (hasName) insertObj.name = 'Demande';

  // set created_at if present
  const hasCreatedAt = await knex.schema.hasColumn('types', 'created_at');
  if (hasCreatedAt) insertObj.created_at = knex.fn.now();

  await knex('types').insert(insertObj);
}

export async function down(knex) {
  await knex('types').where({ slug: 'demande' }).del();
}