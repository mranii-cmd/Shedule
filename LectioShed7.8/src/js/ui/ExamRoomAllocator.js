/**
 * ExamRoomAllocator - Gestionnaire de répartition manuelle des étudiants aux salles d'examens
 * Version corrigée - TOUTES fonctionnalités opérationnelles
 * @author Ibrahim Mrani - UCD
 */

console.debug?.('Loading ExamRoomAllocator. js (fixed) —', new Date().toISOString());

import StateManager from '../controllers/StateManager.js';
import DialogManager from './DialogManager.js';
import NotificationManager from './NotificationManager.js';
import LogService from '../services/LogService.js';
import ExamRenderer from './ExamRenderer.js';
import { getRoomCapacity, formatRoomWithCapacity } from '../utils/roomUtils.js';

class ExamRoomAllocator {
  constructor() {
    this._inited = false;
  }

  init() {
    if (this._inited) return;
    this._inited = true;

    try {
      const btn = document.getElementById('btnManageExamRooms');
      if (btn && !btn._examAllocatorAttached) {
        btn.addEventListener('click', () => this.openAllocatorModal());
        btn._examAllocatorAttached = true;
      }
    } catch (e) {
      console.warn('ExamRoomAllocator. init failed', e);
    }

    // Écouter les événements de planification automatique
    this._listenToAutoSchedule();

    try { window.EDTExamRoomAllocator = this; } catch (e) { /* noop */ }
  }

  /**
   * Synchronise les allocations après planification automatique
   */
  _listenToAutoSchedule() {
    document.addEventListener('exam:scheduled', (e) => {
      console.log('[ERA] Event exam:scheduled received:', e.detail);

      try {
        const examId = e.detail?.examId;
        const allocations = e.detail?.allocations || e.detail?.roomAllocations;

        if (examId && allocations && Array.isArray(allocations)) {
          this._syncAllocations(examId, allocations);
        }
      } catch (err) {
        console.error('[ERA] Error syncing auto-schedule:', err);
      }
    });

    document.addEventListener('exam:updated', (e) => {
      console.log('[ERA] Event exam:updated received:', e.detail);

      try {
        const examId = e.detail?.examId || e.detail?.id;
        if (examId) {
          this._syncExamAllocations(examId);
        }
      } catch (err) {
        console.error('[ERA] Error syncing exam update:', err);
      }
    });
  }

  /**
   * Synchronise les allocations d'un examen dans examRoomConfigs
   */
  _syncAllocations(examId, allocations) {
    console.log('[ERA] Syncing allocations for exam', examId, ':', allocations);

    // Normaliser le format
    const normalized = allocations.map(a => ({
      room: a.room,
      students: a.students !== undefined ? a.students : (a.assigned || 0)
    }));

    const cfg = this._ensureExamRoomConfigs();
    cfg[String(examId)] = normalized;

    try {
      StateManager?.saveState?.();
      console.log('[ERA] Allocations synced to examRoomConfigs');
    } catch (e) {
      console.warn('[ERA] Failed to save state after sync', e);
    }
  }

  /**
   * Synchronise depuis exam. allocations vers examRoomConfigs
   */
  _syncExamAllocations(examId) {
    const exams = this._getExams();
    const exam = exams.find(e => String(e.id) === String(examId));

    if (!exam) return;

    const allocations = this._extractAllocationsFromExam(exam);

    if (allocations && allocations.length > 0 && allocations.some(a => a.room)) {
      this._syncAllocations(examId, allocations);
    }
  }

  /**
   * Extrait les allocations depuis un objet exam
   */
  _extractAllocationsFromExam(exam) {
    // 1. exam.allocations (priorité)
    if (exam.allocations && Array.isArray(exam.allocations) && exam.allocations.length > 0) {
      console.log('[ERA] Found exam.allocations:', exam.allocations);
      return exam.allocations.map(a => ({
        room: a.room,
        students: a.students !== undefined ? a.students : (a.assigned || 0)
      }));
    }

    // 2.  exam.roomAllocations
    if (exam.roomAllocations && Array.isArray(exam.roomAllocations) && exam.roomAllocations.length > 0) {
      console.log('[ERA] Found exam.roomAllocations:', exam.roomAllocations);
      return exam.roomAllocations.map(a => ({
        room: a.room,
        students: a.students !== undefined ? a.students : (a.assigned || 0)
      }));
    }

    // 3. exam.salles (string ou array)
    if (exam.salles) {
      let roomsList = [];

      if (typeof exam.salles === 'string') {
        roomsList = exam.salles.split(',').map(r => r.trim()).filter(Boolean);
      } else if (Array.isArray(exam.salles)) {
        roomsList = exam.salles.filter(Boolean);
      }

      if (roomsList.length > 0) {
        const totalStudents = exam.studentsCount || exam.nbEtudiants || exam.totalStudents || 0;

        if (totalStudents > 0) {
          const perRoom = Math.floor(totalStudents / roomsList.length);
          let remainder = totalStudents % roomsList.length;

          const allocations = roomsList.map(room => {
            const students = perRoom + (remainder > 0 ? 1 : 0);
            remainder = Math.max(0, remainder - 1);
            return { room, students };
          });

          console.log('[ERA] Created allocations from exam.salles:', allocations);
          return allocations;
        }
      }
    }

    return [];
  }

  // === HELPERS ===

  _getExams() {
    try {
      return StateManager?.state?.examens || StateManager?.state?.examensList || [];
    } catch (e) {
      return [];
    }
  }

  _getRooms() {
    try {
      const info = StateManager?.state?.sallesInfo || {};
      return Object.keys(info).sort();
    } catch (e) {
      return [];
    }
  }

  _getRoomsInfo() {
    return StateManager?.state?.sallesInfo || {};
  }

  _getExamRoomConfigs() {
    try {
      return StateManager?.state?.examRoomConfigs || {};
    } catch (e) {
      return {};
    }
  }

  _ensureExamRoomConfigs() {
    try {
      if (!StateManager?.state) {
        window.__examRoomConfigs = window.__examRoomConfigs || {};
        return window.__examRoomConfigs;
      }
      if (!StateManager.state.examRoomConfigs) {
        StateManager.state.examRoomConfigs = {};
      }
      return StateManager.state.examRoomConfigs;
    } catch (e) {
      window.__examRoomConfigs = window.__examRoomConfigs || {};
      return window.__examRoomConfigs;
    }
  }

