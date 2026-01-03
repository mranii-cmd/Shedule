/**
 * Service d'optimisation de l'emploi du temps - VERSION 2.0
 * Refonte complète avec architecture en phases et gestion des TP couplés
 * 
 * @author Ibrahim Mrani - UCD
 * @modified mranii-cmd
 * @version 2.0.0
 * 
 * FONCTIONNALITÉS : 
 * - Architecture en phases (Préparation → Optimisation → Validation → Application)
 * - Gestion intelligente des TP couplés (détection automatique et préservation)
 * - Support complet des options avancées
 * - Optimisation par filière ou globale
 * - Validation robuste avec rollback
 * - Backup automatique
 * - Cache de détection de conflits
 * - Notifications de progression
 */

import StateManager from '../controllers/StateManager.js';
import TeacherConstraintParser from './TeacherConstraintParser.js';
import LogService from './LogService.js';
import ConflictService from './ConflictService.js';

/**
 * Unité atomique représentant deux TP couplés
 */
class CoupledTPUnit {
    constructor(tp1, tp2, coupling1, coupling2) {
        this.id = `couple_${tp1.id}_${tp2.id}`;
        this.tp1 = tp1;
        this.tp2 = tp2;
        this.coupling1 = coupling1;
        this.coupling2 = coupling2;

        // Propriétés communes
        this.matiere = tp1.matiere;
        this.groupe = tp1.groupe;
        this.jour = tp1.jour;
        this.type = 'TP_COUPLE';

        // Horaires globaux
        this.heureDebut = tp1.heureDebut;
        this.heureFin = tp2.heureFin;

        // Métadonnées
        this.isAtomic = true;
        this.locked = tp1.locked || tp2.locked;
        this.fixed = tp1.fixed || tp2.fixed;
    }

    /**
     * Met à jour les deux TP
     */
    update(jour, heureDebut1, heureFin1, heureDebut2, heureFin2) {
        this.jour = jour;
        this.tp1.jour = jour;
        this.tp2.jour = jour;

        this.tp1.heureDebut = heureDebut1;
        this.tp1.heureFin = heureFin1;
        this.tp2.heureDebut = heureDebut2;
        this.tp2.heureFin = heureFin2;

        this.heureDebut = heureDebut1;
        this.heureFin = heureFin2;
    }

    /**
     * Déplace l'unité vers un nouveau jour/horaire
     */
    moveTo(jour, startMinutes, gap = 15) {
        const duration1 = Math.round(this._calcDuration(this.tp1.heureDebut, this.tp1.heureFin) * 60);
        const duration2 = Math.round(this._calcDuration(this.tp2.heureDebut, this.tp2.heureFin) * 60);

        const start1 = startMinutes;
        const end1 = start1 + duration1;
        const start2 = end1 + gap;
        const end2 = start2 + duration2;

        this.update(
            jour,
            this._minutesToTime(start1),
            this._minutesToTime(end1),
            this._minutesToTime(start2),
            this._minutesToTime(end2)
        );
    }

    /**
     * Vérifie si l'unité chevauche un horaire
     */
    overlaps(jour, heureDebut, heureFin) {
        if (this.jour !== jour) return false;

        const s1 = this._timeToMinutes(this.heureDebut);
        const e1 = this._timeToMinutes(this.heureFin);
        const s2 = this._timeToMinutes(heureDebut);
        const e2 = this._timeToMinutes(heureFin);

        return s1 < e2 && s2 < e1;
    }

    /**
     * Retourne les deux séances originales
     */
    toSessions() {
        return [this.tp1, this.tp2];
    }

    // Helpers
    _calcDuration(start, end) {
        return (this._timeToMinutes(end) - this._timeToMinutes(start)) / 60;
    }

    _timeToMinutes(time) {
        if (!time) return 0;
        const parts = String(time).split(':');
        return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    }

    _minutesToTime(minutes) {
        const mins = Math.max(0, Number(minutes || 0));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
}

class ScheduleOptimizerService {
    constructor() {
        // Configuration par défaut
        this.DEFAULT_OPTIONS = {
            // Heuristiques principales
            removeGaps: true,
            balanceLoad: true,
            groupSubjects: true,
            preferredSlots: true,
            balanceSlotDistribution: true,

            // Stratégie
            processByFiliere: true,
            filiereOrder: null,

            // Contraintes
            respectExisting: true,
            respectConstraints: true,
            respectTeacherWishes: true,

            // Limites
            loadTolerance: 1.5,
            minBreak: 15,           // minutes
            maxEndTime: 18,         // heures
            maxStartTime: 8,        // heures

            // TP
            noConcurrentTPPerSubject: true,
            tpPerSubjectPerSlot: 1,

            // Créneaux préférés
            cmSlot: 'morning',      // Cours Magistraux
            tdSlot: 'afternoon',    // TD
            tpSlot: 'afternoon',    // TP

            // Avancé
            maxIterations: 1000,
            convergenceThreshold: 0.01,

            // Debug
            dryRun: false,
            verbose: false,

            // Backup
            autoBackup: true,
            backupLabel: 'Pre-optimization'
        };

        // Configuration TP couplés
        this.COUPLED_TP_CONFIG = {
            enabled: true,
            detectAutomatically: true,
            maxGapMinutes: 30,      // Gap max entre deux TP couplés
            sameRoomRequired: false // Les deux TP doivent-ils être dans la même salle ? 
        };

        // État interne
        this._snapshot = null;
        this._progress = { current: 0, total: 0, message: '' };
    }

    // ====================================
    // API PRINCIPALE
    // ====================================

    /**
     * Optimise l'emploi du temps
     * @param {Object} userOptions - Options personnalisées
     * @returns {Promise<Object>} Résultat de l'optimisation
     */
    async optimizeSchedule(userOptions = {}) {
        this._log('info', '===== 🚀 DÉMARRAGE OPTIMISATION v2.0 =====');

        try {
            // PHASE 1: Préparation
            const opts = this._validateOptions(userOptions);
            const snapshot = this._createSnapshot();
            const context = this._prepareContext(snapshot, opts);

            if (!context.sessions.length) {
                return this._error('Aucune séance à optimiser');
            }

            this._log('info', `📊 ${context.sessions.length} séances à optimiser`);
            this._log('info', `🔗 ${context.coupledTP.size / 2} paires de TP couplés détectées`);

            // PHASE 2: Optimisation
            let optimized;
            if (opts.processByFiliere) {
                optimized = await this._optimizeByFiliere(context, opts);
            } else {
                optimized = await this._optimizeGlobal(context, opts);
            }

            // PHASE 3: Validation
            const validation = this._validateResult(
                snapshot.sessions,
                optimized,
                opts,
                context.coupledTP
            );

            if (!validation.valid) {
                this._log('warning', '⚠️ Résultat invalide, rollback');
                return this._error(validation.errors.join('; '));
            }

            // PHASE 4: Analyse
            const result = this._buildResult(snapshot.sessions, optimized, opts);

            this._log('success', `✅ Optimisation terminée - Score: ${result.optimizedStats.globalScore.toFixed(1)}`);

            return result;

        } catch (error) {
            this._log('error', `❌ Erreur:  ${error.message}`);
            return this._error(error.message);
        }
    }

    /**
     * Applique le résultat de l'optimisation
     * @param {Object} result - Résultat d'optimizeSchedule()
     * @param {Object} opts - Options d'application
     * @returns {boolean} Succès
     */
    applyOptimizedSchedule(result, opts = {}) {
        if (!result || !result.success) {
            this._log('error', 'Résultat invalide');
            return false;
        }

        try {
            // Backup automatique
            if (opts.autoBackup !== false) {
                this._createBackup(opts.backupLabel || 'Pre-optimization');
            }

            // Application atomique
            StateManager.state.seances = this._rehydrateSessions(result.optimizedSeances);
            StateManager.saveState();
            StateManager.notify('schedule: optimized', { result });

            this._log('success', '✅ EDT optimisé appliqué');
            return true;

        } catch (error) {
            this._log('error', `Échec application:  ${error.message}`);
            return false;
        }
    }

    // ====================================
    // PHASE 1: PRÉPARATION
    // ====================================

    /**
     * Valide et normalise les options
     * @param {Object} userOptions - Options utilisateur
     * @returns {Object} Options validées
     */
    _validateOptions(userOptions) {
        const opts = { ...this.DEFAULT_OPTIONS, ...userOptions };

        // Validation des valeurs numériques
        opts.minBreak = Math.max(0, Number(opts.minBreak) || 15);
        opts.maxEndTime = Math.min(23, Math.max(8, Number(opts.maxEndTime) || 18));
        opts.maxStartTime = Math.max(6, Math.min(12, Number(opts.maxStartTime) || 8));
        opts.loadTolerance = Math.max(0.1, Number(opts.loadTolerance) || 1.5);
        opts.maxIterations = Math.max(100, Number(opts.maxIterations) || 1000);

        // Validation des créneaux préférés
        const validSlots = ['morning', 'afternoon', 'evening', 'any'];
        if (!validSlots.includes(opts.cmSlot)) opts.cmSlot = 'morning';
        if (!validSlots.includes(opts.tdSlot)) opts.tdSlot = 'afternoon';
        if (!validSlots.includes(opts.tpSlot)) opts.tpSlot = 'afternoon';

        this._log('debug', 'Options validées:', opts);

        return opts;
    }

    /**
     * Crée un snapshot de l'état actuel
     * @returns {Object} Snapshot
     */
    _createSnapshot() {
        const sessions = StateManager?.state?.seances || [];
        return {
            sessions: this._cloneSessions(sessions),
            timestamp: Date.now(),
            sallesInfo: StateManager?.state?.sallesInfo || {},
            matiereGroupes: StateManager?.state?.matiereGroupes || {},
            enseignantSouhaits: StateManager?.state?.enseignantSouhaits || {}
        };
    }

