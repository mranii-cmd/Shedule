/**
 * EventBus - Système d'événements pour la communication inter-composants
 */
export class EventBus {
  constructor() {
    this._events = {};
  }

  /**
   * S'abonner à un événement
   * @param {string} event - Nom de l'événement
   * @param {Function} handler - Gestionnaire d'événement
   * @returns {EventBus}
   */
  on(event, handler) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(handler);
    return this;
  }

  /**
   * Se désabonner d'un événement
   * @param {string} event - Nom de l'événement
   * @param {Function} handler - Gestionnaire à retirer
   * @returns {EventBus}
   */
  off(event, handler) {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter(h => h !== handler);
    return this;
  }

  /**
   * Émettre un événement
   * @param {string} event - Nom de l'événement
   * @param {...*} args - Arguments à passer au gestionnaire
   * @returns {EventBus}
   */
  emit(event, ...args) {
    if (!this._events[event]) return this;
    [...this._events[event]].forEach(handler => handler(...args));
    return this;
  }

  /**
   * S'abonner à un événement une seule fois
   * @param {string} event - Nom de l'événement
   * @param {Function} handler - Gestionnaire d'événement
   * @returns {EventBus}
   */
  once(event, handler) {
    const wrapper = (...args) => {
      handler(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /**
   * Supprimer tous les abonnements d'un événement
   * @param {string} event - Nom de l'événement
   * @returns {EventBus}
   */
  removeAll(event) {
    if (event) {
      delete this._events[event];
    } else {
      this._events = {};
    }
    return this;
  }
}

export const eventBus = new EventBus();
