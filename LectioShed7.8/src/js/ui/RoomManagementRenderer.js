/**
 * Renderer pour le menu de gestion des salles
 * @author Ibrahim Mrani - UCD
 * @date 2025-11-06
 */

import RoomController from '../controllers/RoomController.js';
import StateManager from '../controllers/StateManager.js';
import { safeText } from '../utils/sanitizers.js';
import { getSortedCreneauxKeys } from '../utils/helpers.js';
import { escapeHTML } from '../utils/sanitizers.js';

class RoomManagementRenderer {
    constructor() {
        this.container = null;
        this.currentView = 'overview'; // overview, slot-view, room-detail
        this.selectedSlot = { jour: 'Lundi', creneau: '8h30' };
        this.selectedRoom = null;
    }

    /**
     * Initialise le renderer
     * @param {string} containerId - L'ID du conteneur
     */
    init(containerId = 'roomManagementContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found`);
        }
    }

    /**
     * Rend le menu complet de gestion des salles
     */
    render() {
        if (!this.container) return;

        const html = `
            <div class="room-management">
                ${this.renderHeader()}
                ${this.renderViewSelector()}
                ${this.renderContent()}
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    /**
     * Rend l'en-tête
     * @returns {string} HTML
     */
    renderHeader() {
        const stats = RoomController.getGlobalStats();

        return `
            <div class="room-header">
                <h2>🏛️ Gestion des Salles</h2>
                <div class="room-stats-mini">
                    <div class="stat-mini">
                        <span class="stat-value">${stats.totalSalles}</span>
                        <span class="stat-label">Salles</span>
                    </div>
                    <div class="stat-mini">
                        <span class="stat-value">${stats.avgOccupancy}%</span>
                        <span class="stat-label">Occupation moy.</span>
                    </div>
                    <div class="stat-mini ${stats.sousUtilisees > 0 ? 'stat-warning' : ''}">
                        <span class="stat-value">${stats.sousUtilisees}</span>
                        <span class="stat-label">Sous-utilisées</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Rend le sélecteur de vue
     * @returns {string} HTML
     */
    renderViewSelector() {
        return `
            <div class="view-selector-tabs">
                <button class="view-tab ${this.currentView === 'overview' ? 'active' : ''}" data-view="overview">
                    📊 Vue d'ensemble
                </button>
                <button class="view-tab ${this.currentView === 'slot-view' ? 'active' : ''}" data-view="slot-view">
                    🕐 Par créneau
                </button>
                <button class="view-tab ${this.currentView === 'room-detail' ? 'active' : ''}" data-view="room-detail">
                    🏛️ Détail salle
                </button>
            </div>
        `;
    }

    /**
     * Rend le contenu selon la vue active
     * @returns {string} HTML
     */
    renderContent() {
        switch (this.currentView) {
            case 'overview':
                return this.renderOverview();
            case 'slot-view':
                return this.renderSlotView();
            case 'room-detail':
                return this.renderRoomDetail();
            default:
                return '';
        }
    }

    /**
     * Rend la vue d'ensemble
     * @returns {string} HTML
     */
    renderOverview() {
        const rooms = RoomController.getAllRoomsWithStats();
        const stats = RoomController.getGlobalStats();

        let html = `
            <div class="overview-content">
                <div class="overview-stats">
                    <h3>📊 Statistiques Globales</h3>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon">🏛️</div>
                            <div class="stat-info">
                                <div class="stat-value">${stats.totalSalles}</div>
                                <div class="stat-label">Salles au total</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📅</div>
                            <div class="stat-info">
                                <div class="stat-value">${stats.totalSeances}</div>
                                <div class="stat-label">Séances planifiées</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">📊</div>
                            <div class="stat-info">
                                <div class="stat-value">${stats.avgOccupancy}%</div>
                                <div class="stat-label">Occupation moyenne</div>
                            </div>
                        </div>
                    </div>

                    <div class="type-distribution">
                        <h4>Répartition par type</h4>
                        <div class="type-list">
        `;

        Object.entries(stats.parType).forEach(([type, count]) => {
            html += `
                <div class="type-item">
                    <span class="type-badge type-${type.toLowerCase()}">${type}</span>
                    <span class="type-count">${count} salle(s)</span>
                </div>
            `;
        });

        html += `
                        </div>
                    </div>
                </div>

                <div class="rooms-list-section">
                    <h3>🏛️ Liste des Salles</h3>
                    <div class="rooms-table-container">
                        <table class="rooms-table">
                            <thead>
                                <tr>
                                    <th>Salle</th>
                                    <th>Type</th>
                                    <th>Séances</th>
                                    <th>Occupation</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        rooms.forEach(room => {
            const occupancyClass = room.stats.occupancy.rate >= 80 ? 'high' : 
                                  room.stats.occupancy.rate >= 60 ? 'medium' : 
                                  room.stats.occupancy.rate >= 40 ? 'normal' : 'low';

            html += `
                <tr>
                    <td><strong>${safeText(room.nom)}</strong></td>
                    <td><span class="type-badge type-${room.type.toLowerCase()}">${safeText(room.type)}</span></td>
                    <td>${room.stats.totalSeances}</td>
                    <td>
                        <div class="occupancy-bar">
                            <div class="occupancy-fill occupancy-${occupancyClass}" style="width: ${room.stats.occupancy.rate}%"></div>
                            <span class="occupancy-text">${room.stats.occupancy.rate}%</span>
                        </div>
                        <small class="occupancy-label">${room.stats.occupancy.label}</small>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="window.EDTRoomManagement?.viewRoomDetail('${this.escapeQuotes(room.nom)}')">
                            👁️ Voir
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Rend la vue par créneau
     * @returns {string} HTML
     */
    renderSlotView() {
        const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const creneaux = getSortedCreneauxKeys();

        const status = RoomController.getRoomsStatusForSlot(
            this.selectedSlot.jour,
            this.selectedSlot.creneau
        );

        let html = `
            <div class="slot-view-content">
                <div class="slot-selector">
                    <div class="selector-group">
                        <label>Jour :</label>
                        <select id="slotJourSelect" class="form-select">
        `;

        jours.forEach(jour => {
            html += `<option value="${jour}" ${jour === this.selectedSlot.jour ? 'selected' : ''}>${jour}</option>`;
        });

        html += `
                        </select>
                    </div>
                    <div class="selector-group">
                        <label>Créneau :</label>
                        <select id="slotCreneauSelect" class="form-select">
        `;

        creneaux.forEach(creneau => {
            const creneauData = StateManager.state.creneaux[creneau];
            const label = creneauData ? `${creneau} - ${creneauData.fin}` : creneau;
            html += `<option value="${creneau}" ${creneau === this.selectedSlot.creneau ? 'selected' : ''}>${label}</option>`;
        });

        html += `
                        </select>
                    </div>
                </div>

                <div class="slot-status-grid">
                    <div class="status-column status-free">
                        <div class="status-header">
                            <h3>✅ Salles Libres (${status.libres.length})</h3>
                        </div>
                        <div class="rooms-cards">
        `;

        if (status.libres.length === 0) {
            html += '<p class="empty-message">Aucune salle libre à ce créneau</p>';
        } else {
            status.libres.forEach(room => {
                html += `
                    <div class="room-card room-free">
                        <div class="room-card-header">
                            <strong>${safeText(room.nom)}</strong>
                            <span class="type-badge type-${room.type.toLowerCase()}">${safeText(room.type)}</span>
                        </div>
                        <div class="room-card-body">
                            <span class="status-badge status-available">Disponible</span>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                        </div>
                    </div>

                    <div class="status-column status-occupied">
                        <div class="status-header">
                            <h3>❌ Salles Occupées (${status.occupees.length})</h3>
                        </div>
                        <div class="rooms-cards">
        `;

        if (status.occupees.length === 0) {
            html += '<p class="empty-message">Aucune salle occupée à ce créneau</p>';
        } else {
            status.occupees.forEach(room => {
                html += `
                    <div class="room-card room-occupied">
                        <div class="room-card-header">
                            <strong>${safeText(room.nom)}</strong>
                            <span class="type-badge type-${room.type.toLowerCase()}">${safeText(room.type)}</span>
                        </div>
                        <div class="room-card-body">
                            ${room.seance ? `
                                <div class="seance-info">
                                    <div class="seance-matiere">${safeText(room.seance.matiere)}</div>
                                    <div class="seance-details">
                                        <span class="seance-type type-${room.seance.type.toLowerCase()}">${safeText(room.seance.type)}</span>
                                        <span class="seance-groupe">${safeText(room.seance.groupe)}</span>
                                    </div>
                                    <div class="seance-teacher">
                                        👨‍🏫 ${safeText(room.seance.enseignant)}
                                    </div>
                                </div>
                            ` : '<span class="status-badge status-occupied">Occupée</span>'}
                        </div>
                    </div>
                `;
            });
        }

        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Rend le détail d'une salle
     * @returns {string} HTML
     */
    renderRoomDetail() {
        if (!this.selectedRoom) {
            const rooms = RoomController.getAllRoomsWithStats();
            if (rooms.length > 0) {
                this.selectedRoom = rooms[0].nom;
            } else {
                return '<p class="empty-message">Aucune salle disponible</p>';
            }
        }

        const rooms = RoomController.getAllRoomsWithStats();
        const gridData = RoomController.getRoomOccupancyGrid(this.selectedRoom);

        let html = `
            <div class="room-detail-content">
                <div class="room-selector">
                    <label>Sélectionner une salle :</label>
                    <select id="roomDetailSelect" class="form-select">
        `;

        rooms.forEach(room => {
            html += `<option value="${this.escapeQuotes(room.nom)}" ${room.nom === this.selectedRoom ? 'selected' : ''}>
                ${safeText(room.nom)} (${safeText(room.type)})
            </option>`;
        });

        html += `
                    </select>
                </div>

                <div class="room-info-card">
                    <h3>🏛️ ${safeText(gridData.salle)}</h3>
                    <div class="room-meta">
                        <span class="type-badge type-${gridData.type.toLowerCase()}">${safeText(gridData.type)}</span>
                    </div>
                </div>

                <div class="room-grid-container">
                    <h4>📅 Grille d'occupation hebdomadaire</h4>
                    <div class="room-grid-scroll">
                        <table class="room-grid-table">
                            <thead>
                                <tr>
                                    <th>Jour / Créneau</th>
        `;

        gridData.creneaux.forEach(creneau => {
            html += `<th>${creneau}</th>`;
        });

        html += `
                                </tr>
                            </thead>
                            <tbody>
        `;

        gridData.jours.forEach(jour => {
            html += `<tr><th>${jour}</th>`;
            
            gridData.creneaux.forEach(creneau => {
                const cell = gridData.grid[jour][creneau];
                
                if (cell.occupied) {
                    html += `
                        <td class="grid-cell cell-occupied" title="${safeText(cell.matiere)} - ${safeText(cell.groupe)}">
                            <div class="cell-content">
                                <div class="cell-matiere">${safeText(cell.matiere)}</div>
                                <div class="cell-type type-${cell.type.toLowerCase()}">${safeText(cell.type)}</div>
                                <div class="cell-groupe">${safeText(cell.groupe)}</div>
                            </div>
                        </td>
                    `;
                } else {
                    html += `<td class="grid-cell cell-free" title="Libre"><span class="cell-status">✓</span></td>`;
                }
            });
            
            html += '</tr>';
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Attache les event listeners
     */
    attachEventListeners() {
        // Sélecteur de vue
        const viewTabs = document.querySelectorAll('.view-tab');
        viewTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentView = tab.dataset.view;
                this.render();
            });
        });

        // Sélecteurs de créneau
        const jourSelect = document.getElementById('slotJourSelect');
        const creneauSelect = document.getElementById('slotCreneauSelect');

        if (jourSelect) {
            jourSelect.addEventListener('change', () => {
                this.selectedSlot.jour = jourSelect.value;
                this.render();
            });
        }

        if (creneauSelect) {
            creneauSelect.addEventListener('change', () => {
                this.selectedSlot.creneau = creneauSelect.value;
                this.render();
            });
        }

        // Sélecteur de salle
        const roomSelect = document.getElementById('roomDetailSelect');
        if (roomSelect) {
            roomSelect.addEventListener('change', () => {
                this.selectedRoom = roomSelect.value;
                this.render();
            });
        }
    }

    /**
     * Change la vue vers le détail d'une salle
     * @param {string} roomName - Le nom de la salle
     */
    viewRoomDetail(roomName) {
        this.selectedRoom = roomName;
        this.currentView = 'room-detail';
        this.render();
    }

    /**
     * Échappe les guillemets
     * @param {string} str - La chaîne
     * @returns {string} La chaîne échappée
     */
    escapeQuotes(str) {
        return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
    }
}

export default new RoomManagementRenderer();