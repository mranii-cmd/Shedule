// Simple manager for time slots (creneaux) — add / edit / delete
import StateManager from './controllers/StateManager.js';
import DialogManager from './ui/DialogManager.js';
import FormManager from './ui/FormManager.js';
import { safeText } from './utils/sanitizers.js';

function parseLabelToMinutes(label) {
  if (!label) return null;
  const s = String(label).trim().replace(':', 'h').replace('H', 'h');
  const m = s.match(/^(\d{1,2})h(\d{1,2})$/i);
  if (!m) return null;
  const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function buildModalHtml(creneaux) {
  const rows = Object.keys(creneaux || {}).map(key => {
    const c = creneaux[key] || {};
    const label = safeText(c.label || key);
    const debut = safeText(c.debut || key);
    const fin = safeText(c.fin || '');
    return `<tr data-key="${safeText(key)}"><td>${label}</td><td>${debut}</td><td>${fin}</td><td><button class="edit">Edit</button> <button class="del" style="color:#b00">Delete</button></td></tr>`;
  }).join('');
  return `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <strong>Gestion des créneaux</strong>
        <div><button id="cr_new" class="btn">➕ Nouveau</button> <button id="cr_close" class="btn btn-secondary">Fermer</button></div>
      </div>
      <div style="max-height:380px; overflow:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr><th>Label</th><th>Début</th><th>Fin</th><th></th></tr></thead>
          <tbody id="cr_rows">${rows}</tbody>
        </table>
      </div>
      <div id="cr_form_area" style="margin-top:12px; display:none;">
        <div style="display:flex; gap:8px; align-items:center;">
          <input id="cr_label" placeholder="Label (ex: 8h30-10h00)" style="flex:1; padding:6px;" />
          <input id="cr_debut" placeholder="Début (ex: 8h30)" style="width:120px; padding:6px;" />
          <input id="cr_fin" placeholder="Fin (ex: 10h00)" style="width:120px; padding:6px;" />
          <button id="cr_save" class="btn btn-primary">Enregistrer</button>
          <button id="cr_cancel" class="btn btn-secondary">Annuler</button>
        </div>
        <div id="cr_msg" style="margin-top:8px; color:#b92c28;"></div>
      </div>
    </div>
  `;
}

function openCreneauxManager() {
  try {
    const creneaux = (StateManager && StateManager.state && StateManager.state.creneaux) ? StateManager.state.creneaux : {};
    const html = buildModalHtml(creneaux);

    // Prefer DialogManager if available
    if (DialogManager && typeof DialogManager.show === 'function') {
      DialogManager.show({ title: 'Gérer les créneaux', htmlMessage: html, allowHtml: true });
    } else {
      // Fallback: place in native dialog modal (assumes index.html contains #dialogModal)
      const modal = document.getElementById('dialogModal');
      if (!modal) {
        alert('Impossible d\'ouvrir la modale de gestion des créneaux.');
        return;
      }
      document.getElementById('dialogTitle').innerText = 'Gérer les créneaux';
      document.getElementById('dialogBody').innerHTML = html;
      modal.style.display = 'flex';
    }

    // small helper to get current container references
    setTimeout(() => {
      const rowsEl = document.getElementById('cr_rows');
      const formArea = document.getElementById('cr_form_area');
      const inputLabel = document.getElementById('cr_label');
      const inputDebut = document.getElementById('cr_debut');
      const inputFin = document.getElementById('cr_fin');
      const saveBtn = document.getElementById('cr_save');
      const cancelBtn = document.getElementById('cr_cancel');
      const newBtn = document.getElementById('cr_new');
      const closeBtn = document.getElementById('cr_close');
      const msgEl = document.getElementById('cr_msg');

      function refreshRows() {
        const c = (StateManager && StateManager.state && StateManager.state.creneaux) ? StateManager.state.creneaux : {};
        rowsEl.innerHTML = Object.keys(c).map(k => {
          const it = c[k] || {};
          const label = safeText(it.label || k);
          const debut = safeText(it.debut || k);
          const fin = safeText(it.fin || '');
          return `<tr data-key="${safeText(k)}"><td>${label}</td><td>${debut}</td><td>${fin}</td><td><button class="edit">Edit</button> <button class="del" style="color:#b00">Delete</button></td></tr>`;
        }).join('');
      }

      function showForm(mode, key) {
        msgEl.textContent = '';
        formArea.style.display = 'block';
        inputLabel.focus();
        if (mode === 'edit' && key) {
          const cur = StateManager.state.creneaux[key] || {};
          inputLabel.value = cur.label || key;
          inputDebut.value = cur.debut || key;
          inputFin.value = cur.fin || '';
          saveBtn.dataset.editKey = key;
        } else {
          inputLabel.value = '';
          inputDebut.value = '';
          inputFin.value = '';
          delete saveBtn.dataset.editKey;
        }
      }

      function hideForm() {
        formArea.style.display = 'none';
        inputLabel.value = '';
        inputDebut.value = '';
        inputFin.value = '';
        msgEl.textContent = '';
        delete saveBtn.dataset.editKey;
      }

      // events
      if (newBtn) newBtn.addEventListener('click', () => showForm('new'));
      if (cancelBtn) cancelBtn.addEventListener('click', hideForm);
      if (closeBtn) closeBtn.addEventListener('click', () => {
        try { if (DialogManager && typeof DialogManager.close === 'function') DialogManager.close(); else { document.getElementById('dialogModal').style.display = 'none'; } } catch (e) { }
      });

      rowsEl.addEventListener('click', (ev) => {
        const tr = ev.target.closest('tr[data-key]');
        if (!tr) return;
        const key = tr.getAttribute('data-key');
        if (ev.target.classList.contains('edit')) {
          showForm('edit', key);
        } else if (ev.target.classList.contains('del')) {
          if (!confirm('Supprimer ce créneau ?')) return;
          try {
            // push undo snapshot before deletion
            try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('creneau delete ' + key); } catch (e) { console.debug('pushUndoState creneau delete failed', e); }

            delete StateManager.state.creneaux[key];
            if (typeof StateManager.saveState === 'function') StateManager.saveState();
          } catch (e) { console.warn(e); }
          refreshRows();
          try { if (FormManager && typeof FormManager.populateCreneauSelect === 'function') FormManager.populateCreneauSelect(); } catch (e) { }
        }
      });

      if (saveBtn) saveBtn.addEventListener('click', () => {
        const label = (inputLabel.value || '').trim();
        const debut = (inputDebut.value || '').trim();
        const fin = (inputFin.value || '').trim();
        if (!label) { msgEl.textContent = 'Le label est requis.'; return; }
        // simple validation on debut/fin
        if (!parseLabelToMinutes(debut)) { msgEl.textContent = 'Format début invalide (ex: 8h30 ou 08:30).'; return; }
        if (fin && !parseLabelToMinutes(fin)) { msgEl.textContent = 'Format fin invalide (ex: 10h00).'; return; }

        const editKey = saveBtn.dataset.editKey;
        try {
          // push undo snapshot before changing creneaux
          try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('creneau save ' + (editKey || (debut || label))); } catch (e) { console.debug('pushUndoState creneau save failed', e); }

          if (!StateManager.state.creneaux) StateManager.state.creneaux = {};
          const keyForStore = debut || label;
          StateManager.state.creneaux[keyForStore] = { label: label, debut: debut || label, fin: fin || '' };
          // if the key changed during edit, remove the old entry
          if (editKey && editKey !== keyForStore) {
            try { delete StateManager.state.creneaux[editKey]; } catch (e) { }
          }
          if (typeof StateManager.saveState === 'function') StateManager.saveState();
          msgEl.style.color = '#0b8457';
          msgEl.textContent = 'Enregistré.';
        } catch (e) {
          console.error(e);
          msgEl.style.color = '#b92c28';
          msgEl.textContent = 'Erreur enregistrement.';
        }
        refreshRows();
        hideForm();
        try { if (FormManager && typeof FormManager.populateCreneauSelect === 'function') FormManager.populateCreneauSelect(); } catch (e) { }
      });

    }, 40);
  } catch (err) {
    console.error('openCreneauxManager error', err);
  }
}

// Expose and wire to button created in index.html
try { window.openCreneauxManager = openCreneauxManager; } catch (e) { /* noop */ }

document.addEventListener('DOMContentLoaded', function () {
  try {
    const btn = document.getElementById('btnManageCreneaux');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e && e.preventDefault && e.preventDefault();
        openCreneauxManager();
      });
    }
  } catch (e) { }
});

export default { openCreneauxManager };