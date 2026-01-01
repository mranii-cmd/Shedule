/**
 * Service de détection de conflits dans l'emploi du temps
 * @author Ibrahim Mrani - UCD
 */

import { CRENEAUX_COUPLES_SUIVANT } from '../config/constants.js';
import ValidationService from './ValidationService.js';

class ConflictService {
    /**
     * Vérifie tous les conflits pour une séance
     * @param {Session} session - La séance à vérifier
     * @param {Array<Session>} allSessions - Toutes les séances
     * @param {Array<number>} excludeIds - IDs à exclure de la vérification
     * @param {Object} sallesInfo - Informations sur les salles
     * @returns {Array<string>} Liste des conflits détectés
     */
    checkAllConflicts(session, allSessions, excludeIds = [], sallesInfo = {}) {
        console.log('[ConflictService] session.allowTimeSlotConflict =', session.allowTimeSlotConflict);
        const conflicts = [];
        const seancesAComparer = Array.isArray(allSessions) ? allSessions.filter(s => !excludeIds.includes(s.id)) : [];
        // DEBUG: trace candidate + how many sessions will be compared (safe; can be removed later)
        try {
            console.debug && console.debug('[ConflictService] checkAllConflicts called for', {
                id: session && session.id,
                matiere: session && session.matiere,
                jour: session && session.jour,
                creneau: session && session.creneau,
                heureDebut: session && session.heureDebut,
                heureFin: session && session.heureFin,
                salle: session && session.salle
            });
            console.debug && console.debug('[ConflictService] sessions to compare:', seancesAComparer.length);
        } catch (e) { /* ignore logging errors */ }
        // DEBUG: trace caller candidate + summary of compared sessions
        try {
            console.debug('[ConflictService] checkAllConflicts called for session:',
                { id: session && session.id, matiere: session && session.matiere, jour: session && session.jour, creneau: session && session.creneau, heureDebut: session && session.heureDebut, heureFin: session && session.heureFin, salle: session && session.salle, _candidate: !!session._candidate });
            console.debug('[ConflictService] number of sessions available to compare:', seancesAComparer.length, 'excludeIds:', excludeIds && excludeIds.slice(0, 5));
        } catch (e) { /* ignore logging errors */ }
        // 1. Vérifier les conflits enseignants
        conflicts.push(...this.checkTeacherConflicts(session, seancesAComparer));

        // 2. Conflits de salle et de groupe — basés sur chevauchement réel
        conflicts.push(...this.checkRoomAndGroupConflicts(session, seancesAComparer, sallesInfo));

        // 3. Conflit de section (Cours vs TD/TP)
        conflicts.push(...this.checkSectionConflicts(session, seancesAComparer));

        // 4. Conflit de doublon
        conflicts.push(...this.checkDuplicateConflicts(session, seancesAComparer));

        // Retourner uniquement les conflits uniques (texte)
        return [...new Set(conflicts)].filter(Boolean);
    }

    /**
     * Vérifie les conflits d'enseignants
     * @param {Session} session - La séance
     * @param {Array<Session>} seancesAComparer - Les séances à comparer
     * @returns {Array<string>} Les conflits
     */
    checkTeacherConflicts(session, seancesAComparer) {
        const conflicts = [];

        for (const teacher of session.enseignantsArray) {
            if (!teacher) continue;

            if (!this.isTeacherAvailable(teacher, session.jour, session.creneau, session.type, seancesAComparer)) {
                conflicts.push(`❌ CONFLIT ENSEIGNANT: **${teacher}** est déjà occupé(e) sur ce créneau.`);
            }
        }

        return conflicts;
    }

    /**
     * Vérifie si un enseignant est disponible
     * @param {string} teacher - Le nom de l'enseignant
     * @param {string} jour - Le jour
     * @param {string} creneau - Le créneau
     * @param {string} type - Le type de séance
     * @param {Array<Session>} seancesAComparer - Les séances à vérifier
     * @returns {boolean} True si disponible
     */
    isTeacherAvailable(teacher, jour, creneau, type, seancesAComparer) {
        if (!teacher) return true;

        for (const s of seancesAComparer) {
            if (s.jour !== jour) continue;
            if (!Array.isArray(s.enseignantsArray) || s.enseignantsArray.length === 0) continue;
            if (!s.enseignantsArray.includes(teacher)) continue;

            // Conflit direct: même créneau de départ
            if (s.creneau === creneau) return false;

            // Conflits liés aux TP couplés (vérifier dans les deux sens)
            if (s.type === 'TP' && CRENEAUX_COUPLES_SUIVANT[s.creneau] === creneau) return false;
            if (type === 'TP' && CRENEAUX_COUPLES_SUIVANT[creneau] === s.creneau) return false;
        }

        return true;
    }

