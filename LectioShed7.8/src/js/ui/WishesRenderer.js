/**
 * Renderer pour l'affichage des souhaits des enseignants
 * Ajout : pagination + recherche + per-page + fenêtre de recherche d'enseignant
 * Améliorations :
 * - expose instance globale
 * - auto-init + safe render
 * - MutationObserver pour détecter l'apparition tardive du conteneur
 * - écouteur global pour le bouton "wishes-open-search-btn" (robustesse)
 * - console.debug dans render pour faciliter le debug
 *
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import { safeText } from '../utils/sanitizers.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class WishesRenderer {
    constructor() {
        this.container = null;

        // Pagination / UI state
        this.pageState = {
            wishes: 1
        };
        this.pageSize = {
            wishes: 10
        };
        this.filters = {
            wishesQuery: ''
        };

        // modal / search
        this._searchModal = null;
        this._searchInput = null;
        this._searchResultsContainer = null;

        this._onPaginationClick = this._onPaginationClick.bind(this);
        this._onControlInput = this._onControlInput.bind(this);
        this._onGlobalClick = this._onGlobalClick.bind(this);
        this._listenerAttached = false;
        this._searchDebounce = null;

        // internal flags
        this._mutationObserver = null;
    }

    /**
     * Initialise le renderer
     * @param {string} containerId - L'ID du conteneur
     */
    init(containerId = 'wishesListContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`WishesRenderer.init: Container #${containerId} not found — attaching document-level handlers as fallback`);
            if (!this._listenerAttached) {
                // document-level delegation fallback
                document.addEventListener('click', this._onGlobalClick);
                document.addEventListener('input', this._onControlInput);
                document.addEventListener('change', this._onControlInput);
                // Also attach pagination handler at document level (delegated)
                document.addEventListener('click', this._onPaginationClick);
                this._listenerAttached = true;
            }
            return;
        }

        if (!this._listenerAttached) {
            this.container.addEventListener('click', this._onPaginationClick);
            this.container.addEventListener('input', this._onControlInput);
            this.container.addEventListener('change', this._onControlInput);
            // also capture search button clicks delegated inside container
            this.container.addEventListener('click', this._onGlobalClick);
            this._listenerAttached = true;
        }
    }

    /**
     * Rend la liste complète des souhaits (paginated)
     */
    render() {
        if (!this.container) return;

        const enseignants = Array.isArray(StateManager.state.enseignants) ? StateManager.state.enseignants.slice() : [];
        const souhaits = StateManager.state.enseignantSouhaits || {};

        if (enseignants.length === 0) {
            this.container.innerHTML = '<p class="empty-message">Aucun enseignant enregistré</p>';
            return;
        }

        // normalize teachers to objects { nom }
        const teachers = enseignants.map(t => (typeof t === 'string' ? { nom: t } : (t || { nom: '' })));

        // apply search filter
        const q = String(this.filters.wishesQuery || '').trim().toLowerCase();
        let filtered = teachers;
        if (q) {
            filtered = teachers.filter(t => String(t.nom || '').toLowerCase().includes(q));
        }

        // sort by name
        filtered.sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')));

        // pagination
        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.wishes) || 1);
        const perPage = this.pageSize.wishes || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // debug info (helpful to see why controls may not show)
        console.debug('WishesRenderer.render: total=', total, 'perPage=', perPage, 'page=', page, 'totalPages=', totalPages);

        // controls HTML
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        let html = `
            <div class="list-header">
                <h3>💡 Souhaits Enseignants (${total})</h3>
                <div class="list-controls" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <input type="search" class="wishes-search stats-search" placeholder="Rechercher un enseignant…" value="${safeText(this.filters.wishesQuery || '')}" aria-label="Rechercher un enseignant" style="flex:1;min-width:180px;">
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                        <label class="per-page-label" style="margin:0;display:inline-flex;align-items:center;gap:8px;">Afficher
                            <select class="per-page-select" data-list="wishes" aria-label="Sélectionner le nombre d'éléments par page">
                                ${perPageSelectHtml}
                            </select>
                        </label>
                        <button class="btn btn-sm btn-primary" id="wishes-open-search-btn" title="Rechercher un enseignant">🔍 Rechercher</button>
                        <button class="btn btn-sm btn-secondary" onclick="window.EDTApp?.switchToConfigTab()">➕ Ajouter</button>
                    </div>
                </div>
            </div>
            <div class="wishes-list">
        `;

        if (pageItems.length === 0) {
            html += '<p class="empty-message">Aucun enseignant trouvé pour la recherche.</p>';
        } else {
            pageItems.forEach(t => {
                const nom = t.nom || '';
                const wish = souhaits[nom] || this.getDefaultWishes();
                html += this.renderTeacherWish(nom, wish);
            });
        }

        html += `</div>
            <div class="pagination-row">${this._renderPaginationHtml('wishes', page, totalPages)}</div>
        `;

        this.container.innerHTML = html;

        // Ensure the search modal can be created / reused
        this._ensureSearchModal();
    }

    /**
     * Rend les souhaits d'un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @param {Object} wish - Les souhaits
     * @returns {string} HTML
     */
    renderTeacherWish(nom, wish) {
        const hasWishes = wish.choix1 || wish.choix2 || wish.choix3;

        return `
            <div class="wish-card ${hasWishes ? '' : 'no-wishes'}">
                <div class="wish-header">
                    <h4>${safeText(nom)}</h4>
                    <div style="display:inline-flex;gap:8px;align-items:center;">
                        <button class="btn-icon" data-action="edit-wish" data-teacher="${this.escapeQuotes(nom)}" title="Modifier">
                            ✏️
                        </button>
                        <button class="btn-icon" data-action="open-search" title="Rechercher un autre enseignant">
                            🔍
                        </button>
                    </div>
                </div>
                <div class="wish-content">
                    ${this.renderWishChoice(1, wish)}
                    ${this.renderWishChoice(2, wish)}
                    ${this.renderWishChoice(3, wish)}
                    ${wish.contraintes ? `
                        <div class="wish-constraints">
                            <strong>Contraintes :</strong> ${safeText(wish.contraintes)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Rend un choix de souhait
     * @param {number} rank - Le rang du choix (1, 2, 3)
     * @param {Object} wish - Les souhaits
     * @returns {string} HTML
     */
    renderWishChoice(rank, wish) {
        const matiere = wish[`choix${rank}`];
        if (!matiere) return '';

        const cours = wish[`c${rank}`] || 0;
        const td = wish[`td${rank}`] || 0;
        const tp = wish[`tp${rank}`] || 0;

        return `
            <div class="wish-choice">
                <span class="wish-rank">${rank}${rank === 1 ? 'er' : 'ème'} choix :</span>
                <strong>${safeText(matiere)}</strong>
                <div class="wish-details">
                    <span class="wish-badge ${cours === 0 ? 'refuse' : ''}">Cours: ${cours}</span>
                    <span class="wish-badge ${td === 0 ? 'refuse' : ''}">TD: ${td}</span>
                    <span class="wish-badge ${tp === 0 ? 'refuse' : ''}">TP: ${tp}</span>
                </div>
            </div>
        `;
    }

    /**
     * Obtient les souhaits par défaut
     * @returns {Object} Souhaits vides
     */
    getDefaultWishes() {
        return {
            choix1: '',
            c1: 0,
            td1: 0,
            tp1: 0,
            choix2: '',
            c2: 0,
            td2: 0,
            tp2: 0,
            choix3: '',
            c3: 0,
            td3: 0,
            tp3: 0,
            contraintes: 'Aucune remarque.'
        };
    }

    /**
     * Génère l'HTML des contrôles de pagination pour une liste donnée
     */
    _renderPaginationHtml(listName, currentPage, totalPages) {
        const maxButtons = 7;
        let start = 1;
        let end = totalPages;
        if (totalPages > maxButtons) {
            const half = Math.floor(maxButtons / 2);
            start = Math.max(1, currentPage - half);
            end = Math.min(totalPages, start + maxButtons - 1);
            if (end - start + 1 < maxButtons) {
                start = Math.max(1, end - maxButtons + 1);
            }
        }

        let html = `<button class="pager-btn" data-list="${listName}" data-page="${Math.max(1, currentPage - 1)}" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>`;

        for (let p = start; p <= end; p++) {
            html += `<button class="pager-btn ${p === currentPage ? 'active' : ''}" data-list="${listName}" data-page="${p}">${p}</button>`;
        }

        html += `<button class="pager-btn" data-list="${listName}" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>`;

        return html;
    }

    /**
     * Handler délégation clics pour pagination
     */
    _onPaginationClick(e) {
        const btn = (e.target && typeof e.target.closest === 'function') ? e.target.closest('.pager-btn') : (e.target && e.target.classList && e.target.classList.contains('pager-btn') ? e.target : null);
        if (!btn) {
            // not a pager button; maybe delegated edit/search button inside wish card
            return;
        }
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

        const list = btn.getAttribute('data-list');
        const page = parseInt(btn.getAttribute('data-page'), 10) || 1;
        if (!list) return;

        this.pageState[list] = page;
        this.render();
        // scroll to container
        if (this.container) this.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Handler global click for delegated actions (edit, open search)
     */
    _onGlobalClick(e) {
        const btn = (e.target && typeof e.target.closest === 'function') ? e.target.closest('[data-action]') : null;
        if (btn) {
            const action = btn.getAttribute('data-action');
            if (action === 'edit-wish') {
                const teacher = btn.getAttribute('data-teacher');
                // use existing app handler if present
                if (window.EDTApp && typeof window.EDTApp.loadTeacherWishes === 'function') {
                    window.EDTApp.loadTeacherWishes(teacher);
                } else if (window.EDTWishesRenderer) {
                    // fallback: no-op or implement inline edit flow
                    console.debug('Edit wish requested for', teacher);
                }
                return;
            } else if (action === 'open-search') {
                this.openTeacherSearch();
                return;
            }
        }

        // also handle top search button which may not have data-action
        const openSearchBtn = (e.target && typeof e.target.closest === 'function') ? e.target.closest('#wishes-open-search-btn') : null;
        if (openSearchBtn) {
            this.openTeacherSearch();
            return;
        }
    }

    /**
     * Handler pour inputs / selects (recherche, per-page)
     */
    _onControlInput(e) {
        const target = e.target;
        if (!target) return;

        // wishes search
        if (target.matches && target.matches('.wishes-search')) {
            const value = target.value || '';
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.wishesQuery = value;
                this.pageState.wishes = 1;
                this.render();
            }, 200);
            return;
        }

        // per-page selector
        if (target.matches && target.matches('.per-page-select')) {
            const list = target.getAttribute('data-list') || 'wishes';
            const n = parseInt(target.value, 10) || this.pageSize[list] || 10;
            this.pageSize[list] = n;
            this.pageState[list] = 1;
            this.render();
            return;
        }
    }

    /**
     * Assure la présence du modal de recherche (créé une seule fois)
     */
    _ensureSearchModal() {
        if (this._searchModal) return;

        // create modal appended to body for correct z-index and fixed positioning
        const modal = document.createElement('div');
        modal.id = 'wishes-teacher-search-modal';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.right = '0';
        modal.style.bottom = '0';
        modal.style.display = 'none';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.background = 'rgba(0,0,0,0.4)';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:8px;padding:16px;width:min(720px,95%);max-height:80%;overflow:auto;box-shadow:0 6px 18px rgba(0,0,0,0.2);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                    <input id="wishes-teacher-search-input" type="search" placeholder="Rechercher un enseignant (nom)..." style="flex:1;padding:8px;font-size:14px;">
                    <button id="wishes-teacher-search-close" class="btn btn-sm">Fermer</button>
                </div>
                <div id="wishes-teacher-search-results" style="display:block;gap:8px;"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // references
        this._searchModal = modal;
        this._searchInput = modal.querySelector('#wishes-teacher-search-input');
        this._searchResultsContainer = modal.querySelector('#wishes-teacher-search-results');

        // handlers
        modal.addEventListener('click', (ev) => {
            if (ev.target === modal) this.closeTeacherSearch();
        });
        const closeBtn = modal.querySelector('#wishes-teacher-search-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeTeacherSearch());

        if (this._searchInput) {
            let debounce = null;
            this._searchInput.addEventListener('input', (ev) => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    this._performSearch(String(this._searchInput.value || '').trim());
                }, 180);
            });

            this._searchInput.addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') this.closeTeacherSearch();
            });
        }
    }

    /**
     * Ouvre la fenêtre de recherche d'enseignant
     */
    openTeacherSearch() {
        this._ensureSearchModal();
        if (!this._searchModal) return;
        this._searchModal.style.display = 'flex';
        if (this._searchInput) {
            this._searchInput.value = '';
            this._searchInput.focus();
            this._searchResultsContainer.innerHTML = '';
        }
        // prefill with currently typed query if any
        const currentQuery = String(this.filters.wishesQuery || '').trim();
        if (currentQuery && this._searchInput) {
            this._searchInput.value = currentQuery;
            this._performSearch(currentQuery);
        } else {
            // show first page or some suggestions
            this._renderSearchResults(this._getAllTeachersArray().slice(0, 30));
        }
    }

    /**
     * Ferme la fenêtre de recherche d'enseignant
     */
    closeTeacherSearch() {
        if (!this._searchModal) return;
        this._searchModal.style.display = 'none';
    }

    /**
     * Retourne le tableau des enseignants (objets {nom}) depuis le StateManager
     */
    _getAllTeachersArray() {
        const ens = Array.isArray(StateManager.state && StateManager.state.enseignants ? StateManager.state.enseignants : []) ? StateManager.state.enseignants : [];
        return ens.map(t => (typeof t === 'string' ? { nom: t } : (t || { nom: '' }))).filter(x => String(x.nom || '').trim());
    }

    /**
     * Effectue la recherche et affiche les résultats
     * @param {string} query
     */
    _performSearch(query) {
        const q = String(query || '').toLowerCase().trim();
        let results = this._getAllTeachersArray();
        if (q) {
            results = results.filter(t => String(t.nom || '').toLowerCase().includes(q));
        }
        // limit results for performance
        results = results.slice(0, 200);
        this._renderSearchResults(results);
    }

    /**
     * Renders the search results into the modal container
     * @param {Array} results
     */
    _renderSearchResults(results) {
        if (!this._searchResultsContainer) return;
        if (!results || results.length === 0) {
            this._searchResultsContainer.innerHTML = `<div class="empty-message">Aucun enseignant trouvé.</div>`;
            return;
        }

        // build clickable list
        const html = results.map(r => {
            const name = safeText(String(r.nom || ''));
            return `<div class="search-result-item" data-teacher="${this.escapeQuotes(String(r.nom || ''))}" style="padding:8px 6px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                        <div>${name}</div>
                        <div style="display:inline-flex;gap:8px;">
                            <button class="btn btn-sm btn-primary select-teacher-btn" data-teacher="${this.escapeQuotes(String(r.nom || ''))}">Voir souhaits</button>
                        </div>
                    </div>`;
        }).join('');
        this._searchResultsContainer.innerHTML = html;

        // attach click handlers for select buttons (delegated)
        Array.from(this._searchResultsContainer.querySelectorAll('.select-teacher-btn')).forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const teacher = btn.getAttribute('data-teacher');
                this.closeTeacherSearch();
                // call existing handler to open the wishes editor/viewer
                if (window.EDTApp && typeof window.EDTApp.loadTeacherWishes === 'function') {
                    window.EDTApp.loadTeacherWishes(teacher);
                } else {
                    // fallback: highlight the teacher in the list and/or set filter
                    this.filters.wishesQuery = teacher;
                    this.pageState.wishes = 1;
                    this.render();
                    // optionally scroll to first occurrence
                    const el = Array.from(document.querySelectorAll('#wishesListContainer .wish-card')).find(card => card.textContent && card.textContent.includes(teacher));
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });
    }

    /**
     * Échappe les guillemets pour éviter les erreurs JavaScript
     * @param {string} str - La chaîne à échapper
     * @returns {string} La chaîne échappée
     */
    escapeQuotes(str) {
        const s = (str == null ? '' : String(str));
        return s.replace(/'/g, "\\'").replace(/"/g, '\\"');
    }
}

