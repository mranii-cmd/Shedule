/*
  edt-compat.js
  Compatibility shim for legacy inline handlers that call EDTHandlers.*.
  - Ensures window.EDTHandlers exists to avoid ReferenceError / TypeError.
  - Provides French and legacy aliases (supprimerSeance, handleDragLeave, etc.).
  - Delegates to existing application APIs when available (Planning, SessionController, SeanceController, EDT, etc.)
  - Emits custom events ('edt:delete-request', 'edt:drag-<kind>', ...) as generic fallbacks so the app can listen for them.
  - Normalizes ids passed from inline handlers (ex: " – 17") by extracting numeric id when appropriate.
  - Non-intrusive: if EDTHandlers already exists, the shim does nothing.
*/
(function () {
  if (typeof window === 'undefined') return;
  if (window.EDTHandlers) return; // keep existing implementation if present

  function tryCallObjMethod(obj, fnName, ...args) {
    try {
      if (!obj) return false;
      const fn = obj[fnName];
      if (typeof fn === 'function') {
        try { fn.apply(obj, args); return true; } catch (e) { console.warn(`EDT-compat: ${fnName} call failed`, e); return false; }
      }
      return false;
    } catch (e) { return false; }
  }

  function tryCallGlobal(fnName, ...args) {
    try {
      const fn = window[fnName];
      if (typeof fn === 'function') {
        try { fn.apply(window, args); return true; } catch (e) { console.warn(`EDT-compat global ${fnName} call failed`, e); return false; }
      }
      return false;
    } catch (e) { return false; }
  }

  // Normalize id-like values: trim and attempt to extract integer id if present.
  function normalizeId(raw) {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'string') {
      const s = raw.trim();
      // If string contains a number like "– 17" or " - 17", extract digits
      const m = s.match(/(-?\d+)/);
      if (m && m[1]) return String(m[1]);
      // otherwise return trimmed string
      return s || null;
    }
    // DOM element: try dataset ids
    if (raw && raw.nodeType === 1) {
      const el = raw;
      const dat = el.dataset || {};
      if (dat.sessionId) return String(dat.sessionId);
      if (dat.id) return String(dat.id);
      // fallback: element id attribute
      if (el.id) return String(el.id);
      // fallback to innerText trimmed (may contain "– 17")
      const txt = (el.innerText || el.textContent || '').trim();
      const m2 = txt.match(/(-?\d+)/);
      if (m2 && m2[1]) return String(m2[1]);
      return null;
    }
    try {
      // fallback to string conversion
      const s2 = String(raw).trim();
      const m3 = s2.match(/(-?\d+)/);
      if (m3 && m3[1]) return String(m3[1]);
      return s2 || null;
    } catch (e) { return null; }
  }

  function findDomElementForId(id, rawArg) {
    try {
      if (!id) return rawArg && rawArg.nodeType === 1 ? rawArg : null;
      // look for exact data attributes first
      let selectorCandidates = [
        `[data-session-id="${CSS.escape(id)}"]`,
        `[data-id="${CSS.escape(id)}"]`,
        `#${CSS.escape(id)}`
      ];
      // also look for attributes that contain the id substring (some templates use " – 17" in data attributes)
      selectorCandidates.push(`[data-session-id*="${CSS.escape(id)}"]`);
      selectorCandidates.push(`[data-id*="${CSS.escape(id)}"]`);
      for (const sel of selectorCandidates) {
        try {
          const el = document.querySelector(sel);
          if (el) return el;
        } catch (e) { /* ignore invalid selectors */ }
      }
      // fallback: find element whose textContent contains the id (careful but useful)
      const all = document.querySelectorAll('[data-session-id], [data-id], .session-row, .creneau, tr[data-session-id], tr[data-id]');
      for (const el of all) {
        try {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt && txt.indexOf(String(id)) !== -1) return el;
        } catch (e) { /* noop */ }
      }
      // final fallback: return rawArg if element
      return rawArg && rawArg.nodeType === 1 ? rawArg : null;
    } catch (e) {
      return rawArg && rawArg.nodeType === 1 ? rawArg : null;
    }
  }

  function _resolveAndDelete(idOrElem) {
    try {
      const raw = idOrElem;
      const normalized = normalizeId(raw);
      console.info('EDTHandlers.deleteSession (compat) requested, raw=', raw, ' normalized=', normalized);

      // Try common handler objects from the app with several candidate id forms
      const tryIds = [];
      if (normalized !== null && normalized !== undefined) tryIds.push(normalized);
      // also try original raw in case handler expects element or original string
      tryIds.push(raw);

      for (const candidate of tryIds) {
        if (tryCallObjMethod(window.Planning, 'deleteSession', candidate)) return true;
        if (tryCallObjMethod(window.Planning, 'removeSession', candidate)) return true;
        if (tryCallObjMethod(window.SessionController, 'delete', candidate)) return true;
        if (tryCallObjMethod(window.SessionController, 'deleteSession', candidate)) return true;
        if (tryCallObjMethod(window.SeanceController, 'delete', candidate)) return true;
        if (tryCallObjMethod(window.SeanceController, 'deleteSession', candidate)) return true;
        if (tryCallObjMethod(window.EDT, 'deleteSession', candidate)) return true;
        if (tryCallObjMethod(window.EDT, 'supprimerSeance', candidate)) return true;
        if (tryCallObjMethod(window.EDT, 'supprimer', candidate)) return true;
        if (tryCallGlobal('deleteSession', candidate)) return true;
        if (tryCallGlobal('supprimerSeance', candidate)) return true;
      }

      // dispatch fallback event with both raw and normalized id + resolved element
      const resolvedEl = findDomElementForId(normalized, raw);
      const evDetail = { rawArg: raw, id: normalized, element: resolvedEl };
      const ev = new CustomEvent('edt:delete-request', { bubbles: true, detail: evDetail });
      document.dispatchEvent(ev);

      // As last resort, if we found a DOM element, remove it and request state save
      if (resolvedEl) {
        try {
          resolvedEl.remove();
          console.warn('EDTHandlers (compat) removed DOM element for id=', normalized);
          if (window.StateManager && typeof window.StateManager.saveState === 'function') {
            try { window.StateManager.saveState(); } catch (e) { /* noop */ }
          }
          return true;
        } catch (e) { /* noop */ }
      }

      // nothing handled it
      console.warn('EDTHandlers (compat) could not resolve deletion for', raw);
      return false;
    } catch (err) {
      console.error('EDTHandlers.deleteSession (compat) error', err);
      return false;
    }
  }

  // Generic drag event delegator that will first try to call likely handlers,
  // then dispatch a fallback custom event so the app can react.
  function _delegatedDragHandler(kind, ev) {
    try {
      // Try EDT.* style handlers first
      if (window.EDT && typeof window.EDT === 'object') {
        const methodMap = {
          dragenter: ['handleDragEnter', 'onDragEnter', 'dragEnter'],
          dragover: ['handleDragOver', 'onDragOver', 'dragOver'],
          dragleave: ['handleDragLeave', 'onDragLeave', 'dragLeave'],
          drop: ['handleDrop', 'onDrop', 'drop'],
          dragstart: ['handleDragStart', 'onDragStart', 'dragStart'],
          dragend: ['handleDragEnd', 'onDragEnd', 'dragEnd']
        };
        const candidates = methodMap[kind] || [];
        for (const c of candidates) {
          if (tryCallObjMethod(window.EDT, c, ev)) return true;
        }
      }

      // Try Planning/SessionController/SeanceController
      if (tryCallObjMethod(window.Planning, `handle${capitalize(kind)}`, ev)) return true;
      if (tryCallObjMethod(window.SessionController, `handle${capitalize(kind)}`, ev)) return true;
      if (tryCallObjMethod(window.SeanceController, `handle${capitalize(kind)}`, ev)) return true;

      // Try global named functions
      const globals = [
        `EDTHandlers.handle${capitalize(kind)}`,
        `handle${capitalize(kind)}`,
        `${kind}Handler`
      ];
      for (const g of globals) {
        if (g.includes('.')) {
          const parts = g.split('.');
          const root = window[parts[0]];
          const meth = parts[1];
          if (root && typeof root[meth] === 'function') {
            try { root[meth](ev); return true; } catch (e) { /* noop */ }
          }
        } else {
          if (tryCallGlobal(g, ev)) return true;
        }
      }

      // As fallback dispatch a custom event: 'edt:drag-<kind>'
      const evName = `edt:drag-${kind}`;
      const custom = new CustomEvent(evName, { bubbles: true, detail: { originalEvent: ev } });
      document.dispatchEvent(custom);
      return true;
    } catch (err) {
      console.error('EDTHandlers delegated drag handler error', err);
      return false;
    }
  }

  function capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  window.EDTHandlers = {
    // Delete aliases
    deleteSession: function (idOrElem) {
      return _resolveAndDelete(idOrElem);
    },
    supprimerSeance: function (idOrElem) {
      return _resolveAndDelete(idOrElem);
    },
    supprimerSession: function (idOrElem) {
      return _resolveAndDelete(idOrElem);
    },
    supprimer_seance: function (idOrElem) {
      return _resolveAndDelete(idOrElem);
    },
    supprimer: function (idOrElem) {
      return _resolveAndDelete(idOrElem);
    },

    // Drag-related aliases expected by legacy inline handlers
    handleDragEnter: function (ev) { return _delegatedDragHandler('dragenter', ev); },
    handleDragOver: function (ev) { return _delegatedDragHandler('dragover', ev); },
    handleDragLeave: function (ev) { return _delegatedDragHandler('dragleave', ev); },
    handleDrop: function (ev) { return _delegatedDragHandler('drop', ev); },
    handleDragStart: function (ev) { return _delegatedDragHandler('dragstart', ev); },
    handleDragEnd: function (ev) { return _delegatedDragHandler('dragend', ev); },

    // Backwards-compatible simple names
    dragStart: function (ev) { return this.handleDragStart(ev); },
    dragEnd: function (ev) { return this.handleDragEnd(ev); },

    // Expose resolver for debugging
    _resolveAndDelete: _resolveAndDelete
  };

  // Also attach global delegated listeners so inline ondrag... handlers may be redundant,
  // but this helps preserve behavior if the app relies on EDTHandlers.* to be present.
  try {
    ['dragenter', 'dragover', 'dragleave', 'drop', 'dragstart', 'dragend'].forEach(evtName => {
      document.addEventListener(evtName, function (ev) {
        try {
          const fnName = 'handle' + capitalize(evtName);
          if (window.EDTHandlers && typeof window.EDTHandlers[fnName] === 'function') {
            // call but do not prevent default here; handlers may decide
            try { window.EDTHandlers[fnName](ev); } catch (e) { /* noop */ }
          }
        } catch (e) { /* noop */ }
      }, true);
    });
  } catch (e) { /* noop */ }

  // Flag for debugging
  window.EDTHandlers._compat = true;
  console.info('EDTHandlers compatibility shim installed (includes drag/aliases and id normalization).');
})();