    /**
     * Vérifie les conflits de salle et de groupe
     * @param {Session} session - La séance
     * @param {string} creneau - Le créneau à vérifier
     * @param {Array<Session>} seancesAComparer - Les séances à comparer
     * @param {Object} sallesInfo - Informations sur les salles
     * @returns {Array<string>} Les conflits
     */
    /**
     * Vérifie les conflits de salle et de groupe
     * Maintenant : se base sur doSessionsOverlap() pour déterminer si deux séances se chevauchent réellement.
     * @param {Session} session - La séance
     * @param {Array<Session>} seancesAComparer - Les séances à comparer
     * @param {Object} sallesInfo - Informations sur les salles
     * @returns {Array<string>} Les conflits
     */
    checkRoomAndGroupConflicts(session, seancesAComparer, sallesInfo = {}) {
        const conflicts = [];

        try { console.debug && console.debug('[ConflictService] checkRoomAndGroupConflicts sessionId=', session && session.id, 'compareCount=', (seancesAComparer || []).length); } catch (e) { }

        for (const s of seancesAComparer || []) {
            if (!s || !s.jour || s.jour !== session.jour) continue;

            // Déterminer si les deux séances se chevauchent réellement
            let overlap = false;
            try {
                if (typeof this.doSessionsOverlap === 'function') {
                    overlap = this.doSessionsOverlap(session, s);
                } else {
                    // fallback simple: même creneau ou TP-coupled
                    if (session.creneau && s.creneau && session.creneau === s.creneau) overlap = true;
                    if (!overlap && typeof CRENEAUX_COUPLES_SUIVANT !== 'undefined') {
                        if (session.type === 'TP' && CRENEAUX_COUPLES_SUIVANT[session.creneau] === s.creneau) overlap = true;
                        if (s.type === 'TP' && CRENEAUX_COUPLES_SUIVANT[s.creneau] === session.creneau) overlap = true;
                    }
                }
            } catch (e) {
                overlap = false;
            }

            if (!overlap) continue;

            // Conflit de salle : ignorer si allowTimeSlotConflict actif (case cochée)
            if (!session.allowTimeSlotConflict) {
                if (s.salle && session.salle && String(s.salle).trim().toUpperCase() === String(session.salle).trim().toUpperCase()) {
                    try { console.debug && console.debug('[ConflictService] ROOM CONFLICT: candidateId=', session && session.id, 'existingId=', s && s.id, 'salle=', s && s.salle); } catch (e) { }
                    const room = s.salle;
                    const mat = s.matiere || '(matière inconnue)';
                    const grp = s.groupe || s.section || s.uniqueStudentEntity || '';
                    conflicts.push(`❌ CONFLIT SALLE: La salle **${room}** est déjà utilisée sur ce créneau par ${mat}${grp ? ` (${grp})` : ''}.`);
                }
            }

            // CONFLIT DE GROUPE : ignorer si allowTimeSlotConflict actif
            if (
                !session.allowTimeSlotConflict &&
                s.uniqueStudentEntity &&
                session.uniqueStudentEntity &&
                s.uniqueStudentEntity === session.uniqueStudentEntity
            ) {
                try { console.debug && console.debug('[ConflictService] GROUP CONFLICT: candidateId=', session && session.id, 'existingId=', s && s.id, 'group=', s && s.uniqueStudentEntity); } catch (e) { }
                conflicts.push(`❌ CONFLIT GROUPE: Le groupe **${s.uniqueStudentEntity}** est déjà occupé sur ce créneau (${s.matiere || ''}).`);
            }
        }

        // Vérification de compatibilité de salle (statique)
        try {
            if (session.type !== 'TP' && session.salle && !ValidationService.validateSalleCompatibility(session.type, session.salle, sallesInfo)) {
                conflicts.push(`❌ CONFLIT SALLE TYPE: Un (${session.type}) n'est pas compatible avec cette salle.`);
            }
        } catch (e) { /* ignore */ }

        return conflicts;
    }

