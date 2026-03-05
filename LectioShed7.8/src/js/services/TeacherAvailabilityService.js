/**
 * Service de gestion de la disponibilité et attribution des enseignants
 * @author Ibrahim Mrani - UCD
 */

import ConflictService from './ConflictService.js';
import VolumeService from './VolumeService.js';

class TeacherAvailabilityService {
    /**
     * Vérifie si un enseignant refuse explicitement un type pour une matière
     * @param {Teacher} teacher - L'enseignant
     * @param {string} matiere - La matière
     * @param {string} type - Le type (Cours, TD, TP)
     * @returns {boolean} True si refus explicite
     */
    teacherRefusesType(teacher, matiere, type) {
        if (!teacher || !matiere) return false;
        return teacher.refusesTypeForSubject(matiere, type);
    }

    /**
     * Calcule le score d'un enseignant pour une séance
     * @param {Teacher} teacher - L'enseignant
     * @param {Session} session - La séance
     * @param {number} currentWorkload - La charge actuelle
     * @param {number} maxWorkload - La charge maximale
     * @param {Object} assignedCounts - Les compteurs d'attribution
     * @param {Array<Session>} allSessions - Toutes les séances
     * @param {Array<string>} sortedCreneaux - Les créneaux triés
     * @returns {number} Le score (0 si inéligible)
     */
    calculateTeacherScore(teacher, session, currentWorkload, maxWorkload, assignedCounts, allSessions, sortedCreneaux) {
        // Vérifier la disponibilité
        if (!ConflictService.isTeacherAvailable(teacher.nom, session.jour, session.creneau, session.type, allSessions)) {
            return 0;
        }

        // Vérifier la charge de travail
        if (currentWorkload >= maxWorkload) {
            return 0;
        }

        // Vérifier les souhaits
        if (!teacher.hasWishForSubject(session.matiere)) {
            return 0;
        }

        // Score de base selon le rang du souhait
        let wishScore = 0;
        const rank = teacher.getWishRankForSubject(session.matiere);
        if (rank === 1) wishScore = 100;
        else if (rank === 2) wishScore = 50;
        else if (rank === 3) wishScore = 25;

        // Vérifier le refus explicite du type
        if (this.teacherRefusesType(teacher, session.matiere, session.type)) {
            return 0;
        }

        // Score de fulfillment (si l'enseignant a encore des souhaits non remplis)
        let wishFulfillmentScore = 1;
        const requestedCount = teacher.getRequestedCountForType(session.matiere, session.type);
        const assignedCount = assignedCounts[teacher.nom]?.[session.matiere]?.[session.type] || 0;

        if (requestedCount > 0 && assignedCount < requestedCount) {
            wishFulfillmentScore = 10; // Forte priorité
        } else if (requestedCount > 0 && assignedCount >= requestedCount) {
            wishFulfillmentScore = 0.1; // Faible priorité
        }

        // Bonus pour créneaux consécutifs (TD uniquement)
        let consecutiveTdBonus = 0;
        if (session.type === 'TD') {
            consecutiveTdBonus = this.calculateConsecutiveTDBonus(
                teacher.nom, 
                session, 
                allSessions, 
                sortedCreneaux
            );
        }

        // Score de disponibilité de charge
        const workloadAvailabilityScore = maxWorkload - currentWorkload;

        // Score final
        return (wishScore * wishFulfillmentScore) + workloadAvailabilityScore + consecutiveTdBonus;
    }

    /**
     * Calcule le bonus pour les TD consécutifs
     * @param {string} teacherName - Le nom de l'enseignant
     * @param {Session} session - La séance
     * @param {Array<Session>} allSessions - Toutes les séances
     * @param {Array<string>} sortedCreneaux - Les créneaux triés
     * @returns {number} Le bonus
     */
    calculateConsecutiveTDBonus(teacherName, session, allSessions, sortedCreneaux) {
        const teacherTdsOnDay = allSessions.filter(s => 
            s.jour === session.jour && 
            s.enseignantsArray.includes(teacherName) && 
            s.type === 'TD' && 
            s.matiere === session.matiere
        );

        if (teacherTdsOnDay.length === 0) return 0;

        const idx = sortedCreneaux.indexOf(session.creneau);
        if (idx === -1) return 0;

        const prevIdx = idx - 1;
        const nextIdx = idx + 1;

        // Fonction helper pour vérifier si deux créneaux sont dans le même bloc (matin/après-midi)
        const isAdj = (c1, c2) => {
            if (!c1 || !c2) return false;
            const i1 = sortedCreneaux.indexOf(c1);
            const i2 = sortedCreneaux.indexOf(c2);
            // Même bloc si tous deux <= 1 (matin) ou tous deux > 1 (après-midi)
            return ((i1 <= 1 && i2 <= 1) || (i1 > 1 && i2 > 1));
        };

        let bonus = 0;

        // Vérifier créneaux adjacents
        if (prevIdx >= 0) {
            const prevC = sortedCreneaux[prevIdx];
            const prevAdj = teacherTdsOnDay.some(s => s.creneau === prevC) && isAdj(session.creneau, prevC);
            if (prevAdj) bonus += 140;
        }

        if (nextIdx < sortedCreneaux.length) {
            const nextC = sortedCreneaux[nextIdx];
            const nextAdj = teacherTdsOnDay.some(s => s.creneau === nextC) && isAdj(session.creneau, nextC);
            if (nextAdj) bonus += 140;
        }

        // Bonus supplémentaire si un TD existant est adjacent
        const hasAdjacentExistingTD = teacherTdsOnDay.some(s => {
            const sIdx = sortedCreneaux.indexOf(s.creneau);
            return Math.abs(sIdx - idx) === 1 && isAdj(session.creneau, s.creneau);
        });

        if (hasAdjacentExistingTD) bonus += 500;

        return bonus;
    }

