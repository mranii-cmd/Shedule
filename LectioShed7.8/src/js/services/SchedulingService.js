/**
 * Service de planification automatique des séances
 * @author Ibrahim Mrani - UCD
 * @modified 2025-11-06 - Répartition équitable par filière sur toute la semaine
 */

import { LISTE_JOURS, MAX_AUTO_PLANNING_ITERATIONS, CRENEAUX_COUPLES_SUIVANT } from '../config/constants.js';
import { getSortedCreneauxKeys, getPrioritizedCreneauxKeys, getRotatedJours, isAfternoonCreneau } from '../utils/helpers.js';
import { normalizeSessionLabel, getStorageSessionKey } from '../utils/session.js';
import Session from '../models/Session.js';
import StateManager from '../controllers/StateManager.js';
import ConflictService from './ConflictService.js';
import TeacherAvailabilityService from './TeacherAvailabilityService.js';
import VolumeService from './VolumeService.js';
import LogService from './LogService.js';
import StorageService from './StorageService.js';
import TeacherConstraintParser from './TeacherConstraintParser.js';

class SchedulingService {
    constructor() {
        // Compteurs de rotation par filière pour distribution équitable
        this.filiereRotationCounters = {};
        this.globalDayRotationCounter = 0;
    }
    // ---------- Helpers pour gestion des exclusions de filières ----------
    _normalizeFiliereName(name) {
        if (!name && name !== 0) return '';
        try {
            const s = String(name || '').trim();
            return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        } catch (e) {
            return String(name || '').trim().toUpperCase();
        }
    }

    _buildFiliereExclusionsSet() {
        const raw = (StateManager && StateManager.state && StateManager.state.filiereExclusions) || null;
        if (!raw) return null;
        const set = new Set();
        const addPair = (a, b) => {
            if (!a || !b) return;
            const A = this._normalizeFiliereName(a);
            const B = this._normalizeFiliereName(b);
            if (!A || !B) return;
            const key = (A < B) ? `${A}|${B}` : `${B}|${A}`;
            set.add(key);
        };

        if (Array.isArray(raw)) {
            raw.forEach(item => {
                if (!item) return;
                if (Array.isArray(item) && item.length >= 2) addPair(item[0], item[1]);
                else if (typeof item === 'string') {
                    const sep = item.includes(':') ? ':' : (item.includes('|') ? '|' : (item.includes(',') ? ',' : null));
                    if (sep) {
                        const parts = item.split(sep).map(p => p.trim()).filter(Boolean);
                        if (parts.length >= 2) addPair(parts[0], parts[1]);
                    }
                } else if (typeof item === 'object') {
                    Object.keys(item).forEach(k => {
                        const vals = item[k];
                        if (Array.isArray(vals)) vals.forEach(v => addPair(k, v));
                        else addPair(k, vals);
                    });
                }
            });
        } else if (typeof raw === 'object') {
            Object.keys(raw).forEach(k => {
                const vals = raw[k];
                if (Array.isArray(vals)) vals.forEach(v => addPair(k, v));
                else addPair(k, vals);
            });
        }

        return set.size ? set : null;
    }

    _filierePairExcluded(f1, f2, exclusionsSet) {
        if (!f1 || !f2) return false;
        if (!exclusionsSet || !(exclusionsSet instanceof Set)) return false;
        const A = this._normalizeFiliereName(f1);
        const B = this._normalizeFiliereName(f2);
        if (!A || !B) return false;
        const key = (A < B) ? `${A}|${B}` : `${B}|${A}`;
        return exclusionsSet.has(key);
    }
    // ---------- end helpers ----------
    /**
         * Lit la tolérance (tolerance) depuis l'état applicatif.
         * clé attendue : StateManager.state.toleranceMaxWorkload
         * fallback par défaut : 16
         * @returns {number}
         */
    getTolerance() {
        try {
            const val = StateManager.state && StateManager.state.toleranceMaxWorkload;
            const num = Number(val);
            if (!Number.isFinite(num)) return 16;
            return Math.max(0, Math.round(num));
        } catch (err) {
            console.warn('SchedulingService.getTolerance fallback to 16', err);
            return 16;
        }
    }

    /**
     * Modifie la tolérance et sauvegarde l'état.
     * Permettre à l'UI d'appeler SchedulingService.setTolerance(nouvelleValeur)
     * @param {number} newTolerance
     * @returns {boolean} success
     */
    setTolerance(newTolerance) {
        const num = Number(newTolerance);
        if (!Number.isFinite(num) || num < 0) {
            LogService.warning(`Tentative de définir une tolérance invalide: ${newTolerance}`);
            return false;
        }
        StateManager.state.toleranceMaxWorkload = Math.round(num);
        try {
            StateManager.saveState();
        } catch (err) {
            LogService.error(`Impossible de sauvegarder la tolérance: ${err.message}`);
        }
        LogService.info(`Tolerance maxWorkload modifiée: ${StateManager.state.toleranceMaxWorkload}`);
        return true;
    }

