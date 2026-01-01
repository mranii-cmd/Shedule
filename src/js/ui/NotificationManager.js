
import { safeText, escapeHTML } from '../utils/sanitizers.js';
/**
 * Gestionnaire de notifications et alertes
 * @author Ibrahim Mrani - UCD
 */

//import { safeText } from '../utils/sanitizers.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class NotificationManager {
    constructor() {
        this.container = null;
        this.initialized = false;
        this.defaultDuration = 5000; // 5 secondes
    }

    /**
     * Initialise le gestionnaire
     * @param {string} containerId - L'ID du conteneur de notifications
     */
    init(containerId = 'edt-notification-area') {
        this.container = document.getElementById(containerId);

        if (!this.container) {
            console.warn(`Notification container #${containerId} not found`);
            // Créer le conteneur s'il n'existe pas
            this.container = document.createElement('div');
            this.container.id = containerId;
            this.container.className = 'notification-container';
            document.body.appendChild(this.container);
        }

        this.initialized = true;
    }

    /**
     * Affiche une notification
     * @param {Object} options - Les options
     * @param {string} options.message - Le message
     * @param {string} options.type - Le type (success, error, warning, info)
     * @param {number} options.duration - Durée d'affichage (ms), 0 = permanent
     * @param {boolean} options.allowHtml - Permet le HTML
     * @returns {HTMLElement} L'élément de notification créé
     */
    show(options = {}) {
        if (!this.initialized) {
            console.warn('NotificationManager not initialized');
            return null;
        }

        const {
            message = '',
            type = 'info',
            duration = this.defaultDuration,
            allowHtml = false
        } = options;

        // Créer l'élément de notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        // Ajouter une icône selon le type
        const icon = this.getIconForType(type);
        const iconSpan = document.createElement('span');
        iconSpan.className = 'notification-icon';
        iconSpan.textContent = icon;

        // Ajouter le message
        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message';

        if (allowHtml) {
            // Use DOMPurify if available, otherwise escape HTML to be safe
            try {
                if (typeof window !== 'undefined' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
                    messageSpan.innerHTML = window.DOMPurify.sanitize(String(message));
                } else {
                    // fallback safe: escape HTML then convert newlines to <br>
                    // Note: escapeHTML is defined in utils/sanitizers.js
                    // Import at top: import { escapeHTML } from '../utils/sanitizers.js';
                    messageSpan.innerHTML = escapeHTML(String(message)).replace(/\r?\n/g, '<br>');
                }
            } catch (e) {
                // If anything fails, fallback to textContent
                messageSpan.textContent = String(message);
            }
        } else {
            messageSpan.textContent = message;
        }

        // Bouton de fermeture
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => {
            this.remove(notification);
        });

        // Assembler la notification
        notification.appendChild(iconSpan);
        notification.appendChild(messageSpan);
        notification.appendChild(closeBtn);

        // Ajouter au conteneur
        this.container.appendChild(notification);

        // Animation d'entrée
        setTimeout(() => {
            notification.classList.add('notification-show');
        }, 10);

        // Auto-suppression après la durée spécifiée
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification);
            }, duration);
        }

        return notification;
    }

    /**
     * Supprime une notification avec animation
     * @param {HTMLElement} notification - L'élément à supprimer
     */
    remove(notification) {
        if (!notification || !notification.parentNode) return;

        notification.classList.remove('notification-show');
        notification.classList.add('notification-hide');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300); // Durée de l'animation
    }

    /**
     * Obtient l'icône pour un type de notification
     * @param {string} type - Le type
     * @returns {string} L'icône
     */
    getIconForType(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    /**
     * Affiche une notification de succès
     * @param {string} message - Le message
     * @param {number} duration - Durée d'affichage
     */
    success(message, duration = this.defaultDuration) {
        return this.show({
            message,
            type: 'success',
            duration
        });
    }

    /**
     * Affiche une notification d'erreur
     * @param {string} message - Le message
     * @param {number} duration - Durée d'affichage (0 = permanent pour erreurs)
     */
    error(message, duration = 0) {
        return this.show({
            message,
            type: 'error',
            duration
        });
    }

    /**
     * Affiche une notification d'avertissement
     * @param {string} message - Le message
     * @param {number} duration - Durée d'affichage
     */
    warning(message, duration = this.defaultDuration) {
        return this.show({
            message,
            type: 'warning',
            duration
        });
    }

    /**
     * Affiche une notification d'information
     * @param {string} message - Le message
     * @param {number} duration - Durée d'affichage
     */
    info(message, duration = this.defaultDuration) {
        return this.show({
            message,
            type: 'info',
            duration
        });
    }

    /**
     * Affiche une notification HTML
     * @param {string} htmlMessage - Le message HTML
     * @param {string} type - Le type
     * @param {number} duration - Durée d'affichage
     */
    showHtml(htmlMessage, type = 'info', duration = this.defaultDuration) {
        return this.show({
            message: htmlMessage,
            type,
            duration,
            allowHtml: true
        });
    }

    /**
     * Supprime toutes les notifications
     */
    clearAll() {
        if (!this.container) return;

        const notifications = this.container.querySelectorAll('.notification');
        notifications.forEach(n => this.remove(n));
    }

    /**
     * Affiche une barre de progression
     * @param {string} message - Le message
     * @param {number} progress - Le pourcentage (0-100)
     * @returns {HTMLElement} L'élément de notification
     */
    showProgress(message, progress = 0) {
        const notification = document.createElement('div');
        notification.className = 'notification notification-progress';

        const messageDiv = document.createElement('div');
        messageDiv.className = 'notification-message';
        messageDiv.textContent = message;

        const progressBar = document.createElement('div');
        progressBar.className = 'notification-progress-bar';

        const progressFill = document.createElement('div');
        progressFill.className = 'notification-progress-fill';
        progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;

        progressBar.appendChild(progressFill);
        notification.appendChild(messageDiv);
        notification.appendChild(progressBar);

        this.container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('notification-show');
        }, 10);

        // Stocker la référence à la barre de progression
        notification.updateProgress = (newProgress) => {
            progressFill.style.width = `${Math.min(100, Math.max(0, newProgress))}%`;
        };

        return notification;
    }
}

// Export d'une instance singleton
export default new NotificationManager();