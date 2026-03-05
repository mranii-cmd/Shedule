/**
 * Service d'optimisation de l'emploi du temps - VERSION 2.0
 * Garantit la préservation des TP couplés via un système d'unités atomiques
 * 
 * @author Ibrahim Mrani - UCD
 * @modified mranii-cmd
 * @version 2.0
 * @date 2025-01-03
 */

import StateManager from '../controllers/StateManager.js';
import TeacherConstraintParser from './TeacherConstraintParser.js';
import LogService from './LogService.js';
import ConflictService from './ConflictService.js';

// ============================================================================
// CLASSE COUPLEDTPUNIT - UNITÉ ATOMIQUE POUR TP COUPLÉS
// ============================================================================

/**
 * Unité atomique représentant deux TP couplés
 * Cette classe garantit qu'un couple de TP ne peut jamais être séparé
 */
class CoupledTPUnit {
    constructor(tp1, tp2, coupling1, coupling2) {
        this.id = `couple_${tp1.id}_${tp2.id}`;
        this.tp1 = tp1;
        this.tp2 = tp2;
        this. coupling1 = coupling1;
        this.coupling2 = coupling2;
        
        // Propriétés communes
        this.matiere = tp1.matiere;
        this.groupe = tp1.groupe;
        this.jour = tp1.jour;
        this.type = 'TP_COUPLE';
        this.filiere = tp1.filiere;
        this.professeur = tp1.professeur;
        this.salle = tp1.salle;
        
        // Horaires globaux
        this.heureDebut = tp1.heureDebut;
        this.heureFin = tp2.heureFin;
        
        // Métadonnées
        this.isAtomic = true;
        this. locked = tp1.locked || tp2.locked;
        this.fixed = tp1.fixed || tp2.fixed;
    }
    