  _escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _formatExamLabel(exam) {
    try {
      const parts = [];
      const title = exam.titre || exam.title || exam.nom || exam.name || '';
      const date = exam.date || exam.dateExam || exam.dateExamen || '';
      const start = exam.heureDebut || exam.start || exam.debut || '';
      const end = exam.heureFin || exam.end || exam.fin || '';
      const students = exam.nbEtudiants ?? exam.studentsCount ?? exam.totalStudents ?? '';

      if (title) parts.push(title);
      if (date) parts.push(date);
      if (start || end) parts.push(`${start || '? '}–${end || '?'}`);
      if (students !== '') parts.push(`${students} étudiants`);

      return parts.length ? parts.join(' — ') : `Examen ${exam.id || ''}`;
    } catch (e) {
      return `Examen ${exam?.id || ''}`;
    }
  }

  _getRoomCapacity(roomName) {
    if (!roomName) return 0;

    console.log('[ERA] Getting capacity for room:', roomName);

    // 1. Chercher dans examRoomConfigs (c'est un ARRAY)
    try {
      const configs = StateManager?.state?.examRoomConfigs || [];
      if (Array.isArray(configs)) {
        const config = configs.find(c => c.room === roomName);
        if (config?.capacity) {
          console.log('[ERA] Found capacity in examRoomConfigs:', config.capacity);
          return config.capacity;
        }
      }
    } catch (e) {
      console.warn('[ERA] Error reading examRoomConfigs', e);
    }

    // 2. Chercher dans sallesInfo
    try {
      const roomsInfo = this._getRoomsInfo();
      const info = roomsInfo[roomName];

      if (info && typeof info === 'object') {
        const cap = info.capacity || info.capacite || 0;
        if (cap > 0) {
          console.log('[ERA] Found capacity in sallesInfo (object):', cap);
          return cap;
        }
      }

      // 3. Heuristiques basées sur le type
      if (typeof info === 'string') {
        if (info === 'Amphi' || info.toLowerCase().includes('amphi')) {
          console.log('[ERA] Using heuristic for Amphi:', 200);
          return 200;
        }
        if (info === 'Standard') {
          console.log('[ERA] Using heuristic for Standard:', 50);
          return 50;
        }
        if (info === 'STP') {
          console.log('[ERA] Using heuristic for STP:', 30);
          return 30;
        }
      }
    } catch (e) {
      console.warn('[ERA] Error reading sallesInfo', e);
    }

    // 4. Heuristique basée sur le NOM de la salle
    const nameLower = roomName.toLowerCase();
    if (nameLower.includes('amphi')) {
      console.log('[ERA] Using name-based heuristic for Amphi:', 200);
      return 200;
    }
    if (nameLower.includes('tp')) {
      console.log('[ERA] Using name-based heuristic for TP:', 30);
      return 30;
    }
    if (nameLower.includes('td')) {
      console.log('[ERA] Using name-based heuristic for TD:', 40);
      return 40;
    }

    console.warn('[ERA] No capacity found for room:', roomName);
    return 0;
  }

  /**
    * Calcule la capacité totale de TOUTES les salles enregistrées
    * @returns {number} Capacité totale
    */
  /**
   * Calcule la capacité totale de TOUTES les salles enregistrées
   * @returns {number} Capacité totale
   */
  _getTotalRoomsCapacity() {
    try {
      let totalCapacity = 0;
      console.log('[ERA] ===== Calculating total rooms capacity =====');

      // 1. Chercher d'abord dans examRoomConfigs (Array)
      const configs = StateManager?.state?.examRoomConfigs || [];
      if (Array.isArray(configs) && configs.length > 0) {
        console.log('[ERA] Found examRoomConfigs:', configs.length, 'rooms');
        configs.forEach(config => {
          if (config && config.capacity) {
            const cap = Number(config.capacity) || 0;
            totalCapacity += cap;  // ✅ ADDITIONNER, pas remplacer
            console.log(`[ERA]   - ${config.room}: ${cap}`);
          }
        });
        console.log('[ERA] Total capacity from examRoomConfigs:', totalCapacity);
        return totalCapacity;
      }

      // 2. Sinon, calculer depuis sallesInfo
      const roomsInfo = StateManager?.state?.sallesInfo || {};
      const allRoomNames = Object.keys(roomsInfo);

      console.log('[ERA] Calculating total capacity for', allRoomNames.length, 'rooms from sallesInfo');

      allRoomNames.forEach(roomName => {
        const capacity = this._getRoomCapacity(roomName);
        totalCapacity += capacity;
        console.log(`[ERA]   - ${roomName}: ${capacity}`);
      });

      console.log('[ERA] Total rooms capacity:', totalCapacity);
      console.log('[ERA] ===== Total capacity calculated =====');
      return totalCapacity;

    } catch (e) {
      console.error('[ERA] Error calculating total capacity:', e);
      return 0;
    }
  }


  /* Calcule la capacité restante (non utilisée par les salles déjà sélectionnées)
  * @param {number} usedCapacity - Capacité déjà utilisée
  * @returns {number} Capacité restante
  */
  _getRemainingCapacity(usedCapacity) {
    const totalCapacity = this._getTotalRoomsCapacity();
    return Math.max(0, totalCapacity - usedCapacity);
  }

  /**
 /**
 * Vérifie si une salle est déjà utilisée pour un autre examen au même moment
 * @param {string} roomName - Nom de la salle
 * @param {string} currentExamId - ID de l'examen en cours d'édition
 * @returns {Object|null} Infos sur le conflit ou null
 */
  _checkRoomConflict(roomName, currentExamId) {
    if (!roomName) return null;

    const exams = this._getExams();
    const currentExam = exams.find(e => String(e.id) === String(currentExamId));

    if (!currentExam) return null;

    // ✅ Utiliser les bons champs : date, startTime, endTime
    const currentDate = currentExam.date || '';
    const currentStart = currentExam.startTime || '';
    const currentEnd = currentExam.endTime || '';

    if (!currentDate || !currentStart || !currentEnd) {
      console.warn('[ERA] Current exam missing date/time info');
      return null;
    }

    console.log('[ERA] Checking conflicts for:', {
      room: roomName,
      exam: currentExam.title,
      date: currentDate,
      time: `${currentStart}-${currentEnd}`
    });

    // Chercher les conflits
    for (const exam of exams) {
      // Ignorer l'examen en cours
      if (String(exam.id) === String(currentExamId)) continue;

      const examDate = exam.date || '';
      const examStart = exam.startTime || '';
      const examEnd = exam.endTime || '';

      // Vérifier si même date
      if (examDate !== currentDate) continue;

      // Vérifier si chevauchement horaire
      if (!examStart || !examEnd) continue;

      const overlap = this._timesOverlap(
        currentStart, currentEnd,
        examStart, examEnd
      );

      if (!overlap) continue;

      // Vérifier si la salle est utilisée
      const roomUsed = this._examUsesRoom(exam, roomName);

      if (roomUsed) {
        console.log('[ERA] ⚠️ CONFLICT FOUND:', {
          room: roomName,
          currentExam: currentExam.title,
          conflictExam: exam.title,
          date: examDate,
          time: `${examStart}-${examEnd}`
        });

        return {
          examId: exam.id,
          examTitle: exam.title || exam.titre || `Examen ${exam.id}`,
          date: examDate,
          start: examStart,
          end: examEnd
        };
      }
    }

    return null;
  }

