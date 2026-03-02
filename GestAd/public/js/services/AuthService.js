import apiService from './ApiService.js';
import storageService from './StorageService.js';
import eventBus from '../core/EventBus.js';

/**
 * Service d'authentification
 */
class AuthService {
  constructor() {
    this.tokenKey = 'auth_token';
    this.userKey = 'current_user';
    this.currentUser = null;

    // Écouter les événements de déconnexion
    eventBus.on('auth:unauthorized', () => this.logout());
  }

  /**
   * Vérifier si l'utilisateur est authentifié
   */
  isAuthenticated() {
    return !!storageService.get(this.tokenKey);
  }

  /**
   * Récupérer l'utilisateur actuel
   */
  getCurrentUser() {
    if (this.currentUser) {
      return this.currentUser;
    }

    const user = storageService.getObject(this.userKey);
    if (user) {
      this.currentUser = user;
      return this.currentUser;
    }

    return null;
  }

  /**
   * Connexion
   */
  async login(username, password) {
    try {
      const response = await apiService.post('/auth/login', {
        username,
        password
      });

      if (response.token) {
        storageService.set(this.tokenKey, response.token);

        if (response.user) {
          this.currentUser = response.user;
          storageService.set(this.userKey, JSON.stringify(response.user));
        }

        eventBus.emit('auth:login', response.user);
        return response;
      }

      throw new Error('Invalid response from server');
    } catch (error) {
      eventBus.emit('auth:login:error', error);
      throw error;
    }
  }

  /**
   * Déconnexion
   */
  logout() {
    storageService.remove(this.tokenKey);
    storageService.remove(this.userKey);
    this.currentUser = null;

    eventBus.emit('auth:logout');

    // Rediriger vers la page de connexion
    window.location.href = '/login.html';
  }

  /**
   * Charger le profil de l'utilisateur
   */
  async loadProfile() {
    try {
      const user = await apiService.get('/profile');
      this.currentUser = user;
      storageService.set(this.userKey, JSON.stringify(user));

      eventBus.emit('auth:profile:loaded', user);
      return user;
    } catch (error) {
      console.error('Error loading profile:', error);
      throw error;
    }
  }

  /**
   * Vérifier l'authentification et rediriger si nécessaire
   */
  requireAuth() {
    if (!this.isAuthenticated()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }
}

// Export singleton
export default new AuthService();
