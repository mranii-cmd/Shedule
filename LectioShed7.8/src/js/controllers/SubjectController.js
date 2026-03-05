/**
 * Contrôleur pour la gestion des matières
 * @author Ibrahim Mrani - UCD
 */

import StateManager from './StateManager.js';
import Subject from '../models/Subject.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import VolumeService from '../services/VolumeService.js';

class SubjectController {
    /**
     * Ajoute une matière
     * @param {string} nom - Le nom de la matière
     * @param {Object} config - La configuration
     * @returns {boolean} Succès de l'ajout
     */
    addSubject(nom, config = {}) {
        if (!nom || nom.trim() === '') {
            DialogManager.error('Veuillez saisir un nom de matière valide.');
            return false;
        }

        const trimmedNom = nom.trim();

        if (StateManager.state.matiereGroupes[trimmedNom]) {
            DialogManager.error(`La matière "${trimmedNom}" existe déjà.`);
            return false;
        }

        // S'assurer que le champ 'departement' est présent (même si vide)
        const safeConfig = {
            ...config,
            departement: Object.prototype.hasOwnProperty.call(config || {}, 'departement') ? (config.departement || '') : '',
            sections_cours: Object.prototype.hasOwnProperty.call(config || {}, 'sections_cours') ? Number(config.sections_cours) : 0,
            td_groups: Object.prototype.hasOwnProperty.call(config || {}, 'td_groups') ? Number(config.td_groups) : 0,
            tp_groups: Object.prototype.hasOwnProperty.call(config || {}, 'tp_groups') ? Number(config.tp_groups) : 0,
            nbEnseignantsTP: Object.prototype.hasOwnProperty.call(config || {}, 'nbEnseignantsTP') ? Number(config.nbEnseignantsTP) : 1,
            volumeHTP: {
                Cours: (config && config.volumeHTP && Object.prototype.hasOwnProperty.call(config.volumeHTP, 'Cours')) ? Number(config.volumeHTP.Cours) : 0,
                TD: (config && config.volumeHTP && Object.prototype.hasOwnProperty.call(config.volumeHTP, 'TD')) ? Number(config.volumeHTP.TD) : 0,
                TP: (config && config.volumeHTP && Object.prototype.hasOwnProperty.call(config.volumeHTP, 'TP')) ? Number(config.volumeHTP.TP) : 0
            }
        };

        const success = StateManager.addSubject(trimmedNom, safeConfig);

        if (success) {
            LogService.success(`✅ Matière "${trimmedNom}" ajoutée`);
            NotificationManager.success('Matière ajoutée');
            StateManager.saveState();
        }

        return success;
    }

    /**
     * Supprime une matière
     * @param {string} nom - Le nom de la matière
     */
    removeSubject(nom) {
        // Vérifier si la matière a des séances
        const seances = StateManager.getSeances();
        const hasSeances = seances.some(s => s.matiere === nom);

        if (hasSeances) {
            DialogManager.warning(
                `La matière <strong>${nom}</strong> a des séances planifiées.<br><br>
                Voulez-vous vraiment la supprimer ?<br>
                <em>Toutes les séances associées seront également supprimées.</em>`,
                () => {
                    this.performRemoveSubject(nom);
                }
            );
        } else {
            DialogManager.confirm(
                'Supprimer la Matière',
                `Voulez-vous vraiment supprimer <strong>${nom}</strong> ?`,
                () => {
                    this.performRemoveSubject(nom);
                }
            );
        }
    }

