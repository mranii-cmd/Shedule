/**
 * Service de calcul des volumes horaires
 * @author Ibrahim Mrani - UCD
 */

import { DEFAULT_VOLUME_HTP } from '../config/constants.js';
import StateManager from '../controllers/StateManager.js';

class VolumeService {
    /**
     * Calcule les détails de volume pour un enseignant
     * @param {string} enseignant - Le nom de l'enseignant
     * @param {Array<Session>} seances - Les séances
     * @param {Object} volumesSupplementaires - Les volumes supplémentaires par enseignant
     * @returns {Object} { enseignement, forfait, total }
     */
    calculateTeacherVolumeDetails(enseignant, seances, volumesSupplementaires) {
        let volumeEnseignement = 0;

        seances.forEach(seance => {
            if (seance.hTP_Affecte > 0 && seance.enseignantsArray.includes(enseignant)) {
                const teachers = seance.enseignantsArray || [seance.enseignant];
                const hTP_base = seance.hTP_Affecte;

                // Pour les TP, chaque enseignant compte le volume total
                // Pour Cours/TD, on divise par le nombre d'enseignants
                const hTP_credit = (seance.type === 'TP')
                    ? hTP_base
                    : (hTP_base / teachers.length);

                volumeEnseignement += hTP_credit;
            }
        });

        let volumeSupplementaire = 0;
        if (volumesSupplementaires && volumesSupplementaires[enseignant]) {
            volumesSupplementaires[enseignant].forEach(item => {
                volumeSupplementaire += item.volume;
            });
        }

        // Ajouter les forfaits (tous les forfaits applicables à cet enseignant)
        let volumeForfaits = 0;
        if (StateManager.state.forfaits) {
            const forfaits = StateManager.state.forfaits.filter(f => f.enseignant === enseignant);
            volumeForfaits = forfaits.reduce((sum, f) => sum + f.volumeHoraire, 0);
        }

        const volumeTotalForfait = volumeSupplementaire + volumeForfaits;

        return {
            enseignement: parseFloat(volumeEnseignement.toFixed(0)),
            forfait: parseFloat(volumeTotalForfait.toFixed(0)),
            total: parseFloat((volumeEnseignement + volumeTotalForfait).toFixed(0))
        };
    }

    /**
     * Calcule les volumes horaires pour tous les enseignants
     * @param {Array<string>} enseignants - Liste des enseignants
     * @param {Array<Session>} seances - Les séances
     * @param {Object} volumesSupplementaires - Les volumes supplémentaires
     * @param {string} currentSession - La session en cours
     * @param {Object} volumesAutomne - Les volumes de la session d'automne
     * @returns {Object} Les volumes par enseignant
     */
    calculateAllVolumes(enseignants, seances, volumesSupplementaires, currentSession, volumesAutomne = {}) {
        const volumeHTP = {};

        enseignants.forEach(ens => {
            const details = this.calculateTeacherVolumeDetails(ens, seances, volumesSupplementaires);
            let volumeTotalPourSession = details.enseignement;

            // Le volume supplémentaire / forfait n'est ajouté QUE pour la session d'automne
            if (currentSession === "Session d'automne") {
                volumeTotalPourSession += details.forfait;
            }

            // Si on est au printemps, ajouter le volume total de l'automne (historique) si fourni
            if (currentSession === "Session de printemps") {
                if (volumesAutomne[ens]) {
                    volumeTotalPourSession += volumesAutomne[ens];
                }
            }

            volumeHTP[ens] = volumeTotalPourSession;
        });
         // ---------------------------------------------------------------------
        // Persist automatic autumn volumes into StateManager so they can be
        // reused later (e.g. in the spring session rendering).
        // Only write when we are computing for the autumn session.
        // ---------------------------------------------------------------------
        if (currentSession === "Session d'automne") {
            try {
                StateManager.state.volumesAutomne = StateManager.state.volumesAutomne || {};
                Object.keys(volumeHTP).forEach(ensName => {
                    // store numeric value (ensure number)
                    StateManager.state.volumesAutomne[ensName] = Number(volumeHTP[ensName] || 0);
                });
                  // Persist to localStorage as a fallback durable store (if available)
                try {
                    if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem('volumesAutomne', JSON.stringify(StateManager.state.volumesAutomne));
                    }
                } catch (e) {
                    // non-fatal: localStorage may be disabled/private mode
                    console.debug('VolumeService: localStorage persistence of volumesAutomne failed', e);
                }
            } catch (e) {
                // defensive: do not break calculation if persistence fails
                console.warn('VolumeService: failed to persist volumesAutomne in StateManager', e);
            }
        }


