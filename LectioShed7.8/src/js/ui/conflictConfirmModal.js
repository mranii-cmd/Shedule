// Module: conflictConfirmModal.js
// Exporte la fonction showConflictConfirmModal(candidate, conflicts) -> Promise<{ action }>
const STYLE_ID = 'conflict-modal-styles-module';
const OVERLAY_ID = 'conflict-modal-overlay-module';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const css = `
#${OVERLAY_ID}{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:100000;}
#${OVERLAY_ID} .conflict-modal{background:#fff;width:720px;max-width:95%;border-radius:8px;padding:16px;box-shadow:0 6px 24px rgba(0,0,0,.3);font-family:Arial,sans-serif}
#${OVERLAY_ID} .conflict-modal h3{margin:0 0 8px;font-size:18px}
#${OVERLAY_ID} .conflicts-list{max-height:300px;overflow:auto;margin:8px 0;padding:8px;border:1px solid #eee;background:#fbfbfb}
#${OVERLAY_ID} .conflict-item{padding:6px 0;border-bottom:1px solid #eee;white-space:pre-wrap;font-size:0.95em}
#${OVERLAY_ID} .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
#${OVERLAY_ID} button{padding:8px 12px;border-radius:4px;border:1px solid #ccc;background:#fff;cursor:pointer}
#${OVERLAY_ID} button.primary{background:#1167b1;color:#fff;border-color:#0c5a99}
#${OVERLAY_ID} button.warn{background:#d9534f;color:#fff;border-color:#c9302c}
`;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

/**
 * showConflictConfirmModal — affiche une modal listant les conflits et retourne l'action choisie.
 * candidate: objet session (affiché pas en détail ici)
 * conflicts: array (string or object) — seront affichés via textContent / JSON.stringify
 * Résolution: { action: 'cancel' | 'force' | 'force_mark' }
 */
export function showConflictConfirmModal(candidate, conflicts) {
  ensureStyle();

  return new Promise((resolve) => {
    // Si un overlay existe déjà, reuse (rare) — on crée un nouveau overlay unique
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    const modal = document.createElement('div');
    modal.className = 'conflict-modal';

    const title = document.createElement('h3');
    title.textContent = 'Conflits détectés — Confirmer la planification';
    modal.appendChild(title);

    const intro = document.createElement('div');
    intro.textContent = 'La séance que vous tentez de placer entre en conflit avec les éléments suivants :';
    modal.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'conflicts-list';
    if (Array.isArray(conflicts) && conflicts.length) {
      conflicts.forEach((c) => {
        const item = document.createElement('div');
        item.className = 'conflict-item';
        if (typeof c === 'string') {
          item.textContent = c;
        } else {
          try {
            item.textContent = JSON.stringify(c, null, 0);
          } catch (e) {
            item.textContent = String(c);
          }
        }
        list.appendChild(item);
      });
    } else {
      const item = document.createElement('div');
      item.className = 'conflict-item';
      item.textContent = '(Aucun conflit structuré à afficher)';
      list.appendChild(item);
    }
    modal.appendChild(list);

    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.fontSize = '12px';
    note.textContent = "Vous pouvez annuler, forcer l'enregistrement ou forcer + marquer pour résolution. Cette action sera tracée.";
    modal.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.textContent = 'Annuler';

    const btnForce = document.createElement('button');
    btnForce.type = 'button';
    btnForce.className = 'primary';
    btnForce.textContent = 'Placer malgré tout';

    const btnForceMark = document.createElement('button');
    btnForceMark.type = 'button';
    btnForceMark.className = 'warn';
    btnForceMark.textContent = 'Placer et marquer pour résolution';

    actions.appendChild(btnCancel);
    actions.appendChild(btnForce);
    actions.appendChild(btnForceMark);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // focus management (simple)
    const prevActive = document.activeElement;
    setTimeout(() => {
      try {
        btnForce.focus();
      } catch (e) { /* ignore */ }
    }, 10);

    function cleanup() {
      try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { /* ignore */ }
      try { if (prevActive && typeof prevActive.focus === 'function') prevActive.focus(); } catch (e) { /* ignore */ }
    }

    btnCancel.addEventListener('click', () => { cleanup(); resolve({ action: 'cancel' }); });
    btnForce.addEventListener('click', () => { cleanup(); resolve({ action: 'force' }); });
    btnForceMark.addEventListener('click', () => { cleanup(); resolve({ action: 'force_mark' }); });

    // close on overlay click outside modal
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) { cleanup(); resolve({ action: 'cancel' }); }
    });

    // keyboard support: Escape => cancel, Enter => force
    function keyHandler(e) {
      if (e.key === 'Escape') { cleanup(); resolve({ action: 'cancel' }); }
      else if (e.key === 'Enter') { cleanup(); resolve({ action: 'force' }); }
    }
    document.addEventListener('keydown', keyHandler, { once: true });

    // ensure removal of key handler on cleanup (already once:true)
  });
}