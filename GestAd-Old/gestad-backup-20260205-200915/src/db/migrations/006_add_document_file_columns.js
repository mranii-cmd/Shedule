export async function up(knex) {
  const hasFilename = await knex.schema.hasColumn('documents', 'filename');
  if (!hasFilename) {
    await knex.schema.alterTable('documents', (t) => {
      t.string('filename', 512).nullable();
    });
    await knex('documents').whereNotNull('original_name').update({ filename: knex.raw('original_name') });
  }

  const hasMimetype = await knex.schema.hasColumn('documents', 'mimetype');
  if (!hasMimetype) {
    await knex.schema.alterTable('documents', (t) => {
      t.string('mimetype', 255).nullable();
    });
  }

  const hasSize = await knex.schema.hasColumn('documents', 'size');
  if (!hasSize) {
    await knex.schema.alterTable('documents', (t) => {
      t.bigInteger('size').nullable();
    });
  }
}

export async function down(knex) {
  const hasFilename = await knex.schema.hasColumn('documents', 'filename');
  if (hasFilename) {
    await knex.schema.alterTable('documents', (t) => t.dropColumn('filename'));
  }

  const hasMimetype = await knex.schema.hasColumn('documents', 'mimetype');
  if (hasMimetype) {
    await knex.schema.alterTable('documents', (t) => t.dropColumn('mimetype'));
  }

  const hasSize = await knex.schema.hasColumn('documents', 'size');
  if (hasSize) {
    await knex.schema.alterTable('documents', (t) => t.dropColumn('size'));
  }
}
