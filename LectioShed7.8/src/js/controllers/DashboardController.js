/**
 * Contrôleur pour le tableau de bord analytique
 * @author Ibrahim Mrani - UCD
 */

import AnalyticsService from '../services/AnalyticsService.js';
import StateManager from './StateManager.js';
import LogService from '../services/LogService.js';
import NotificationManager from '../ui/NotificationManager.js';

class DashboardController {
    constructor() {
        this.currentFilter = 'all';
        this.dashboardData = null;
    }

    /**
     * Initialise le dashboard
     */
    init() {
        this.refreshData();
        
        // S'abonner aux changements de state pour auto-refresh
        StateManager.subscribe('seance:added', () => this.refreshData());
        StateManager.subscribe('seance:removed', () => this.refreshData());
        StateManager.subscribe('seance:updated', () => this.refreshData());
        StateManager.subscribe('session:changed', () => this.refreshData());
        
        LogService.info('📊 Dashboard initialisé');
    }

    /**
     * Actualise les données du dashboard
     */
    refreshData() {
        try {
            this.dashboardData = {
                kpis: AnalyticsService.calculateGlobalKPIs(),
                teachersWorkload: AnalyticsService.calculateTeachersWorkload(),
                sessionsDistribution: AnalyticsService.calculateSessionsDistribution(),
                timeSlotsHeatmap: AnalyticsService.calculateTimeSlotsHeatmap(),
                roomsOccupancy: AnalyticsService.calculateRoomsOccupancy(),
                weeklyTimeline: AnalyticsService.calculateWeeklyTimeline(),
                alerts: AnalyticsService.detectAnomalies(),
                subjectStats: AnalyticsService.calculateSubjectStats()
            };
            
            LogService.success('✅ Données du dashboard actualisées');
            
            // Notifier les listeners
            StateManager.notify('dashboard:refreshed', this.dashboardData);
            
        } catch (error) {
            LogService.error(`❌ Erreur lors de l'actualisation du dashboard: ${error.message}`);
        }
    }

    /**
     * Applique des filtres aux données
     * @param {Object} filters - Les filtres à appliquer
     */
    applyFilters(filters) {
        this.currentFilter = filters.period || 'all';
        
        // TODO: Implémenter la logique de filtrage
        // Pour l'instant, on rafraîchit juste les données
        this.refreshData();
    }

    /**
     * Récupère les données du dashboard
     * @returns {Object} Les données
     */
    getDashboardData() {
        if (!this.dashboardData) {
            this.refreshData();
        }
        return this.dashboardData;
    }

    /**
     * Exporte le dashboard
     * @param {string} format - Le format (pdf, excel, image)
     */
    async exportDashboard(format) {
        LogService.info(`📥 Export du dashboard en ${format}...`);
        
        try {
            switch (format) {
                case 'pdf':
                    await this.exportToPDF();
                    break;
                case 'excel':
                    await this.exportToExcel();
                    break;
                case 'image':
                    await this.exportToImage();
                    break;
                default:
                    throw new Error('Format non supporté');
            }
            
            LogService.success(`✅ Export ${format} terminé`);
        } catch (error) {
            LogService.error(`❌ Erreur export: ${error.message}`);
        }
    }

    /**
     * Exporte en PDF
     */
    async exportToPDF() {
        // TODO: Implémenter l'export PDF avec jsPDF
        LogService.info('Export PDF - En développement');
    }