    /**
     * Effectue la suppression de la matière
     * @param {string} nom - Le nom de la matière
     */
    performRemoveSubject(nom) {
        // Supprimer toutes les séances associées
        const seances = StateManager.getSeances();
        const seancesToRemove = seances.filter(s => s.matiere === nom);

        seancesToRemove.forEach(seance => {
            StateManager.removeSeance(seance.id);
        });
        // Vérifie session courante et recalcule volume automne si pertinent
        if (
            String(StateManager.state.header.session || '')
                .toLowerCase()
                .includes('automne')
        ) {
            StateManager.recomputeVolumesAutomne();
        }
        // Après suppression des séances associées à la matière, si session Automne
        const isAutomne = String(StateManager.state.header.session || '').toLowerCase().includes('automne');
        if (isAutomne) {
            StateManager.recomputeVolumesAutomne();
        }

        // Supprimer la matière
        const success = StateManager.removeSubject(nom);

        if (success) {
            LogService.success(`✅ Matière "${nom}" supprimée (${seancesToRemove.length} séance(s))`);
            NotificationManager.success('Matière supprimée');
            StateManager.saveState();
        }
    }

    /**
     * Met à jour la configuration d'une matière
     * Supporte le renommage de la matière et la mise à jour des séances qui la référencent.
     * Cette version accepte explicitement les valeurs numériques à 0.
     * @param {string} nom - Le nom actuel de la matière (clé)
     * @param {Object} config - La nouvelle configuration (peut contenir `nom` pour renommer)
     * @returns {boolean} Succès de la mise à jour
     */
    updateSubject(nom, config) {
        const mg = StateManager.state.matiereGroupes || {};

        if (!mg[nom]) {
            DialogManager.error(`Matière "${nom}" introuvable.`);
            return false;
        }

        // Debug léger (optionnel)
        LogService.info && LogService.info(`[SubjectController] updateSubject called for "${nom}" with config: ${JSON.stringify(config)}`);

        // Déterminer le nouveau nom souhaité (si fourni)
        const requestedNewName = config && Object.prototype.hasOwnProperty.call(config, 'nom') ? String(config.nom).trim() : String(nom).trim();
        const newName = requestedNewName || String(nom).trim();

        // Si renommage et conflit de nom existant -> refuser
        if (newName !== nom && mg[newName]) {
            DialogManager.error(`Impossible de renommer : une matière nommée "${newName}" existe déjà.`);
            LogService.error(`updateSubject: conflit de nom lors du renommage "${nom}" -> "${newName}"`);
            return false;
        }

        try {
            const existing = mg[nom] || {};

            // Construire les champs numériques en respectant explicitement la présence de la valeur,
            // même si elle vaut 0.
            const sections_cours = Object.prototype.hasOwnProperty.call(config || {}, 'sections_cours')
                ? Number(config.sections_cours)
                : (existing.sections_cours !== undefined ? existing.sections_cours : 0);

            const td_groups = Object.prototype.hasOwnProperty.call(config || {}, 'td_groups')
                ? Number(config.td_groups)
                : (existing.td_groups !== undefined ? existing.td_groups : 0);

            const tp_groups = Object.prototype.hasOwnProperty.call(config || {}, 'tp_groups')
                ? Number(config.tp_groups)
                : (existing.tp_groups !== undefined ? existing.tp_groups : 0);

            const nbEnseignantsTP = Object.prototype.hasOwnProperty.call(config || {}, 'nbEnseignantsTP')
                ? Number(config.nbEnseignantsTP)
                : (existing.nbEnseignantsTP !== undefined ? existing.nbEnseignantsTP : 1);

            // Volume HTP : traiter chaque sous-champ (Cours/TD/TP) en acceptant 0
            const existingVol = existing.volumeHTP || { Cours: 0, TD: 0, TP: 0 };
            const cfgVol = (config && config.volumeHTP) ? config.volumeHTP : {};

            const volCours = Object.prototype.hasOwnProperty.call(cfgVol, 'Cours')
                ? Number(cfgVol.Cours)
                : (existingVol.Cours !== undefined ? existingVol.Cours : 0);

            const volTD = Object.prototype.hasOwnProperty.call(cfgVol, 'TD')
                ? Number(cfgVol.TD)
                : (existingVol.TD !== undefined ? existingVol.TD : 0);

            const volTP = Object.prototype.hasOwnProperty.call(cfgVol, 'TP')
                ? Number(cfgVol.TP)
                : (existingVol.TP !== undefined ? existingVol.TP : 0);

            // Construire l'objet mis à jour en combinant champs string et numériques traités explicitement
            const updated = {
                ...existing,
                // champs texte / simples : si fournis dans config, on les utilise, sinon on garde existant
                filiere: Object.prototype.hasOwnProperty.call(config || {}, 'filiere') ? (config.filiere || '') : (existing.filiere || ''),
                departement: Object.prototype.hasOwnProperty.call(config || {}, 'departement') ? (config.departement || '') : (existing.departement || ''),
                // champs numériques normalisés
                sections_cours,
                td_groups,
                tp_groups,
                nbEnseignantsTP,
                volumeHTP: {
                    Cours: volCours,
                    TD: volTD,
                    TP: volTP
                },
                // autres champs éventuels depuis config (ne pas écraser volontairement si absent)
                ...Object.keys(config || {}).reduce((acc, k) => {
                    if (!['filiere', 'departement', 'sections_cours', 'td_groups', 'tp_groups', 'nbEnseignantsTP', 'volumeHTP', 'nom'].includes(k)) {
                        acc[k] = config[k];
                    }
                    return acc;
                }, {})
            };

            // Si renommage : essayer d'utiliser StateManager.addSubject/removeSubject si possible pour garder invariants
            if (newName !== nom) {
                let renameDone = false;
                try {
                    if (typeof StateManager.addSubject === 'function') {
                        const added = StateManager.addSubject(newName, updated);
                        if (added) {
                            // mettre à jour les séances référencées
                            const seances = StateManager.getSeances() || [];
                            seances.forEach(s => {
                                if (s.matiere === nom) {
                                    s.matiere = newName;
                                }
                            });
                            // supprimer ancienne
                            if (typeof StateManager.removeSubject === 'function') {
                                StateManager.removeSubject(nom);
                            } else {
                                delete mg[nom];
                            }
                            StateManager.saveState();
                            renameDone = true;
                            LogService.success(`Matière renommée via StateManager : "${nom}" -> "${newName}"`);
                        } else {
                            LogService.warning(`StateManager.addSubject a retourné false pour "${newName}"`);
                        }
                    }
                } catch (e) {
                    LogService.warning('Erreur lors de l\'utilisation de StateManager.addSubject pour le renommage: ' + (e && e.message));
                }

                if (!renameDone) {
                    // fallback manuel
                    mg[newName] = updated;
                    delete mg[nom];

                    const seances = StateManager.getSeances() || [];
                    seances.forEach(s => {
                        if (s.matiere === nom) {
                            s.matiere = newName;
                        }
                    });

                    StateManager.saveState();
                    LogService.success(`Matière renommée (manuelle) : "${nom}" -> "${newName}"`);
                }

                NotificationManager.success(`Matière renommée : ${nom} → ${newName}`);
            } else {
                // Pas de renommage : simple mise à jour
                mg[nom] = updated;
                StateManager.saveState();
                LogService.success(`✅ Matière "${nom}" mise à jour`);
                NotificationManager.success('Matière mise à jour');
            }

            return true;
        } catch (err) {
            LogService.error(`updateSubject error: ${err.message}`);
            DialogManager.error('Erreur lors de la mise à jour de la matière. Voir la console pour plus de détails.');
            return false;
        }
    }

