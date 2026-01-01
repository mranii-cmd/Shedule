/**
 * Service d'optimisation de l'emploi du temps
 * Auteur original: Ibrahim Mrani - UCD
 * Modifications: mranii-cmd
 *
 * Version complète et consolidée :
 * - conservation des heuristiques d'origine (removeGaps, balanceLoad, groupBySubject, preferred slots...)
 * - délégation à ConflictService pour la détection des conflits
 * - renforcement et activation configurable de la règle :
 *     "max X TP d'une même matière par demi-journée (matin/après-midi)" (opts.tpPerSubjectPerSlot, default 1)
 * - équilibrage des créneaux via _balanceSlotDistribution (nouvelle heuristique)
 * - processByFiliere (optionnel) : heuristique séquentielle filière-par-filière
 * - applyOptimizedSchedule(result, opts) pour appliquer le résultat (backup optionnel)
 * - wrapper _log résilient
 *
 * Modifications appliquées ici :
 * - Ajout de _isTP(session) pour détection robuste des TP
 * - Ignorer les conflits de salle lorsque l'une des séances est un TP (dans _detectConflicts et _hasConflicts)
 * - Filtrage des messages ConflictService pour retirer les mentions de "salle" quand on teste un TP
 * - Ajout de la contrainte "exclusion entre filières" :
 *     - Lecture depuis StateManager.state.filiereExclusions ou opts.filiereExclusions
 *     - Empêche le placement/optimisation si deux séances de filières exclues se chevauchent
 */

import StateManager from '../controllers/StateManager.js';
import TeacherConstraintParser from './TeacherConstraintParser.js';
import LogService from './LogService.js';
import ConflictService from './ConflictService.js';

class ScheduleOptimizerService {
    optimizeSchedule(options = {}) {
        this._log('info', '[ScheduleOptimizer] ===== STARTING OPTIMIZATION =====');
        this._log('debug', '[ScheduleOptimizer] Options:', options);

        const opts = Object.assign({
            removeGaps: true,
            balanceLoad: true,
            groupSubjects: true,
            preferredSlots: true,
            loadTolerance: 1.5,
            minBreak: 15,           // minutes
            maxEndTime: 18,         // heures
            respectExisting: true,
            respectConstraints: true,
            dryRun: false,
            noConcurrentTPPerSubject: true, // legacy boolean
            tpPerSubjectPerSlot: 1,         // new: max TP per subject per half-day slot
            processByFiliere: false,
            filiereOrder: null,
            sallesInfo: {},
            balanceSlotDistribution: true   // new: balance morning/afternoon distribution
        }, options || {});

        try {
            const seances = Array.isArray(StateManager?.state?.seances) ? StateManager.state.seances : [];

            if (!seances.length) {
                return {
                    success: false,
                    error: 'Aucune séance à optimiser',
                    stats: null
                };
            }

            this._log('info', `[ScheduleOptimizer] Total sessions: ${seances.length}`);

            // 1. Current state analysis
            const currentStats = this._analyzeSchedule(seances);
            this._log('debug', '[ScheduleOptimizer] Current stats:', currentStats);

            // 2. Work on a deep clone
            let optimizedSeances = this._cloneSeances(seances);

            // 3. Either process by filiere or global
            if (opts.processByFiliere) {
                this._log('info', '[ScheduleOptimizer] processByFiliere enabled');
                optimizedSeances = this._scheduleByFiliere(optimizedSeances, opts);
            } else {
                if (opts.respectExisting) {
                    const locked = optimizedSeances.filter(s => s && (s.locked || s.fixed));
                    const unlocked = optimizedSeances.filter(s => s && !(s.locked || s.fixed));
                    this._log('info', `[ScheduleOptimizer] Locked sessions: ${locked.length}, Unlocked: ${unlocked.length}`);

                    if (opts.removeGaps) this._removeGaps(unlocked, opts);
                    if (opts.balanceLoad) this._balanceDailyLoad(unlocked, opts);
                    if (opts.groupSubjects) this._groupBySubject(unlocked, opts);
                    if (opts.preferredSlots) this._preferredTimeSlots(unlocked, opts);
                    if (opts.balanceSlotDistribution) this._balanceSlotDistribution(unlocked, opts);

                    optimizedSeances = [...locked, ...unlocked];
                } else {
                    if (opts.removeGaps) this._removeGaps(optimizedSeances, opts);
                    if (opts.balanceLoad) this._balanceDailyLoad(optimizedSeances, opts);
                    if (opts.groupSubjects) this._groupBySubject(optimizedSeances, opts);
                    if (opts.preferredSlots) this._preferredTimeSlots(optimizedSeances, opts);
                    if (opts.balanceSlotDistribution) this._balanceSlotDistribution(optimizedSeances, opts);
                }
            }

            // 4. Analyze result
            const optimizedStats = this._analyzeSchedule(optimizedSeances);
            this._log('debug', '[ScheduleOptimizer] Optimized stats:', optimizedStats);

            // 5. Calculate improvement
            const improvement = this._calculateImprovement(currentStats, optimizedStats);

            const result = {
                success: true,
                dryRun: !!opts.dryRun,
                originalSeances: seances,
                optimizedSeances: optimizedSeances,
                currentStats: currentStats,
                optimizedStats: optimizedStats,
                improvement: improvement,
                options: opts
            };

            if (opts.dryRun) {
                this._log('info', '[ScheduleOptimizer] Dry-run completed, no state changed.');
            } else {
                this._log('info', '[ScheduleOptimizer] Optimization ready (call applyOptimizedSchedule to apply)');
            }

            return result;
        } catch (err) {
            this._log('error', '[ScheduleOptimizer] Optimization failed: ' + (err && err.message));
            return {
                success: false,
                error: err && err.message ? err.message : String(err),
                stats: null
            };
        }
    }

