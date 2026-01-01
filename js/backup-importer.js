// backup-importer.js - Attache/renomme le bouton "Importer Projet" (dans l'onglet Rapports&Exports)
// et lui associe un picker pour importer un backup JSON.
// Place <script src="./js/backup-importer.js"></script> juste avant </body>.

(function () {
  if (window.__backup_importer_loaded__) return;
  window.__backup_importer_loaded__ = true;

  // Création d'un input file caché (idempotent)
  function ensureUploader() {
    var up = document.getElementById('backup-file-uploader');
    if (up) return up;
    up = document.createElement('input');
    up.type = 'file';
    up.accept = '.json,application/json';
    // éviter display:none problématique sur certains navigateurs -> utiliser off-screen
    up.style.position = 'absolute';
    up.style.left = '-9999px';
    up.style.width = '1px';
    up.style.height = '1px';
    up.id = 'backup-file-uploader';
    document.body.appendChild(up);
    up.addEventListener('change', async function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        var parsed = JSON.parse(text);
        restoreFromParsed(parsed);
      } catch (err) {
        alert('Erreur lecture/parse du fichier : ' + (err && err.message));
        console.error(err);
      } finally {
        up.value = '';
      }
    });
    return up;
  }

  function restoreFromParsed(parsed) {
    var state = parsed && parsed.state ? parsed.state : parsed;
    if (!state) {
      alert('Fichier invalide : pas de champ "state".');
      return;
    }
  if (!confirm('Restaurer ce backup écrasera l\'état courant. Continuer ?')) return;
    try {
      if (window.StateManager && typeof window.StateManager.state !== 'undefined') {
        // push undo snapshot before applying the imported backup
        try { if (typeof window.StateManager.pushUndoState === 'function') window.StateManager.pushUndoState('restore backup (imported file)'); } catch (e) { console.debug('pushUndoState restore failed', e); }

        window.StateManager.state = state;
        try { if (typeof window.StateManager._hydrateState === 'function') window.StateManager._hydrateState(); } catch (e) { console.warn(e); }
        try { if (typeof window.StateManager.saveState === 'function') window.StateManager.saveState(); } catch (e) { console.warn(e); }
        alert('Backup restauré via StateManager. Rafraîchis si nécessaire.');
      } else {
        localStorage.setItem('project_state', JSON.stringify(state));
        alert('Backup écrit dans localStorage ("project_state"). Rafraîchis la page pour appliquer.');
      }
    } catch (e) {
      console.error('Restore failed', e);
      alert('Erreur lors de la restauration : ' + (e && e.message));
    }
  }

  // Normalise le texte d'un élément (trim, lowercase, espace insécable -> espace)
  function normText(s) {
    if (!s) return '';
    return s.replace(/\u00A0/g, ' ').trim().toLowerCase();
  }

  // Détecte un bouton cible ("Importer Projet", "Exporter Projet", variantes) et l'attache (rename + handler)
  function attachToImporterProjet(btn) {
    if (!btn || btn.__backup_importer_attached) return false;
    try {
      // renommer le bouton en "Importer backup"
      try { btn.textContent = 'Importer backup'; } catch (e) { /* ignore */ }

      // MARQUAGE : indiquer à panexam.js (listener délégué) d'ignorer ce bouton
      try {
        btn.dataset.backupImport = 'true';
        btn.classList.add('backup-importer');
      } catch (e) { /* ignore */ }

      // donner un id stable
      if (!btn.id) btn.id = 'backup-import-btn';
      // handler : ouvre le file picker (synchronique dans le handler utilisateur)
      var uploader = ensureUploader();
      btn.addEventListener('click', function (e) {
        // Empêche comportement d'origine (export) s'il existe
        e.stopPropagation && e.stopPropagation();
        e.preventDefault && e.preventDefault();
        uploader.click();
      }, { once: false });
      // Insérer aussi un bouton "Créer Backup" à côté pour ouvrir la nouvelle modale
      try {
        // createCreateBackupButton est hoistée plus bas dans ce fichier
        if (typeof createCreateBackupButton === 'function') {
          try { createCreateBackupButton(btn); } catch (e) { /* noop */ }
        }
      } catch (e) { /* noop */ }
      btn.__backup_importer_attached = true;
      console.log('backup-importer: bouton attaché ->', btn);
      return true;
    } catch (err) {
      console.warn('backup-importer: attach failed', err);
      return false;
    }
  }

  // Recherche de bouton candidate par texte (exact ou partiel)
  function findImporterButton(root) {
    root = root || document;
    var buttons = Array.from(root.querySelectorAll('button,a[role="button"],input[type="button"]'));
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var t = normText(b.textContent || b.value || '');
      if (!t) continue;
      // Priorité : "importer projet" exact ou variantes (y compris faute de frappe légère)
      if (t === 'importer projet' || t.indexOf('importer projet') !== -1 || (t.indexOf('importer') !== -1 && t.indexOf('projet') !== -1)) return b;
      // Fallbacks : "exporter projet" aussi pris en charge (si le bouton est export)
      if (t === 'exporter projet' || t.indexOf('exporter projet') !== -1 || (t.indexOf('exporter') !== -1 && t.indexOf('projet') !== -1)) return b;
      // Anglais fallback
      if (t.indexOf('import') !== -1 && t.indexOf('project') !== -1) return b;
      if (t.indexOf('export') !== -1 && t.indexOf('project') !== -1) return b;
      // Tolerance pour fautes de frappe commune (ex: "impoorter projte")
      if (t.replace(/[^a-z]/g, '').indexOf('importerprojet') !== -1 || t.replace(/[^a-z]/g, '').indexOf('exporterprojet') !== -1) return b;
    }
    return null;
  }

  // Essaye d'attacher au bouton déjà présent
  function tryAttachNow() {
    var btn = document.getElementById('backup-import-btn') || findImporterButton(document);
    if (btn) return attachToImporterProjet(btn);
    return false;
  }
  // Crée un nouveau bouton "Importer backup" indépendant si l'ancien flux est intrusif
  function createImportBackupButton(referenceEl) {
    try {
      if (document.getElementById('btnImportBackup')) return document.getElementById('btnImportBackup');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btnImportBackup';
      btn.className = 'btn btn-primary backup-importer';
      btn.textContent = 'Importer backup';
      btn.setAttribute('aria-label', 'Importer un backup JSON');
      try { btn.dataset.backupImport = 'true'; } catch (e) { }

      // attacher handler synchrone -> ouvre le picker
      var uploader = ensureUploader();
      btn.addEventListener('click', function (e) {
        e && e.preventDefault && e.preventDefault();
        e && e.stopPropagation && e.stopPropagation();
        // ouvre le file picker synchronement (geste utilisateur)
        uploader.click();
      }, false);

      // Insérer le bouton après la référence si fournie, sinon en haut du body
      if (referenceEl && referenceEl.parentNode) {
        referenceEl.parentNode.insertBefore(btn, referenceEl.nextSibling);
      } else {
        // essayer d'insérer dans un container logique
        var container = document.querySelector('.actions, .toolbar, .panel-actions') || document.body;
        container.insertBefore(btn, container.firstChild);
      }
      console.log('backup-importer: bouton indépendant créé ->', btn);
      return btn;
    } catch (err) {
      console.warn('backup-importer: createImportBackupButton failed', err);
      return null;
    }
  }
  // Crée un bouton "Créer Backup" qui ouvre la modale de création de backup (ou fallback)
  function createCreateBackupButton(referenceEl) {
    try {
      if (document.getElementById('btnCreateBackup')) return document.getElementById('btnCreateBackup');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btnCreateBackup';
      btn.className = 'btn btn-secondary backup-create';
      btn.textContent = 'Créer Backup';
      btn.setAttribute('aria-label', 'Créer un backup');
      try { btn.dataset.backupCreate = 'true'; } catch (e) { }

      // Handler : tenter d'ouvrir la modale existante, sinon fallback (dispatch event puis export state)
      btn.addEventListener('click', function (e) {
        e && e.preventDefault && e.preventDefault();
        e && e.stopImmediatePropagation && e.stopImmediatePropagation();
        e && e.stopPropagation && e.stopPropagation();

        // 1) tenter les APIs/handlers connus
        try {
          if (typeof window.openBackupModal === 'function') { window.openBackupModal(); return; }
          if (typeof window.openCreateBackupModal === 'function') { window.openCreateBackupModal(); return; }
          if (window.BackupService && typeof window.BackupService.openCreateModal === 'function') { window.BackupService.openCreateModal(); return; }
        } catch (err) { console.warn('createCreateBackupButton: known handler call failed', err); }

        // 2) dispatch d'un événement custom pour que d'autres scripts interceptent
        try {
          var dispatched = window.dispatchEvent(new CustomEvent('backup:create-requested', { bubbles: true, cancelable: true, detail: {} }));
          if (dispatched) return;
        } catch (evErr) { console.warn('createCreateBackupButton: dispatch failed', evErr); }

        // 3) fallback : générer un backup simple et déclencher son téléchargement
        try {
          var state = null;
          if (window.StateManager && typeof window.StateManager.state !== 'undefined') {
            state = window.StateManager.state;
          } else {
            try { state = JSON.parse(localStorage.getItem('project_state') || '{}'); } catch (e) { state = null; }
          }
          if (!state || typeof state !== 'object') {
            alert('Impossible de récupérer l\'état pour créer un backup automatiquement.');
            return;
          }
          var blob = new Blob([JSON.stringify({ state: state }, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error('createCreateBackupButton fallback failed', e);
          alert('Aucune modal disponible et la création automatique du backup a échoué: ' + (e && e.message));
        }
      }, false);

      // Insérer le bouton après la référence si fournie, sinon en haut du body ou container logique
      if (referenceEl && referenceEl.parentNode) {
        referenceEl.parentNode.insertBefore(btn, referenceEl.nextSibling);
      } else {
        var container = document.querySelector('.actions, .toolbar, .panel-actions') || document.body;
        container.insertBefore(btn, container.firstChild);
      }
      console.log('backup-importer: bouton Créer Backup créé ->', btn);
      return btn;
    } catch (err) {
      console.warn('backup-importer: createCreateBackupButton failed', err);
      return null;
    }
  }
  // Observer : surveille l'onglet Rapports&Exports et insert dès que le bouton est rendu
  var mo = new MutationObserver(function (muts) {
    try {
      // si bouton déjà attaché, on peut ignorer
      if (document.getElementById('backup-import-btn') && document.getElementById('backup-file-uploader')) return;
      for (var mi = 0; mi < muts.length; mi++) {
        var m = muts[mi];
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var node = m.addedNodes[j];
            if (node.nodeType !== 1) continue;
            var txt = normText(node.textContent || '');
            // ciblage des zones contenant "rapport" ou "export"
            if (/rapport|export|report/i.test(txt) || /report|export/i.test(node.className || '')) {
              var candidate = findImporterButton(node);
              if (candidate) {
                if (attachToImporterProjet(candidate)) return;
              }
            }
            // sinon scan large
            var candidate2 = findImporterButton(node);
            if (candidate2) {
              if (attachToImporterProjet(candidate2)) return;
            }
          }
        }
      }
    } catch (e) { console.warn('backup-importer observer error', e); }
  });

  try {
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    console.warn('backup-importer: cannot observe document.body', e);
  }

  // essais initiaux différés (pour apps qui construisent le DOM progressivement)
  setTimeout(tryAttachNow, 200);
  setTimeout(tryAttachNow, 800);
  setTimeout(tryAttachNow, 2000);
  // créer aussi un bouton indépendant si l'ancien gestionnaire continue d'interférer
  setTimeout(function () {
    // si aucun bouton attaché par nous n'existe encore, tenter de créer un bouton indépendant
    if (!document.getElementById('backup-import-btn') && !document.getElementById('btnImportBackup')) {
      var ref = document.getElementById('btnExportPDF') || document.querySelector('#btnExportExamTimetablePDF') || null;
      createImportBackupButton(ref);
      // créer aussi le bouton "Créer Backup" à côté de l'import
      createCreateBackupButton(ref);
    } else {
      // si l'import existe déjà, s'assurer qu'un bouton "Créer Backup" est présent aussi
      var ref2 = document.getElementById('backup-import-btn') || document.getElementById('btnImportBackup') || document.getElementById('btnExportPDF');
      if (ref2 && !document.getElementById('btnCreateBackup')) createCreateBackupButton(ref2);
    }
  }, 500);
  // expose utilitaires pour debug / forçage manuel
  window.__backup_importer = {
    tryAttachNow: tryAttachNow,
    attachToImporterProjet: attachToImporterProjet,
    ensureUploader: ensureUploader
  };

  console.log('backup-importer initialisé: observation active (Rapports&Exports).');
})();