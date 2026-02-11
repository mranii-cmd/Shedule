/**
 * Renderer pour l'affichage des statistiques
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import SubjectController from '../controllers/SubjectController.js';
import TeacherController from '../controllers/TeacherController.js';
import RoomController from '../controllers/RoomController.js';
import { safeText } from '../utils/sanitizers.js';
import { filterSubjectsByDepartment, filterSubjectNamesByDepartment } from '../utils/helpers.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class StatsRenderer {
    constructor() {
        this.container = null;
    }

    /**
     * Initialise le renderer
     * @param {string} containerId - L'ID du conteneur
     */
    init(containerId = 'statsContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found`);
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
        const enseignants = StateManager.state.enseignants;
        const departement = StateManager.state?.header?.departement || '';
        
        // Filtrer les matières par département en utilisant la fonction helper
        const allMatieres = Object.keys(StateManager.state.matiereGroupes);
        const matieres = filterSubjectNamesByDepartment(allMatieres, departement, StateManager.state.matiereGroupes);
        
        const salles = Object.keys(StateManager.state.sallesInfo);

        const seancesWithTeacher = seances.filter(s => s.hasTeacher()).length;
        const seancesWithRoom = seances.filter(s => s.hasRoom()).length;
        
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

        const maxByType = Math.max(...Object.values(byType));
        const maxByDay = Math.max(...Object.values(byDay));

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

        return `
            <div class="inconsistencies-section">
                <h3>⚠️ Incohérences Détectées (${allInconsistencies.length}) — Session ${safeText(sessionType)}</h3>
                <div class="inconsistencies-list">
                    ${allInconsistencies.map(item => `
                        <div class="inconsistency-item">
                            <div class="inconsistency-subject">${safeText(item.subject)} <small class="filiere-tag">(${safeText(item.filiere)})</small></div>
                            <ul class="inconsistency-issues">
                                ${item.issues.map(issue => `<li>${safeText(issue)}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
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
}

// Export d'une instance singleton
export default new StatsRenderer();