    applyOptimizedSchedule(optimizedResult, opts = {}) {
        opts = Object.assign({ saveBackup: true, backupLabel: 'Pre-optimization backup' }, opts || {});

        if (!optimizedResult || optimizedResult.success !== true || !Array.isArray(optimizedResult.optimizedSeances)) {
            this._log('error', 'applyOptimizedSchedule: invalid optimized result');
            return false;
        }

        try {
            // optional backup
            try {
                const BS = (typeof window !== 'undefined') ? window.BackupService : (globalThis && globalThis.BackupService);
                if (opts.saveBackup && BS && typeof BS.createBackup === 'function') {
                    this._log('info', 'applyOptimizedSchedule: creating automatic pre-optimization backup');
                    try { BS.createBackup({ download: false, label: opts.backupLabel }); } catch (e) { this._log('warning', 'applyOptimizedSchedule: BackupService.createBackup failed: ' + e.message); }
                }
            } catch (e) {
                this._log('debug', 'applyOptimizedSchedule: backup attempt encountered error', e);
            }

            // Apply result atomically
            // clone the optimized seances (deep copy) then rehydrate minimal helpers removed by JSON clone
            const cloned = this._cloneSeances(optimizedResult.optimizedSeances);

            // Rehydrate helper methods expected by renderers (e.g. TableRenderer expects seance.hasTeacher())
            const rehydrateSeance = (s) => {
                if (!s || typeof s !== 'object') return s;
                // add hasTeacher if missing
                if (typeof s.hasTeacher !== 'function') {
                    s.hasTeacher = function () {
                        try {
                            if (Array.isArray(this.enseignantsArray) && this.enseignantsArray.length > 0) return true;
                            if (Array.isArray(this.enseignants) && this.enseignants.length > 0) return true;
                            if (this.professeur || this.enseignant) return true;
                        } catch (e) { /* ignore */ }
                        return false;
                    };
                }
                // Add other small compatibility helpers here if your UI expects them
                return s;
            };

            const rehydrated = Array.isArray(cloned) ? cloned.map(rehydrateSeance) : cloned;
            if (!StateManager.state) StateManager.state = {};
            StateManager.state.seances = rehydrated;

            if (typeof StateManager.saveState === 'function') StateManager.saveState();
            try { StateManager.notify && StateManager.notify('schedule:optimized', { result: optimizedResult }); } catch (e) { }

            this._log('success', 'applyOptimizedSchedule: optimized schedule applied and state saved');
            return true;
        } catch (err) {
            this._log('error', 'applyOptimizedSchedule failed: ' + (err && err.message));
            return false;
        }
    }

    // ----------------------
    // Analysis / metrics
    // ----------------------
    _analyzeSchedule(seances) {
        const safe = Array.isArray(seances) ? seances : [];
        const stats = {
            totalSessions: safe.length,
            conflicts: this._detectConflicts(safe),
            gaps: this._detectGaps(safe),
            dailyLoad: this._calculateDailyLoad(safe),
            subjectClustering: this._calculateSubjectClustering(safe),
            timeSlotDistribution: this._analyzeTimeSlotDistribution(safe)
        };
        stats.globalScore = this._calculateGlobalScore(stats);
        return stats;
    }

    // --- NEW helper: robust TP detection (added only this helper)
    _isTP(session = {}) {
        if (!session) return false;
        try {
            const type = (session.type || '').toString().toLowerCase();
            if (type.includes('tp')) return true;
            const mat = (session.matiere || '').toString().toLowerCase();
            if (mat.includes('tp') || mat.includes('travaux') || mat.includes('pratiques')) return true;
            const label = (session.nom || session.name || '').toString().toLowerCase();
            if (label.includes('tp')) return true;
        } catch (e) {
            // ignore parse errors
        }
        return false;
    }

