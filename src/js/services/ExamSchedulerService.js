/**
 * Service de planification automatique des examens. 
 *
 * Algorithme amélioré :
 * - Exclut les salles déjà occupées par d'autres examens à la même date/heure. 
 * - Pour les salles disponibles, sélectionne une combinaison de salles dont la capacité totale
 *   couvre le nombre d'étudiants avec un gaspillage minimal (somme des capacités choisies minimale >= étudiants).
 *   C'est réalisé via un DP subset-sum adapté (reconstructible). 
 * - Puis répartit les étudiants dans les salles choisies en remplissant d'abord les plus grandes (optimisation). 
 *
 * Méthodes principales :
 * - computeAllocationForExam(exam) : prend l'objet exam (date, startTime, endTime, studentsCount) et renvoie allocations. 
 * - scheduleExam(exam) : planifie un examen complet avec synchronisation
 */
import StateManager from '../controllers/StateManager.js';
import LogService from './LogService.js';

const ExamSchedulerService = {
  // parse "HH:MM" -> minutes since midnight, robust (returns null on invalid)
  _timeToMinutes(t) {
    if (!t || typeof t !== 'string') return null;
    const m = t.match(/^(\d{1,2})\s*[:h]\s*(\d{2})$/); // accept '14:30' or '14h30'
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  },

  // overlap test for two time ranges on same date
  _timesOverlap(dateA, startA, endA, dateB, startB, endB) {
    if (!dateA || !dateB) return false;
    if (String(dateA).trim() !== String(dateB).trim()) return false;
    const sA = this._timeToMinutes(startA);
    const eA = this._timeToMinutes(endA);
    const sB = this._timeToMinutes(startB);
    const eB = this._timeToMinutes(endB);
    if (sA === null || eA === null || sB === null || eB === null) return false;
    return (sA < eB) && (sB < eA);
  },

  // gather rooms already occupied at same date/time by other exams (both allocations and explicit rooms)
  _getConflictingRoomsForExam(exam) {
    const occupied = new Set();
    const exams = Array.isArray(StateManager.state.examens) ? StateManager.state.examens : [];
    exams.forEach(other => {
      if (!other || other.id === exam.id) return;
      if (this._timesOverlap(exam.date, exam.startTime, exam.endTime, other.date, other.startTime, other.endTime)) {
        if (Array.isArray(other.allocations)) {
          other.allocations.forEach(a => { if (a && a.room) occupied.add(String(a.room)); });
        }
        if (Array.isArray(other.rooms)) {
          other.rooms.forEach(r => { if (r) occupied.add(String(r)); });
        }
      }
    });
    return occupied;
  },

  // Return set of filieres (strings) related to an exam
  _getExamFilieres(exam) {
    const out = new Set();
    if (!exam) return out;
    if (exam.filiere) {
      out.add(String(exam.filiere));
      return out;
    }
    const subjects = Array.isArray(exam.subjects) ? exam.subjects : (exam.subjects ? [exam.subjects] : []);
    const mg = StateManager && StateManager.state && StateManager.state.matiereGroupes ? StateManager.state.matiereGroupes : {};
    subjects.forEach(s => {
      try {
        const entry = mg[s] || {};
        if (entry && entry.filiere) out.add(String(entry.filiere));
      } catch (e) { /* noop */ }
    });
    return out;
  },

  // Return normalized array of subject names for an exam
  _getExamSubjects(exam) {
    if (!exam) return [];
    if (Array.isArray(exam.subjects)) return exam.subjects.map(s => String(s).trim()).filter(Boolean);
    if (exam.subjects) return [String(exam.subjects).trim()];
    return [];
  },

  /**
   * Compute allocation for an exam object. 
   * @param {Object} exam - must contain studentsCount (number), date, startTime, endTime. 
   * @returns {{allocations:Array<{room:string,capacity:number,assigned:number}>, remaining:number, totalAssigned:number, usedRooms:Array, error? :string}}
   */
  computeAllocationForExam(exam) {
    const result = { allocations: [], remaining: 0, totalAssigned: 0, usedRooms: [] };
    if (!exam) return result;
    const students = Number(exam.studentsCount || exam.totalStudents || 0);
    result.remaining = Number.isFinite(students) ? students : 0;
    if (!Number.isFinite(result.remaining) || result.remaining <= 0) return result;

    // Prevent scheduling the same subject more than once within the same filière
    try {
      const myFilieres = this._getExamFilieres(exam);
      const mySubjects = this._getExamSubjects(exam);
      if (mySubjects.length > 0 && myFilieres.size > 0) {
        const exams = Array.isArray(StateManager.state.examens) ? StateManager.state.examens : [];
        for (const other of exams) {
          if (!other || other.id === exam.id) continue;
          const otherFilieres = this._getExamFilieres(other);
          let filiereOverlap = false;
          for (const f of myFilieres) if (otherFilieres.has(f)) { filiereOverlap = true; break; }
          if (!filiereOverlap) continue;
          const otherSubjects = this._getExamSubjects(other);
          const shared = mySubjects.filter(s => otherSubjects.includes(s));
          if (shared.length > 0) {
            result.error = 'subject_duplicate';
            result.conflictingExamId = other.id;
            result.conflictingSubjects = shared;
            return result;
          }
        }
      }
    } catch (e) {
      console.warn('ExamScheduler: subject-duplication detection failed', e);
    }

    // Interdire la planification si une autre matière de la même filière a un examen au même créneau
    try {
      const myFilieres = this._getExamFilieres(exam);
      if (myFilieres.size > 0) {
        const allExams = Array.isArray(StateManager.state.examens) ? StateManager.state.examens : [];
        for (const other of allExams) {
          if (!other || other.id === exam.id) continue;
          if (!this._timesOverlap(exam.date, exam.startTime, exam.endTime, other.date, other.startTime, other.endTime)) continue;
          const otherFilieres = this._getExamFilieres(other);
          for (const f of myFilieres) {
            if (otherFilieres.has(f)) {
              LogService && LogService.warning && LogService.warning(`ExamScheduler: filiere conflict with exam ${other.id} (${f})`);
              result.error = 'filiere_conflict';
              result.conflictingExamId = other.id;
              return result;
            }
          }
        }
      }
    } catch (e) {
      // ignore filiere detection errors and continue
    }

    // available room configs (capacity > 0)
    const allCfg = Array.isArray(StateManager.state.examRoomConfigs) ? StateManager.state.examRoomConfigs.slice() : [];
    if (!allCfg.length) {
      LogService && LogService.warning && LogService.warning('ExamScheduler: no examRoomConfigs available');
      return result;
    }

    // Exclude conflicting rooms used by other exams at the same time
    const conflicts = this._getConflictingRoomsForExam(exam);
    const available = allCfg
      .map(c => ({ room: String(c.room || ''), capacity: Math.max(0, Number(c.capacity || 0)), supervisors: Number(c.supervisors || 0) }))
      .filter(c => c.room && c.capacity > 0 && !conflicts.has(c.room));

    if (!available.length) {
      LogService && LogService.warning && LogService.warning('ExamScheduler: aucune salle disponible après exclusion des conflits');
      return result;
    }

    console.debug && console.debug('ExamScheduler: students=', students, 'availableRooms=', available.length, 'rooms=', available.map(r => `${r.room}:${r.capacity}`));

    // If a single room can hold all students, choose the smallest such room (best-fit)
    try {
      const singleFit = available.filter(r => r.capacity >= students).sort((a, b) => a.capacity - b.capacity)[0];
      if (singleFit) {
        const assigned = Math.min(singleFit.capacity, students);
        result.allocations.push({ room: singleFit.room, capacity: singleFit.capacity, assigned });
        result.usedRooms.push(singleFit.room);
        result.totalAssigned = assigned;
        result.remaining = Math.max(0, students - assigned);
        console.debug && console.debug('ExamScheduler: used single-room best-fit', singleFit.room, 'cap=', singleFit.capacity, 'assigned=', assigned);
        return result;
      }
    } catch (e) {
      // ignore diagnostics errors
    }

    // FIRST TRY: Greedy fill (largest-first)
    const bySizeDesc = available.slice().sort((a, b) => b.capacity - a.capacity);
    let greedyRem = students;
    const greedyChosenRooms = [];
    for (const r of bySizeDesc) {
      if (greedyRem <= 0) break;
      greedyChosenRooms.push(r);
      greedyRem -= r.capacity;
    }
    if (greedyRem <= 0) {
      const sumGreedy = greedyChosenRooms.reduce((s, x) => s + x.capacity, 0);

      const findBestSubset = (rooms, maxK) => {
        const K = Math.min(maxK, rooms.length);
        if (K <= 0) return null;
        const subsetRooms = rooms.slice(0, K);
        const limit = 1 << K;
        let bestMask = 0;
        let bestSum = Infinity;
        for (let mask = 1; mask < limit; mask++) {
          let ssum = 0;
          for (let i = 0; i < K; i++) if ((mask >> i) & 1) ssum += subsetRooms[i].capacity;
          if (ssum >= students && ssum < bestSum) {
            bestSum = ssum;
            bestMask = mask;
            if (bestSum === students) break;
          }
        }
        if (bestMask === 0) return null;
        const picked = [];
        for (let i = 0; i < K; i++) if ((bestMask >> i) & 1) picked.push(subsetRooms[i]);
        return { rooms: picked, sum: bestSum };
      };

      const K = Math.min(16, available.length);
      const topRooms = available.slice().sort((a, b) => b.capacity - a.capacity);
      let best = null;
      const cand1 = findBestSubset(topRooms, K);
      if (cand1 && cand1.sum < sumGreedy) best = cand1;
      if (!best && greedyChosenRooms.length > 0) {
        const largestGreedy = greedyChosenRooms[0].room;
        const withoutLargest = topRooms.filter(r => r.room !== largestGreedy);
        const cand2 = findBestSubset(withoutLargest, K);
        if (cand2 && cand2.sum < sumGreedy) best = cand2;
      }

      let chosenRooms = [];
      if (best && Array.isArray(best.rooms) && best.rooms.length) {
        chosenRooms = best.rooms;
      } else {
        chosenRooms = greedyChosenRooms.slice();
      }

      chosenRooms.sort((a, b) => b.capacity - a.capacity);
      let remaining = students;
      let totalAssigned = 0;
      chosenRooms.forEach(r => {
        if (remaining <= 0) return;
        const assigned = Math.min(r.capacity, remaining);
        result.allocations.push({ room: r.room, capacity: r.capacity, assigned });
        remaining -= assigned;
        totalAssigned += assigned;
        result.usedRooms.push(r.room);
      });
      result.remaining = remaining;
      result.totalAssigned = totalAssigned;
      console.debug && console.debug('ExamScheduler: used greedy (with refinement) totalAssigned=', totalAssigned, 'remaining=', remaining);
      return result;
    }

    // DP subset-sum fallback (rest of algorithm continues as before...)
    const caps = available.map(r => r.capacity);
    const n = caps.length;
    const totalCap = caps.reduce((s, v) => s + v, 0);

    if (totalCap > 10000 || n > 50) {
      LogService && LogService.warning && LogService.warning('ExamScheduler: problem too large for exact DP, using heuristic fallback');
      const K = Math.min(15, bySizeDesc.length);
      const top = bySizeDesc.slice(0, K);
      let bestSum = -1;
      let bestMask = 0;
      const limit = 1 << K;
      for (let mask = 1; mask < limit; mask++) {
        let sum = 0;
        for (let i = 0; i < K; i++) if ((mask >> i) & 1) sum += top[i].capacity;
        if (sum >= students) {
          if (bestSum === -1 || sum < bestSum) {
            bestSum = sum;
            bestMask = mask;
          }
        } else if (bestSum === -1) {
          if (sum > bestSum) { bestSum = sum; bestMask = mask; }
        }
      }
      if (bestSum > 0) {
        const usedIdx = [];
        for (let i = 0; i < K; i++) if ((bestMask >> i) & 1) usedIdx.push(i);
        const chosenRooms = usedIdx.map(i => ({ ...top[i], _idx: i })).sort((a, b) => b.capacity - a.capacity);
        let remaining = students;
        let totalAssigned = 0;
        chosenRooms.forEach(r => {
          if (remaining <= 0) return;
          const assigned = Math.min(r.capacity, remaining);
          result.allocations.push({ room: r.room, capacity: r.capacity, assigned });
          remaining -= assigned;
          totalAssigned += assigned;
          result.usedRooms.push(r.room);
        });
        result.remaining = remaining;
        result.totalAssigned = totalAssigned;
        return result;
      }
      let remainingF = students;
      let totalAssignedF = 0;
      for (const r of bySizeDesc) {
        if (remainingF <= 0) break;
        const assigned = Math.min(r.capacity, remainingF);
        result.allocations.push({ room: r.room, capacity: r.capacity, assigned });
        remainingF -= assigned;
        totalAssignedF += assigned;
        result.usedRooms.push(r.room);
      }
      result.remaining = remainingF;
      result.totalAssigned = totalAssignedF;
      return result;
    }

    const dp = new Int32Array(totalCap + 1).fill(-1);
    dp[0] = -2;
    const prev = new Int32Array(totalCap + 1).fill(-1);

    for (let i = 0; i < n; i++) {
      const cap = caps[i];
      for (let s = totalCap; s >= cap; s--) {
        if (dp[s] === -1 && dp[s - cap] !== -1) {
          dp[s] = i;
          prev[s] = s - cap;
        }
      }
    }

    let chosenSum = -1;
    for (let s = students; s <= totalCap; s++) {
      if (dp[s] !== -1) {
        chosenSum = s;
        break;
      }
    }

    if (chosenSum === -1) {
      for (let s = totalCap; s >= 0; s--) {
        if (dp[s] !== -1) { chosenSum = s; break; }
      }
    }

    if (chosenSum <= 0) {
      return result;
    }

    const usedIdx = new Set();
    let s = chosenSum;
    while (s > 0 && dp[s] !== -2 && dp[s] !== -1) {
      const idx = dp[s];
      usedIdx.add(idx);
      s = prev[s] >= 0 ? prev[s] : 0;
    }

    const chosenRooms = Array.from(usedIdx).map(i => ({ ...available[i], _idx: i }));
    chosenRooms.sort((a, b) => b.capacity - a.capacity);

    let remaining = Number(result.remaining);
    let totalAssigned = 0;
    chosenRooms.forEach(r => {
      if (remaining <= 0) return;
      const assigned = Math.min(r.capacity, remaining);
      result.allocations.push({ room: r.room, capacity: r.capacity, assigned });
      remaining -= assigned;
      totalAssigned += assigned;
      result.usedRooms.push(r.room);
    });

    result.remaining = remaining;
    result.totalAssigned = totalAssigned;
    return result;
  },

  /**
   * NOUVEAU: Applique l'allocation calculée à un examen et dispatch event
   * @param {Object} exam - L'objet examen
   * @param {Object} allocationResult - Résultat de computeAllocationForExam
   * @returns {Array} - Les allocations au format simplifié
   */
  applyAllocationToExam(exam, allocationResult) {
    if (! exam || !allocationResult) return [];

    // CORRECTION: Inclure la capacité dans les allocations sauvegardées
    const allocations = (allocationResult.allocations || []).map(a => ({
        room: a.room,
        capacity: a.capacity || 0,  // ✅ AJOUTER capacity depuis allocationResult
        students: a. assigned || 0,
        assigned: a.assigned || 0   // Garder aussi assigned pour compatibilité
    }));

    // Mettre à jour l'examen avec les allocations COMPLÈTES
    exam.allocations = allocations;
    exam.rooms = allocations.map(a => a.room);
    exam. salles = allocations.map(a => a.room). join(', ');
    exam.totalAssigned = allocationResult.totalAssigned || 0;
    exam.remaining = allocationResult.remaining || 0;

    const hasId = exam.id !== null && exam.id !== undefined;

    if (hasId) {
        try {
            if (StateManager?. saveState) {
                StateManager. saveState();
                console.log('[ExamScheduler] State saved for exam', exam.id);
            }
        } catch (e) {
            console.warn('[ExamScheduler] Failed to save state', e);
        }

        try {
            document.dispatchEvent(new CustomEvent('exam:scheduled', {
                detail: {
                    examId: exam.id,
                    allocations: allocations,  // ✅ Avec capacity inclus
                    totalAssigned: allocationResult.totalAssigned,
                    remaining: allocationResult.remaining
                }
            }));
            console.log('[ExamScheduler] ✅ Dispatched exam:scheduled for exam', exam.id);
        } catch (e) {
            console.warn('[ExamScheduler] Failed to dispatch event', e);
        }
    } else {
        console.log('[ExamScheduler] ℹ️ Exam not yet persisted (no id), skipping dispatch');
    }

    return allocations;
},

  //**

scheduleExam(exam) {
    if (!exam) return { ok: false, error: 'Exam is null' };

    const examId = exam.id;
    
    if (!examId) {
        console.warn('[ExamScheduler] ⚠️ scheduleExam() called on exam without id.  Use computeAllocationForExam() instead for new exams.');
        // Calculer quand même mais ne pas sauvegarder
        const allocationResult = this.computeAllocationForExam(exam);
        
        if (allocationResult.error) {
            return { 
                ok: false, 
                error: allocationResult.error,
                conflictingExamId: allocationResult.conflictingExamId,
                conflictingSubjects: allocationResult.conflictingSubjects
            };
        }

        const allocations = (allocationResult.allocations || []).map(a => ({
            room: a.room,
            students: a.assigned || 0
        }));

        return {
            ok: true,
            allocations: allocations,
            totalAssigned: allocationResult.totalAssigned,
            remaining: allocationResult. remaining,
            usedRooms: allocationResult.usedRooms,
            warning: 'Exam not persisted (no id)'
        };
    }

    console.log('[ExamScheduler] Scheduling exam:', examId);

    // Calculer l'allocation
    const allocationResult = this. computeAllocationForExam(exam);

    // Vérifier les erreurs
    if (allocationResult.error) {
        console.warn('[ExamScheduler] Allocation error:', allocationResult.error);
        return { 
            ok: false, 
            error: allocationResult.error,
            conflictingExamId: allocationResult.conflictingExamId,
            conflictingSubjects: allocationResult.conflictingSubjects
        };
    }

    // Vérifier si des salles ont été trouvées
    if (! allocationResult.allocations || allocationResult.allocations.length === 0) {
        console.warn('[ExamScheduler] No rooms allocated');
        return {
            ok: false,
            error: 'Aucune salle disponible pour cet examen'
        };
    }

    // Appliquer l'allocation
    const allocations = this. applyAllocationToExam(exam, allocationResult);

    console.log('[ExamScheduler] ✅ Exam scheduled successfully:', {
        examId: examId,
        allocations: allocations. length,
        totalAssigned: allocationResult.totalAssigned,
        remaining: allocationResult.remaining
    });

    return {
        ok: true,
        allocations: allocations,
        totalAssigned: allocationResult.totalAssigned,
        remaining: allocationResult.remaining,
        usedRooms: allocationResult. usedRooms
    };
}
};

export default ExamSchedulerService;