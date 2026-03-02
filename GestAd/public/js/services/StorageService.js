/**
 * Service de gestion du stockage (localStorage/sessionStorage)
 */
class StorageService {
  constructor() {
    this.prefix = 'gestad_';
  }

  /**
   * Construire la clé avec préfixe
   */
  getKey(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Stocker une valeur
   */
  set(key, value, useSession = false) {
    try {
      const storage = useSession ? sessionStorage : localStorage;
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      storage.setItem(this.getKey(key), stringValue);
      return true;
    } catch (error) {
      console.error('Error setting storage:', error);
      return false;
    }
  }

  /**
   * Récupérer une valeur
   */
  get(key, useSession = false) {
    try {
      const storage = useSession ? sessionStorage : localStorage;
      return storage.getItem(this.getKey(key));
    } catch (error) {
      console.error('Error getting storage:', error);
      return null;
    }
  }

  /**
   * Récupérer et parser un objet JSON
   */
  getObject(key, useSession = false) {
    const value = this.get(key, useSession);
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Error parsing storage object:', error);
      return null;
    }
  }

  /**
   * Supprimer une valeur
   */
  remove(key, useSession = false) {
    try {
      const storage = useSession ? sessionStorage : localStorage;
      storage.removeItem(this.getKey(key));
      return true;
    } catch (error) {
      console.error('Error removing storage:', error);
      return false;
    }
  }

  /**
   * Nettoyer tout le stockage de l'application
   */
  clear(useSession = false) {
    try {
      const storage = useSession ? sessionStorage : localStorage;
      const keys = Object.keys(storage);

      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          storage.removeItem(key);
        }
      });

      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  }

  /**
   * Vérifier si une clé existe
   */
  has(key, useSession = false) {
    return this.get(key, useSession) !== null;
  }
}

// Export singleton
export default new StorageService();