    /**
     * Exporte en Excel
     */
    async exportToExcel() {
        const XLSX = window.XLSX;
        if (!XLSX) {
            throw new Error('XLSX library not loaded');
        }

        const wb = XLSX.utils.book_new();
        const data = this.getDashboardData();

        // Feuille 1: KPIs
        const kpisData = [
            ['Indicateur', 'Valeur'],
            ['Séances totales', data.kpis.totalSeances],
            ['Taux attribution enseignants', `${data.kpis.teacherAssignmentRate}%`],
            ['Taux attribution salles', `${data.kpis.roomAssignmentRate}%`],
            ['Enseignants actifs', `${data.kpis.activeTeachers}/${data.kpis.totalTeachers}`],
            ['Salles utilisées', `${data.kpis.usedRooms}/${data.kpis.totalRooms}`],
            ['Taux occupation global', `${data.kpis.globalOccupancyRate}%`]
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(kpisData);
        XLSX.utils.book_append_sheet(wb, ws1, 'KPIs');

        // Feuille 2: Charge enseignants
        const teachersData = [
            ['Enseignant', 'Volume (hTP)', 'Statut']
        ];
        data.teachersWorkload.forEach(t => {
            teachersData.push([t.nom, t.volume, t.status]);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(teachersData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Enseignants');

        // Feuille 3: Occupation salles
        const roomsData = [
            ['Salle', 'Taux occupation (%)', 'Séances']
        ];
        data.roomsOccupancy.forEach(r => {
            roomsData.push([r.salle, r.occupancyRate, r.totalSeances]);
        });
        const ws3 = XLSX.utils.aoa_to_sheet(roomsData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Salles');

        // Télécharger
        const filename = `Dashboard_${StateManager.state.header.session}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    /**
     * Exporte en image
     */
    async exportToImage() {
        // TODO: Implémenter l'export image avec html2canvas
        LogService.info('Export Image - En développement');
    }

    /**
     * Obtient les recommandations basées sur les alertes
     * @returns {Array} Liste de recommandations
     */
    getRecommendations() {
        const alerts = this.dashboardData?.alerts || [];
        return alerts.map(alert => ({
            priority: alert.type === 'danger' ? 'high' : alert.type === 'warning' ? 'medium' : 'low',
            message: alert.message,
            action: alert.action
        }));
    }
    /**
     * Exporte le dashboard en PDF.
     * @param {string} format - 'pdf' attendu (pour compatibilité future)
     */
    exportDashboard(format = 'pdf') {
        try {
            if (format !== 'pdf') {
                NotificationManager.error('Format non supporté pour l\'export du dashboard');
                return;
            }

            // Récupérer l'exporteur jsPDF (UMD global)
            const jsPDFGlobal = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
            if (!jsPDFGlobal) {
                NotificationManager.error('Impossible d\'exporter en PDF : jsPDF non chargé');
                LogService.error('Dashboard export failed: jsPDF not available');
                return;
            }

            const doc = new jsPDFGlobal({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 40;
            let cursorY = 40;

            doc.setFontSize(18);
            doc.text('Dashboard - Charge et Statistiques', margin, cursorY);
            cursorY += 24;

            // listes d'IDs de canvases à exporter (ordre souhaité)
            const chartIds = [
                'teachersWorkloadChart',
                'sessionsDistributionChart',
                'roomsOccupancyChart',
                'weeklyTimelineChart'
            ];

            // Récupérer les canvases disponibles et leur image data
            const images = [];
            for (const id of chartIds) {
                const canvas = document.getElementById(id);
                if (!canvas) continue;

                // Si c'est un élément <canvas>, on prend toDataURL
                if (canvas.toDataURL) {
                    try {
                        const dataUrl = canvas.toDataURL('image/png', 1.0);
                        images.push({ id, dataUrl, width: canvas.width, height: canvas.height });
                    } catch (err) {
                        // toDataURL peut échouer si canvas est "tainted" (CORS)
                        LogService.error(`Export PDF: impossible de lire canvas ${id} : ${err.message || err}`);
                        NotificationManager.warning(`Impossible d'exporter le graphique ${id} (CORS ou canvas indisponible)`);
                    }
                } else {
                    // canvas absent ou n'est pas un canvas; essayer d'attraper un <img> à l'intérieur
                    const img = canvas.querySelector && canvas.querySelector('img');
                    if (img && img.src) {
                        images.push({ id, dataUrl: img.src, width: img.naturalWidth, height: img.naturalHeight });
                    }
                }
            }

            if (images.length === 0) {
                NotificationManager.error('Aucun graphique disponible pour l\'export PDF');
                return;
            }

            // Taille disponible pour chaque image (conserver ratio)
            const availableWidth = pageWidth - margin * 2;

            for (const img of images) {
                // Calcul de la taille conservant le ratio
                const ratio = img.width && img.height ? (img.height / img.width) : (3/4);
                const imgWidth = availableWidth;
                const imgHeight = imgWidth * ratio;

                // Si l'image dépasse la page, ajouter une nouvelle page
                if (cursorY + imgHeight + 20 > pageHeight - margin) {
                    doc.addPage();
                    cursorY = margin;
                }

                // Ajouter l'image
                try {
                    doc.addImage(img.dataUrl, 'PNG', margin, cursorY, imgWidth, imgHeight);
                } catch (err) {
                    LogService.error(`Export PDF: doc.addImage failed for ${img.id}: ${err.message || err}`);
                    NotificationManager.warning(`Erreur insertion image ${img.id} dans PDF`);
                }

                cursorY += imgHeight + 16;
            }

            // Footer / métadonnée
            const dateStr = (new Date()).toLocaleString();
            doc.setFontSize(10);
            doc.text(`Exporté le ${dateStr}`, margin, pageHeight - 20);

            // Enregistrer le PDF
            const filename = `dashboard_export_${(new Date()).toISOString().slice(0,10)}.pdf`;
            doc.save(filename);

            NotificationManager.success('Dashboard exporté en PDF');
            LogService.success(`Dashboard exported to PDF: ${filename}`);
        } catch (err) {
            console.error('exportDashboard error', err);
            LogService.error(`Erreur export PDF dashboard: ${err.message || err}`);
            NotificationManager.error('Erreur lors de l\'export PDF du dashboard');
        }
    }
}

// Export d'une instance singleton
export default new DashboardController();