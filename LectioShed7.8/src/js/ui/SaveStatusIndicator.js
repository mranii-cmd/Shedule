/**
 * Auto-save status indicator
 * Shows save status in the UI (saving, saved, error)
 */

class SaveStatusIndicator {
    constructor() {
        this.indicator = null;
        this.timeout = null;
    }

    init(containerId = 'header-actions') {
        try {
            // Create indicator element if it doesn't exist
            if (!this.indicator) {
                this.indicator = document.createElement('span');
                this.indicator.id = 'save-status-indicator';
                this.indicator.className = 'save-status';
                this.indicator.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.85em;
                    margin-left: 8px;
                    transition: opacity 0.3s;
                    opacity: 0;
                `;
                
                const container = document.getElementById(containerId) || 
                                document.querySelector('#header-actions, .header-actions, header') ||
                                document.body;
                
                if (container && container.appendChild) {
                    container.appendChild(this.indicator);
                }
            }
        } catch (e) {
            console.error('SaveStatusIndicator.init error:', e);
        }
    }

    show(message, type = 'info', duration = 3000) {
        try {
            if (!this.indicator) {
                this.init();
            }
            
            if (!this.indicator) return;

            // Clear any existing timeout
            if (this.timeout) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }

            // Set message and styling
            this.indicator.textContent = message;
            
            // Set color based on type
            const colors = {
                saving: '#17a2b8',   // info blue
                saved: '#28a745',     // success green
                error: '#dc3545',     // error red
                info: '#6c757d'       // gray
            };
            
            const color = colors[type] || colors.info;
            this.indicator.style.backgroundColor = `${color}22`;
            this.indicator.style.color = color;
            this.indicator.style.border = `1px solid ${color}`;
            this.indicator.style.opacity = '1';

            // Auto-hide after duration (unless it's a 'saving' state)
            if (type !== 'saving' && duration > 0) {
                this.timeout = setTimeout(() => {
                    this.hide();
                }, duration);
            }
        } catch (e) {
            console.error('SaveStatusIndicator.show error:', e);
        }
    }

    hide() {
        try {
            if (this.indicator) {
                this.indicator.style.opacity = '0';
            }
            
            if (this.timeout) {
                clearTimeout(this.timeout);
                this.timeout = null;
            }
        } catch (e) {
            console.error('SaveStatusIndicator.hide error:', e);
        }
    }

    showSaving() {
        this.show('💾 Sauvegarde...', 'saving', 0);
    }

    showSaved() {
        this.show('✓ Sauvegardé', 'saved', 2000);
    }

    showError(message = 'Erreur de sauvegarde') {
        this.show(`✗ ${message}`, 'error', 5000);
    }
}

// Export as singleton
const saveStatusIndicator = new SaveStatusIndicator();
export default saveStatusIndicator;