    /**
     * Prépare le contexte d'optimisation
     * @param {Object} snapshot - Snapshot de l'état
     * @param {Object} opts - Options
     * @returns {Object} Contexte
     */
    _prepareContext(snapshot, opts) {
        const sessions = snapshot.sessions;

        // Classification des séances
        const locked = sessions.filter(s => s.locked || s.fixed);
        const mobile = sessions.filter(s => !(s.locked || s.fixed));
        const tp = sessions.filter(s => this._isTP(s));

        // Détection des TP couplés
        const coupledTP = this.COUPLED_TP_CONFIG.enabled ?
            this._detectCoupledTP(sessions) :
            new Map();

        // Groupement par filière
        const byFiliere = {};
        sessions.forEach(s => {
            const fil = this._getFiliereOfSession(s) || '__nofiliere__';
            if (!byFiliere[fil]) byFiliere[fil] = [];
            byFiliere[fil].push(s);
        });

        return {
            sessions,
            locked,
            mobile,
            tp,
            coupledTP,
            byFiliere,
            sallesInfo: snapshot.sallesInfo,
            matiereGroupes: snapshot.matiereGroupes,
            enseignantSouhaits: snapshot.enseignantSouhaits
        };
    }

    /**
     * Convertit les séances en unités (séances simples + unités TP couplés)
     * @param {Array} sessions - Séances
     * @param {Map} coupledTP - Map des couples
     * @returns {Array} Unités (mix de sessions et CoupledTPUnit)
     */
    _convertToUnits(sessions, coupledTP) {
        const units = [];
        const processedIds = new Set();

        sessions.forEach(s => {
            if (processedIds.has(s.id)) return;

            // Vérifier si c'est un TP couplé
            if (coupledTP && coupledTP.has(s.id)) {
                const coupling = coupledTP.get(s.id);

                // Ne traiter que le premier du couple
                if (coupling.position !== 'first') return;

                const partner = sessions.find(x => x.id === coupling.pairId);
                if (!partner) {
                    this._log('warning', `⚠️ TP couplé sans partenaire: ${s.matiere} (${s.id})`);
                    units.push(s);
                    processedIds.add(s.id);
                    return;
                }

                // Créer une unité atomique
                const unit = new CoupledTPUnit(s, partner, coupling, coupledTP.get(partner.id));
                units.push(unit);

                processedIds.add(s.id);
                processedIds.add(partner.id);

                this._log('debug', `🔗 Unité TP créée: ${unit.matiere} (${unit.groupe})`);
            } else {
                // Séance simple
                units.push(s);
                processedIds.add(s.id);
            }
        });

        this._log('info', `📦 ${units.length} unités créées (dont ${units.filter(u => u.isAtomic).length} TP couplés)`);

        return units;
    }

    /**
     * Convertit les unités en séances
     * @param {Array} units - Unités
     * @returns {Array} Séances
     */
    _convertFromUnits(units) {
        const sessions = [];

        units.forEach(unit => {
            if (unit.isAtomic) {
                // Unité TP couplé -> extraire les deux séances
                sessions.push(...unit.toSessions());
            } else {
                // Séance simple
                sessions.push(unit);
            }
        });

        return sessions;
    }


    // ====================================
    // GESTION DES TP COUPLÉS
    // ====================================

    /**
     * Détecte et marque les TP couplés
     * @param {Array} sessions - Liste des séances
     * @returns {Map} Map<sessionId, { pairId, position, matiere, groupe }>
     */
    _detectCoupledTP(sessions) {
        const couples = new Map();
        const processedIds = new Set();

        this._log('debug', '🔗 Détection des TP couplés.. .');

        sessions.forEach((s1, i) => {
            if (processedIds.has(s1.id)) return;
            if (!this._isTP(s1)) return;

            // Chercher un TP suivant de la même matière/groupe
            for (let j = i + 1; j < sessions.length; j++) {
                const s2 = sessions[j];

                if (processedIds.has(s2.id)) continue;
                if (!this._isTP(s2)) continue;

                // Vérifier les critères de couplage
                if (this._areTPCoupled(s1, s2)) {
                    // Marquer le couple
                    couples.set(s1.id, {
                        pairId: s2.id,
                        position: 'first',
                        matiere: s1.matiere,
                        groupe: s1.groupe
                    });

                    couples.set(s2.id, {
                        pairId: s1.id,
                        position: 'second',
                        matiere: s2.matiere,
                        groupe: s2.groupe
                    });

                    processedIds.add(s1.id);
                    processedIds.add(s2.id);

                    this._log('debug', `✓ TP couplés:  ${s1.matiere} (${s1.groupe}) - ${s1.jour} ${s1.heureDebut}/${s2.heureDebut}`);

                    break;
                }
            }
        });

        this._log('info', `🔗 ${couples.size / 2} paires de TP couplés détectées`);

        return couples;
    }

    /**
 * Vérifie si deux TP sont couplés (version stricte)
 * @param {Object} tp1 - Premier TP
 * @param {Object} tp2 - Deuxième TP
 * @returns {boolean}
 */
    _areTPCoupled(tp1, tp2) {
        // Même matière (stricte)
        if (!tp1.matiere || !tp2.matiere || tp1.matiere !== tp2.matiere) return false;

        // Même groupe (stricte)
        const g1 = (tp1.groupe || '').toString().trim();
        const g2 = (tp2.groupe || '').toString().trim();
        if (g1 !== g2) return false;

        // Même jour
        if (tp1.jour !== tp2.jour) return false;

        // Vérifier la consécutivité temporelle (stricte)
        const end1 = this._timeToMinutes(tp1.heureFin);
        const start2 = this._timeToMinutes(tp2.heureDebut);
        const gap = start2 - end1;

        // Gap entre 0 et maxGapMinutes
        if (gap < 0 || gap > this.COUPLED_TP_CONFIG.maxGapMinutes) return false;

        // Vérifier que ce sont bien des TP (doublement vérifié)
        if (!this._isTP(tp1) || !this._isTP(tp2)) return false;

        // Vérifier la durée minimale de chaque TP (au moins 45 minutes)
        const duration1 = this._calculateDuration(tp1.heureDebut, tp1.heureFin);
        const duration2 = this._calculateDuration(tp2.heureDebut, tp2.heureFin);

        if (duration1 < 0.75 || duration2 < 0.75) return false; // 45 min minimum

        // ✅ NOUVEAU : Vérifier que les durées sont similaires (±15 min)
        const durationDiff = Math.abs(duration1 - duration2);
        if (durationDiff > 0.25) return false; // Max 15 min de différence

        // Optionnel : même salle
        if (this.COUPLED_TP_CONFIG.sameRoomRequired) {
            const s1 = (tp1.salle || '').toString().trim();
            const s2 = (tp2.salle || '').toString().trim();
            if (s1 && s2 && s1 !== s2) return false;
        }

        return true;
    }

    /**
     * Trouve le partenaire d'un TP couplé
     * @param {Object} session - Séance TP
     * @param {Map} couples - Map des couples
     * @param {Array} allSessions - Toutes les séances
     * @returns {Object|null} Session partenaire ou null
     */
    _findTPPartner(session, couples, allSessions) {
        const coupling = couples.get(session.id);
        if (!coupling) return null;

        return allSessions.find(s => s.id === coupling.pairId);
    }

    /**
     * Déplace un TP couplé (avec son partenaire)
     * @param {Object} session - Séance à déplacer
     * @param {Map} couples - Map des couples
     * @param {Array} allSessions - Toutes les séances
     * @param {string} targetJour - Jour cible
     * @param {number} targetStartMinutes - Heure de début cible (en minutes)
     * @param {Object} opts - Options
     * @returns {Object} { success:  boolean, sessions: [session1, session2] }
     */
    _moveCoupledTP(session, couples, allSessions, targetJour, targetStartMinutes, opts) {
        const partner = this._findTPPartner(session, couples, allSessions);

        if (!partner) {
            return {
                success: true,
                sessions: [session]
            };
        }

        const coupling = couples.get(session.id);
        const isFirst = coupling.position === 'first';

        // Calculer les durées
        const duration1 = Math.round(this._calculateDuration(session.heureDebut, session.heureFin) * 60);
        const duration2 = Math.round(this._calculateDuration(partner.heureDebut, partner.heureFin) * 60);
        const originalGap = this._timeToMinutes(partner.heureDebut) - this._timeToMinutes(session.heureFin);
        const gap = Math.max(0, Math.min(originalGap, this.COUPLED_TP_CONFIG.maxGapMinutes));

        // Calculer les nouveaux horaires
        let start1, end1, start2, end2;

        if (isFirst) {
            start1 = targetStartMinutes;
            end1 = start1 + duration1;
            start2 = end1 + gap;
            end2 = start2 + duration2;
        } else {
            start2 = targetStartMinutes;
            end2 = start2 + duration2;
            start1 = start2 - gap - duration1;
            end1 = start1 + duration1;
        }

        // Créer les candidats
        const candidate1 = {
            ...session,
            jour: targetJour,
            heureDebut: this._minutesToTime(start1),
            heureFin: this._minutesToTime(end1)
        };

        const candidate2 = {
            ...partner,
            jour: targetJour,
            heureDebut: this._minutesToTime(start2),
            heureFin: this._minutesToTime(end2)
        };

        // Vérifier les conflits pour les deux séances
        const otherSessions = allSessions.filter(s =>
            s.id !== session.id && s.id !== partner.id
        );

        const conflict1 = this._hasConflicts(candidate1, otherSessions, opts);
        const conflict2 = this._hasConflicts(candidate2, otherSessions, opts);

        if (conflict1 || conflict2) {
            this._log('debug', `❌ Impossible de déplacer les TP couplés ${session.matiere} (conflits)`);
            return {
                success: false,
                sessions: [session, partner]
            };
        }

        // Vérifier que les horaires sont valides
        const maxEnd = opts.maxEndTime * 60;
        const maxStart = opts.maxStartTime * 60;

        if (start1 < maxStart || end2 > maxEnd) {
            this._log('debug', `❌ TP couplés hors des horaires autorisés`);
            return {
                success: false,
                sessions: [session, partner]
            };
        }

        this._log('debug', `✓ TP couplés déplacés:  ${targetJour} ${this._minutesToTime(start1)}-${this._minutesToTime(end2)}`);

        return {
            success: true,
            sessions: [candidate1, candidate2]
        };
    }

