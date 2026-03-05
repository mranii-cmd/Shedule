/**
 * Constantes globales de l'application EDT
 * @author Ibrahim Mrani - UCD
 * @version 2.9
 */

export const LISTE_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const BREAK_CRENEAU = '10h15';

export const DEFAULT_CRENEAUX = {
    '8h30': { fin: '10h00', duree: 1.5 },
    '10h15': { fin: '11h45', duree: 1.5 },
    '14h00': { fin: '15h30', duree: 1.5 },
    '15h45': { fin: '17h15', duree: 1.5 },
    '17h30': { fin: '19h00', duree: 1.5 }
};

export const LISTE_TYPES_SEANCE = ['Cours', 'TD', 'TP'];

export const CRENEAUX_COUPLES_SUIVANT = { 
    '8h30': '10h15', 
    '14h00': '15h45' 
};

export const DEFAULT_VOLUME_HTP = { 
    'Cours': 0, 
    'TD': 0, 
    'TP': 0 
};

export const SEANCE_COLORS = {
    Cours: { bg: [255, 221, 221], border: [204, 0, 0] },
    TD: { bg: [221, 255, 221], border: [0, 153, 0] },
    TP: { bg: [221, 221, 255], border: [0, 0, 204] }
};

export const STORAGE_KEYS = {
    SEANCES: 'edt_physique_seances',
    NEXT_ID: 'edt_physique_nextId',
    ENSEIGNANTS: 'edt_physique_enseignants',
    SALLES_INFO: 'edt_physique_salles_info',
    SOUHAITS: 'edt_physique_enseignant_souhaits',
    MATIERE_GROUPES: 'edt_physique_matiere_groupes_info',
    FILIERES: 'edt_physique_filieres',
    VOLUMES_SUP: 'edt_physique_volumes_supplementaires',
    CRENEAUX: 'edt_physique_creneaux',
    VOLUMES_AUTOMNE: 'edt_physique_volumes_automne',
    AUTO_SALLES: 'edt_auto_salles_by_filiere',
    HEADER_ANNEE: 'edt_header_annee',
    HEADER_SESSION: 'edt_header_session',
    HEADER_DEPT: 'edt_header_departement',
    FORFAITS: 'edt_physique_forfaits',
    TOLERANCE_MAX_WORKLOAD: 'edt_physique_toleranceMaxWorkload',
    UI_STATE: 'edt_physique_ui'
};

export const MAX_AUTO_PLANNING_ITERATIONS = 100;
export const VHM_TOLERANCE = 20;
export const DEBOUNCE_DELAY = 500;

export const LOG_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INITIAL: 'initial'
};