    /**
     * Trouve les meilleurs candidats pour une séance
     * @param {Array<Teacher>} teachers - Tous les enseignants
     * @param {Session} session - La séance
     * @param {number} numTeachersNeeded - Nombre d'enseignants requis
     * @param {Object} allVolumes - Les volumes actuels
     * @param {number} maxWorkload - La charge maximale
     * @param {Object} assignedCounts - Les compteurs d'attribution
     * @param {Array<Session>} allSessions - Toutes les séances
     * @param {Array<string>} sortedCreneaux - Les créneaux triés
     * @returns {Array<string>} Les noms des enseignants sélectionnés
     */
    findBestCandidates(teachers, session, numTeachersNeeded, allVolumes, maxWorkload, assignedCounts, allSessions, sortedCreneaux) {
        const candidates = [];

        teachers.forEach(teacher => {
            const currentWorkload = allVolumes[teacher.nom] || 0;
            const score = this.calculateTeacherScore(
                teacher,
                session,
                currentWorkload,
                maxWorkload,
                assignedCounts,
                allSessions,
                sortedCreneaux
            );

            if (score > 0) {
                candidates.push({ name: teacher.nom, score });
            }
        });

        // Trier par score décroissant
        candidates.sort((a, b) => b.score - a.score);

        // Retourner les N meilleurs
        return candidates.slice(0, numTeachersNeeded).map(c => c.name);
    }

    /**
     * Obtient les enseignants intéressés par une matière
     * @param {Array<Teacher>} teachers - Tous les enseignants
     * @param {string} matiere - La matière
     * @returns {Array<string>} Les noms des enseignants intéressés
     */
    getInterestedTeachers(teachers, matiere) {
        return teachers
            .filter(t => t.hasWishForSubject(matiere))
            .map(t => t.nom)
            .sort();
    }

    /**
     * Suggère le prochain enseignant dans la liste cyclique
     * @param {Array<Teacher>} teachers - Tous les enseignants
     * @param {string} matiere - La matière
     * @param {string} type - Le type de séance
     * @param {string} jour - Le jour
     * @param {string} creneau - Le créneau
     * @param {string} currentTeacher - L'enseignant actuel (pour rotation)
     * @param {string} excludeTeacher - Enseignant à exclure (enseignant 2)
     * @param {Object} allVolumes - Les volumes actuels
     * @param {number} VHM - Le VHM de référence
     * @param {Array<Session>} allSessions - Toutes les séances
     * @returns {Object|null} { name, score } ou null
     */
    suggestNextTeacher(teachers, matiere, type, jour, creneau, currentTeacher, excludeTeacher, allVolumes, VHM, allSessions) {
        const candidates = [];

        teachers.forEach(teacher => {
            // Exclure l'enseignant 2 si fourni
            if (excludeTeacher && teacher.nom === excludeTeacher) return;

            // Vérifier disponibilité
            if (!ConflictService.isTeacherAvailable(teacher.nom, jour, creneau, type, allSessions)) {
                return;
            }

            // Vérifier souhait
            if (!teacher.hasWishForSubject(matiere)) return;

            // Vérifier refus du type
            if (this.teacherRefusesType(teacher, matiere, type)) return;

            // Calculer le score
            const rank = teacher.getWishRankForSubject(matiere);
            let wishScore = 0;
            if (rank === 1) wishScore = 1000;
            else if (rank === 2) wishScore = 500;
            else if (rank === 3) wishScore = 250;

            const typeKey = type === 'Cours' ? 'c' : type.toLowerCase();
            const specificWishKey = typeKey + rank;

            let typePreferenceBonus = 0;
            if (teacher.souhaits.hasOwnProperty(specificWishKey) && teacher.souhaits[specificWishKey] > 0) {
                typePreferenceBonus = 200;
            }

            const currentWorkload = allVolumes[teacher.nom] || 0;
            const workloadScore = Math.max(0, VHM - currentWorkload);

            const finalScore = wishScore + typePreferenceBonus + workloadScore;

            if (finalScore > 0) {
                candidates.push({ name: teacher.nom, score: finalScore });
            }
        });

        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length === 0) return null;

        // Si pas d'enseignant actuel, retourner le meilleur
        if (!currentTeacher) {
            return candidates[0];
        }

        // Sinon, trouver le suivant dans la liste cyclique
        const currentIndex = candidates.findIndex(c => c.name === currentTeacher);
        
        if (currentIndex === -1) {
            return candidates[0];
        }

        const nextIndex = (currentIndex + 1) % candidates.length;
        return candidates[nextIndex];
    }
}

// Export d'une instance singleton
export default new TeacherAvailabilityService();