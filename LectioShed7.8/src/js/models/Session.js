/**
 * Modèle représentant une séance d'emploi du temps
 * @author Ibrahim Mrani - UCD
 */

import { DEFAULT_VOLUME_HTP } from '../config/constants.js';

export default class Session {
    /**
     * Crée une instance de Session
     * @param {Object} data - Les données de la séance
     */
    constructor(data = {}) {
        this.id = data.id || null;
        this.jour = data.jour || '';
        this.creneau = data.creneau || '';
        this.filiere = data.filiere || '';
        this.matiere = data.matiere || '';
        this.type = data.type || 'Cours'; // Cours, TD, TP
        this.section = data.section || '';
        this.groupe = data.groupe || '';
        this.uniqueStudentEntity = data.uniqueStudentEntity || '';
        this.enseignant = data.enseignant || '';
        this.enseignantsArray = data.enseignantsArray || [];
        this.salle = data.salle || '';
        this.dureeAffichee = data.dureeAffichee || 1.5;
        this.hTP_Affecte = data.hTP_Affecte !== undefined ? data.hTP_Affecte : 0;
    }

    /**
     * Génère l'entité étudiante unique (pour détecter les conflits)
     * @param {string} filiere - La filière
     * @param {string} section - La section
     * @param {string} type - Le type de séance
     * @param {string} groupeTDTP - Le groupe TD/TP
     * @returns {string} L'entité unique
     */
    static generateUniqueStudentEntity(filiere, section, type, groupeTDTP = '') {
        if (type === 'TD' || type === 'TP') {
            return `${filiere} - ${section} - ${groupeTDTP}`;
        }
        return `${filiere} - ${section}`;
    }

    /**
     * Génère le groupe affiché
     * @param {string} section - La section
     * @param {string} type - Le type de séance
     * @param {string} groupeTDTP - Le groupe TD/TP
     * @returns {string} Le groupe
     */
    static generateGroupe(section, type, groupeTDTP = '') {
        if (type === 'TD' || type === 'TP') {
            return `${section} - ${groupeTDTP}`;
        }
        return section;
    }

    /**
     * Crée une séance complète à partir de données de formulaire
     * @param {Object} formData - Les données du formulaire
     * @param {number} id - L'ID de la séance
     * @param {number} htpValue - Le volume hTP (optionnel)
     * @returns {Session} La nouvelle séance
     */
    static fromFormData(formData, id, htpValue = null) {
        const enseignantsArray = [];
        if (formData.enseignant1) enseignantsArray.push(formData.enseignant1);
        if (formData.enseignant2) enseignantsArray.push(formData.enseignant2);

        const uniqueStudentEntity = Session.generateUniqueStudentEntity(
            formData.filiere,
            formData.section,
            formData.type,
            formData.groupeTDTP
        );

        const groupe = Session.generateGroupe(
            formData.section,
            formData.type,
            formData.groupeTDTP
        );

        const hTP_Affecte = htpValue !== null
            ? htpValue
            : (DEFAULT_VOLUME_HTP[formData.type] || 0);

        return new Session({
            id,
            jour: formData.jour,
            creneau: formData.creneau,
            filiere: formData.filiere,
            matiere: formData.matiere,
            type: formData.type,
            section: formData.section,
            groupe,
            uniqueStudentEntity,
            enseignant: enseignantsArray.join(' / '),
            enseignantsArray,
            salle: formData.salle || '',
            dureeAffichee: 1.5,
            hTP_Affecte
        });
    }

    /**
     * Clone la séance (pour édition/déplacement)
     * @returns {Session} Le clone
     */
    clone() {
        return new Session({ ...this });
    }

    /**
     * Convertit la séance en objet simple
     * @returns {Object} L'objet
     */
    toJSON() {
        // Construire un tableau sûr d'enseignants à partir des sources possibles
        const safeEnseignantsArray = (function () {
            try {
                if (Array.isArray(this.enseignantsArray)) return this.enseignantsArray.slice();
                if (Array.isArray(this.enseignants)) return this.enseignants.slice();
                if (Array.isArray(this.teachers)) return this.teachers.slice();
                if (typeof this.enseignantsArray === 'string' && this.enseignantsArray.trim()) return [this.enseignantsArray.trim()];
                if (typeof this.enseignant === 'string' && this.enseignant.trim()) return [this.enseignant.trim()];
                if (typeof this.teacher === 'string' && this.teacher.trim()) return [this.teacher.trim()];
                const cand = this.enseignants || this.enseignantsArray || this.teachers;
                if (cand && typeof cand[Symbol.iterator] === 'function') return Array.from(cand);
            } catch (e) { /* noop */ }
            return [];
        }).call(this);

        // Construire une copie superficielle des propriétés propres à cet objet (sans fonctions)
        const result = {};
        try {
            Object.keys(this || {}).forEach(k => {
                try {
                    const v = this[k];
                    if (typeof v !== 'function') result[k] = v;
                } catch (e) { /* noop per-key */ }
            });
        } catch (e) { /* noop */ }

        // S'assurer d'avoir la clé enseignantsArray propre
        result.enseignantsArray = safeEnseignantsArray;

        // Optionnel : garantir cohérence des clés dérivées
        if (!result.enseignants || !Array.isArray(result.enseignants)) result.enseignants = safeEnseignantsArray.slice();
        if (!result.enseignant) result.enseignant = safeEnseignantsArray[0] || '';

        return result;
    }

    /**
     * Vérifie si la séance a au moins un enseignant attribué
     * @returns {boolean} True si attribuée
     */
    hasTeacher() {
        return this.enseignantsArray.length > 0;
    }

    /**
     * Vérifie si la séance a une salle attribuée
     * @returns {boolean} True si a une salle
     */
    hasRoom() {
        return this.salle !== null && this.salle !== '';
    }

    /**
     * Met à jour les enseignants
     * @param {Array<string>} teachers - Les enseignants
     */
    setTeachers(teachers) {
        this.enseignantsArray = teachers.filter(t => t && t !== '');
        this.enseignant = this.enseignantsArray.join(' / ');
    }

    /**
     * Ajoute un enseignant
     * @param {string} teacher - L'enseignant à ajouter
     */
    addTeacher(teacher) {
        if (teacher && !this.enseignantsArray.includes(teacher)) {
            this.enseignantsArray.push(teacher);
            this.enseignant = this.enseignantsArray.join(' / ');
        }
    }

    /**
     * Retire un enseignant
     * @param {string} teacher - L'enseignant à retirer
     */
    removeTeacher(teacher) {
        this.enseignantsArray = this.enseignantsArray.filter(t => t !== teacher);
        this.enseignant = this.enseignantsArray.join(' / ');
    }

    /**
     * Vérifie si un enseignant est assigné à cette séance
     * @param {string} teacher - Le nom de l'enseignant
     * @returns {boolean} True si assigné
     */
    hasTeacherAssigned(teacher) {
        return this.enseignantsArray.includes(teacher);
    }

    /**
     * Définit la salle
     * @param {string} room - La salle
     */
    setRoom(room) {
        this.salle = room || '';
    }

    /**
     * Vérifie si c'est une séance couplée (TP de 3h)
     * @returns {boolean} True si c'est la première partie d'un TP
     */
    isTPCoupled() {
        return this.type === 'TP' && this.hTP_Affecte > 0;
    }

    /**
     * Vérifie si c'est la deuxième partie d'un TP
     * @returns {boolean} True si c'est la deuxième partie
     */
    isTPSecondPart() {
        return this.type === 'TP' && this.hTP_Affecte === 0;
    }
}