// Export d'une instance singleton (exposée globalement pour debug et appels manuels)
const _WishesRendererInstance = new WishesRenderer();

if (typeof window !== 'undefined') {
  try {
    if (!window.EDTWishesRenderer) window.EDTWishesRenderer = _WishesRendererInstance;
  } catch (e) { /* noop - defensive */ }
}

// Auto-init si possible (idempotent)
const safeInit = () => {
  try {
    _WishesRendererInstance.init('wishesListContainer');
    // Render automatiquement si le conteneur est déjà présent et vide (évite double render)
    const el = document.getElementById('wishesListContainer');
    if (el && (!el.innerHTML || el.innerHTML.trim().length === 0)) {
      _WishesRendererInstance.pageState.wishes = 1;
      _WishesRendererInstance.pageSize.wishes = _WishesRendererInstance.pageSize.wishes || 10;
      _WishesRendererInstance.render();
      // debug info
      console.debug('EDTWishesRenderer: auto-init + render performed (wishes)');
    }
  } catch (e) {
    console.debug('EDTWishesRenderer safeInit failed', e);
  }
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    // DOM already ready
    safeInit();
  } else {
    document.addEventListener('DOMContentLoaded', safeInit);
  }

  // If the container appears later (lazy insertion), observe the document and init when found
  try {
    if (!document.getElementById('wishesListContainer')) {
      const mo = new MutationObserver((mutations, observer) => {
        if (document.getElementById('wishesListContainer')) {
          try {
            safeInit();
          } catch (e) { /* noop */ }
          observer.disconnect();
        }
      });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      // keep reference in instance for potential disconnect later
      _WishesRendererInstance._mutationObserver = mo;
    }
  } catch (err) {
    // ignore observer errors in restrictive environments
  }

  // Robust global click listener for the top "Rechercher" button in case delegation misses it
  // (idempotent attach)
  try {
    if (!window.__EDT_WISHES_GLOBAL_BTN_ATTACHED__) {
      document.addEventListener('click', (e) => {
        const b = e.target && (e.target.closest ? e.target.closest('#wishes-open-search-btn') : (e.target.id === 'wishes-open-search-btn' ? e.target : null));
        if (b) {
          try { _WishesRendererInstance.openTeacherSearch(); } catch (err) { console.debug('openTeacherSearch failed', err); }
        }
      }, { passive: true });
      window.__EDT_WISHES_GLOBAL_BTN_ATTACHED__ = true;
    }
  } catch (e) {
    /* noop */
  }
}

export default _WishesRendererInstance;