/**
 * Modèle représentant une salle
 * @author Ibrahim Mrani - UCD
 */

export default class Room {
    /**
     * Crée une instance de salle
     * @param {string} nom - Le nom de la salle
     * @param {string} type - Le type (Amphi, Standard, STP)
     */
    constructor(nom, type = 'Standard') {
        this.nom = nom;
        this.type = type; // Amphi, Standard, STP
    }

    /**
     * Vérifie si la salle est compatible avec un type de séance
     * @param {string} typeSeance - Le type de séance (Cours, TD, TP)
     * @returns {boolean} True si compatible
     */
    isCompatibleWith(typeSeance) {
        if (typeSeance === 'Cours') {
            return this.type === 'Amphi' || this.type === 'Standard';
        } else if (typeSeance === 'TP') {
            return this.nom.toUpperCase().startsWith('STP');
        } else if (typeSeance === 'TD') {
            return this.type === 'Standard';
        }
        return true;
    }

    /**
     * Vérifie si c'est un amphi
     * @returns {boolean} True si amphi
     */
    isAmphi() {
        return this.type === 'Amphi';
    }

    /**
     * Vérifie si c'est une salle de TP
     * @returns {boolean} True si STP
     */
    isSTP() {
        return this.type === 'STP' || this.nom.toUpperCase().startsWith('STP');
    }

    /**
     * Vérifie si c'est une salle standard
     * @returns {boolean} True si standard
     */
    isStandard() {
        return this.type === 'Standard';
    }

    /**
     * Obtient une description formatée de la salle
     * @returns {string} La description
     */
    getDescription() {
        return `${this.nom} (${this.type})`;
    }

    /**
     * Convertit en objet simple
     * @returns {Object} L'objet
     */
    toJSON() {
        return {
            nom: this.nom,
            type: this.type
        };
    }

    /**
     * Crée une salle depuis un objet
     * @param {Object} data - Les données
     * @returns {Room} La salle
     */
    static fromJSON(data) {
        return new Room(data.nom, data.type);
    }

    /**
     * Compare deux salles
     * @param {Room} other - L'autre salle
     * @returns {boolean} True si identiques
     */
    equals(other) {
        return this.nom === other.nom && this.type === other.type;
    }

    /**
     * Obtient les types de salles disponibles
     * @returns {Array<string>} Les types
     */
    static getAvailableTypes() {
        return ['Standard', 'Amphi', 'STP'];
    }
}