    /**
     * Calcule le maxWorkload selon la règle demandée :
     *   - Si session contient "automne" (insensible à la casse) :
     *       maxWorkload = tolerance + Math.round(globalVHM / 2)
     *   - Sinon :
     *       maxWorkload = tolerance + Math.round(globalVHM)
     *
     * @returns {number} maxWorkload calculé
     */
    computeMaxWorkloadForCurrentSession() {
        try {
            const headerSessionRaw = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
            const sessionNormalized = normalizeSessionLabel(headerSessionRaw); // 'autumn'|'spring'|'unknown'

            // Préparer données pour calcul annuel
            const enseignantsList = StateManager.state.enseignants || [];
            const totalTeachers = Math.max(1, enseignantsList.length);
            const allSubjects = StateManager.getSubjects();
            const filieres = StateManager.state.filieres || [];

            // helper : matières par session
            const getSubjectsForSession = (isAutumn) => {
                const sessionType = isAutumn ? 'Automne' : 'Printemps';
                const filieresNames = filieres
                    .filter(f => f.session === sessionType)
                    .map(f => f.nom);
                return allSubjects.filter(s => !s.filiere || filieresNames.includes(s.filiere));
            };

            const autumnSubjects = getSubjectsForSession(true);
            const springSubjects = getSubjectsForSession(false);

            // charger séances des deux sessions via StorageService de façon robuste
            const autumnStorageKey = getStorageSessionKey('autumn'); // "Session d'automne"
            const springStorageKey = getStorageSessionKey('spring'); // "Session de printemps"

            const autumnSessionData = (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function')
                ? StorageService.loadSessionData(autumnStorageKey) || { seances: [] }
                : { seances: [] };

            const springSessionData = (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function')
                ? StorageService.loadSessionData(springStorageKey) || { seances: [] }
                : { seances: [] };

            // Forfaits par session
            const allForfaits = StateManager.state.forfaits || [];
            const forfaitsAutumn = allForfaits.filter(f => !f.session || String(f.session).toLowerCase().includes('automne') || String(f.session).toLowerCase().includes('autumn'));
            const forfaitsSpring = allForfaits.filter(f => String(f.session).toLowerCase().includes('printemps') || String(f.session).toLowerCase().includes('spring'));

            const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires || {};

            // Calculer métriques annuelles (doit renvoyer annualVHM)
            const annualMetrics = VolumeService.calculateAnnualGlobalMetrics(
                enseignantsList,
                autumnSubjects,
                autumnSessionData.seances || [],
                springSubjects,
                springSessionData.seances || [],
                volumesSupplementaires,
                forfaitsAutumn,
                forfaitsSpring
            );

            let annualVHM = Number((annualMetrics && annualMetrics.annualVHM) || 0);
            const tolerance = this.getTolerance();

            // fallback : si annualVHM absent, retomber sur comportement sessionnel
            if (!annualVHM) {
                try {
                    const subjects = StateManager.getCurrentSessionSubjects ? StateManager.getCurrentSessionSubjects() : StateManager.getSubjects();
                    const seances = StateManager.getSeances();
                    const volsSup = StateManager.state.enseignantVolumesSupplementaires || {};
                    const forfaits = StateManager.state.forfaits || [];
                    const gm = VolumeService.calculateGlobalVolumeMetrics(subjects, seances, totalTeachers, volsSup, forfaits, StateManager.state.header.session);
                    annualVHM = Number(gm.globalVHM || 0);
                    LogService.info('SchedulingService: fallback to session globalVHM for maxWorkload (annualVHM was 0)');
                } catch (e) {
                    annualVHM = 0;
                }
            }

            let maxWorkload;
            if (sessionNormalized === 'autumn') {
                maxWorkload = tolerance + Math.round(annualVHM / 2);
                LogService.info(`SchedulingService: maxWorkload (Session d'automne) = ${maxWorkload} (tolerance=${tolerance}, annualVHM=${annualVHM})`);
            } else {
                maxWorkload = tolerance + Math.round(annualVHM);
                LogService.info(`SchedulingService: maxWorkload (autres sessions) = ${maxWorkload} (tolerance=${tolerance}, annualVHM=${annualVHM})`);
            }
            return maxWorkload;
        } catch (err) {
            LogService.error(`SchedulingService.computeMaxWorkloadForCurrentSession error: ${err.message}`);
            // Fallback conservative
            return this.getTolerance() + 0;
        }
    }
    /**
     * Obtient le compteur de rotation pour une filière
     * @param {string} filiere - La filière
     * @returns {number} Le compteur
     */
    getFiliereRotationCounter(filiere) {
        if (!this.filiereRotationCounters[filiere]) {
            this.filiereRotationCounters[filiere] = 0;
        }
        return this.filiereRotationCounters[filiere];
    }

    /**
     * Incrémente le compteur de rotation pour une filière
     * @param {string} filiere - La filière
     */
    incrementFiliereRotationCounter(filiere) {
        if (!this.filiereRotationCounters[filiere]) {
            this.filiereRotationCounters[filiere] = 0;
        }
        this.filiereRotationCounters[filiere]++;
    }

    /**
     * Obtient les jours avec rotation spécifique à la filière
     * @param {string} filiere - La filière
     * @returns {Array<string>} Les jours avec rotation
     */
    getRotatedJoursForFiliere(filiere) {
        const counter = this.getFiliereRotationCounter(filiere);
        const rotatedJours = getRotatedJours(counter);

        // Inclure le samedi matin (jusqu'à 10h15 maximum)
        // On garde tous les jours y compris Samedi
        return rotatedJours;
    }

    /**
     * Vérifie si un créneau est autorisé le samedi (matin uniquement)
     * @param {string} creneau - Le créneau
     * @returns {boolean} True si autorisé
     */
    isSaturdayMorningSlot(creneau) {
        const creneaux = getSortedCreneauxKeys();
        const creneauIndex = creneaux.indexOf(creneau);

        // Seulement les 2 premiers créneaux du samedi (8h30 et 10h15 généralement)
        return creneauIndex <= 1;
    }

    /**
     * Génère automatiquement toutes les séances manquantes
     * @param {Object} options - Options de génération
     * @returns {Object} { success: boolean, stats: Object }
     */
    /**
 * Génère automatiquement toutes les séances manquantes
 * ET attribue les enseignants/salles aux séances existantes
 * @param {Object} options - Options de génération
 * @returns {Object} { success: boolean, stats: Object }
 */
    async autoGenerateAllSessions(options = {}) {
        const {
            assignTeachers = true,
            assignRooms = true,
            respectWishes = true,
            avoidConflicts = true
        } = options;

        LogService.info('🚀 Début de la génération automatique...');

        // Réinitialiser les compteurs de rotation
        this.filiereRotationCounters = {};
        this.globalDayRotationCounter = 0;

        const stats = {
            total: 0,
            created: 0,
            failed: 0,
            skipped: 0,
            teachersAssigned: 0,
            roomsAssigned: 0
        };

        // ===== ÉTAPE 1 : Attribuer les enseignants aux séances EXISTANTES =====

        if (assignTeachers) {
            LogService.info('👨‍🏫 ÉTAPE 1 : Attribution des enseignants aux séances existantes...');

            const allSeances = StateManager.getSeances();
            const seancesSansEnseignant = allSeances.filter(s => !s.hasTeacher());

            LogService.info(`📋 Trouvé ${seancesSansEnseignant.length} séance(s) sans enseignant`);

            for (const seance of seancesSansEnseignant) {
                try {
                    const matiereInfo = StateManager.state.matiereGroupes[seance.matiere];
                    const nbEnseignantsTP = (seance.type === 'TP' && matiereInfo)
                        ? (matiereInfo.nbEnseignantsTP || 1)
                        : 1;

                    // CORRECTIF COUPLAGE TP :
                    if (seance.type === 'TP' && seance.hTP_Affecte > 0) {
                        // Affecter les enseignants à la première séance TP
                        const teachers = this.assignTeachersToSession(seance, options, nbEnseignantsTP);
                        seance.setTeachers(teachers);

                        // Synchroniser sur la séance TP couplée (hTP_Affecte === 0, même groupe/matière/jour/creneau suivant)
                        const pairedCreneau = CRENEAUX_COUPLES_SUIVANT[seance.creneau];
                        const pairedSession = allSeances.find(s =>
                            s.type === 'TP' &&
                            s.hTP_Affecte === 0 &&
                            s.jour === seance.jour &&
                            s.matiere === seance.matiere &&
                            s.uniqueStudentEntity === seance.uniqueStudentEntity &&
                            s.creneau === pairedCreneau
                        );
                        if (pairedSession) {
                            pairedSession.setTeachers(teachers);
                        }

                        stats.teachersAssigned += teachers.length;
                        LogService.success(`✅ ${teachers.join(', ')} → ${seance.matiere} (TP couplé) [${seance.jour} ${seance.creneau} & ${pairedCreneau}]`);
                    } else if (seance.type === 'TP' && seance.hTP_Affecte === 0) {
                        // Correction : synchroniser avec la première partie du TP
                        const prevCreneau = Object.keys(CRENEAUX_COUPLES_SUIVANT).find(
                            k => CRENEAUX_COUPLES_SUIVANT[k] === seance.creneau
                        );
                        const firstSession = allSeances.find(s =>
                            s.type === 'TP' &&
                            s.hTP_Affecte > 0 &&
                            s.jour === seance.jour &&
                            s.matiere === seance.matiere &&
                            s.uniqueStudentEntity === seance.uniqueStudentEntity &&
                            s.creneau === prevCreneau
                        );
                        if (firstSession) {
                            if (!firstSession.hasTeacher()) {
                                // On attribue sur la première partie TP
                                const teachers = this.assignTeachersToSession(firstSession, options, nbEnseignantsTP);
                                firstSession.setTeachers(teachers);
                                seance.setTeachers(teachers);
                                stats.teachersAssigned += teachers.length;
                                LogService.success(`✅ ${teachers.join(', ')} → ${seance.matiere} (TP couplé) [${seance.jour} ${prevCreneau} & ${seance.creneau}]`);
                            } else {
                                seance.setTeachers(firstSession.enseignantsArray);
                            }
                        }
                    } else {
                        // Attribution standard Cours/TD/TP non couplé
                        const teachers = this.assignTeachersToSession(seance, options, nbEnseignantsTP);
                        seance.setTeachers(teachers);
                        stats.teachersAssigned += teachers.length;
                        LogService.success(`✅ ${teachers.join(', ')} → ${seance.matiere} (${seance.type}) [${seance.jour} ${seance.creneau}]`);
                    }
                } catch (error) {
                    LogService.error(`❌ Erreur attribution enseignant: ${error.message}`);
                }
            }

            if (stats.teachersAssigned > 0) {
                StateManager.saveState();
                LogService.success(`✅ ${stats.teachersAssigned} enseignant(s) attribué(s) aux séances existantes`);
            }
        }

        // ===== ÉTAPE 2 : Attribuer les salles aux séances EXISTANTES =====
        if (assignRooms) {
            LogService.info('🏛️ ÉTAPE 2 : Attribution des salles aux séances existantes...');

            const allSeances = StateManager.getSeances();
            const seancesSansSalle = allSeances.filter(s => !s.hasRoom() && s.type !== 'TP');

            LogService.info(`📋 Trouvé ${seancesSansSalle.length} séance(s) sans salle`);

            for (const seance of seancesSansSalle) {
                try {
                    const room = this.assignRoomToSession(seance);

                    if (room) {
                        seance.setRoom(room);
                        stats.roomsAssigned++;
                        LogService.success(`✅ ${room} → ${seance.matiere} (${seance.type}) [${seance.jour} ${seance.creneau}]`);
                    } else {
                        LogService.warning(`⚠️ Aucune salle disponible pour ${seance.matiere} (${seance.type}) [${seance.jour} ${seance.creneau}]`);
                    }
                } catch (error) {
                    LogService.error(`❌ Erreur attribution salle: ${error.message}`);
                }
            }

            if (stats.roomsAssigned > 0) {
                StateManager.saveState();
                LogService.success(`✅ ${stats.roomsAssigned} salle(s) attribuée(s) aux séances existantes`);
            }
        }

        // ===== ÉTAPE 3 : Créer les nouvelles séances manquantes =====
        LogService.info('📅 ÉTAPE 3 : Création des séances manquantes...');

        const subjects = StateManager.getCurrentSessionSubjects();

        for (const subject of subjects) {
            const subjectStats = await this.autoGenerateSubjectSessions(
                subject,
                { assignTeachers, assignRooms, respectWishes, avoidConflicts }
            );

            stats.total += subjectStats.total;
            stats.created += subjectStats.created;
            stats.failed += subjectStats.failed;
            stats.skipped += subjectStats.skipped;
        }

        // ===== RÉSUMÉ FINAL =====
        LogService.success(`
╔════════════════════════════════════════════╗
║  ✅ GÉNÉRATION TERMINÉE                    ║
╠════════════════════════════════════════════╣
║  📊 Nouvelles séances créées : ${stats.created.toString().padStart(3)}       ║
║  ⏭️  Séances déjà existantes : ${stats.skipped.toString().padStart(3)}       ║
║  ❌ Séances échouées         : ${stats.failed.toString().padStart(3)}       ║
║  📋 Total théorique          : ${stats.total.toString().padStart(3)}       ║
╠════════════════════════════════════════════╣
║  👨‍🏫 Enseignants attribués    : ${stats.teachersAssigned.toString().padStart(3)}       ║
║  🏛️  Salles attribuées        : ${stats.roomsAssigned.toString().padStart(3)}       ║
╚════════════════════════════════════════════╝
    `);

        return { success: true, stats };
    }

    /**
     * Génère les séances pour une matière spécifique
     * @param {Subject} subject - La matière
     * @param {Object} options - Options
     * @returns {Object} Stats de génération
     */
    async autoGenerateSubjectSessions(subject, options = {}) {
        const stats = {
            total: 0,
            created: 0,
            failed: 0,
            skipped: 0
        };

        const existingSeances = StateManager.getSeances().filter(s => s.matiere === subject.nom);

        LogService.info(`📚 Génération pour ${subject.nom} (Filière: ${subject.filiere})`);

        // Générer les séances de Cours
        const coursStats = await this.generateCoursSessions(subject, existingSeances, options);
        this.mergeStats(stats, coursStats);

        // Générer les séances de TD
        const tdStats = await this.generateTDSessions(subject, existingSeances, options);
        this.mergeStats(stats, tdStats);

        // Générer les séances de TP
        const tpStats = await this.generateTPSessions(subject, existingSeances, options);
        this.mergeStats(stats, tpStats);

        return stats;
    }

    /**
     * Génère les séances de Cours avec répartition hebdomadaire
     * @param {Subject} subject - La matière
     * @param {Array<Session>} existingSeances - Séances existantes
     * @param {Object} options - Options
     * @returns {Object} Stats
     */
    async generateCoursSessions(subject, existingSeances, options) {
        const stats = { total: 0, created: 0, failed: 0, skipped: 0 };

        const nbSections = subject.sections_cours;

        for (let i = 0; i < nbSections; i++) {
            const sectionName = `Section ${String.fromCharCode(65 + i)}`;
            stats.total++;

            // Vérifier si déjà existante
            const exists = existingSeances.some(s =>
                s.type === 'Cours' && s.section === sectionName
            );

            if (exists) {
                stats.skipped++;
                continue;
            }

            // Créer la séance
            const session = this.createSessionTemplate(subject, 'Cours', sectionName, '');

            // Trouver un créneau disponible avec rotation par filière
            const slot = this.findAvailableSlotWithRotation(session, subject.filiere, options);

            if (!slot) {
                stats.failed++;
                LogService.warning(`⚠️ Aucun créneau trouvé pour ${subject.nom} (Cours) - ${sectionName}`);
                continue;
            }

            session.jour = slot.jour;
            session.creneau = slot.creneau;

            // Attribuer enseignant(s)
            if (options.assignTeachers) {
                const teachers = this.assignTeachersToSession(session, options);
                session.setTeachers(teachers);
            }

            // Attribuer salle
            if (options.assignRooms) {
                const room = this.assignRoomToSession(session);
                session.setRoom(room);
            }

            // Ajouter la séance
            StateManager.addSeance(session);
            stats.created++;

            // Incrémenter le compteur de rotation pour cette filière
            this.incrementFiliereRotationCounter(subject.filiere);

            LogService.success(`✅ Cours créé: ${subject.nom} - ${sectionName} [${slot.jour} ${slot.creneau}]`);
        }

        return stats;
    }

    /**
     * Génère les séances de TD avec répartition hebdomadaire
     * @param {Subject} subject - La matière
     * @param {Array<Session>} existingSeances - Séances existantes
     * @param {Object} options - Options
     * @returns {Object} Stats
     */
    async generateTDSessions(subject, existingSeances, options) {
        const stats = { total: 0, created: 0, failed: 0, skipped: 0 };

        const nbSections = subject.sections_cours;
        const nbGroupes = subject.td_groups;

        for (let i = 0; i < nbSections; i++) {
            const sectionName = `Section ${String.fromCharCode(65 + i)}`;

            for (let g = 1; g <= nbGroupes; g++) {
                const groupeName = `G${g}`;
                stats.total++;

                // Vérifier si déjà existante
                const uniqueEntity = Session.generateUniqueStudentEntity(
                    subject.filiere,
                    sectionName,
                    'TD',
                    groupeName
                );

                const exists = existingSeances.some(s =>
                    s.type === 'TD' && s.uniqueStudentEntity === uniqueEntity
                );

                if (exists) {
                    stats.skipped++;
                    continue;
                }

                // Créer la séance
                const session = this.createSessionTemplate(subject, 'TD', sectionName, groupeName);

                // Trouver un créneau avec rotation par filière
                const slot = this.findAvailableSlotWithRotation(session, subject.filiere, options);

                if (!slot) {
                    stats.failed++;
                    LogService.warning(`⚠️ Aucun créneau trouvé pour ${subject.nom} (TD) - ${sectionName} ${groupeName}`);
                    continue;
                }

                session.jour = slot.jour;
                session.creneau = slot.creneau;

                // Attribuer enseignant
                if (options.assignTeachers) {
                    const teachers = this.assignTeachersToSession(session, options);
                    session.setTeachers(teachers);
                }

                // Attribuer salle
                if (options.assignRooms) {
                    const room = this.assignRoomToSession(session);
                    session.setRoom(room);
                }

                // Ajouter la séance
                StateManager.addSeance(session);
                stats.created++;

                // Incrémenter le compteur de rotation
                this.incrementFiliereRotationCounter(subject.filiere);

                LogService.success(`✅ TD créé: ${subject.nom} - ${sectionName} ${groupeName} [${slot.jour} ${slot.creneau}]`);
            }
        }

        return stats;
    }

    /**
     * Génère les séances de TP avec répartition hebdomadaire
     * @param {Subject} subject - La matière
     * @param {Array<Session>} existingSeances - Séances existantes
     * @param {Object} options - Options
     * @returns {Object} Stats
     */
    async generateTPSessions(subject, existingSeances, options) {
        const stats = { total: 0, created: 0, failed: 0, skipped: 0 };

        const nbSections = subject.sections_cours;
        const nbGroupes = subject.tp_groups;

        for (let i = 0; i < nbSections; i++) {
            const sectionName = `Section ${String.fromCharCode(65 + i)}`;

            for (let g = 1; g <= nbGroupes; g++) {
                const groupeName = `G${g}`;
                stats.total++;

                // Vérifier si déjà existante
                const uniqueEntity = Session.generateUniqueStudentEntity(
                    subject.filiere,
                    sectionName,
                    'TP',
                    groupeName
                );

                const exists = existingSeances.some(s =>
                    s.type === 'TP' && s.uniqueStudentEntity === uniqueEntity && s.hTP_Affecte > 0
                );

                if (exists) {
                    stats.skipped++;
                    continue;
                }

                // Créer la séance (première partie)
                const session = this.createSessionTemplate(subject, 'TP', sectionName, groupeName);

                // Trouver un créneau couplé disponible avec rotation
                const slot = this.findAvailableCoupledSlotWithRotation(session, subject.filiere, options);

                if (!slot) {
                    stats.failed++;
                    LogService.warning(`⚠️ Aucun créneau couplé trouvé pour ${subject.nom} (TP) - ${sectionName} ${groupeName}`);
                    continue;
                }

                session.jour = slot.jour;
                session.creneau = slot.creneau;

                // Attribuer enseignant(s) selon nbEnseignantsTP
                if (options.assignTeachers) {
                    const teachers = this.assignTeachersToSession(session, options, subject.nbEnseignantsTP);
                    session.setTeachers(teachers);
                }

                // Attribuer salle (STP)
                if (options.assignRooms) {
                    const room = this.assignRoomToSession(session);
                    session.setRoom(room);
                }

                // Ajouter la première partie
                StateManager.addSeance(session);

                // Créer la deuxième partie
                const secondPart = session.clone();
                secondPart.id = StateManager.state.nextSessionId;
                secondPart.creneau = slot.creneauCoupled;
                secondPart.hTP_Affecte = 0;

                StateManager.addSeance(secondPart);

                stats.created++;

                // Incrémenter le compteur de rotation
                this.incrementFiliereRotationCounter(subject.filiere);

                LogService.success(`✅ TP créé: ${subject.nom} - ${sectionName} ${groupeName} [${slot.jour} ${slot.creneau}-${slot.creneauCoupled}]`);
            }
        }

        return stats;
    }

    /**
     * Trouve un créneau disponible avec rotation par filière
     * @param {Session} session - La séance
     * @param {string} filiere - La filière
     * @param {Object} options - Options
     * @returns {Object|null} { jour, creneau } ou null
     */
    findAvailableSlotWithRotation(session, filiere, options) {
        const sortedCreneaux = getPrioritizedCreneauxKeys();
        const allSeances = StateManager.getSeances();
        const sallesInfo = StateManager.state.sallesInfo;

        // Obtenir les jours avec rotation pour cette filière
        const rotatedJours = this.getRotatedJoursForFiliere(filiere);

        let iterations = 0;
        const maxIterations = MAX_AUTO_PLANNING_ITERATIONS;

        // Préparer set d'exclusions (normalisé) une seule fois
        const exclusionsSet = this._buildFiliereExclusionsSet();

        for (const jour of rotatedJours) {
            // Filtrage spécial pour le samedi (matin uniquement)
            const creneauxToCheck = jour === 'Samedi'
                ? sortedCreneaux.filter(c => this.isSaturdayMorningSlot(c))
                : sortedCreneaux;

            for (const creneau of creneauxToCheck) {
                iterations++;
                if (iterations > maxIterations) {
                    return null;
                }

                // CONTRAINTE: Ne pas planifier des Cours de la même matière en parallèle
                if (session.type === 'Cours') {
                    const parallelCoursExists = allSeances.some(s =>
                        s.type === 'Cours' &&
                        s.matiere === session.matiere &&
                        s.jour === jour &&
                        s.creneau === creneau
                    );

                    if (parallelCoursExists) continue;
                }
                // CONTRAINTE: Respecter les exclusions de filières (uniquement pour Cours)
                if (session.type === 'Cours' && exclusionsSet && exclusionsSet.size) {
                    // trouver séances existantes dans ce même créneau/jour
                    const existingAtSlot = allSeances.filter(s => s && s.jour === jour && s.creneau === creneau);
                    let blockedByExclusion = false;
                    for (const s of existingAtSlot) {
                        if (!s || s.type !== 'Cours') continue;
                        const fExisting = s.filiere || (StateManager.state.matiereGroupes?.[s.matiere]?.filiere) || '';
                        const fCurrent = session.filiere || filiere || '';
                        if (this._filierePairExcluded(fExisting, fCurrent, exclusionsSet)) {
                            blockedByExclusion = true;
                            break;
                        }
                    }
                    if (blockedByExclusion) continue;
                }

                // Créer une copie temporaire
                const tempSession = session.clone();
                tempSession.jour = jour;
                tempSession.creneau = creneau;

                // Vérifier les conflits
                const conflicts = ConflictService.checkAllConflicts(
                    tempSession,
                    allSeances,
                    [],
                    sallesInfo
                );

                if (conflicts.length === 0 || !options.avoidConflicts) {
                    return { jour, creneau };
                }
            }
        }

        return null;
    }

    /**
     * Trouve un créneau couplé disponible pour un TP avec rotation
     * @param {Session} session - La séance TP
     * @param {string} filiere - La filière
     * @param {Object} options - Options
     * @returns {Object|null} { jour, creneau, creneauCoupled } ou null
     */
    findAvailableCoupledSlotWithRotation(session, filiere, options) {
        const sortedCreneaux = getPrioritizedCreneauxKeys();
        const allSeances = StateManager.getSeances();
        const sallesInfo = StateManager.state.sallesInfo;

        // Obtenir les jours avec rotation pour cette filière
        const rotatedJours = this.getRotatedJoursForFiliere(filiere);

        // Préparer set d'exclusions (normalisé)
        const exclusionsSet = this._buildFiliereExclusionsSet();

        for (const jour of rotatedJours) {
            // Filtrage spécial pour le samedi (pas de TP couplé possible le samedi)
            if (jour === 'Samedi') {
                continue; // Les TP nécessitent 2 créneaux consécutifs, pas possible le samedi matin
            }

            const creneauxToCheck = sortedCreneaux;

            for (const creneau of creneauxToCheck) {
                const creneauCoupled = CRENEAUX_COUPLES_SUIVANT[creneau];

                if (!creneauCoupled) continue;

                // CONTRAINTE: Ne pas planifier des TP de la même matière en parallèle
                const parallelTPExists = allSeances.some(s =>
                    s.type === 'TP' &&
                    s.matiere === session.matiere &&
                    s.jour === jour &&
                    (s.creneau === creneau || s.creneau === creneauCoupled)
                );

                if (parallelTPExists) continue;

                // CONTRAINTE: Respecter les exclusions de filières pour les deux créneaux si le TP contient des Cours (optionnel)
                // Ici on n'applique la règle que si la séance concernée est de type 'Cours' — pour TP on laisse inchangé.
                // Si tu veux appliquer aux TP aussi, adapte la condition ci‑dessous.
                if (session.type === 'Cours' && exclusionsSet && exclusionsSet.size) {
                    // vérifier existants aux deux créneaux
                    const existingAtFirst = allSeances.filter(s => s && s.jour === jour && s.creneau === creneau);
                    const existingAtSecond = allSeances.filter(s => s && s.jour === jour && s.creneau === creneauCoupled);
                    let blocked = false;
                    for (const s of existingAtFirst.concat(existingAtSecond)) {
                        if (!s || s.type !== 'Cours') continue;
                        const fExisting = s.filiere || (StateManager.state.matiereGroupes?.[s.matiere]?.filiere) || '';
                        const fCurrent = session.filiere || filiere || '';
                        if (this._filierePairExcluded(fExisting, fCurrent, exclusionsSet)) {
                            blocked = true;
                            break;
                        }
                    }
                    if (blocked) continue;
                }

                // Vérifier le premier créneau
                const tempSession1 = session.clone();
                tempSession1.jour = jour;
                tempSession1.creneau = creneau;

                const conflicts1 = ConflictService.checkAllConflicts(
                    tempSession1,
                    allSeances,
                    [],
                    sallesInfo
                );

                if (conflicts1.length > 0 && options.avoidConflicts) continue;

                // Vérifier le deuxième créneau
                const tempSession2 = session.clone();
                tempSession2.jour = jour;
                tempSession2.creneau = creneauCoupled;
                tempSession2.hTP_Affecte = 0;

                const conflicts2 = ConflictService.checkAllConflicts(
                    tempSession2,
                    allSeances,
                    [],
                    sallesInfo
                );

                if (conflicts2.length === 0 || !options.avoidConflicts) {
                    return { jour, creneau, creneauCoupled };
                }
            }
        }

        return null;
    }

    // ... reste des méthodes existantes (createSessionTemplate, assignTeachersToSession, etc.) ...

    /**
     * Crée un template de séance
     * @param {Subject} subject - La matière
     * @param {string} type - Le type
     * @param {string} section - La section
     * @param {string} groupe - Le groupe TD/TP
     * @returns {Session} La séance template
     */
    createSessionTemplate(subject, type, section, groupe) {
        const uniqueEntity = Session.generateUniqueStudentEntity(
            subject.filiere,
            section,
            type,
            groupe
        );

        const groupeDisplay = Session.generateGroupe(section, type, groupe);

        return new Session({
            jour: '',
            creneau: '',
            filiere: subject.filiere,
            matiere: subject.nom,
            type,
            section,
            groupe: groupeDisplay,
            uniqueStudentEntity: uniqueEntity,
            enseignant: '',
            enseignantsArray: [],
            salle: '',
            dureeAffichee: 1.5,
            hTP_Affecte: subject.getVolumeHTP(type)
        });
    }

    assignTeachersToSession(session, options, nbTeachers = 1) {
        if (!options.respectWishes) {
            return [];
        }

        const teachers = StateManager.getTeachers(); // array of teacher names or objects depending on your impl
        const allSeances = StateManager.getSeances();
        const sortedCreneaux = getPrioritizedCreneauxKeys();

        // Calculer les volumes actuels par enseignant
        const allVolumes = VolumeService.calculateAllVolumes(
            StateManager.state.enseignants,
            allSeances,
            StateManager.state.enseignantVolumesSupplementaires,
            StateManager.state.header.session,
            StateManager.state.volumesAutomne
        );

        const globalMetrics = VolumeService.calculateGlobalVolumeMetrics(
            StateManager.getCurrentSessionSubjects(),
            allSeances,
            StateManager.state.enseignants.length,
            StateManager.state.enseignantVolumesSupplementaires,
            StateManager.state.forfaits || []
        );

        // Obtenir le seuil selon la règle paramétrable (tolerance + ...)
        let maxWorkload = (typeof this.computeMaxWorkloadForCurrentSession === 'function')
            ? this.computeMaxWorkloadForCurrentSession()
            : (Math.round(globalMetrics.globalVHM));

        // Compatibilité : fallback si compute... retourne null/undefined
        if (maxWorkload === null || maxWorkload === undefined || !Number.isFinite(maxWorkload)) {
            maxWorkload = Math.round(globalMetrics.globalVHM);
        }

        // Empêcher un seuil inférieur au volume maximum déjà atteint par un enseignant
        const currentMaxVolume = Math.max(0, ...Object.values(allVolumes || {}));
        if (maxWorkload < currentMaxVolume) {
            LogService.warning(`SchedulingService: maxWorkload calculé (${maxWorkload}) < volume actuel max (${currentMaxVolume}). Ajustement du seuil.`);
            maxWorkload = currentMaxVolume;
        }

        // Crédits horaires appliqués à chaque enseignant si on l'affecte à cette séance
        // Pour TP : chaque enseignant prend le hTP_Affecte entier
        // Pour Cours/TD : on répartit le hTP_Affecte entre nbTeachers
        const hTP_base = Number(session.hTP_Affecte || 0);
        const creditPerTeacher = (session.type === 'TP') ? hTP_base : (nbTeachers > 0 ? (hTP_base / nbTeachers) : hTP_base);

        // assignedCounts minimal pour compatibilité avec la fonction de scoring
        const assignedCounts = {}; // { teacherName: { subjectName: { 'Cours': n, 'TD': m, 'TP': k } } }

        // Construire une liste de candidats avec leurs scores
        const scoredCandidates = [];

        teachers.forEach(teacher => {
            // teacher peut être un objet ou un nom selon votre implé ; ici on supporte les deux
            const teacherName = (typeof teacher === 'string') ? teacher : (teacher.nom || teacher.name);

            // ✅ NOUVEAU : Parse constraints once and reuse
            let parsedConstraints = null;
            let compatScore = 1.0;

            if (options.respectConstraints) {
                const souhaits = StateManager.state.enseignantSouhaits ? StateManager.state.enseignantSouhaits[teacherName] : null;
                if (souhaits && souhaits.contraintes) {
                    parsedConstraints = TeacherConstraintParser.parseConstraints(
                        teacherName,
                        souhaits.contraintes
                    );

                    compatScore = TeacherConstraintParser.calculateCompatibilityScore(
                        parsedConstraints,
                        session
                    );

                    if (compatScore === 0) {
                        // Enseignant incompatible, ne pas considérer
                        return;
                    }
                }
            }

            const currentWorkload = Number(allVolumes[teacherName] || 0);

            let score = TeacherAvailabilityService.calculateTeacherScore(
                // si teacher est objet, passez l'objet sinon créez simple { nom: teacherName }
                (typeof teacher === 'string') ? { nom: teacherName } : teacher,
                session,
                currentWorkload,
                maxWorkload,
                assignedCounts,
                allSeances,
                sortedCreneaux
            );

            // ✅ NOUVEAU : Bonus au score si compatible avec contraintes (using cached score)
            if (options.respectConstraints && score > 0 && parsedConstraints) {
                // Bonus au score si compatible (max 20%)
                score *= (1 + compatScore * 0.2);
            }

            if (score > 0) {
                scoredCandidates.push({ name: teacherName, score, currentWorkload });
            }
        });

        // Trier par score décroissant
        scoredCandidates.sort((a, b) => b.score - a.score);

        const selected = [];

        // Itérer les candidats triés et sélectionner en vérifiant la projection
        for (const cand of scoredCandidates) {
            if (selected.length >= nbTeachers) break;

            const name = cand.name;
            const current = Number(allVolumes[name] || 0);
            const projected = current + creditPerTeacher;

            if (projected > maxWorkload) {
                // Ne pas sélectionner cet enseignant — il dépasserait le seuil
                LogService.info(`SchedulingService: ${name} serait à ${projected}h (> ${maxWorkload}) si affecté à ${session.matiere}. Ignoré.`);
                continue;
            }

            // Sélectionner l'enseignant et mettre à jour le volume localement pour la suite des choix
            selected.push(name);
            allVolumes[name] = projected;

            // Mettre à jour assignedCounts minimal (utile pour scoring suivant)
            if (!assignedCounts[name]) assignedCounts[name] = {};
            if (!assignedCounts[name][session.matiere]) assignedCounts[name][session.matiere] = {};
            assignedCounts[name][session.matiere][session.type] = (assignedCounts[name][session.matiere][session.type] || 0) + 1;
        }

        // Si on n'a pas assez d'enseignants sélectionnés, logguer un avertissement
        if (selected.length < nbTeachers) {
            LogService.warning(`SchedulingService: seulement ${selected.length}/${nbTeachers} enseignant(s) sélectionné(s) pour ${session.matiere} (${session.type}).`);
        }

        return selected;
    }

    /**
     * Attribue une salle à une séance
     * @param {Session} session - La séance
     * @returns {string} Le nom de la salle
     */
    assignRoomToSession(session) {
        // 1. Obtenir toutes les salles libres compatibles
        const freeRooms = ConflictService.getFreeRooms(
            session.jour,
            session.creneau,
            session.type,
            StateManager.state.sallesInfo,
            StateManager.getSeances()
        );

        if (freeRooms.length === 0) {
            return ''; // Aucune salle libre
        }

        // 2. Vérifier si un pool de salles est défini
        const autoSalles = StateManager.state.autoSallesParFiliere[session.filiere];

        if (autoSalles && autoSalles[session.type] && Array.isArray(autoSalles[session.type])) {

            const preferredRooms = autoSalles[session.type]; // Le pool

            // 3. Essayer de trouver une salle libre DANS le pool
            const preferredAndFreeRoom = freeRooms.find(room => preferredRooms.includes(room));

            if (preferredAndFreeRoom) {
                // Cas 1: Succès, une salle du pool est libre
                return preferredAndFreeRoom;
            } else {
                // Cas 2: Pool défini, mais plein.

                // --- LOGIQUE CONDITIONNELLE ---
                if (session.type === 'Cours') {
                    // RÈGLE STRICTE pour les "Cours"
                    LogService.warning(`[AutoSalle] Pool 'Cours' pour ${session.filiere} plein. Séance laissée sans salle.`);
                    return ''; // On laisse sans salle
                } else {
                    // RÈGLE DE PRÉFÉRENCE (Fallback) pour TD/TP
                    LogService.info(`[AutoSalle] Pool ${session.type} pour ${session.filiere} plein. Utilisation d'une autre salle disponible.`);
                    return freeRooms[0]; // On prend la première salle libre hors pool
                }
            }
        }

        // Cas 3: Fallback. Aucun pool n'était défini pour cette filière/type.
        // On prend la première salle libre compatible disponible.
        return freeRooms[0];
    }

    /**
     * Fusionne les statistiques
     * @param {Object} target - Stats cibles
     * @param {Object} source - Stats sources
     */
    mergeStats(target, source) {
        target.total += source.total;
        target.created += source.created;
        target.failed += source.failed;
        target.skipped += source.skipped;
    }
}

// Export d'une instance singleton
export default new SchedulingService();