    // ========================
    // Filiere exclusion helpers (new)
    // ========================
    /**
     * Normalise et construit un Set de paires de filières exclues.
     * Sources acceptées (ordre de priorité) :
     *  - opts.filiereExclusions passé à optimizeSchedule / _hasConflicts
     *  - StateManager.state.filiereExclusions (après import Excel)
     *
     * Formats acceptés :
     *  - Array of pairs: [ ["F1","F2"], ["F3","F4"] ]
     *  - Array of strings: ["F1:F2", "F3|F4"]
     *  - Mapping object: { "F1": ["F2","F3"], "F4": "F5" }
     *
     * Retourne un Set de clés normalisées "A|B" (ordre alphabétique dans la clé), ou null si aucune exclusion.
     */
    _buildFiliereExclusions(opts = {}) {
        const raw = (opts && opts.filiereExclusions) ? opts.filiereExclusions
            : (StateManager && StateManager.state && StateManager.state.filiereExclusions) ? StateManager.state.filiereExclusions
                : null;
        if (!raw) return null;

        const pairs = new Set();
        const addPair = (a, b) => {
            if (!a || !b) return;
            const k1 = String(a).trim();
            const k2 = String(b).trim();
            if (!k1 || !k2) return;
            const key = (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`;
            pairs.add(key);
        };

        if (Array.isArray(raw)) {
            raw.forEach(item => {
                if (!item) return;
                if (Array.isArray(item) && item.length >= 2) addPair(item[0], item[1]);
                else if (typeof item === 'string') {
                    const sep = item.includes(':') ? ':' : (item.includes('|') ? '|' : null);
                    if (sep) {
                        const parts = item.split(sep).map(p => p.trim());
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

        return pairs.size ? pairs : null;
    }

    _filierePairExcluded(f1, f2, exclusionsSet) {
        if (!f1 || !f2) return false;
        if (!exclusionsSet || !(exclusionsSet instanceof Set)) return false;
        const a = String(f1).trim();
        const b = String(f2).trim();
        if (!a || !b) return false;
        const key = (a < b) ? `${a}|${b}` : `${b}|${a}`;
        return exclusionsSet.has(key);
    }

    _detectConflicts(seances) {
        // Détection robuste avec déduplication des paires (évite multiplications)
        const conflicts = { rooms: [], teachers: [], groups: [], total: 0, subjectTP: [] };
        const arr = Array.isArray(seances) ? seances : [];
        const seen = new Set(); // clés "minId|maxId|type" pour dédupliquer

        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                const s1 = arr[i];
                const s2 = arr[j];
                if (!s1 || !s2) continue;
                if (s1.jour !== s2.jour) continue;

                // overlap check (delegue à ConflictService si disponible)
                let overlap = false;
                try {
                    if (ConflictService && typeof ConflictService.doSessionsOverlap === 'function') {
                        overlap = ConflictService.doSessionsOverlap(s1, s2);
                    } else {
                        const aS = this._timeToMinutes(s1.heureDebut);
                        const aE = this._timeToMinutes(s1.heureFin);
                        const bS = this._timeToMinutes(s2.heureDebut);
                        const bE = this._timeToMinutes(s2.heureFin);
                        if (aS != null && aE != null && bS != null && bE != null) overlap = (aS < bE && bS < aE);
                        else if (s1.creneau && s2.creneau && s1.creneau === s2.creneau) overlap = true;
                    }
                } catch (e) { overlap = false; }
                if (!overlap) continue;

                const idA = Number(s1.id || 0);
                const idB = Number(s2.id || 0);
                const pairKeyBase = `${Math.min(idA, idB)}|${Math.max(idA, idB)}`;

                // filiere exclusion (dédupliquée)
                try {
                    const exclusions = this._buildFiliereExclusions();
                    if (exclusions && this._filierePairExcluded(this._getFiliereOfSession(s1), this._getFiliereOfSession(s2), exclusions)) {
                        const key = `${pairKeyBase}|filiere`;
                        if (!seen.has(key)) {
                            conflicts.filieres = conflicts.filieres || [];
                            conflicts.filieres.push({ session1: s1, session2: s2, filiere1: this._getFiliereOfSession(s1), filiere2: this._getFiliereOfSession(s2), time: s1.creneau || s1.heureDebut });
                            conflicts.total++;
                            seen.add(key);
                        }
                    }
                } catch (e) { /* ignore */ }

                // room conflict
                if (s1.salle && s2.salle && String(s1.salle).trim() === String(s2.salle).trim()) {
                    const key = `${pairKeyBase}|room|${String(s1.salle).trim()}`;
                    if (!seen.has(key)) {
                        conflicts.rooms.push({ session1: s1, session2: s2, room: s1.salle });
                        conflicts.total++;
                        seen.add(key);
                    }
                }

                // teacher conflict
                if (s1.professeur && s2.professeur && s1.professeur === s2.professeur) {
                    const key = `${pairKeyBase}|teacher|${s1.professeur}`;
                    if (!seen.has(key)) {
                        conflicts.teachers.push({ session1: s1, session2: s2, teacher: s1.professeur });
                        conflicts.total++;
                        seen.add(key);
                    }
                }

                // group conflict
                const g1 = s1.groupe || s1.group;
                const g2 = s2.groupe || s2.group;
                if (g1 && g2 && g1 === g2) {
                    const key = `${pairKeyBase}|group|${g1}`;
                    if (!seen.has(key)) {
                        conflicts.groups.push({ session1: s1, session2: s2, group: g1 });
                        conflicts.total++;
                        seen.add(key);
                    }
                }

                // TP same subject
                try {
                    const t1 = (s1.type || '').toString().toLowerCase();
                    const t2 = (s2.type || '').toString().toLowerCase();
                    if (t1.includes('tp') && t2.includes('tp') && s1.matiere && s2.matiere && s1.matiere === s2.matiere) {
                        const key = `${pairKeyBase}|subjectTP|${s1.matiere}`;
                        if (!seen.has(key)) {
                            conflicts.subjectTP.push({ session1: s1, session2: s2, subject: s1.matiere, time: s1.creneau || s1.heureDebut });
                            conflicts.total++;
                            seen.add(key);
                        }
                    }
                } catch (e) { /* ignore */ }
            }
        }

        if (!conflicts.subjectTP || !conflicts.subjectTP.length) delete conflicts.subjectTP;
        return conflicts;
    }

    _detectGaps(seances) {
        const gaps = [];
        const arr = Array.isArray(seances) ? seances : [];
        const byDayAndGroup = {};

        arr.forEach(s => {
            if (!s) return;
            const groupe = s.groupe || s.group || '__nogroup__';
            const key = `${s.jour || 'unknown'}_${groupe}`;
            if (!byDayAndGroup[key]) byDayAndGroup[key] = [];
            byDayAndGroup[key].push(s);
        });

        Object.keys(byDayAndGroup).forEach(key => {
            const sessions = byDayAndGroup[key].sort((a, b) => this._timeToMinutes(a.heureDebut) - this._timeToMinutes(b.heureDebut));
            for (let i = 0; i < sessions.length - 1; i++) {
                const current = sessions[i];
                const next = sessions[i + 1];
                if (!current || !next) continue;
                const gapMinutes = this._timeToMinutes(next.heureDebut) - this._timeToMinutes(current.heureFin);
                if (gapMinutes > 30 && gapMinutes < 120) {
                    gaps.push({ day: current.jour, group: current.groupe || current.group, start: current.heureFin, end: next.heureDebut, duration: gapMinutes });
                }
            }
        });

        return gaps;
    }

    _calculateDailyLoad(seances) {
        const load = {};
        const arr = Array.isArray(seances) ? seances : [];

        arr.forEach(s => {
            if (!s) return;
            const key = `${s.jour}_${(s.groupe || s.group) || '__nogroup__'}`;
            if (!load[key]) load[key] = { day: s.jour, group: s.groupe || s.group || '', sessions: 0, totalHours: 0, subjects: new Set() };
            load[key].sessions++;
            load[key].totalHours += this._calculateDuration(s.heureDebut, s.heureFin);
            if (s.matiere) load[key].subjects.add(s.matiere);
        });

        const loadArray = Object.values(load);
        const hours = loadArray.map(l => l.totalHours || 0);

        return {
            byDayGroup: load,
            average: hours.length ? (hours.reduce((a, b) => a + b, 0) / hours.length) : 0,
            min: hours.length ? Math.min(...hours) : 0,
            max: hours.length ? Math.max(...hours) : 0,
            variance: this._calculateVariance(hours)
        };
    }

    _calculateSubjectClustering(seances) {
        let totalScore = 0;
        let subjectCount = 0;
        const bySubject = {};
        (seances || []).forEach(s => { if (!s || !s.matiere) return; if (!bySubject[s.matiere]) bySubject[s.matiere] = []; bySubject[s.matiere].push(s); });
        Object.keys(bySubject).forEach(matiere => {
            const sessions = bySubject[matiere];
            const days = new Set(sessions.map(s => s.jour));
            const score = days.size ? (1 / days.size) : 0;
            totalScore += score;
            subjectCount++;
        });
        return subjectCount > 0 ? totalScore / subjectCount : 0;
    }

    _analyzeTimeSlotDistribution(seances) {
        const distribution = { morning: 0, afternoon: 0, evening: 0 };
        (seances || []).forEach(s => {
            if (!s || !s.heureDebut) return;
            const startMinutes = this._timeToMinutes(s.heureDebut);
            if (startMinutes < 12 * 60) distribution.morning++;
            else if (startMinutes < 18 * 60) distribution.afternoon++;
            else distribution.evening++;
        });
        return distribution;
    }

    _calculateGlobalScore(stats) {
        let score = 100;
        score -= (stats.conflicts && stats.conflicts.total ? stats.conflicts.total * 10 : 0);
        score -= (Array.isArray(stats.gaps) ? stats.gaps.length * 5 : 0);
        score -= (stats.dailyLoad && stats.dailyLoad.variance ? stats.dailyLoad.variance * 2 : 0);
        score += (stats.subjectClustering ? stats.subjectClustering * 20 : 0);
        return Math.max(0, Math.min(100, score));
    }

    _calculateImprovement(before, after) {
        return {
            score: (after.globalScore || 0) - (before.globalScore || 0),
            conflicts: (before.conflicts?.total || 0) - (after.conflicts?.total || 0),
            gaps: (before.gaps?.length || 0) - (after.gaps?.length || 0),
            variance: (before.dailyLoad?.variance || 0) - (after.dailyLoad?.variance || 0),
            clustering: (after.subjectClustering || 0) - (before.subjectClustering || 0)
        };
    }

    // ========================
    // Heuristics / Optimizations
    // ========================
    _removeGaps(seances, opts = {}) {
        this._log('debug', '[ScheduleOptimizer] Removing gaps...');
        if (!Array.isArray(seances) || seances.length === 0) return;
        const minBreak = Number(opts?.minBreak || 15);

        const byDayGroup = {};
        seances.forEach(s => {
            if (!s) return;
            const groupe = s.groupe || s.group || '__nogroup__';
            const key = `${s.jour}_${groupe}`;
            if (!byDayGroup[key]) byDayGroup[key] = [];
            byDayGroup[key].push(s);
        });

        Object.values(byDayGroup).forEach(sessions => {
            sessions.sort((a, b) => this._timeToMinutes(a.heureDebut) - this._timeToMinutes(b.heureDebut));
            let currentTime = this._alignToQuarter(this._timeToMinutes(sessions[0].heureDebut || '08:30'));

            sessions.forEach(s => {
                if (!s) return;
                // Determine durationMinutes robustly: prefer heureDebut/heureFin, then dureeAffichee/duree, else sensible default
                 const durationMinutes = (function () {
                    try {
                        if (s.heureDebut && s.heureFin) {
                            var d = Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60);
                            return this._roundDurationToQuarter(Math.max(15, d));
                        }
                        if (s.dureeAffichee && Number(s.dureeAffichee) > 0) {
                            var d2 = Math.round(Number(s.dureeAffichee) * 60);
                            return this._roundDurationToQuarter(Math.max(15, d2));
                        }
                        if (s.duree && Number(s.duree) > 0) {
                            var d3 = Math.round(Number(s.duree) * 60);
                            return this._roundDurationToQuarter(Math.max(15, d3));
                        }
                    } catch (e) { /* ignore */ }
                    return this._roundDurationToQuarter(90);
                }).call(this);

                const candidate = Object.assign({}, s, { heureDebut: this._minutesToTime(currentTime), heureFin: this._minutesToTime(currentTime + durationMinutes) });
                const otherLocal = sessions.filter(x => x.id !== s.id);
                if (!this._hasConflicts(candidate, otherLocal, [], opts) && this._validateTeacherConstraints(candidate, opts)) {
                    s.heureDebut = candidate.heureDebut;
                    s.heureFin = candidate.heureFin;
                    currentTime += durationMinutes + minBreak;
                } else {
                    this._log('debug', `Cannot compact session ${s.id || s.matiere} due to conflicts, keeping original time`);
                    currentTime = Math.max(currentTime, this._timeToMinutes(s.heureFin) + minBreak);
                }
            });
        });
    }

    _preferredTimeSlots(seances, opts = {}) {
        this._log('debug', '[ScheduleOptimizer] Applying preferred time slots...');
        if (!Array.isArray(seances)) return;

        const maxEndTimeMinutes = Number(opts?.maxEndTime || 18) * 60;
        const cmPref = opts?.cmSlot || opts?.cmPref || 'morning';
        const tdPref = opts?.tdSlot || opts?.tdPref || 'afternoon';
        const tpPref = opts?.tpSlot || opts?.tpPref || 'afternoon';

        seances.forEach(s => {
            if (!s || !s.heureDebut || !s.heureFin) return;
            const type = (s.type || '').toString().toLowerCase();
            const startMinutes = this._timeToMinutes(s.heureDebut);
            const durationMinutes = Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60);
            let preferredStart = startMinutes;

            if (type.includes('cm') || type.includes('cours')) {
                if (cmPref === 'morning' && startMinutes >= 14 * 60) preferredStart = 8 * 60;
                else if (cmPref === 'afternoon' && startMinutes < 12 * 60) preferredStart = 14 * 60;
            } else if (type.includes('td')) {
                if (tdPref === 'morning' && startMinutes >= 14 * 60) preferredStart = 8 * 60;
                else if (tdPref === 'afternoon' && startMinutes < 12 * 60) preferredStart = 14 * 60;
            } else if (type.includes('tp')) {
                if (tpPref === 'morning' && startMinutes >= 14 * 60) preferredStart = 8 * 60;
                else if (tpPref === 'afternoon' && startMinutes < 12 * 60) preferredStart = 14 * 60;
            }

            const preferredEnd = preferredStart + durationMinutes;
            if (preferredEnd <= maxEndTimeMinutes) {
                // When testing candidate, use the global day set (StateManager.state.seances) to avoid false positives
                const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || [];
                const tempSession = Object.assign({}, s, {
                    heureDebut: this._minutesToTime(preferredStart),
                    heureFin: this._minutesToTime(preferredEnd)
                });

                if (!this._hasConflicts(tempSession, allSessions.filter(o => o.id !== s.id), [], opts) && this._validateTeacherConstraints(tempSession, opts) && !this._wouldExceedTPPerSlot(tempSession, allSessions.filter(o => o.id !== s.id), [], opts)) {
                    s.heureDebut = tempSession.heureDebut;
                    s.heureFin = tempSession.heureFin;
                } else {
                    this._log('debug', `Preferred slot for ${s.id || s.matiere} skipped due to conflicts/constraints`);
                }
            }
        });
    }

    _balanceDailyLoad(seances, opts = {}) {
        this._log('debug', '[ScheduleOptimizer] Balancing daily load...');
        if (!Array.isArray(seances) || seances.length === 0) return;

        const loadByDayGroup = {};
        seances.forEach(s => {
            if (!s) return;
            const key = `${s.jour}_${(s.groupe || s.group) || '__nogroup__'}`;
            if (!loadByDayGroup[key]) loadByDayGroup[key] = { day: s.jour, group: s.groupe || s.group || '', sessions: [], totalHours: 0 };
            loadByDayGroup[key].sessions.push(s);
            loadByDayGroup[key].totalHours += this._calculateDuration(s.heureDebut, s.heureFin);
        });

        const loads = Object.values(loadByDayGroup);
        if (!loads.length) return;
        const avgLoad = loads.reduce((sum, l) => sum + (l.totalHours || 0), 0) / loads.length;
        const threshold = (opts.loadTolerance || 0.3) * avgLoad;

        const overloaded = loads.filter(l => (l.totalHours || 0) > avgLoad + threshold);
        const underloaded = loads.filter(l => (l.totalHours || 0) < avgLoad - threshold);

        this._log('debug', '[ScheduleOptimizer] Average load:', avgLoad.toFixed(2), 'hours');

        overloaded.forEach(overloadedDay => {
            const targetDay = underloaded.find(u => u.group === overloadedDay.group);
            if (!targetDay) return;
            const sessionToMove = (overloadedDay.sessions || []).slice(-1)[0];
            if (!sessionToMove) return;
            // Use full-state check when moving across days
            const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || [];
            const otherOnTarget = allSessions.filter(a => a.jour === targetDay.day && a.id !== sessionToMove.id);
            const cand = Object.assign({}, sessionToMove, { jour: targetDay.day });
            if (!this._hasConflicts(cand, otherOnTarget, [], opts) && this._validateTeacherConstraints(cand, opts) && !this._wouldExceedTPPerSlot(cand, otherOnTarget, [], opts)) {
                this._log('info', `[ScheduleOptimizer] Moving ${sessionToMove.matiere || sessionToMove.id} from ${overloadedDay.day} to ${targetDay.day}`);
                sessionToMove.jour = targetDay.day;
                const dur = this._calculateDuration(sessionToMove.heureDebut, sessionToMove.heureFin);
                overloadedDay.totalHours = Math.max(0, (overloadedDay.totalHours || 0) - dur);
                targetDay.totalHours = (targetDay.totalHours || 0) + dur;
                overloadedDay.sessions.pop();
                targetDay.sessions.push(sessionToMove);
            } else {
                this._log('debug', `Skipped moving ${sessionToMove.id || sessionToMove.matiere} due to conflicts`);
            }
        });
    }

    /**
     * Vérifie si une séance a des conflits (délégation à ConflictService puis vérifications additionnelles).
     * signature: session, otherSessions (array), extraSessions (array), opts
     *
     * Modifications : ignore room conflicts when session or other is TP.
     *                ajoute vérification "filiere exclusion" (opts.filiereExclusions or StateManager.state.filiereExclusions)
     */
    _hasConflicts(session, otherSessions = [], extraSessions = [], opts = {}) {
        // Combine arrays into one set for checks; but for ConflictService we prefer to pass the full-state for robust checks
        const combined = [];
        if (Array.isArray(otherSessions)) combined.push(...otherSessions);
        if (Array.isArray(extraSessions)) combined.push(...extraSessions);

        // 1) Use ConflictService.checkAllConflicts against the whole current state (recommended for accurate rules)
        try {
            const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || [];
            const excludeIds = session && session.id ? [session.id] : [];
            const sallesInfo = opts.sallesInfo || (StateManager && StateManager.state && StateManager.state.sallesInfo) || {};
            let confMsgs = ConflictService.checkAllConflicts(session, allSessions, excludeIds, sallesInfo);
            if (Array.isArray(confMsgs) && confMsgs.length > 0) {
                // If session is a TP, ignore room-related conflict messages (they mention "salle")
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
                    this._log('debug', `ConflictService flagged ${confMsgs.length} conflicts for session ${session.id || session.matiere}`);
                    return true;
                }
            }
        } catch (e) {
            this._log('debug', 'ConflictService.checkAllConflicts failed, falling back to pairwise checks', e);
        }

        // --- NEW: filiere exclusion global check (block if session would overlap a forbidden filiere) ---
        try {
            const exclusions = this._buildFiliereExclusions(opts);
            if (exclusions && exclusions.size) {
                const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || [];
                for (const other of allSessions) {
                    if (!other || (session.id && other.id === session.id)) continue;
                    if (session.jour !== other.jour) continue;
                    if (!this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) continue;
                    const f1 = this._getFiliereOfSession(session);
                    const f2 = this._getFiliereOfSession(other);
                    if (this._filierePairExcluded(f1, f2, exclusions)) {
                        this._log('debug', `Filiere exclusion: ${f1} vs ${f2} blocks session ${session.id || session.matiere}`);
                        return true;
                    }
                }
            }
        } catch (e) {
            // ignore filiere exclusion check errors
        }

        // 2) Fallback pairwise checks for basic room/prof/group overlap (if ConflictService unavailable)
        for (const other of combined) {
            if (!other || !session) continue;

            // Pairwise filiere exclusion check (covers combined arrays case)
            try {
                const exclusions = this._buildFiliereExclusions(opts);
                if (exclusions && this._filierePairExcluded(this._getFiliereOfSession(session), this._getFiliereOfSession(other), exclusions) && this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) {
                    this._log('debug', `Pairwise filiere exclusion blocks ${session.id || session.matiere} vs ${other.id || other.matiere}`);
                    return true;
                }
            } catch (e) {
                // ignore
            }

            // Skip room conflict if session or other is TP (change applied)
            const sessionIsTP = this._isTP(session);
            const otherIsTP = this._isTP(other);

            if (!sessionIsTP && !otherIsTP) {
                if (session.salle && other.salle && session.salle === other.salle && this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) return true;
            }

            if (session.professeur && other.professeur && session.professeur === other.professeur && this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) return true;

            const g1 = session.groupe || session.group;
            const g2 = other.groupe || other.group;
            if (g1 && g2 && g1 === g2 && this._timesOverlap(session.heureDebut, session.heureFin, other.heureDebut, other.heureFin)) return true;
        }

        // 3) Enforce TP-per-subject-per-slot rule (half-day constraint) if enabled
        const enforceTP = (typeof opts.tpPerSubjectPerSlot !== 'undefined') ? true : !!opts.noConcurrentTPPerSubject;
        if (enforceTP) {
            if (this._wouldExceedTPPerSlot(session, otherSessions, extraSessions, opts)) {
                this._log('debug', `TP-per-slot rule would be violated for ${session.matiere} on ${session.jour} at ${session.heureDebut}`);
                return true;
            }
        }

        return false;
    }

    // ========================
    // processByFiliere
    // ========================
    _scheduleByFiliere(seances, opts = {}) {
        const arr = Array.isArray(seances) ? this._cloneSeances(seances) : [];
        const byFiliere = {};
        arr.forEach(s => {
            if (!s) return;
            const fil = this._getFiliereOfSession(s) || '__nofiliere__';
            if (!byFiliere[fil]) byFiliere[fil] = [];
            byFiliere[fil].push(s);
        });

        let filieres = Object.keys(byFiliere);
        if (!filieres.length) return arr;

        if (Array.isArray(opts.filiereOrder) && opts.filiereOrder.length) {
            const given = opts.filiereOrder.filter(f => filieres.includes(f));
            const remaining = filieres.filter(f => !given.includes(f));
            filieres = [...given, ...remaining];
        } else {
            filieres.sort((a, b) => (byFiliere[b].length - byFiliere[a].length));
        }

        this._log('info', '[ScheduleOptimizer] Filiere order:', filieres);

        const placed = [];
        const accumulator = [];

        for (const fil of filieres) {
            const subset = byFiliere[fil] || [];
            if (!subset.length) continue;
            const working = this._cloneSeances(subset);

            if (opts.removeGaps) this._removeGaps(working, opts);
            if (opts.balanceLoad) this._balanceDailyLoad(working, opts);
            if (opts.groupSubjects) this._groupBySubject(working, opts);
            if (opts.preferredSlots) this._preferredTimeSlots(working, opts);
            if (opts.balanceSlotDistribution) this._balanceSlotDistribution(working, opts);

            for (let i = 0; i < working.length; i++) {
                const s = working[i];
                if (!s) continue;
                if (this._hasConflicts(s, [], placed, opts)) {
                    this._log('debug', `[ScheduleOptimizer] Conflict of session ${s.id || s.matiere} with placed sessions; attempting shifts`);
                    const maxEnd = (opts.maxEndTime || 18) * 60;
                    let tryStart = this._timeToMinutes(s.heureDebut);
                 const duration = this._roundDurationToQuarter(Math.max(15, Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60)));
                    const step = 15;
                    let relocated = false;
                    const otherLocal = working.filter(x => x.id !== s.id);
                    tryStart = this._alignToQuarter(tryStart);
                    while (tryStart + duration <= maxEnd) {
                        const cand = Object.assign({}, s, { heureDebut: this._minutesToTime(tryStart), heureFin: this._minutesToTime(tryStart + duration) });
                        if (!this._hasConflicts(cand, otherLocal, placed, opts) && this._validateTeacherConstraints(cand, opts) && !this._wouldExceedTPPerSlot(cand, otherLocal, placed, opts)) {
                            s.heureDebut = cand.heureDebut;
                            s.heureFin = cand.heureFin;
                            relocated = true;
                            break;
                        }
                        tryStart += step;
                        tryStart = this._alignToQuarter(tryStart);
                    }
                    if (!relocated) {
                        this._log('warning', `[ScheduleOptimizer] Could not relocate session ${s.id || s.matiere} in filiere ${fil}; leaving as-is`);
                    }
                }
            }

            working.forEach(w => { placed.push(w); accumulator.push(w); });
        }

        // ensure nothing lost
        const accIds = new Set(accumulator.map(s => s.id).filter(Boolean));
        arr.forEach(orig => {
            if (!orig) return;
            if (!orig.id || !accIds.has(orig.id)) accumulator.push(this._cloneSeances([orig])[0]);
        });

        return accumulator;
    }

    _getFiliereOfSession(session = {}) {
        if (!session) return null;
        if (session.filiere) return session.filiere;
        const mat = session.matiere;
        try {
            const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
            const entry = mg[mat];
            if (entry && entry.filiere) return entry.filiere;
        } catch (e) { /* ignore */ }
        return null;
    }

    // ========================
    // TP per-slot helpers
    // ========================

    _getSlotFromTime(heureDebut) {
        const start = this._timeToMinutes(heureDebut);
        if (start < 12 * 60) return 'morning';
        if (start < 18 * 60) return 'afternoon';
        return 'evening';
    }

    _countTPsSameSubjectInSlot(matiere, jour, slot, sessionsOverride = null, excludeId = null) {
        const sessions = Array.isArray(sessionsOverride) ? sessionsOverride : (StateManager && StateManager.state && StateManager.state.seances) || [];
        let count = 0;
        for (const s of sessions) {
            if (!s) continue;
            if (excludeId && s.id === excludeId) continue;
            if (!s.matiere || s.matiere !== matiere) continue;
            const type = (s.type || '').toString().toLowerCase();
            if (!type.includes('tp')) continue;
            if (!s.jour || s.jour !== jour) continue;
            const sSlot = this._getSlotFromTime(s.heureDebut || s.debut || '');
            if (sSlot === slot) count++;
        }
        return count;
    }

    _wouldExceedTPPerSlot(session, otherSessions = [], extraSessions = [], opts = {}) {
        // Determine allowed
        const allowed = Number.isFinite(opts?.tpPerSubjectPerSlot) ? Number(opts.tpPerSubjectPerSlot) : (opts.noConcurrentTPPerSubject ? 1 : Infinity);
        if (!Number.isFinite(allowed) || allowed <= 0) return false;

        const combined = [];
        if (Array.isArray(otherSessions)) combined.push(...otherSessions);
        if (Array.isArray(extraSessions)) combined.push(...extraSessions);

        const jour = session.jour;
        const mat = session.matiere;
        if (!jour || !mat) return false;

        const slot = this._getSlotFromTime(session.heureDebut || session.debut || '');
        const existing = this._countTPsSameSubjectInSlot(mat, jour, slot, combined, session.id);

        return (existing + 1) > allowed;
    }

    // ========================
    // Slot distribution balancer
    // ========================
    /**
     * Équilibre la distribution des créneaux (matin/afternoon/evening) sur la semaine.
     * Déplace séances non verrouillées depuis day/slot surchargé vers day/slot sous-chargé.
     */
    _balanceSlotDistribution(seances, opts = {}) {
        this._log('debug', '[ScheduleOptimizer] Balancing slot distribution...');
        if (!Array.isArray(seances) || seances.length === 0) return;

        // days considered (collect unique jours present)
        const days = Array.from(new Set(seances.map(s => s.jour).filter(Boolean)));
        if (days.length <= 1) return;

        // slot function
        const slotOf = (s) => {
            const start = this._timeToMinutes(s.heureDebut || s.debut || '08:00');
            if (start < 12 * 60) return 'morning';
            if (start < 18 * 60) return 'afternoon';
            return 'evening';
        };

        // compute counts per day-slot
        const counts = {};
        days.forEach(d => { counts[d] = { morning: 0, afternoon: 0, evening: 0 }; });
        seances.forEach(s => {
            if (!s || !s.jour) return;
            const slot = slotOf(s);
            if (!counts[s.jour]) counts[s.jour] = { morning: 0, afternoon: 0, evening: 0 };
            counts[s.jour][slot] = (counts[s.jour][slot] || 0) + 1;
        });

        // total per slot
        const total = { morning: 0, afternoon: 0, evening: 0 };
        days.forEach(d => { total.morning += counts[d].morning; total.afternoon += counts[d].afternoon; total.evening += counts[d].evening; });

        // target per day = round(totalSlot / days.length)
        const target = {
            morning: Math.round(total.morning / days.length),
            afternoon: Math.round(total.afternoon / days.length),
            evening: Math.round(total.evening / days.length)
        };

        this._log('debug', '[ScheduleOptimizer] slot targets per day:', target);

        // prepare lists: overloaded day/slot and underloaded
        const overloaded = [];
        const underloaded = [];
        days.forEach(d => {
            ['morning', 'afternoon', 'evening'].forEach(slot => {
                const diff = counts[d][slot] - target[slot];
                if (diff > 0) overloaded.push({ day: d, slot, excess: diff });
                else if (diff < 0) underloaded.push({ day: d, slot, deficit: -diff });
            });
        });

        if (overloaded.length === 0 || underloaded.length === 0) {
            this._log('debug', '[ScheduleOptimizer] No slot imbalance detected');
            return;
        }

        // Sort overloaded by largest excess and underloaded by largest deficit
        overloaded.sort((a, b) => b.excess - a.excess);
        underloaded.sort((a, b) => b.deficit - a.deficit);

        const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || seances;

        const maxIterations = 2000;
        let iter = 0;

        // Try to move one session at a time from overloaded to underloaded
        while (overloaded.length && underloaded.length && iter < maxIterations) {
            iter++;
            const src = overloaded[0];
            const dst = underloaded[0];

            // find candidate session in src.day/src.slot that is movable (not locked)
            const candidates = seances.filter(s => s.jour === src.day && slotOf(s) === src.slot && !(s.locked || s.fixed));
            if (!candidates.length) {
                // nothing movable here, drop this overloaded entry
                overloaded.shift();
                continue;
            }

            // pick a candidate (prefer non-TP)
            let candidate = candidates.find(c => !((c.type || '').toLowerCase().includes('tp'))) || candidates[0];

            // attempt to place candidate in dst.day within dst.slot
            const duration = this._roundDurationToQuarter(Math.max(15, Math.round(this._calculateDuration(candidate.heureDebut, candidate.heureFin) * 60)));
                    const minBreak = Number(opts?.minBreak || 15);
                    const step = 15;
                    const slotWindow = dst.slot === 'morning' ? { start: 8 * 60, end: 12 * 60 } : dst.slot === 'afternoon' ? { start: 14 * 60, end: 18 * 60 } : { start: 18 * 60, end: 22 * 60 };
                    let placed = false;

            var start = this._alignToQuarter(slotWindow.start);
            for (; start + duration <= slotWindow.end; start += step) {
                const candSession = Object.assign({}, candidate, {
                    jour: dst.day,
                    heureDebut: this._minutesToTime(start),
                    heureFin: this._minutesToTime(start + duration)
                });

                // Build full-day other sessions to check correctly
                const otherOnDstDay = allSessions.filter(s => s.jour === dst.day && s.id !== candidate.id);

                // Check constraints
                if (!this._hasConflicts(candSession, otherOnDstDay, [], opts) && this._validateTeacherConstraints(candSession, opts) && !this._wouldExceedTPPerSlot(candSession, otherOnDstDay, [], opts)) {
                    // Accept move
                    this._log('info', `[ScheduleOptimizer] Moving ${candidate.matiere || candidate.id} from ${candidate.jour} ${candidate.heureDebut} to ${dst.day} ${candSession.heureDebut} to balance slots`);
                    candidate.jour = dst.day;
                    candidate.heureDebut = candSession.heureDebut;
                    candidate.heureFin = candSession.heureFin;

                    // update counts
                    counts[src.day][src.slot] = Math.max(0, counts[src.day][src.slot] - 1);
                    counts[dst.day][dst.slot] = (counts[dst.day][dst.slot] || 0) + 1;

                    src.excess -= 1;
                    dst.deficit -= 1;
                    placed = true;
                    break;
                }
            }

            // Clean up entries with no remaining diff
            if (src.excess <= 0) overloaded.shift();
            if (dst.deficit <= 0) underloaded.shift();

            // If not placed, mark candidate to avoid repeated tries
            if (!placed) {
                candidate._tempSkip = (candidate._tempSkip || 0) + 1;
                if (candidate._tempSkip > 3) {
                    candidate.locked = true; // avoid infinite retries
                }
            }
        }

        this._log('debug', `[ScheduleOptimizer] balanceSlotDistribution iterations: ${iter}`);
        // Cleanup any temporary flags
        seances.forEach(s => { if (s && s._tempSkip) delete s._tempSkip; });
    }

    // ========================
    // Utilities
    // ========================
    _timesOverlap(start1, end1, start2, end2) {
        const s1 = this._timeToMinutes(start1);
        const e1 = this._timeToMinutes(end1);
        const s2 = this._timeToMinutes(start2);
        const e2 = this._timeToMinutes(end2);
        return s1 < e2 && s2 < e1;
    }
    // helpers used above
    _alignToQuarter(minutes) {
        if (minutes == null || Number.isNaN(Number(minutes))) return minutes;
        return Math.round(Number(minutes) / 15) * 15;
    }

    _roundDurationToQuarter(minutes) {
        if (minutes == null || Number.isNaN(Number(minutes))) return 90;
        return Math.max(15, Math.round(Number(minutes) / 15) * 15);
    }

    _timeToMinutes(time) {
        if (!time) return 0;
        const parts = ('' + time).split(':');
        const h = Number(parts[0]) || 0;
        const m = Number(parts[1]) || 0;
        return h * 60 + m;
    }

    _minutesToTime(minutes) {
        const mins = Math.max(0, Number(minutes || 0));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    _calculateDuration(start, end) {
        return (this._timeToMinutes(end) - this._timeToMinutes(start)) / 60;
    }

    _calculateVariance(numbers) {
        if (!Array.isArray(numbers) || numbers.length === 0) return 0;
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        return numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
    }

    _validateTeacherConstraints(session, opts = {}) {
        if (!opts.respectConstraints) return true;

        const teachers = session.enseignantsArray || session.enseignants || [];
        if (!Array.isArray(teachers) || teachers.length === 0) return true;

        for (const teacherName of teachers) {
            if (!teacherName) continue;
            const souhaits = (StateManager.state && StateManager.state.enseignantSouhaits) ? StateManager.state.enseignantSouhaits[teacherName] : null;
            if (!souhaits || !souhaits.contraintes) continue;
            try {
                const parsed = TeacherConstraintParser.parseConstraints(teacherName, souhaits.contraintes);
                const validation = TeacherConstraintParser.validateSession(parsed, session);
                if (!validation.valid) {
                    this._log('warning', `Contrainte violée pour ${teacherName}: ${validation.violations.join(', ')}`);
                    return false;
                }
            } catch (e) {
                this._log('debug', 'TeacherConstraintParser error', e);
                return false;
            }
        }
        return true;
    }

    _cloneSeances(seances) {
        try { return JSON.parse(JSON.stringify(Array.isArray(seances) ? seances : [])); }
        catch (e) { this._log('debug', 'cloneSeances fallback', e); return (seances || []).slice(); }
    }

    // Robust logging wrapper
    _log(level = 'info', ...args) {
        try {
            if (LogService && typeof LogService[level] === 'function') {
                LogService[level](...args);
                return;
            }
            if (LogService && typeof LogService.info === 'function' && (level === 'success' || level === 'info')) {
                LogService.info(...args);
                return;
            }
        } catch (e) {
            // ignore logging failures
        }

        try {
            if (level === 'debug' && console.debug) console.debug(...args);
            else if ((level === 'warning' || level === 'warn') && console.warn) console.warn(...args);
            else if ((level === 'error' || level === 'err') && console.error) console.error(...args);
            else console.log(...args);
        } catch (e) {
            // swallow
        }
    }
    // === INSERT / REPLACE: _groupBySubject ===
    _groupBySubject(seances, opts = {}) {
        this._log('debug', '[ScheduleOptimizer] Grouping by subject (robust)');
        if (!Array.isArray(seances) || seances.length === 0) return;

        const minBreak = Number(opts?.minBreak || 15);
        const maxEnd = Number(opts?.maxEndTime || 18) * 60;

        const bySubject = {};
        seances.forEach(s => {
            if (!s || !s.matiere) return;
            if (!bySubject[s.matiere]) bySubject[s.matiere] = [];
            bySubject[s.matiere].push(s);
        });

        Object.keys(bySubject).forEach(matiere => {
            const sessions = bySubject[matiere];
            if (sessions.length <= 1) return;

            const dayCount = {};
            sessions.forEach(s => { dayCount[s.jour] = (dayCount[s.jour] || 0) + 1; });
            const mostFrequentDay = Object.keys(dayCount).reduce((a, b) => (dayCount[a] > dayCount[b] ? a : b));

            this._log('debug', `[ScheduleOptimizer] Most frequent day for ${matiere}: ${mostFrequentDay}`);

            sessions.forEach(s => {
                if (s.jour === mostFrequentDay) return;
                if (s.locked || s.fixed) {
                    this._log('debug', `Skipping locked session ${s.id || s.matiere}`);
                    return;
                }

                const allSessions = (StateManager && StateManager.state && StateManager.state.seances) || [];
                const otherSessionsOnTargetDay = allSessions.filter(other => other.jour === mostFrequentDay && other.id !== s.id);

                // Try same time first
                const candSameTime = Object.assign({}, s, { jour: mostFrequentDay });
                if (!this._hasConflicts(candSameTime, otherSessionsOnTargetDay, [], opts) && this._validateTeacherConstraints(candSameTime, opts) && !this._wouldExceedTPPerSlot(candSameTime, otherSessionsOnTargetDay, [], opts)) {
                    this._log('info', `[ScheduleOptimizer] Moving ${matiere} (same time) from ${s.jour} to ${mostFrequentDay}`);
                    s.jour = mostFrequentDay;
                    return;
                }

                // Try sliding through the day to find a free slot
                const duration = Math.max(1, Math.round(this._calculateDuration(s.heureDebut, s.heureFin) * 60));
                const step = Math.max(5, Math.floor(minBreak / 2));
                let found = false;
                const startWindow = 8 * 60;
                for (let start = startWindow; start + duration <= maxEnd; start += step) {
                    const cand = Object.assign({}, s, {
                        jour: mostFrequentDay,
                        heureDebut: this._minutesToTime(start),
                        heureFin: this._minutesToTime(start + duration)
                    });
                    if (!this._hasConflicts(cand, otherSessionsOnTargetDay, [], opts) && this._validateTeacherConstraints(cand, opts) && !this._wouldExceedTPPerSlot(cand, otherSessionsOnTargetDay, [], opts)) {
                        this._log('info', `[ScheduleOptimizer] Moving ${matiere} to ${mostFrequentDay} at ${cand.heureDebut}`);
                        s.jour = mostFrequentDay;
                        s.heureDebut = cand.heureDebut;
                        s.heureFin = cand.heureFin;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    this._log('debug', `Could not move ${matiere} (id:${s.id || 'n/a'}) to ${mostFrequentDay} — no slot found`);
                }
            });
        });
    }
    // === END INSERT ===
}

export default new ScheduleOptimizerService();