    /**
     * Valide qu'un TP couplé n'a pas été séparé
     * @param {Array} sessions - Séances après optimisation
     * @param {Map} originalCouples - Couples avant optimisation
     * @returns {Array} Liste des violations
     */
    _validateCoupledTP(sessions, originalCouples) {
        const violations = [];
        const newCouples = this._detectCoupledTP(sessions);

        originalCouples.forEach((coupling, sessionId) => {
            if (coupling.position !== 'first') return;

            const originalPairId = coupling.pairId;
            const newCoupling = newCouples.get(sessionId);

            if (!newCoupling) {
                violations.push({
                    type: 'separated',
                    session1Id: sessionId,
                    session2Id: originalPairId,
                    message: `TP couplés séparés: ${coupling.matiere} (${coupling.groupe})`
                });
            } else if (newCoupling.pairId !== originalPairId) {
                violations.push({
                    type: 'mismatch',
                    session1Id: sessionId,
                    session2Id: originalPairId,
                    newPairId: newCoupling.pairId,
                    message: `TP couplés réassociés incorrectement`
                });
            }
        });

        if (violations.length > 0) {
            this._log('warning', `⚠️ ${violations.length} violation(s) de TP couplés détectées`);
        }

        return violations;
    }

    /**
     * Répare les TP couplés séparés (méthode de récupération)
     * @param {Array} sessions - Séances après optimisation
     * @param {Map} originalCouples - Couples originaux
     * @returns {Array} Séances avec couples réparés
     */
    _repairSeparatedCouples(sessions, originalCouples) {
        this._log('warning', '🔧 Tentative de réparation des TP couplés séparés.. .');

        const repaired = [];

        originalCouples.forEach((coupling, sessionId) => {
            if (coupling.position !== 'first') return;

            const s1 = sessions.find(s => s.id === sessionId);
            const s2 = sessions.find(s => s.id === coupling.pairId);

            if (!s1 || !s2) return;

            // Vérifier s'ils sont séparés
            if (s1.jour !== s2.jour || !this._areTPCoupled(s1, s2)) {
                this._log('warning', `⚠️ Réparation nécessaire: ${s1.matiere} (${s1.groupe})`);

                // Forcer le second à suivre le premier
                const duration1 = Math.round(this._calculateDuration(s1.heureDebut, s1.heureFin) * 60);
                const duration2 = Math.round(this._calculateDuration(s2.heureDebut, s2.heureFin) * 60);
                const gap = 15; // Gap fixe de 15 minutes

                const start1 = this._timeToMinutes(s1.heureDebut);
                const end1 = start1 + duration1;
                const start2 = end1 + gap;
                const end2 = start2 + duration2;

                // Appliquer la correction
                s2.jour = s1.jour;
                s2.heureDebut = this._minutesToTime(start2);
                s2.heureFin = this._minutesToTime(end2);

                this._log('success', `✓ TP couplés réparés: ${s1.jour} ${s1.heureDebut}-${s2.heureFin}`);
            }
        });

        return sessions;
    }

    // ====================================
    // PHASE 2: OPTIMISATION PAR FILIÈRE
    // ====================================

    /**
 * Optimise par filière (séquentiel) - VERSION UNITÉS
 * @param {Object} context - Contexte d'optimisation
 * @param {Object} opts - Options
 * @returns {Promise<Array>} Séances optimisées
 */
    async _optimizeByFiliere(context, opts) {
        this._log('info', '📚 Optimisation par filière (mode UNITÉS)');

        const filieres = Object.keys(context.byFiliere);

        // Ordre de traitement
        let orderedFilieres = filieres;
        if (Array.isArray(opts.filiereOrder)) {
            const custom = opts.filiereOrder.filter(f => filieres.includes(f));
            const remaining = filieres.filter(f => !custom.includes(f));
            orderedFilieres = [...custom, ...remaining];
        } else {
            // Trier par nombre de séances (décroissant)
            orderedFilieres.sort((a, b) =>
                context.byFiliere[b].length - context.byFiliere[a].length
            );
        }

        this._log('debug', 'Ordre des filières:', orderedFilieres);

        // ✅ CRITIQUE : Séparer les TP couplés par filière AVANT conversion
        const coupledTP = context.coupledTP;
        const coupledByFiliere = new Map();

        // Identifier quels TP couplés appartiennent à chaque filière
        if (coupledTP && coupledTP.size > 0) {
            coupledTP.forEach((coupling, sessionId) => {
                if (coupling.position !== 'first') return;

                const filiere = coupling.filiere || this._getFiliereOfSession(
                    context.sessions.find(s => s.id === sessionId)
                ) || '__nofiliere__';

                if (!coupledByFiliere.has(filiere)) {
                    coupledByFiliere.set(filiere, new Map());
                }

                const filiereMap = coupledByFiliere.get(filiere);
                filiereMap.set(sessionId, coupling);
                filiereMap.set(coupling.pairId, coupledTP.get(coupling.pairId));
            });
        }

        const placed = []; // Séances déjà placées (toutes filières confondues)
        const totalSteps = orderedFilieres.length;
        let currentStep = 0;

        for (const filiere of orderedFilieres) {
            this._notifyProgress(++currentStep, totalSteps, `Optimisation ${filiere}... `);

            const sessions = this._cloneSessions(context.byFiliere[filiere]);

            if (sessions.length === 0) {
                this._log('debug', `Filière ${filiere} vide, skip`);
                continue;
            }

            this._log('info', `\n📂 Traitement filière:  ${filiere} (${sessions.length} séances)`);

            // Séparer locked et mobile
            const locked = sessions.filter(s => s.locked || s.fixed);
            const mobile = sessions.filter(s => !(s.locked || s.fixed));

            this._log('debug', `  - Verrouillées: ${locked.length}`);
            this._log('debug', `  - Mobiles: ${mobile.length}`);

            // ✅ Récupérer les TP couplés de cette filière
            const filiereCoupledTP = coupledByFiliere.get(filiere) || new Map();

            if (filiereCoupledTP.size > 0) {
                this._log('info', `  🔗 ${filiereCoupledTP.size / 2} paires de TP couplés dans cette filière`);
            }

            // ✅ CONVERSION : Séances → Unités (pour cette filière uniquement)
            const mobileUnits = this._convertToUnits(mobile, filiereCoupledTP);
            const lockedUnits = this._convertToUnits(locked, filiereCoupledTP);
            const placedUnits = this._convertToUnits(placed, coupledTP); // Toutes les filières déjà placées

            this._log('debug', `  📦 ${mobileUnits.length} unités mobiles (${mobileUnits.filter(u => u.isAtomic).length} TP couplés)`);

            // ✅ OPTIMISATION :  Appliquer les heuristiques sur les unités mobiles
            const optimizedUnits = this._applyHeuristicsUnits(
                mobileUnits,
                [...lockedUnits, ...placedUnits],
                opts
            );

            // ✅ RÉSOLUTION DES CONFLITS :  Avec toutes les séances déjà placées
            const resolvedUnits = this._resolveConflictsUnits(
                optimizedUnits,
                [...lockedUnits, ...placedUnits],
                opts
            );

            // ✅ CONVERSION : Unités → Séances
            const resolvedSessions = this._convertFromUnits(resolvedUnits);
            const lockedSessions = this._convertFromUnits(lockedUnits);

            // ✅ VALIDATION :  Vérifier que les TP couplés sont préservés
            if (filiereCoupledTP.size > 0) {
                const violations = this._validateCoupledTP(resolvedSessions, filiereCoupledTP);

                if (violations.length > 0) {
                    this._log('error', `  ❌ ${violations.length} TP couplés séparés dans ${filiere} ! `);
                    violations.forEach(v => this._log('error', `     ${v.message}`));

                    // Tentative de réparation
                    this._repairSeparatedCouples(resolvedSessions, filiereCoupledTP);

                    // Re-valider
                    const newViolations = this._validateCoupledTP(resolvedSessions, filiereCoupledTP);
                    if (newViolations.length === 0) {
                        this._log('success', `  ✅ Réparation réussie pour ${filiere}`);
                    } else {
                        this._log('error', `  ❌ ${newViolations.length} violations persistent dans ${filiere}`);
                    }
                } else {
                    this._log('success', `  ✅ Tous les TP couplés préservés dans ${filiere}`);
                }
            }

            // Ajouter aux séances placées
            placed.push(...lockedSessions, ...resolvedSessions);

            this._log('info', `  ✓ Filière ${filiere} terminée (${placed.length} séances au total)\n`);
        }

        this._notifyProgress(totalSteps, totalSteps, 'Optimisation par filière terminée');

        // ✅ VALIDATION GLOBALE FINALE
        if (coupledTP && coupledTP.size > 0) {
            this._log('info', '\n🔍 Validation globale des TP couplés.. .');
            const globalViolations = this._validateCoupledTP(placed, coupledTP);

            if (globalViolations.length > 0) {
                this._log('error', `❌ ${globalViolations.length} TP couplés séparés au niveau global !`);
                globalViolations.forEach(v => this._log('error', v.message));

                // Tentative de réparation globale
                this._repairSeparatedCouples(placed, coupledTP);

                const finalViolations = this._validateCoupledTP(placed, coupledTP);
                if (finalViolations.length === 0) {
                    this._log('success', '✅ Réparation globale réussie');
                }
            } else {
                this._log('success', '✅ Tous les TP couplés préservés globalement');
            }
        }

        return placed;
    }

