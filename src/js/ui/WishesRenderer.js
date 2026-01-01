/**
 * Renderer pour l'affichage des souhaits des enseignants
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import { safeText } from '../utils/sanitizers.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class WishesRenderer {
    constructor() {
        this.container = null;
    }

    /**
     * Initialise le renderer
     * @param {string} containerId - L'ID du conteneur
     */
    init(containerId = 'wishesListContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found`);
        }
    }

    /**
     * Rend la liste complète des souhaits
     */
    render() {
        if (!this.container) return;

        const enseignants = StateManager.state.enseignants;
        const souhaits = StateManager.state.enseignantSouhaits;

        if (enseignants.length === 0) {
            this.container.innerHTML = '<p class="empty-message">Aucun enseignant enregistré</p>';
            return;
        }

        let html = '<div class="wishes-list">';

        enseignants.forEach(nom => {
            const wish = souhaits[nom] || this.getDefaultWishes();
            html += this.renderTeacherWish(nom, wish);
        });

        html += '</div>';

        this.container.innerHTML = html;
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
                    <button class="btn-icon" onclick="window.EDTApp?.loadTeacherWishes('${safeText(nom)}')" title="Modifier">
                        ✏️
                    </button>
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
}

// Export d'une instance singleton
export default new WishesRenderer();