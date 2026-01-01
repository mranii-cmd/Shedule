
import DialogManager from './DialogManager.js';
import StateManager from '../controllers/StateManager.js';
import { safeText } from '../utils/sanitizers.js';

function formatTimestamp(ts = Date.now()) {
  const d = new Date(ts);
  return d.toISOString().replace(/[:.]/g, '-');
}

function buildBackupPayload(options = {}) {
  const state = StateManager.state || {};
  const payload = {};
  if (options.includeState !== false) payload.state = state;
  if (options.includeSeances !== false) payload.seances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (state.seances || []);
  if (options.includeMatieres) payload.matiereGroupes = state.matiereGroupes || {};
  if (options.includeVolumesAutomne) payload.volumesAutomne = state.volumesAutomne || {};
  if (options.includeSalles) payload.sallesInfo = state.sallesInfo || {};
  payload._meta = {
    generatedAt: new Date().toISOString(),
    appVersion: (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : (state.version || null)
  };
  return payload;
}

function prettyJsonSize(str) {
  try {
    const bytes = new Blob([str]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(2)} MB`;
  } catch (e) {
    return '—';
  }
}

function openBackupModal(opts = {}) {
  const defaults = {
    includeState: true,
    includeSeances: true,
    includeMatieres: true,
    includeSalles: true,
    includeVolumesAutomne: true
  };
  const options = { ...defaults, ...opts };
  const defaultFileName = `edt-backup-${formatTimestamp()}.json`;

  const payload = buildBackupPayload(options);
  const payloadStr = JSON.stringify(payload, null, 2);
  const sizeLabel = prettyJsonSize(payloadStr);

  const html = `
    <div class="backup-modal">
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:8px;">
        <label style="min-width:110px;">Nom du fichier:</label>
        <input id="backupFilename" type="text" value="${safeText(defaultFileName)}" style="flex:1; padding:6px;" />
      </div>

      <div style="display:flex; gap:12px; margin-bottom:8px;">
        <div>
          <label><input type="checkbox" id="opt_state" ${options.includeState ? 'checked' : ''}> Inclure état complet</label><br>
          <label><input type="checkbox" id="opt_seances" ${options.includeSeances ? 'checked' : ''}> Inclure séances</label><br>
          <label><input type="checkbox" id="opt_matieres" ${options.includeMatieres ? 'checked' : ''}> Inclure matières</label><br>
          <label><input type="checkbox" id="opt_salles" ${options.includeSalles ? 'checked' : ''}> Inclure salles</label><br>
          <label><input type="checkbox" id="opt_volumes" ${options.includeVolumesAutomne ? 'checked' : ''}> Inclure volumesAutomne</label><br>
        </div>
        <div style="flex:1;">
          <div style="font-size:.9em; color:#666; margin-bottom:6px;">Aperçu JSON — taille estimée: <strong id="backupSize">${sizeLabel}</strong></div>
          <textarea id="backupPreview" style="width:100%; height:220px; font-family:monospace; font-size:.85em; padding:8px;">${safeText(payloadStr)}</textarea>
        </div>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button id="btnCopy" class="btn">Copier</button>
        <button id="btnDownload" class="btn btn-primary">Télécharger</button>
        <button id="btnClose" class="btn btn-secondary">Fermer</button>
      </div>

      <div id="backupMessage" style="margin-top:8px; min-height:20px; font-size:.9em;"></div>
    </div>
  `;

  DialogManager.show({
    title: 'Créer un backup',
    htmlMessage: html,
    allowHtml: true,
    onConfirm: null,
    onCancel: null
  });

  // Attach behavior
  setTimeout(() => {
    const filenameEl = document.getElementById('backupFilename');
    const previewEl = document.getElementById('backupPreview');
    const sizeEl = document.getElementById('backupSize');
    const btnCopy = document.getElementById('btnCopy');
    const btnDownload = document.getElementById('btnDownload');
    const btnClose = document.getElementById('btnClose');
    const messageEl = document.getElementById('backupMessage');

    function regenPreview() {
      const opt = {
        includeState: document.getElementById('opt_state').checked,
        includeSeances: document.getElementById('opt_seances').checked,
        includeMatieres: document.getElementById('opt_matieres').checked,
        includeSalles: document.getElementById('opt_salles').checked,
        includeVolumesAutomne: document.getElementById('opt_volumes').checked
      };
      try {
        const p = buildBackupPayload(opt);
        const s = JSON.stringify(p, null, 2);
        previewEl.value = s;
        sizeEl.textContent = prettyJsonSize(s);
      } catch (e) {
        previewEl.value = 'Erreur lors de la génération du preview: ' + (e && e.message);
        sizeEl.textContent = '—';
      }
    }

    ['opt_state','opt_seances','opt_matieres','opt_salles','opt_volumes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', regenPreview);
    });

    btnCopy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(previewEl.value);
        messageEl.style.color = '#0b8457';
        messageEl.textContent = 'JSON copié dans le presse‑papier.';
      } catch (e) {
        messageEl.style.color = '#b92c28';
        messageEl.textContent = 'Échec copie: ' + (e && e.message);
      }
    });

    btnDownload.addEventListener('click', () => {
      try {
        const fn = (filenameEl && filenameEl.value) ? filenameEl.value : defaultFileName;
        const blob = new Blob([previewEl.value], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fn;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          try { document.body.removeChild(a); } catch (e) {}
        }, 1000);
        messageEl.style.color = '#0b8457';
        messageEl.textContent = `Backup prêt — fichier généré: ${safeText(fn)}`;
      } catch (e) {
        messageEl.style.color = '#b92c28';
        messageEl.textContent = 'Erreur génération backup: ' + (e && e.message);
      }
    });

    btnClose.addEventListener('click', () => {
      try {
        if (typeof DialogManager.close === 'function') DialogManager.close();
      } catch (e) {}
    });
  }, 50);
}

// Expose pour compatibilité avec anciens scripts non-modules
try { window.openBackupModal = openBackupModal; } catch (e) { /* noop */ }

export default { openBackupModal, buildBackupPayload };