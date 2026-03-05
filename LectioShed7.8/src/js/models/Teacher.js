/**
 * Modèle représentant un enseignant
 * @author Ibrahim Mrani - UCD
 */

export default class Teacher {
    /**
     * Crée une instance d'enseignant
     * @param {string} nom - Le nom de l'enseignant
     * @param {Object} data - Données supplémentaires
     */
    constructor(nom, data = {}) {
        this.nom = nom;
        this.souhaits = data.souhaits || this.createDefaultWishes();
        this.volumesSupplementaires = data.volumesSupplementaires || [];
        this.volumeTotal = 0; // Calculé dynamiquement
    }

    /**
     * Crée les souhaits par défaut
     * @returns {Object} Les souhaits vides
     */
    createDefaultWishes() {
        return {
            choix1: '',
            c1: 0,
            td1: 0,
            tp1: 0,
            choix2: '',
            c2: 0,
            td2: 0,
            tp2: 0,
            choix3: '',
            c3: 0,
            td3: 0,
            tp3: 0,
            contraintes: 'Aucune remarque.'
        };
    }

    /**
     * Définit les souhaits de l'enseignant
     * @param {Object} souhaits - Les souhaits
     */
    setSouhaits(souhaits) {
        this.souhaits = { ...this.createDefaultWishes(), ...souhaits };
    }

    /**
     * Ajoute un volume supplémentaire
     * @param {Object} volume - { type, volume, description }
     */
    addVolumeSupplementaire(volume) {
        this.volumesSupplementaires.push({
            type: volume.type,
            volume: volume.volume,
            description: volume.description || ''
        });
    }

    /**
     * Retire un volume supplémentaire
     * @param {number} index - L'index du volume à retirer
     */
    removeVolumeSupplementaire(index) {
        if (index >= 0 && index < this.volumesSupplementaires.length) {
            this.volumesSupplementaires.splice(index, 1);
        }
    }

    /**
     * Calcule le volume supplémentaire total
     * @returns {number} Le volume total
     */
    getTotalVolumeSupplementaire() {
        return this.volumesSupplementaires.reduce((sum, v) => sum + v.volume, 0);
    }

    /**
     * Vérifie si l'enseignant a cette matière dans ses souhaits
     * @param {string} matiere - La matière
     * @returns {boolean} True si dans les souhaits
     */
    hasWishForSubject(matiere) {
        return this.souhaits.choix1 === matiere ||
               this.souhaits.choix2 === matiere ||
               this.souhaits.choix3 === matiere;
    }

    /**
     * Obtient le rang de priorité pour une matière (1, 2, 3 ou 0)
     * @param {string} matiere - La matière
     * @returns {number} Le rang (0 si pas dans les souhaits)
     */
    getWishRankForSubject(matiere) {
        if (this.souhaits.choix1 === matiere) return 1;
        if (this.souhaits.choix2 === matiere) return 2;
        if (this.souhaits.choix3 === matiere) return 3;
        return 0;
    }

    /**
     * Vérifie si l'enseignant refuse explicitement un type pour une matière
     * @param {string} matiere - La matière
     * @param {string} type - Le type (Cours, TD, TP)
     * @returns {boolean} True si refus explicite
     */
    refusesTypeForSubject(matiere, type) {
        const rank = this.getWishRankForSubject(matiere);
        if (rank === 0) return false;

        const typeKey = type === 'Cours' ? 'c' : type.toLowerCase();
        const specificKey = typeKey + rank;

        if (this.souhaits.hasOwnProperty(specificKey)) {
            const value = this.souhaits[specificKey];
            return value === 0 || String(value).trim() === '0' || String(value).trim() === '0.0';
        }

        return false;
    }

    /**
     * Obtient le nombre de séances souhaitées pour un type et une matière
     * @param {string} matiere - La matière
     * @param {string} type - Le type (Cours, TD, TP)
     * @returns {number} Le nombre souhaité
     */
    getRequestedCountForType(matiere, type) {
        const rank = this.getWishRankForSubject(matiere);
        if (rank === 0) return 0;

        const typeKey = type === 'Cours' ? 'c' : type.toLowerCase();
        const specificKey = typeKey + rank;

        return this.souhaits[specificKey] || 0;
    }

    /**
     * Convertit en objet pour export
     * @returns {Object} L'objet exportable
     */
    toJSON() {
        return {
            nom: this.nom,
            souhaits: this.souhaits,
            volumesSupplementaires: this.volumesSupplementaires
        };
    }

    /**
     * Crée un enseignant depuis un objet
     * @param {Object} data - Les données
     * @returns {Teacher} L'enseignant
     */
    static fromJSON(data) {
        return new Teacher(data.nom, {
            souhaits: data.souhaits,
            volumesSupplementaires: data.volumesSupplementaires
        });
    }
}