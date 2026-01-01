/**
 * Gestionnaire des exports de documents
 * @author Ibrahim Mrani - UCD
 *
 * Version corrigée : suppression de possibilités de plantage syntaxique,
 * robustification des imports dynamiques et des vérifications d'existence.
 */

import ExportService from '../services/ExportService.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import SpinnerManager from '../ui/SpinnerManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import TableRenderer from '../ui/TableRenderer.js';
import StateManager from '../controllers/StateManager.js';
import ImportService from '../services/ImportService.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class ExportHandlers {
  init() {
    try {
      const input = document.getElementById('inputImportFilieres');
      const btn = document.getElementById('btnImportFilieres');
      const downloadBtn = document.getElementById('btnDownloadFilieresTemplate');

      // Si les éléments ne sont pas présents, on sort silencieusement (progressive enhancement)
      if (!input && !btn && !downloadBtn) return;

      // Si bouton d'import présent, ouvrir file picker
      if (btn && input) {
        btn.addEventListener('click', () => input.click());

        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) return;

          DialogManager.confirm(
            'Importer des Filières',
            `Importer le fichier "<strong>${file.name}</strong>" ? Cela ajoutera/mettre à jour les filières existantes.`,
            async () => {
              SpinnerManager.show();
              try {
                const res = await ImportService.importFilieresFromExcel(file);
                SpinnerManager.hide();
                const added = res.added || 0;
                const updated = res.updated || 0;
                NotificationManager.success(`${added} filière(s) ajoutée(s), ${updated} mise(s) à jour`);
              } catch (err) {
                SpinnerManager.hide();
                LogService.error('Erreur import filières: ' + (err && err.message ? err.message : String(err)));
                DialogManager.error('Erreur lors de l\'import des filières. Voir la console pour détails.');
              } finally {
                try { input.value = ''; } catch (e) { /* noop */ }
              }
            },
            () => { /* cancel */ }
          );
        });
      }

      // Téléchargement d'un template filières (création client-side)
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          try {
            // Header with Exclusions column
            const data = [
              ['Filière', 'Session', 'Département', 'Exclusions']
            ];

            // Build exclusions map from StateManager.state.filiereExclusions if present
            const exMap = {};
            try {
              const rawEx = Array.isArray(StateManager.state?.filiereExclusions) ? StateManager.state.filiereExclusions : [];
              rawEx.forEach(p => {
                if (!Array.isArray(p) || p.length < 2) return;
                const a = String(p[0] || '').trim();
                const b = String(p[1] || '').trim();
                if (!a || !b) return;
                exMap[a] = exMap[a] || new Set();
                exMap[a].add(b);
                // keep symmetric for user convenience
                exMap[b] = exMap[b] || new Set();
                exMap[b].add(a);
              });
            } catch (e) {
              // ignore mapping errors
            }

            // Fill rows from existing filieres if present
            const filieres = Array.isArray(StateManager.state?.filieres) ? StateManager.state.filieres : [];
            if (filieres.length > 0) {
              filieres.forEach(f => {
                const nom = f?.nom || '';
                const session = f?.session || '';
                const departement = f?.departement || '';
                const excludesSet = exMap[nom] || new Set();
                const excludes = Array.from(excludesSet).join(', ');
                data.push([nom, session, departement, excludes]);
              });
            } else {
              // example row if none exist
              data.push(['S5P', 'Automne', 'Département de Physique', 'GTR, GLR']);
            }

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Filieres');
            XLSX.writeFile(workbook, 'template_filieres.xlsx');
            NotificationManager.success('Template filières téléchargé');
          } catch (err) {
            LogService.error('Erreur téléchargement template filières: ' + (err && err.message ? err.message : String(err)));
            DialogManager.error('Impossible de générer le template filières');
          }
        });
      }

      // Attacher le bouton d'export de l'emploi du temps examens s'il existe
      try {
        const btnExamExport = document.getElementById('btnExportExamTimetablePDF');
        if (btnExamExport && !btnExamExport._attachedExamExport) {
          btnExamExport.addEventListener('click', () => {
            SpinnerManager.show();
            this.exportExamTimetablePDF().finally(() => SpinnerManager.hide());
          });
          btnExamExport._attachedExamExport = true;
        }
      } catch (e) { /* noop */ }
    } catch (e) {
      console.warn('ExportHandlers.init failed', e);
    }
  }

  async exportPDF() {
    const options = this.getPDFExportOptions();
    SpinnerManager.show();
    try {
      const success = await ExportService.exportToPDF(options);
      SpinnerManager.hide();
      if (success) {
        LogService.success('✅ Export PDF réussi');
        NotificationManager.success('PDF exporté avec succès');
      } else {
        LogService.error('❌ Échec de l\'export PDF');
        NotificationManager.error('Erreur lors de l\'export PDF');
      }
    } catch (error) {
      SpinnerManager.hide();
      LogService.error(`❌ Erreur export PDF : ${error.message}`);
      DialogManager.error(`Erreur : ${error.message}`);
    }
  }

  async exportExcel() {
    const options = this.getExcelExportOptions();
    SpinnerManager.show();
    try {
      const success = await ExportService.exportToExcel(options);
      SpinnerManager.hide();
      if (success) {
        LogService.success('✅ Export Excel réussi');
        NotificationManager.success('Excel exporté avec succès');
      } else {
        LogService.error('❌ Échec de l\'export Excel');
        NotificationManager.error('Erreur lors de l\'export Excel');
      }
    } catch (error) {
      SpinnerManager.hide();
      LogService.error(`❌ Erreur export Excel : ${error.message}`);
      DialogManager.error(`Erreur : ${error.message}`);
    }
  }

  async exportVolumes() {
    SpinnerManager.show();
    try {
      const success = await ExportService.exportVolumesToExcel();
      SpinnerManager.hide();
      if (success) {
        LogService.success('✅ Export volumes réussi');
        NotificationManager.success('Volumes exportés avec succès');
      } else {
        LogService.error('❌ Échec de l\'export volumes');
        NotificationManager.error('Erreur lors de l\'export');
      }
    } catch (error) {
      SpinnerManager.hide();
      LogService.error(`❌ Erreur export volumes : ${error.message}`);
      DialogManager.error(`Erreur : ${error.message}`);
    }
  }

  getPDFExportOptions() {
    const currentFilter = TableRenderer.currentFilter;
    return {
      filter: currentFilter,
      orientation: document.getElementById('pdfOrientation')?.value || 'landscape',
      includeHeader: document.getElementById('pdfIncludeHeader')?.checked ?? true,
      includeStats: document.getElementById('pdfIncludeStats')?.checked ?? false
    };
  }

  getExcelExportOptions() {
    const currentFilter = TableRenderer.currentFilter;
    return {
      filter: currentFilter,
      includeStats: document.getElementById('excelIncludeStats')?.checked ?? true
    };
  }

  showPDFExportDialog() {
    const html = `
            <form class="export-options" aria-label="Options d'export PDF">
              <fieldset>
                <legend>Options d'export PDF</legend>

                <div class="form-group">
                  <input type="checkbox" id="pdfIncludeHeader" name="pdfIncludeHeader" checked>
                  <label for="pdfIncludeHeader">Inclure l'en-tête (année, session, département)</label>
                </div>

                <div class="form-group">
                  <input type="checkbox" id="pdfIncludeStats" name="pdfIncludeStats">
                  <label for="pdfIncludeStats">Inclure les statistiques</label>
                </div>

                <div class="form-group">
                  <label for="pdfOrientation">Orientation :</label>
                  <select id="pdfOrientation" name="pdfOrientation">
                    <option value="landscape">Paysage (recommandé)</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
              </fieldset>
            </form>
        `;
    DialogManager.confirm(
      'Options d\'Export PDF',
      html,
      () => { this.exportPDF(); },
      () => { /* no-op */ }
    );
  }

  showExcelExportDialog() {
    const html = `
            <div class="export-options">
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="excelIncludeStats" checked>
                        Inclure une feuille de statistiques
                    </label>
                </div>
            </div>
        `;
    DialogManager.show({
      title: 'Options d\'Export Excel',
      htmlMessage: html,
      confirmText: 'Exporter',
      cancelText: 'Annuler',
      onConfirm: () => { this.exportExcel(); }
    });
  }

  async exportTeachersSchedules() {
    const enseignants = StateManager.state.enseignants || [];
    if (enseignants.length === 0) {
      DialogManager.error('Aucun enseignant enregistré.');
      return;
    }

    DialogManager.confirm(
      'Export des Emplois du Temps des Enseignants',
      `Voulez-vous exporter les emplois du temps de <strong>${enseignants.length} enseignant(s)</strong> en PDF ?<br><br>
        Chaque enseignant aura une page dédiée avec :<br>
        - Son emploi du temps hebdomadaire<br>
        - Un tableau récapitulatif de ses interventions<br>
        - La liste de ses co-intervenants par matière<br><br>
        <em>Cette opération peut prendre quelques secondes...</em>`,
      async () => {
        SpinnerManager.show();
        try {
          const success = await ExportService.exportTeachersSchedulesToPDF();
          SpinnerManager.hide();
          if (!success) DialogManager.error('Erreur lors de l\'export PDF.');
        } catch (error) {
          SpinnerManager.hide();
          LogService.error(`❌ Erreur : ${error.message}`);
          DialogManager.error(`Erreur : ${error.message}`);
        }
      }
    );
  }

  /**
   * Exporte l'emploi du temps des examens (mise en forme fidèle au rendu)
   * Méthode : clone de la tab-pane contenant #examTimetableContainer, capture via html2canvas,
   * puis pagination et ajout à jsPDF via addImage.
   */
  async exportExamTimetablePDF() {
    try {
      const container = document.getElementById('examTimetableContainer');
      if (!container) {
        NotificationManager.error('Conteneur de l\'emploi du temps des examens introuvable.');
        return false;
      }

      // clone nearest tab-pane so .active selectors apply
      const tabPane = container.closest('.tab-pane') || container;
      const clonePane = tabPane.cloneNode(true);
      clonePane.classList.add('active');

      // find clone container
      const cloneContainer = clonePane.querySelector('#' + container.id) || clonePane;

      // prepare offscreen wrapper
      const wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '-10000px';
      wrapper.style.top = '0';
      wrapper.style.width = '1200px';
      wrapper.style.background = window.getComputedStyle(container).backgroundColor || '#fff';
      wrapper.appendChild(clonePane);
      document.body.appendChild(wrapper);

      // load html2canvas if needed
      let html2canvasFn = window.html2canvas || window.html2canvas;
      if (typeof html2canvasFn !== 'function') {
        try {
          // try popular CDN
          await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        } catch (e) {
          try {
            await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
          } catch (e2) {
            // continue and error later
          }
        }
        // after import, function should be available globally
        html2canvasFn = window.html2canvas || window.html2canvas || window.html2canvas;
      }
      if (typeof html2canvasFn !== 'function' && typeof window.html2canvas !== 'function' && typeof window.html2canvas !== 'function') {
        // html2canvas sometimes exposes global as html2canvas
        html2canvasFn = window.html2canvas || window.html2canvas || (window && window['html2canvas']);
      }
      if (typeof html2canvasFn !== 'function') {
        // As a last attempt, try the global html2canvas variable (common)
        html2canvasFn = window.html2canvas || window['html2canvas'] || null;
      }

      if (typeof html2canvasFn !== 'function') {
        NotificationManager.error('html2canvas introuvable, impossible d\'exporter fidèlement le rendu.');
        try { document.body.removeChild(wrapper); } catch (e) { /* noop */ }
        return false;
      }

      // small delay to let fonts/styles compute
      await new Promise(r => setTimeout(r, 80));

      const canvas = await html2canvasFn(cloneContainer, {
        scale: Math.min(2, window.devicePixelRatio || 1),
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      // load jsPDF
      let jsPDFCtor = null;
      try {
        if (window.jspdf && window.jspdf.jsPDF) jsPDFCtor = window.jspdf.jsPDF;
        else if (typeof window.jsPDF === 'function') jsPDFCtor = window.jsPDF;
      } catch (e) { /* noop */ }

      if (!jsPDFCtor) {
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
          jsPDFCtor = mod && mod.jsPDF ? mod.jsPDF : (mod.default && mod.default.jsPDF ? mod.default.jsPDF : null);
        } catch (e) { /* noop */ }
      }

      if (!jsPDFCtor) {
        NotificationManager.error('Bibliothèque jsPDF introuvable pour l\'export PDF.');
        try { document.body.removeChild(wrapper); } catch (e) { /* noop */ }
        return false;
      }

      const doc = new jsPDFCtor('l', 'pt', 'a4');
      const pdfPageWidth = doc.internal.pageSize.getWidth();
      const pdfPageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const usablePdfWidth = pdfPageWidth - margin * 2;

      const imgDataUrl = canvas.toDataURL('image/png');
      const imgWidthPx = canvas.width;
      const imgHeightPx = canvas.height;

      const scale = usablePdfWidth / imgWidthPx;
      const imgDisplayHeightPt = imgHeightPx * scale;

      if (imgDisplayHeightPt <= (pdfPageHeight - margin * 2)) {
        doc.addImage(imgDataUrl, 'PNG', margin, margin, usablePdfWidth, imgDisplayHeightPt);
      } else {
        const pxPerPage = Math.floor((pdfPageHeight - margin * 2) / scale);
        let renderedHeight = 0;
        while (renderedHeight < imgHeightPx) {
          const h = Math.min(pxPerPage, imgHeightPx - renderedHeight);
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = imgWidthPx;
          tmpCanvas.height = h;
          const ctx = tmpCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, renderedHeight, imgWidthPx, h, 0, 0, imgWidthPx, h);
          const tmpDataUrl = tmpCanvas.toDataURL('image/png');
          const tmpDisplayHeightPt = h * scale;
          if (renderedHeight > 0) doc.addPage();
          doc.addImage(tmpDataUrl, 'PNG', margin, margin, usablePdfWidth, tmpDisplayHeightPt);
          renderedHeight += h;
        }
      }

      const filename = `emploi_du_temps_examens_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      NotificationManager.success('Export PDF examen réussi', 2000);

      try { document.body.removeChild(wrapper); } catch (e) { /* noop */ }
      return true;
    } catch (err) {
      LogService.error('exportExamTimetablePDF failed: ' + (err && err.message ? err.message : String(err)));
      console.error('exportExamTimetablePDF error', err);
      NotificationManager.error('Erreur lors de l\'export PDF des examens');
      return false;
    }
  }
}

export default new ExportHandlers();