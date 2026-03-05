/**
 * Gestionnaire des imports de fichiers
 * @author Ibrahim Mrani - UCD
 */

import ImportService from '../services/ImportService.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import SpinnerManager from '../ui/SpinnerManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import { loadXLSX } from '../utils/lazyLoaders.js';
// import { escapeHTML } from '../utils/sanitizers.js';

class ImportHandlers {
    /**
     * Importe les souhaits des enseignants
     * @param {File} file - Le fichier Excel
     */
    async importWishes(file) {
        if (!file) return;

        SpinnerManager.show();

        // Lazy-load XLSX only when needed
        try {
            await loadXLSX({
                local: 'lib/xlsx.full.min.js',
                // cdn: 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
                timeout: 10000
            });
        } catch (err) {
            SpinnerManager.hide();
            LogService.error(`❌ Échec chargement XLSX : ${err.message}`);
            DialogManager.error('Impossible de charger la librairie d\'import Excel. Import annulé.');
            return;
        }

        try {
            const result = await ImportService.importWishesFromExcel(file);

            if (result && result.success) {
                const stats = result.stats || {};
                const imported = Number(stats.imported) || 0;
                const skipped = Number(stats.skipped) || 0;
                const errors = Number(stats.errors) || 0;

                DialogManager.success(
                    `✅ Import réussi !<br><br>
                    <strong>Résultats :</strong><br>
                    - Souhaits importés : ${imported}<br>
                    - Lignes ignorées : ${skipped}<br>
                    - Erreurs : ${errors}`
                );

                // Rafraîchir l'interface si nécessaire
                window.EDTApp?.populateFormSelects();
            } else {
                DialogManager.error('Erreur lors de l\'import des souhaits.');
            }
        } catch (error) {
            LogService.error(`❌ Erreur import : ${error.message}`);
            DialogManager.error(`Erreur : ${error.message}`);
        } finally {
            SpinnerManager.hide();
        }
    }

    /**
     * Importe les matières
     * @param {File} file - Le fichier Excel
     */
    async importSubjects(file) {
        if (!file) return;

        SpinnerManager.show();

        // Lazy-load XLSX only when needed
        try {
            await loadXLSX({
                local: 'lib/xlsx.full.min.js',
                // cdn: 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
                timeout: 10000
            });
        } catch (err) {
            SpinnerManager.hide();
            LogService.error(`❌ Échec chargement XLSX : ${err.message}`);
            DialogManager.error('Impossible de charger la librairie d\'import Excel. Import annulé.');
            return;
        }

        try {
            const result = await ImportService.importSubjectsFromExcel(file);

            if (result && result.success) {
                const stats = result.stats || {};
                const imported = Number(stats.imported) || 0;
                const updated = Number(stats.updated) || 0;
                const skipped = Number(stats.skipped) || 0;

                DialogManager.success(
                    `✅ Import réussi !<br><br>
                    <strong>Résultats :</strong><br>
                    - Matières créées : ${imported}<br>
                    - Matières mises à jour : ${updated}<br>
                    - Lignes ignorées : ${skipped}`
                );

                // Rafraîchir l'interface
                window.EDTApp?.populateFormSelects();
                window.EDTApp?.renderAll();
            } else {
                DialogManager.error('Erreur lors de l\'import des matières.');
            }
        } catch (error) {
            LogService.error(`❌ Erreur import : ${error.message}`);
            DialogManager.error(`Erreur : ${error.message}`);
        } finally {
            SpinnerManager.hide();
        }
    }

    /**
     * Déclenche le sélecteur de fichier pour import souhaits
     */
    triggerWishesImport() {
        const input = document.getElementById('fileImportWishes');
        if (input) {
            input.click();
        }
    }

    /**
     * Déclenche le sélecteur de fichier pour import matières
     */
    triggerSubjectsImport() {
        const input = document.getElementById('fileImportSubjects');
        if (input) {
            input.click();
        }
    }

    /**
     * Télécharge le template Excel pour les souhaits
     */
    downloadWishesTemplate() {
        const success = ImportService.exportWishesTemplate();

        if (success) {
            NotificationManager.success('Template téléchargé');
            LogService.success('✅ Template souhaits téléchargé');
        } else {
            NotificationManager.error('Erreur lors du téléchargement');
            LogService.error('❌ Échec du téléchargement du template');
        }
    }

    /**
     * Télécharge le template Excel pour les matières
     */
    downloadSubjectsTemplate() {
        const success = ImportService.exportSubjectsTemplate();

        if (success) {
            NotificationManager.success('Template téléchargé');
            LogService.success('✅ Template matières téléchargé');
        } else {
            NotificationManager.error('Erreur lors du téléchargement');
            LogService.error('❌ Échec du téléchargement du template');
        }
    }
}

// Export d'une instance singleton
export default new ImportHandlers();