    // ====================================
    // PHASE 2:  OPTIMISATION GLOBALE
    // ====================================

    /**
 * Optimise toutes les séances ensemble (version UNITÉS)
 */
    async _optimizeGlobal(context, opts) {
        this._log('info', '🌍 Optimisation globale (mode UNITÉS)');

        const { locked, mobile, coupledTP } = context;

        this._notifyProgress(0, 1, 'Optimisation globale.. .');

        // Appliquer les heuristiques (qui gèrent les unités en interne)
        const optimized = this._applyHeuristics(mobile, locked, opts, coupledTP);

        // Résoudre les conflits
        const resolved = this._resolveConflicts(optimized, locked, opts, coupledTP);

        this._notifyProgress(1, 1, 'Optimisation globale terminée');

        return [...locked, ...resolved];
    }

    // ====================================
    // HEURISTIQUES (ORDRE OPTIMISÉ)
    // ====================================

    /**
 * Applique les heuristiques sur des unités déjà converties
 * @param {Array} units - Unités mobiles
 * @param {Array} fixedUnits - Unités fixes
 * @param {Object} opts - Options
 * @returns {Array} Unités optimisées
 */
    _applyHeuristicsUnits(units, fixedUnits, opts) {
        // Cloner pour éviter les modifications
        let working = units.map(u => {
            if (u.isAtomic) {
                // Cloner l'unité TP couplé
                const clone = Object.assign(Object.create(Object.getPrototypeOf(u)), u);
                clone.tp1 = { ...u.tp1 };
                clone.tp2 = { ...u.tp2 };
                return clone;
            } else {
                // Cloner la séance simple
                return { ...u };
            }
        });

        // Ordre d'application
        const steps = [];

        if (opts.groupSubjects) {
            steps.push({
                name: 'Regroupement',
                fn: () => this._groupBySubjectUnits(working, fixedUnits, opts)
            });
        }

        if (opts.balanceLoad) {
            steps.push({
                name: 'Équilibrage charge',
                fn: () => this._balanceDailyLoadUnits(working, fixedUnits, opts)
            });
        }

        if (opts.preferredSlots) {
            steps.push({
                name: 'Créneaux préférés',
                fn: () => this._preferredTimeSlotsUnits(working, fixedUnits, opts)
            });
        }

        if (opts.removeGaps) {
            steps.push({
                name: 'Suppression trous',
                fn: () => this._removeGapsUnits(working, fixedUnits, opts)
            });
        }

        if (opts.balanceSlotDistribution) {
            steps.push({
                name: 'Équilibrage matin/après-midi',
                fn: () => this._balanceSlotDistributionUnits(working, fixedUnits, opts)
            });
        }

        steps.forEach(step => {
            this._log('debug', `    Heuristique: ${step.name}`);
            step.fn();
        });

        return working;
    }

    /**
     * Regroupe par matière (version UNITÉS)
     * @param {Array} units - Unités
     * @param {Array} fixedUnits - Unités fixes
     * @param {Object} opts - Options
     */
    _groupBySubjectUnits(units, fixedUnits, opts) {
        const bySubject = {};

        units.forEach(u => {
            const mat = u.matiere || u.subject;
            if (!mat) return;
            if (!bySubject[mat]) bySubject[mat] = [];
            bySubject[mat].push(u);
        });

        Object.entries(bySubject).forEach(([matiere, list]) => {
            if (list.length <= 1) return;

            // Jour le plus fréquent
            const dayCount = {};
            list.forEach(u => {
                dayCount[u.jour] = (dayCount[u.jour] || 0) + 1;
            });

            const targetDay = Object.keys(dayCount).reduce((a, b) =>
                dayCount[a] > dayCount[b] ? a : b
            );

            this._log('debug', `Regroupement ${matiere} → ${targetDay}`);

            // Déplacer chaque unité
            list.forEach(u => {
                if (u.jour === targetDay) return;
                if (u.locked || u.fixed) return;

                const candidate = this._createCandidateUnit(u, targetDay, u.heureDebut);

                if (!this._hasConflictsUnit(candidate, [...fixedUnits, ...units], opts)) {
                    this._applyUnitChange(u, candidate);
                }
            });
        });
    }
    /**
     * Supprime les trous (version UNITÉS)
     */
    _removeGapsUnits(units, fixedUnits, opts) {
        const minBreak = opts.minBreak;

        const byDayGroup = {};
        units.forEach(u => {
            const key = `${u.jour}_${u.groupe || '__nogroup__'}`;
            if (!byDayGroup[key]) byDayGroup[key] = [];
            byDayGroup[key].push(u);
        });

        Object.values(byDayGroup).forEach(group => {
            group.sort((a, b) =>
                this._timeToMinutes(a.heureDebut) - this._timeToMinutes(b.heureDebut)
            );

            let currentTime = this._timeToMinutes(group[0].heureDebut);

            group.forEach(u => {
                if (u.locked || u.fixed) {
                    currentTime = this._timeToMinutes(u.heureFin) + minBreak;
                    return;
                }

                const candidate = this._createCandidateUnit(u, u.jour, this._minutesToTime(currentTime));

                if (!this._hasConflictsUnit(candidate, [...fixedUnits, ...units], opts)) {
                    this._applyUnitChange(u, candidate);
                    currentTime = this._timeToMinutes(candidate.heureFin) + minBreak;
                } else {
                    currentTime = this._timeToMinutes(u.heureFin) + minBreak;
                }
            });
        });
    }

    /**
     * Équilibre la charge (version UNITÉS)
     */
    _balanceDailyLoadUnits(units, fixedUnits, opts) {
        // Calculer la charge par jour/groupe
        const loads = {};
        [...fixedUnits, ...units].forEach(u => {
            const key = `${u.jour}_${u.groupe || '__nogroup__'}`;
            if (!loads[key]) {
                loads[key] = {
                    day: u.jour,
                    group: u.groupe,
                    units: [],
                    totalHours: 0
                };
            }
            loads[key].units.push(u);
            loads[key].totalHours += this._calculateDuration(u.heureDebut, u.heureFin);
        });

        const loadArray = Object.values(loads);
        const avgLoad = loadArray.reduce((sum, l) => sum + l.totalHours, 0) / loadArray.length;
        const threshold = avgLoad * (opts.loadTolerance - 1);

        const overloaded = loadArray.filter(l => l.totalHours > avgLoad + threshold);
        const underloaded = loadArray.filter(l => l.totalHours < avgLoad - threshold);

        overloaded.forEach(over => {
            const under = underloaded.find(u => u.group === over.group);
            if (!under) return;

            const toMove = over.units.find(u => units.includes(u) && !u.locked && !u.fixed);
            if (!toMove) return;

            const candidate = this._createCandidateUnit(toMove, under.day, toMove.heureDebut);

            if (!this._hasConflictsUnit(candidate, [...fixedUnits, ...units], opts)) {
                this._applyUnitChange(toMove, candidate);

                const dur = this._calculateDuration(toMove.heureDebut, toMove.heureFin);
                over.totalHours -= dur;
                under.totalHours += dur;
            }
        });
    }

    /**
     * Créneaux préférés (version UNITÉS)
     */
    _preferredTimeSlotsUnits(units, fixedUnits, opts) {
        const maxEnd = opts.maxEndTime * 60;

        units.forEach(u => {
            if (u.locked || u.fixed) return;

            const type = (u.type || '').toLowerCase();
            let preferredSlot = 'any';

            if (type.includes('cours') || type.includes('cm')) {
                preferredSlot = opts.cmSlot;
            } else if (type.includes('td')) {
                preferredSlot = opts.tdSlot;
            } else if (type.includes('tp')) {
                preferredSlot = opts.tpSlot;
            }

            if (preferredSlot === 'any') return;

            const currentStart = this._timeToMinutes(u.heureDebut);

            let targetStart;
            if (preferredSlot === 'morning') targetStart = opts.maxStartTime * 60;
            else if (preferredSlot === 'afternoon') targetStart = 14 * 60;
            else targetStart = 18 * 60;

            const duration = Math.round(this._calculateDuration(u.heureDebut, u.heureFin) * 60);

            if (targetStart + duration > maxEnd) return;

            const isInWrongSlot =
                (preferredSlot === 'morning' && currentStart >= 12 * 60) ||
                (preferredSlot === 'afternoon' && (currentStart < 12 * 60 || currentStart >= 18 * 60));

            if (!isInWrongSlot) return;

            const candidate = this._createCandidateUnit(u, u.jour, this._minutesToTime(targetStart));

            if (!this._hasConflictsUnit(candidate, [...fixedUnits, ...units], opts)) {
                this._applyUnitChange(u, candidate);
            }
        });
    }

    /**
     * Équilibrage matin/après-midi (version UNITÉS)
     */
    _balanceSlotDistributionUnits(units, fixedUnits, opts) {
        const days = [... new Set(units.map(u => u.jour))];

        const counts = {};
        days.forEach(d => {
            counts[d] = { morning: 0, afternoon: 0, evening: 0 };
        });

        units.forEach(u => {
            const start = this._timeToMinutes(u.heureDebut);
            const slot = start < 12 * 60 ? 'morning' : start < 18 * 60 ? 'afternoon' : 'evening';
            counts[u.jour][slot]++;
        });

        const total = { morning: 0, afternoon: 0, evening: 0 };
        days.forEach(d => {
            total.morning += counts[d].morning;
            total.afternoon += counts[d].afternoon;
            total.evening += counts[d].evening;
        });

        const target = {
            morning: Math.round(total.morning / days.length),
            afternoon: Math.round(total.afternoon / days.length),
            evening: Math.round(total.evening / days.length)
        };

        days.forEach(day => {
            ['morning', 'afternoon', 'evening'].forEach(currentSlot => {
                if (counts[day][currentSlot] <= target[currentSlot]) return;

                const underloadedSlot = ['morning', 'afternoon', 'evening'].find(slot =>
                    counts[day][slot] < target[slot]
                );

                if (!underloadedSlot) return;

                const toMove = units.find(u =>
                    u.jour === day &&
                    !u.locked &&
                    !u.fixed &&
                    this._getSlotFromTime(u.heureDebut) === currentSlot
                );

                if (!toMove) return;

                let newStart;
                if (underloadedSlot === 'morning') newStart = opts.maxStartTime * 60;
                else if (underloadedSlot === 'afternoon') newStart = 14 * 60;
                else newStart = 18 * 60;

                const candidate = this._createCandidateUnit(toMove, day, this._minutesToTime(newStart));

                if (!this._hasConflictsUnit(candidate, [...fixedUnits, ...units], opts)) {
                    this._applyUnitChange(toMove, candidate);
                    counts[day][currentSlot]--;
                    counts[day][underloadedSlot]++;
                }
            });
        });
    }

