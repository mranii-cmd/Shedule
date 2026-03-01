import { api } from '../utils/api.js';

/**
 * Charge la liste des événements depuis l'API
 */
async function loadEvents() {
  try {
    const response = await api.get('/events');
    
    // Gérer différents formats de réponse
    let events;
    if (response && typeof response === 'object') {
      if (Array.isArray(response)) {
        // Format: [...]
        events = response;
      } else if (Array.isArray(response.data)) {
        // Format: {data: [...], meta: {...}}
        events = response.data;
      } else if (Array.isArray(response.events)) {
        // Format: {events: [...]}
        events = response.events;
      } else {
        // Format inconnu, tableau vide
        events = [];
      }
    } else {
      events = [];
    }
    
    console.log('Events loaded:', events.length, 'events');
    renderEvents(events);
  } catch (error) {
    console.error('Failed to load events:', error);
    showError('Erreur lors du chargement des événements', error.message);
  }
}

/**
 * Affiche les événements dans le DOM
 */
function renderEvents(events) {
  const container = document.getElementById('events-list');
  
  if (!container) {
    console.error('Container #events-list not found');
    return;
  }
  
  // Vérifier que events est un tableau
  if (!Array.isArray(events)) {
    console.error('Events is not an array:', events);
    container.innerHTML = '<div class="error-message"><p>❌ Erreur: données invalides</p></div>';
    return;
  }
  
  // Si aucun événement
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>📅 Aucun événement pour le moment</p>
        <button class="btn btn-primary" onclick="window.showEventModal()">
          ➕ Créer un événement
        </button>
      </div>
    `;
    return;
  }
  
  // Afficher les événements
  container.innerHTML = events.map(event => createEventCard(event)).join('');
}

/**
 * Crée le HTML d'une carte événement
 */
function createEventCard(event) {
  // Combiner date et heure pour l'affichage
  const startDateTime = combineDateTime(event.start_date, event.start_time);
  const endDateTime = combineDateTime(event.end_date, event.end_time);
  
  return `
    <div class="event-card" data-id="${event.id}">
      <div class="event-header">
        <h3>${escapeHtml(event.title)}</h3>
        <span class="event-status status-${event.status || 'planned'}">
          ${event.status || 'planned'}
        </span>
      </div>
      
      ${event.description ? `
        <p class="event-description">${escapeHtml(event.description)}</p>
      ` : ''}
      
      <div class="event-meta">
        <span class="event-date">
          📅 ${formatDateTime(startDateTime)}
        </span>
        ${endDateTime ? `
          <span class="event-end-date">
            → ${formatDateTime(endDateTime)}
          </span>
        ` : ''}
        ${event.location ? `
          <span class="event-location">
            📍 ${escapeHtml(event.location)}
          </span>
        ` : ''}
      </div>
      
      <div class="event-actions">
        <button class="btn btn-sm btn-secondary" onclick="window.showEventModal(${event.id})">
          ✏️ Modifier
        </button>
        <button class="btn btn-sm btn-danger" onclick="window.deleteEvent(${event.id})">
          🗑️ Supprimer
        </button>
      </div>
    </div>
  `;
}

/**
 * Combine date et heure
 */
function combineDateTime(date, time) {
  if (!date) return null;
  if (!time) return date;
  return `${date}T${time}`;
}

/**
 * Formate une date/heure en français
 */
function formatDateTime(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    
    // Vérifier si l'heure est présente (pas à minuit)
    const hasTime = dateString.includes('T') && dateString.split('T')[1] !== '00:00:00';
    
    if (hasTime) {
      return date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
}

/**
 * Affiche un message d'erreur
 */
function showError(title, message) {
  const container = document.getElementById('events-list');
  if (container) {
    container.innerHTML = `
      <div class="error-message">
        <h3>❌ ${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <button class="btn btn-primary" onclick="window.location.reload()">
          🔄 Réessayer
        </button>
      </div>
    `;
  }
}

/**
 * Échappe les caractères HTML pour éviter les injections XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==============================================
// Fonctions globales (accessibles via window)
// ==============================================

/**
 * Supprime un événement
 */
window.deleteEvent = async function(id) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
    return;
  }
  
  try {
    await api.delete(`/events/${id}`);
    console.log('Event deleted:', id);
    
    // Recharger la liste
    loadEvents();
    
    alert('✅ Événement supprimé avec succès');
  } catch (error) {
    console.error('Failed to delete event:', error);
    alert('❌ Erreur lors de la suppression: ' + error.message);
  }
};

// Exposer loadEvents globalement
window.loadEvents = loadEvents;

// Exporter les fonctions principales
export { loadEvents, renderEvents };

console.log('✅ events.js loaded');