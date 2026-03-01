/**
 * StorageService - Service de gestion du localStorage
 */
export class StorageService {
  constructor(prefix = 'gestad_') {
    this.prefix = prefix;
  }

  /**
   * Génère la clé complète avec le préfixe
   * @param {string} key
   * @returns {string}
   */
  _key(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Récupère une valeur depuis localStorage
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this._key(key));
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Stocke une valeur dans localStorage
   * @param {string} key
   * @param {*} value
   * @returns {boolean}
   */
  set(key, value) {
    try {
      localStorage.setItem(this._key(key), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Supprime une entrée du localStorage
   * @param {string} key
   * @returns {StorageService}
   */
  remove(key) {
    localStorage.removeItem(this._key(key));
    return this;
  }

  /**
   * Vérifie si une clé existe
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return localStorage.getItem(this._key(key)) !== null;
  }

  /**
   * Supprime toutes les entrées avec le préfixe courant
   * @returns {StorageService}
   */
  clear() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    return this;
  }
}

export const storageService = new StorageService();
