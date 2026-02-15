export class Modal {
  constructor(options = {}) {
    this.title = options.title || '';
    this.content = options.content || ''; // string or Node
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.id = options.id || null;
    this.className = options.className || ''; // allow 'preview-modal' etc.
    this.headerActions = options.headerActions || null; // HTML string or Node for header actions area
    this.element = null;
    this._boundOnKey = this._onKeyDown.bind(this);
    this._ro = null;
  }

  open() {
    this.element = this.render();
    document.body.appendChild(this.element);
    // set focus to modal for accessibility
    this.element.setAttribute('tabindex', '-1');
    this.element.focus();
    // listen escape
    document.addEventListener('keydown', this._boundOnKey);
    // compute header height var (if header exists) and observe changes
    this._setHeaderHeightVar();
    if (typeof this.onOpen === 'function') this.onOpen(this);
    return this;
  }

  close() {
    if (this.element) {
      // remove observers/listeners
      document.removeEventListener('keydown', this._boundOnKey);
      if (this._ro) {
        try { this._ro.disconnect(); } catch (e) {}
        this._ro = null;
      }
      // animation then remove
      this.element.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        // call onClose before DOM removal
        if (typeof this.onClose === 'function') this.onClose(this);
        this.element.remove();
        this.element = null;
      }, 200);
    }
  }

  // keyboard: Escape closes; simple focus trap not implemented to keep minimal
  _onKeyDown(e) {
    if (e.key === 'Escape') {
      if (this.onCancel) this.onCancel();
      this.close();
    }
  }

  // compute header height and set CSS var on modal element; observe header size changes
  _setHeaderHeightVar() {
    if (!this.element) return;
    const modal = this.element.querySelector('.modal') || this.element;
    const topHeader = modal.querySelector(':scope > .modal-header, :scope > .preview-header, .modal-header, .preview-header');
    if (!topHeader) return;
    const update = () => {
      try {
        const h = Math.ceil(topHeader.getBoundingClientRect().height || 0);
        // set css var on modal overlay element (scoped)
        this.element.style.setProperty('--preview-header-height', `${h}px`);
      } catch (e) { /* ignore */ }
    };
    update();
    // observe size changes
    try {
      this._ro = new ResizeObserver(update);
      this._ro.observe(topHeader);
    } catch (e) {
      // ResizeObserver may not be supported; ignore
    }
  }

  render() {
    const overlay = document.createElement('div');
    overlay.className = `modal-overlay ${this.className || ''}`.trim();
    if (this.id) overlay.id = this.id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    // build header actions area
    let actionsHtml = '';
    if (this.headerActions && typeof this.headerActions === 'string') {
      actionsHtml = this.headerActions;
    } else if (this.headerActions instanceof Node) {
      // will be appended later
      actionsHtml = '';
    }

    // allow content to be Node or string
    const contentHtml = (this.content instanceof Node) ? '<div class="__content-placeholder"></div>' : (this.content || '');

    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header preview-header">
          <h2 class="modal-title">${this.title}</h2>
          <div class="preview-actions">${actionsHtml}</div>
          <button class="modal-close preview-btn" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body preview-content">
          ${contentHtml}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cancel">Annuler</button>
          <button class="btn btn-primary" data-action="confirm">Confirmer</button>
        </div>
      </div>
    `;

    // if content was a Node, append it into placeholder
    if (this.content instanceof Node) {
      const placeholder = overlay.querySelector('.__content-placeholder');
      if (placeholder) {
        placeholder.replaceWith(this.content);
      } else {
        const body = overlay.querySelector('.modal-body');
        if (body) body.appendChild(this.content);
      }
    }

    // if headerActions is Node, append it into .preview-actions
    if (this.headerActions instanceof Node) {
      const actionsEl = overlay.querySelector('.preview-actions');
      if (actionsEl) actionsEl.appendChild(this.headerActions);
    }

    // wire buttons
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (this.onCancel) this.onCancel();
        this.close();
      });
    }

    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (this.onCancel) this.onCancel();
        this.close();
      });
    }

    const confirmBtn = overlay.querySelector('[data-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (this.onConfirm) this.onConfirm();
        this.close();
      });
    }

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