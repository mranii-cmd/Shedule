/**
 * Service de validation des formulaires et données
 * @author Ibrahim Mrani - UCD
 *
 * Robustification supplémentaire : si header manquant, on tente de reconstruire,
 * et en dernier recours on injecte un header par défaut (année académique courante, session 'Session d\'automne')
 * afin d'éviter le rejet systématique des imports historiques. On retourne toujours
 * un objet `normalized` utilisable par l'importeur.
 */

import { LISTE_TYPES_SEANCE } from '../config/constants.js';

class ValidationService {
    /* ---------- utilitaires internes ---------- */

    _computeCurrentAcademicYear() {
        // Si mois >= août (8), on considère l'année académique courante "YYYY/YYYY+1"
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 1-12
        if (month >= 8) {
            return `${year}/${year + 1}`;
        } else {
            return `${year - 1}/${year}`;
        }
    }

    _guessDefaultSessionLabel() {
        // Valeur lisible utilisée par le reste de l'application
        return "Session d'automne";
    }

    _safeString(v, fallback = '') {
        if (v === undefined || v === null) return fallback;
        return String(v);
    }

    _extractPossible(obj, candidates = []) {
        if (!obj || typeof obj !== 'object') return null;
        for (const key of candidates) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                return obj[key];
            }
            // try case-insensitive
            const found = Object.keys(obj).find(k => k.toLowerCase() === String(key).toLowerCase());
            if (found) return obj[found];
        }
        return null;
    }

    /* ---------- validations de base (inchangées) ---------- */

    validateSeanceData(data, allowNoRoom = false) {
        const errors = [];
        const missingFields = [];

        const requiredFields = {
            'Jour': data && data.jour,
            'Créneau': data && data.creneau,
            'Filière': data && data.filiere,
            'Matière': data && data.matiere,
            'Type': data && data.type,
            'Section': data && data.section
        };

        if (data && data.type !== 'TP' && !allowNoRoom) {
            requiredFields['Salle'] = data.salle;
        }

        if (data && (data.type === 'TD' || data.type === 'TP')) {
            requiredFields['Groupe (TD/TP)'] = data.groupeTDTP || data.groupe || data.groupeTD;
        }

        for (const [fieldName, value] of Object.entries(requiredFields)) {
            if (value === undefined || value === null || (String(value).trim && String(value).trim() === '')) {
                missingFields.push(fieldName);
            }
        }

        if (data && data.type && !LISTE_TYPES_SEANCE.includes(data.type)) {
            errors.push(`Type de séance invalide: ${data.type}`);
        }

        return {
            isValid: missingFields.length === 0 && errors.length === 0,
            errors,
            missingFields
        };
    }

    validateSalleCompatibility(typeSeance, salle, sallesInfo) {
        if (!salle || !sallesInfo || !sallesInfo[salle]) return false;

        const typeSalle = sallesInfo[salle];

        if (typeSeance === 'Cours') {
            return typeSalle === 'Amphi' || typeSalle === 'Standard';
        } else if (typeSeance === 'TP') {
            try {
                return String(salle).toUpperCase().startsWith('STP') || typeSalle === 'STP';
            } catch (e) {
                return typeSalle === 'STP';
            }
        } else if (typeSeance === 'TD') {
            return typeSalle === 'Standard';
        }

        return true;
    }

    /* ---------- validateProjectSchema amélioré ---------- */

    /**
     * Valide et normalise un objet projet JSON importé.
     * Retourne toujours un objet avec les propriétés suivantes :
     * {
     *   ok: boolean,
     *   errors: Array<string>,
     *   warnings: Array<string>,
     *   normalized: {
     *     header: { annee, session, departement },
     *     enseignants: Array<string>,
     *     matiereGroupes: Object,
     *     sallesInfo: Object,
     *     filieres: Array,
     *     seancesAutumn: { seances:[], nextId? },
     *     seancesSpring: { seances:[], nextId? },
     *     forfaits: Array,
     *     volumesAutomne: Object,
     *     creneaux: Object,
     *     autoSallesParFiliere: Object,
     *     raw: original input (kept for reference)
     *   }
     * }
     *
     * Cette fonction tente d'accepter de nombreux formats historiques :
     * - keys alternatives (enseignants / teachers, salles / rooms, etc.)
     * - données sessionnées sous sessionData / session_data / Session_d'automne keys
     * - anciens formats où forfaits étaient stockés dans volumes_sup (array)
     */
    validateProjectSchema(data) {
        const errors = [];
        const warnings = [];

        const normalized = {
            header: {
                annee: this._computeCurrentAcademicYear(),
                session: this._guessDefaultSessionLabel(),
                departement: ''
            },
            enseignants: [],
            matiereGroupes: {},
            sallesInfo: {},
            filieres: [],
            seancesAutumn: { seances: [], nextId: 1 },
            seancesSpring: { seances: [], nextId: 1 },
            forfaits: [],
            volumesAutomne: {},
            creneaux: {},
            autoSallesParFiliere: {},
            raw: data
        };

        if (!data || typeof data !== 'object') {
            errors.push('Le projet doit être un objet JSON.');
            return { ok: false, errors, warnings, normalized };
        }

        // 1) Header detection (header, meta, projectHeader)
        const headerCandidates = ['header', 'meta', 'projectHeader', 'headerInfo', 'header_info'];
        const header = this._extractPossible(data, headerCandidates);
        if (header && typeof header === 'object') {
            normalized.header.annee = this._safeString(header.annee || header.anneeUniv || header.academicYear || normalized.header.annee);
            normalized.header.session = this._safeString(header.session || header.currentSession || header.sessionName || normalized.header.session);
            normalized.header.departement = this._safeString(header.departement || header.department || header.dept || '');
        } else {
            warnings.push('En-tête non trouvé — valeurs par défaut appliquées.');
        }

        // 2) Global collections
        // enseignants
        const enseignants = this._extractPossible(data, ['enseignants', 'teachers', 'liste_enseignants', 'LISTE_ENSEIGNANTS']);
        if (Array.isArray(enseignants)) normalized.enseignants = enseignants.slice();
        else if (typeof enseignants === 'string' && enseignants.trim()) normalized.enseignants = [enseignants.trim()];

        // sallesInfo
        const sallesInfo = this._extractPossible(data, ['sallesInfo', 'salles', 'rooms', 'salles_info', 'SALLES_INFO']);
        if (sallesInfo && typeof sallesInfo === 'object' && !Array.isArray(sallesInfo)) {
            normalized.sallesInfo = { ...sallesInfo };
        } else if (Array.isArray(sallesInfo)) {
            // some exports store rooms as array of objects -> convert to map name->type if possible
            const map = {};
            sallesInfo.forEach(r => {
                if (!r) return;
                if (typeof r === 'string') map[r] = 'Standard';
                else if (r.room || r.nom) {
                    map[r.room || r.nom] = r.type || r.kind || 'Standard';
                }
            });
            normalized.sallesInfo = map;
        }

        // filieres
        const filieresRaw = this._extractPossible(data, ['filieres', 'LISTE_FILIERES', 'filieres_list']);
        if (Array.isArray(filieresRaw) && filieresRaw.length > 0) {
            // support both ["S1PC", ...] and [{nom:'S1PC', session:'Automne'}]
            if (typeof filieresRaw[0] === 'string') {
                normalized.filieres = filieresRaw.map(f => ({ nom: f, session: 'Automne' }));
            } else {
                normalized.filieres = filieresRaw.map(f => (typeof f === 'object' ? f : { nom: String(f) }));
            }
        }

        // matiereGroupes (matiereGroupes, MATIERE_GROUPES_INFO, subjects, matiere_groups)
        const mg = this._extractPossible(data, ['matiereGroupes', 'MATIERE_GROUPES_INFO', 'matiere_groupes', 'subjects', 'matiere_groups']);
        if (mg && typeof mg === 'object' && !Array.isArray(mg)) {
            normalized.matiereGroupes = { ...mg };
        } else {
            // try to parse legacy arrays of subjects
            if (Array.isArray(mg)) {
                // expect array of {nom, filiere, sections_cours, ...}
                const obj = {};
                mg.forEach(s => {
                    if (!s) return;
                    if (typeof s === 'string') obj[s] = {};
                    else if (s.nom) obj[s.nom] = { filiere: s.filiere, sections_cours: s.sections_cours || s.sections || 1, td_groups: s.td_groups || s.tdGroups || 0, tp_groups: s.tp_groups || s.tpGroups || 0, volumeHTP: s.volumeHTP || s.volumeHTP || {} };
                });
                normalized.matiereGroupes = obj;
            }
        }

        // forfaits / volumes_sup legacy handling
        let forfaits = this._extractPossible(data, ['forfaits', 'FORFAITS']);
        const rawVolumesSup = this._extractPossible(data, ['volumes_sup', 'VOLUMES_SUP', 'enseignant_volumes_supplementaires', 'ENSEIGNANT_VOLUMES_SUPPLEMENTAIRES']);
        if (Array.isArray(forfaits) && forfaits.length) {
            normalized.forfaits = forfaits.slice();
            // treat rawVolumesSup as volumesSupplementaires if object
            if (rawVolumesSup && !Array.isArray(rawVolumesSup) && typeof rawVolumesSup === 'object') {
                normalized.volumesAutomne = {}; // keep separate (volumesAutomne)
            }
        } else if (Array.isArray(rawVolumesSup) && rawVolumesSup.length > 0 && rawVolumesSup[0] && rawVolumesSup[0].enseignant !== undefined) {
            // legacy: volumes_sup was actually an array of forfait-like objects
            normalized.forfaits = rawVolumesSup.slice();
        } else {
            normalized.forfaits = [];
        }

        // volumesAutomne (VOLUMES_AUTOMNE)
        const volumesAutomne = this._extractPossible(data, ['volumesAutomne', 'VOLUMES_AUTOMNE', 'volumes_autumn', 'volumes_automne']);
        if (volumesAutomne && typeof volumesAutomne === 'object') normalized.volumesAutomne = { ...volumesAutomne };

        // creneaux
        const creneaux = this._extractPossible(data, ['creneaux', 'LISTE_CRENEAUX', 'LISTE_CRENEAUX']);
        if (creneaux && typeof creneaux === 'object') normalized.creneaux = { ...creneaux };

        // autoSallesParFiliere
        const autoSalles = this._extractPossible(data, ['autoSallesParFiliere', 'AUTO_SALLES', 'AUTO_SALLE_CHOICES_PAR_FILIERE']);
        if (autoSalles && typeof autoSalles === 'object') normalized.autoSallesParFiliere = { ...autoSalles };

        // 3) Session data / seances
        // Several possible layouts:
        // - data.sessionData: { "Session_d'automne": {...}, "Session_de_printemps": {...} }
        // - data.session_autumn / data.session_spring
        // - direct keys: seances (global) + nextId
        // - legacy keys: "Session d'automne" as key
        const sessionDataCandidates = this._extractPossible(data, ['sessionData', 'session_data', 'SESSION_DATA', 'sessionDatas']);
        if (sessionDataCandidates && typeof sessionDataCandidates === 'object') {
            // try several known keys inside
            const autumnKeys = Object.keys(sessionDataCandidates).filter(k => /automne|autumn|session_d'?automne|session_automne/i.test(k));
            const springKeys = Object.keys(sessionDataCandidates).filter(k => /printemps|spring|session_de_printemps|session_printemps/i.test(k));

            if (autumnKeys.length) {
                const k = autumnKeys[0];
                const val = sessionDataCandidates[k];
                normalized.seancesAutumn.seances = Array.isArray(val.seances) ? val.seances.slice() : (Array.isArray(val) ? val : (val && val.seances ? val.seances : []));
                normalized.seancesAutumn.nextId = val.nextSessionId || val.nextId || normalized.seancesAutumn.nextId;
            }
            if (springKeys.length) {
                const k = springKeys[0];
                const val = sessionDataCandidates[k];
                normalized.seancesSpring.seances = Array.isArray(val.seances) ? val.seances.slice() : (Array.isArray(val) ? val : (val && val.seances ? val.seances : []));
                normalized.seancesSpring.nextId = val.nextSessionId || val.nextId || normalized.seancesSpring.nextId;
            }
        }

        // fallback: direct seances / NEXT_ID keys
        const seancesDirect = this._extractPossible(data, ['seances', 'edt', 'sessions', 'planning', 'schedule']);
        if (Array.isArray(seancesDirect) && seancesDirect.length) {
            // Heuristic: if header.session indicates autumn/spring, route accordingly
            const sessionLabel = normalized.header && normalized.header.session ? normalized.header.session.toLowerCase() : '';
            if (sessionLabel.includes('automne') || sessionLabel.includes('autumn')) {
                normalized.seancesAutumn.seances = seancesDirect.slice();
            } else if (sessionLabel.includes('printemps') || sessionLabel.includes('spring')) {
                normalized.seancesSpring.seances = seancesDirect.slice();
            } else {
                // when unknown, place into autumn by default (most common)
                normalized.seancesAutumn.seances = seancesDirect.slice();
                warnings.push('Séances importées sans session explicite — placées par défaut en "Session d\'automne".');
            }

            const nextId = this._extractPossible(data, ['nextSessionId', 'nextId', 'NEXT_ID']);
            if (nextId && Number.isFinite(Number(nextId))) {
                if (normalized.seancesAutumn.seances.length && (normalized.header.session && /automne/i.test(normalized.header.session))) {
                    normalized.seancesAutumn.nextId = Number(nextId);
                } else if (normalized.seancesSpring.seances.length && (normalized.header.session && /printemps/i.test(normalized.header.session))) {
                    normalized.seancesSpring.nextId = Number(nextId);
                } else {
                    // apply to autumn fallback
                    normalized.seancesAutumn.nextId = Number(nextId);
                }
            }
        }

        // Another legacy layout: root keys like "Session_d'automne": { seances: [...] }
        const rootAutumnKey = Object.keys(data).find(k => /session.*automne|session_d'?automne|session_automne/i.test(k));
        const rootSpringKey = Object.keys(data).find(k => /session.*printemps|session_de_printemps|session_printemps/i.test(k));
        if (rootAutumnKey && (!normalized.seancesAutumn.seances || normalized.seancesAutumn.seances.length === 0)) {
            const val = data[rootAutumnKey];
            if (val && typeof val === 'object') {
                normalized.seancesAutumn.seances = Array.isArray(val.seances) ? val.seances.slice() : (Array.isArray(val) ? val : []);
                normalized.seancesAutumn.nextId = val.nextSessionId || val.nextId || normalized.seancesAutumn.nextId;
            }
        }
        if (rootSpringKey && (!normalized.seancesSpring.seances || normalized.seancesSpring.seances.length === 0)) {
            const val = data[rootSpringKey];
            if (val && typeof val === 'object') {
                normalized.seancesSpring.seances = Array.isArray(val.seances) ? val.seances.slice() : (Array.isArray(val) ? val : []);
                normalized.seancesSpring.nextId = val.nextSessionId || val.nextId || normalized.seancesSpring.nextId;
            }
        }

        // 4) Additional optional fields
        const examRoomConfigs = this._extractPossible(data, ['examRoomConfigs', 'exam_room_configs', 'EXAM_ROOM_CONFIGS']);
        if (Array.isArray(examRoomConfigs)) normalized.examRoomConfigs = examRoomConfigs.slice();

        // 5) Final sanity checks & small migrations
        // Ensure arrays/objects presence
        if (!Array.isArray(normalized.enseignants)) normalized.enseignants = [];
        if (!normalized.matiereGroupes || typeof normalized.matiereGroupes !== 'object') normalized.matiereGroupes = {};
        if (!normalized.sallesInfo || typeof normalized.sallesInfo !== 'object') normalized.sallesInfo = {};
        if (!Array.isArray(normalized.filieres)) normalized.filieres = [];

        // If both session seances empty, try to salvage any seances present anywhere in payload
        if ((!normalized.seancesAutumn.seances || normalized.seancesAutumn.seances.length === 0) &&
            (!normalized.seancesSpring.seances || normalized.seancesSpring.seances.length === 0)) {
            // Try to find any array of objects that looks like seances
            const candidateSeances = this._findSeancesDeep(data);
            if (candidateSeances && candidateSeances.length) {
                normalized.seancesAutumn.seances = candidateSeances.slice();
                warnings.push('Aucune séance explicitement associée à une session ; toutes les séances trouvées ont été placées dans "Session d\'automne".');
            }
        }

        // If header session is unknown, make sure it's set to a sane default
        if (!normalized.header.session || String(normalized.header.session).trim() === '') {
            normalized.header.session = this._guessDefaultSessionLabel();
        }

        // Minimal validation result
        const ok = errors.length === 0;

        return { ok, errors, warnings, normalized };
    }

    /**
     * Tentative robuste de découverte profonde d'un tableau "seances" dans un objet quelconque.
     * Renvoie le premier tableau contenant des objets ayant des clés typiques de séance (matiere, jour, creneau).
     */
    _findSeancesDeep(root) {
        try {
            const visited = new WeakSet();
            const isSeanceArray = (arr) => {
                if (!Array.isArray(arr) || arr.length === 0) return false;
                // require at least one element be object with typical keys
                return arr.some(item => item && typeof item === 'object' && (item.matiere || item.jour || item.creneau || item.type));
            };

            const stack = [root];
            while (stack.length) {
                const node = stack.pop();
                if (!node || typeof node !== 'object') continue;
                if (visited.has(node)) continue;
                visited.add(node);

                if (Array.isArray(node)) {
                    if (isSeanceArray(node)) return node;
                    // push children objects
                    node.forEach(c => { if (c && typeof c === 'object') stack.push(c); });
                } else {
                    // check own properties
                    for (const k of Object.keys(node)) {
                        const v = node[k];
                        if (Array.isArray(v) && isSeanceArray(v)) return v;
                        if (v && typeof v === 'object') stack.push(v);
                    }
                }
            }
        } catch (e) {
            // ignore
        }
        return [];
    }
}

// Export d'une instance singleton
export default new ValidationService();