  /**
   * Vérifie si deux plages horaires se chevauchent
   * @param {string} start1 - Heure début 1 (HH:MM)
   * @param {string} end1 - Heure fin 1 (HH:MM)
   * @param {string} start2 - Heure début 2 (HH:MM)
   * @param {string} end2 - Heure fin 2 (HH:MM)
   * @returns {boolean} True si chevauchement
   */
  _timesOverlap(start1, end1, start2, end2) {
    try {
      const toMinutes = (time) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
      };

      const s1 = toMinutes(start1);
      const e1 = toMinutes(end1);
      const s2 = toMinutes(start2);
      const e2 = toMinutes(end2);

      // Chevauchement si : start1 < end2 ET start2 < end1
      return s1 < e2 && s2 < e1;
    } catch (e) {
      console.warn('[ERA] Error checking time overlap:', e);
      return false;
    }
  }

  /**
   * Vérifie si un examen utilise une salle
   * @param {Object} exam - L'examen
   * @param {string} roomName - Nom de la salle
   * @returns {boolean} True si la salle est utilisée
   */
  _examUsesRoom(exam, roomName) {
    // 1. Dans exam.allocations
    if (exam.allocations && Array.isArray(exam.allocations)) {
      if (exam.allocations.some(a => a.room === roomName)) {
        return true;
      }
    }

    // 2. Dans exam.roomAllocations
    if (exam.roomAllocations && Array.isArray(exam.roomAllocations)) {
      if (exam.roomAllocations.some(a => a.room === roomName)) {
        return true;
      }
    }

    // 3. Dans exam.rooms (array)
    if (Array.isArray(exam.rooms)) {
      if (exam.rooms.includes(roomName)) {
        return true;
      }
    }

    // 4. Dans exam.salles (string)
    if (typeof exam.salles === 'string') {
      const rooms = exam.salles.split(',').map(r => r.trim());
      if (rooms.includes(roomName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Récupère la liste des salles déjà planifiées pour d'autres examens au même créneau
   * @param {string} currentExamId - ID de l'examen en cours
   * @returns {Array<string>} Liste des noms de salles en conflit
   */
  _getConflictingRooms(currentExamId) {
    if (!currentExamId) return [];

    const exams = this._getExams();
    const currentExam = exams.find(e => String(e.id) === String(currentExamId));

    if (!currentExam) return [];

    const currentDate = currentExam.date || '';
    const currentStart = currentExam.startTime || '';
    const currentEnd = currentExam.endTime || '';

    if (!currentDate || !currentStart || !currentEnd) {
      console.warn('[ERA] Current exam missing date/time, cannot check conflicts');
      return [];
    }

    const conflictingRooms = new Set();

    // Parcourir tous les autres examens
    for (const exam of exams) {
      // Ignorer l'examen en cours
      if (String(exam.id) === String(currentExamId)) continue;

      const examDate = exam.date || '';
      const examStart = exam.startTime || '';
      const examEnd = exam.endTime || '';

      // Vérifier si même date
      if (examDate !== currentDate) continue;

      // Vérifier si chevauchement horaire
      if (!examStart || !examEnd) continue;

      const overlap = this._timesOverlap(currentStart, currentEnd, examStart, examEnd);

      if (!overlap) continue;

      // Ajouter toutes les salles de cet examen
      this._extractRoomsFromExam(exam).forEach(room => {
        if (room) conflictingRooms.add(room);
      });
    }

    const result = Array.from(conflictingRooms);

    console.log('[ERA] Conflicting rooms for exam', currentExam.title, ':', result);

    return result;
  }

  /**
   * Extrait la liste des salles d'un examen
   * @param {Object} exam - L'examen
   * @returns {Array<string>} Liste des noms de salles
   */
  _extractRoomsFromExam(exam) {
    const rooms = [];

    // 1. Depuis allocations
    if (exam.allocations && Array.isArray(exam.allocations)) {
      exam.allocations.forEach(a => {
        if (a.room) rooms.push(a.room);
      });
    }

    // 2. Depuis roomAllocations
    if (exam.roomAllocations && Array.isArray(exam.roomAllocations)) {
      exam.roomAllocations.forEach(a => {
        if (a.room) rooms.push(a.room);
      });
    }

    // 3. Depuis rooms (array)
    if (Array.isArray(exam.rooms)) {
      exam.rooms.forEach(r => {
        if (r) rooms.push(r);
      });
    }

    // 4. Depuis salles (string)
    if (typeof exam.salles === 'string' && exam.salles.trim()) {
      const roomsList = exam.salles.split(',').map(r => r.trim()).filter(Boolean);
      roomsList.forEach(r => rooms.push(r));
    }

    // Retourner une liste unique
    return [... new Set(rooms)];
  }

  /**
   * Récupère allocations avec sync auto si nécessaire
   */
  _getAllocationsForExam(examId) {
    const examIdStr = String(examId);
    console.log('[ERA] ===== Getting allocations for exam:', examIdStr, '=====');

    // 1. Dans examRoomConfigs
    const configs = this._getExamRoomConfigs();

    if (configs[examIdStr] && Array.isArray(configs[examIdStr]) && configs[examIdStr].length > 0) {
      const hasRooms = configs[examIdStr].some(a => a.room);
      if (hasRooms) {
        console.log('[ERA] ✅ Found in examRoomConfigs:', configs[examIdStr]);
        return configs[examIdStr].map(a => ({
          room: a.room,
          students: a.students !== undefined ? a.students : (a.assigned || 0)
        }));
      }
    }

    // 2. Dans exam object - puis SYNC
    const exams = this._getExams();
    const exam = exams.find(e => String(e.id) === examIdStr);

    if (!exam) {
      console.warn('[ERA] ❌ Exam not found! ');
      return [{ room: '', students: 0 }];
    }

    const allocations = this._extractAllocationsFromExam(exam);

    if (allocations && allocations.length > 0 && allocations.some(a => a.room)) {
      console.log('[ERA] ✅ Extracted from exam, syncing:', allocations);
      this._syncAllocations(examIdStr, allocations);
      return allocations;
    }

    console.warn('[ERA] ⚠️ No allocations found');
    return [{ room: '', students: 0 }];
  }

  // === BUILD ROW HTML ===

  _buildRowHtml(index, alloc, rooms) {
    console.log('[ERA] Building row', index, 'alloc:', alloc);

    if (!alloc) {
      console.error('[ERA] alloc is null/undefined! ');
      alloc = { room: '', students: 0 };
    }

    // ✅ Récupérer l'ID de l'examen actuel
    const examSelect = document.getElementById('era-exam-select');
    const currentExamId = examSelect?.value || '';

    const roomOptions = rooms.map(r => {
      const capacity = this._getRoomCapacity(r);
      const label = capacity ? `${r} (${capacity})` : r;
      const selected = alloc.room === r ? 'selected' : '';

      // ✅ Vérifier les conflits
      let warningAttr = '';
      if (currentExamId) {
        const conflict = this._checkRoomConflict(r, currentExamId);
        if (conflict) {
          warningAttr = ` data-conflict="true" data-conflict-exam="${this._escapeHtml(conflict.examTitle)}" data-conflict-time="${this._escapeHtml(conflict.start)}-${this._escapeHtml(conflict.end)}"`;
        }
      }

      return `<option value="${this._escapeHtml(r)}" ${selected}${warningAttr}>${this._escapeHtml(label)}</option>`;
    }).join('');

    const studentsVal = (alloc.students !== null && alloc.students !== undefined) ? String(alloc.students) : '';
    const capacity = alloc.room ? this._getRoomCapacity(alloc.room) : 0;
    const studentsNum = (alloc.students !== null && alloc.students !== undefined) ? Number(alloc.students) : 0;
    const occupancy = capacity > 0 ? Math.round((studentsNum / capacity) * 100) : 0;
    const progressColor = occupancy > 100 ? '#dc3545' : occupancy > 80 ? '#ffc107' : '#28a745';

    return `
    <div class="era-row" data-index="${index}" style="display:grid; grid-template-columns:2fr 1fr 1.5fr 2fr 100px; gap:10px; align-items:center; padding:12px; border-bottom:1px solid #e9ecef; transition: background-color 0. 2s ease;">
      <div>
        <select class="era-room-select" style="width:100%; padding:8px; border:2px solid #e0e0e0; border-radius:6px; transition: all 0.2s ease; font-size:0.9em;">
          <option value="">-- Sélectionner --</option>
          ${roomOptions}
        </select>
      </div>
      <div style="text-align:center; color:#6c757d; font-weight:500;">
        <span class="era-capacity-value">${capacity || '—'}</span>
      </div>
      <div>
        <input type="number" class="era-students-input" value="${this._escapeHtml(studentsVal)}" 
               min="0" placeholder="0" style="width:100%; padding:8px; border:2px solid #e0e0e0; border-radius:6px; transition: all 0.2s ease; text-align:center; font-weight:600;">
      </div>
      <div>
        <div style="position:relative; width:100%; height:20px; background:#e9ecef; border-radius:10px; overflow:hidden;">
          <div class="era-progress-fill" style="width:${Math.min(100, occupancy)}%; height:100%; background:${progressColor}; transition:width 0.3s;"></div>
          <span class="era-progress-text" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:0.75em; font-weight:600; color:#495057;">${occupancy}%</span>
        </div>
      </div>
      <div style="display:flex; gap:5px; justify-content:center;">
        <button class="era-move-btn btn btn-sm btn-info" title="Déplacer des étudiants" style="padding:6px 10px; font-size:1.1em; transition: transform 0.2s ease;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">↔️</button>
        <button class="era-delete-btn btn btn-sm btn-danger" title="Supprimer cette salle" style="padding:6px 10px; font-size:1.1em; transition: transform 0. 2s ease;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">🗑️</button>
      </div>
    </div>
  `;
  }

  // === ACTIONS ===

  _addRow(container) {
    // 1. Récupérer toutes les salles
    const allRooms = this._getRooms();

    // 2. Salles déjà utilisées dans cette modale
    const usedInModal = Array.from(container.querySelectorAll('.era-room-select'))
      .map(s => s.value)
      .filter(Boolean);

    // 3. ✅ NOUVEAU : Salles déjà planifiées pour d'autres examens au même créneau
    const examSelect = document.getElementById('era-exam-select');
    const currentExamId = examSelect?.value;
    const conflictingRooms = this._getConflictingRooms(currentExamId);

    console.log('[ERA] All rooms:', allRooms.length);
    console.log('[ERA] Used in modal:', usedInModal);
    console.log('[ERA] Conflicting rooms:', conflictingRooms);

    // 4.  Filtrer les salles disponibles
    const available = allRooms.filter(r =>
      !usedInModal.includes(r) && !conflictingRooms.includes(r)
    );

    console.log('[ERA] Available rooms:', available);

    if (available.length === 0) {
      const msg = conflictingRooms.length > 0
        ? 'Toutes les salles sont occupées ou déjà planifiées à ce créneau'
        : 'Toutes les salles sont utilisées';

      NotificationManager?.warning(msg);
      return;
    }

    // 5. Créer la nouvelle ligne
    const newIndex = container.children.length;
    const div = document.createElement('div');
    div.innerHTML = this._buildRowHtml(newIndex, { room: '', students: 0 }, available);
    container.appendChild(div.firstElementChild);

    this._updateStats();

    // Afficher un message informatif
    const totalRooms = allRooms.length;
    const usedCount = usedInModal.length;
    const conflictCount = conflictingRooms.length;
    const availableCount = available.length;

    console.log('[ERA] Salles:', {
      total: totalRooms,
      'utilisées ici': usedCount,
      'en conflit': conflictCount,
      'disponibles': availableCount
    });

    if (conflictingRooms.length > 0) {
      NotificationManager?.info(
        `${availableCount} salle(s) disponible(s) • ` +
        `${conflictCount} salle(s) déjà planifiée(s) à ce créneau`
      );
    } else {
      NotificationManager?.success('Salle ajoutée');
    }
  }

  _deleteRow(row) {
    const input = row.querySelector('.era-students-input');
    const count = Number(input?.value) || 0;

    const container = document.getElementById('era-rows');
    const allRows = Array.from(container.querySelectorAll('.era-row'));
    const others = allRows.filter(r => r !== row && r.querySelector('.era-room-select')?.value);

    if (count > 0) {
      if (others.length === 0) {
        NotificationManager?.error(`Impossible: aucune salle pour redistribuer ${count} étudiants.\nAjoutez d'abord une salle.`);
        return;
      }

      if (!confirm(`Redistribuer ${count} étudiants vers les autres salles?`)) {
        return;
      }

      const perRoom = Math.floor(count / others.length);
      let remainder = count % others.length;

      others.forEach(r => {
        const inp = r.querySelector('.era-students-input');
        const cur = Number(inp.value) || 0;
        const add = perRoom + (remainder > 0 ? 1 : 0);
        inp.value = String(cur + add);
        remainder = Math.max(0, remainder - 1);
      });
    }

    row.remove();
    this._updateStats();
  }

  _redistribute() {
    const examSelect = document.getElementById('era-exam-select');
    const examId = examSelect?.value;
    if (!examId) return;

    const exams = this._getExams();
    const exam = exams.find(e => String(e.id) === examId);
    if (!exam) return;

    const total = exam.studentsCount || exam.nbEtudiants || 0;

    const container = document.getElementById('era-rows');
    const allRows = Array.from(container.querySelectorAll('.era-row'));
    const valid = allRows.filter(r => r.querySelector('.era-room-select')?.value);

    if (valid.length === 0) {
      NotificationManager?.error('Aucune salle sélectionnée');
      return;
    }

    const perRoom = Math.floor(total / valid.length);
    let remainder = total % valid.length;

    valid.forEach(r => {
      const inp = r.querySelector('.era-students-input');
      const assigned = perRoom + (remainder > 0 ? 1 : 0);
      inp.value = String(assigned);
      remainder = Math.max(0, remainder - 1);
    });

    this._updateStats();
    NotificationManager?.success('Redistribution effectuée');
  }

  _moveStudents(sourceRow) {
    // ✅ Nettoyer les anciennes modales si elles existent
    const oldModal = document.getElementById('move-modal-overlay');
    if (oldModal) {
      console.log('[ERA] Removing old modal');
      oldModal.remove();
    }

    const sourceInput = sourceRow.querySelector('.era-students-input');
    const sourceSelect = sourceRow.querySelector('.era-room-select');
    const sourceRoom = sourceSelect?.value || '(Non sélectionnée)';

    // ✅ Relire la valeur à chaque appel
    let sourceCount = Number(sourceInput?.value) || 0;

    if (sourceCount === 0) {
      NotificationManager?.warning('Aucun étudiant à déplacer');
      return;
    }

    const container = document.getElementById('era-rows');
    const allRows = Array.from(container.querySelectorAll('.era-row'));

    // ✅ Inclure TOUTES les lignes (même sans salle sélectionnée)
    const targets = allRows.filter(r => r !== sourceRow);

    if (targets.length === 0) {
      NotificationManager?.warning('Aucune autre ligne disponible.  Ajoutez d\'abord une salle.');
      return;
    }

    // ✅ Capturer uniquement les RÉFÉRENCES, pas les valeurs
    const targetRefs = targets.map(r => ({
      row: r,
      input: r.querySelector('.era-students-input'),
      select: r.querySelector('.era-room-select')
    }));

    // Construire les options
    let optionsHtml = targetRefs.map((ref, i) => {
      const roomValue = ref.select?.value || '';
      const roomName = roomValue || '(Non sélectionnée)';
      const current = Number(ref.input?.value) || 0;
      const capacity = roomValue ? this._getRoomCapacity(roomValue) : '—';

      return `<option value="${i}">${this._escapeHtml(roomName)} — ${current} étudiants (cap: ${capacity})</option>`;
    }).join('');

    // Créer la modale HTML complète
    const modalHtml = `
    <div id="move-modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:99999;">
      <div id="move-modal-content" style="background:white; border-radius:12px; max-width:500px; width:90%; box-shadow:0 8px 32px rgba(0,0,0,0.3); animation:slideIn 0.2s ease;">
        
        <!-- Header -->
        <div style="padding:20px; border-bottom:2px solid #e9ecef; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; border-radius:12px 12px 0 0;">
          <h3 style="margin:0; font-size:1.3em; display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.4em;">↔️</span>
            <span>Déplacer des étudiants</span>
          </h3>
        </div>
        
        <!-- Body -->
        <div style="padding:25px;">
          <!-- Source -->
          <div style="margin-bottom:20px; padding:15px; background:#f8f9fa; border-radius:8px; border-left:4px solid #667eea;">
            <div style="font-size:0.85em; color:#6c757d; margin-bottom:5px;">SOURCE</div>
            <div style="font-size:1.1em;">
              <strong>${this._escapeHtml(sourceRoom)}</strong>
              <span id="move-source-count" style="color:#667eea; font-weight:600; margin-left:10px;">${sourceCount} étudiants</span>
            </div>
          </div>
          
          <!-- Destination -->
          <div style="margin-bottom:20px;">
            <label style="display:block; margin-bottom:8px; font-weight:600; color:#495057;">
              <span style="font-size:1. 1em;">📍</span> Destination
            </label>
            <select id="move-target-select" style="width:100%; padding:12px; border:2px solid #e0e0e0; border-radius:8px; font-size:0.95em; transition:all 0.2s ease;" onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102,126,234,0.1)'" onblur="this.style. borderColor='#e0e0e0'; this.style.boxShadow='none'">
              ${optionsHtml}
            </select>
          </div>
          
          <!-- Nombre -->
          <div>
            <label style="display:block; margin-bottom:8px; font-weight:600; color:#495057;">
              <span style="font-size:1. 1em;">🎓</span> Nombre d'étudiants
            </label>
            <input 
              type="number" 
              id="move-count-input" 
              min="1" 
              max="${sourceCount}" 
              value="${sourceCount}" 
              style="width:100%; padding:12px; border:2px solid #e0e0e0; border-radius:8px; font-size:1. 1em; text-align:center; font-weight:600; transition:all 0.2s ease;"
              onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102,126,234,0.1)'"
              onblur="this.style.borderColor='#e0e0e0'; this.style. boxShadow='none'"
            >
            <div id="move-max-hint" style="font-size:0.85em; color:#6c757d; margin-top:5px; text-align:center;">Maximum : ${sourceCount}</div>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="padding:15px 25px; background:#f8f9fa; border-radius:0 0 12px 12px; display:flex; justify-content:flex-end; gap:10px;">
          <button id="move-cancel-btn" class="btn btn-secondary" style="padding:10px 20px;">
            ❌ Annuler
          </button>
          <button id="move-confirm-btn" class="btn btn-primary" style="padding:10px 20px;">
            ✅ Déplacer
          </button>
        </div>
        
      </div>
    </div>
    
    <style>
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    </style>
  `;

    // Insérer dans le DOM
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer.firstElementChild);

    const self = this;

    // Event: Confirm
    document.getElementById('move-confirm-btn').addEventListener('click', function () {
      console.log('[ERA] ===== MOVE CONFIRM CLICKED =====');

      // ✅ RELIRE la valeur source au moment du clic (pas la valeur capturée)
      const currentSourceCount = Number(sourceInput.value) || 0;

      const targetIdx = Number(document.getElementById('move-target-select').value);
      const toMove = Number(document.getElementById('move-count-input').value) || 0;

      console.log('[ERA] Move operation:', {
        currentSourceCount,
        targetIdx,
        toMove,
        sourceInputValue: sourceInput.value
      });

      // Validation
      if (!Number.isFinite(targetIdx) || targetIdx < 0 || targetIdx >= targetRefs.length) {
        console.error('[ERA] Invalid target index');
        NotificationManager?.error('Destination invalide');
        return;
      }

      if (!Number.isFinite(toMove) || toMove <= 0 || toMove > currentSourceCount) {
        console.error('[ERA] Invalid count');
        NotificationManager?.error(`Nombre invalide (max: ${currentSourceCount})`);
        return;
      }

      // Récupérer la cible
      const targetRef = targetRefs[targetIdx];
      const targetCurrent = Number(targetRef.input.value) || 0;
      const targetRoom = targetRef.select.value || '(Non sélectionnée)';

      console.log('[ERA] Before move:', {
        source: sourceInput.value,
        target: targetRef.input.value
      });

      // ✅ DÉPLACER
      sourceInput.value = String(currentSourceCount - toMove);
      targetRef.input.value = String(targetCurrent + toMove);

      console.log('[ERA] After move:', {
        source: sourceInput.value,
        target: targetRef.input.value
      });

      // ✅ Mettre à jour les stats
      self._updateStats();

      // Notification
      NotificationManager?.success(`${toMove} étudiant(s) déplacé(s) vers ${targetRoom}`);
      LogService?.info(`[ERA] Moved ${toMove} students from ${sourceRoom} to ${targetRoom}`);

      console.log('[ERA] ===== MOVE COMPLETE =====');

      // Fermer
      const overlay = document.getElementById('move-modal-overlay');
      if (overlay) {
        overlay.remove();
      }
    });

    // Event: Cancel
    document.getElementById('move-cancel-btn').addEventListener('click', function () {
      console.log('[ERA] Move cancelled');
      const overlay = document.getElementById('move-modal-overlay');
      if (overlay) {
        overlay.remove();
      }
    });

    // Event: Backdrop click
    document.getElementById('move-modal-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'move-modal-overlay') {
        console.log('[ERA] Modal backdrop clicked');
        this.remove();
      }
    });

    // Event: Escape key
    const escapeHandler = function (e) {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('move-modal-overlay');
        if (overlay) {
          console.log('[ERA] Escape key pressed');
          overlay.remove();
        }
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    // ✅ Mettre à jour dynamiquement le max quand on focus l'input
    document.getElementById('move-count-input').addEventListener('focus', function () {
      const currentMax = Number(sourceInput.value) || 0;
      this.max = currentMax;
      this.value = Math.min(Number(this.value) || currentMax, currentMax);
      document.getElementById('move-max-hint').textContent = `Maximum : ${currentMax}`;
      document.getElementById('move-source-count').textContent = `${currentMax} étudiants`;
    });
  }

  _apply() {
    const result = this._save(true);
    if (result.ok) {
      NotificationManager?.success('Modifications appliquées');
      try { ExamRenderer?.render?.(); } catch (e) { }
    } else {
      NotificationManager?.error('Erreur: ' + result.error);
    }
  }

  _rebuild(allocations) {
    const container = document.getElementById('era-rows');
    if (!container) return;

    // ✅ Récupérer les salles disponibles (filtrées)
    const examSelect = document.getElementById('era-exam-select');
    const currentExamId = examSelect?.value;
    const conflictingRooms = currentExamId ? this._getConflictingRooms(currentExamId) : [];

    const allRooms = this._getRooms();
    const availableRooms = allRooms.filter(r => !conflictingRooms.includes(r));

    console.log('[ERA] Rebuild - available rooms:', availableRooms.length, '/', allRooms.length);

    container.innerHTML = '';

    const allocs = allocations.length > 0 ? allocations : [{ room: '', students: 0 }];
    allocs.forEach((a, i) => {
      const div = document.createElement('div');
      // ✅ Utiliser availableRooms au lieu de allRooms
      div.innerHTML = this._buildRowHtml(i, a, availableRooms);
      container.appendChild(div.firstElementChild);
    });
  }

  _updateStats() {
    const container = document.getElementById('era-rows');
    if (!container) return;

    const rows = Array.from(container.querySelectorAll('.era-row'));
    let totalStudents = 0;
    let totalCapacity = 0;

    rows.forEach(row => {
      const input = row.querySelector('.era-students-input');
      const inputValue = input?.value;
      const num = (inputValue !== null && inputValue !== undefined && inputValue !== '') ? Number(inputValue) : 0;
      totalStudents += num;

      const roomName = row.querySelector('.era-room-select')?.value;
      if (roomName) {
        const cap = this._getRoomCapacity(roomName);
        totalCapacity += cap;

        const capEl = row.querySelector('.era-capacity-value');
        if (capEl) capEl.textContent = cap || '—';

        const fill = row.querySelector('.era-progress-fill');
        const text = row.querySelector('.era-progress-text');
        if (fill && text) {
          const pct = cap > 0 ? Math.round((num / cap) * 100) : 0;
          const color = pct > 100 ? '#dc3545' : pct > 80 ? '#ffc107' : '#28a745';
          fill.style.width = Math.min(100, pct) + '%';
          fill.style.backgroundColor = color;
          text.textContent = pct + '%';
        }
      }
    });

    console.log('[ERA] ===== UPDATE STATS =====');
    
    // ========================================
    // CALCULER LES PLACES DISPONIBLES AVANT PLANIFICATION
    // ========================================
    
    // 1.  Récupérer l'examen sélectionné
    const examSelect = document.getElementById('era-exam-select');
    const currentExamId = examSelect?.value;
    
    const exams = this._getExams();
    const currentExam = exams. find(e => String(e. id) === String(currentExamId));
    
    let placesDisponibles = 0;
    
    if (currentExam) {
      const currentDate = currentExam.date || '';
      const currentStartTime = currentExam.startTime || '';
      const currentEndTime = currentExam.endTime || '';
      
      console.log('[ERA] Selected exam:', currentExam.title);
      console.log('[ERA] Exam slot:', currentDate, currentStartTime, '-', currentEndTime);
      
      if (currentDate && currentStartTime && currentEndTime) {
        // 2.  Capacité totale de TOUTES les salles
        const allRoomsCapacity = this._getTotalRoomsCapacity();
        console.log('[ERA] Total rooms capacity:', allRoomsCapacity);
        
        // 3.  Compter les ÉTUDIANTS déjà planifiés sur ce créneau
        //    SAUF l'examen actuellement sélectionné
        let etudiantsDejaPlaces = 0;
        
        exams.forEach(exam => {
          // ✅ IGNORER l'examen sélectionné (on veut la capacité AVANT sa planification)
          if (String(exam.id) === String(currentExamId)) {
            console.log('[ERA] ⏭️ Skipping selected exam:', exam.title);
            return;
          }
          
          // Vérifier date
          const examDate = exam.date || '';
          if (examDate !== currentDate) return;
          
          // Vérifier chevauchement horaire
          const examStart = exam. startTime || '';
          const examEnd = exam.endTime || '';
          if (!examStart || ! examEnd) return;
          
          const overlap = this._timesOverlap(
            currentStartTime, currentEndTime,
            examStart, examEnd
          );
          
          if (!overlap) return;
          
          // ✅ Examen sur le même créneau (autre que celui sélectionné)
          const students = exam.studentsCount || exam.nbEtudiants || 0;
          etudiantsDejaPlaces += students;
          
          console.log('[ERA] ✅ Other exam on same slot:', exam.title, '-', students, 'students');
        });
        
        // 4. Places disponibles = Total - Étudiants des AUTRES examens
        placesDisponibles = Math.max(0, allRoomsCapacity - etudiantsDejaPlaces);
        
        console.log('[ERA] ===== CAPACITY CALCULATION =====');
        console.log('[ERA] Total capacity:', allRoomsCapacity);
        console.log('[ERA] Already used (other exams):', etudiantsDejaPlaces);
        console.log('[ERA] ✅ Available BEFORE this exam:', placesDisponibles);
      } else {
        // Pas de date/horaire : afficher capacité totale
        placesDisponibles = this._getTotalRoomsCapacity();
        console.log('[ERA] No date/time, showing total capacity:', placesDisponibles);
      }
    } else {
      // Pas d'examen : afficher capacité totale
      placesDisponibles = this._getTotalRoomsCapacity();
      console.log('[ERA] No exam selected, showing total capacity:', placesDisponibles);
    }

    // ========================================
    // AFFICHER LES VALEURS
    // ========================================
    const totalEl = document.getElementById('era-total-students');
    const capEl = document.getElementById('era-total-capacity');
    const expectedEl = document.getElementById('era-expected-students');

    if (totalEl) totalEl.textContent = totalStudents;
    
    // ✅ Afficher les PLACES DISPONIBLES (avant planification de cet examen)
    if (capEl) capEl.textContent = placesDisponibles;

    const expected = Number(expectedEl?.textContent) || 0;
    const unplaced = expected - totalStudents;
  }

  _save(keepOpen) {
    try {
      const examSelect = document.getElementById('era-exam-select');
      const examId = examSelect?.value;
      if (!examId) return { ok: false, error: 'Examen non sélectionné' };

      const container = document.getElementById('era-rows');
      const rows = Array.from(container.querySelectorAll('.era-row'));

      const allocations = rows
        .map(r => {
          const room = (r.querySelector('.era-room-select')?.value || '').trim();
          const inputValue = r.querySelector('.era-students-input')?.value;
          const students = (inputValue !== null && inputValue !== undefined && inputValue !== '') ? Number(inputValue) : 0;
          return { room, students };
        })
        .filter(a => a.room);

      const seen = new Set();
      for (const a of allocations) {
        if (seen.has(a.room)) return { ok: false, error: 'Salle dupliquée' };
        seen.add(a.room);
      }

      console.log('[ERA] Saving allocations for exam', examId, ':', allocations);

      const cfg = this._ensureExamRoomConfigs();
      cfg[examId] = allocations;

      const exams = this._getExams();
      const exam = exams.find(e => String(e.id) === examId);
      if (exam) {
        exam.allocations = allocations;
        exam.rooms = allocations.map(a => a.room);
        exam.salles = allocations.map(a => a.room).join(', ');
      }

      try {
        StateManager?.saveState?.();
        console.log('[ERA] State saved');
      } catch (e) {
        console.warn('[ERA] Save state failed', e);
      }

      try {
        ExamRenderer?.render?.();
      } catch (e) { }

      if (!keepOpen) {
        DialogManager?.hide?.();
      }

      return { ok: true };

    } catch (err) {
      console.error('[ERA] Save error', err);
      return { ok: false, error: String(err) };
    }
  }

  // === OPEN MODAL ===

  openAllocatorModal(initialExamId) {
    const exams = this._getExams();
    if (exams.length === 0) {
      NotificationManager?.error('Aucun examen trouvé');
      return;
    }

    let selectedExam = exams.find(e => String(e.id) === String(initialExamId)) || exams[0];
    const existing = this._getAllocationsForExam(selectedExam.id);

    console.log('[ERA] Opening modal - Exam:', selectedExam.id, 'Allocations:', existing);

    let html = `<style>
  /* Amélioration de la modale de répartition */
  .era-row:hover {
    background-color: #f0f4ff ! important;
  }
  
  .era-room-select:focus {
    outline: none;
    border-color: #667eea !important;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
  
  . era-students-input:focus {
    outline: none;
    border-color: #667eea !important;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
  
  #era-rows::-webkit-scrollbar {
    width: 8px;
  }
  
  #era-rows::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
  }
  
  #era-rows::-webkit-scrollbar-thumb {
    background: #667eea;
    border-radius: 10px;
  }
  
  #era-rows::-webkit-scrollbar-thumb:hover {
    background: #5568d3;
  }
  
  .era-progress-fill {
    transition: width 0.3s ease, background-color 0.3s ease ! important;
  }
  
  /* Mise en évidence des salles en conflit */
  .era-room-select option[data-conflict="true"] {
    background-color: #fff3cd !important;
    color: #856404 !important;
    font-weight: 600 !important;
  }
</style>
<div style="padding:20px;">`;

    html += `<div style="display:flex; gap:20px; margin-bottom:20px; align-items:flex-start;">
      <div style="flex:1;">
        <label style="display:block; margin-bottom:5px;"><strong>Examen:</strong></label>
        <select id="era-exam-select" style="width:100%; padding:8px;">`;

    exams.forEach(ex => {
      const label = this._formatExamLabel(ex);
      const sel = String(ex.id) === String(selectedExam.id) ? 'selected' : '';
      html += `<option value="${this._escapeHtml(String(ex.id))}" ${sel}>${this._escapeHtml(label)}</option>`;
    });

    html += `</select> 
      </div>
      <div style="display:flex; gap:15px;">
        <div style="text-align:center;">
          <div style="font-size:0.8em; color:#666;">Total</div>
          <div id="era-expected-students" style="font-size:1.5em; font-weight:bold; color:#667eea;">${selectedExam.studentsCount || selectedExam.nbEtudiants || 0}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:0.8em; color:#666;">Placés</div>
          <div id="era-total-students" style="font-size:1.5em; font-weight:bold; color:#667eea;">0</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:0.8em; color:#666;">Capacité</div>
          <div id="era-total-capacity" style="font-size:1.5em; font-weight:bold; color:#667eea;">—</div>
        </div>
      </div>
    </div>`;

    html += `<div class="era-toolbar" style="display:flex; gap:10px; margin-bottom:15px;">
      <button id="era-add-btn" class="btn btn-sm btn-primary">➕ Ajouter</button>
      <button id="era-redistribute-btn" class="btn btn-sm btn-secondary">⚖️ Redistribuer</button>
      <button id="era-reset-btn" class="btn btn-sm btn-warning">🔄 Reset</button>
    </div>`;

    html += `<div style="border:1px solid #dee2e6; border-radius:8px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
  <div style="display:grid; grid-template-columns:2fr 1fr 1.5fr 2fr 100px; gap:10px; padding:14px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-bottom:2px solid #5568d3; font-weight:700; font-size:0.95em; color:white; text-shadow: 0 1px 2px rgba(0,0,0,0. 1);">
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="font-size:1. 1em;">📍</span>
      <span>Salle</span>
    </div>
    <div style="text-align:center; display:flex; align-items:center; justify-content:center; gap:6px;">
      <span style="font-size:1.1em;">👥</span>
      <span>Capacité</span>
    </div>
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="font-size:1.1em;">🎓</span>
      <span>Étudiants</span>
    </div>
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="font-size:1.1em;">📊</span>
      <span>Occupation</span>
    </div>
    <div style="text-align:center; display:flex; align-items:center; justify-content:center; gap:6px;">
      <span style="font-size:1. 1em;">⚙️</span>
      <span>Actions</span>
    </div>
  </div>
  <div id="era-rows" style="max-height:400px; overflow-y:auto; scrollbar-width: thin; scrollbar-color: #667eea #f1f1f1;">`;

    const rooms = this._getRooms();
    existing.forEach((a, i) => {
      html += this._buildRowHtml(i, a, rooms);
    });

    html += `</div></div>`;

    html += `<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
      <button id="era-apply-btn" class="btn btn-primary">💾 Appliquer</button>
      <button id="era-save-btn" class="btn btn-success">✅ Enregistrer</button>
      <button id="era-cancel-btn" class="btn btn-secondary">❌ Annuler</button>
    </div>`;

    html += `</div>`;

    DialogManager?.show({
      title: 'Gérer répartition étudiants → salles',
      htmlMessage: html,
      allowHtml: true,
      confirmText: null,
      cancelText: null,
      onConfirm: null,
      onCancel: null,
      onShown: () => this._attach()
    });

    this._attached = false;
    setTimeout(() => this._attach(), 150);
  }

  _attach() {
    if (this._attached) return;
    this._attached = true;

    const examSelect = document.getElementById('era-exam-select');
    const container = document.getElementById('era-rows');

    examSelect?.addEventListener('change', () => {
      const examId = examSelect.value;
      const allocs = this._getAllocationsForExam(examId);
      this._rebuild(allocs);
      this._updateStats();

      const exams = this._getExams();
      const exam = exams.find(e => String(e.id) === examId);
      const expectedEl = document.getElementById('era-expected-students');
      if (expectedEl && exam) {
        expectedEl.textContent = exam.studentsCount || exam.nbEtudiants || 0;
      }
    });

    document.body.addEventListener('click', (e) => {
      const target = e.target;

      if (target.id === 'era-add-btn' || target.parentElement?.id === 'era-add-btn') {
        e.preventDefault();
        this._addRow(container);
        return;
      }

      if (target.id === 'era-redistribute-btn' || target.parentElement?.id === 'era-redistribute-btn') {
        e.preventDefault();
        this._redistribute();
        return;
      }

      if (target.id === 'era-reset-btn' || target.parentElement?.id === 'era-reset-btn') {
        e.preventDefault();
        const examId = examSelect?.value;
        if (examId) {
          const allocs = this._getAllocationsForExam(examId);
          this._rebuild(allocs);
          this._updateStats();
        }
        return;
      }

      if (target.id === 'era-apply-btn' || target.parentElement?.id === 'era-apply-btn') {
        e.preventDefault();
        this._apply();
        return;
      }

      if (target.id === 'era-save-btn' || target.parentElement?.id === 'era-save-btn') {
        e.preventDefault();
        const result = this._save(false);
        if (result.ok) {
          NotificationManager?.success('Répartition enregistrée');
        } else {
          NotificationManager?.error('Erreur: ' + result.error);
        }
        return;
      }

      if (target.id === 'era-cancel-btn' || target.parentElement?.id === 'era-cancel-btn') {
        e.preventDefault();
        DialogManager?.hide?.();
        return;
      }

      let el = target;
      for (let i = 0; i < 3; i++) {
        if (!el) break;

        if (el.classList?.contains('era-delete-btn')) {
          e.preventDefault();
          const row = el.parentElement?.parentElement;
          if (row?.classList?.contains('era-row')) {
            this._deleteRow(row);
          }
          return;
        }

        if (el.classList?.contains('era-move-btn')) {
          e.preventDefault();
          const row = el.parentElement?.parentElement;
          if (row?.classList?.contains('era-row')) {
            this._moveStudents(row);
          }
          return;
        }

        el = el.parentElement;
      }
    }, true);

    // ✅ Gérer les changements de salle avec détection de conflit
    container?.addEventListener('change', (e) => {
      if (e.target?.classList?.contains('era-room-select')) {
        const select = e.target;
        const selectedOption = select.options[select.selectedIndex];
        const roomName = select.value;

        if (roomName && selectedOption?.dataset?.conflict === 'true') {
          const conflictExam = selectedOption.dataset.conflictExam || 'Un autre examen';
          const conflictTime = selectedOption.dataset.conflictTime || 'au même moment';

          const confirmed = confirm(
            `⚠️ CONFLIT DÉTECTÉ\n\n` +
            `La salle "${roomName}" est déjà planifiée pour:\n` +
            `📋 ${conflictExam}\n` +
            `🕐 ${conflictTime}\n\n` +
            `Voulez-vous quand même l'ajouter ?`
          );

          if (!confirmed) {
            select.value = '';
            this._updateStats();
            return;
          } else {
            LogService?.warning?.(`Salle ${roomName} ajoutée malgré le conflit avec ${conflictExam}`);
          }
        }
      }

      this._updateStats();
    });

    container?.addEventListener('input', () => this._updateStats());

    setTimeout(() => this._updateStats(), 200);
  }
}

const allocator = new ExamRoomAllocator();
allocator.init();
window.EDTExamRoomAllocator = allocator;
export default allocator;