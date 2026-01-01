/**
 * Service de gestion des logs et messages
 * @author Ibrahim Mrani - UCD
 *
 * Sécurité :
 * - Lorsqu'on autorise du HTML (allowHtml=true), on utilise DOMPurify si présent pour assainir.
 * - Sinon fallback sûr : on échappe le HTML puis on convertit les sauts de ligne en <br>.
 * - Le type (classe CSS) est validé contre LOG_TYPES pour éviter injection de classes inattendues.
 */

import { LOG_TYPES } from '../config/constants.js';
import { escapeHTML } from '../utils/sanitizers.js';

class LogService {
    constructor() {
        this.messagesContainer = null;
        this.initialized = false;
    }

    /**
     * Initialise le service avec le conteneur de messages
     * @param {string} containerId - L'ID du conteneur DOM
     */
    init(containerId = 'messages') {
        this.messagesContainer = document.getElementById(containerId);
        if (this.messagesContainer) {
            this.initialized = true;
        } else {
            console.warn(`Container #${containerId} not found for LogService`);
        }
    }

    /**
     * Ajoute un message au journal
     * @param {string} message - Le message à logger
     * @param {string} type - Le type de message (success, error, warning, initial)
     * @param {boolean} allowHtml - Permet le HTML dans le message
     */
    log(message, type = LOG_TYPES.INITIAL, allowHtml = false) {
        if (!this.initialized) {
            console.warn('LogService not initialized');
            console.log(`[${type}] ${message}`);
            return;
        }

        const p = document.createElement('p');

        // Valider le type pour éviter injection de classe CSS ou valeurs inattendues
        try {
            const allowed = Array.isArray(Object.values(LOG_TYPES)) ? Object.values(LOG_TYPES) : [];
            const safeType = (allowed && allowed.includes(type)) ? type : (LOG_TYPES.INITIAL || '');
            p.className = safeType;
        } catch (e) {
            p.className = String(type || '');
        }

        // Sécurisation du contenu :
        // - si allowHtml true : utiliser DOMPurify.sanitize si disponible
        // - sinon fallback : escapeHTML + convertir \n en <br>
        try {
            if (allowHtml) {
                if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
                    p.innerHTML = window.DOMPurify.sanitize(String(message));
                } else {
                    // safe fallback : échapper le HTML puis remplacer les sauts de ligne par <br>
                    p.innerHTML = escapeHTML(String(message)).replace(/\r?\n/g, '<br>');
                }
            } else {
                p.textContent = String(message);
            }
        } catch (err) {
            // en cas d'erreur inattendue, tomber en mode texte brut
            p.textContent = String(message);
            console.warn('LogService: message rendering fallback to textContent due to error', err);
        }

        // Ajouter en haut de la liste (prepend)
        if (typeof this.messagesContainer.prepend === 'function') {
            this.messagesContainer.prepend(p);
        } else if (this.messagesContainer.firstChild) {
            this.messagesContainer.insertBefore(p, this.messagesContainer.firstChild);
        } else {
            this.messagesContainer.appendChild(p);
        }

        // Limiter le nombre de messages (optionnel)
        this.trimLogs(100);
    }

    /**
     * Log avec HTML sécurisé
     * @param {string} message - Le message (peut contenir des balises <strong>, etc.)
     * @param {string} type - Le type de message
     */
    logHtml(message, type = LOG_TYPES.INITIAL) {
        this.log(message, type, true);
    }

    /**
     * Log de succès
     * @param {string} message - Le message
     */
    success(message) {
        this.log(message, LOG_TYPES.SUCCESS);
    }

    /**
     * Log d'erreur
     * @param {string} message - Le message
     */
    error(message) {
        this.log(message, LOG_TYPES.ERROR);
    }

    /**
     * Log d'avertissement
     * @param {string} message - Le message
     */
    warning(message) {
        this.log(message, LOG_TYPES.WARNING);
    }

    /**
     * Log informatif
     * @param {string} message - Le message
     */
    info(message) {
        this.log(message, LOG_TYPES.INITIAL);
    }

    /**
     * Vide le journal
     */
    clear() {
        if (this.messagesContainer) {
            this.messagesContainer.innerHTML = '';
            // Note: écrire un message de vidage en texte brut (évite boucles HTML)
            this.log('🗑️ Journal des opérations vidé.', LOG_TYPES.INITIAL);
        }
    }

    /**
     * Limite le nombre de messages affichés
     * @param {number} maxMessages - Nombre maximum de messages
     */
    trimLogs(maxMessages = 100) {
        if (!this.messagesContainer) return;

        const messages = this.messagesContainer.children;
        while (messages.length > maxMessages) {
            this.messagesContainer.removeChild(messages[messages.length - 1]);
        }
    }

    /**
     * Obtient tous les messages
     * @returns {Array<Object>} Les messages { text, type }
     */
    getMessages() {
        if (!this.messagesContainer) return [];

        return Array.from(this.messagesContainer.children).map(p => ({
            text: p.textContent,
            type: p.className
        }));
    }

    /**
     * Export des logs en texte
     * @returns {string} Les logs formatés
     */
    exportLogs() {
        const messages = this.getMessages();
        return messages.map(m => `[${m.type.toUpperCase()}] ${m.text}`).join('\n');
    }
}

// Export d'une instance singleton
export default new LogService();