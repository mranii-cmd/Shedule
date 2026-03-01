/**
 * Composant Modal réutilisable
 */
export class Modal {
  constructor(options = {}) {
    this.options = {
      title: '',
      content: '',
      size: 'medium', // small, medium, large
      closeOnEscape: true,
      closeOnOverlay: true,
      showCloseButton: true,
      ...options
    };

    this.element = null;
    this.isOpen = false;
  }

  /**
   * Créer le HTML de la modal
   */
  create() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal modal-${this.options.size}">
        <div class="modal-header">
          <h2 class="modal-title">${this.options.title}</h2>
          ${this.options.showCloseButton ? '<button class="modal-close" aria-label="Fermer">×</button>' : ''}
        </div>
        <div class="modal-body">
          ${this.options.content}
        </div>
        ${this.options.footer ? `<div class="modal-footer">${this.options.footer}</div>` : ''}
      </div>
    `;

    this.element = modal;
    this.attachEvents();
    return modal;
  }

  /**
   * Attacher les événements
   */
  attachEvents() {
    if (!this.element) return;

    // Fermeture sur clic du bouton
    const closeBtn = this.element.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Fermeture sur clic de l'overlay
    if (this.options.closeOnOverlay) {
      this.element.addEventListener('click', (e) => {
        if (e.target === this.element) {
          this.close();
        }
      });
    }

    // Fermeture sur touche Escape
    if (this.options.closeOnEscape) {
      this.escapeHandler = (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      };
      document.addEventListener('keydown', this.escapeHandler);
    }
  }

  /**
   * Ouvrir la modal
   */
  open() {
    if (!this.element) {
      this.create();
    }

    document.body.appendChild(this.element);
    this.isOpen = true;

    // Animation
    setTimeout(() => {
      this.element.classList.add('modal-open');
    }, 10);

    // Empêcher le scroll du body
    document.body.style.overflow = 'hidden';

    return this;
  }

  /**
   * Fermer la modal
   */
  close() {
    if (!this.isOpen) return;

    this.element.classList.remove('modal-open');

    setTimeout(() => {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.isOpen = false;

      // Restaurer le scroll du body
      document.body.style.overflow = '';
    }, 300);

    // Nettoyer l'event listener
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
    }

    return this;
  }

  /**
   * Mettre à jour le contenu
   */
  setContent(content) {
    if (!this.element) return;

    const body = this.element.querySelector('.modal-body');
    if (body) {
      body.innerHTML = content;
    }

    return this;
  }

  /**
   * Mettre à jour le titre
   */
  setTitle(title) {
    if (!this.element) return;

    const titleEl = this.element.querySelector('.modal-title');
    if (titleEl) {
      titleEl.textContent = title;
    }

    return this;
  }

  /**
   * Confirmer avec Promise
   */
  static confirm(message, title = 'Confirmation') {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        content: `<p>${message}</p>`,
        footer: `
          <button class="btn btn-secondary" data-action="cancel">Annuler</button>
          <button class="btn btn-primary" data-action="confirm">Confirmer</button>
        `
      });

      modal.open();

      const handleClick = (e) => {
        const action = e.target.dataset.action;
        if (action) {
          modal.close();
          resolve(action === 'confirm');
        }
      };

      modal.element.addEventListener('click', handleClick);
    });
  }

  /**
   * Alert simple
   */
  static alert(message, title = 'Information') {
    const modal = new Modal({
      title,
      content: `<p>${message}</p>`,
      footer: '<button class="btn btn-primary" data-action="ok">OK</button>'
    });

    modal.open();

    modal.element.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'ok') {
        modal.close();
      }
    });

    return modal;
  }
}

export default Modal;
