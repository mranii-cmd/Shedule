// EDT events renderer (vanilla JS)
// Usage:
// 1) Include this script (defer) and src/css/edt-events.css in your index.html
// 2) Call:
//    window.loadAndRenderEvents('#examsListContainer', { apiUrl: '/api/events' });
//    or renderEventsAsEdt('#examsListContainer', eventsArray)
//
// The renderer will try to send Authorization: Bearer <token> if localStorage.token exists.

(function () {
  // helper: escape HTML
  function esc(s){ return String(s===null||s===undefined?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  // format date parts (day, month short)
  function formatDateParts(dStr){
    if(!dStr) return {day:'--', month:'--'};
    // accept 'YYYY-MM-DD' or ISO
    let d = new Date(dStr);
    if (isNaN(d.getTime())) {
      // try split YYYY-MM-DD
      const m = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(m) d = new Date(m[1], parseInt(m[2],10)-1, m[3]);
    }
    if (isNaN(d.getTime())) return {day:'--', month:'--'};
    const day = String(d.getDate()).padStart(2,'0');
    const month = d.toLocaleString('default',{month:'short'}).toUpperCase();
    return {day, month};
  }

  // create a card element for an event object
  function createCard(event){
    const parts = formatDateParts(event.start_date || event.date || event.inputDate);
    const title = esc(event.title || event.name || 'Sans titre');
    const desc = esc(event.description || event.desc || '');
    const createdBy = esc(event.created_by || (event.created && event.created.username) || '');
    const type = (event.type || event.event_type || '').toString().toLowerCase();
    const location = esc(event.location || (event.meta && event.meta.location) || '');
    const id = esc(event.id || '');

    const card = document.createElement('article');
    card.className = 'edt-event-card';
    card.setAttribute('data-event-id', id);

    const dateCol = document.createElement('div');
    dateCol.className = 'edt-event-date';
    dateCol.innerHTML = '<div class="edt-day">'+esc(parts.day)+'</div><div class="edt-month">'+esc(parts.month)+'</div>';

    const main = document.createElement('div');
    main.className = 'edt-event-main';
    const titleEl = document.createElement('div');
    titleEl.className = 'edt-event-title';
    titleEl.innerHTML = title;
    const descEl = document.createElement('div');
    descEl.className = 'edt-event-desc';
    descEl.innerHTML = desc;

    const metaRow = document.createElement('div');
    metaRow.className = 'edt-event-meta';

    const authorBadge = document.createElement('span');
    authorBadge.className = 'edt-badge';
    authorBadge.textContent = createdBy ? ('Créé par: ' + createdBy) : '—';
    metaRow.appendChild(authorBadge);

    if(location){
      const loc = document.createElement('span');
      loc.className = 'edt-badge';
      loc.textContent = location;
      metaRow.appendChild(loc);
    }

    if(type){
      const t = document.createElement('span');
      t.className = 'edt-type ' + (type.indexOf('cours')!==-1? 'cours' : type.indexOf('td')!==-1? 'td' : type.indexOf('tp')!==-1? 'tp' : '');
      t.textContent = (event.type||event.event_type||'').toUpperCase();
      metaRow.appendChild(t);
    }

    main.appendChild(titleEl);
    main.appendChild(descEl);
    main.appendChild(metaRow);

    // actions (view / edit)
    const actions = document.createElement('div');
    actions.className = 'edt-actions';
    const btnView = document.createElement('button');
    btnView.className = 'edt-action-btn';
    btnView.title = 'Détails';
    btnView.innerHTML = '🔍';
    btnView.addEventListener('click', function(e){
      e.stopPropagation();
      showEventDetailsModal(event);
    });

    const btnEdit = document.createElement('button');
    btnEdit.className = 'edt-action-btn';
    btnEdit.title = 'Modifier';
    btnEdit.innerHTML = '✏️';
    btnEdit.addEventListener('click', function(e){
      e.stopPropagation();
      // dispatch custom event for app to handle edit
      const ev = new CustomEvent('edt:eventEdit', { detail: event });
      window.dispatchEvent(ev);
    });

    const btnDelete = document.createElement('button');
    btnDelete.className = 'edt-action-btn';
    btnDelete.title = 'Supprimer';
    btnDelete.innerHTML = '🗑️';
    btnDelete.addEventListener('click', function(e){
      e.stopPropagation();
      const ev = new CustomEvent('edt:eventDelete', { detail: event });
      window.dispatchEvent(ev);
    });

    actions.appendChild(btnView);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    card.appendChild(dateCol);
    card.appendChild(main);
    card.appendChild(actions);

    // click on card -> open details
    card.addEventListener('click', function(){ showEventDetailsModal(event); });

    return card;
  }

  // show detail using existing #dialogModal (fallback to alert)
  function showEventDetailsModal(event){
    const modal = document.getElementById('dialogModal');
    if(!modal){
      alert('Event: ' + (event.title || event.name || '—') + '\n\n' + (event.description||''));
      return;
    }
    try {
      const titleEl = modal.querySelector('#dialogTitle');
      const bodyEl = modal.querySelector('#dialogBody');
      if(titleEl) titleEl.textContent = event.title || event.name || 'Détails';
      if(bodyEl){
        const when = (event.start_date? 'Date: ' + esc(event.start_date) + (event.start_time? ' ' + esc(event.start_time): '') : '');
        const where = event.location ? ('Lieu: ' + esc(event.location)) : '';
        const createdBy = event.created_by ? ('Créé par: ' + esc(event.created_by)) : '';
        const meta = event.meta ? ('Meta: ' + esc(JSON.stringify(event.meta))) : '';
        const html = '<div style="font-size:14px;color:#333;line-height:1.5;">' +
          (when?('<p><strong>'+when+'</strong></p>'):'') +
          (where?('<p>'+where+'</p>'):'') +
          '<p style="margin-top:8px;color:#555;">'+esc(event.description || '')+'</p>' +
          '<p style="margin-top:10px;font-size:13px;color:#666;">'+createdBy + (meta?('<br/>' + meta):'') + '</p>' +
          '</div>';
        bodyEl.innerHTML = html;
      }
      modal.style.display = 'flex';
    } catch (err){
      console.error('showEventDetailsModal', err);
      alert(event.title + '\n\n' + (event.description||''));
    }
  }

  // render array of events into container
  function renderEventsAsEdt(containerSelector, events, opts){
    opts = opts || {};
    const container = (typeof containerSelector === 'string') ? document.querySelector(containerSelector) : containerSelector;
    if(!container) { console.warn('renderEventsAsEdt: container not found', containerSelector); return; }
    container.innerHTML = '';
    container.classList.add('edt-events-root');
    if(!events || events.length === 0){
      const emp = document.createElement('div');
      emp.className = 'edt-empty';
      emp.textContent = opts.emptyMessage || 'Aucun événement trouvé.';
      container.appendChild(emp);
      return;
    }
    // optional sorting by date
    if(opts.sortByDate !== false){
      events = events.slice().sort(function(a,b){
        const da = a.start_date || a.date || '';
        const db = b.start_date || b.date || '';
        return (da < db ? -1 : da > db ? 1 : 0);
      });
    }
    events.forEach(function(ev){
      try { container.appendChild(createCard(ev)); } catch (e){ console.error('render event failed', e, ev); }
    });
  }

  // fetch events from API (supports Authorization via localStorage.token)
  async function loadAndRenderEvents(containerSelector, opts){
    opts = opts || {};
    const apiUrl = opts.apiUrl || '/api/events';
    const headers = opts.headers || {};
    // attach Authorization bearer if token present in localStorage
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      if(token) headers['Authorization'] = 'Bearer ' + token;
    } catch(e){ /* ignore storage errors */ }

    let res;
    try {
      res = await fetch(apiUrl, { method: 'GET', headers: headers });
    } catch (err){
      console.error('loadAndRenderEvents fetch failed', err);
      const c = document.querySelector(containerSelector);
      if(c) c.innerHTML = '<div class="edt-empty">Erreur réseau lors de la récupération des événements.</div>';
      return;
    }
    if(!res.ok){
      console.warn('loadAndRenderEvents status', res.status);
      const txt = await res.text().catch(()=>null);
      const c2 = document.querySelector(containerSelector);
      if(c2) c2.innerHTML = '<div class="edt-empty">Erreur serveur: ' + res.status + '</div>';
      return;
    }
    let data;
    try { data = await res.json(); } catch(e){ data = null; }
    // backend may return {data: [...]} or directly an array
    const events = Array.isArray(data) ? data : (Array.isArray(data && data.data) ? data.data : []);
    renderEventsAsEdt(containerSelector, events, opts);
    return events;
  }

  // Expose global helpers
  window.renderEventsAsEdt = renderEventsAsEdt;
  window.loadAndRenderEvents = loadAndRenderEvents;

  // If container has data-edt-auto="events", auto load on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function(){
    try {
      const autoContainers = document.querySelectorAll('[data-edt-auto="events"]');
      autoContainers.forEach(function(c){
        const api = c.getAttribute('data-edt-api') || '/api/events';
        loadAndRenderEvents(c, { apiUrl: api });
      });
    } catch(e){ /* noop */ }
  });

})();