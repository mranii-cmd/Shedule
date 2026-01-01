/**
 * Renderer pour l'affichage des listes (enseignants, matières, salles)
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
            }
        });
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
     * Rend la liste des enseignants
     */
    renderTeachersList() {
        if (!this.containers.teachers) return;

        const teachers = TeacherController.getAllTeachersWithStats();

        let html = `
            <div class="list-header">
                <h3>👨‍🏫 Enseignants (${teachers.length})</h3>
                <button class="btn btn-sm btn-primary" onclick="window.EDTApp?.switchToConfigTab()">
                    ➕ Ajouter
                </button>
            </div>
            <div class="list-items">
        `;

        if (teachers.length === 0) {
            // utilisation d'un template literal pour éviter des soucis d'apostrophe
            html += `<p class="empty-message">Aucun enseignant enregistré. Utilisez le bouton "Ajouter" ou allez dans l'onglet Configuration.</p>`;
        } else {
            teachers.forEach(teacher => {
                html += this.renderTeacherItem(teacher);
            });
        }

        html += '</div>';

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
                    <span class="detail-badge">📅 ${teacher.stats.totalSeances} séances</span>
                    <span class="detail-badge">📊 ${teacher.stats.volume.total} hTP</span>
                    ${teacher.stats.matieres.length > 0 ? 
                        `<span class="detail-badge">📚 ${teacher.stats.matieres.length} matière(s)</span>` 
                        : ''
                    }
                </div>
            </div>
        `;
    }

    /**
     * Rend la liste des matières
     *
     * Nouveau comportement : n'affiche que les matières liées aux filières de la session courante.
     * - Si session non déterminée on affiche tout (avec note).
     * - Si aucune filière pour la session -> message informatif.
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
            // session non définie : informer l'utilisateur et montrer tout
            noteHtml = `<div class="list-note">Session non définie — affichage de toutes les matières</div>`;
        } else {
            // Filtrer filières correspondant à la session
            const filieres = StateManager.state.filieres || [];
            const filieresForSession = filieres
                .filter(f => String(f.session || '').toLowerCase() === sessionLabelHuman.toLowerCase())
                .map(f => String(f.nom || '').trim())
                .filter(Boolean);

            if (filieresForSession.length === 0) {
                // pas de filières pour la session
                this.containers.subjects.innerHTML = `
                    <div class="list-header">
                        <h3>📚 Matières (0)</h3>
                    </div>
                    <div class="empty-message">Aucune filière configurée pour la session ${safeText(sessionLabelHuman)}.</div>
                `;
                return;
            }

            // appliquer filtre sur les matières selon leur config.filiere
            subjectsToShow = allSubjects.filter(s => {
                const cfgFiliere = (s.config && s.config.filiere) ? String(s.config.filiere).trim()
                    : (StateManager.state.matiereGroupes && StateManager.state.matiereGroupes[s.nom] ? StateManager.state.matiereGroupes[s.nom].filiere : '');
                return cfgFiliere && filieresForSession.includes(cfgFiliere);
            });

            noteHtml = `<div class="list-note">Matières filtrées pour la session ${safeText(sessionLabelHuman)}</div>`;
        }

        const subjects = subjectsToShow || [];

        let html = `
            <div class="list-header">
                <h33>📚 Matières (${subjects.length})</h3>
                <button class="btn btn-sm btn-primary" onclick="window.EDTApp?.switchToConfigTab()">
                    ➕ Ajouter
                </button>
            </div>
            ${noteHtml}
            <div class="list-items">
        `;

        if (subjects.length === 0) {
            html += '<p class="empty-message">Aucune matière enregistrée pour la sélection actuelle.</p>';
        } else {
            subjects.forEach(subject => {
                html += this.renderSubjectItem(subject);
            });
        }

        html += '</div>';

        this.containers.subjects.innerHTML = html;
    }

    /**
     * Rend un élément matière
     * @param {Object} subject - Les données de la matière
     * @returns {string} HTML
     */
    renderSubjectItem(subject) {
        const completionClass = subject.stats.completionRate >= 100 ? 'complete' : 
                               subject.stats.completionRate >= 50 ? 'partial' : 'incomplete';

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
                    <span class="detail-badge">📅 ${subject.stats.totalSeances} séances</span>
                    <span class="detail-badge">⏰ ${subject.stats.vht} hTP</span>
                    <span class="detail-badge completion-badge ${completionClass}">
                        ${subject.stats.completionRate}% complété
                    </span>
                </div>
            </div>
        `;
    }

    /**
     * Rend la liste des salles
     */
    renderRoomsList() {
        if (!this.containers.rooms) return;

        const rooms = RoomController.getAllRoomsWithStats();

        let html = `
            <div class="list-header">
                <h3>🏛️ Salles (${rooms.length})</h3>
                <button class="btn btn-sm btn-primary" onclick="window.EDTApp?.switchToConfigTab()">
                    ➕ Ajouter
                </button>
            </div>
            <div class="list-items">
        `;

        if (rooms.length === 0) {
            html += `<p class="empty-message">Aucune salle enregistrée. Utilisez le bouton "Ajouter" ou allez dans l'onglet Configuration.</p>`;
        } else {
            rooms.forEach(room => {
                html += this.renderRoomItem(room);
            });
        }

        html += '</div>';

        this.containers.rooms.innerHTML = html;
    }

    /**
     * Rend un élément salle
     * @param {Object} room - Les données de la salle
     * @returns {string} HTML
     */
    renderRoomItem(room) {
        const occupancyClass = room.stats.occupancy.rate >= 80 ? 'high' : 
                              room.stats.occupancy.rate >= 50 ? 'medium' : 'low';

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
                    <span class="detail-badge">📅 ${room.stats.totalSeances} séances</span>
                    <span class="detail-badge occupancy-badge ${occupancyClass}">
                        📊 ${room.stats.occupancy.rate}% occupée
                    </span>
                </div>
            </div>
        `;
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