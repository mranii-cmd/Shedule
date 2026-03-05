/**
 * Contrôleur pour la gestion des forfaits
 * @author Ibrahim Mrani - UCD
 */

import StateManager from './StateManager.js';
import LogService from '../services/LogService.js';
import NotificationManager from '../ui/NotificationManager.js';
import DialogManager from '../ui/DialogManager.js';

class ForfaitController {
    /**
     * Génère un ID unique pour un forfait
     * @returns {string} ID unique
     */
    generateId() {
        return `forfait_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Récupère tous les forfaits
     * @returns {Array} Liste des forfaits
     */
    getAllForfaits() {
        if (!StateManager.state.forfaits) {
            StateManager.state.forfaits = [];
        }
        return StateManager.state.forfaits;
    }

    /**
     * Ajoute un nouveau forfait
     * @param {Object} forfaitData - Données du forfait
     * @returns {Object|null} Le forfait ajouté ou null en cas d'erreur
     */
    addForfait(forfaitData) {
        const { enseignant, nature, volumeHoraire, description } = forfaitData;

        // Validation
        if (!enseignant || !nature || volumeHoraire === undefined || volumeHoraire < 0) {
            DialogManager.error('Veuillez remplir tous les champs obligatoires correctement.');
            return null;
        }

        // Vérifier que l'enseignant existe
        if (!StateManager.state.enseignants.includes(enseignant)) {
            DialogManager.error('L\'enseignant sélectionné n\'existe pas.');
            return null;
        }

        // Vérifier les doublons (même enseignant + même nature)
        const forfaits = this.getAllForfaits();
        const doublon = forfaits.find(f =>
            f.enseignant === enseignant && f.nature === nature
        );

        if (doublon) {
            DialogManager.warning(
                `Un forfait de type "<strong>${nature}</strong>" existe déjà pour <strong>${enseignant}</strong>.<br><br>Voulez-vous le mettre à jour ?`,
                () => {
                    this.updateForfait(doublon.id, { volumeHoraire, description });
                }
            );
            return null;
        }

        // Créer le forfait
        const forfait = {
            id: this.generateId(),
            enseignant,
            nature,
            volumeHoraire: parseFloat(volumeHoraire),
            description: description || '',
            dateAjout: new Date().toISOString().split('T')[0]
        };

        // Ajouter au state
        forfaits.push(forfait);

        // Sauvegarder via StateManager (centralise la persistance)
        try {
            StateManager.saveState();
        } catch (err) {
            // Si la sauvegarde échoue, informer et sortir proprement
            LogService.error('Erreur lors de la sauvegarde du state après ajout de forfait : ' + (err && err.message));
            DialogManager.error('Impossible de sauvegarder le forfait. Vérifiez la console pour plus d\'infos.');
            return null;
        }

        LogService.success(`✅ Forfait "${nature}" ajouté pour ${enseignant} (${volumeHoraire}h)`);
        NotificationManager.success('Forfait ajouté avec succès');

        // Notifier le changement
        StateManager.notify('forfait:added', { forfait });

        // Événement global DOM pour les modules qui écoutent window.addEventListener('app:stateUpdated', ...)
        try {
            window.dispatchEvent(new CustomEvent('app:stateUpdated', { detail: { source: 'forfait', action: 'added', forfait } }));
        } catch (e) { /* noop */ }

        return forfait;
    }

    /**
     * Met à jour un forfait existant
     * @param {string} id - ID du forfait
     * @param {Object} updates - Données à mettre à jour
     * @returns {boolean} Succès de la mise à jour
     */
    updateForfait(id, updates) {
        const forfaits = this.getAllForfaits();
        const index = forfaits.findIndex(f => f.id === id);

        if (index === -1) {
            DialogManager.error('Forfait introuvable.');
            return false;
        }

        const forfait = forfaits[index];

        // Valider les données
        if (updates.volumeHoraire !== undefined) {
            if (updates.volumeHoraire < 0) {
                DialogManager.error('Le volume horaire doit être positif.');
                return false;
            }
            forfait.volumeHoraire = parseFloat(updates.volumeHoraire);
        }

        if (updates.description !== undefined) {
            forfait.description = updates.description;
        }

        if (updates.nature !== undefined) {
            // Vérifier les doublons avec la nouvelle nature
            const doublon = forfaits.find(f =>
                f.id !== id &&
                f.enseignant === forfait.enseignant &&
                f.nature === updates.nature
            );

            if (doublon) {
                DialogManager.error(`Un forfait de type "${updates.nature}" existe déjà pour cet enseignant.`);
                return false;
            }

            forfait.nature = updates.nature;
        }

        // Sauvegarder via StateManager
        try {
            StateManager.saveState();
        } catch (err) {
            LogService.error('Erreur lors de la sauvegarde du state après mise à jour de forfait : ' + (err && err.message));
            DialogManager.error('Impossible de sauvegarder la modification du forfait.');
            return false;
        }

        LogService.success(`✅ Forfait mis à jour pour ${forfait.enseignant}`);
        NotificationManager.success('Forfait mis à jour');

        // Notifier le changement
        StateManager.notify('forfait:updated', { forfait });
        try {
            window.dispatchEvent(new CustomEvent('app:stateUpdated', { detail: { source: 'forfait', action: 'updated', forfait } }));
        } catch (e) { /* noop */ }

        return true;
    }

    /**
     * Supprime un forfait
     * @param {string} id - ID du forfait
     */
    deleteForfait(id) {
        const forfaits = this.getAllForfaits();
        const index = forfaits.findIndex(f => f.id === id);

        if (index === -1) {
            DialogManager.error('Forfait introuvable.');
            return;
        }

        const forfait = forfaits[index];

        DialogManager.confirm(
            'Supprimer le Forfait',
            `Voulez-vous vraiment supprimer le forfait "<strong>${forfait.nature}</strong>" de <strong>${forfait.enseignant}</strong> (${forfait.volumeHoraire}h) ?`,
            () => {
                forfaits.splice(index, 1);
                try {
                    StateManager.saveState();
                } catch (err) {
                    LogService.error('Erreur lors de la sauvegarde du state après suppression de forfait : ' + (err && err.message));
                    DialogManager.error('Impossible de sauvegarder la suppression du forfait.');
                    return;
                }

                LogService.success(`✅ Forfait supprimé pour ${forfait.enseignant}`);
                NotificationManager.success('Forfait supprimé');

                // Notifier le changement
                StateManager.notify('forfait:deleted', { id });
                try {
                    window.dispatchEvent(new CustomEvent('app:stateUpdated', {
                        detail: { source: 'forfait', action: 'deleted', id, timestamp: Date.now() }
                    }));
                } catch (e) { /* noop */ }
            }
        );
    }

    /**
     * Récupère les forfaits d'un enseignant
     * @param {string} enseignant - Nom de l'enseignant
     * @returns {Array} Liste des forfaits de l'enseignant
     */
    getForfaitsByEnseignant(enseignant) {
        const forfaits = this.getAllForfaits();
        return forfaits.filter(f => f.enseignant === enseignant);
    }

    /**
     * Calcule le volume horaire total des forfaits d'un enseignant
     * @param {string} enseignant - Nom de l'enseignant
     * @returns {number} Volume horaire total en hTP
     */
    getEnseignantForfaitVolume(enseignant) {
        const forfaits = this.getForfaitsByEnseignant(enseignant);
        return forfaits.reduce((total, f) => total + f.volumeHoraire, 0);
    }

    /**
     * Récupère les forfaits groupés par nature
     * @returns {Object} Forfaits groupés par nature
     */
    getForfaitsByNature() {
        const forfaits = this.getAllForfaits();
        const grouped = {};

        forfaits.forEach(forfait => {
            if (!grouped[forfait.nature]) {
                grouped[forfait.nature] = [];
            }
            grouped[forfait.nature].push(forfait);
        });

        return grouped;
    }

    /**
     * Récupère le total des volumes par nature
     * @returns {Object} Volumes totaux par nature
     */
    getVolumesByNature() {
        const forfaits = this.getAllForfaits();
        const volumes = {};

        forfaits.forEach(forfait => {
            if (!volumes[forfait.nature]) {
                volumes[forfait.nature] = 0;
            }
            volumes[forfait.nature] += forfait.volumeHoraire;
        });

        return volumes;
    }

    /**
     * Récupère le badge CSS class pour une nature de forfait
     * @param {string} nature - Nature du forfait
     * @returns {string} Classe CSS pour le badge
     */
    getBadgeClass(nature) {
        const mapping = {
            'Chef de département': 'forfait-badge-chef',
            'Collège': 'forfait-badge-college',
            'Master': 'forfait-badge-master',
            'Coordonnateur de filière': 'forfait-badge-coordonnateur',
            'Autres': 'forfait-badge-autres'
        };

        return mapping[nature] || 'forfait-badge-autres';
    }
}
const instance = new ForfaitController();
export default instance;