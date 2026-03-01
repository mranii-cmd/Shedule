/**
 * Composant Toast pour les notifications
 */
class ToastManager {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.init();
  }

  /**
   * Initialiser le conteneur
   */
  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  /**
   * Créer un toast
   */
  create(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = this.getIcon(type);
    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close" aria-label="Fermer">×</button>
    `;

    this.container.appendChild(toast);
    this.toasts.push(toast);

    // Animation d'entrée
    setTimeout(() => {
      toast.classList.add('toast-show');
    }, 10);

    // Fermeture sur clic
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.remove(toast));

    // Auto-fermeture
    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  }

  /**
   * Récupérer l'icône selon le type
   */
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.info;
  }

  /**
   * Supprimer un toast
   */
  remove(toast) {
    toast.classList.remove('toast-show');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.toasts = this.toasts.filter(t => t !== toast);
    }, 300);
  }

  /**
   * Méthodes rapides
   */
  success(message, duration) {
    return this.create(message, 'success', duration);
  }

  error(message, duration) {
    return this.create(message, 'error', duration);
  }

  warning(message, duration) {
    return this.create(message, 'warning', duration);
  }

  info(message, duration) {
    return this.create(message, 'info', duration);
  }

  /**
   * Nettoyer tous les toasts
   */
  clear() {
    this.toasts.forEach(toast => this.remove(toast));
  }
}

// Export singleton
export default new ToastManager();
