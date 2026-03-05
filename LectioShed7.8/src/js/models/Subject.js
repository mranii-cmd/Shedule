/**
 * Modèle représentant une matière
 * @author Ibrahim Mrani - UCD
 */

import { DEFAULT_VOLUME_HTP } from '../config/constants.js';

export default class Subject {
    /**
     * Crée une instance de matière
     * @param {string} nom - Le nom de la matière
     * @param {Object} data - Les données de configuration
     */
    constructor(nom, data = {}) {
        this.nom = nom;
        this.filiere = data.filiere || '';
        this.sections_cours = data.sections_cours || 0;
        this.td_groups = data.td_groups || 0;
        this.tp_groups = data.tp_groups || 0;
        this.volumeHTP = data.volumeHTP || { ...DEFAULT_VOLUME_HTP };
        this.nbEnseignantsTP = data.nbEnseignantsTP || 1;
    }

    /**
     * Obtient le volume hTP pour un type de séance
     * @param {string} type - Le type (Cours, TD, TP)
     * @returns {number} Le volume hTP
     */
    getVolumeHTP(type) {
        return this.volumeHTP[type] || DEFAULT_VOLUME_HTP[type] || 0;
    }

    /**
     * Définit le volume hTP pour un type
     * @param {string} type - Le type
     * @param {number} volume - Le volume
     */
    setVolumeHTP(type, volume) {
        this.volumeHTP[type] = volume;
    }

    /**
     * Calcule le volume horaire total théorique (VHT)
     * @returns {number} Le VHT
     */
    calculateVHT() {
        const volumeCours = this.sections_cours * this.getVolumeHTP('Cours');
        const volumeTD = this.sections_cours * this.td_groups * this.getVolumeHTP('TD');
        const volumeTP = this.sections_cours * this.tp_groups * this.getVolumeHTP('TP') * this.nbEnseignantsTP;
        
        return volumeCours + volumeTD + volumeTP;
    }

    /**
     * Calcule le nombre total de groupes nécessaires
     * @returns {Object} { cours, td, tp, total }
     */
    getTotalGroups() {
        const cours = this.sections_cours;
        const td = this.sections_cours * this.td_groups;
        const tp = this.sections_cours * this.tp_groups;
        
        return {
            cours,
            td,
            tp,
            total: cours + td + tp
        };
    }

    /**
     * Vérifie si la matière est attachée à une filière
     * @returns {boolean} True si attachée
     */
    hasFiliere() {
        return this.filiere !== null && this.filiere !== '';
    }

    /**
     * Définit la filière
     * @param {string} filiere - La filière
     */
    setFiliere(filiere) {
        this.filiere = filiere || '';
    }

    /**
     * Met à jour la configuration des groupes
     * @param {Object} config - { sections_cours, td_groups, tp_groups, nbEnseignantsTP }
     */
    updateGroupsConfig(config) {
        if (config.sections_cours !== undefined) this.sections_cours = config.sections_cours;
        if (config.td_groups !== undefined) this.td_groups = config.td_groups;
        if (config.tp_groups !== undefined) this.tp_groups = config.tp_groups;
        if (config.nbEnseignantsTP !== undefined) this.nbEnseignantsTP = config.nbEnseignantsTP;
    }

    /**
     * Génère les entités étudiantes théoriques (sections et groupes)
     * @param {string} filiere - La filière (optionnel, utilise celle de la matière si non fournie)
     * @returns {Object} { cours: Array, td: Array, tp: Array }
     */
    generateStudentEntities(filiere = null) {
        const filiereToUse = filiere || this.filiere;
        const entities = {
            cours: [],
            td: [],
            tp: []
        };

        for (let s = 0; s < this.sections_cours; s++) {
            const sectionName = `Section ${String.fromCharCode(65 + s)}`;
            
            // Entité Cours
            entities.cours.push(`${filiereToUse} - ${sectionName}`);
            
            // Entités TD
            for (let g = 1; g <= this.td_groups; g++) {
                entities.td.push(`${filiereToUse} - ${sectionName} - G${g}`);
            }
            
            // Entités TP
            for (let g = 1; g <= this.tp_groups; g++) {
                entities.tp.push(`${filiereToUse} - ${sectionName} - G${g}`);
            }
        }

        return entities;
    }

    /**
     * Convertit en objet pour export
     * @returns {Object} L'objet exportable
     */
    toJSON() {
        return {
            nom: this.nom,
            filiere: this.filiere,
            sections_cours: this.sections_cours,
            td_groups: this.td_groups,
            tp_groups: this.tp_groups,
            volumeHTP: { ...this.volumeHTP },
            nbEnseignantsTP: this.nbEnseignantsTP
        };
    }

    /**
     * Crée une matière depuis un objet
     * @param {string} nom - Le nom
     * @param {Object} data - Les données
     * @returns {Subject} La matière
     */
    static fromJSON(nom, data) {
        return new Subject(nom, data);
    }

    /**
     * Clone la matière
     * @returns {Subject} Le clone
     */
    clone() {
        return new Subject(this.nom, this.toJSON());
    }
}