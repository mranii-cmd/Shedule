// import { escapeHTML } from '../utils/sanitizers.js';
/**
 * Gestionnaire du spinner de chargement
 * @author Ibrahim Mrani - UCD
 */

class SpinnerManager {
    constructor() {
        this.overlay = null;
        this.initialized = false;
        this.activeCount = 0; // Pour gérer les appels imbriqués
    }

    /**
     * Initialise le gestionnaire avec l'overlay
     * @param {string} overlayId - L'ID de l'overlay
     */
    init(overlayId = 'loading-overlay') {
        this.overlay = document.getElementById(overlayId);
        
        if (!this.overlay) {
            console.warn(`Spinner overlay #${overlayId} not found`);
            return;
        }

        this.initialized = true;
    }

    /**
     * Affiche le spinner
     */
    show() {
        if (!this.initialized) {
            console.warn('SpinnerManager not initialized');
            return;
        }

        this.activeCount++;
        if (this.overlay) {
            this.overlay.style.display = 'flex';
        }
    }

    /**
     * Masque le spinner
     * @param {boolean} force - Force le masquage même si activeCount > 1
     */
    hide(force = false) {
        if (!this.initialized) return;

        if (force) {
            this.activeCount = 0;
        } else {
            this.activeCount = Math.max(0, this.activeCount - 1);
        }

        if (this.activeCount === 0 && this.overlay) {
            this.overlay.style.display = 'none';
        }
    }

    /**
     * Exécute une fonction avec le spinner actif
     * @param {Function} fn - La fonction à exécuter
     * @param {number} minDuration - Durée minimale d'affichage (ms)
     * @returns {Promise} Le résultat de la fonction
     */
    async withSpinner(fn, minDuration = 300) {
        this.show();
        const startTime = Date.now();

        try {
            const result = await fn();
            
            // S'assurer que le spinner reste visible au moins minDuration ms
            const elapsed = Date.now() - startTime;
            if (elapsed < minDuration) {
                await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
            }

            return result;
        } finally {
            this.hide();
        }
    }

    /**
     * Réinitialise le compteur (en cas d'erreur)
     */
    reset() {
        this.activeCount = 0;
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }
}

// Export d'une instance singleton
export default new SpinnerManager();