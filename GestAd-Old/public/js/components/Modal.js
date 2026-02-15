export class Modal {
  constructor(options = {}) {
    this.title = options.title || '';
    this.content = options.content || '';
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;
    this.element = null;
  }

  open() {
    this.element = this.render();
    document.body.appendChild(this.element);
    this.element.focus();
    return this;
  }

  close() {
    if (this.element) {
      this.element.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        this.element.remove();
        this.element = null;
      }, 200);
    }
  }

  render() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${this.title}</h2>
          <button class="modal-close" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body">
          ${this.content}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cancel">Annuler</button>
          <button class="btn btn-primary" data-action="confirm">Confirmer</button>
        </div>
      </div>
    `;

    overlay.querySelector('.modal-close').addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
      this.close();
    });

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      if (this.onCancel) this.onCancel();
      this.close();
    });

    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      if (this.onConfirm) this.onConfirm();
      this.close();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (this.onCancel) this.onCancel();
        this.close();
      }
    });

    return overlay;
  }
}

export async function showConfirm(title, message) {
  return new Promise((resolve) => {
    new Modal({
      title,
      content: `<p>${message}</p>`,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    }).open();
  });
}
