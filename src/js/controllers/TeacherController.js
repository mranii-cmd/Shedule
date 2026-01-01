/**
 * Contrôleur pour la gestion des enseignants
 * @author Ibrahim Mrani - UCD
 */

import StateManager from './StateManager.js';
import Teacher from '../models/Teacher.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import VolumeService from '../services/VolumeService.js';

class TeacherController {
    /**
     * Ajoute un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @returns {boolean} Succès de l'ajout
     */
    addTeacher(nom) {
        if (!nom || nom.trim() === '') {
            DialogManager.error('Veuillez saisir un nom d\'enseignant valide.');
            return false;
        }

        const trimmedNom = nom.trim();

        if (StateManager.state.enseignants.includes(trimmedNom)) {
            DialogManager.error(`L'enseignant "${trimmedNom}" existe déjà.`);
            return false;
        }

        const success = StateManager.addTeacher(trimmedNom);

        if (success) {
            // Initialiser les souhaits par défaut
            const teacher = new Teacher(trimmedNom);
            StateManager.state.enseignantSouhaits[trimmedNom] = teacher.souhaits;
            StateManager.state.enseignantVolumesSupplementaires[trimmedNom] = [];

            LogService.success(`✅ Enseignant "${trimmedNom}" ajouté`);
            NotificationManager.success('Enseignant ajouté');
            StateManager.saveState();
        }

        return success;
    }

    /**
     * Supprime un enseignant
     * @param {string} nom - Le nom de l'enseignant
     */
    removeTeacher(nom) {
        // Vérifier si l'enseignant a des séances
        const seances = StateManager.getSeances();
       const hasSeances = seances.some(s => this._seanceHasTeacher(s, nom));

        if (hasSeances) {
            DialogManager.warning(
                `L'enseignant <strong>${nom}</strong> est assigné à des séances.<br><br>
                Voulez-vous vraiment le supprimer ?<br>
                <em>Les séances seront conservées mais sans cet enseignant.</em>`,
                () => {
                    this.performRemoveTeacher(nom);
                }
            );
        } else {
            DialogManager.confirm(
                'Supprimer l\'Enseignant',
                `Voulez-vous vraiment supprimer <strong>${nom}</strong> ?`,
                () => {
                    this.performRemoveTeacher(nom);
                }
            );
        }
    }

    /**
     * Effectue la suppression de l'enseignant
     * @param {string} nom - Le nom de l'enseignant
     */
    performRemoveTeacher(nom) {
        // Retirer l'enseignant des séances
        const seances = StateManager.getSeances();
        seances.forEach(seance => {
            if (this._seanceHasTeacher(seance, nom)) {
                this._removeTeacherFromSeance(seance, nom);
            }
        });

        // Supprimer l'enseignant
        const success = StateManager.removeTeacher(nom);

        if (success) {
            LogService.success(`✅ Enseignant "${nom}" supprimé`);
            NotificationManager.success('Enseignant supprimé');
            StateManager.saveState();
        }
    }

    /**
     * Met à jour les souhaits d'un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @param {Object} souhaits - Les souhaits
     * @returns {boolean} Succès de la mise à jour
     */
    updateWishes(nom, souhaits) {
        if (!StateManager.state.enseignants.includes(nom)) {
            DialogManager.error(`Enseignant "${nom}" introuvable.`);
            return false;
        }

        StateManager.state.enseignantSouhaits[nom] = { ...souhaits };
        LogService.success(`✅ Souhaits de "${nom}" mis à jour`);
        NotificationManager.success('Souhaits mis à jour');
        StateManager.saveState();

        return true;
    }

    /**
     * Ajoute un volume supplémentaire pour un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @param {Object} volume - { type, volume, description }
     * @returns {boolean} Succès de l'ajout
     */
    addSupplementaryVolume(nom, volume) {
        if (!StateManager.state.enseignants.includes(nom)) {
            DialogManager.error(`Enseignant "${nom}" introuvable.`);
            return false;
        }

        if (!StateManager.state.enseignantVolumesSupplementaires[nom]) {
            StateManager.state.enseignantVolumesSupplementaires[nom] = [];
        }

        StateManager.state.enseignantVolumesSupplementaires[nom].push({
            type: volume.type || 'Autre',
            volume: parseFloat(volume.volume) || 0,
            description: volume.description || ''
        });

        LogService.success(`✅ Volume supplémentaire ajouté pour "${nom}"`);
        NotificationManager.success('Volume ajouté');
        StateManager.saveState();

        return true;
    }

    /**
     * Supprime un volume supplémentaire
     * @param {string} nom - Le nom de l'enseignant
     * @param {number} index - L'index du volume à supprimer
     * @returns {boolean} Succès de la suppression
     */
    removeSupplementaryVolume(nom, index) {
        if (!StateManager.state.enseignantVolumesSupplementaires[nom]) {
            return false;
        }

        const volumes = StateManager.state.enseignantVolumesSupplementaires[nom];

        if (index < 0 || index >= volumes.length) {
            return false;
        }

        volumes.splice(index, 1);
        LogService.success(`✅ Volume supplémentaire supprimé`);
        NotificationManager.success('Volume supprimé');
        StateManager.saveState();

        return true;
    }

