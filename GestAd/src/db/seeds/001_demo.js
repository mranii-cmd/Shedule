import bcrypt from 'bcryptjs';

export async function seed(knex) {
  console.log('🌱 Starting demo seed...');

  try {
    // Nettoyer les tables (dans l'ordre à cause des foreign keys)
    await knex('activity_logs').del().catch(() => {});
    await knex('events').del();
    await knex('documents').del();
    await knex('users').del();
    console.log('✅ Tables cleared');

    // Créer l'utilisateur admin
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    const adminHash = bcrypt.hashSync(adminPassword, 10);

    // Récupérer l'ID de l'utilisateur créé
    const [adminId] = await knex('users').insert([
      {
        username: 'admin',
        password: adminHash,
        email: 'admin@example.com',
        role: 'admin',
        first_name: 'Super',
        last_name: 'Admin',
        is_active: true
      }
    ]);
    
    console.log('✅ Admin user created with ID:', adminId);

    // Créer des documents avec l'ID réel de l'admin
    await knex('documents').insert([
      {
        title: 'Règlement intérieur',
        description: 'Règlement intérieur de l\'établissement',
        category: 'règlement',
        original_name: 'reglement.pdf',
        path: '/uploads/reglement.pdf',
        url: '/uploads/reglement.pdf',
        file_size: 1024,
        mime_type: 'application/pdf',
        created_by: adminId,
        uploaded_by: adminId
      },
      {
        title: 'Procès-verbal AG 2025',
        description: 'Compte-rendu de l\'assemblée générale 2025',
        category: 'procès-verbal',
        original_name: 'pv-ag-2025.pdf',
        path: '/uploads/pv-ag-2025.pdf',
        url: '/uploads/pv-ag-2025.pdf',
        file_size: 2048,
        mime_type: 'application/pdf',
        created_by: adminId,
        uploaded_by: adminId
      },
      {
        title: 'Attestation de scolarité',
        description: 'Modèle d\'attestation de scolarité',
        category: 'attestation',
        original_name: 'attestation.pdf',
        path: '/uploads/attestation.pdf',
        url: '/uploads/attestation.pdf',
        file_size: 512,
        mime_type: 'application/pdf',
        created_by: adminId,
        uploaded_by: adminId
      }
    ]);
    console.log('✅ Documents created');

    // Créer des événements
    await knex('events').insert([
      {
        title: 'Cours de Mathématiques',
        description: 'Premier cours du semestre',
        start_date: '2026-02-01',
        all_day: 0,
        created_by: adminId
      },
      {
        title: 'Réunion enseignants',
        description: 'Coordination pédagogique',
        start_date: '2026-02-03',
        all_day: 0,
        created_by: adminId
      },
      {
        title: 'Examen Final',
        description: 'Examen de fin d\'année',
        start_date: '2026-06-15',
        all_day: 1,
        created_by: adminId
      }
    ]);
    console.log('✅ Events created');

    console.log('🎉 Demo seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    throw error;
  }
}