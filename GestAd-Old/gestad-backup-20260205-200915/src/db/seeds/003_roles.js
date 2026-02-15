export async function seed(knex) {
  // Supprimer les rôles existants
  await knex('roles').del();
  
  // Insérer les rôles
  await knex('roles').insert([
    {
      name: 'admin',
      label: 'Administrateur',
      description: 'Accès complet à toutes les fonctionnalités',
      permissions: JSON.stringify({
        users: ['create', 'read', 'update', 'delete'],
        documents: ['create', 'read', 'update', 'delete'],
        events: ['create', 'read', 'update', 'delete'],
        settings: ['read', 'update']
      })
    },
    {
      name: 'editor',
      label: 'Éditeur',
      description: 'Peut créer et modifier les documents et événements',
      permissions: JSON.stringify({
        users: ['read'],
        documents: ['create', 'read', 'update'],
        events: ['create', 'read', 'update'],
        settings: ['read']
      })
    },
    {
      name: 'viewer',
      label: 'Lecteur',
      description: 'Peut uniquement consulter les documents et événements',
      permissions: JSON.stringify({
        users: ['read'],
        documents: ['read'],
        events: ['read'],
        settings: []
      })
    }
  ]);
  
  console.log('✅ Rôles créés');
}