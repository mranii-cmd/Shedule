/**
 * Renderer pour l'affichage des statistiques
 * Améliorations UI : recherche sur matières + per-page + pagination améliorée
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import SubjectController from '../controllers/SubjectController.js';
import TeacherController from '../controllers/TeacherController.js';
import RoomController from '../controllers/RoomController.js';
import { safeText } from '../utils/sanitizers.js';
import { filterSubjectsByDepartment, filterSubjectNamesByDepartment } from '../utils/helpers.js';
import AnalyticsService from '../services/AnalyticsService.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class StatsRenderer {
    constructor() {
        this.container = null;

        // État de pagination pour différentes listes
        this.pageState = {
            inconsistencies: 1,
            subjects: 1
        };

        // Taille par défaut (modifiable)
        this.pageSize = {
            inconsistencies: 5,
            subjects: 10
        };

        // Filtres / recherches
        this.filters = {
            subjectQuery: ''
        };

        // Handlers
        this._onPaginationClick = this._onPaginationClick.bind(this);
        this._onControlInput = this._onControlInput.bind(this);

        // éviter d'attacher plusieurs fois le même handler
        this._listenerAttached = false;

        // debounce pour la recherche
        this._searchDebounce = null;
    }

    /**
     * Initialise le renderer
     * @param {string} containerId - L'ID du conteneur
     */
    init(containerId = 'statsContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found — fallback to document-level handlers`);
            // fallback : attacher handlers au document si container pas encore présent
            if (!this._listenerAttached) {
                document.addEventListener('click', this._onPaginationClick);
                document.addEventListener('input', this._onControlInput);
                document.addEventListener('change', this._onControlInput);
                this._listenerAttached = true;
            }
            return;
        }

        // attacher handlers au container (préférable) si pas déjà attaché
        if (!this._listenerAttached) {
            this.container.addEventListener('click', this._onPaginationClick);
            this.container.addEventListener('input', this._onControlInput);
            this.container.addEventListener('change', this._onControlInput);
            this._listenerAttached = true;
        }
    }

    /**
     * Rend toutes les statistiques
     */
    render() {
        if (!this.container) return;

        const html = `
            <div class="stats-section">
                ${this.renderOverview()}

                ${this.renderDistributionCharts()}

                ${this.renderInconsistencies()}

                ${this.renderSubjectStats()}

                ${this.renderTopStats()}
            </div>
        `;

        this.container.innerHTML = html;
    }

    /**
     * Rend la vue d'ensemble
     * @returns {string} HTML
     */
    renderOverview() {
        const seances = StateManager.getSeances();
        const enseignants = StateManager.state.enseignants || [];
        const departement = StateManager.state?.header?.departement || '';

        // Filtrer les matières par département en utilisant la fonction helper
        const allMatieres = Object.keys(StateManager.state.matiereGroupes || {});
        const matieres = filterSubjectNamesByDepartment(allMatieres, departement, StateManager.state.matiereGroupes);

        const salles = Object.keys(StateManager.state.sallesInfo || {});

        const seancesWithTeacher = seances.filter(s => (s.hasTeacher && typeof s.hasTeacher === 'function') ? s.hasTeacher() : Boolean(s.enseignant || s.enseignants || s.enseignantsArray)).length;
        const seancesWithRoom = seances.filter(s => (s.hasRoom && typeof s.hasRoom === 'function') ? s.hasRoom() : Boolean(s.salle)).length;

        const deptNote = departement && departement !== 'Administration' ? ` (${safeText(departement)})` : '';

        return `
            <div class="overview-section">
                <h3>📈 Vue d'Ensemble${deptNote}</h3>
                <div class="overview-grid">
                    <div class="overview-card">
                        <div class="card-icon">📅</div>
                        <div class="card-content">
                            <div class="card-value">${seances.length}</div>
                            <div class="card-label">Séances Totales</div>
                        </div>
                    </div>
                    <div class="overview-card">
                        <div class="card-icon">👨‍🏫</div>
                        <div class="card-content">
                            <div class="card-value">${enseignants.length}</div>
                            <div class="card-label">Enseignants</div>
                            <div class="card-subtext">${seancesWithTeacher} séances attribuées</div>
                        </div>
                    </div>
                    <div class="overview-card">
                        <div class="card-icon">📚</div>
                        <div class="card-content">
                            <div class="card-value">${matieres.length}</div>
                            <div class="card-label">Matières${deptNote}</div>
                        </div>
                    </div>
                    <div class="overview-card">
                        <div class="card-icon">🏛️</div>
                        <div class="card-content">
                            <div class="card-value">${salles.length}</div>
                            <div class="card-label">Salles</div>
                            <div class="card-subtext">${seancesWithRoom} séances avec salle</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rend les graphiques de distribution
     * @returns {string} HTML
     */
    renderDistributionCharts() {
        const seances = StateManager.getSeances();

        const byType = {
            Cours: seances.filter(s => s.type === 'Cours').length,
            TD: seances.filter(s => s.type === 'TD').length,
            TP: seances.filter(s => s.type === 'TP').length
        };

        const byDay = {};
        const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        jours.forEach(jour => {
            byDay[jour] = seances.filter(s => s.jour === jour).length;
        });

        const maxByType = Math.max(...Object.values(byType), 1);
        const maxByDay = Math.max(...Object.values(byDay), 1);

        return `
            <div class="distribution-section">
                <h3>📊 Répartition des Séances</h3>

                <div class="charts-grid">
                    <div class="chart-container">
                        <h4>Par Type</h4>
                        <div class="bar-chart">
                            ${Object.entries(byType).map(([type, count]) => `
                                <div class="bar-item">
                                    <div class="bar-label">${type}</div>
                                    <div class="bar-wrapper">
                                        <div class="bar bar-${type.toLowerCase()}" style="width: ${(count / maxByType) * 100}%">
                                            <span class="bar-value">${count}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="chart-container">
                        <h4>Par Jour</h4>
                        <div class="bar-chart">
                            ${Object.entries(byDay).map(([jour, count]) => `
                                <div class="bar-item">
                                    <div class="bar-label">${jour}</div>
                                    <div class="bar-wrapper">
                                        <div class="bar bar-day" style="width: ${(count / maxByDay) * 100}%">
                                            <span class="bar-value">${count}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rend les incohérences détectées
     * Seules les matières attachées aux filières de la session courante sont prises en compte.
     * @returns {string} HTML
     */
    renderInconsistencies() {
        // Récupérer la liste des filières de la session courante
        const headerSession = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? String(StateManager.state.header.session).toLowerCase() : '';
        const filieres = StateManager.state.filieres || [];

        let sessionType = null;
        if (headerSession.includes('automne') || headerSession.includes('autumn')) sessionType = 'Automne';
        else if (headerSession.includes('printemps') || headerSession.includes('spring')) sessionType = 'Printemps';

        if (!sessionType) {
            // session indéfinie -> comportement d'origine (afficher tout) ou message : ici on affiche message
            return `
                <div class="inconsistencies-section">
                    <h3>⚠️ Incohérences Détectées</h3>
                    <p>Session non définie — impossible de filtrer par filière.</p>
                </div>
            `;
        }

        // extraire noms des filières de la session courante
        const filieresNames = (filieres || [])
            .filter(f => f && String(f.session) === sessionType)
            .map(f => String(f.nom || '').trim())
            .filter(Boolean);

        if (filieresNames.length === 0) {
            return `
                <div class="inconsistencies-section">
                    <h3>⚠️ Incohérences Détectées</h3>
                    <p>Aucune filière configurée pour la session ${safeText(sessionType)}.</p>
                </div>
            `;
        }

        const subjects = SubjectController.getAllSubjectsWithStats();
        const allInconsistencies = [];

        subjects.forEach(subject => {
            const subjectName = String(subject.nom || '').trim();
            // obtenir la filière liée à la matière (support multiple stockages)
            const subjectFiliere = (subject.filiere || (subject.config && subject.config.filiere) || '').trim();
            if (!subjectFiliere) return; // ignorer matières sans filière
            if (!filieresNames.includes(subjectFiliere)) return; // n'inclure que matières attachées aux filières de la session

            const inconsistencies = SubjectController.checkSubjectInconsistencies(subjectName);
            if (inconsistencies && inconsistencies.length > 0) {
                allInconsistencies.push({
                    subject: subjectName,
                    filiere: subjectFiliere,
                    issues: inconsistencies
                });
            }
        });

        if (allInconsistencies.length === 0) {
            return `
                <div class="inconsistencies-section">
                    <h3>✅ Incohérences</h3>
                    <p class="success-message">Aucune incohérence détectée pour les matières des filières de la session ${safeText(sessionType)} !</p>
                </div>
            `;
        }

        // Pagination
        const page = Math.max(1, Number(this.pageState.inconsistencies) || 1);
        const perPage = this.pageSize.inconsistencies || 5;
        const total = allInconsistencies.length;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = allInconsistencies.slice(start, start + perPage);

        return `
            <div class="inconsistencies-section">
                <h3>⚠️ Incohérences Détectées (${total}) — Session ${safeText(sessionType)}</h3>
                <div id="inconsistenciesList" class="inconsistencies-list">
                    ${pageItems.map(item => `
                        <div class="inconsistency-item">
                            <div class="inconsistency-subject">${safeText(item.subject)} <small class="filiere-tag">(${safeText(item.filiere)})</small></div>
                            <ul class="inconsistency-issues">
                                ${item.issues.map(issue => `<li>${safeText(issue)}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>

                <div id="inconsistenciesPager" class="stats-pager" data-list="inconsistencies" data-total="${total}" data-per-page="${perPage}" data-page="${page}">
                    ${this._renderPaginationHtml('inconsistencies', page, totalPages)}
                </div>
            </div>
        `;
    }

    /**
     * Rend la table/section des statistiques par matière (paginated)
     * @returns {string} HTML
     */
    renderSubjectStats() {
        const subjectStats = AnalyticsService.calculateSubjectStats() || [];
        const departement = StateManager.state?.header?.departement || '';

        // Si département : filtrer
        let filtered = subjectStats;
        if (departement && departement !== 'Administration') {
            filtered = subjectStats.filter(s => {
                const subjectDept = s.departement || s.config?.departement || '';
                return subjectDept === departement;
            });
        }

        // appliquer filtre de recherche (this.filters.subjectQuery)
        const q = String(this.filters.subjectQuery || '').trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(s => String(s.nom || '').toLowerCase().includes(q));
        }

        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.subjects) || 1);
        const perPage = this.pageSize.subjects || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // header controls : search + per-page
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        return `
            <div class="subject-stats-section">
                <div class="subject-stats-header">
                    <h3>📚 Statistiques par Matière (${total})</h3>
                    <div class="subject-controls">
                        <input type="search" class="stats-search" placeholder="Rechercher une matière…" value="${safeText(this.filters.subjectQuery || '')}" aria-label="Rechercher une matière">
                        <label class="per-page-label">Afficher
                            <select class="per-page-select" data-list="subjects" aria-label="Sélectionner le nombre d'éléments par page">
                                ${perPageSelectHtml}
                            </select>
                        </label>
                    </div>
                </div>

                <table class="subject-stats-table">
                    <thead>
                        <tr>
                            <th>Matière</th>
                            <th>Filière</th>
                            <th>Séances</th>
                            <th>Cours</th>
                            <th>TD</th>
                            <th>TP</th>
                            <th>Complétion (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageItems.map(s => `
                            <tr>
                                <td>${safeText(s.nom)}</td>
                                <td>${safeText(s.filiere || '')}</td>
                                <td>${s.totalSeances}</td>
                                <td>${s.cours}</td>
                                <td>${s.td}</td>
                                <td>${s.tp}</td>
                                <td>${s.completion}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div id="subjectsPager" class="stats-pager" data-list="subjects" data-total="${total}" data-per-page="${perPage}" data-page="${page}">
                    ${this._renderPaginationHtml('subjects', page, totalPages)}
                </div>
            </div>
        `;
    }

    /**
     * Rend les statistiques top (top enseignants, matières, salles)
     * @returns {string} HTML
     */
    renderTopStats() {
        const departement = StateManager.state?.header?.departement || '';

        const teachers = TeacherController.getAllTeachersWithStats()
            .sort((a, b) => b.stats.totalSeances - a.stats.totalSeances)
            .slice(0, 5);

        // Filtrer les matières par département
        let subjects = SubjectController.getAllSubjectsWithStats();
        if (departement && departement !== 'Administration') {
            subjects = subjects.filter(s => {
                const subjectDept = s.departement || s.config?.departement || '';
                return subjectDept === departement;
            });
        }
        subjects = subjects
            .sort((a, b) => b.stats.totalSeances - a.stats.totalSeances)
            .slice(0, 5);

        const rooms = RoomController.getAllRoomsWithStats()
            .sort((a, b) => b.stats.totalSeances - a.stats.totalSeances)
            .slice(0, 5);

        return `
            <div class="top-stats-section">
                <h3>🏆 Top 5${departement && departement !== 'Administration' ? ` (${safeText(departement)})` : ''}</h3>
                <div class="top-stats-grid">
                    <div class="top-list">
                        <h4>Enseignants (séances)</h4>
                        <ol>
                            ${teachers.map(t => `
                                <li>${safeText(t.nom)} <span class="badge">${t.stats.totalSeances}</span></li>
                            `).join('')}
                        </ol>
                    </div>

                    <div class="top-list">
                        <h4>Matières (séances)</h4>
                        <ol>
                            ${subjects.map(s => `
                                <li>${safeText(s.nom)} <span class="badge">${s.stats.totalSeances}</span></li>
                            `).join('')}
                        </ol>
                    </div>

                    <div class="top-list">
                        <h4>Salles (occupation)</h4>
                        <ol>
                            ${rooms.map(r => `
                                <li>${safeText(r.nom)} <span class="badge">${r.stats.occupancy.rate}%</span></li>
                            `).join('')}
                        </ol>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Génère l'HTML des contrôles de pagination pour une liste donnée
     */
    _renderPaginationHtml(listName, currentPage, totalPages) {
        // limiter affichage de pages trop nombreuses (fenêtre)
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
        // robustifier la détection du bouton (e.target peut être un Text node)
        const btn = (e.target && typeof e.target.closest === 'function') ? e.target.closest('.pager-btn') : (e.target && e.target.classList && e.target.classList.contains('pager-btn') ? e.target : null);
        if (!btn) return;
        // si on utilise le fallback document-level, accepter le bouton même s'il n'est pas enfant direct du container
        if (this.container && !this.container.contains(btn)) return;

        // ignorer si bouton disabled
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

        const list = btn.getAttribute('data-list');
        const page = parseInt(btn.getAttribute('data-page'), 10) || 1;

        if (!list) return;

        // Mettre à jour l'état et re-render
        this.pageState[list] = page;
        this.render();
        // scroller jusqu'à la section
        const sectionId = list === 'inconsistencies' ? '#inconsistenciesList' : (list === 'subjects' ? '.subject-stats-section' : null);
        if (sectionId) {
            const el = this.container ? this.container.querySelector(sectionId) : document.querySelector(sectionId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Handler pour inputs / selects (recherche, per-page)
     */
    _onControlInput(e) {
        const target = e.target;
        if (!target) return;

        // recherche matières
        if (target.matches && target.matches('.stats-search')) {
            const value = target.value || '';
            // debounce
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.subjectQuery = value;
                // reset page
                this.pageState.subjects = 1;
                this.render();
            }, 220);
            return;
        }

        // per-page selector
        if (target.matches && target.matches('.per-page-select')) {
            const list = target.getAttribute('data-list') || 'subjects';
            const n = parseInt(target.value, 10) || this.pageSize[list] || 10;
            this.pageSize[list] = n;
            this.pageState[list] = 1;
            this.render();
            return;
        }
    }
}

// Export d'une instance singleton
export default new StatsRenderer();