    /**
     * Calcule les statistiques d'une matière
     * @param {string} nom - Le nom de la matière
     * @returns {Object} Les statistiques
     */
    getSubjectStats(nom) {
        const subject = new Subject(nom, StateManager.state.matiereGroupes[nom]);
        const seances = StateManager.getSeances().filter(s => s.matiere === nom);

        const plannedGroups = VolumeService.calculatePlannedGroups([...seances]);
        const assignedGroups = VolumeService.calculateAssignedGroups([...seances]);

        const totalGroups = subject.getTotalGroups();
        const vht = subject.calculateVHT();

        const stats = {
            totalSeances: seances.length,
            plannedCours: plannedGroups[nom]?.Cours?.size || 0,
            plannedTD: plannedGroups[nom]?.TD?.size || 0,
            plannedTP: plannedGroups[nom]?.TP?.size || 0,
            assignedCours: assignedGroups[nom]?.Cours || 0,
            assignedTD: assignedGroups[nom]?.TD || 0,
            assignedTP: assignedGroups[nom]?.TP || 0,
            expectedCours: totalGroups.cours,
            expectedTD: totalGroups.td,
            expectedTP: totalGroups.tp,
            vht,
            enseignants: [...new Set(seances.flatMap(s => s.enseignantsArray))],
            completionRate: this.calculateCompletionRate(
                plannedGroups[nom],
                totalGroups
            )
        };

        return stats;
    }

