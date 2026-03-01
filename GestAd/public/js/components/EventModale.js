import { api } from '../utils/api.js';

/**
 * Affiche la modal de création/édition d'événement
 */
export function showEventModal(eventId = null) {
  const isEdit = eventId !== null;
  const title = isEdit ? 'Modifier l\'événement' : 'Nouvel événement';
  
  // Créer la modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      
      <form id="event-form" class="modal-body">
        <div class="form-group">
          <label for="event-title">Titre *</label>
          <input type="text" id="event-title" name="title" required placeholder="Ex: Réunion d'équipe">
        </div>
        
        <div class="form-group">
          <label for="event-description">Description</label>
          <textarea id="event-description" name="description" rows="3" placeholder="Description de l'événement..."></textarea>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="event-start-date">Date de début *</label>
            <input type="date" id="event-start-date" name="start_date" required>
          </div>
          
          <div class="form-group">
            <label for="event-start-time">Heure de début</label>
            <input type="time" id="event-start-time" name="start_time">
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label for="event-end-date">Date de fin</label>
            <input type="date" id="event-end-date" name="end_date">
          </div>
          
          <div class="form-group">
            <label for="event-end-time">Heure de fin</label>
            <input type="time" id="event-end-time" name="end_time">
          </div>
        </div>
        
        <div class="form-group">
          <label for="event-location">Lieu</label>
          <input type="text" id="event-location" name="location" placeholder="Ex: Salle de réunion A">
        </div>
        
        <div class="form-group">
          <label for="event-status">Statut</label>
          <select id="event-status" name="status">
            <option value="planned">Planifié</option>
            <option value="ongoing">En cours</option>
            <option value="completed">Terminé</option>
            <option value="cancelled">Annulé</option>
          </select>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" id="event-all-day" name="all_day">
            Toute la journée
          </label>
        </div>
        
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Annuler
          </button>
          <button type="submit" class="btn btn-primary">
            ${isEdit ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  `;
  
  // Ajouter au DOM
  document.body.appendChild(modal);
  
  // Si édition, charger les données
  if (isEdit) {
    loadEventData(eventId);
  } else {
    // Pré-remplir la date du jour
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-start-date').value = today;
  }
  
  // Gérer la soumission du formulaire
  document.getElementById('event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveEvent(eventId);
  });
  
  // Fermer en cliquant sur l'overlay
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Charge les données d'un événement pour l'édition
 */
async function loadEventData(eventId) {
  try {
    const event = await api.get(`/events/${eventId}`);
    
    document.getElementById('event-title').value = event.title || '';
    document.getElementById('event-description').value = event.description || '';
    document.getElementById('event-start-date').value = event.start_date || '';
    document.getElementById('event-start-time').value = event.start_time || '';
    document.getElementById('event-end-date').value = event.end_date || '';
    document.getElementById('event-end-time').value = event.end_time || '';
    document.getElementById('event-location').value = event.location || '';
    document.getElementById('event-status').value = event.status || 'planned';
    document.getElementById('event-all-day').checked = event.all_day === 1;
    
  } catch (error) {
    console.error('Failed to load event:', error);
    alert('Erreur lors du chargement de l\'événement');
  }
}

/**
 * Sauvegarde l'événement (création ou modification)
 */
async function saveEvent(eventId) {
  const formData = {
    title: document.getElementById('event-title').value,
    description: document.getElementById('event-description').value,
    start_date: combineDateTime(
      document.getElementById('event-start-date').value,
      document.getElementById('event-start-time').value
    ),
    end_date: combineDateTime(
      document.getElementById('event-end-date').value,
      document.getElementById('event-end-time').value
    ),
    location: document.getElementById('event-location').value,
    status: document.getElementById('event-status').value,
    all_day: document.getElementById('event-all-day').checked ? 1 : 0,
  };
  
  console.log('Saving event:', formData);
  
  try {
    if (eventId) {
      // Modifier
      await api.put(`/events/${eventId}`, formData);
      console.log('Event updated:', eventId);
    } else {
      // Créer
      await api.post('/events', formData);
      console.log('Event created');
    }
    
    // Fermer la modal
    document.querySelector('.modal-overlay').remove();
    
    // Recharger la liste via la fonction globale
    if (typeof window.loadEvents === 'function') {
      window.loadEvents();
    } else {
      location.reload();
    }
    
  } catch (error) {
    console.error('Failed to save event:', error);
    alert('Erreur lors de la sauvegarde : ' + error.message);
  }
}

/**
 * Combine date et heure en format ISO
 */
function combineDateTime(date, time) {
  if (!date) return null;
  if (!time) return date;
  return `${date}T${time}:00`;
}

// Export global
window.showEventModal = showEventModal;

console.log('✅ EventModal loaded');