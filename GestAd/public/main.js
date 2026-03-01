import { api } from './utils/api.js';
import { loadEvents, renderEvents } from './modules/events.js';

console.log('✅ main.js loaded');

// ==============================================
// 1. MODAL CRÉATION/ÉDITION ÉVÉNEMENT
// ==============================================

/**
 * Affiche la modal de création/édition d'événement
 */
window.showEventModal = function(eventId = null) {
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
    loadEventDataForEdit(eventId);
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
  
  // Fermer avec ESC
  const closeOnEsc = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', closeOnEsc);
    }
  };
  document.addEventListener('keydown', closeOnEsc);
};

/**
 * Charge les données d'un événement pour l'édition
 */
async function loadEventDataForEdit(eventId) {
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
      const newEvent = await api.post('/events', formData);
      console.log('Event created:', newEvent);
    }
    
    // Fermer la modal
    document.querySelector('.modal-overlay').remove();
    
    // Recharger la liste
    if (typeof window.loadEvents === 'function') {
      window.loadEvents();
    }
    
    // Message de succès
    showToast(eventId ? '✅ Événement modifié' : '✅ Événement créé', 'success');
    
  } catch (error) {
    console.error('Failed to save event:', error);
    showToast('❌ Erreur : ' + error.message, 'error');
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

// ==============================================
// 2. GESTION DES ONGLETS
// ==============================================

function initTabs() {
  const tabButtons = document.querySelectorAll('[role="tab"]');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Désactiver tous les onglets
      tabButtons.forEach(btn => {
        btn.setAttribute('aria-selected', 'false');
        btn.classList.remove('active');
      });
      
      // Cacher tous les panneaux
      document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
        panel.hidden = true;
      });
      
      // Activer l'onglet cliqué
      button.setAttribute('aria-selected', 'true');
      button.classList.add('active');
      
      // Afficher le panneau correspondant
      const panelId = button.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.hidden = false;
      }
    });
  });
}

// ==============================================
// 3. BARRE DE RECHERCHE
// ==============================================

function initSearch() {
  const searchInput = document.getElementById('search-events');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const eventCards = document.querySelectorAll('.event-card');
    
    eventCards.forEach(card => {
      const title = card.querySelector('h3').textContent.toLowerCase();
      const description = card.querySelector('.event-description')?.textContent.toLowerCase() || '';
      const location = card.querySelector('.event-location')?.textContent.toLowerCase() || '';
      
      const matches = title.includes(query) || description.includes(query) || location.includes(query);
      
      card.style.display = matches ? '' : 'none';
    });
  });
}

// ==============================================
// 4. TOAST NOTIFICATIONS
// ==============================================

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Export global
window.showToast = showToast;

// ==============================================
// 5. INITIALISATION AU CHARGEMENT
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOM loaded, initializing app...');
  
  // Initialiser les onglets
  initTabs();
  
  // Initialiser la recherche
  initSearch();
  
  // Charger les événements
  if (typeof window.loadEvents === 'function') {
    window.loadEvents();
  }
  
  // Bouton de création (fallback si onclick ne marche pas)
  const btnCreate = document.getElementById('btn-create-event');
  if (btnCreate) {
    btnCreate.addEventListener('click', () => window.showEventModal());
  }
  
  console.log('✅ App initialized');
});

console.log('✅ main.js ready - showEventModal available:', typeof window.showEventModal);