    /**
     * Calcule le taux de complétion d'une matière
     * @param {Object} planned - Groupes planifiés
     * @param {Object} expected - Groupes attendus
     * @returns {number} Taux de complétion (0-100)
     */
    calculateCompletionRate(planned, expected) {
        if (!planned) return 0;

        const totalPlanned = (planned.Cours?.size || 0) +
            (planned.TD?.size || 0) +
            (planned.TP?.size || 0);

        const totalExpected = expected.cours + expected.td + expected.tp;

        if (totalExpected === 0) return 0;

        return Math.round((totalPlanned / totalExpected) * 100);
    }

    /**
     * Obtient toutes les matières avec leurs statistiques
     * @returns {Array<Object>} Les matières avec stats
     */
    getAllSubjectsWithStats() {
        return Object.keys(StateManager.state.matiereGroupes).map(nom => {
            const config = StateManager.state.matiereGroupes[nom];
            const stats = this.getSubjectStats(nom);

            return {
                nom,
                config,
                stats
            };
        });
    }

    /**
     * Vérifie les incohérences dans la configuration d'une matière
     * @param {string} nom - Le nom de la matière
     * @returns {Array<string>} Les incohérences détectées
     */
    checkSubjectInconsistencies(nom) {
        const inconsistencies = [];
        const subject = new Subject(nom, StateManager.state.matiereGroupes[nom]);
        const stats = this.getSubjectStats(nom);

        // Vérifier si toutes les séances théoriques sont planifiées
        if (stats.plannedCours < stats.expectedCours) {
            inconsistencies.push(`Cours : ${stats.plannedCours}/${stats.expectedCours} planifiés`);
        }
        if (stats.plannedTD < stats.expectedTD) {
            inconsistencies.push(`TD : ${stats.plannedTD}/${stats.expectedTD} planifiés`);
        }
        if (stats.plannedTP < stats.expectedTP) {
            inconsistencies.push(`TP : ${stats.plannedTP}/${stats.expectedTP} planifiés`);
        }

        // Vérifier si toutes les séances ont un enseignant
        if (stats.assignedCours < stats.plannedCours) {
            inconsistencies.push(`Cours sans enseignant : ${stats.plannedCours - stats.assignedCours}`);
        }
        if (stats.assignedTD < stats.plannedTD) {
            inconsistencies.push(`TD sans enseignant : ${stats.plannedTD - stats.assignedTD}`);
        }
        if (stats.assignedTP < stats.plannedTP) {
            inconsistencies.push(`TP sans enseignant : ${stats.plannedTP - stats.assignedTP}`);
        }

        return inconsistencies;
    }

    /**
     * Exporte les données d'une matière
     * @param {string} nom - Le nom de la matière
     * @returns {Object} Les données exportées
     */
    exportSubjectData(nom) {
        const config = StateManager.state.matiereGroupes[nom];
        const stats = this.getSubjectStats(nom);
        const seances = StateManager.getSeances().filter(s => s.matiere === nom);

        return {
            nom,
            config,
            stats,
            seances: seances.map(s => s.toJSON())
        };
    }
}

// Export d'une instance singleton
export default new SubjectController();