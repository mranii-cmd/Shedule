
/**
 * Vue "emploi du temps" pour les examens planifiés.
 * - Colonne verticale : jours (jour de la semaine + date)
 * - Colonnes horizontales : créneaux horaires (déduits de StateManager.state.creneaux ou des examens)
 *
 * Comportement :
 * - Regroupe les examens par date et place chaque examen dans la/les cellule(s) correspondant(ces)
 *   au(x) créneau(x) où il se déroule.
 * - Affiche pour chaque examen : titre, filière, salles et nombre d'étudiants affectés.
 *
 * Usage :
 *  import ExamTimetable from '../ui/ExamTimetable.js';
 *  ExamTimetable.init('examTimetableContainer');
 *  ExamTimetable.render();
 */
import StateManager from '../controllers/StateManager.js';
import { safeText } from '../utils/sanitizers.js';
import { getRoomCapacity } from '../utils/roomUtils.js';

class ExamTimetable {
    constructor() {
        this.container = null;
    }

    init(containerId = 'examTimetableContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn('ExamTimetable: container not found:', containerId);
        }
    }

    // parse "HH:MM" or "HHhMM" or "HhMM" -> minutes since midnight
    _timeToMinutes(t) {
        if (!t || typeof t !== 'string') return null;
        const m = t.match(/^(\d{1,2})\s*[:h]\s*(\d{2})$/);
        if (!m) return null;
        const hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return hh * 60 + mm;
    }

    // returns true if ranges [s1,e1) and [s2,e2) overlap (same day)
    _timesOverlap(startA, endA, startB, endB) {
        const sA = this._timeToMinutes(startA);
        const eA = this._timeToMinutes(endA);
        const sB = this._timeToMinutes(startB);
        const eB = this._timeToMinutes(endB);
        if (sA === null || eA === null || sB === null || eB === null) return false;
        return (sA < eB) && (sB < eA);
    }

    // Build slots from StateManager.state.creneaux if present, else derive from exams' start/end times
    _buildSlots() {
        const state = StateManager.state || {};


        // Build slots but deduplicate by normalized minutes range (startMin-endMin).
        // This avoids creating multiple slot entries that look different textually but cover the same time,
        // which caused exams to appear multiple times in the timetable.
        const slotMap = new Map(); // key: `${startMin}-${endMin}` -> slot

        // 1) Prefer explicit seances configuration (gestion des séances) if present.
        const seances = Array.isArray(state.seances) ? state.seances : [];
        seances.forEach(s => {
            try {
                const startLabel = String(s.startTime || s.start || '').trim();
                const endLabel = String(s.endTime || s.end || '').trim();
                const startMin = this._timeToMinutes(startLabel);
                const endMin = this._timeToMinutes(endLabel);
                if (startLabel && endLabel && startMin !== null && endMin !== null && endMin > startMin) {
                    const key = `${startMin}-${endMin}`;
                    if (!slotMap.has(key)) slotMap.set(key, { id: `${startLabel}-${endLabel}`, start: startLabel, end: endLabel, startMin, endMin });
                }
            } catch (e) { /* ignore malformed */ }
        });

        // 2) Then include creneaux (older config shape) if present
        const c = state.creneaux || {};
        if (c && typeof c === 'object' && Object.keys(c).length > 0) {
            Object.keys(c).forEach(k => {
                try {
                    const entry = c[k] || {};
                    const startLabel = String(k).trim();
                    const endLabel = String(entry.fin || entry.end || '').trim();
                    const startMin = this._timeToMinutes(startLabel);
                    const endMin = this._timeToMinutes(endLabel);
                    if (startMin !== null && endMin !== null && endMin > startMin) {
                        const key = `${startMin}-${endMin}`;
                        if (!slotMap.has(key)) slotMap.set(key, { id: `${startLabel}-${endLabel}`, start: startLabel, end: endLabel, startMin, endMin });
                    }
                } catch (e) { /* ignore malformed */ }
            });
        }

        // 3) Finally ensure every exam's own start/end appears as a slot (so ad-hoc exams are represented)
        const exams = Array.isArray(state.examens) ? state.examens : [];
        exams.forEach(ex => {
            try {
                const s = String(ex.startTime || ex.start || '').trim();
                const e = String(ex.endTime || ex.end || '').trim();
                const sMin = this._timeToMinutes(s);
                const eMin = this._timeToMinutes(e);
                if (s && e && sMin !== null && eMin !== null && eMin > sMin) {
                    const key = `${sMin}-${eMin}`;
                    if (!slotMap.has(key)) slotMap.set(key, { id: `${s}-${e}`, start: s, end: e, startMin: sMin, endMin: eMin });
                }
            } catch (err) { /* noop */ }
        });


        // Enforce canonical daily exam slots only (supprimer tous les autres créneaux    // Les 4 créneaux demandés :
        //  - 08:30 - 10:00
        //  - 10:15 - 11:45
        //  - 14:30 - 16:00
        //  - 16:15 - 17:45
        const desiredSlots = [
            { start: '08:30', end: '10:00' },
            { start: '10:15', end: '11:45' },
            { start: '14:30', end: '16:00' },
            { start: '16:15', end: '17:45' }
        ];

        const slots = [];
        desiredSlots.forEach(ds => {
            const sMin = this._timeToMinutes(ds.start);
            const eMin = this._timeToMinutes(ds.end);
            if (sMin !== null && eMin !== null && eMin > sMin) {
                slots.push({
                    id: `${ds.start}-${ds.end}`,
                    start: ds.start,
                    end: ds.end,
                    startMin: sMin,
                    endMin: eMin
                });
            }
        });

        // final sort by startMin
        slots.sort((a, b) => a.startMin - b.startMin);
        return slots;
    }

    // collect unique dates from exams (YYYY-MM-DD strings)
    _collectDates() {
        const exams = Array.isArray(StateManager.state && StateManager.state.examens) ? StateManager.state.examens : [];
        const set = new Set();
        exams.forEach(ex => {
            if (ex && ex.date) set.add(String(ex.date).trim());
        });
        const dates = Array.from(set);
        // Sort dates lexicographically assuming ISO format yyyy-mm-dd; otherwise try Date parsing
        dates.sort((a, b) => {
            const da = new Date(a), db = new Date(b);
            if (!isNaN(da) && !isNaN(db)) return da - db;
            return a.localeCompare(b);
        });
        return dates;
    }

    // Render single exam cell content (list of exams in that date/slot)
    _renderExamCard(exam) {
        // Display the subject name instead of the exam title. 
        const subjectName = Array.isArray(exam.subjects) && exam.subjects.length
            ? String(exam.subjects[0])
            : (exam.subjects ? String(exam.subjects) : '');
        const titleToShow = subjectName || String(exam.title || '');
        const filiere = safeText(exam.filiere || '');

        // Display only room names (e.g. "Amphi B"), without capacities or student counts
        let rooms = '';
        if (Array.isArray(exam.allocations) && exam.allocations.length > 0) {
            rooms = exam.allocations
                .map(a => safeText(a.room || a.salle || ''))
                .filter(r => r)
                .join(', ');
        } else if (Array.isArray(exam.rooms) && exam.rooms.length > 0) {
            rooms = exam.rooms
                .map(r => safeText(r))
                .filter(r => r)
                .join(', ');
        } else if (exam.rooms) {
            rooms = String(exam.rooms).split(',').map(r => safeText(r)).filter(r => r).join(', ');
        } else {
            rooms = '—';
        }

        // const students = safeText(String(exam.studentsCount || exam.totalAssigned || 0));

        // Include the exam's horaire
        const timeRange = (exam.startTime || exam.start) && (exam.endTime || exam.end)
            ? `${safeText(String(exam.startTime || exam.start))} - ${safeText(String(exam.endTime || exam.end))}`
            : '';

        // Build rooms chips
        const roomsHtml = rooms && rooms !== '—'
            ? rooms.split(',').map(r => `<span class="room-chip">${safeText(r.trim())}</span>`).join('')
            : `<span class="room-chip">—</span>`;

        return `<div class="et-card" data-id="${safeText(String(exam.id || ''))}">
            <div class="title-row">
                <div class="title">${safeText(titleToShow)}</div>
                ${timeRange ? `<div class="time">${timeRange}</div>` : ''}
            </div>
            ${filiere ? `<div class="filiere">${filiere}</div>` : ''}
            <div class="rooms">${roomsHtml}</div>
           <!-- Nombre d'étudiants supprimé volontairement -->
        </div>`;
    }

    render() {
        if (!this.container) return;
        const slots = this._buildSlots();
        const dates = this._collectDates();

        // Basic styling container
        const style = `<style>
      /* Table layout */
      .et-table { width:100%; border-collapse: collapse; background:transparent; table-layout: fixed; }
      .et-table th, .et-table td { border:1px solid #eee; padding:8px; vertical-align:top; background:#fafafa; word-break: break-word; white-space: normal; }

      /* Sticky headers for readability */
      .et-table thead th { position: sticky; top: 0; background: #f8f9fa; z-index: 5; }
      .et-daycell { width:220px; max-width:220px; background:#f1f3f5; font-weight:600; padding:10px; }
      .et-slot-header { text-align:center; font-weight:600; background:#f8f9fa; padding:10px; }

      /* Card styling improved */
      .et-card { display:block; padding:10px; border-radius:8px; margin-bottom:8px; background:#fff; border:1px solid #e6e6e6; box-shadow: 0 1px 2px rgba(0,0,0,0.04); font-size:13px; line-height:1.25; }
      .et-card .title-row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
      .et-card .title { font-weight:700; color:#222; font-size:13px; }
      .et-card .time { font-size:11px; color:#666; white-space:nowrap; }
      .et-card .filiere { font-size:12px; color:#444; font-style:italic; margin-bottom:6px; display:block; }

      /* Rooms as chips */
      .et-card .rooms { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px; }
      .et-card .room-chip { background:#f1f3f5; color:#333; padding:4px 8px; border-radius:999px; font-size:11px; border:1px solid #e0e0e0; }

      /* Students badge */
      .et-card .students-badge { background:#f0f7ff; color:#0b63d6; padding:4px 8px; border-radius:999px; font-weight:700; font-size:12px; border:1px solid #cfe3ff; }

      /* Empty cell placeholder */
      .empty-message { color:#888; font-style:italic; padding:6px; }

      /* Ensure last column can show 'others' clearly */
      .et-table td { min-height:48px; }

      @media (max-width:900px) {
        .et-daycell { width:160px; max-width:160px; }
        .et-card { font-size:12px; padding:8px; }
      }
    </style>`;

        // Build table header (time slots)
        // Build metadata header (title + session + year) — use DOM controls if present, fallback to StateManager
        let headerSession = '';
        let headerYear = '';
        try {
            const sel = document.getElementById('selectSession');
            if (sel) {
                headerSession = (sel.options && sel.options[sel.selectedIndex] && (sel.options[sel.selectedIndex].text || sel.options[sel.selectedIndex].value)) || sel.value || '';
            } else if (StateManager && StateManager.state && StateManager.state.header) {
                headerSession = StateManager.state.header.session || '';
            }
        } catch (e) { headerSession = (StateManager && StateManager.state && StateManager.state.header && StateManager.state.header.session) || ''; }
        try {
            const yearInput = document.getElementById('inputAnneeUniversitaire');
            if (yearInput) headerYear = (yearInput.value || yearInput.placeholder || '');
            else if (StateManager && StateManager.state && StateManager.state.header) headerYear = StateManager.state.header.annee || '';
        } catch (e) { headerYear = (StateManager && StateManager.state && StateManager.state.header && StateManager.state.header.annee) || ''; }

        const headerTitle = 'Planning des examens';
        const headerParts = [];
        if (headerSession) headerParts.push(`"${safeText(headerSession)}"`);
        if (headerYear) headerParts.push(safeText(headerYear));
        const headerMetaLine = headerParts.join(' | ');

        const headerHtml = `<div class="et-header" style="text-align:center;margin-bottom:12px;"><div class="et-title" style="font-size:18px;font-weight:700;color:#222;margin-bottom:4px;">${safeText(headerTitle)}</div>` +
            (headerMetaLine ? `<div class="et-meta" style="font-size:13px;color:#444;">${headerMetaLine}</div>` : '') +
            `</div>`;

        // Build table header (time slots)
        let html = style + headerHtml + `<div class="et-wrapper"><table class="et-table"><thead><tr><th class="et-daycell">Jour / Date</th>`;
        if (!slots.length) {
            html += `<th class="et-slot-header">(Aucun créneau défini)</th>`;
        } else {
            slots.forEach(s => {
                html += `<th class="et-slot-header">${safeText(s.start)} - ${safeText(s.end)}</th>`;
            });
        }
        html += `</tr></thead><tbody>`;

        if (!dates.length) {
            html += `<tr><td class="et-daycell">Aucune date</td><td colspan="${Math.max(1, slots.length)}">Aucun examen planifié</td></tr>`;
            html += `</tbody></table></div>`;
            this.container.innerHTML = html;
            return;
        }

        // For each date, build row
        const exams = Array.isArray(StateManager.state && StateManager.state.examens) ? StateManager.state.examens : [];
        dates.forEach(date => {
            // display day name and date
            let dayLabel = date;
            try {
                const d = new Date(date);
                if (!isNaN(d)) {
                    const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
                    const dateStr = d.toLocaleDateString('fr-FR');
                    dayLabel = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} — ${dateStr}`;
                }
            } catch (e) { /* ignore */ }

            html += `<tr><td class="et-daycell">${safeText(dayLabel)}</td>`;

            if (!slots.length) {
                // all exams for this date in single cell
                const rowExams = exams.filter(ex => String(ex.date).trim() === String(date).trim());
                let cellHtml = '';
                rowExams.forEach(ex => { cellHtml += this._renderExamCard(ex); });
                if (!cellHtml) cellHtml = '<div class="empty-message">Aucun examen</div>';
                html += `<td>${cellHtml}</td>`;
            } else {

                // Assign each exam of the date to exactly one slot to avoid duplicates:
                // - prefer the slot that fully contains the exam (start >= slot.start && end <= slot.end)
                // - if multiple slots could contain it, pick the first matching slot (slots are sorted by start)
                // - otherwise keep it in "others" (will be appended to the last slot cell so it remains visible)
                const dateExams = exams.filter(ex => String(ex.date).trim() === String(date).trim());
                const slotCells = slots.map(() => []); // parallel array of assigned exams per slot
                const others = [];

                // Precompute minutes for exam times to avoid repeated parsing
                const examsWithMins = dateExams.map(ex => {
                    const s = String(ex.startTime || ex.start || '').trim();
                    const e = String(ex.endTime || ex.end || '').trim();
                    return { ex, sMin: this._timeToMinutes(s), eMin: this._timeToMinutes(e) };
                });

                examsWithMins.forEach(({ ex, sMin, eMin }) => {
                    let assigned = false;
                    if (sMin === null || eMin === null) {
                        others.push(ex);
                        return;
                    }
                    for (let i = 0; i < slots.length; i++) {
                        const slot = slots[i];
                        // exact containment: exam fully within slot
                        if (sMin >= slot.startMin && eMin <= slot.endMin) {
                            slotCells[i].push(ex);
                            assigned = true;
                            break;
                        }
                    }
                    if (!assigned) others.push(ex);
                });

                // Render each slot cell from pre-assigned lists
                slots.forEach((slot, idx) => {
                    const slotExams = slotCells[idx] || [];
                    let cellHtml = '';
                    slotExams.forEach(ex => { cellHtml += this._renderExamCard(ex); });
                    // If this is the last slot, also append any "others" exams that didn't fit exactly in a slot
                    if (idx === slots.length - 1 && others.length) {
                        others.forEach(ex => { cellHtml += this._renderExamCard(ex); });
                    }
                    if (!cellHtml) cellHtml = '<div class="empty-message" style="color:#999">—</div>';
                    html += `<td>${cellHtml}</td>`;
                });

            }

            html += `</tr>`;
        });

        html += `</tbody></table></div>`;

        this.container.innerHTML = html;
    }
}

export default new ExamTimetable();