    /**
     * Vérifie les conflits de section (Cours vs TD/TP simultanés)
     * @param {Session} session - La séance
     * @param {Array<Session>} seancesAComparer - Les séances à comparer
     * @returns {Array<string>} Les conflits
     */
    checkSectionConflicts(session, seancesAComparer) {
        const conflicts = [];

        const chevauchement = seancesAComparer.find(s => {
            if (s.jour === session.jour &&
                s.creneau === session.creneau &&
                s.filiere === session.filiere &&
                s.section === session.section) {

                if (session.type === 'Cours' && (s.type === 'TD' || s.type === 'TP')) {
                    return true;
                }
                if ((session.type === 'TD' || session.type === 'TP') && s.type === 'Cours') {
                    return true;
                }
            }
            return false;
        });

        // CONFLIT DE SECTION : ignorer si allowTimeSlotConflict actif
        if (!session.allowTimeSlotConflict && chevauchement) {
            conflicts.push(`❌ CONFLIT SECTION: Un **${chevauchement.type}** est déjà programmé pour la section **${session.section}**. Impossible de programmer un ${session.type} en parallèle.`);
        }

        return conflicts;
    }

    /**
     * Convertit un libellé de créneau (ex: "8h30", "10:15", "08:30") en minutes depuis minuit.
     * Retourne null si le format n'est pas reconnu.
     * @param {string} label
     * @returns {number|null}
     */
    parseCreneauToMinutes(label) {
        if (!label || typeof label !== 'string') return null;
        // Normaliser : accepter "8h30", "08:30", "10h15", "10:15", "8:30"
        const normalized = label.replace(/\s+/g, '').replace('H', 'h').replace(':', 'h');
        const match = normalized.match(/^(\d{1,2})h(\d{1,2})$/i);
        if (!match) return null;
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    }

    /**
     * Détermine si deux séances se chevauchent temporellement.
     * Utilise dureeAffichee (heures) si disponible, sinon considère 1 heure par défaut.
     * Essaie d'utiliser les minutes extraites des labels de créneaux; si non-parsable,
     * retombe sur la logique de paires CRENEAUX_COUPLES_SUIVANT.
     * @param {Session} a
     * @param {Session} b
     * @returns {boolean}
     */
    doSessionsOverlap(a, b) {
        // même jour requis pour overlap temporel
        if (!a || !b) return false;
        if (!a.jour || !b.jour || a.jour !== b.jour) return false;

        // prefer explicit heureDebut/heureFin when available
        var parseHHMM = function (t) {
            if (!t) return null;
            var parts = ('' + t).split(':');
            var hh = Number(parts[0]) || 0;
            var mm = Number(parts[1]) || 0;
            return hh * 60 + mm;
        };

        var aExplicitS = parseHHMM(a.heureDebut);
        var aExplicitE = parseHHMM(a.heureFin);
        var bExplicitS = parseHHMM(b.heureDebut);
        var bExplicitE = parseHHMM(b.heureFin);

        if (aExplicitS != null && aExplicitE != null && bExplicitS != null && bExplicitE != null) {
            return (aExplicitS < bExplicitE) && (bExplicitS < aExplicitE);
        }

        // fallback: try to parse creneau + duration fields
        var aStart = this.parseCreneauToMinutes(a.creneau);
        var bStart = this.parseCreneauToMinutes(b.creneau);
        var aDurHours = (a.dureeAffichee || a.duree || a.duration || 1);
        var bDurHours = (b.dureeAffichee || b.duree || b.duration || 1);
        var aDurMin = Math.max(1, Math.round(aDurHours * 60));
        var bDurMin = Math.max(1, Math.round(bDurHours * 60));

        if (aStart !== null && bStart !== null) {
            var aEnd = aStart + aDurMin;
            var bEnd = bStart + bDurMin;
            return (aStart < bEnd) && (bStart < aEnd);
        }

        // final fallback: look for TP coupling using CRENEAUX_COUPLES_SUIVANT
        var setA = new Set([a.creneau]);
        var setB = new Set([b.creneau]);
        try {
            if (a.type === 'TP' && CRENEAUX_COUPLES_SUIVANT[a.creneau]) setA.add(CRENEAUX_COUPLES_SUIVANT[a.creneau]);
            if (b.type === 'TP' && CRENEAUX_COUPLES_SUIVANT[b.creneau]) setB.add(CRENEAUX_COUPLES_SUIVANT[b.creneau]);
        } catch (e) { }
        for (var ca of setA) if (setB.has(ca)) return true;
        return false;
    }

