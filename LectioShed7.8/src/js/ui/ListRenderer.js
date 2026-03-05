/**
 * Renderer pour l'affichage des listes (enseignants, matières, salles)
 * Ajout : pagination + recherche + per-page (gestion) — similaire à VolumeRenderer
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import TeacherController from '../controllers/TeacherController.js';
import SubjectController from '../controllers/SubjectController.js';
import RoomController from '../controllers/RoomController.js';
import { safeText } from '../utils/sanitizers.js';
import { normalizeSessionLabel } from '../utils/session.js';

class ListRenderer {
    constructor() {
        this.containers = {
            teachers: null,
            subjects: null,
            rooms: null
        };

        // Pagination / UI state (gestion similaire au VolumeRenderer)
        this.pageState = {
            teachers: 1,
            subjects: 1,
            rooms: 1
        };
        this.pageSize = {
            teachers: 10,
            subjects: 10,
            rooms: 10
        };
        this.filters = {
            teacherQuery: '',
            subjectQuery: '',
            roomQuery: ''
        };

        // bound handlers for delegation
        this._onPaginationClick = this._onPaginationClick.bind(this);
        this._onControlInput = this._onControlInput.bind(this);
        this._listenerAttached = false;
        this._searchDebounce = null;
    }

    /**
     * Initialise le renderer
     * @param {Object} containerIds - Les IDs des conteneurs
     */
    init(containerIds = {}) {
        const defaults = {
            teachers: 'teachersListContainer',
            subjects: 'subjectsListContainer',
            rooms: 'roomsListContainer'
        };

        const ids = { ...defaults, ...containerIds };

        Object.keys(ids).forEach(key => {
            this.containers[key] = document.getElementById(ids[key]);
            if (!this.containers[key]) {
                console.warn(`Container #${ids[key]} not found`);
            } else {
                // attach delegated handlers once per container init
                if (!this._listenerAttached) {
                    this.containers[key].addEventListener('click', this._onPaginationClick);
                    this.containers[key].addEventListener('input', this._onControlInput);
                    this.containers[key].addEventListener('change', this._onControlInput);
                }
            }
        });

        if (!this._listenerAttached) this._listenerAttached = true;
    }

    /**
     * Rend toutes les listes
     */
    renderAll() {
        this.renderTeachersList();
        this.renderSubjectsList();
        this.renderRoomsList();
    }

    /**
     * Rend la liste des enseignants (avec pagination & recherche)
     */
    renderTeachersList() {
        if (!this.containers.teachers) return;

        const teachers = TeacherController.getAllTeachersWithStats() || [];

        // apply search filter
        const q = String(this.filters.teacherQuery || '').trim().toLowerCase();
        let filtered = teachers;
        if (q) {
            filtered = teachers.filter(t => (String(t.nom || '').toLowerCase().includes(q)));
        }

        // sort by volume (descending) if stats available, fallback to name
        filtered.sort((a, b) => {
            const va = Number((a.stats && a.stats.volume && a.stats.volume.total) || (a.stats && a.stats.volume?.total) || (a.stats && a.stats.vht) || 0);
            const vb = Number((b.stats && b.stats.volume && b.stats.volume.total) || (b.stats && b.stats.volume?.total) || (b.stats && b.stats.vht) || 0);
            if (vb !== va) return vb - va;
            return String(a.nom || '').localeCompare(String(b.nom || ''));
        });

        // pagination
        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.teachers) || 1);
        const perPage = this.pageSize.teachers || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // controls HTML
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        let html = `
            <div class="list-header">
                <h3>👨‍🏫 Enseignants (${total})</h3>
                <div class="list-controls" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <input type="search" class="teacher-search stats-search" placeholder="Rechercher un enseignant…" value="${safeText(this.filters.teacherQuery || '')}" aria-label="Rechercher un enseignant" style="flex:1;min-width:180px;">
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                        <label class="per-page-label" style="margin:0;display:inline-flex;align-items:center;gap:8px;">Afficher
                            <select class="per-page-select" data-list="teachers" aria-label="Sélectionner le nombre d'enseignants par page">
                                ${perPageSelectHtml}
                            </select>
                        </label>
                        <button class="btn btn-sm btn-primary" onclick="window.EDTApp?.switchToConfigTab()">➕ Ajouter</button>
                    </div>
                </div>
            </div>
            <div class="list-items">
        `;

        if (pageItems.length === 0) {
            html += `<p class="empty-message">Aucun enseignant trouvé pour la recherche.</p>`;
        } else {
            pageItems.forEach(teacher => {
                html += this.renderTeacherItem(teacher);
            });
        }

        html += `</div>
            <div class="pagination-row">${this._renderPaginationHtml('teachers', page, totalPages)}</div>
        `;

        this.containers.teachers.innerHTML = html;
    }

    /**
     * Rend un élément enseignant
     * @param {Object} teacher - Les données de l'enseignant
     * @returns {string} HTML
     */
    renderTeacherItem(teacher) {
        return `
            <div class="list-item teacher-item">
                <div class="item-header">
                    <strong>${safeText(teacher.nom)}</strong>
                    <div class="item-actions">
                        <button class="btn-icon" onclick="window.EDTApp?.editTeacherWishes('${this.escapeQuotes(teacher.nom)}')" title="Modifier souhaits">
                            💭
                        </button>
                        <button class="btn-icon btn-danger" onclick="window.EDTTeacherController?.removeTeacher('${this.escapeQuotes(teacher.nom)}')" title="Supprimer">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="item-details">
                    <span class="detail-badge">📅 ${safeText(String((teacher.stats && teacher.stats.totalSeances) || 0))} séances</span>
                    <span class="detail-badge">📊 ${safeText(String(((teacher.stats && teacher.stats.volume && teacher.stats.volume.total) || (teacher.stats && teacher.stats.vht) || 0)))} hTP</span>
                    ${((teacher.stats && teacher.stats.matieres) && teacher.stats.matieres.length > 0) ?
                `<span class="detail-badge">📚 ${teacher.stats.matieres.length} matière(s)</span>`
                : ''
            }
                </div>
            </div>
        `;
    }

    /**
     * Rend la liste des matières (avec pagination & recherche)
     */
    renderSubjectsList() {
        if (!this.containers.subjects) return;

        // Récupérer toutes les matières (objets de SubjectController)
        const allSubjects = SubjectController.getAllSubjectsWithStats() || [];

        // Déterminer la session courante à partir du header
        const headerSessionRaw = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
        const normalized = normalizeSessionLabel(headerSessionRaw); // 'autumn'|'spring'|'unknown'

        let sessionLabelHuman = null;
        if (normalized === 'autumn') sessionLabelHuman = 'Automne';
        else if (normalized === 'spring') sessionLabelHuman = 'Printemps';

        let subjectsToShow = allSubjects;
        let noteHtml = '';

        if (!sessionLabelHuman) {
            noteHtml = `<div class="list-note">Session non définie — affichage de toutes les matières</div>`;
        } else {
            const filieres = StateManager.state.filieres || [];
            const filieresForSession = filieres
                .filter(f => String(f.session || '').toLowerCase() === sessionLabelHuman.toLowerCase())
                .map(f => String(f.nom || '').trim())
                .filter(Boolean);

            if (filieresForSession.length === 0) {
                this.containers.subjects.innerHTML = `
                    <div class="list-header">
                        <h3>📚 Matières (0)</h3>
                    </div>
                    <div class="empty-message">Aucune filière configurée pour la session ${safeText(sessionLabelHuman)}.</div>
                `;
                return;
            }

            subjectsToShow = allSubjects.filter(s => {
                const cfgFiliere = (s.config && s.config.filiere) ? String(s.config.filiere).trim()
                    : (StateManager.state.matiereGroupes && StateManager.state.matiereGroupes[s.nom] ? StateManager.state.matiereGroupes[s.nom].filiere : '');
                return cfgFiliere && filieresForSession.includes(cfgFiliere);
            });

            noteHtml = `<div class="list-note">Matières filtrées pour la session ${safeText(sessionLabelHuman)}</div>`;
        }

        // apply subject search filter
        const q = String(this.filters.subjectQuery || '').trim().toLowerCase();
        let filtered = subjectsToShow;
        if (q) {
            filtered = subjectsToShow.filter(s => String(s.nom || '').toLowerCase().includes(q));
        }

        // sort by vht desc
        filtered.sort((a, b) => (b.stats?.vht || 0) - (a.stats?.vht || 0));

        // pagination
        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.subjects) || 1);
        const perPage = this.pageSize.subjects || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // controls HTML
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        let html = `
            <div class="list-header">
                <h3>📚 Matières (${total})</h3>
                <div class="list-controls" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <input type="search" class="subject-search stats-search" placeholder="Rechercher une matière…" value="${safeText(this.filters.subjectQuery || '')}" aria-label="Rechercher une matière" style="flex:1;min-width:180px;">
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                        <label class="per-page-label" style="margin:0;display:inline-flex;align-items:center;gap:8px;">Afficher
                            <select class="per-page-select" data-list="subjects" aria-label="Sélectionner le nombre d'éléments par page">
                                ${perPageSelectHtml}
                            </select>
                        </label>
                        <button class="btn btn-sm btn-primary" onclick="window.EDTApp?.switchToConfigTab()">➕ Ajouter</button>
                    </div>
                </div>
            </div>
            ${noteHtml}
            <div class="list-items">
        `;

        if (pageItems.length === 0) {
            html += '<p class="empty-message">Aucune matière trouvée pour la recherche / sélection.</p>';
        } else {
            pageItems.forEach(subject => {
                html += this.renderSubjectItem(subject);
            });
        }

        html += `</div>
            <div class="pagination-row">${this._renderPaginationHtml('subjects', page, totalPages)}</div>
        `;

        this.containers.subjects.innerHTML = html;
    }

    /**
     * Rend un élément matière
     * @param {Object} subject - Les données de la matière
     * @returns {string} HTML
     */
    renderSubjectItem(subject) {
        const completionClass = (subject.stats && subject.stats.completionRate) >= 100 ? 'complete' :
            (subject.stats && subject.stats.completionRate) >= 50 ? 'partial' : 'incomplete';

        return `
            <div class="list-item subject-item">
                <div class="item-header">
                    <strong>${safeText(subject.nom)}</strong>
                    <div class="item-actions">
                        <button class="btn-icon" onclick="window.EDTSchedulingHandlers?.generateSessionsForSubject('${this.escapeQuotes(subject.nom)}')" title="Générer séances">
                            🚀
                        </button>
                        <button class="btn-icon btn-danger" onclick="window.EDTSubjectController?.removeSubject('${this.escapeQuotes(subject.nom)}')" title="Supprimer">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="item-details">
                    <span class="detail-badge">🎓 ${safeText((subject.config && subject.config.filiere) || '')}</span>
                    <span class="detail-badge">📅 ${safeText(String(subject.stats.totalSeances || 0))} séances</span>
                    <span class="detail-badge">⏰ ${safeText(String(subject.stats.vht || 0))} hTP</span>
                    <span class="detail-badge completion-badge ${completionClass}">
                        ${safeText(String(subject.stats.completionRate || 0))}% complété
                    </span>
                </div>
            </div>
        `;
    }

    /**
     * Rend la liste des salles (avec pagination & recherche simple)
     */
    renderRoomsList() {
        if (!this.containers.rooms) return;

        const rooms = RoomController.getAllRoomsWithStats() || [];

        // apply room search filter
        const q = String(this.filters.roomQuery || '').trim().toLowerCase();
        let filtered = rooms;
        if (q) {
            filtered = rooms.filter(r => String(r.nom || '').toLowerCase().includes(q));
        }

        // sort by name
        filtered.sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')));

        // pagination
        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.rooms) || 1);
        const perPage = this.pageSize.rooms || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // controls HTML
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        let html = `
            <div class="list-header">
                <h3>🏛️ Salles (${total})</h3>
                <div class="list-controls" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <input type="search" class="room-search stats-search" placeholder="Rechercher une salle…" value="${safeText(this.filters.roomQuery || '')}" aria-label="Rechercher une salle" style="flex:1;min-width:180px;">
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                        <label class="per-page-label" style="margin:0;display:inline-flex;align-items:center;gap:8px;">Afficher
                            <select class="per-page-select" data-list="rooms" aria-label="Sélectionner le nombre d'éléments par page">
                                ${perPageSelectHtml}
                            </select>
                        </label>
                        <button class="btn btn-sm btn-primary" onclick="window.EDTApp?.switchToConfigTab()">➕ Ajouter</button>
                    </div>
                </div>
            </div>
            <div class="list-items">
        `;

        if (pageItems.length === 0) {
            html += '<p class="empty-message">Aucune salle trouvée pour la recherche.</p>';
        } else {
            pageItems.forEach(room => {
                html += this.renderRoomItem(room);
            });
        }

        html += `</div>
            <div class="pagination-row">${this._renderPaginationHtml('rooms', page, totalPages)}</div>
        `;

        this.containers.rooms.innerHTML = html;
    }

    /**
     * Rend un élément salle
     * @param {Object} room - Les données de la salle
     * @returns {string} HTML
     */
    renderRoomItem(room) {
        const occupancyClass = (room.stats && room.stats.occupancy && room.stats.occupancy.rate) >= 80 ? 'high' :
            (room.stats && room.stats.occupancy && room.stats.occupancy.rate) >= 50 ? 'medium' : 'low';

        return `
            <div class="list-item room-item">
                <div class="item-header">
                    <strong>${safeText(room.nom)}</strong>
                    <span class="room-type-badge">${safeText(room.type)}</span>
                    <div class="item-actions">
                        <button class="btn-icon btn-danger" onclick="window.EDTRoomController?.removeRoom('${this.escapeQuotes(room.nom)}')" title="Supprimer">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="item-details">
                    <span class="detail-badge">📅 ${safeText(String(room.stats.totalSeances || 0))} séances</span>
                    <span class="detail-badge occupancy-badge ${occupancyClass}">
                        📊 ${safeText(String((room.stats && room.stats.occupancy && room.stats.occupancy.rate) || 0))}% occupée
                    </span>
                </div>
            </div>
        `;
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
        if (!btn) return;

        // check that the clicked button belongs to one of our containers (defensive)
        const list = btn.getAttribute('data-list');
        const page = parseInt(btn.getAttribute('data-page'), 10) || 1;
        if (!list) return;

        this.pageState[list] = page;
        this.renderAll();

        // scroll into view for that section
        const selector = list === 'teachers' ? '#teachersListContainer' : (list === 'subjects' ? '#subjectsListContainer' : '#roomsListContainer');
        const el = document.querySelector(selector);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Handler pour inputs / selects (recherche, per-page)
     */
    _onControlInput(e) {
        const target = e.target;
        if (!target) return;

        // teacher search
        if (target.matches && target.matches('.teacher-search')) {
            const value = target.value || '';
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.teacherQuery = value;
                this.pageState.teachers = 1;
                this.renderTeachersList();
            }, 200);
            return;
        }

        // subject search
        if (target.matches && target.matches('.subject-search')) {
            const value = target.value || '';
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.subjectQuery = value;
                this.pageState.subjects = 1;
                this.renderSubjectsList();
            }, 200);
            return;
        }

        // room search
        if (target.matches && target.matches('.room-search')) {
            const value = target.value || '';
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.roomQuery = value;
                this.pageState.rooms = 1;
                this.renderRoomsList();
            }, 200);
            return;
        }

        // per-page selector
        if (target.matches && target.matches('.per-page-select')) {
            const list = target.getAttribute('data-list') || 'subjects';
            const n = parseInt(target.value, 10) || this.pageSize[list] || 10;
            this.pageSize[list] = n;
            this.pageState[list] = 1;
            this.renderAll();
            return;
        }
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

// Export d'une instance singleton
export default new ListRenderer();