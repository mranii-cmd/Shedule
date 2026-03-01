import authService from './services/AuthService.js';
import eventBus from './core/EventBus.js';
import toast from './components/UI/Toast.js';

/**
 * Point d'entrée principal de l'application
 */
class App {
  constructor() {
    this.init();
  }

  /**
   * Initialiser l'application
   */
  async init() {
    console.log('🚀 GestAd Application Starting...');

    // Vérifier l'authentification sur les pages protégées
    if (!window.location.pathname.includes('login.html')) {
      if (!authService.requireAuth()) {
        return;
      }

      // Charger le profil utilisateur
      try {
        await authService.loadProfile();
        this.setupGlobalEvents();
        this.initModules();
      } catch (error) {
        console.error('Error loading profile:', error);
        toast.error('Erreur de chargement du profil');
      }
    }

    console.log('✅ GestAd Application Ready');
  }

  /**
   * Configurer les événements globaux
   */
  setupGlobalEvents() {
    // Écouter les erreurs API
    eventBus.on('api:error', ({ error }) => {
      console.error('API Error:', error);

      if (error.status !== 401) { // 401 géré par AuthService
        toast.error(error.message || 'Une erreur est survenue');
      }
    });

    // Écouter les déconnexions
    eventBus.on('auth:logout', () => {
      toast.info('Vous avez été déconnecté');
    });

    // Bouton de déconnexion
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authService.logout();
      });
    }
  }

  /**
   * Initialiser les modules selon la page
   */
  initModules() {
    // Détecter la page actuelle et initialiser le module approprié
    const path = window.location.pathname;

    if (path.includes('events') || path === '/' || path === '/index.html') {
      import('./modules/events/EventsManager.js').then(module => {
        new module.default();
      });
    }

    if (path.includes('documents')) {
      import('./modules/documents/DocumentsManager.js').then(module => {
        new module.default();
      });
    }

    if (path.includes('profile')) {
      import('./modules/profile/ProfileManager.js').then(module => {
        new module.default();
      });
    }
  }
}

// Démarrer l'application au chargement du DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