    /**
     * Vérifie les conflits de doublon (même séance déjà planifiée)
     * @param {Session} session - La séance
     * @param {Array<Session>} seancesAComparer - Les séances à comparer
     * @returns {Array<string>} Les conflits
     */
    checkDuplicateConflicts(session, seancesAComparer) {
        const conflicts = [];

        const seanceIdentique = (seancesAComparer || []).find(s => {
            if (!s || !session) return false;
            if (s.id === session.id) return false;
            if (s.matiere !== session.matiere) return false;
            if (s.type !== session.type) return false;
            if (s.uniqueStudentEntity !== session.uniqueStudentEntity) return false;
            if (s.jour !== session.jour) return false;

            // si chevauchement temporel réel -> doublon
            try {
                if (this.doSessionsOverlap(s, session)) return true;
            } catch (e) { /* ignore */ }

            // gestion legacy TP-couplé : si paired creneaux, first vs second => pas doublon
            if ((session.type || '').toString().toLowerCase().includes('tp')) {
                const paired = (typeof CRENEAUX_COUPLES_SUIVANT !== 'undefined') &&
                    (CRENEAUX_COUPLES_SUIVANT[s.creneau] === session.creneau || CRENEAUX_COUPLES_SUIVANT[session.creneau] === s.creneau);
                if (paired) {
                    const cFirst = Number(session.hTP_Affecte || 0) > 0;
                    const sFirst = Number(s.hTP_Affecte || 0) > 0;
                    if (cFirst !== sFirst) return false; // first vs second -> not duplicate
                    return true; // both first or both second -> duplicate
                }
            }
            return false;
        });

        // CONFLIT DE DOUBLON : ignorer si allowTimeSlotConflict actif
        if (!session.allowTimeSlotConflict && seanceIdentique) {
            if ((session.type || '').toLowerCase().includes('cours')) {
                conflicts.push(`❌ CONFLIT DE DOUBLON: La **${session.section}** a déjà un **Cours** pour la matière **${session.matiere}**.`);
            } else {
                conflicts.push(`❌ CONFLIT DE DOUBLON: Le groupe **${session.uniqueStudentEntity}** a déjà une séance de **${session.type}** pour la matière **${session.matiere}**.`);
            }
        }

        return conflicts;
    }

    /**
     * Vérifie si une salle est occupée à un créneau donné
     * @param {string} roomName - Le nom de la salle
     * @param {string} jour - Le jour
     * @param {string} creneau - Le créneau
     * @param {Array<Session>} allSessions - Toutes les séances
     * @param {number} excludeSessionId - ID de séance à exclure
     * @returns {boolean} True si occupée
     */
    isRoomOccupied(roomName, jour, creneau, allSessions, excludeSessionId = null) {
        if (!roomName || !jour || !creneau) return false;

        for (const s of allSessions) {
            if (excludeSessionId && s.id === excludeSessionId) continue;
            if (s.jour !== jour || !s.salle) continue;
            if (s.salle !== roomName) continue;

            // Occupation directe
            if (s.creneau === creneau) return true;

            // Occupation par TP couplé
            if (s.type === 'TP' && CRENEAUX_COUPLES_SUIVANT[s.creneau] === creneau) {
                return true;
            }
        }

        return false;
    }

    /**
     * Obtient les salles libres pour un créneau
     * @param {string} jour - Le jour
     * @param {string} creneau - Le créneau
     * @param {string} type - Le type de séance
     * @param {Object} sallesInfo - Informations sur les salles
     * @param {Array<Session>} allSessions - Toutes les séances
     * @param {number} excludeSessionId - ID à exclure
     * @returns {Array<string>} Les salles libres
     */
    getFreeRooms(jour, creneau, type, sallesInfo, allSessions, excludeSessionId = null) {
        if (!jour || !creneau) return [];

        const allRooms = Object.keys(sallesInfo || {});
        const pairedCreneau = (type === 'TP') ? CRENEAUX_COUPLES_SUIVANT[creneau] : null;

        const freeRooms = allRooms.filter(room => {
            // Vérifier la compatibilité
            if (!ValidationService.validateSalleCompatibility(type, room, sallesInfo)) {
                return false;
            }

            // Vérifier si libre sur le créneau de début
            if (this.isRoomOccupied(room, jour, creneau, allSessions, excludeSessionId)) {
                return false;
            }

            // Si TP, vérifier aussi le créneau couplé
            if (pairedCreneau && this.isRoomOccupied(room, jour, pairedCreneau, allSessions, excludeSessionId)) {
                return false;
            }

            return true;
        });

        return freeRooms.sort((a, b) => a.localeCompare(b));
    }
}

// Export d'une instance singleton
export default new ConflictService();