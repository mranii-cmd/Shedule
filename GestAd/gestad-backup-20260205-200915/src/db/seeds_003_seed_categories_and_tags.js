export async function seed(knex) {
  // Insert categories if missing
  const categories = [
    { name: 'Législation', slug: 'legislation', description: 'Textes officiels et lois' },
    { name: 'Procédures Internes', slug: 'procedures-internes', description: 'Guides et processus internes' },
    { name: 'Communiqués', slug: 'communiques', description: 'Annonces et communiqués' }
  ];

  for (const cat of categories) {
    const exists = await knex('categories').where('slug', cat.slug).first();
    if (!exists) {
      await knex('categories').insert(cat);
    }
  }

  // Insert tags if missing
  const tags = ['facture', 'contrat', 'confidentiel', 'RH', 'finances'];
  for (const name of tags) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const exists = await knex('tags').where('slug', slug).first();
    if (!exists) {
      await knex('tags').insert({ name, slug });
    }
  }

  // Example association: attach 'Législation' and tag 'facture' to any document named test-file.txt
  const doc = await knex('documents').where('filename', 'test-file.txt').first();
  const legislation = await knex('categories').where('slug', 'legislation').first();
  const factureTag = await knex('tags').where('slug', 'facture').first();

  if (doc && legislation) {
    const exists = await knex('document_categories')
      .where({ document_id: doc.id, category_id: legislation.id })
      .first();
    if (!exists) {
      await knex('document_categories').insert({ document_id: doc.id, category_id: legislation.id });
    }
  }

  if (doc && factureTag) {
    const exists = await knex('document_tags').where({ document_id: doc.id, tag_id: factureTag.id }).first();
    if (!exists) {
      await knex('document_tags').insert({ document_id: doc.id, tag_id: factureTag.id });
    }
  }
}