    /**
     * Résout les conflits sur des unités
     * @param {Array} units - Unités optimisées
     * @param {Array} fixedUnits - Unités fixes
     * @param {Object} opts - Options
     * @returns {Array} Unités sans conflits
     */
    _resolveConflictsUnits(units, fixedUnits, opts) {
        const resolved = [];
        const allFixed = [...fixedUnits];

        units.forEach(u => {
            if (this._hasConflictsUnit(u, [...allFixed, ...resolved], opts)) {
                this._log('debug', `    ⚠️ Conflit détecté: ${u.matiere} (${u.groupe || 'N/A'})`);

                // Tenter de relocaliser
                const relocated = this._relocateUnit(u, [...allFixed, ...resolved], opts);

                if (relocated) {
                    resolved.push(relocated);
                    this._log('debug', `    ✓ Relocalisé: ${relocated.jour} ${relocated.heureDebut}`);
                } else {
                    // Impossible de relocaliser, garder tel quel
                    this._log('warning', `    ❌ Impossible de relocaliser: ${u.matiere}`);
                    resolved.push(u);
                }
            } else {
                resolved.push(u);
            }
        });

        return resolved;
    }

    /**
     * Relocalise une unité en conflit
     * @param {Object} unit - Unité à relocaliser
     * @param {Array} fixedUnits - Unités fixes
     * @param {Object} opts - Options
     * @returns {Object|null} Unité relocalisée ou null
     */
    _relocateUnit(unit, fixedUnits, opts) {
        const maxEnd = opts.maxEndTime * 60;
        const maxStart = opts.maxStartTime * 60;
        const duration = Math.round(this._calculateDuration(unit.heureDebut, unit.heureFin) * 60);
        const step = 15;

        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

        // Essayer tous les créneaux possibles
        for (const jour of days) {
            for (let start = maxStart; start + duration <= maxEnd; start += step) {
                const candidate = this._createCandidateUnit(unit, jour, this._minutesToTime(start));

                if (!this._hasConflictsUnit(candidate, fixedUnits, opts)) {
                    return candidate;
                }
            }
        }

        return null;
    }

    /**
     * Crée une unité candidate (déplacée)
     */
    _createCandidateUnit(unit, jour, heureDebut) {
        if (unit.isAtomic) {
            // Unité TP couplé
            const startMinutes = this._timeToMinutes(heureDebut);
            const clone = Object.assign(Object.create(Object.getPrototypeOf(unit)), unit);
            clone.moveTo(jour, startMinutes);
            return clone;
        } else {
            // Séance simple
            return { ...unit, jour, heureDebut };
        }
    }

    /**
     * Applique les changements d'une candidate à l'unité originale
     */
    _applyUnitChange(unit, candidate) {
        if (unit.isAtomic && candidate.isAtomic) {
            // Copier toutes les propriétés
            unit.jour = candidate.jour;
            unit.heureDebut = candidate.heureDebut;
            unit.heureFin = candidate.heureFin;

            // Synchroniser les TP internes
            unit.tp1.jour = candidate.tp1.jour;
            unit.tp1.heureDebut = candidate.tp1.heureDebut;
            unit.tp1.heureFin = candidate.tp1.heureFin;

            unit.tp2.jour = candidate.tp2.jour;
            unit.tp2.heureDebut = candidate.tp2.heureDebut;
            unit.tp2.heureFin = candidate.tp2.heureFin;
        } else {
            // Séance simple
            Object.assign(unit, candidate);
        }
    }

    /**
     * Vérifie les conflits pour une unité
     */
    _hasConflictsUnit(unit, otherUnits, opts) {
        for (const other of otherUnits) {
            if (!other || other.id === unit.id) continue;
            if (other.jour !== unit.jour) continue;

            // Vérifier chevauchement temporel
            if (!this._timesOverlap(unit.heureDebut, unit.heureFin, other.heureDebut, other.heureFin)) {
                continue;
            }

            // Conflits de ressources
            if (unit.salle && other.salle && unit.salle === other.salle) return true;
            if (unit.professeur && other.professeur && unit.professeur === other.professeur) return true;
            if (unit.groupe && other.groupe && unit.groupe === other.groupe) return true;
        }

        return false;
    }

    // ====================================
    // HEURISTIQUE 1: REGROUPEMENT PAR MATIÈRE
    // ====================================

    /**
 * Regroupe les séances d'une même matière sur le même jour
 * @param {Array} sessions - Séances à optimiser
 * @param {Array} fixed - Séances fixes
 * @param {Object} opts - Options
 * @param {Map} coupledTP - TP couplés
 * @param {Set} processedCouples - Couples déjà traités
 * @param {Map} coupleLocks - Verrous de couples
 */
    _groupBySubject(sessions, fixed, opts, coupledTP = null, processedCouples = new Set(), coupleLocks = null) {
        const bySubject = {};
        sessions.forEach(s => {
            if (!s.matiere) return;
            if (!bySubject[s.matiere]) bySubject[s.matiere] = [];
            bySubject[s.matiere].push(s);
        });

        Object.entries(bySubject).forEach(([matiere, list]) => {
            if (list.length <= 1) return;

            // Trouver le jour le plus fréquent
            const dayCount = {};
            list.forEach(s => {
                dayCount[s.jour] = (dayCount[s.jour] || 0) + 1;
            });

            const targetDay = Object.keys(dayCount).reduce((a, b) =>
                dayCount[a] > dayCount[b] ? a : b
            );

            // Tenter de déplacer les séances vers ce jour
            list.forEach(s => {
                if (s.jour === targetDay) return;

                // ✅ Vérifier si c'est un TP couplé
                if (coupledTP && coupledTP.has(s.id)) {
                    const coupling = coupledTP.get(s.id);
                    const coupleKey = `${Math.min(s.id, coupling.pairId)}-${Math.max(s.id, coupling.pairId)}`;

                    // Éviter de traiter deux fois
                    if (processedCouples.has(coupleKey)) return;

                    const partner = this._findTPPartner(s, coupledTP, sessions);
                    if (!partner) {
                        this._log('warning', `⚠️ TP couplé sans partenaire trouvé:  ${s.matiere} (${s.id})`);
                        return;
                    }

                    // ✅ CRITIQUE : Les deux TP doivent être dans la même liste
                    if (!list.includes(partner)) {
                        this._log('warning', `⚠️ Partenaire TP hors de la liste: ${partner.matiere} (${partner.id})`);
                        return;
                    }

                    // Calculer le point de départ
                    const isFirst = coupling.position === 'first';
                    const startMinutes = this._timeToMinutes(isFirst ? s.heureDebut : partner.heureDebut);

                    // Déplacer les deux TP ensemble
                    const result = this._moveCoupledTP(
                        isFirst ? s : partner,  // ✅ Toujours partir du premier
                        coupledTP,
                        [...fixed, ...sessions],
                        targetDay,
                        startMinutes,
                        opts
                    );

                    if (result.success) {
                        // ✅ SYNCHRONISATION COMPLÈTE
                        const [tp1, tp2] = result.sessions;

                        // Trouver les originaux dans la liste
                        const orig1 = sessions.find(x => x.id === tp1.id);
                        const orig2 = sessions.find(x => x.id === tp2.id);

                        if (orig1) Object.assign(orig1, tp1);
                        if (orig2) Object.assign(orig2, tp2);

                        processedCouples.add(coupleKey);

                        this._log('debug', `✓ TP couplés déplacés ensemble: ${matiere} → ${targetDay}`);
                    } else {
                        this._log('debug', `❌ Impossible de déplacer les TP couplés: ${matiere}`);
                    }
                } else {
                    // Déplacement normal
                    const candidate = { ...s, jour: targetDay };

                    if (!this._hasConflicts(candidate, [...fixed, ...sessions], opts)) {
                        s.jour = targetDay;
                    }
                }
            });
        });
    }

    // ====================================
    // HEURISTIQUE 2: ÉQUILIBRAGE DE CHARGE
    // ====================================

