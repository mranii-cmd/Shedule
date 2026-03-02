import eventBus from '../core/EventBus.js';
import storageService from './StorageService.js';

/**
 * Service API centralisé avec gestion d'erreurs et intercepteurs
 */
class ApiService {
  constructor() {
    this.baseURL = '/api';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * Récupérer le token d'authentification
   */
  getAuthToken() {
    return storageService.get('auth_token');
  }

  /**
   * Construire les headers avec authentification
   */
  getHeaders(customHeaders = {}) {
    const headers = { ...this.defaultHeaders, ...customHeaders };

    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Gérer les erreurs HTTP
   */
  async handleResponse(response) {
    // Si 204 No Content
    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error('Invalid JSON response');
      }
    }

    if (!response.ok) {
      const error = new Error(data?.message || response.statusText);
      error.status = response.status;
      error.data = data;

      // Émettre événement pour gestion globale
      eventBus.emit('api:error', { error, response });

      // Si 401, déconnecter l'utilisateur
      if (response.status === 401) {
        eventBus.emit('auth:unauthorized');
      }

      throw error;
    }

    return data;
  }

  /**
   * Requête générique
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: this.getHeaders(options.headers)
    };

    try {
      const response = await fetch(url, config);
      return await this.handleResponse(response);
    } catch (error) {
      console.error(`API Error [${options.method || 'GET'}] ${url}:`, error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return this.request(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PUT request
   */
  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Upload de fichier
   */
  async upload(endpoint, file, additionalData = {}) {
    const formData = new FormData();
    formData.append('file', file);

    // Ajouter des données supplémentaires
    Object.keys(additionalData).forEach(key => {
      formData.append(key, additionalData[key]);
    });

    // Build headers without Content-Type so the browser sets it with the boundary
    const headers = this.getHeaders();
    delete headers['Content-Type'];

    return this.request(endpoint, {
      method: 'POST',
      headers,
      body: formData
    });
  }
}

// Export singleton
export default new ApiService();
