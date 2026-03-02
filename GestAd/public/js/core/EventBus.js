/**
 * EventBus - Système de communication événementiel entre composants
 * Permet aux composants de communiquer sans couplage direct
 */
class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * S'abonner à un événement
   * @param {string} event - Nom de l'événement
   * @param {Function} callback - Fonction callback
   * @returns {Function} Fonction pour se désabonner
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);

    // Retourner une fonction pour se désabonner
    return () => this.off(event, callback);
  }

  /**
   * Se désabonner d'un événement
   * @param {string} event - Nom de l'événement
   * @param {Function} callback - Fonction callback à retirer
   */
  off(event, callback) {
    if (!this.events[event]) return;

    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  /**
   * Émettre un événement
   * @param {string} event - Nom de l'événement
   * @param {*} data - Données à transmettre
   */
  emit(event, data) {
    if (!this.events[event]) return;

    this.events[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * S'abonner à un événement une seule fois
   * @param {string} event - Nom de l'événement
   * @param {Function} callback - Fonction callback
   */
  once(event, callback) {
    const onceCallback = (data) => {
      callback(data);
      this.off(event, onceCallback);
    };
    this.on(event, onceCallback);
  }

  /**
   * Nettoyer tous les événements
   */
  clear() {
    this.events = {};
  }
}

// Export singleton
export default new EventBus();
