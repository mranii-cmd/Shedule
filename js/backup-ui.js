// backup-ui.js - Backup UI avec attachement automatique au bouton "Exporter Projet"
// Remplace le fichier existant par celui-ci.

(function(){
  if(window.__backup_ui_installed__) return;
  window.__backup_ui_installed__ = true;

  // --- UI core (modal + bouton injection si besoin) ---
  function findHeader(){ var selectors = ['header','.app-header','#header','.topbar','.navbar']; for(var i=0;i<selectors.length;i++){ var e=document.querySelector(selectors[i]); if(e) return e; } return null; }

  // Create internal UI button only if no existing button is attached
  function createInjectedButton(){
    if(document.getElementById('backup-ui-btn') || document.getElementById('backup-ui-btn-injected')) return null;
    var btn = document.createElement('button');
    btn.id = 'backup-ui-btn-injected';
    btn.innerText = 'Backups';
    btn.style.padding = '6px 10px';
    btn.style.marginLeft = '8px';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '4px';
    btn.style.border = '1px solid #ddd';
    btn.style.background = '#fff';
    var header = findHeader();
    try{ if(header) header.appendChild(btn); else document.body.appendChild(btn); }catch(e){ document.body.appendChild(btn); }
    return btn;
  }

  // Modal implementation (same as before, idempotent)
  function openModal(){
    var existing = document.getElementById('backup-ui-modal'); if(existing){ existing.style.display='flex'; return; }
    var modal = document.createElement('div'); modal.id = 'backup-ui-modal';
    modal.style.position='fixed'; modal.style.left='0'; modal.style.top='0'; modal.style.right='0'; modal.style.bottom='0'; modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.background='rgba(0,0,0,0.45)'; modal.style.zIndex=2147483646;
    var inner = document.createElement('div'); inner.style.width='760px'; inner.style.maxWidth='96%'; inner.style.background='#fff'; inner.style.borderRadius='8px'; inner.style.padding='14px'; inner.style.boxShadow='0 8px 30px rgba(0,0,0,0.25)'; inner.style.maxHeight='80vh'; inner.style.overflow='auto';
    inner.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Backups</strong><div><button id="backup-create-btn" style="margin-right:8px">Create & Download</button><button id="backup-close-btn">Close</button></div></div><div id="backup-list" style="max-height:60vh;overflow:auto;border-top:1px solid #efefef;padding-top:8px"></div>';
    modal.appendChild(inner); document.body.appendChild(modal);
    modal.querySelector('#backup-close-btn').addEventListener('click', function(){ modal.remove(); });
    modal.querySelector('#backup-create-btn').addEventListener('click', function(){
      var label = prompt('Label for this backup (optional):','');
      if(window.BackupService && typeof window.BackupService.createBackup === 'function'){
        try{ var res = window.BackupService.createBackup({ download:true, label: label||'' }); if(res && res.then) res.then(function(){ alert('Backup created'); populate(); }).catch(function(e){ alert('Backup create failed: '+(e&&e.message||e)); }); else { alert('Backup created'); populate(); } }catch(e){ alert('Backup create failed: '+(e&&e.message||e)); }
      } else alert('BackupService not available');
    });

    function populate(){
      var listDiv = modal.querySelector('#backup-list'); listDiv.innerHTML = '<div style="color:#666">Loading...</div>';
      var items = [];
      try{ if(window.BackupService && typeof window.BackupService.listBackups === 'function') items = window.BackupService.listBackups() || []; }catch(e){ items = []; console.warn(e); }
      if(!items || items.length === 0){ listDiv.innerHTML = '<div style="color:#666">No backups found.</div>'; return; }
      listDiv.innerHTML = '';
      items.forEach(function(it){
        var row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.borderBottom='1px solid #f5f5f5'; row.style.padding='10px 0';
        var meta = it.meta || {}; var left = document.createElement('div'); left.innerHTML = '<div style="font-weight:600">'+(meta.label||it.key)+'</div><div style="color:#666;font-size:12px">'+(meta.createdAt||'')+' • '+(it.size||0)+' bytes</div>';
        var right = document.createElement('div'); var dl = document.createElement('button'); dl.innerText='Download'; var r = document.createElement('button'); r.innerText='Restore'; r.style.marginLeft='8px'; var d = document.createElement('button'); d.innerText='Delete'; d.style.marginLeft='8px'; d.style.color='#b00';
        right.appendChild(dl); right.appendChild(r); right.appendChild(d); row.appendChild(left); row.appendChild(right); listDiv.appendChild(row);

        dl.addEventListener('click', function(){ if(window.BackupService) window.BackupService.downloadBackup(it.key); else alert('BackupService not available'); });
        r.addEventListener('click', function(){ if(!confirm('Restore ' + it.key + ' ? This will overwrite current project state.')) return; if(window.BackupService){ try{ window.BackupService.restoreBackup(it.key); alert('Restored (may require reload)'); }catch(e){ alert('Restore failed: '+(e&&e.message||e)); } } else alert('BackupService not available'); });
        d.addEventListener('click', function(){ if(!confirm('Delete ' + it.key + ' ?')) return; try{ window.BackupService.deleteBackup(it.key); populate(); }catch(e){ alert('Delete failed'); } });
      });
    }

    populate();
  }

  // expose
  window.openBackupModal = openModal;

  // --- Attachment logic: find existing "Exporter Projet" button or id=backup-ui-btn and attach ---
  function attachToButton(btn, renameToBackups){
    if(!btn) return false;
    if(btn.__backup_handler_attached) return true;
    // set reachable id so future code can find it
    try{ if(!btn.id) btn.id = 'backup-ui-btn'; else if(btn.id !== 'backup-ui-btn') btn.id = btn.id; }catch(e){}
    if(renameToBackups){
      try{ btn.textContent = 'Backups'; }catch(e){}
    }
    btn.addEventListener('click', function(e){
      if(typeof window.openBackupModal === 'function'){
        window.openBackupModal();
      } else {
        // fallback minimal: open a small modal if BackupService is available
        if(window.BackupService && typeof window.BackupService.listBackups === 'function'){
          // open minimal modal (same as createInjectedButton's handler)
          openModal();
        } else {
          console.warn('Backup UI not loaded yet.');
        }
      }
    });
    btn.__backup_handler_attached = true;
    return true;
  }

  // Try to find the button now
  function findAndAttachExisting(){
    // 1) by id
    var btn = document.getElementById('backup-ui-btn') || document.getElementById('backup-ui-btn-injected');
    if(btn && attachToButton(btn)) return true;

    // 2) by exact visible text "Exporter Projet" (insensible à la casse, trim)
    var byText = Array.from(document.querySelectorAll('button')).find(function(b){
      if(!b.textContent) return false;
      var t = b.textContent.trim().toLowerCase();
      return t === 'exporter projet' || t === 'exporter projet ' || t === 'exporter projet '; // some spacing variants
    });
    if(byText){
      attachToButton(byText, true); // rename to "Backups"
      return true;
    }

    // 3) by partial text "Exporter" in case label differs
    var partial = Array.from(document.querySelectorAll('button')).find(function(b){
      if(!b.textContent) return false;
      var t = b.textContent.trim().toLowerCase();
      return t.indexOf('exporter') !== -1 && t.indexOf('projet') !== -1;
    });
    if(partial){
      attachToButton(partial, true);
      return true;
    }

    return false;
  }

  // Run attachment attempts at DOMContentLoaded and after small delays
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(findAndAttachExisting, 100); setTimeout(findAndAttachExisting, 800); });
  // also try immediately (in case script loaded after DOM)
  setTimeout(findAndAttachExisting, 50);

  // MutationObserver to catch dynamic insertion (e.g. when user opens the Report & Exports tab)
  var observer = new MutationObserver(function(mutations){
    for(var i=0;i<mutations.length;i++){
      var m = mutations[i];
      if(m.addedNodes && m.addedNodes.length){
        for(var j=0;j<m.addedNodes.length;j++){
          var node = m.addedNodes[j];
          if(node.nodeType !== 1) continue;
          // if a button was added, try attach
          if(node.tagName && node.tagName.toLowerCase() === 'button'){
            if(findAndAttachExisting()) return;
          }
          // if subtree added, check inside
          var maybeBtn = node.querySelector && (node.querySelector('#backup-ui-btn') || node.querySelector('button'));
          if(maybeBtn){
            if(findAndAttachExisting()) return;
          }
        }
      }
    }
  });
  try{
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }catch(e){
    // ignore if observe fails
    console.warn('backup-ui: MutationObserver failed', e);
  }

  // As a last fallback, create a small injected button (visible) if nothing attached after a bit
  setTimeout(function(){
    if(!document.getElementById('backup-ui-btn') && !document.getElementById('backup-ui-btn-injected')){
      var injected = createInjectedButton();
      if(injected) attachToButton(injected, false);
    }
  }, 1200);

})();