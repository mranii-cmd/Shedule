/**
 * Helpers pour les enseignants / matières
 * Exporte extractTeachersFromMatiereEntry qui normalise plusieurs formats possibles
 * et retourne un tableau d'enseignants.
 */
export function extractTeachersFromMatiereEntry(entry) {
    if (!entry) return [];

    // 1) si entry.enseignants est un array
    if (Array.isArray(entry.enseignants)) return entry.enseignants;

    // 2) si entry.enseignants est une string (nom unique)
    if (typeof entry.enseignants === 'string' && entry.enseignants.trim()) return [entry.enseignants.trim()];

    // 3) autres clés possibles
    const altKeys = ['enseignants_list', 'enseignantsDisponibles', 'teachers', 'enseignant'];
    for (const k of altKeys) {
        if (Array.isArray(entry[k])) return entry[k];
        if (typeof entry[k] === 'string' && entry[k].trim()) return [entry[k].trim()];
    }

    // 4) heuristique : certaines entrées peuvent contenir un champ 'candidats' ou 'candidates'
    if (Array.isArray(entry.candidats)) return entry.candidats;
    if (Array.isArray(entry.candidates)) return entry.candidates;

    // Rien trouvé — retourner vide
    return [];
}