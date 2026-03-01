export async function seed(knex) {
  const types = [
    { name: 'Contrat', slug: 'contrat', description: 'Contrats et accords' },
    { name: 'Facture', slug: 'facture', description: 'Factures et reçus' },
    { name: 'Rapport', slug: 'rapport', description: 'Rapports internes' },
    { name: 'Courrier', slug: 'courrier', description: 'Courriers, notes et messages' },
    { name: 'Autre', slug: 'autre', description: 'Autres documents' },
  ];

  for (const t of types) {
    const exists = await knex('types').where('slug', t.slug).first();
    if (!exists) {
      await knex('types').insert(t);
    }
  }
}