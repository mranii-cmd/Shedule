// EDT events renderer — enhanced card fields + improved details modal
// Expose:
//  - window.renderEventsAsEdt(container, events, opts)
//  - window.loadAndRenderEvents(container, opts)
//
// It now displays: title, subtitle (e.g. filiere/section if present), description,
// start_date + time (or "Journée entière"), end_time, location, type, creator (avatar initial).

(function () {
  function esc(s){ return String(s===null||s===undefined?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  function formatDateParts(dStr){
    if(!dStr) return {day:'--', month:'--', iso:''};
    var d = new Date(dStr);
    if (isNaN(d.getTime())) {
      var m = dStr && dStr.match && dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(m) d = new Date(m[1], parseInt(m[2],10)-1, m[3]);
    }
    if (isNaN(d.getTime())) return {day:'--', month:'--', iso: dStr};
    var day = String(d.getDate()).padStart(2,'0');
    var month = d.toLocaleString('default',{month:'short'}).toUpperCase();
    var iso = d.toISOString().slice(0,10);
    return {day, month, iso};
  }

  function timeRange(event){
    if(event.all_day || event.all_day === 1 || event.all_day === true) return 'Journée entière';
    var s = event.start_time || event.start || '';
    var e = event.end_time || event.end || '';
    if(s && e) return s + ' → ' + e;
    if(s) return s;
    return '';
  }

  function creatorInitials(name){
    if(!name) return 'U';
    var parts = String(name).trim().split(/\s+/);
    return (parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '');
  }

  function createCard(event){
    var parts = formatDateParts(event.start_date || event.date || '');
    var title = esc(event.title || event.name || 'Sans titre');
    var subtitle = esc(event.sub || event.filiere || event.section || '');
    var desc = esc(event.description || '');
    var createdBy = (event.created_by_name || event.created_by || (event.created && event.created.username)) || '';
    var typeRaw = (event.type || event.event_type || '') + '';
    var typeKey = typeRaw.toLowerCase();
    var location = esc(event.location || (event.meta && event.meta.location) || '');
    var id = esc(event.id || '');

    var card = document.createElement('article');
    card.className = 'edt-event-card';
    card.setAttribute('data-event-id', id);

    // date column
    var dateCol = document.createElement('div');
    dateCol.className = 'edt-event-date';
    dateCol.innerHTML = '<div class="edt-day">'+esc(parts.day)+'</div><div class="edt-month">'+esc(parts.month)+'</div>';

    // main
    var main = document.createElement('div');
    main.className = 'edt-event-main';

    var titleRow = document.createElement('div');
    titleRow.className = 'edt-event-title';

    var titleEl = document.createElement('div');
    titleEl.innerHTML = title;

    var rightHead = document.createElement('div');
    rightHead.style.display = 'flex';
    rightHead.style.gap = '8px';
    rightHead.style.alignItems = 'center';

    // time chip
    var timeChip = document.createElement('div');
    timeChip.className = 'edt-time';
    timeChip.textContent = timeRange(event);
    if(timeChip.textContent) rightHead.appendChild(timeChip);

    // type tag
    if(typeRaw){
      var t = document.createElement('span');
      var key = (typeKey.indexOf('cours')!==-1? 'cours' : typeKey.indexOf('td')!==-1? 'td' : typeKey.indexOf('tp')!==-1? 'tp' : 'other');
      t.className = 'edt-type ' + key;
      t.textContent = (typeRaw||'').toUpperCase();
      rightHead.appendChild(t);
    }

    titleRow.appendChild(titleEl);
    titleRow.appendChild(rightHead);

    main.appendChild(titleRow);

    if(subtitle){
      var subEl = document.createElement('div');
      subEl.className = 'edt-event-sub';
      subEl.textContent = subtitle;
      main.appendChild(subEl);
    }

    if(desc){
      var descEl = document.createElement('div');
      descEl.className = 'edt-event-desc';
      descEl.innerHTML = desc;
      main.appendChild(descEl);
    }

    // meta row
    var metaRow = document.createElement('div');
    metaRow.className = 'edt-event-meta';

    // creator
    var creator = document.createElement('span');
    creator.className = 'edt-creator';
    var avatar = document.createElement('span');
    avatar.className = 'edt-avatar';
    avatar.textContent = esc(creatorInitials(createdBy)).toUpperCase();
    var cName = document.createElement('span');
    cName.textContent = createdBy || '—';
    creator.appendChild(avatar);
    creator.appendChild(cName);
    metaRow.appendChild(creator);

    if(location){
      var loc = document.createElement('span');
      loc.className = 'edt-badge';
      loc.textContent = location;
      metaRow.appendChild(loc);
    }

    // meta JSON keys (if any) -> add small badges for useful keys
    if(event.meta && typeof event.meta === 'object'){
      Object.keys(event.meta).slice(0,3).forEach(function(k){
        try {
          var v = event.meta[k];
          var b = document.createElement('span');
          b.className = 'edt-badge';
          b.textContent = k + ': ' + (typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v));
          metaRow.appendChild(b);
        }catch(e){}
      });
    }

    main.appendChild(metaRow);

    // actions
    var actions = document.createElement('div');
    actions.className = 'edt-actions';
    var btnView = document.createElement('button');
    btnView.className = 'edt-action-btn';
    btnView.title = 'Détails';
    btnView.innerHTML = '🔍';
    btnView.addEventListener('click', function(e){
      e.stopPropagation();
      showEventDetailsModal(event);
    });

    var btnEdit = document.createElement('button');
    btnEdit.className = 'edt-action-btn';
    btnEdit.title = 'Modifier';
    btnEdit.innerHTML = '✏️';
    btnEdit.addEventListener('click', function(e){
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('edt:eventEdit', { detail: event }));
    });

    var btnDelete = document.createElement('button');
    btnDelete.className = 'edt-action-btn';
    btnDelete.title = 'Supprimer';
    btnDelete.innerHTML = '🗑️';
    btnDelete.addEventListener('click', function(e){
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('edt:eventDelete', { detail: event }));
    });

    actions.appendChild(btnView);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    card.appendChild(dateCol);
    card.appendChild(main);
    card.appendChild(actions);

    // click opens details
    card.addEventListener('click', function(){ showEventDetailsModal(event); });

    return card;
  }

  function showEventDetailsModal(event){
    var modal = document.getElementById('dialogModal');
    if(!modal){
      alert((event.title || 'Détails') + '\n\n' + (event.description || ''));
      return;
    }
    try {
      var titleEl = modal.querySelector('#dialogTitle');
      var bodyEl = modal.querySelector('#dialogBody');
      if(titleEl) titleEl.textContent = event.title || 'Détails';
      if(bodyEl){
        var when = '';
        if(event.start_date) when += 'Date: ' + esc(event.start_date);
        if(event.start_time) when += ' — ' + esc(event.start_time);
        if(event.end_time) when += ' à ' + esc(event.end_time);
        var where = event.location ? ('Lieu: ' + esc(event.location)) : '';
        var createdBy = event.created_by_name || event.created_by || (event.created && event.created.username) || '';
        var meta = event.meta ? ('<pre style="white-space:pre-wrap;margin:6px 0;padding:8px;background:#f8f9fa;border-radius:6px;border:1px solid #eef2f6;">' + esc(JSON.stringify(event.meta, null, 2)) + '</pre>') : '';
        var html = '<div style="font-size:14px;color:#111827;line-height:1.5;">' +
          (when?('<p><strong>'+when+'</strong></p>'):'') +
          (where?('<p>'+where+'</p>'):'') +
          (createdBy?('<p style="font-size:13px;color:#475569;">Créé par: '+esc(createdBy)+'</p>'):'') +
          '<p style="margin-top:8px;color:#334155;">'+esc(event.description || '')+'</p>' +
          meta +
          '</div>';
        bodyEl.innerHTML = html;
      }
      modal.style.display = 'flex';
    } catch (err){
      console.error('showEventDetailsModal', err);
      alert((event.title || 'Détails') + '\n\n' + (event.description || ''));
    }
  }

  function renderEventsAsEdt(containerSelector, events, opts){
    opts = opts || {};
    var container = (typeof containerSelector === 'string') ? document.querySelector(containerSelector) : containerSelector;
    if(!container) { console.warn('renderEventsAsEdt: container not found', containerSelector); return; }
    container.innerHTML = '';
    container.classList.add('edt-events-root');
    if(!events || events.length === 0){
      var emp = document.createElement('div');
      emp.className = 'edt-empty';
      emp.textContent = opts.emptyMessage || 'Aucun événement trouvé.';
      container.appendChild(emp);
      return;
    }
    if(opts.sortByDate !== false){
      events = events.slice().sort(function(a,b){
        var da = a.start_date || a.date || '';
        var db = b.start_date || b.date || '';
        return (da < db ? -1 : da > db ? 1 : 0);
      });
    }
    events.forEach(function(ev){
      try { container.appendChild(createCard(ev)); } catch (e){ console.error('render event failed', e, ev); }
    });
  }

  async function loadAndRenderEvents(containerSelector, opts){
    opts = opts || {};
    var apiUrl = opts.apiUrl || '/api/events';
    var headers = opts.headers || {};
    try {
      var token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      if(token) headers['Authorization'] = 'Bearer ' + token;
    } catch(e){ }
    var res;
    try {
      res = await fetch(apiUrl, { method: 'GET', headers: headers });
    } catch (err){
      console.error('loadAndRenderEvents fetch failed', err);
      var c = document.querySelector(containerSelector);
      if(c) c.innerHTML = '<div class="edt-empty">Erreur réseau lors de la récupération des événements.</div>';
      return;
    }
    if(!res.ok){
      var c2 = document.querySelector(containerSelector);
      if(c2) c2.innerHTML = '<div class="edt-empty">Erreur serveur: ' + res.status + '</div>';
      return;
    }
    var data;
    try { data = await res.json(); } catch(e){ data = null; }
    var events = Array.isArray(data) ? data : (Array.isArray(data && data.data) ? data.data : []);
    renderEventsAsEdt(containerSelector, events, opts);
    return events;
  }

  window.renderEventsAsEdt = renderEventsAsEdt;
  window.loadAndRenderEvents = loadAndRenderEvents;

  document.addEventListener('DOMContentLoaded', function(){
    try {
      var autoContainers = document.querySelectorAll('[data-edt-auto="events"]');
      autoContainers.forEach(function(c){
        var api = c.getAttribute('data-edt-api') || '/api/events';
        loadAndRenderEvents(c, { apiUrl: api });
      });
    } catch(e){ }
  });

})();