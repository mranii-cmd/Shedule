/**
 * Fonctions utilitaires générales
 * @author Ibrahim Mrani - UCD
 */

import { BREAK_CRENEAU } from '../config/constants.js';

// Variable globale pour stocker les créneaux (sera initialisée par l'app)
let LISTE_CRENEAUX = {};

/**
 * Initialise les créneaux
 * @param {Object} creneaux - L'objet des créneaux
 */
export function initCreneaux(creneaux) {
    LISTE_CRENEAUX = creneaux;
}

/**
 * Trie les créneaux par ordre chronologique
 * @returns {Array<string>} Les clés des créneaux triées
 */
export function getSortedCreneauxKeys() {
    // Robust fallback
    if (!LISTE_CRENEAUX || typeof LISTE_CRENEAUX !== 'object') return [];

    // Parse labels like "8h30", "08:30", "10h15", "10:15" robustly into minutes since midnight
    function parseToMinutes(label) {
        if (!label || typeof label !== 'string') return Number.MAX_SAFE_INTEGER;
        const s = label.trim().replace(/\s+/g, '');
        // unify separators
        const normalized = s.replace(/:/g, 'h').replace(/H/g, 'h');
        const m = normalized.match(/^(\d{1,2})h(\d{1,2})$/i);
        if (m) {
            const hh = parseInt(m[1], 10);
            const mm = parseInt(m[2], 10);
            if (!Number.isNaN(hh) && !Number.isNaN(mm)) return hh * 60 + mm;
        }
        // fallback: try to parse '8' as 8:00
        const n = parseInt(normalized, 10);
        return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : (n * 60);
    }

    return Object.keys(LISTE_CRENEAUX).slice().sort((a, b) => parseToMinutes(a) - parseToMinutes(b));
}

export function getPrioritizedCreneauxKeys() {
    const sorted = getSortedCreneauxKeys();
    
    // Prioriser les 4 premiers créneaux (généralement 8h30, 10h15, 14h00, 15h45)
    // puis ajouter les créneaux restants (17h30, etc.)
    if (sorted.length <= 4) {
        return sorted;
    }
    
    const prioritized = sorted.slice(0, 4);  // Les 4 premiers créneaux
    const remaining = sorted.slice(4);        // Les créneaux restants
    
    return [...prioritized, ...remaining];
}

/**
 * Retourne les jours de la semaine avec rotation pour répartir uniformément
 * Commence par un jour différent à chaque appel pour assurer une distribution équitable
 * @param {number} startIndex - Index de départ pour la rotation (0-5)
 * @returns {Array<string>} Les jours avec rotation (Lundi à Samedi)
 */
export function getRotatedJours(startIndex = 0) {
    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const index = startIndex % jours.length;
    return [...jours.slice(index), ...jours.slice(0, index)];
}

/**
 * Trouve l'index de la colonne séparatrice dans le tableau EDT
 * @returns {number} L'index de la colonne séparatrice, ou -1 si non trouvée
 */
export function getSeparatorColumnIndex() {
    const sortedCreneaux = getSortedCreneauxKeys();
    const index = sortedCreneaux.indexOf(BREAK_CRENEAU);
    // +1 car les créneaux commencent à la colonne 1 (colonne 0 = Jour)
    // +1 pour la colonne séparatrice elle-même
    return index !== -1 ? index + 2 : -1;
}

/**
 * Fonction de debounce pour limiter les appels répétés
 * @param {Function} fn - La fonction à debouncer
 * @param {number} wait - Le délai en millisecondes
 * @returns {Function} La fonction debouncée
 */
export function debounce(fn, wait = 180) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Normalise une chaîne (pour comparaisons insensibles à la casse et accents)
 * @param {*} str - La chaîne à normaliser
 * @returns {string} La chaîne normalisée
 */
export function normalize(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

/**
 * Parse un entier de manière sûre
 * @param {*} value - La valeur à parser
 * @returns {number} L'entier parsé, ou 0 si invalide
 */
export function parseIntSafe(value) {
    if (value === undefined || value === null) return 0;
    const str = String(value).trim().replace(',', '.');
    const num = parseInt(str, 10);
    return isNaN(num) ? 0 : num;
}

/**
 * Parse un float de manière sûre
 * @param {*} value - La valeur à parser
 * @returns {number} Le float parsé, ou 0 si invalide
 */
export function parseFloatSafe(value) {
    if (value === undefined || value === null) return 0;
    const str = String(value).trim().replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

/**
 * Génère une clé de stockage spécifique à la session
 * @param {string} baseKey - La clé de base
 * @param {string} session - La session (ex: "Session d'automne")
 * @returns {string} La clé spécifique à la session
 */
export function getSessionSpecificKey(baseKey, session) {
    if (!session) return baseKey;
    const sessionKey = session.replace(/\s+/g, '_');
    return `${baseKey}_${sessionKey}`;
}

/**
 * Télécharge un fichier
 * @param {string|Blob} content - Le contenu du fichier
 * @param {string} filename - Le nom du fichier
 * @param {string} contentType - Le type MIME
 */
export function downloadFile(content, filename, contentType) {
    const blob = content instanceof Blob 
        ? content 
        : new Blob([content], { type: contentType });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Vérifie si un créneau est dans l'après-midi
 * @param {string} creneau - Le créneau à vérifier
 * @param {Array<string>} creneauxList - La liste des créneaux
 * @returns {boolean} True si c'est l'après-midi
 */
export function isAfternoonCreneau(creneau, creneauxList) {
    const separator = BREAK_CRENEAU;
    const idxSeparator = creneauxList.indexOf(separator);
    
    if (idxSeparator === -1) {
        // Fallback heuristic: considère après-midi si index > 1
        return creneauxList.indexOf(creneau) > 1;
    }
    
    return creneauxList.indexOf(creneau) > idxSeparator;
}

/**
 * Génère un ID unique simple
 * @returns {string} Un ID unique
 */
export function generateUniqueId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clone profond d'un objet
 * @param {*} obj - L'objet à cloner
 * @returns {*} Le clone
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Vérifie si un objet est vide
 * @param {Object} obj - L'objet à vérifier
 * @returns {boolean} True si vide
 */
export function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

/**
 * Formate une date en français
 * @param {Date} date - La date à formater
 * @returns {string} La date formatée
 */
export function formatDateFR(date = new Date()) {
    return date.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
    });
}