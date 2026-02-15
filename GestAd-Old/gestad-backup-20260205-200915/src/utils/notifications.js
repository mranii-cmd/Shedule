export async function createNotification(db, userId, type, title, message, link = null) {
  try {
    await db('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      link
    });
  } catch (error) {
    console.error('Erreur création notification:', error);
  }
}

export async function checkUpcomingEvents(db) {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    
    const events = await db('events')
      .whereBetween('start_date', [tomorrow.toISOString(), dayAfter.toISOString()])
      .where('status', '!=', 'cancelled');
    
    for (const event of events) {
      // Créer notification pour tous les utilisateurs
      const users = await db('users').select('id');
      
      for (const user of users) {
        await createNotification(
          db,
          user.id,
          'reminder',
          '📅 Événement demain',
          `${event.title} est prévu demain à ${event.start_time || '00:00'}`,
          'tab-agenda'
        );
      }
    }
  } catch (error) {
    console.error('Erreur vérification événements:', error);
  }
}