    /**
     * Équilibre la charge quotidienne par groupe
     * @param {Array} sessions - Séances à optimiser
     * @param {Array} fixed - Séances fixes
     * @param {Object} opts - Options
     * @param {Map} coupledTP - TP couplés
     * @param {Set} processedCouples - Couples déjà traités
     */
    _balanceDailyLoad(sessions, fixed, opts, coupledTP = null, processedCouples = new Set()) {
        const allSessions = [...fixed, ...sessions];

        const loads = this._calculateDailyLoad(allSessions);
        const average = loads.average;
        const threshold = average * (opts.loadTolerance - 1);

        const overloaded = Object.values(loads.byDayGroup).filter(l =>
            l.totalHours > average + threshold
        );

        const underloaded = Object.values(loads.byDayGroup).filter(l =>
            l.totalHours < average - threshold
        );

        overloaded.forEach(over => {
            const under = underloaded.find(u => u.group === over.group);
            if (!under) return;

            const toMove = over.sessions.find(s =>
                sessions.includes(s) && !s.locked && !s.fixed
            );

            if (!toMove) return;

            // Vérifier si TP couplé
            if (coupledTP && coupledTP.has(toMove.id)) {
                const coupling = coupledTP.get(toMove.id);
                const coupleKey = `${Math.min(toMove.id, coupling.pairId)}-${Math.max(toMove.id, coupling.pairId)}`;

                if (processedCouples.has(coupleKey)) return;

                const startMinutes = this._timeToMinutes(toMove.heureDebut);
                const result = this._moveCoupledTP(
                    toMove,
                    coupledTP,
                    allSessions,
                    under.day,
                    startMinutes,
                    opts
                );

                if (result.success) {
                    const partner = this._findTPPartner(toMove, coupledTP, sessions);
                    Object.assign(toMove, result.sessions[0]);
                    if (partner) Object.assign(partner, result.sessions[1]);
                    processedCouples.add(coupleKey);

                    const duration = this._calculateDuration(toMove.heureDebut, toMove.heureFin);
                    over.totalHours -= duration;
                    under.totalHours += duration;
                }
            } else {
                const candidate = { ...toMove, jour: under.day };

                if (!this._hasConflicts(candidate, allSessions, opts)) {
                    toMove.jour = under.day;
                    const dur = this._calculateDuration(toMove.heureDebut, toMove.heureFin);
                    over.totalHours -= dur;
                    under.totalHours += dur;
                }
            }
        });
    }

    // ====================================
    // HEURISTIQUE 3: CRÉNEAUX PRÉFÉRÉS
    // ====================================

    /**
     * Place les séances dans leurs créneaux préférés
     * @param {Array} sessions - Séances à optimiser
     * @param {Array} fixed - Séances fixes
     * @param {Object} opts - Options
     * @param {Map} coupledTP - TP couplés
     * @param {Set} processedCouples - Couples déjà traités
     */
    _preferredTimeSlots(sessions, fixed, opts, coupledTP = null, processedCouples = new Set()) {
        const allSessions = [...fixed, ...sessions];
        const maxEnd = opts.maxEndTime * 60;

        sessions.forEach(s => {
            const type = (s.type || '').toLowerCase();
            let preferredSlot = 'any';

            if (type.includes('cours') || type.includes('cm')) {
                preferredSlot = opts.cmSlot;
            } else if (type.includes('td')) {
                preferredSlot = opts.tdSlot;
            } else if (type.includes('tp')) {
                preferredSlot = opts.tpSlot;
            }

            if (preferredSlot === 'any') return;

            const currentStart = this._timeToMinutes(s.heureDebut);
            const duration = Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60);

            let targetStart;
            if (preferredSlot === 'morning') {
                targetStart = opts.maxStartTime * 60;
            } else if (preferredSlot === 'afternoon') {
                targetStart = 14 * 60;
            } else {
                targetStart = 18 * 60;
            }

            const targetEnd = targetStart + duration;

            if (targetEnd > maxEnd) return;

            const isInWrongSlot =
                (preferredSlot === 'morning' && currentStart >= 12 * 60) ||
                (preferredSlot === 'afternoon' && (currentStart < 12 * 60 || currentStart >= 18 * 60));

            if (!isInWrongSlot) return;

            // Vérifier si TP couplé
            if (coupledTP && coupledTP.has(s.id)) {
                const coupling = coupledTP.get(s.id);
                const coupleKey = `${Math.min(s.id, coupling.pairId)}-${Math.max(s.id, coupling.pairId)}`;

                if (processedCouples.has(coupleKey)) return;

                const result = this._moveCoupledTP(
                    s,
                    coupledTP,
                    allSessions,
                    s.jour,
                    targetStart,
                    opts
                );

                if (result.success) {
                    const partner = this._findTPPartner(s, coupledTP, sessions);
                    Object.assign(s, result.sessions[0]);
                    if (partner) Object.assign(partner, result.sessions[1]);
                    processedCouples.add(coupleKey);
                }
            } else {
                const candidate = {
                    ...s,
                    heureDebut: this._minutesToTime(targetStart),
                    heureFin: this._minutesToTime(targetEnd)
                };

                if (!this._hasConflicts(candidate, allSessions, opts)) {
                    s.heureDebut = candidate.heureDebut;
                    s.heureFin = candidate.heureFin;
                }
            }
        });
    }

    // ====================================
    // HEURISTIQUE 4: SUPPRESSION DES TROUS
    // ====================================

