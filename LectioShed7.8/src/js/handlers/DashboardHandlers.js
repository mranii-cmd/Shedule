/**
 * Gestionnaire des événements du dashboard
 * @author Ibrahim Mrani - UCD
 */

import DashboardController from '../controllers/DashboardController.js';
import DashboardRenderer from '../ui/DashboardRenderer.js';
import StateManager from '../controllers/StateManager.js';
import LogService from '../services/LogService.js';
import NotificationManager from '../ui/NotificationManager.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class DashboardHandlers {
    constructor() {
        this.autoRefreshInterval = null;
        this.autoRefreshEnabled = false;
    }

    /**
     * Initialise les gestionnaires d'événements
     */
    init() {
        // S'abonner aux événements de state pour auto-refresh
        StateManager.subscribe('dashboard:refreshed', () => {
            this.onDashboardRefreshed();
        });

        LogService.info('📊 Dashboard handlers initialisés');
    }

    /**
     * Gère l'actualisation manuelle du dashboard
     */
    handleManualRefresh() {
        NotificationManager.info('Actualisation du dashboard...', 2000);
        DashboardController.refreshData();
        DashboardRenderer.render();
        NotificationManager.success('Dashboard actualisé', 2000);
    }

    /**
     * Gère l'export du dashboard
     * @param {string} format - Le format (pdf, excel, image)
     */
    async handleExport(format) {
        try {
            NotificationManager.info(`Export en cours (${format})...`, 3000);
            await DashboardController.exportDashboard(format);
            NotificationManager.success(`Export ${format} réussi !`, 3000);
        } catch (error) {
            NotificationManager.error(`Erreur lors de l'export: ${error.message}`);
            LogService.error(`❌ Export failed: ${error.message}`);
        }
    }

    /**
     * Gère l'activation/désactivation de l'auto-refresh
     * @param {boolean} enable - Activer ou désactiver
     * @param {number} interval - Intervalle en millisecondes (défaut: 30000 = 30s)
     */
    toggleAutoRefresh(enable = true, interval = 30000) {
        if (enable && !this.autoRefreshEnabled) {
            this.autoRefreshEnabled = true;
            this.autoRefreshInterval = setInterval(() => {
                DashboardController.refreshData();
                DashboardRenderer.render();
                LogService.info('🔄 Dashboard auto-refresh');
            }, interval);

            NotificationManager.success(`Auto-refresh activé (${interval / 1000}s)`, 3000);
            LogService.info(`✅ Auto-refresh activé (${interval}ms)`);
        } else if (!enable && this.autoRefreshEnabled) {
            this.autoRefreshEnabled = false;
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }

            NotificationManager.info('Auto-refresh désactivé', 2000);
            LogService.info('⏸️ Auto-refresh désactivé');
        }
    }

    /**
     * Gère le changement de filtre
     * @param {Object} filters - Les filtres à appliquer
     */
    handleFilterChange(filters) {
        DashboardController.applyFilters(filters);
        DashboardRenderer.render();
        LogService.info('🔍 Filtres appliqués au dashboard');
    }

    /**
     * Gère le clic sur une alerte
     * @param {Object} alert - L'alerte cliquée
     */
    handleAlertClick(alert) {
        // TODO: Implémenter des actions selon le type d'alerte
        // Par exemple: navigation vers l'onglet concerné, ouverture d'une modale, etc.
        LogService.info(`⚠️ Alerte cliquée: ${alert.title}`);
        NotificationManager.info(`Action suggérée: ${alert.action}`, 5000);
    }

    /**
     * Gère l'affichage des détails d'un enseignant
     * @param {string} teacherName - Le nom de l'enseignant
     */
    handleShowTeacherDetails(teacherName) {
        // Naviguer vers l'onglet volumes avec filtre sur l'enseignant
        const volumesTab = document.querySelector('[data-tab="volumes"]');
        if (volumesTab) {
            volumesTab.click();
            
            // TODO: Appliquer un filtre sur l'enseignant dans l'onglet volumes
            LogService.info(`👨‍🏫 Détails pour ${teacherName}`);
        }
    }

    /**
     * Gère l'affichage des détails d'une salle
     * @param {string} roomName - Le nom de la salle
     */
    handleShowRoomDetails(roomName) {
        // Naviguer vers l'EDT avec filtre sur la salle
        const planningTab = document.querySelector('[data-tab="planning"]');
        if (planningTab) {
            planningTab.click();
            
            // TODO: Appliquer un filtre sur la salle
            LogService.info(`🏛️ Détails pour salle ${roomName}`);
        }
    }

    /**
     * Gère l'affichage des détails d'une matière
     * @param {string} subjectName - Le nom de la matière
     */
    handleShowSubjectDetails(subjectName) {
        // Naviguer vers l'EDT avec filtre sur la matière
        const planningTab = document.querySelector('[data-tab="planning"]');
        if (planningTab) {
            planningTab.click();
            
            // TODO: Appliquer un filtre sur la matière
            LogService.info(`📚 Détails pour matière ${subjectName}`);
        }
    }

    /**
     * Gère l'impression du dashboard
     */
    handlePrint() {
        // Masquer les éléments non imprimables
        const actionsElements = document.querySelectorAll('.dashboard-actions');
        actionsElements.forEach(el => el.style.display = 'none');

        window.print();

        // Réafficher les éléments
        actionsElements.forEach(el => el.style.display = '');
    }

    /**
     * Callback appelé quand le dashboard est actualisé
     */
    onDashboardRefreshed() {
        // Re-rendre le dashboard si on est sur l'onglet dashboard
        const dashboardTab = document.querySelector('[data-tab="dashboard"]');
        if (dashboardTab && dashboardTab.classList.contains('active')) {
            DashboardRenderer.render();
        }
    }

    /**
     * Gère le partage du dashboard
     */
    async handleShare() {
        // Générer un lien de partage ou exporter en image
        try {
            NotificationManager.info('Génération du lien de partage...', 3000);
            
            // Pour l'instant, on exporte juste en Excel
            await this.handleExport('excel');
            
            NotificationManager.success('Fichier Excel généré pour partage', 3000);
        } catch (error) {
            NotificationManager.error(`Erreur lors du partage: ${error.message}`);
        }
    }

    /**
     * Gère le téléchargement d'un rapport complet
     */
    async handleDownloadReport() {
        try {
            NotificationManager.info('Génération du rapport complet...', 3000);
            
            // Exporter en PDF et Excel
            await DashboardController.exportDashboard('pdf');
            await DashboardController.exportDashboard('excel');
            
            NotificationManager.success('Rapport complet généré (PDF + Excel)', 4000);
        } catch (error) {
            NotificationManager.error(`Erreur lors de la génération: ${error.message}`);
        }
    }

    /**
     * Nettoie les ressources
     */
    cleanup() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
        this.autoRefreshEnabled = false;
    }
}

// Export d'une instance singleton
export default new DashboardHandlers();