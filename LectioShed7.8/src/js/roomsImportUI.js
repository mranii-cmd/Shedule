// UI module pour importer les salles (wired to ImportService.importRoomsFromExcel)
// Assure-toi d'avoir ajouté les méthodes importRoomsFromExcel / parseRoomsData / exportRoomsTemplate
// dans ImportService.js (Option A).

import ImportService from './services/ImportService.js';
import LogService from './services/LogService.js';
import NotificationManager from './ui/NotificationManager.js';

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileImportRooms');
  const btnImport = document.getElementById('btnImportRooms');
  const btnTemplate = document.getElementById('btnDownloadRoomsTemplate');
  const resultEl = document.getElementById('roomsImportResult');

  if (!btnImport || !btnTemplate || !fileInput || !resultEl) {
    // UI not present on this page — nothing to do
    return;
  }

  function setBusy(msg = 'Traitement en cours...') {
    resultEl.textContent = msg;
    btnImport.disabled = true;
    btnTemplate.disabled = true;
  }
  function clearBusy() {
    resultEl.textContent = '';
    btnImport.disabled = false;
    btnTemplate.disabled = false;
  }

  async function doImportRooms(file) {
    if (!file) {
      resultEl.innerHTML = '<div style="color:#856404;background:#fff3cd;padding:6px;border-radius:4px;">Aucun fichier sélectionné.</div>';
      return;
    }
    setBusy('Import des salles en cours...');
    try {
      const res = await ImportService.importRoomsFromExcel(file);
      clearBusy();

      if (!res) {
        resultEl.innerHTML = '<div style="color:#721c24;background:#f8d7da;padding:6px;border-radius:4px;">Import failed (no response)</div>';
        return;
      }
      const added = res.added || 0;
      const updated = res.updated || 0;
      const processed = res.rowsProcessed || 0;
      const errors = res.errors || [];

      let html = `<div style="color:#155724;background:#d4edda;padding:6px;border-radius:4px;">Import terminé — ${processed} ligne(s) traitée(s). Ajoutées: ${added}. Mises à jour: ${updated}.</div>`;

      if (errors.length) {
        html += `<div style="margin-top:8px;color:#856404;background:#fff3cd;padding:6px;border-radius:4px;">Des erreurs/warnings (${errors.length}). <button id="downloadRoomsErrorsBtn" style="margin-left:8px;">Télécharger erreurs CSV</button></div>`;
      }

      resultEl.innerHTML = html;

      const dlBtn = document.getElementById('downloadRoomsErrorsBtn');
      if (dlBtn) {
        dlBtn.addEventListener('click', () => {
          // build CSV and download
          const header = ['row','column','code','message'];
          const lines = [header.join(',')];
          errors.forEach(e => {
            const row = [
              e.row ?? '',
              `"${(e.column || '').toString().replace(/"/g, '""')}"`,
              e.code || '',
              `"${(e.message || '').toString().replace(/"/g, '""')}"`
            ];
            lines.push(row.join(','));
          });
          const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'rooms_import_errors.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        });
      }

      // Attempt a UI refresh if renderer exists
      try {
        if (window.EDTVolumeRenderer && typeof window.EDTVolumeRenderer.render === 'function') {
          window.EDTVolumeRenderer.render();
        }
        if (window.EDTRoomsRenderer && typeof window.EDTRoomsRenderer.render === 'function') {
          window.EDTRoomsRenderer.render();
        }
      } catch (e) {
        // noop
      }

      // Notification
      NotificationManager && NotificationManager.success && NotificationManager.success(`Import salles terminé : ${added} ajoutées, ${updated} mises à jour`);
      LogService && LogService.info && LogService.info(`Rooms import: added=${added} updated=${updated} processed=${processed} errors=${errors.length}`);
    } catch (err) {
      clearBusy();
      NotificationManager && NotificationManager.error && NotificationManager.error('Erreur lors de l\'import des salles');
      LogService && LogService.error && LogService.error('Import rooms failed: ' + (err && err.message));
      resultEl.innerHTML = `<div style="color:#721c24;background:#f8d7da;padding:6px;border-radius:4px;">Erreur durant l'import : ${(err && err.message) || err}</div>`;
    }
  }

  // Click importer -> trigger file input
  btnImport.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });

  // When file selected -> run import
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    doImportRooms(f);
  });

  // Template download
  btnTemplate.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      if (typeof ImportService.exportRoomsTemplate === 'function') {
        ImportService.exportRoomsTemplate();
      } else {
        NotificationManager && NotificationManager.warning && NotificationManager.warning('Template non disponible');
      }
    } catch (ex) {
      NotificationManager && NotificationManager.error && NotificationManager.error('Erreur lors du téléchargement du template');
      LogService && LogService.error && LogService.error('exportRoomsTemplate error: ' + (ex && ex.message));
    }
  });
});