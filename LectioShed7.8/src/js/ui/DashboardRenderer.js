/**
 * Renderer pour le tableau de bord analytique avec graphiques Chart.js
 * @author Ibrahim Mrani - UCD
 */

import DashboardController from '../controllers/DashboardController.js';
import { safeText } from '../utils/sanitizers.js';
import StateManager from '../controllers/StateManager.js';
import SchedulingService from '../services/SchedulingService.js';
import VolumeService from '../services/VolumeService.js';
// import { escapeHTML } from '../utils/sanitizers.js';
import VolumeRenderer from '../ui/VolumeRenderer.js';
import { attachIndicator } from '../ui/indicators.js';
import { filterSubjectsByDepartment } from '../utils/helpers.js';

class DashboardRenderer {
    constructor() {
        this.container = null;
        this.charts = {}; // Stockage des instances Chart.js
    }

    /**
     * Initialise le renderer
     * @param {string} containerId - L'ID du conteneur
     */
    init(containerId = 'dashboardContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found`);
        }
    }

    /**
     * Rend le dashboard complet
     */
    render() {
        if (!this.container) return;

        const data = DashboardController.getDashboardData();

        if (!data) {
            this.container.innerHTML = '<p class="empty-message">Aucune donnée disponible</p>';
            return;
        }

        const html = `
            <div class="dashboard-container">
                ${this.renderHeader()}
                ${this.renderKPIs(data.kpis)}
                ${this.renderAlerts(data.alerts)}
                ${this.renderCharts(data)}
                ${this.renderSubjectStats(data.subjectStats)}
            </div>
        `;

        this.container.innerHTML = html;

        // Attacher les indicateurs TVI (si la fonction est disponible)
        try {
            const inputs = Array.from(this.container.querySelectorAll('.tvi-reference'));
            if (typeof attachIndicator === 'function') {
                inputs.forEach(el => {
                    try { attachIndicator(el); } catch (e) { /* ignore per element error */ }
                });
            } else if (typeof window.attachIndicator === 'function') {
                inputs.forEach(el => {
                    try { window.attachIndicator(el); } catch (e) { /* ignore per element error */ }
                });
            } else {
                // Pas d'implémentation disponible — passthrough (aucun throw)
            }
        } catch (e) {
            console.warn('Failed to attach TVI indicators', e);
        }

        // Initialiser les graphiques Chart.js après le rendu
        this.initCharts(data);
        // Initialiser les graphiques Chart.js après le rendu
        this.initCharts(data);
    }

    /**
     * Rend l'en-tête du dashboard
     * @returns {string} HTML
     */
    renderHeader() {
        return `
            <div class="dashboard-header">
                <div class="dashboard-title">
                    <h2>📊 Dashboard Analytics</h2>
                    <p class="dashboard-subtitle">Vue d'ensemble de votre emploi du temps</p>
                </div>
                <div class="dashboard-actions">
                    <button class="btn btn-sm btn-secondary" onclick="window.EDTDashboardController?.refreshData()">
                        🔄 Actualiser
                    </button>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="window.EDTDashboardController?.exportDashboard('pdf')">
                            📄 PDF
                        </button>
                        <button class="btn btn-sm btn-success" onclick="window.EDTDashboardController?.exportDashboard('excel')">
                            📗 Excel
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rend les KPIs
     * @param {Object} kpis - Les données KPIs
     * @returns {string} HTML
     */
    renderKPIs(kpis) {
        return `
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-icon">📅</div>
                    <div class="kpi-content">
                        <div class="kpi-value">${kpis.totalSeances}</div>
                        <div class="kpi-label">Séances Totales</div>
                    </div>
                </div>
                
                <div class="kpi-card">
                    <div class="kpi-icon">👨‍🏫</div>
                    <div class="kpi-content">
                        <div class="kpi-value">${kpis.teacherAssignmentRate}%</div>
                        <div class="kpi-label">Attribution Enseignants</div>
                        <div class="kpi-subtext">${kpis.activeTeachers}/${kpis.totalTeachers} actifs</div>
                    </div>
                </div>
                
                <div class="kpi-card">
                    <div class="kpi-icon">🏛️</div>
                    <div class="kpi-content">
                        <div class="kpi-value">${kpis.roomAssignmentRate}%</div>
                        <div class="kpi-label">Attribution Salles</div>
                        <div class="kpi-subtext">${kpis.usedRooms}/${kpis.totalRooms} utilisées</div>
                    </div>
                </div>
                
                <div class="kpi-card ${kpis.globalOccupancyRate > 70 ? 'kpi-success' : kpis.globalOccupancyRate > 50 ? 'kpi-warning' : 'kpi-danger'}">
                    <div class="kpi-icon">📊</div>
                    <div class="kpi-content">
                        <div class="kpi-value">${kpis.globalOccupancyRate}%</div>
                        <div class="kpi-label">Occupation Globale</div>
                        <div class="kpi-subtext">Créneaux utilisés</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rend les alertes
     * @param {Array} alerts - Les alertes
     * @returns {string} HTML
     */
    renderAlerts(alerts) {
        if (!alerts || alerts.length === 0) {
            return `
                <div class="alerts-section">
                    <div class="alert alert-success">
                        <span class="alert-icon">✅</span>
                        <div class="alert-content">
                            <strong>Tout est OK !</strong>
                            <p>Aucune alerte détectée pour le moment.</p>
                        </div>
                    </div>
                </div>
            `;
        }

        const alertsHtml = alerts.map(alert => `
            <div class="alert alert-${alert.type}">
                <span class="alert-icon">${alert.icon}</span>
                <div class="alert-content">
                    <strong>${alert.title}</strong>
                    <p>${safeText(alert.message)}</p>
                    ${alert.action ? `<small class="alert-action">💡 ${safeText(alert.action)}</small>` : ''}
                </div>
            </div>
        `).join('');

        return `
            <div class="alerts-section">
                <h3>🔔 Alertes et Recommandations</h3>
                ${alertsHtml}
            </div>
        `;
    }

    /**
     * Rend les conteneurs pour les graphiques
     * @param {Object} data - Les données
     * @returns {string} HTML
     */
    renderCharts(data) {
        return `
            <div class="charts-section">
                <div class="charts-row">
                    <div class="chart-container chart-large">
                        <h3>👨‍🏫 Charge de Travail par Enseignant</h3>
                        <canvas id="teachersWorkloadChart"></canvas>
                        <div class="charts-note small muted">Affiche top 30 enseignants par défaut. Utiliser VolumeRenderer pour export complet.</div>
                    </div>
                    
                    <div class="chart-container chart-small">
                        <h3>📊 Distribution des Séances</h3>
                        <canvas id="sessionsDistributionChart"></canvas>
                    </div>
                </div>
                
                <div class="charts-row">
                    <div class="chart-container chart-medium">
                        <h3>⏰ Heatmap des Créneaux</h3>
                        <div id="timeSlotsHeatmap"></div>
                    </div>
                    
                    <div class="chart-container chart-medium">
                        <h3>🏛️ Occupation des Salles</h3>
                        <canvas id="roomsOccupancyChart"></canvas>
                    </div>
                </div>
                
                <div class="charts-row">
                    <div class="chart-container chart-full">
                        <h3>📈 Timeline Hebdomadaire</h3>
                        <canvas id="weeklyTimelineChart"></canvas>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Helper : récupère les séances appartenant à la session courante (si labellées)
     * Retourne [] si session non déterminée.
     * @returns {Array}
     */
    getSessionSeances() {
        const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];
        const headerSession = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? String(StateManager.state.header.session).toLowerCase() : '';

        let sessKey = null;
        if (headerSession.includes('automne') || headerSession.includes('autumn')) sessKey = 'automne';
        else if (headerSession.includes('printemps') || headerSession.includes('spring')) sessKey = 'printemps';

        if (!sessKey) return []; // session non définie -> ne rien afficher par sécurité

        return allSeances.filter(s => {
            if (!s) return false;
            const sSession = String(s.session || '').toLowerCase();
            if (!sSession) return false; // n'inclure que séances explicitement labellisées
            if (sessKey === 'automne') return sSession.includes('automne') || sSession.includes('autumn');
            if (sessKey === 'printemps') return sSession.includes('printemps') || sSession.includes('spring');
            return false;
        });
    }

    /**
     * Helper : récupère noms des filières de la session courante
     * @returns {Array<string>}
     */
    getSessionFilieresNames() {
        const headerSession = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? String(StateManager.state.header.session).toLowerCase() : '';
        const filieres = StateManager.state.filieres || [];

        let sessionType = null;
        if (headerSession.includes('automne') || headerSession.includes('autumn')) sessionType = 'Automne';
        else if (headerSession.includes('printemps') || headerSession.includes('spring')) sessionType = 'Printemps';

        if (!sessionType) return [];

        return (filieres || [])
            .filter(f => f && String(f.session) === sessionType)
            .map(f => String(f.nom || '').trim())
            .filter(Boolean);
    }

    /**
     * Rend les statistiques par matière
     * Affiche uniquement les matières présentes dans la session courante.
     * Si aucune séance labellée n'existe, on tente un fallback en utilisant les filières
     * de la session courante pour sélectionner les matières.
     * Modifié : indique le nombre de séances sans enseignant pour Cours et TD,
     * et, pour les TP, le nombre total d'enseignants manquants (somme des manques sur toutes les séances TP).
     * Si aucun enseignant ne manque (cours, TD, TP) la complétion devient 100% et la barre devient verte.
     *
     * @param {Array} subjectStats - Les stats par matière (globales)
     * @returns {string} HTML
     */
    /**
  * Rend les statistiques par matière
  * Affiche uniquement les matières présentes dans la session courante.
  * ...
  */
    renderSubjectStats(subjectStats) {
        if (!subjectStats || subjectStats.length === 0) {
            return '';
        }

        // Filtrer par département avant tout traitement
        const departement = StateManager.state?.header?.departement || '';
        const filteredByDept = filterSubjectsByDepartment(subjectStats, departement);

        // déterminer la session et les séances correspondantes
        const seancesSession = this.getSessionSeances();

        // construire set des matières présentes dans la session (via séances labellées)
        const subjectNamesInSession = new Set(
            seancesSession
                .map(s => (s.matiere || s.subject || s.nom || '').toString().trim())
                .filter(Boolean)
        );

        let filteredStats = [];

        if (subjectNamesInSession.size > 0) {
            // filtrer subjectStats pour ne garder que les matières présentes dans la session
            filteredStats = filteredByDept.filter(s => subjectNamesInSession.has(String(s.nom || '').trim()));
        } else {
            // fallback : utiliser les filières de la session pour lister les matières rattachées aux filières
            const filieresNames = this.getSessionFilieresNames();

            if (filieresNames.length > 0) {
                filteredStats = filteredByDept.filter(s => {
                    const filiere = (s.filiere || (s.config && s.config.filiere) || '').toString().trim();
                    return filiere && filieresNames.includes(filiere);
                });
            } else {
                // dernier recours : si ni séances labellées ni filières, essayer d'inferer via toutes les séances
                const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];
                const inferredNames = new Set(
                    allSeances.map(s => (s.matiere || s.subject || s.nom || '').toString().trim()).filter(Boolean)
                );
                filteredStats = filteredByDept.filter(s => inferredNames.has(String(s.nom || '').trim()));
            }
        }

        if (!filteredStats || filteredStats.length === 0) {
            return `
                <div class="subject-stats-section">
                    <h3>📚 Statistiques par Matière — Session courante</h3>
                    <p>Aucune matière planifiée pour la session courante ou données introuvables${departement && departement !== 'Administration' ? ` (département: ${safeText(departement)})` : ''}.</p>
                </div>
            `;
        }

        const allSeances = (seancesSession && seancesSession.length > 0)
            ? seancesSession
            : ((typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : []);

        const statsHtml = filteredStats.map(s => {
            const subjectName = String(s.nom || '').trim();

            // rassembler toutes les séances de cette matière dans la session
            const seancesOfSubject = (allSeances || []).filter(se => {
                const mat = (se.matiere || se.subject || se.nom || '').toString().trim();
                return mat === subjectName;
            });

            // compteurs demandés
            let nbSansEnseignantCours = 0;
            let nbSansEnseignantTD = 0;
            let tpEnseignantsManquants = 0;

            // For completion ratio
            let totalRequiredTeachers = 0;
            let totalAssignedTeachersCounted = 0;

            // If AnalyticsService already provided TP-level stats, prefer them
            const subjectHasTPStats = (s.expectedTPPosts !== undefined && s.assignedTPPosts !== undefined);

            // Process sessions: if we have subject-level TP stats, skip per-session TP accounting
            seancesOfSubject.forEach(se => {
                try {
                    const type = (se.type || '').toString().toLowerCase();

                    // déterminer nombre d'enseignants assignés
                    let assignedCount = 0;
                    if (Array.isArray(se.enseignantsArray) && se.enseignantsArray.length > 0) {
                        assignedCount = se.enseignantsArray.filter(t => t && t.toString().trim()).length;
                    } else if (Array.isArray(se.enseignants) && se.enseignants.length > 0) {
                        assignedCount = se.enseignants.filter(t => t && t.toString().trim()).length;
                    } else if (se.enseignant && String(se.enseignant).trim()) {
                        // normalize strings like "A / B" are handled in AnalyticsService; here treat as single if string
                        assignedCount = 1;
                    } else {
                        assignedCount = 0;
                    }

                    // required teachers for this session (default 1)
                    const required = Number(se.requiredTeachers ?? se.nbEnseignants ?? se.enseignantsRequired ?? se.required ?? 1) || 1;

                    // For non-TP sessions we keep per-session aggregation
                    if (!type.includes('tp')) {
                        totalRequiredTeachers += required;
                        totalAssignedTeachersCounted += Math.min(assignedCount, required);

                        // compter sans enseignant séparément pour Cours et TD
                        if (assignedCount === 0) {
                            if (type.includes('cours')) nbSansEnseignantCours++;
                            else if (type.includes('td')) nbSansEnseignantTD++;
                        }
                    } else {
                        // TP sessions:
                        if (!subjectHasTPStats) {
                            // fallback per-session behavior if no subject-level TP stats available
                            totalRequiredTeachers += required;
                            totalAssignedTeachersCounted += Math.min(assignedCount, required);
                            const missing = Math.max(0, (required - assignedCount));
                            tpEnseignantsManquants += missing;

                            // also count sessions with no teacher (for display)
                            if (assignedCount === 0) {
                                // keep detected zero-assignment accounted in nbSansEnseignant... for info
                            }
                        } else {
                            // subject-level TP stats exist — we'll account TP totals later from s.expectedTPPosts / s.assignedTPPosts
                            // do not add TP's required/assigned per session here to avoid double counting
                        }
                    }
                } catch (err) {
                    console.warn('renderSubjectStats: error processing seance', err);
                }
            });

            // If subject-level TP stats are present, use them (preferred)
            if (subjectHasTPStats) {
                const expectedTPPosts = Number(s.expectedTPPosts || 0);
                const assignedTPPosts = Number(s.assignedTPPosts || 0);
                tpEnseignantsManquants = Math.max(0, expectedTPPosts - assignedTPPosts);

                // include TP counts in completion ratio
                totalRequiredTeachers += expectedTPPosts;
                totalAssignedTeachersCounted += assignedTPPosts;
            }

            // total des manques
            const totalManques = tpEnseignantsManquants + nbSansEnseignantCours + nbSansEnseignantTD;

            // valeurs affichées (fallback aux valeurs déjà présentes dans subjectStats)
            const totalSeances = (s.totalSeances !== undefined) ? s.totalSeances : seancesOfSubject.length;
            const cours = (s.cours !== undefined) ? s.cours : seancesOfSubject.filter(se => (se.type || '').toString().toLowerCase().includes('cours')).length;
            const td = (s.td !== undefined) ? s.td : seancesOfSubject.filter(se => (se.type || '').toString().toLowerCase().includes('td')).length;
            const tp = (s.tp !== undefined) ? s.tp : seancesOfSubject.filter(se => (se.type || '').toString().toLowerCase().includes('tp')).length;

            // calculate completion percentage based on assigned/required if not provided
            let completionPercent = 0;
            if (Number(totalRequiredTeachers || 0) > 0) {
                completionPercent = Math.round((Number(totalAssignedTeachersCounted || 0) / Number(totalRequiredTeachers || 1)) * 100);
                // If there are required teachers and no missing teachers, force 100%
                if (totalManques === 0) completionPercent = 100;
            } else if (s.completion !== undefined) {
                completionPercent = Math.round(Number(s.completion || 0));
            } else {
                completionPercent = 0;
            }

            // ensure bounds 0-100
            completionPercent = Math.max(0, Math.min(100, Number(completionPercent || 0)));

            // couleur correspondant au pourcentage
            const completionColor = this.getCompletionColor(completionPercent);

            // abbreviation for "sans enseignant"
            const abbrSansEns = 's.ens';

            return `
                <tr>
                    <td><strong>${safeText(subjectName)}</strong></td>
                    <td>${safeText(s.filiere || '')}</td>
                    <td>${totalSeances}</td>
                    <td>${cours} ${nbSansEnseignantCours > 0 ? `<small class="muted">(${nbSansEnseignantCours} ${abbrSansEns})</small>` : ''}</td>
                    <td>${td} ${nbSansEnseignantTD > 0 ? `<small class="muted">(${nbSansEnseignantTD} ${abbrSansEns})</small>` : ''}</td>
                    <td>${tp}${tp > 0 ? ` <small class="muted">(${tpEnseignantsManquants} enseignants manquants)</small>` : ''}</td>
                    <td>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${completionPercent}%; background-color: ${completionColor}"></div>
                            <span class="progress-bar-text">${completionPercent}%</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="subject-stats-section">
                <h3>📚 Statistiques par Matière — Session courante</h3>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Matière</th>
                            <th>Filière</th>
                            <th>Total</th>
                            <th>Cours</th>
                            <th>TD</th>
                            <th>TP (manquants)</th>
                            <th>Complétion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${statsHtml}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Initialise tous les graphiques Chart.js
     * @param {Object} data - Les données
     */
    initCharts(data) {
        // Détruire les graphiques existants
        this.destroyCharts();

        // 1. Graphique charge enseignants
        this.initTeachersWorkloadChart(data.teachersWorkload);

        // 2. Graphique distribution séances
        this.initSessionsDistributionChart(data.sessionsDistribution);

        // 3. Heatmap créneaux
        this.initTimeSlotsHeatmap(data.timeSlotsHeatmap);

        // 4. Graphique occupation salles
        this.initRoomsOccupancyChart(data.roomsOccupancy);

        // 5. Timeline hebdomadaire
        this.initWeeklyTimelineChart(data.weeklyTimeline);
    }

    /**
     * Initialise le graphique de charge enseignants (barres horizontales)
     * @param {Array} data - Les données
     */
    // Remplacer uniquement la fonction initTeachersWorkloadChart par ce bloc
    initTeachersWorkloadChart(data) {
        const ctx = document.getElementById('teachersWorkloadChart');
        if (!ctx) return;

        const normalize = s => String(s || '').trim().toLowerCase();
        const normalizeMap = raw => {
            const out = {};
            Object.keys(raw || {}).forEach(k => { out[normalize(k)] = Number(raw[k] || 0); });
            return out;
        };

        let annualRaw = {};
        let usedSource = null;

        // Prefer explicit API on VolumeRenderer if available (reliable, aggregating all pages)
        const VR = (typeof VolumeRenderer !== 'undefined' && VolumeRenderer) ? VolumeRenderer
            : (typeof window !== 'undefined' && window.VolumeRenderer) ? window.VolumeRenderer
                : null;

        if (VR && typeof VR.getAnnualTeacherVolumes === 'function') {
            try {
                const vrMap = VR.getAnnualTeacherVolumes();
                if (vrMap && Object.keys(vrMap).length > 0) {
                    annualRaw = vrMap;
                    usedSource = 'VolumeRenderer.getAnnualTeacherVolumes()';
                }
            } catch (e) {
                console.warn('initTeachersWorkloadChart: VolumeRenderer.getAnnualTeacherVolumes failed', e);
            }
        }

        // Fallback to VolumeService.calculateAllVolumes if VR did not return useful data
        if (!annualRaw || Object.keys(annualRaw).length === 0) {
            try {
                if (typeof VolumeService !== 'undefined' && VolumeService && typeof VolumeService.calculateAllVolumes === 'function') {
                    const enseignants = StateManager.state.enseignants || [];
                    const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];
                    const combined = VolumeService.calculateAllVolumes(enseignants, allSeances, StateManager.state.enseignantVolumesSupplementaires || {}, StateManager.state.header?.session || '', StateManager.state.volumesAutomne || {}) || {};
                    if (combined && Object.keys(combined).length > 0) {
                        annualRaw = combined;
                        usedSource = 'VolumeService.calculateAllVolumes(allSeances)';
                    }
                }
            } catch (e) {
                console.warn('initTeachersWorkloadChart: VolumeService.calculateAllVolumes failed', e);
            }
        }

        // As a last resort, keep the old deep-scan heuristic on VR (if present)
        if ((!annualRaw || Object.keys(annualRaw).length === 0) && VR) {
            try {
                // lightweight deep-scan heuristics extracted from previous implementation
                const tryExtractNumericValue = (v) => {
                    if (v == null) return null;
                    if (typeof v === 'number' && !isNaN(v)) return Number(v);
                    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
                    if (typeof v === 'object') {
                        const cand = ['total', 'annual', 'volume', 'h', 'hours', 'value', 'v'];
                        for (let p of cand) if (v[p] !== undefined && !isNaN(Number(v[p]))) return Number(v[p]);
                        for (let k in v) {
                            const c = v[k];
                            if (typeof c === 'number' && !isNaN(c)) return Number(c);
                            if (typeof c === 'string' && c.trim() !== '' && !isNaN(Number(c))) return Number(c);
                        }
                    }
                    return null;
                };
                const findTeacherMapDeep = (root) => {
                    const visited = new WeakSet();
                    let best = { map: null, score: 0 };
                    const scoreNode = (node) => {
                        if (!node || typeof node !== 'object') return 0;
                        let numeric = 0, total = 0;
                        for (let k of Object.keys(node)) {
                            total++;
                            try { if (tryExtractNumericValue(node[k]) !== null) numeric++; } catch (e) {}
                        }
                        return numeric >= 1 ? (numeric * (total >= 10 ? 2 : 1)) : 0;
                    };
                    const build = (node) => {
                        const out = {};
                        for (let k of Object.keys(node)) {
                            const v = node[k];
                            const val = tryExtractNumericValue(v);
                            if (val !== null) out[k] = val;
                        }
                        return out;
                    };
                    const dfs = (n, depth = 0) => {
                        if (!n || typeof n !== 'object' || depth > 6 || visited.has(n)) return;
                        visited.add(n);
                        const sc = scoreNode(n);
                        if (sc > best.score) {
                            const cand = build(n);
                            if (Object.keys(cand).length > 0) best = { map: cand, score: sc };
                        }
                        for (let k of Object.keys(n)) {
                            try { if (typeof n[k] === 'object') dfs(n[k], depth + 1); } catch (e) {}
                        }
                    };
                    dfs(root, 0);
                    return best.map || null;
                };

                const candidates = [
                    () => (typeof VR.getAnnualTeacherVolumes === 'function' ? VR.getAnnualTeacherVolumes() : null),
                    () => (typeof VR.getAllTeacherVolumes === 'function' ? VR.getAllTeacherVolumes() : null),
                    () => (typeof VR.getTeacherAnnualMap === 'function' ? VR.getTeacherAnnualMap() : null),
                    () => (VR.annualTeacherVolumes ? VR.annualTeacherVolumes : null),
                    () => (VR.annualVolumes ? VR.annualVolumes : null),
                    () => (VR.teacherAnnualVolumes ? VR.teacherAnnualVolumes : null),
                    () => (typeof VR.getVolumes === 'function' ? VR.getVolumes() : null),
                    () => (VR.state ? VR.state : null),
                    () => (VR.data ? VR.data : null),
                    () => (VR.metrics ? VR.metrics : null),
                    () => VR
                ];
                for (let g of candidates) {
                    let cand = null;
                    try { cand = g(); } catch (e) { cand = null; }
                    if (cand && typeof cand === 'object' && Object.keys(cand).length > 0) {
                        const map = findTeacherMapDeep(cand);
                        if (map && Object.keys(map).length > 0) {
                            annualRaw = map;
                            usedSource = 'VolumeRenderer (deep scan fallback)';
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('initTeachersWorkloadChart: VolumeRenderer deep-scan fallback failed', e);
            }
        }

        // Normalize annualRaw keys
        const annualMap = normalizeMap(annualRaw || {});

        // Build teacher list (prefer StateManager names)
        const enseignants = (StateManager.state && Array.isArray(StateManager.state.enseignants) && StateManager.state.enseignants.length)
            ? StateManager.state.enseignants.slice()
            : (Array.isArray(data) ? data.map(d => d.nom || d.name || '').filter(Boolean) : []);

        // Construct array for chart
        const list = enseignants.map(nomRaw => {
            const key = normalize(nomRaw);
            const annual = Math.round(Number(annualMap[key] || 0));
            const base = Array.isArray(data) ? data.find(d => normalize(d.nom || d.name || '') === key) : null;
            return {
                nom: String(nomRaw || ''),
                annual,
                color: (base && base.color) || '#667eea',
                status: (base && base.status) || ''
            };
        });

        // If no enseignants but annualMap contains keys, use those
        if ((!list || list.length === 0) && Object.keys(annualMap).length > 0) {
            Object.keys(annualMap).forEach(k => {
                list.push({ nom: k, annual: Math.round(annualMap[k] || 0), color: '#667eea', status: '' });
            });
        }

        // Sort & limit
        const sorted = list.sort((a, b) => b.annual - a.annual).slice(0, 30);

        // Chart arrays
        const labels = sorted.map(s => s.nom);
        const volumes = sorted.map(s => s.annual);
        const colors = sorted.map(s => s.color);

        // Compute reference
        let referenceValue = 0;
        try {
            if (typeof SchedulingService !== 'undefined' && typeof SchedulingService.computeMaxWorkloadForCurrentSession === 'function') {
                referenceValue = Number(SchedulingService.computeMaxWorkloadForCurrentSession() || 0);
            } else if (StateManager && StateManager.state && StateManager.state.toleranceMaxWorkload !== undefined) {
                referenceValue = Number(StateManager.state.toleranceMaxWorkload || 0);
            }
        } catch (err) {
            console.warn('initTeachersWorkloadChart: unable to compute referenceValue', err);
        }

       // console.debug('initTeachersWorkloadChart: usedSource=', usedSource, 'annualMap sample=', Object.entries(annualMap).slice(0, 12), 'sorted sample=', sorted.slice(0, 12));

        // Render chart
        this.charts.teachersWorkload = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Volume annuel (hTP)',
                        data: volumes,
                        backgroundColor: colors,
                        borderColor: colors,
                        borderWidth: 1
                    },
                    {
                        type: 'line',
                        label: 'Référence',
                        data: labels.map(() => referenceValue),
                        borderColor: 'rgba(220, 53, 69, 0.95)',
                        borderWidth: 2,
                        pointRadius: 0,
                        borderDash: [6, 4],
                        fill: false,
                        order: 2
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctxItem) => {
                                if (!ctxItem) return '';
                                const idx = ctxItem.dataIndex;
                                const val = volumes[idx] || 0;
                                const teacher = sorted[idx] || {};
                                return `${val} h — ${teacher.status || ''}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Volume hTP' } }
                }
            }
        });
    }

    /**
     * Initialise le graphique de distribution (camembert)
     * @param {Object} data - Les données
     */
    initSessionsDistributionChart(data) {
        const ctx = document.getElementById('sessionsDistributionChart');
        if (!ctx || !data) return;

        try {
            // safety: ensure arrays
            const labels = Array.isArray(data.labels) ? data.labels.slice() : [];
            const values = Array.isArray(data.data) ? data.data.slice() : [];
            const colors = Array.isArray(data.colors) ? data.colors.slice() : [];

            // aggregate if many slices (avoid rendering 100+ labels)
            const maxSlices = 12;
            const aggregatePieData = (labelsArr, valuesArr, colorsArr, maxSlicesLocal = 12) => {
                if (!Array.isArray(labelsArr) || labelsArr.length <= maxSlicesLocal) {
                    return { labels: labelsArr, values: valuesArr, colors: colorsArr };
                }
                const items = labelsArr.map((l, i) => ({ label: l, value: Number(valuesArr[i] || 0), color: (colorsArr && colorsArr[i]) || '#ccc' }));
                items.sort((a, b) => b.value - a.value);
                const top = items.slice(0, maxSlicesLocal - 1);
                const rest = items.slice(maxSlicesLocal - 1);
                const restValue = rest.reduce((s, it) => s + (Number(it.value) || 0), 0);
                const aggregated = [...top, { label: 'Autres', value: restValue, color: '#e9ecef' }];
                return {
                    labels: aggregated.map(i => i.label),
                    values: aggregated.map(i => i.value),
                    colors: aggregated.map(i => i.color)
                };
            };

            const aggregated = aggregatePieData(labels, values, colors, maxSlices);

            this.charts.sessionsDistribution = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: aggregated.labels,
                    datasets: [{
                        data: aggregated.values,
                        backgroundColor: aggregated.colors,
                        borderColor: '#fff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = aggregated.values.reduce((s, v) => s + (Number(v) || 0), 0) || 1;
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } catch (err) {
            console.warn('initSessionsDistributionChart error', err);
        }

    }

    /**
     * Initialise la heatmap des créneaux
     * @param {Object} data - Les données
     */
    initTimeSlotsHeatmap(data) {
        const container = document.getElementById('timeSlotsHeatmap');
        if (!container) return;

        let html = '<table class="heatmap-table"><thead><tr><th>Jour/Créneau</th>';

        // En-têtes créneaux
        data.creneaux.forEach(creneau => {
            html += `<th>${creneau}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Lignes jours
        data.jours.forEach(jour => {
            html += `<tr><th>${jour}</th>`;
            data.creneaux.forEach(creneau => {
                const cell = data.data[jour][creneau];
                html += `<td class="heatmap-cell heatmap-${cell.level}" style="background-color: ${cell.color}" title="${cell.count} séance(s)">
                    ${cell.count > 0 ? cell.count : ''}
                </td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';

        // Légende
        html += `
            <div class="heatmap-legend">
                <span class="legend-item"><span class="legend-color" style="background-color: #e9ecef"></span> Vide</span>
                <span class="legend-item"><span class="legend-color" style="background-color: #d1ecf1"></span> Faible</span>
                <span class="legend-item"><span class="legend-color" style="background-color: #fff3cd"></span> Moyen</span>
                <span class="legend-item"><span class="legend-color" style="background-color: #f8d7da"></span> Élevé</span>
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * Initialise le graphique d'occupation des salles
     * @param {Array} data - Les données
     */
    initRoomsOccupancyChart(data) {
        const ctx = document.getElementById('roomsOccupancyChart');
        if (!ctx) return;

        // Limiter aux 10 premières salles
        const topRooms = data.slice(0, 10);

        this.charts.roomsOccupancy = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topRooms.map(r => r.salle),
                datasets: [{
                    label: 'Taux d\'occupation (%)',
                    data: topRooms.map(r => r.occupancyRate),
                    backgroundColor: topRooms.map(r => r.color),
                    borderColor: topRooms.map(r => r.color),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const room = topRooms[context.dataIndex];
                                return `${context.parsed.y}% (${room.totalSeances} séances)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Taux d\'occupation (%)'
                        }
                    }
                }
            }
        });
    }

    /**
     * Initialise le graphique timeline hebdomadaire
     * @param {Object} data - Les données
     */
    initWeeklyTimelineChart(data) {
        const ctx = document.getElementById('weeklyTimelineChart');
        if (!ctx || !data) return;

        try {
            // If there are many points (e.g. > 120), downsample to ~120 points by picking every Nth
            let labels = Array.isArray(data.labels) ? data.labels.slice() : [];
            let vals = Array.isArray(data.data) ? data.data.slice() : [];
            const maxPoints = 120;

            if (labels.length > maxPoints) {
                const step = Math.ceil(labels.length / maxPoints);
                const sampledLabels = [];
                const sampledVals = [];
                for (let i = 0; i < labels.length; i += step) {
                    sampledLabels.push(labels[i]);
                    // average over the step window
                    let sum = 0, count = 0;
                    for (let j = i; j < Math.min(i + step, vals.length); j++) {
                        sum += Number(vals[j] || 0);
                        count++;
                    }
                    sampledVals.push(count ? Math.round(sum / count) : 0);
                }
                labels = sampledLabels;
                vals = sampledVals;
                console.debug('initWeeklyTimelineChart downsampled to', labels.length, 'points');
            }

            this.charts.weeklyTimeline = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Nombre de séances',
                        data: vals,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                afterLabel: (context) => {
                                    return `Moyenne: ${data.average || '—'} séances/jour`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Nombre de séances'
                            },
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        } catch (err) {
            console.warn('initWeeklyTimelineChart error', err);
        }
    }

    /**
     * Détruit tous les graphiques
     */
    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};
    }

    /**
     * Obtient la couleur selon le taux de complétion
     * @param {number} completion - Le pourcentage
     * @returns {string} La couleur
     */
    getCompletionColor(completion) {
        if (completion >= 100) return '#28a745';
        if (completion >= 75) return '#ffc107';
        if (completion >= 50) return '#fd7e14';
        return '#dc3545';
    }
}

// Export d'une instance singleton
export default new DashboardRenderer();