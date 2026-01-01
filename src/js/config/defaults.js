/**
 * Valeurs par défaut de l'application
 * @author Ibrahim Mrani - UCD
 */

export const DEFAULT_FILIERES = [
    { nom: 'S1PC', session: 'Automne' }, 
    { nom: 'S3P', session: 'Automne' },
    { nom: 'S4P', session: 'Printemps' }, 
    { nom: 'S4C', session: 'Printemps' },
    { nom: 'S5P', session: 'Automne' }, 
    { nom: 'Master P', session: 'Automne' }, 
];

export const DEFAULT_ENSEIGNANTS = [];

export const DEFAULT_MATIERE_GROUPES_INFO = {};

export const DEFAULT_SALLES_INFO = {
    'Amphi F': 'Amphi', 
    'Amphi B': 'Amphi', 
    'Amphi Y': 'Amphi', 
    'Amphi N': 'Amphi', 
    'Amphi H': 'Amphi',
    'STP 15': 'STP', 
    'STP14': 'STP', 
    'STP17': 'STP',
    'S1': 'Standard', 'S2': 'Standard', 'S3': 'Standard', 'S4': 'Standard', 
    'S5': 'Standard', 'S6': 'Standard', 'S7': 'Standard', 'S8': 'Standard', 
    'S9': 'Standard', 'S10': 'Standard', 'S11': 'Standard', 'S12': 'Standard',
    'S13': 'Standard', 'S14': 'Standard', 'S15': 'Standard', 'S16': 'Standard', 
    'S17': 'Standard', 'S18': 'Standard', 'S19': 'Standard', 'S20': 'Standard',
    'S21': 'Standard', 'S22': 'Standard', 'S23': 'Standard', 'S24': 'Standard', 
    'S25': 'Standard', 'S26': 'Standard', 'S27': 'Standard', 'S28': 'Standard',
    'S29': 'Standard', 'S30': 'Standard', 'S31': 'Standard', 'S32': 'Standard', 
    'S33': 'Standard', 'S34': 'Standard', 'S35': 'Standard', 'S36': 'Standard',
    'S37': 'Standard', 'S38': 'Standard', 'S39': 'Standard', 'S40': 'Standard', 
    'S41': 'Standard', 'S42': 'Standard', 'S43': 'Standard', 'S44': 'Standard',
    'S45': 'Standard', 'S46': 'Standard', 'S47': 'Standard', 'S48': 'Standard', 
    'S49': 'Standard', 'S50': 'Standard', 'S51': 'Standard', 'S52': 'Standard'
};

/**
 * Obtient la session par défaut selon le mois actuel
 * @returns {string} "Session d'automne" ou "Session de printemps"
 */
export function getDefaultSession() {
    const month = new Date().getMonth();
    // Septembre à Décembre (mois 8-11) ou Janvier (mois 0)
    if (month >= 8 || month === 0) {
        return "Session d'automne";
    } 
    // Février à Juin (mois 1-5)
    else if (month >= 1 && month <= 5) {
        return "Session de printemps";
    }
    return "Session d'automne";
}

/**
 * Obtient l'année universitaire actuelle
 * @returns {string} Format "2024/2025"
 */
export function getDefaultAcademicYear() {
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    
    // Si on est entre janvier et août, on est encore dans l'année universitaire précédente
    if (month >= 0 && month < 8) {
        return `${year - 1}/${year}`;
    }
    
    return `${year}/${year + 1}`;
}

/**
 * Départements disponibles
 */
export const DEPARTEMENTS = [
    'Département de physique',
    'Département de chimie',
    'Département de Biologie',
    'Département de mathématiques',
    "Département d'informatique",
    'Département de Géologie',
    'Département Modules Transversaux',
    'Administration'
];

/**
 * Sessions disponibles
 */
export const SESSIONS = [
    "Session d'automne",
    "Session de printemps"
];