    /**
     * Met à jour les deux TP
     */
    update(jour, heureDebut1, heureFin1, heureDebut2, heureFin2) {
        this.jour = jour;
        this. tp1.jour = jour;
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
        const duration2 = Math.round(this._calcDuration(this. tp2.heureDebut, this.tp2.heureFin) * 60);
        
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
        if (! time) return 0;
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

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

class ScheduleOptimizerService {
    constructor() {
        this.DEFAULT_OPTIONS = {
            removeGaps: true,
            balanceLoad: true,
            groupSubjects: true,
            preferredSlots: true,
            loadTolerance: 0.3,
            minBreak: 15,
            maxEndTime: 18,
            maxStartTime: 8,
            respectExisting: true,
            respectConstraints: true,
            dryRun: false,
            processByFiliere: false,
            filiereOrder: null,
            balanceSlotDistribution: true,
            cmSlot: 'morning',
            tdSlot: 'afternoon',
            tpSlot: 'afternoon'
        };
        
        this. COUPLED_TP_CONFIG = {
            maxGapMinutes: 30,
            minDuration: 45,
            sameRoomRequired: false
        };
    }

    // ========================================================================
    // API PRINCIPALE
    // ========================================================================

    /**
     * Optimise l'emploi du temps
     * @param {Object} userOptions - Options personnalisées
     * @returns {Promise<Object>} Résultat de l'optimisation
     */
    async optimizeSchedule(userOptions = {}) {
        this._log('info', '[ScheduleOptimizer] ===== STARTING OPTIMIZATION =====');
        
        try {
            // 1. Validation et fusion des options
            const opts = this._validateOptions(userOptions);
            this._log('debug', '[ScheduleOptimizer] Options:', opts);
            
            // 2. Snapshot de l'état actuel
            const snapshot = this._createSnapshot();
            
            if (! snapshot. seances. length) {
                return {
                    success: false,
                    error: 'Aucune séance à optimiser',
                    stats: null
                };
            }
            
            this._log('info', `[ScheduleOptimizer] Total sessions: ${snapshot.seances.length}`);
            
            // 3. Analyse de l'état actuel
            const currentStats = this._analyzeSchedule(snapshot. seances);
            this._log('debug', '[ScheduleOptimizer] Current stats:', currentStats);
            
            // 4. Préparation du contexte d'optimisation
            const context = this._prepareContext(snapshot, opts);
            this._log('info', `[ScheduleOptimizer] TP couplés détectés: ${context.coupledTP.size / 2} paires`);
            
            // 5. Optimisation (par filière ou globale)
            let optimizedSeances;
            
            if (opts. processByFiliere) {
                optimizedSeances = await this._optimizeByFiliere(context, opts);
            } else {
                optimizedSeances = await this._optimizeGlobal(context, opts);
            }
            
            // 6. Analyse du résultat
            const optimizedStats = this._analyzeSchedule(optimizedSeances);
            this._log('debug', '[ScheduleOptimizer] Optimized stats:', optimizedStats);
            
            // 7. Validation finale
            const validation = this._validateResult(
                snapshot.seances,
                optimizedSeances,
                opts,
                context. coupledTP
            );
            
            if (!validation.valid) {
                this._log('error', '[ScheduleOptimizer] Validation failed:', validation.errors);
            }

            // 8. Construction du résultat
            // Note: _buildResult historically returned success:true unconditionally.
            // We build the result then attach validation info and set success based on validation.
            const result = this._buildResult(
                snapshot.seances,
                optimizedSeances,
                currentStats,
                optimizedStats,
                opts,
                validation
            );

            // Attach validation metadata and defensive success flag
            try {
                result.validation = validation;
                // If validation failed, mark success = false and provide a short debug snippet
                if (!validation.valid) {
                    result.success = false;
                    result.error = result.error || 'Validation failed after optimization';
                    result.debug = Object.assign({}, result.debug || {}, { validationErrors: validation.errors.slice(0, 20) });
                } else {
                    result.success = true;
                }
            } catch (e) {
                // never let debug metadata break the result
                this._log('debug', 'Failed to attach validation metadata', e);
            }
            
            if (opts.dryRun) {
                this._log('info', '[ScheduleOptimizer] Dry-run completed, no state changed.');
            } else {
                this._log('info', '[ScheduleOptimizer] Optimization ready (call applyOptimizedSchedule to apply)');
            }
            
            return result;
              // --- DEBUG: expose result in browser for easier debugging (dev only) ---
            try {
                if (typeof window !== 'undefined') {
                    // shallow-safe stringify: replace functions with marker
                    try {
                        window.__lastOptimizationResult = JSON.parse(JSON.stringify(result, (k, v) => {
                            if (typeof v === 'function') return '[Function]';
                            return v;
                        }));
                    } catch (e) {
                        // fallback: store a minimal summary if full stringify fails
                        window.__lastOptimizationResult = {
                            success: !!(result && result.success),
                            error: result && (result.error || result.message),
                            validation: result && result.validation,
                            optimizedSeancesLength: Array.isArray(result && result.optimizedSeances) ? result.optimizedSeances.length : null
                        };
                    }
                    window.__lastOptimizationResultAt = new Date().toISOString();
                }
            } catch (e) {
                this._log('debug', 'Failed to set window.__lastOptimizationResult', e);
            }

            // If validation failed, log the validation errors for easier diagnosis
            try {
                if (result && result.validation && Array.isArray(result.validation.errors) && result.validation.errors.length) {
                    this._log('error', '[ScheduleOptimizer] Validation errors:', result.validation.errors.slice(0, 20));
                }
            } catch (e) { /* ignore */ }

            return result;
        } catch (err) {
            this._log('error', '[ScheduleOptimizer] Optimization failed:', err);
            return {
                success: false,
                error: err.message || String(err),
                stats: null
            };
        }
    }

    /**
     * Applique le résultat de l'optimisation
     * @param {Object} optimizedResult - Résultat de optimizeSchedule()
     * @param {Object} opts - Options
     * @returns {boolean} Succès
     */
    applyOptimizedSchedule(optimizedResult, opts = {}) {
        opts = Object.assign({ saveBackup: true, backupLabel: 'Pre-optimization backup' }, opts);
        
        if (! optimizedResult || !optimizedResult.success || !Array.isArray(optimizedResult. optimizedSeances)) {
            this._log('error', 'applyOptimizedSchedule: invalid optimized result');
            return false;
        }
        
        try {
            // Backup optionnel
            if (opts. saveBackup) {
                this._createBackup(opts.backupLabel);
            }
            
            // Cloner et réhydrater les séances
            const cloned = this._cloneSessions(optimizedResult.optimizedSeances);
            const rehydrated = this._rehydrateSessions(cloned);
            
            // Appliquer l'état
            if (! StateManager.state) StateManager.state = {};
            StateManager.state.seances = rehydrated;
            
            if (typeof StateManager.saveState === 'function') {
                StateManager.saveState();
            }
            
            try {
                StateManager.notify && StateManager.notify('schedule: optimized', { result: optimizedResult });
            } catch (e) {
                this._log('debug', 'Notification failed:', e);
            }
            
            this._log('success', 'applyOptimizedSchedule: optimized schedule applied and state saved');
            return true;
            
        } catch (err) {
            this._log('error', 'applyOptimizedSchedule failed:', err);
            return false;
        }
    }

    // ========================================================================
    // PRÉPARATION ET CONTEXTE
    // ========================================================================

    /**
     * Valide et fusionne les options utilisateur
     */
    _validateOptions(userOptions) {
        const opts = Object.assign({}, this.DEFAULT_OPTIONS, userOptions);
        
        // Validation des bornes
        opts.maxEndTime = Math.max(14, Math.min(22, Number(opts.maxEndTime) || 18));
        opts.maxStartTime = Math.max(7, Math.min(12, Number(opts.maxStartTime) || 8));
        opts.minBreak = Math.max(0, Math.min(60, Number(opts.minBreak) || 15));
        opts.loadTolerance = Math.max(0, Math.min(1, Number(opts.loadTolerance) || 0.3));
        
        return opts;
    }

    /**
     * Crée un snapshot de l'état actuel
     */
    _createSnapshot() {
        const seances = Array.isArray(StateManager?. state?.seances) 
            ? this._cloneSessions(StateManager.state.seances) 
            : [];
        
        return {
            seances,
            matiereGroupes: StateManager?. state?.matiereGroupes || {},
            sallesInfo: StateManager?.state?.sallesInfo || {},
            enseignantSouhaits: StateManager?.state?. enseignantSouhaits || {},
            filieres: StateManager?.state?.filieres || []
        };
    }

    /**
     * Prépare le contexte d'optimisation
     */
    _prepareContext(snapshot, opts) {
        const seances = snapshot.seances;
        
        // Détecter les TP couplés
        const coupledTP = this._detectCoupledTP(seances);
        
        // Séparer séances verrouillées et mobiles
        const locked = seances.filter(s => s.locked || s.fixed);
        const mobile = seances.filter(s => !(s.locked || s.fixed));
        
        // Grouper par filière
        const byFiliere = {};
        seances.forEach(s => {
            const filiere = this._getFiliereOfSession(s) || '__nofiliere__';
            if (!byFiliere[filiere]) byFiliere[filiere] = [];
            byFiliere[filiere]. push(s);
        });
        
        return {
            sessions: seances,
            locked,
            mobile,
            coupledTP,
            byFiliere,
            sallesInfo: snapshot.sallesInfo,
            matiereGroupes: snapshot.matiereGroupes
        };
    }

    // ========================================================================
    // GESTION DES UNITÉS ATOMIQUES
    // ========================================================================

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
                const unit = new CoupledTPUnit(s, partner, coupling, coupledTP. get(partner.id));
                units.push(unit);
                
                processedIds.add(s.id);
                processedIds.add(partner. id);
                
                this._log('debug', `🔗 Unité TP créée: ${unit.matiere} (${unit.groupe})`);
            } else {
                // Séance simple
                units.push(s);
                processedIds.add(s.id);
            }
        });
        
        this._log('debug', `📦 ${units.length} unités créées (dont ${units.filter(u => u.isAtomic).length} TP couplés)`);
        
        return units;
    }

    /**
     * Convertit les unités en séances
     * @param {Array} units - Unités
     * @returns {Array} Séances
     */
    _convertFromUnits(units) {
        const sessions = [];
        
        units. forEach(unit => {
            if (unit.isAtomic) {
                // Unité TP couplé -> extraire les deux séances
                sessions.push(... unit.toSessions());
            } else {
                // Séance simple
                sessions.push(unit);
            }
        });
        
        return sessions;
    }

    // ========================================================================
    // DÉTECTION ET GESTION DES TP COUPLÉS
    // ========================================================================

    /**
     * Détecte les TP couplés dans une liste de séances
     * @param {Array} sessions - Séances
     * @returns {Map} Map des couplages (sessionId -> coupling info)
     */
    _detectCoupledTP(sessions) {
        const couples = new Map();
        const processed = new Set();
        
        const tpSessions = sessions.filter(s => this._isTP(s));
        
        for (let i = 0; i < tpSessions.length; i++) {
            if (processed.has(tpSessions[i].id)) continue;
            
            for (let j = i + 1; j < tpSessions. length; j++) {
                if (processed.has(tpSessions[j].id)) continue;
                
                if (this._areTPCoupled(tpSessions[i], tpSessions[j])) {
                    const tp1 = tpSessions[i];
                    const tp2 = tpSessions[j];
                    
                    couples.set(tp1.id, {
                        pairId: tp2.id,
                        position: 'first',
                        matiere: tp1.matiere,
                        groupe: tp1.groupe,
                        filiere: this._getFiliereOfSession(tp1)
                    });
                    
                    couples.set(tp2.id, {
                        pairId: tp1.id,
                        position: 'second',
                        matiere: tp2.matiere,
                        groupe: tp2.groupe,
                        filiere: this._getFiliereOfSession(tp2)
                    });
                    
                    processed.add(tp1.id);
                    processed.add(tp2.id);
                    
                    this._log('debug', `🔗 TP couplés détectés: ${tp1.matiere} (${tp1.groupe}) - ${tp1.jour} ${tp1.heureDebut}-${tp2.heureFin}`);
                    break;
                }
            }
        }
        
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
        
        // Vérifier que les durées sont similaires (±15 min)
        const durationDiff = Math.abs(duration1 - duration2);
        if (durationDiff > 0.25) return false; // Max 15 min de différence
        
        // Optionnel :  même salle
        if (this. COUPLED_TP_CONFIG. sameRoomRequired) {
            const s1 = (tp1.salle || '').toString().trim();
            const s2 = (tp2.salle || '').toString().trim();
            if (s1 && s2 && s1 !== s2) return false;
        }
        
        return true;
    }

    /**
     * Trouve le partenaire d'un TP couplé
     */
    _findTPPartner(session, couples, allSessions) {
        if (!couples || ! couples.has(session.id)) return null;
        const coupling = couples.get(session. id);
        return allSessions.find(s => s.id === coupling.pairId);
    }

    /**
     * Déplace un couple de TP atomiquement
     */
    _moveCoupledTP(session, couples, allSessions, targetJour, targetStartMinutes, opts) {
        const partner = this._findTPPartner(session, couples, allSessions);
        
        if (!partner) {
            return { success: false, sessions: [session] };
        }
        
        const coupling = couples.get(session.id);
        const isFirst = coupling.position === 'first';
        
        const tp1 = isFirst ? session : partner;
        const tp2 = isFirst ?  partner : session;
        
        const duration1 = Math.round(this._calculateDuration(tp1.heureDebut, tp1.heureFin) * 60);
        const duration2 = Math.round(this._calculateDuration(tp2.heureDebut, tp2.heureFin) * 60);
        const gap = 15;
        
        const start1 = targetStartMinutes;
        const end1 = start1 + duration1;
        const start2 = end1 + gap;
        const end2 = start2 + duration2;
        
        const candidate1 = {
            ... tp1,
            jour: targetJour,
            heureDebut: this._minutesToTime(start1),
            heureFin: this._minutesToTime(end1)
        };
        
        const candidate2 = {
            ... tp2,
            jour: targetJour,
            heureDebut: this._minutesToTime(start2),
            heureFin: this._minutesToTime(end2)
        };
        
        // Vérifier les conflits pour les deux
        const otherSessions = allSessions.filter(s => s.id !== tp1.id && s.id !== tp2.id);
        
        if (this._hasConflicts(candidate1, otherSessions, opts) || 
            this._hasConflicts(candidate2, otherSessions, opts)) {
            return { success: false, sessions: [tp1, tp2] };
        }
        
        return { success: true, sessions: [candidate1, candidate2] };
    }

    /**
     * Valide que les TP couplés sont préservés
     */
    _validateCoupledTP(sessions, originalCouples) {
        const violations = [];
        
        originalCouples.forEach((coupling, sessionId) => {
            if (coupling.position !== 'first') return;
            
            const s1 = sessions.find(s => s.id === sessionId);
            const s2 = sessions.find(s => s.id === coupling.pairId);
            
            if (!s1 || !s2) {
                violations.push({
                    message: `TP couplé manquant:  ${coupling.matiere} (${coupling. groupe})`,
                    sessionId,
                    type: 'missing'
                });
                return;
            }
            
            if (s1.jour !== s2.jour) {
                violations. push({
                    message: `TP couplés séparés (jours différents): ${coupling.matiere} (${coupling.groupe}) - ${s1.jour} vs ${s2.jour}`,
                    sessionId,
                    type: 'day_mismatch'
                });
            }
            
            const end1 = this._timeToMinutes(s1.heureFin);
            const start2 = this._timeToMinutes(s2.heureDebut);
            const gap = start2 - end1;
            
            if (gap < 0 || gap > 30) {
                violations.push({
                    message: `TP couplés séparés (gap invalide): ${coupling.matiere} (${coupling.groupe}) - gap:  ${gap} min`,
                    sessionId,
                    type: 'gap_invalid',
                    gap
                });
            }
        });
        
        return violations;
    }

    /**
     * Répare les TP couplés séparés
     */
    _repairSeparatedCouples(sessions, originalCouples) {
        this._log('warning', '🔧 Tentative de réparation des TP couplés séparés.. .');
        
        originalCouples.forEach((coupling, sessionId) => {
            if (coupling.position !== 'first') return;
            
            const s1 = sessions.find(s => s.id === sessionId);
            const s2 = sessions.find(s => s. id === coupling.pairId);
            
            if (!s1 || !s2) return;
            
            // Vérifier s'ils sont séparés
            if (s1.jour !== s2.jour || ! this._areTPCoupled(s1, s2)) {
                this._log('warning', `⚠️ Réparation nécessaire: ${s1.matiere} (${s1.groupe})`);
                
                // Forcer le second à suivre le premier
                const duration1 = Math.round(this._calculateDuration(s1.heureDebut, s1.heureFin) * 60);
                const duration2 = Math.round(this._calculateDuration(s2.heureDebut, s2.heureFin) * 60);
                const gap = 15;
                
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

    // ========================================================================
    // OPTIMISATION PRINCIPALE
    // ========================================================================

    /**
     * Optimise par filière (séquentiel) - VERSION UNITÉS
     */
    async _optimizeByFiliere(context, opts) {
        this._log('info', '📚 Optimisation par filière (mode UNITÉS)');
        
        const filieres = Object.keys(context.byFiliere);
        
        // Ordre de traitement
        let orderedFilieres = filieres;
        if (Array.isArray(opts.filiereOrder)) {
            const custom = opts.filiereOrder. filter(f => filieres.includes(f));
            const remaining = filieres.filter(f => !custom.includes(f));
            orderedFilieres = [... custom, ...remaining];
        } else {
            orderedFilieres. sort((a, b) => 
                context.byFiliere[b].length - context.byFiliere[a].length
            );
        }
        
        this._log('debug', 'Ordre des filières:', orderedFilieres);
        
        // Séparer les TP couplés par filière
        const coupledTP = context.coupledTP;
        const coupledByFiliere = new Map();
        
        if (coupledTP && coupledTP.size > 0) {
            coupledTP.forEach((coupling, sessionId) => {
                if (coupling.position !== 'first') return;
                
                const filiere = coupling.filiere || '__nofiliere__';
                
                if (!coupledByFiliere.has(filiere)) {
                    coupledByFiliere.set(filiere, new Map());
                }
                
                const filiereMap = coupledByFiliere. get(filiere);
                filiereMap.set(sessionId, coupling);
                filiereMap.set(coupling. pairId, coupledTP.get(coupling. pairId));
            });
        }
        
        const placed = [];
        const totalSteps = orderedFilieres. length;
        let currentStep = 0;
        
        for (const filiere of orderedFilieres) {
            this._notifyProgress(++currentStep, totalSteps, `Optimisation ${filiere}...`);
            
            const sessions = this._cloneSessions(context.byFiliere[filiere]);
            
            if (sessions.length === 0) {
                this._log('debug', `Filière ${filiere} vide, skip`);
                continue;
            }
            
            this._log('info', `\n📂 Traitement filière:  ${filiere} (${sessions.length} séances)`);
            
            const locked = sessions.filter(s => s.locked || s.fixed);
            const mobile = sessions.filter(s => !(s.locked || s.fixed));
            
            this._log('debug', `  - Verrouillées: ${locked. length}`);
            this._log('debug', `  - Mobiles: ${mobile.length}`);
            
            const filiereCoupledTP = coupledByFiliere.get(filiere) || new Map();
            
            if (filiereCoupledTP.size > 0) {
                this._log('info', `  🔗 ${filiereCoupledTP.size / 2} paires de TP couplés dans cette filière`);
            }
            
            // Conversion en unités
            const mobileUnits = this._convertToUnits(mobile, filiereCoupledTP);
            const lockedUnits = this._convertToUnits(locked, filiereCoupledTP);
            const placedUnits = this._convertToUnits(placed, coupledTP);
            
            this._log('debug', `  📦 ${mobileUnits.length} unités mobiles (${mobileUnits.filter(u => u.isAtomic).length} TP couplés)`);
            
            // Optimisation
            const optimizedUnits = this._applyHeuristicsUnits(
                mobileUnits, 
                [... lockedUnits, ...placedUnits], 
                opts
            );
            
            // Résolution des conflits
            const resolvedUnits = this._resolveConflictsUnits(
                optimizedUnits, 
                [... lockedUnits, ...placedUnits], 
                opts
            );
            
            // Conversion en séances
            const resolvedSessions = this._convertFromUnits(resolvedUnits);
            const lockedSessions = this._convertFromUnits(lockedUnits);
            
            // Validation
            if (filiereCoupledTP.size > 0) {
                const violations = this._validateCoupledTP(resolvedSessions, filiereCoupledTP);
                
                if (violations.length > 0) {
                    this._log('error', `  ❌ ${violations.length} TP couplés séparés dans ${filiere}! `);
                    violations.forEach(v => this._log('error', `     ${v.message}`));
                    
                    this._repairSeparatedCouples(resolvedSessions, filiereCoupledTP);
                    
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
            
            placed.push(... lockedSessions, ...resolvedSessions);
            
            this._log('info', `  ✓ Filière ${filiere} terminée (${placed.length} séances au total)\n`);
        }
        
        this._notifyProgress(totalSteps, totalSteps, 'Optimisation par filière terminée');
        
        // Validation globale finale
        if (coupledTP && coupledTP.size > 0) {
            this._log('info', '\n🔍 Validation globale des TP couplés.. .');
            const globalViolations = this._validateCoupledTP(placed, coupledTP);
            
            if (globalViolations.length > 0) {
                this._log('error', `❌ ${globalViolations. length} TP couplés séparés au niveau global!`);
                globalViolations.forEach(v => this._log('error', v.message));
                
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

    /**
     * Optimise toutes les séances ensemble - VERSION UNITÉS
     */
    async _optimizeGlobal(context, opts) {
        this._log('info', '🌍 Optimisation globale (mode UNITÉS)');
        
        const { locked, mobile, coupledTP } = context;
        
        this._notifyProgress(0, 1, 'Optimisation globale...');
        
        // Conversion en unités
        const mobileUnits = this._convertToUnits(mobile, coupledTP);
        const lockedUnits = this._convertToUnits(locked, coupledTP);
        
        // Appliquer les heuristiques
        const optimizedUnits = this._applyHeuristicsUnits(mobileUnits, lockedUnits, opts);
        
        // Résoudre les conflits
        const resolvedUnits = this._resolveConflictsUnits(optimizedUnits, lockedUnits, opts);
        
        // Conversion en séances
        const resolved = this._convertFromUnits(resolvedUnits);
        const lockedSessions = this._convertFromUnits(lockedUnits);
        
        // Validation
        if (coupledTP && coupledTP.size > 0) {
            const violations = this._validateCoupledTP(resolved, coupledTP);
            
            if (violations. length > 0) {
                this._log('error', `❌ ${violations.length} TP couplés séparés! `);
                violations.forEach(v => this._log('error', v.message));
                
                this._repairSeparatedCouples(resolved, coupledTP);
                
                const newViolations = this._validateCoupledTP(resolved, coupledTP);
                if (newViolations.length === 0) {
                    this._log('success', '✅ Réparation réussie');
                }
            } else {
                this._log('success', '✅ Tous les TP couplés préservés');
            }
        }
        
        this._notifyProgress(1, 1, 'Optimisation globale terminée');
        
        return [... lockedSessions, ...resolved];
    }

    // ========================================================================
    // APPLICATION DES HEURISTIQUES
    // ========================================================================

    /**
     * Applique les heuristiques (VERSION SÉANCES - convertit en unités)
     */
    _applyHeuristics(sessions, fixed, opts, coupledTP = null) {
        const units = this._convertToUnits(sessions, coupledTP);
        const fixedUnits = this._convertToUnits(fixed, coupledTP);
        
        this._log('info', `📦 Travail sur ${units.length} unités (${units.filter(u => u.isAtomic).length} TP couplés)`);
        
        const optimizedUnits = this._applyHeuristicsUnits(units, fixedUnits, opts);
        
        const result = this._convertFromUnits(optimizedUnits);
        
        if (coupledTP && coupledTP.size > 0) {
            const violations = this._validateCoupledTP(result, coupledTP);
            if (violations.length > 0) {
                this._log('error', `❌ ${violations.length} TP couplés séparés après heuristiques!`);
                violations.forEach(v => this._log('error', v.message));
            } else {
                this._log('success', `✅ Tous les TP couplés préservés`);
            }
        }
        
        return result;
    }

    /**
     * Applique les heuristiques sur des unités déjà converties
     */
    _applyHeuristicsUnits(units, fixedUnits, opts) {
        // Cloner pour éviter les modifications
        let working = units.map(u => {
            if (u.isAtomic) {
                const clone = Object.assign(Object.create(Object.getPrototypeOf(u)), u);
                clone.tp1 = { ...u.tp1 };
                clone.tp2 = { ...u.tp2 };
                return clone;
            } else {
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

    // ========================================================================
    // HELPERS POUR UNITÉS
    // ========================================================================

    /**
     * Crée une unité candidate (déplacée)
     */
    _createCandidateUnit(unit, jour, heureDebut) {
        if (unit.isAtomic) {
            const startMinutes = this._timeToMinutes(heureDebut);
            const clone = Object.assign(Object.create(Object.getPrototypeOf(unit)), unit);
            clone.moveTo(jour, startMinutes);
            return clone;
        } else {
            return { ...unit, jour, heureDebut };
        }
    }

    /**
     * Applique les changements d'une candidate à l'unité originale
     */
    _applyUnitChange(unit, candidate) {
        if (unit.isAtomic && candidate.isAtomic) {
            unit.jour = candidate.jour;
            unit.heureDebut = candidate. heureDebut;
            unit.heureFin = candidate.heureFin;
            
            unit.tp1.jour = candidate.tp1.jour;
            unit.tp1.heureDebut = candidate.tp1.heureDebut;
            unit.tp1.heureFin = candidate.tp1.heureFin;
            
            unit.tp2.jour = candidate.tp2.jour;
            unit.tp2.heureDebut = candidate.tp2.heureDebut;
            unit.tp2.heureFin = candidate.tp2.heureFin;
        } else {
            Object.assign(unit, candidate);
        }
    }

    /**
     * Vérifie les conflits pour une unité
     */
    _hasConflictsUnit(unit, otherUnits, opts) {
        for (const other of otherUnits) {
            if (! other || other.id === unit.id) continue;
            if (other.jour !== unit.jour) continue;
            
            if (! this._timesOverlap(unit.heureDebut, unit.heureFin, other. heureDebut, other.heureFin)) {
                continue;
            }
            
            if (unit.salle && other.salle && unit.salle === other.salle) return true;
            if (unit. professeur && other.professeur && unit.professeur === other.professeur) return true;
            if (unit.groupe && other.groupe && unit.groupe === other.groupe) return true;
        }
        
        return false;
    }

    // ========================================================================
    // HEURISTIQUES SUR UNITÉS
    // ========================================================================

    /**
     * Regroupe par matière (version UNITÉS)
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
            
            const dayCount = {};
            list.forEach(u => {
                dayCount[u.jour] = (dayCount[u.jour] || 0) + 1;
            });
            
            const targetDay = Object.keys(dayCount).reduce((a, b) => 
                dayCount[a] > dayCount[b] ? a :  b
            );
            
            this._log('debug', `Regroupement ${matiere} → ${targetDay}`);
            
            list.forEach(u => {
                if (u.jour === targetDay) return;
                if (u.locked || u.fixed) return;
                
                const candidate = this._createCandidateUnit(u, targetDay, u.heureDebut);
                
                if (! this._hasConflictsUnit(candidate, [... fixedUnits, ...units], opts)) {
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
            byDayGroup[key]. push(u);
        });
        
        Object.values(byDayGroup).forEach(group => {
            group.sort((a, b) => 
                this._timeToMinutes(a.heureDebut) - this._timeToMinutes(b.heureDebut)
            );
            
            let currentTime = this._timeToMinutes(group[0].heureDebut);
            
            group.forEach(u => {
                if (u.locked || u.fixed) {
                    currentTime = this._timeToMinutes(u. heureFin) + minBreak;
                    return;
                }
                
                const candidate = this._createCandidateUnit(u, u.jour, this._minutesToTime(currentTime));
                
                if (!this._hasConflictsUnit(candidate, [... fixedUnits, ...units], opts)) {
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
        const loads = {};
        [... fixedUnits, ...units].forEach(u => {
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
            loads[key].totalHours += this._calculateDuration(u. heureDebut, u.heureFin);
        });
        
        const loadArray = Object.values(loads);
        const avgLoad = loadArray.reduce((sum, l) => sum + l.totalHours, 0) / loadArray.length;
        const threshold = avgLoad * (opts.loadTolerance - 1);
        
        const overloaded = loadArray.filter(l => l.totalHours > avgLoad + threshold);
        const underloaded = loadArray.filter(l => l.totalHours < avgLoad - threshold);
        
        overloaded.forEach(over => {
            const under = underloaded.find(u => u.group === over.group);
            if (! under) return;
            
            const toMove = over.units.find(u => units.includes(u) && ! u.locked && !u.fixed);
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
            
            if (type. includes('cours') || type.includes('cm')) {
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
            
            const duration = Math.round(this._calculateDuration(u.heureDebut, u. heureFin) * 60);
            
            if (targetStart + duration > maxEnd) return;
            
            const isInWrongSlot = 
                (preferredSlot === 'morning' && currentStart >= 12 * 60) ||
                (preferredSlot === 'afternoon' && (currentStart < 12 * 60 || currentStart >= 18 * 60));
            
            if (! isInWrongSlot) return;
            
            const candidate = this._createCandidateUnit(u, u.jour, this._minutesToTime(targetStart));
            
            if (!this._hasConflictsUnit(candidate, [...fixedUnits, ... units], opts)) {
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
            const slot = start < 12 * 60 ?  'morning' : start < 18 * 60 ? 'afternoon' : 'evening';
            counts[u.jour][slot]++;
        });
        
        const total = { morning: 0, afternoon: 0, evening: 0 };
        days.forEach(d => {
            total. morning += counts[d].morning;
            total.afternoon += counts[d].afternoon;
            total. evening += counts[d].evening;
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
                
                if (! underloadedSlot) return;
                
                const toMove = units.find(u => 
                    u.jour === day && 
                    ! u.locked && 
                    !u.fixed &&
                    this._getSlotFromTime(u.heureDebut) === currentSlot
                );
                
                if (!toMove) return;
                
                let newStart;
                if (underloadedSlot === 'morning') newStart = opts.maxStartTime * 60;
                else if (underloadedSlot === 'afternoon') newStart = 14 * 60;
                else newStart = 18 * 60;
                
                const candidate = this._createCandidateUnit(toMove, day, this._minutesToTime(newStart));
                
                if (!this._hasConflictsUnit(candidate, [...fixedUnits, ... units], opts)) {
                    this._applyUnitChange(toMove, candidate);
                    counts[day][currentSlot]--;
                    counts[day][underloadedSlot]++;
                }
            });
        });
    }

    // ========================================================================
    // RÉSOLUTION DE CONFLITS
    // ========================================================================

    /**
     * Résout les conflits (VERSION SÉANCES)
     */
    _resolveConflicts(sessions, fixed, opts, coupledTP = null) {
        const resolved = [];
        const allFixed = [...fixed];
        const processedIds = new Set();
        
        sessions.forEach(s => {
            if (processedIds.has(s.id)) return;
            
            if (this._hasConflicts(s, [... allFixed, ...resolved], opts)) {
                const relocated = this._relocateSession(s, [... allFixed, ...resolved], opts, coupledTP);
                
                resolved.push(relocated);
                processedIds. add(relocated.id);
                
                if (coupledTP && coupledTP.has(relocated.id)) {
                    const partner = this._findTPPartner(relocated, coupledTP, sessions);
                    if (partner) {
                        processedIds.add(partner.id);
                    }
                }
            } else {
                resolved.push(s);
                processedIds.add(s. id);
            }
        });
        
        return resolved;
    }

    /**
     * Résout les conflits (VERSION UNITÉS)
     */
    _resolveConflictsUnits(units, fixedUnits, opts) {
        const resolved = [];
        const allFixed = [... fixedUnits];
        
        units.forEach(u => {
            if (this._hasConflictsUnit(u, [...allFixed, ...resolved], opts)) {
                this._log('debug', `    ⚠️ Conflit détecté:  ${u.matiere} (${u.groupe || 'N/A'})`);
                
                const relocated = this._relocateUnit(u, [...allFixed, ...resolved], opts);
                
                if (relocated) {
                    resolved.push(relocated);
                    this._log('debug', `    ✓ Relocalisé: ${relocated.jour} ${relocated.heureDebut}`);
                } else {
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
     * Relocalise une séance en conflit (VERSION SÉANCES)
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
                        [... fixed, session],
                        jour,
                        start,
                        opts
                    );
                    
                    if (result.success) {
                        this._log('debug', `✓ TP couplés relocalisés: ${jour} ${this._minutesToTime(start)}`);
                        return result.sessions[0];
                    }
                } else {
                    const candidate = {
                        ... session,
                        jour,
                        heureDebut: this._minutesToTime(start),
                        heureFin: this._minutesToTime(start + duration)
                    };
                    
                    if (! this._hasConflicts(candidate, fixed, opts)) {
                        this._log('debug', `✓ Session relocalisée: ${jour} ${candidate.heureDebut}`);
                        return candidate;
                    }
                }
            }
        }
        
        this._log('warning', `❌ Impossible de relocaliser:  ${session.matiere}`);
        return session;
    }

    /**
     * Relocalise une unité en conflit (VERSION UNITÉS)
     */
    _relocateUnit(unit, fixedUnits, opts) {
        const maxEnd = opts.maxEndTime * 60;
        const maxStart = opts.maxStartTime * 60;
        const duration = Math.round(this._calculateDuration(unit.heureDebut, unit.heureFin) * 60);
        const step = 15;
        
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        
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

    // ========================================================================
    // DÉTECTION DE CONFLITS
    // ========================================================================

    /**
     * Vérifie les conflits pour une séance
     */
    _hasConflicts(session, otherSessions, opts) {
        const combined = Array.isArray(otherSessions) ? otherSessions :  [];
        
        try {
            const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || [];
            const excludeIds = session && session.id ? [session.id] : [];
            const sallesInfo = opts.sallesInfo || (StateManager && StateManager.state && StateManager.state.sallesInfo) || {};
            
            let confMsgs = ConflictService.checkAllConflicts(session, allSessions, excludeIds, sallesInfo);
            
            if (Array.isArray(confMsgs) && confMsgs.length > 0) {
                const sessionIsTP = this._isTP(session);
                if (sessionIsTP) {
                    confMsgs = confMsgs.filter(m => {
                        try {
                            return !/salle/i.test(m);
                        } catch (e) {
                            return true;
                        }
                    });
                }
                
                if (Array.isArray(confMsgs) && confMsgs.length > 0) {
                    return true;
                }
            }
        } catch (e) {
            this._log('debug', 'ConflictService. checkAllConflicts failed, falling back to pairwise checks', e);
        }
        
        for (const other of combined) {
            if (! other || !session) continue;
            
            const sessionIsTP = this._isTP(session);
            const otherIsTP = this._isTP(other);
            
            if (! sessionIsTP && !otherIsTP) {
                if (session.salle && other.salle && session.salle === other.salle && 
                    this._timesOverlap(session.heureDebut, session.heureFin, other. heureDebut, other.heureFin)) {
                    return true;
                }
            }
            
            if (session.professeur && other.professeur && session.professeur === other.professeur && 
                this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) {
                return true;
            }
            
            const g1 = session.groupe || session.group;
            const g2 = other.groupe || other.group;
            if (g1 && g2 && g1 === g2 && 
                this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) {
                return true;
            }
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
        try {
            const parts = String(time).split(':');
            const h = Number(parts[0]) || 0;
            const m = Number(parts[1]) || 0;
            return h * 60 + m;
        } catch (e) {
            // defensif : si parsing échoue, retourne 0
            return 0;
        }
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
        // Defensive: if result is falsy, return a clear message and log for debug
        if (!result) {
            try { console.warn('[ScheduleOptimizerService] generateOptimizationReport called with falsy result:', result); } catch (e) { /* noop */ }
            return '<div class="alert alert-danger">❌ Aucun résultat d\'optimisation disponible</div>';
        }

        // Consider the result usable either when success=true or when optimizedSeances is present
        const hasOptimizedSeances = Array.isArray(result.optimizedSeances) && result.optimizedSeances.length > 0;
        const ok = !!result.success || hasOptimizedSeances;
        if (!ok) {
            return '<div class="alert alert-danger">❌ Échec de l\'optimisation</div>';
        }

        // Use safe defaults to avoid runtime errors when some stats are missing
        const currentStats = result.currentStats || {};
        const optimizedStats = result.optimizedStats || {};
        const improvement = result.improvement || {};

        const safeNumber = (v) => Number.isFinite(v) ? v : 0;
        const fmt = (n) => Number.isFinite(n) ? n.toFixed(1) : '0.0';
        const pct = (n) => Number.isFinite(n) ? (n * 100).toFixed(1) + '%' : '0%';

        const beforeConflicts = safeNumber((currentStats.conflicts && currentStats.conflicts.total) || 0);
        const afterConflicts = safeNumber((optimizedStats.conflicts && optimizedStats.conflicts.total) || 0);
        const beforeGaps = Array.isArray(currentStats.gaps) ? currentStats.gaps.length : 0;
        const afterGaps = Array.isArray(optimizedStats.gaps) ? optimizedStats.gaps.length : 0;
        const beforeClustering = Number.isFinite(currentStats.subjectClustering) ? currentStats.subjectClustering : 0;
        const afterClustering = Number.isFinite(optimizedStats.subjectClustering) ? optimizedStats.subjectClustering : 0;
        const impConflicts = safeNumber(improvement.conflicts || (beforeConflicts - afterConflicts));
        const impGaps = safeNumber(improvement.gaps || (beforeGaps - afterGaps));
        const impClustering = (typeof improvement.clustering === 'number') ? improvement.clustering : (afterClustering - beforeClustering);

        return `
<div class="optimization-report">
    <h3>📊 Rapport d'Optimisation</h3>
    
    <div class="metric">
        <h4>Conflits</h4>
        <span class="before">${beforeConflicts}</span>
        <span class="arrow">→</span>
        <span class="after">${afterConflicts}</span>
        <span class="improvement ${impConflicts > 0 ? 'positive' : 'negative'}">
            (${impConflicts > 0 ? '-' : '+'}${Math.abs(impConflicts)})
        </span>
    </div>
    
    <div class="metric">
        <h4>Trous</h4>
        <span class="before">${beforeGaps}</span>
        <span class="arrow">→</span>
        <span class="after">${afterGaps}</span>
        <span class="improvement ${impGaps > 0 ? 'positive' : 'negative'}">
            (${impGaps > 0 ? '-' : '+'}${Math.abs(impGaps)})
        </span>
    </div>
    
    <div class="metric">
        <h4>Regroupement matières</h4>
        <span class="before">${pct(beforeClustering)}</span>
        <span class="arrow">→</span>
        <span class="after">${pct(afterClustering)}</span>
        <span class="improvement ${impClustering >= 0 ? 'positive' : 'negative'}">
            (${impClustering >= 0 ? '+' : ''}${pct(impClustering)})
        </span>
    </div>
</div>`;
    }
}

const __scheduleOptimizerInstance = new ScheduleOptimizerService();
// DEBUG: exposer l'instance pour debug dans le navigateur (ne pas laisser en production si non désiré)
try {
    if (typeof window !== 'undefined' && !window.ScheduleOptimizerService) {
        window.ScheduleOptimizerService = __scheduleOptimizerInstance;
    }
} catch (e) { /* ignore non-browser env */ }
export default __scheduleOptimizerInstance;