        return volumeHTP;
    }

    /**
     * Calcule le nombre d'enseignants attribués pour une matière
     * @param {string} matiere - La matière
     * @param {Array<Session>} seances - Les séances
     * @returns {number} Le nombre d'enseignants
     */
    getTeachersCountForSubject(matiere, seances) {
        const teachers = new Set();
        seances.forEach(s => {
            if (s.matiere === matiere) {
                s.enseignantsArray.forEach(ens => teachers.add(ens));
            }
        });
        return teachers.size;
    }

    /**
     * Calcule les métriques de volume pour une matière
     * @param {Subject} subject - La matière
     * @param {Array<Session>} seances - Les séances
     * @param {number} totalTeachers - Nombre total d'enseignants
     * @returns {Object} { total, nombreEnseignants, nombreEnseignantsTotal, moyen }
     */
    calculateSubjectVolumeMetrics(subject, seances, totalTeachers) {
        const volumeHoraireTotal = subject.calculateVHT();
        const nombreEnseignantsAttribues = this.getTeachersCountForSubject(subject.nom, seances);

        let volumeHoraireMoyen = 0;
        if (totalTeachers > 0) {
            volumeHoraireMoyen = Math.round(volumeHoraireTotal / totalTeachers);
        }

        return {
            total: volumeHoraireTotal,
            nombreEnseignants: nombreEnseignantsAttribues,
            nombreEnseignantsTotal: totalTeachers,
            moyen: volumeHoraireMoyen
        };
    }

    /**
     * Calcule les métriques globales de volume
     * 
     * Corrections appliquées :
     * - Le VHT global NE comprend que :
     *    * la somme des VHT des matières (subject.calculateVHT())
     *    * les forfaits passés en paramètre (forfaits) — on n'inclut pas les volumesSupplementaires des enseignants
     * - On supprime toute addition des heures issues des séances attribuées (hTP_Affecte) dans le VHT global.
     * - Le VHM global reste la somme réelle des heures planifiées (somme des hTP_Affecte).
     *
     * @param {Array<Subject>} subjects - Toutes les matières
     * @param {Array<Session>} seances - Les séances
     * @param {number} totalTeachers - Nombre total d'enseignants enregistrés
     * @param {Object} volumesSupplementaires - Les volumes supplémentaires (par enseignant) (IGNORÉ pour globalVHT)
     * @param {Array} forfaits - Les forfaits (optionnel) (ces forfaits sont ajoutés au VHT de la session concernée)
     * @param {string|null} currentSession - session courante ("Session d'automne", "Session de printemps") ou null
     * @param {Object} volumesAutomne - volumes d'automne par enseignant (IGNORÉ pour globalVHT)
     * @returns {Object} { globalVHT, totalUniqueTeachers, totalRegisteredTeachers, globalVHM }
     */
    calculateGlobalVolumeMetrics(subjects, seances, totalTeachers, volumesSupplementaires = {}, forfaits = [], currentSession = null, volumesAutomne = {}) {
        let globalVHT = 0;

        // 1) Somme des VHT définis par matière (déclaratifs), indépendants des séances attribuées
        subjects.forEach(subject => {
            globalVHT += subject.calculateVHT();
        });

        // 2) Ajouter les forfaits fournis via le paramètre `forfaits` (ces forfaits doivent être
        // fournis par l'appelant pour la session concernée). NE PAS ajouter les volumesSupplementaires.
        if (forfaits && Array.isArray(forfaits)) {
            forfaits.forEach(forfait => {
                globalVHT += Number(forfait.volumeHoraire) || 0;
            });
        }

        // Compter les enseignants uniques ayant des séances (pour information)
        const allAttributedTeachers = new Set();
        seances.forEach(s => {
            (s.enseignantsArray || []).forEach(ens => {
                if (ens) allAttributedTeachers.add(ens);
            });
        });

        const totalUniqueTeachers = allAttributedTeachers.size;

        // Calculer le VHM global réel : somme des hTP_Affecte des séances (heures effectivement planifiées)
        let globalVHM = 0;
        const denom = totalTeachers > 0 ? totalTeachers : 1;
        seances.forEach(s => {
            const h = Number(s.hTP_Affecte) || 0;
            globalVHM += (h / denom);
        });

       
        //seances.forEach(s => {
          //  const h = Number(s.hTP_Affecte) || 0;
           // globalVHM += h;
        //});

        // normaliser/arrondir pour l'affichage (mais garder entier)
        globalVHT = Math.round(globalVHT);
        globalVHM = Math.round(globalVHM);

        return {
            globalVHT,
            totalUniqueTeachers,
            totalRegisteredTeachers: totalTeachers,
            globalVHM
        };
    }

    /**
     * Calcule les métriques annuelles globales
     * - VHT annuel = VHT (session d'automne) + VHT (session de printemps)
     * - VHM annuel (moyenne) = VHT annuel / nombre d'enseignants inscrits (arrondi)
     *
     * @param {Array<string>} enseignants - Liste des enseignants inscrits (utilisée pour le dénominateur)
     * @param {Array<Subject>} autumnSubjects - Matières de la session d'automne
     * @param {Array<Session>} autumnSeances - Séances planifiées pour l'automne
     * @param {Array<Subject>} springSubjects - Matières de la session de printemps
     * @param {Array<Session>} springSeances - Séances planifiées pour le printemps
     * @param {Object} volumesSupplementaires - Volumes supplémentaires (par enseignant) (IGNORÉS pour VHT)
     * @param {Array} forfaitsAutumn - Forfaits de l'automne (array)
     * @param {Array} forfaitsSpring - Forfaits du printemps (array) (optionnel)
     * @returns {Object} {
     *   autumn: {globalVHT, totalUniqueTeachers, totalRegisteredTeachers, globalVHM},
     *   spring: {globalVHT, totalUniqueTeachers, totalRegisteredTeachers, globalVHM},
     *   annualVHT,
     *   annualVHM, // = Math.round(annualVHT / nombre_enseignants_inscrits) or 0 if none
     *   totalRegisteredTeachers
     * }
     */
    calculateAnnualGlobalMetrics(
        enseignants,
        autumnSubjects,
        autumnSeances,
        springSubjects,
        springSeances,
        volumesSupplementaires = {},
        forfaitsAutumn = [],
        forfaitsSpring = []
    ) {
        const totalTeachers = Array.isArray(enseignants) ? enseignants.length : 0;

        // 1) Calcul des métriques d'automne (VHT matières + forfaitsAutumn)
        const autumnMetrics = this.calculateGlobalVolumeMetrics(
            autumnSubjects || [],
            autumnSeances || [],
            totalTeachers,
            volumesSupplementaires,
            forfaitsAutumn,
            "Session d'automne",
            {}
        );

        // 2) Calcul des métriques de printemps (VHT matières + forfaitsSpring)
        const springMetrics = this.calculateGlobalVolumeMetrics(
            springSubjects || [],
            springSeances || [],
            totalTeachers,
            volumesSupplementaires,
            forfaitsSpring,
            "Session de printemps",
            {}
        );

        // 3) VHT annuel = somme des VHT des deux sessions (matières + forfaits sessionnels)
        const annualVHT = Math.round((autumnMetrics.globalVHT || 0) + (springMetrics.globalVHT || 0));

        // 4) VHM annuel moyen par enseignant inscrit = VHT annuel / nombre d'enseignants inscrits
        const annualVHM = totalTeachers > 0 ? Math.round(annualVHT / totalTeachers) : 0;

        return {
            autumn: autumnMetrics,
            spring: springMetrics,
            annualVHT,
            annualVHM,
            totalRegisteredTeachers: totalTeachers
        };
    }

    /**
     * Calcule les groupes planifiés par matière
     * @param {Array<Session>} seances - Les séances
     * @returns {Object} Les groupes planifiés par matière et type
     */
    calculatePlannedGroups(seances) {
        const plannedGroups = {};

        seances.forEach(seance => {
            if (seance.type === 'Cours' || seance.type === 'TD' || seance.type === 'TP') {
                const matiere = seance.matiere;
                const type = seance.type;
                const uniqueGroup = seance.uniqueStudentEntity;

                if (!plannedGroups[matiere]) {
                    plannedGroups[matiere] = {
                        Cours: new Set(),
                        TD: new Set(),
                        TP: new Set()
                    };
                }

                if (plannedGroups[matiere][type]) {
                    plannedGroups[matiere][type].add(uniqueGroup);
                }
            }
        });

        return plannedGroups;
    }

    /**
     * Calcule les groupes attribués (avec enseignant) par matière
     * @param {Array<Session>} seances - Les séances
     * @returns {Object} Les groupes attribués par matière
     */
    calculateAssignedGroups(seances) {
        const attributedGroups = {};

        seances.forEach(seance => {
            if ((seance.enseignantsArray && seance.enseignantsArray.length > 0) &&
                (seance.type === 'Cours' || seance.type === 'TD' || seance.type === 'TP')) {

                const matiere = seance.matiere;
                const type = seance.type;
                const uniqueGroup = seance.uniqueStudentEntity;

                if (!attributedGroups[matiere]) {
                    attributedGroups[matiere] = {
                        Cours: new Set(),
                        TD: new Set(),
                        TP: new Set(),
                        TP_Enseignants: 0
                    };
                }

                if (attributedGroups[matiere][type]) {
                    attributedGroups[matiere][type].add(uniqueGroup);

                    if (type === 'TP' && seance.hTP_Affecte > 0 && seance.enseignantsArray) {
                        attributedGroups[matiere].TP_Enseignants += seance.enseignantsArray.length;
                    }
                }
            }
        });

        // Convertir les Sets en tailles
        const result = {};
        for (const matiere in attributedGroups) {
            result[matiere] = {
                Cours: attributedGroups[matiere].Cours.size,
                TD: attributedGroups[matiere].TD.size,
                TP: attributedGroups[matiere].TP.size,
                TP_Enseignants: attributedGroups[matiere].TP_Enseignants
            };
        }

        return result;
    }
}

// Export d'une instance singleton
export default new VolumeService();