    /**
     * Calcule les statistiques d'un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @returns {Object} Les statistiques
     */
    getTeacherStats(nom) {
        const seances = StateManager.getSeances();
        const teacherSeances = seances.filter(s => this._seanceHasTeacher(s, nom));

        const stats = {
            totalSeances: teacherSeances.length,
            cours: teacherSeances.filter(s => s.type === 'Cours').length,
            td: teacherSeances.filter(s => s.type === 'TD').length,
            tp: teacherSeances.filter(s => s.type === 'TP').length,
            matieres: [...new Set(teacherSeances.map(s => s.matiere))],
            volume: this.getTeacherVolume(nom)
        };

        return stats;
    }
 /**
+     * Helper: robust check whether a seance has the given teacher assigned.
+     * Supports multiple shapes of seance object:
+     * - seance.hasTeacherAssigned(nom) or seance.hasTeacher(nom)
+     * - seance.enseignantsArray / seance.enseignants / seance.teachers (array of strings or objects)
+     * - seance.enseignant (single)
+     */
    _seanceHasTeacher(seance, nom) {
        if (!seance || !nom) return false;
        try {
            if (typeof seance.hasTeacherAssigned === 'function') {
                return !!seance.hasTeacherAssigned(nom);
            }
            if (typeof seance.hasTeacher === 'function') {
                return !!seance.hasTeacher(nom);
            }

            const list = seance.enseignantsArray || seance.enseignants || seance.teachers || (seance.enseignant ? [seance.enseignant] : []);
            if (Array.isArray(list)) {
                return list.some(t => {
                    if (!t) return false;
                    if (typeof t === 'object') {
                        const candidate = (t.nom || t.name || t.id || '').toString().trim().toLowerCase();
                        return candidate === String(nom).trim().toLowerCase();
                    }
                    return String(t).trim().toLowerCase() === String(nom).trim().toLowerCase();
                });
            }

            // single value
            if (typeof list === 'string' || typeof list === 'number') {
                return String(list).trim().toLowerCase() === String(nom).trim().toLowerCase();
            }
        } catch (e) {
            console.debug('_seanceHasTeacher error', e);
        }
        return false;
    }

    /**
+     * Helper: remove a teacher from a seance in a robust way.
+     * Tries seance.removeTeacher(nom) if available, otherwise mutates enseignant arrays.
+     */
    _removeTeacherFromSeance(seance, nom) {
        if (!seance || !nom) return;
        try {
            if (typeof seance.removeTeacher === 'function') {
                seance.removeTeacher(nom);
                return;
            }

            // mutate enseignant lists safely
            const sanitizeMatch = (x) => {
                if (x == null) return '';
                if (typeof x === 'object') return (x.nom || x.name || x.id || '').toString().trim();
                return String(x).trim();
            };

            if (Array.isArray(seance.enseignantsArray)) {
                seance.enseignantsArray = seance.enseignantsArray.filter(t => sanitizeMatch(t).toLowerCase() !== String(nom).trim().toLowerCase());
            }
            if (Array.isArray(seance.enseignants)) {
                seance.enseignants = seance.enseignants.filter(t => sanitizeMatch(t).toLowerCase() !== String(nom).trim().toLowerCase());
            }
            if (Array.isArray(seance.teachers)) {
                seance.teachers = seance.teachers.filter(t => sanitizeMatch(t).toLowerCase() !== String(nom).trim().toLowerCase());
            }
            // single-field fallback
            if (seance.enseignant && sanitizeMatch(seance.enseignant).toLowerCase() === String(nom).trim().toLowerCase()) {
                delete seance.enseignant;
            }
            if (seance.teacher && sanitizeMatch(seance.teacher).toLowerCase() === String(nom).trim().toLowerCase()) {
                delete seance.teacher;
            }
        } catch (e) {
            console.debug('_removeTeacherFromSeance failed', e);
        }
    }
    /**
     * Calcule le volume horaire d'un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @returns {Object} { enseignement, forfait, total }
     */
    getTeacherVolume(nom) {
        const seances = StateManager.getSeances();
        const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires;

        return VolumeService.calculateTeacherVolumeDetails(
            nom,
            seances,
            volumesSupplementaires
        );
    }

    /**
     * Obtient tous les enseignants avec leurs statistiques
     * @returns {Array<Object>} Les enseignants avec stats
     */
    getAllTeachersWithStats() {
        return StateManager.state.enseignants.map(nom => {
            const stats = this.getTeacherStats(nom);
            const souhaits = StateManager.state.enseignantSouhaits[nom];
            const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires[nom] || [];

            return {
                nom,
                stats,
                souhaits,
                volumesSupplementaires
            };
        });
    }

    /**
     * Exporte les données d'un enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @returns {Object} Les données exportées
     */
    exportTeacherData(nom) {
        const stats = this.getTeacherStats(nom);
        const souhaits = StateManager.state.enseignantSouhaits[nom];
        const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires[nom] || [];
        const seances = StateManager.getSeances().filter(s => s.hasTeacherAssigned(nom));

        return {
            nom,
            stats,
            souhaits,
            volumesSupplementaires,
            seances: seances.map(s => s.toJSON())
        };
    }
}

// Export d'une instance singleton
export default new TeacherController();