    /**
  * Supprime les trous dans l'emploi du temps
  * @param {Array} sessions - Séances à optimiser
  * @param {Array} fixed - Séances fixes
  * @param {Object} opts - Options
  * @param {Map} coupledTP - TP couplés
  * @param {Set} processedCouples - Couples déjà traités
  * @param {Map} coupleLocks - Verrous de couples
  */
    _removeGaps(sessions, fixed, opts, coupledTP = null, processedCouples = new Set(), coupleLocks = null) {
        const minBreak = opts.minBreak;

        const byDayGroup = {};
        sessions.forEach(s => {
            const key = `${s.jour}_${s.groupe || '__nogroup__'}`;
            if (!byDayGroup[key]) byDayGroup[key] = [];
            byDayGroup[key].push(s);
        });

        Object.values(byDayGroup).forEach(group => {
            group.sort((a, b) =>
                this._timeToMinutes(a.heureDebut) - this._timeToMinutes(b.heureDebut)
            );

            let currentTime = this._timeToMinutes(group[0].heureDebut);

            group.forEach(s => {
                // ✅ PROTECTION : Ne pas traiter individuellement un TP couplé
                if (coupledTP && coupledTP.has(s.id)) {
                    const coupling = coupledTP.get(s.id);

                    // Ne traiter QUE le premier du couple
                    if (coupling.position !== 'first') {
                        return; // ✅ SKIP le second, il sera traité avec le premier
                    }

                    const coupleKey = `${Math.min(s.id, coupling.pairId)}-${Math.max(s.id, coupling.pairId)}`;
                    if (processedCouples.has(coupleKey)) {
                        // ✅ Déjà traité, avancer le curseur
                        const partner = this._findTPPartner(s, coupledTP, sessions);
                        if (partner) {
                            currentTime = this._timeToMinutes(partner.heureFin) + minBreak;
                        }
                        return;
                    }

                    const partner = this._findTPPartner(s, coupledTP, sessions);
                    if (!partner) {
                        this._log('warning', `⚠️ TP couplé sans partenaire:  ${s.matiere}`);
                        return;
                    }

                    // ✅ Déplacer les DEUX TP ensemble
                    const result = this._moveCoupledTP(
                        s,
                        coupledTP,
                        [...fixed, ...sessions],
                        s.jour,
                        currentTime,
                        opts
                    );

                    if (result.success) {
                        // Synchroniser les deux originaux
                        const [tp1, tp2] = result.sessions;
                        const orig1 = sessions.find(x => x.id === tp1.id);
                        const orig2 = sessions.find(x => x.id === tp2.id);

                        if (orig1) Object.assign(orig1, tp1);
                        if (orig2) Object.assign(orig2, tp2);

                        processedCouples.add(coupleKey);

                        const totalDuration = this._timeToMinutes(tp2.heureFin) - currentTime;
                        currentTime += totalDuration + minBreak;
                    } else {
                        // Échec du déplacement, avancer au-delà du couple
                        currentTime = this._timeToMinutes(partner.heureFin) + minBreak;
                    }
                } else {
                    // Séance normale
                    const duration = Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60);

                    const candidate = {
                        ...s,
                        heureDebut: this._minutesToTime(currentTime),
                        heureFin: this._minutesToTime(currentTime + duration)
                    };

                    if (!this._hasConflicts(candidate, [...fixed, ...sessions], opts)) {
                        s.heureDebut = candidate.heureDebut;
                        s.heureFin = candidate.heureFin;
                        currentTime += duration + minBreak;
                    } else {
                        currentTime = this._timeToMinutes(s.heureFin) + minBreak;
                    }
                }
            });
        });
    }

    // ====================================
    // HEURISTIQUE 5: ÉQUILIBRAGE MATIN/APRÈS-MIDI
    // ====================================

    /**
     * Équilibre la distribution matin/après-midi
     * @param {Array} sessions - Séances à optimiser
     * @param {Array} fixed - Séances fixes
     * @param {Object} opts - Options
     * @param {Map} coupledTP - TP couplés
     * @param {Set} processedCouples - Couples déjà traités
     */
    _balanceSlotDistribution(sessions, fixed, opts, coupledTP = null, processedCouples = new Set()) {
        const days = [... new Set(sessions.map(s => s.jour))];

        const counts = {};
        days.forEach(d => {
            counts[d] = { morning: 0, afternoon: 0, evening: 0 };
        });

        sessions.forEach(s => {
            const start = this._timeToMinutes(s.heureDebut);
            const slot = start < 12 * 60 ? 'morning' : start < 18 * 60 ? 'afternoon' : 'evening';
            counts[s.jour][slot]++;
        });

        const total = { morning: 0, afternoon: 0, evening: 0 };
        days.forEach(d => {
            total.morning += counts[d].morning;
            total.afternoon += counts[d].afternoon;
            total.evening += counts[d].evening;
        });

        const target = {
            morning: Math.round(total.morning / days.length),
            afternoon: Math.round(total.afternoon / days.length),
            evening: Math.round(total.evening / days.length)
        };

        const imbalanced = days.filter(d =>
            Math.abs(counts[d].morning - target.morning) > 1 ||
            Math.abs(counts[d].afternoon - target.afternoon) > 1
        );

        imbalanced.forEach(day => {
            const daySessions = sessions.filter(s => s.jour === day);

            daySessions.forEach(s => {
                if (s.locked || s.fixed) return;

                const currentSlot = this._getSlotFromTime(s.heureDebut);
                const currentCount = counts[day][currentSlot];
                const targetCount = target[currentSlot];

                if (currentCount <= targetCount) return;

                const underloadedSlot = ['morning', 'afternoon', 'evening'].find(slot =>
                    counts[day][slot] < target[slot]
                );

                if (!underloadedSlot) return;

                let newStart;
                if (underloadedSlot === 'morning') newStart = opts.maxStartTime * 60;
                else if (underloadedSlot === 'afternoon') newStart = 14 * 60;
                else newStart = 18 * 60;

                // Vérifier si TP couplé
                if (coupledTP && coupledTP.has(s.id)) {
                    const coupling = coupledTP.get(s.id);
                    const coupleKey = `${Math.min(s.id, coupling.pairId)}-${Math.max(s.id, coupling.pairId)}`;

                    if (processedCouples.has(coupleKey)) return;

                    const result = this._moveCoupledTP(
                        s,
                        coupledTP,
                        [...fixed, ...sessions],
                        day,
                        newStart,
                        opts
                    );

                    if (result.success) {
                        const partner = this._findTPPartner(s, coupledTP, sessions);
                        Object.assign(s, result.sessions[0]);
                        if (partner) Object.assign(partner, result.sessions[1]);
                        processedCouples.add(coupleKey);

                        counts[day][currentSlot]--;
                        counts[day][underloadedSlot]++;
                    }
                } else {
                    const duration = Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60);
                    const candidate = {
                        ...s,
                        heureDebut: this._minutesToTime(newStart),
                        heureFin: this._minutesToTime(newStart + duration)
                    };

                    if (!this._hasConflicts(candidate, [...fixed, ...sessions], opts)) {
                        s.heureDebut = candidate.heureDebut;
                        s.heureFin = candidate.heureFin;
                        counts[day][currentSlot]--;
                        counts[day][underloadedSlot]++;
                    }
                }
            });
        });
    }

    // ====================================
    // RÉSOLUTION DE CONFLITS
    // ====================================

    /**
     * Résout les conflits en relocalisant les séances
     * @param {Array} sessions - Séances optimisées
     * @param {Array} fixed - Séances fixes
     * @param {Object} opts - Options
     * @param {Map} coupledTP - TP couplés
     * @returns {Array} Séances sans conflits
     */
    _resolveConflicts(sessions, fixed, opts, coupledTP = null) {
        const resolved = [];
        const allFixed = [...fixed];
        const processedIds = new Set();

        sessions.forEach(s => {
            if (processedIds.has(s.id)) return;

            if (this._hasConflicts(s, [...allFixed, ...resolved], opts)) {
                const relocated = this._relocateSession(s, [...allFixed, ...resolved], opts, coupledTP);

                resolved.push(relocated);
                processedIds.add(relocated.id);

                if (coupledTP && coupledTP.has(relocated.id)) {
                    const partner = this._findTPPartner(relocated, coupledTP, sessions);
                    if (partner) {
                        processedIds.add(partner.id);
                    }
                }
            } else {
                resolved.push(s);
                processedIds.add(s.id);
            }
        });

        return resolved;
    }

    /**
     * Relocalise une séance en conflit
     * @param {Object} session - Séance à relocaliser
     * @param {Array} fixed - Séances fixes
     * @param {Object} opts - Options
     * @param {Map} coupledTP - TP couplés
     * @returns {Object} Séance relocalisée
     */
    _relocateSession(session, fixed, opts, coupledTP = null) {
        const maxEnd = opts.maxEndTime * 60;
        const maxStart = opts.maxStartTime * 60;
        const duration = Math.round(this._calculateDuration(session.heureDebut, session.heureFin) * 60);
        const step = 15;

        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

        const isCoupled = coupledTP && coupledTP.has(session.id);

        for (const jour of days) {
            for (let start = maxStart; start + duration <= maxEnd; start += step) {
                if (isCoupled) {
                    const result = this._moveCoupledTP(
                        session,
                        coupledTP,
                        [...fixed, session],
                        jour,
                        start,
                        opts
                    );

                    if (result.success) {
                        this._log('debug', `✓ TP couplés relocalisés:  ${jour} ${this._minutesToTime(start)}`);
                        return result.sessions[0];
                    }
                } else {
                    const candidate = {
                        ...session,
                        jour,
                        heureDebut: this._minutesToTime(start),
                        heureFin: this._minutesToTime(start + duration)
                    };

                    if (!this._hasConflicts(candidate, fixed, opts)) {
                        this._log('debug', `✓ Session relocalisée: ${jour} ${candidate.heureDebut}`);
                        return candidate;
                    }
                }
            }
        }

        this._log('warning', `❌ Impossible de relocaliser:  ${session.matiere}`);
        return session;
    }

    // ====================================
    // DÉTECTION DE CONFLITS (OPTIMISÉE)
    // ====================================

    /**
     * Vérifie si une séance a des conflits
     * @param {Object} session - Séance à vérifier
     * @param {Array} otherSessions - Autres séances
     * @param {Object} opts - Options
     * @returns {boolean} True si conflit
     */
    _hasConflicts(session, otherSessions, opts) {
        for (const other of otherSessions) {
            if (!other || other.id === session.id) continue;
            if (other.jour !== session.jour) continue;

            if (!this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) {
                continue;
            }

            // Conflits de base
            if (session.salle && other.salle && session.salle === other.salle) return true;
            if (session.professeur && other.professeur && session.professeur === other.professeur) return true;
            if (session.groupe && other.groupe && session.groupe === other.groupe) return true;
        }

        // Vérification des contraintes enseignants
        if (opts.respectConstraints && !this._validateTeacherConstraints(session, opts)) {
            return true;
        }

        return false;
    }

    // ====================================
    // PHASE 3: VALIDATION
    // ====================================

    /**
 * Valide le résultat de l'optimisation
 * @param {Array} original - Séances originales
 * @param {Array} optimized - Séances optimisées
 * @param {Object} opts - Options
 * @param {Map} originalCoupledTP - TP couplés originaux
 * @returns {Object} { valid:  boolean, errors: [], repaired: boolean }
 */
    _validateResult(original, optimized, opts, originalCoupledTP = null) {
        const errors = [];
        let repaired = false;

        // Vérifier que toutes les séances sont présentes
        if (original.length !== optimized.length) {
            errors.push(`Nombre de séances différent: ${original.length} → ${optimized.length}`);
        }

        // Vérifier l'intégrité des séances verrouillées
        const lockedOriginal = original.filter(s => s.locked || s.fixed);
        const lockedOptimized = optimized.filter(s => s.locked || s.fixed);

        lockedOriginal.forEach(orig => {
            const opt = lockedOptimized.find(s => s.id === orig.id);
            if (!opt) {
                errors.push(`Séance verrouillée manquante: ${orig.matiere}`);
            } else if (opt.jour !== orig.jour || opt.heureDebut !== orig.heureDebut) {
                errors.push(`Séance verrouillée modifiée: ${orig.matiere}`);
            }
        });

        // Vérifier les conflits
        const conflicts = this._detectConflicts(optimized);
        if (conflicts.total > 0) {
            errors.push(`${conflicts.total} conflits détectés après optimisation`);
        }

        // ✅ VALIDATION + RÉPARATION DES TP COUPLÉS
        if (originalCoupledTP && originalCoupledTP.size > 0) {
            const violations = this._validateCoupledTP(optimized, originalCoupledTP);

            if (violations.length > 0) {
                this._log('warning', `⚠️ ${violations.length} TP couplés séparés détectés`);

                // Tenter une réparation automatique
                this._repairSeparatedCouples(optimized, originalCoupledTP);

                // Re-valider après réparation
                const newViolations = this._validateCoupledTP(optimized, originalCoupledTP);

                if (newViolations.length === 0) {
                    this._log('success', '✅ Tous les TP couplés ont été réparés');
                    repaired = true;
                } else {
                    newViolations.forEach(v => errors.push(v.message));
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            repaired
        };
    }

    // ====================================
    // PHASE 4: CONSTRUCTION DU RÉSULTAT
    // ====================================

    /**
     * Construit l'objet résultat
     * @param {Array} original - Séances originales
     * @param {Array} optimized - Séances optimisées
     * @param {Object} opts - Options
     * @returns {Object} Résultat complet
     */
    _buildResult(original, optimized, opts) {
        const currentStats = this._analyzeSchedule(original);
        const optimizedStats = this._analyzeSchedule(optimized);
        const improvement = this._calculateImprovement(currentStats, optimizedStats);

        return {
            success: true,
            dryRun: opts.dryRun,
            originalSeances: original,
            optimizedSeances: optimized,
            currentStats,
            optimizedStats,
            improvement,
            options: opts
        };
    }

    // ====================================
    // ANALYSE ET MÉTRIQUES
    // ====================================

    /**
     * Analyse un emploi du temps
     * @param {Array} sessions - Séances à analyser
     * @returns {Object} Statistiques
     */
    _analyzeSchedule(sessions) {
        const stats = {
            totalSessions: sessions.length,
            conflicts: this._detectConflicts(sessions),
            gaps: this._detectGaps(sessions),
            dailyLoad: this._calculateDailyLoad(sessions),
            subjectClustering: this._calculateSubjectClustering(sessions),
            timeSlotDistribution: this._analyzeTimeSlotDistribution(sessions)
        };

        stats.globalScore = this._calculateGlobalScore(stats);

        return stats;
    }

    /**
     * Détecte les conflits
     * @param {Array} sessions - Séances
     * @returns {Object} Conflits
     */
    _detectConflicts(sessions) {
        const conflicts = { rooms: [], teachers: [], groups: [], total: 0 };

        for (let i = 0; i < sessions.length; i++) {
            for (let j = i + 1; j < sessions.length; j++) {
                const s1 = sessions[i];
                const s2 = sessions[j];

                if (s1.jour !== s2.jour) continue;
                if (!this._timesOverlap(s1.heureDebut, s1.heureFin, s2.heureDebut, s2.heureFin)) continue;

                if (s1.salle && s2.salle && s1.salle === s2.salle) {
                    conflicts.rooms.push({ session1: s1, session2: s2 });
                    conflicts.total++;
                }

                if (s1.professeur && s2.professeur && s1.professeur === s2.professeur) {
                    conflicts.teachers.push({ session1: s1, session2: s2 });
                    conflicts.total++;
                }

                if (s1.groupe && s2.groupe && s1.groupe === s2.groupe) {
                    conflicts.groups.push({ session1: s1, session2: s2 });
                    conflicts.total++;
                }
            }
        }

        return conflicts;
    }

    /**
     * Détecte les trous
     * @param {Array} sessions - Séances
     * @returns {Array} Trous
     */
    _detectGaps(sessions) {
        const gaps = [];
        const byDayGroup = {};

        sessions.forEach(s => {
            const key = `${s.jour}_${s.groupe || '__nogroup__'}`;
            if (!byDayGroup[key]) byDayGroup[key] = [];
            byDayGroup[key].push(s);
        });

        Object.values(byDayGroup).forEach(group => {
            group.sort((a, b) => this._timeToMinutes(a.heureDebut) - this._timeToMinutes(b.heureDebut));

            for (let i = 0; i < group.length - 1; i++) {
                const gapMinutes = this._timeToMinutes(group[i + 1].heureDebut) - this._timeToMinutes(group[i].heureFin);

                if (gapMinutes > 30 && gapMinutes < 120) {
                    gaps.push({
                        day: group[i].jour,
                        group: group[i].groupe,
                        duration: gapMinutes
                    });
                }
            }
        });

        return gaps;
    }

    /**
     * Calcule la charge quotidienne
     * @param {Array} sessions - Séances
     * @returns {Object} Charge par jour/groupe
     */
    _calculateDailyLoad(sessions) {
        const load = {};

        sessions.forEach(s => {
            const key = `${s.jour}_${s.groupe || '__nogroup__'}`;
            if (!load[key]) {
                load[key] = {
                    day: s.jour,
                    group: s.groupe,
                    sessions: [],
                    totalHours: 0
                };
            }

            load[key].sessions.push(s);
            load[key].totalHours += this._calculateDuration(s.heureDebut, s.heureFin);
        });

        const hours = Object.values(load).map(l => l.totalHours);

        return {
            byDayGroup: load,
            average: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0,
            min: hours.length ? Math.min(...hours) : 0,
            max: hours.length ? Math.max(...hours) : 0,
            variance: this._calculateVariance(hours)
        };
    }

    /**
     * Calcule le score de regroupement par matière
     * @param {Array} sessions - Séances
     * @returns {number} Score (0-1)
     */
    _calculateSubjectClustering(sessions) {
        const bySubject = {};
        sessions.forEach(s => {
            if (!s.matiere) return;
            if (!bySubject[s.matiere]) bySubject[s.matiere] = new Set();
            bySubject[s.matiere].add(s.jour);
        });

        const scores = Object.values(bySubject).map(days => 1 / days.size);
        return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }

    /**
     * Analyse la distribution des créneaux
     * @param {Array} sessions - Séances
     * @returns {Object} Distribution
     */
    _analyzeTimeSlotDistribution(sessions) {
        const dist = { morning: 0, afternoon: 0, evening: 0 };

        sessions.forEach(s => {
            const start = this._timeToMinutes(s.heureDebut);
            if (start < 12 * 60) dist.morning++;
            else if (start < 18 * 60) dist.afternoon++;
            else dist.evening++;
        });

        return dist;
    }

    /**
     * Calcule un score global
     * @param {Object} stats - Statistiques
     * @returns {number} Score (0-100)
     */
    _calculateGlobalScore(stats) {
        let score = 100;

        // Pénalités
        score -= stats.conflicts.total * 10;
        score -= stats.gaps.length * 5;
        score -= stats.dailyLoad.variance * 2;

        // Bonus
        score += stats.subjectClustering * 20;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Calcule l'amélioration
     * @param {Object} before - Stats avant
     * @param {Object} after - Stats après
     * @returns {Object} Amélioration
     */
    _calculateImprovement(before, after) {
        return {
            score: (after.globalScore || 0) - (before.globalScore || 0),
            conflicts: before.conflicts.total - after.conflicts.total,
            gaps: before.gaps.length - after.gaps.length,
            variance: before.dailyLoad.variance - after.dailyLoad.variance,
            clustering: after.subjectClustering - before.subjectClustering
        };
    }

    /**
     * Calcule la variance
     * @param {Array} numbers - Nombres
     * @returns {number} Variance
     */
    _calculateVariance(numbers) {
        if (!numbers.length) return 0;
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        return numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
    }

    /**
     * Valide les contraintes enseignants
     * @param {Object} session - Séance
     * @param {Object} opts - Options
     * @returns {boolean} Valide
     */
    _validateTeacherConstraints(session, opts) {
        if (!opts.respectConstraints) return true;

        // TODO: Implémenter validation contraintes enseignants via TeacherConstraintParser
        return true;
    }

    /**
  * Récupère la filière d'une séance ou unité
  * @param {Object} sessionOrUnit - Séance ou unité
  * @returns {string|null} Nom de la filière
  */
    _getFiliereOfSession(sessionOrUnit) {
        if (!sessionOrUnit) return null;

        // Si c'est une unité TP couplé, utiliser tp1
        const session = sessionOrUnit.isAtomic ? sessionOrUnit.tp1 : sessionOrUnit;

        // Filière directe
        if (session.filiere) return session.filiere;

        // Via matiereGroupes
        const mat = session.matiere;
        if (!mat) return null;

        try {
            const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
            const entry = mg[mat];
            if (entry && entry.filiere) return entry.filiere;
        } catch (e) {
            this._log('debug', 'Error getting filiere:', e);
        }

        return null;
    }

    _getSlotFromTime(time) {
        const minutes = this._timeToMinutes(time);
        if (minutes < 12 * 60) return 'morning';
        if (minutes < 18 * 60) return 'afternoon';
        return 'evening';
    }

    _isTP(session) {
        const type = (session.type || '').toLowerCase();
        return type.includes('tp');
    }

    _timesOverlap(start1, end1, start2, end2) {
        const s1 = this._timeToMinutes(start1);
        const e1 = this._timeToMinutes(end1);
        const s2 = this._timeToMinutes(start2);
        const e2 = this._timeToMinutes(end2);
        return s1 < e2 && s2 < e1;
    }

    _timeToMinutes(time) {
        if (!time) return 0;
        const [h, m] = time.split(': ').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    _minutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    _calculateDuration(start, end) {
        return (this._timeToMinutes(end) - this._timeToMinutes(start)) / 60;
    }

    _cloneSessions(sessions) {
        return JSON.parse(JSON.stringify(sessions));
    }

    _rehydrateSessions(sessions) {
        return sessions.map(s => ({
            ...s,
            hasTeacher: function () {
                return ! !(this.enseignantsArray?.length || this.professeur || this.enseignant);
            }
        }));
    }

    _createBackup(label) {
        try {
            const BackupService = window.BackupService;
            if (BackupService?.createBackup) {
                BackupService.createBackup({ download: false, label });
            }
        } catch (error) {
            this._log('warning', 'Backup failed:', error.message);
        }
    }

    _notifyProgress(current, total, message) {
        this._progress = { current, total, message };

        try {
            const percent = Math.round((current / total) * 100);
            window.dispatchEvent(new CustomEvent('edt: optimization:progress', {
                detail: { current, total, percent, message }
            }));
        } catch { }

        this._log('info', `[${current}/${total}] ${message}`);
    }

    _log(level, ...args) {
        try {
            if (LogService?.[level]) {
                LogService[level](...args);
            } else {
                console[level === 'success' ? 'log' : level](...args);
            }
        } catch {
            console.log(...args);
        }
    }

    _error(message) {
        return {
            success: false,
            error: message,
            stats: null
        };
    }

    /**
     * Génère un rapport HTML
     */
    generateOptimizationReport(result) {
        if (!result?.success) {
            return '<div class="alert alert-danger">❌ Échec de l\'optimisation</div>';
        }

        const { currentStats, optimizedStats, improvement } = result;

        const fmt = (n) => Number.isFinite(n) ? n.toFixed(1) : '0.0';
        const pct = (n) => Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : '0%';

        return `
<div class="optimization-report">
    <h3>📊 Rapport d'Optimisation</h3>
    
    <div class="metric">
        <h4>Conflits</h4>
        <span class="before">${currentStats.conflicts.total}</span>
        <span class="arrow">→</span>
        <span class="after">${optimizedStats.conflicts.total}</span>
        <span class="improvement ${improvement.conflicts > 0 ? 'positive' : 'negative'}">
            (${improvement.conflicts > 0 ? '-' : '+'}${Math.abs(improvement.conflicts)})
        </span>
    </div>
    
    <div class="metric">
        <h4>Trous</h4>
        <span class="before">${currentStats.gaps.length}</span>
        <span class="arrow">→</span>
        <span class="after">${optimizedStats.gaps.length}</span>
        <span class="improvement ${improvement.gaps > 0 ? 'positive' : 'negative'}">
            (${improvement.gaps > 0 ? '-' : '+'}${Math.abs(improvement.gaps)})
        </span>
    </div>
    
    <div class="metric">
        <h4>Regroupement matières</h4>
        <span class="before">${pct(currentStats.subjectClustering)}</span>
        <span class="arrow">→</span>
        <span class="after">${pct(optimizedStats.subjectClustering)}</span>
        <span class="improvement ${improvement.clustering >= 0 ? 'positive' : 'negative'}">
            (${improvement.clustering >= 0 ? '+' : ''}${pct(improvement.clustering)})
        </span>
    </div>
</div>`;
    }
}

export default new ScheduleOptimizerService();