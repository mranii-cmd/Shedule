/**
 * API Utility pour GestAd
 * Gère toutes les requêtes HTTP vers l'API backend
 */

const API_BASE_URL = '/api';

/**
 * Effectue une requête API
 * @param {string} endpoint - L'endpoint API (ex: '/events')
 * @param {object} options - Options de la requête fetch
 * @returns {Promise} - Les données de la réponse
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  };
  
  console.log(`🌐 API Request: ${config.method || 'GET'} ${url}`);
  
  try {
    const response = await fetch(url, config);
    
    console.log(`📡 Response: ${response.status} ${response.statusText}`);
    
    // Si 204 No Content (succès sans contenu, ex: DELETE)
    if (response.status === 204) {
      console.log('✅ 204 No Content - Success');
      return null;
    }
    
    // Lire la réponse en texte brut d'abord
    const text = await response.text();
    console.log(`📝 Response length: ${text.length} chars`);
    
    // Si la réponse est vide
    if (!text || text.trim().length === 0) {
      console.log('⚠️  Empty response');
      return response.ok ? [] : null;
    }
    
    // Essayer de parser le JSON
    let data;
    try {
      data = JSON.parse(text);
      console.log('✅ JSON parsed successfully');
      console.log('📦 Data type:', Array.isArray(data) ? 'Array' : typeof data);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.error('Response text (first 200 chars):', text.substring(0, 200));
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }
    
    // Vérifier si la requête HTTP a échoué
    if (!response.ok) {
      const errorMsg = data.message || data.error || response.statusText;
      throw new Error(`HTTP ${response.status}: ${errorMsg}`);
    }
    
    return data;
    
  } catch (error) {
    console.error('❌ API Request failed:', error);
    throw error;
  }
}

/**
 * API wrapper avec méthodes REST
 */
export const api = {
  /**
   * GET request
   */
  get: (endpoint) => {
    return apiRequest(endpoint, { method: 'GET' });
  },
  
  /**
   * POST request
   */
  post: (endpoint, data) => {
    return apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * PUT request
   */
  put: (endpoint, data) => {
    return apiRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * DELETE request
   */
  delete: (endpoint) => {
    return apiRequest(endpoint, { method: 'DELETE' });
  },
};

// Exporter globalement pour permettre les tests dans la console
window.api = api;

console.log('✅ API utility loaded - window.api is ready');