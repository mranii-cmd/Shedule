/**
 * Renderer minimal pour la liste des examens
 */
import ExamController from '../controllers/ExamController.js';
import { safeText } from '../utils/sanitizers.js';
import DialogManager from './DialogManager.js';
import StateManager from '../controllers/StateManager.js';
import { getRoomCapacity, formatRoomWithCapacity } from '../utils/roomUtils.js';

class ExamRenderer {
    constructor() {
        this.container = null;
    }

    init(containerId = 'examsListContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn('ExamRenderer container not found:', containerId);
        }
    }

    render() {
        if (!this.container) return;
        const exams = ExamController.getExams() || [];
        if (! exams.length) {
            this.container.innerHTML = `<p class="empty-message">Aucun examen planifié. </p>`;
            return;
        }

        let html = `<table class="exams-table" style="width:100%; border-collapse: collapse;">
            <thead>
                <tr style="background:#f8f9fa;">
                    <th style="padding:8px; text-align:left">Titre</th>
                    <th style="padding:8px">Date</th>
                    <th style="padding:8px">Heures</th>
                    <th style="padding:8px">Nb Étudiants</th>
                    <th style="padding:8px">Filière</th>
                    <th style="padding:8px">Matières</th>
                    <th style="padding:8px">Salles occupées</th>
                    <th style="padding:8px">Actions</th>
                </tr>
            </thead>
            <tbody>`;

        exams.forEach(ex => {
            const subjects = Array.isArray(ex.subjects) ? ex.subjects. join(', ') : (ex. subjects || '');
            const filiere = ex.filiere || '';
            const students = (ex.studentsCount !== undefined && ex.studentsCount !== null) ? Number(ex.studentsCount) : '';

            // Build rooms occupied display:
            // Prefer explicit allocations (from automatic scheduling) if present.
            let roomsDisplay = '';
            if (Array.isArray(ex. allocations) && ex.allocations.length > 0) {
                // CORRECTION: Utiliser capacity depuis examRoomConfigs
                roomsDisplay = ex.allocations.map(a => {
                    const room = a.room;
                    const students = a.students !== undefined ? a.students : (a.assigned || 0);
                    const capacity = a.capacity || getRoomCapacity(room);
                    
                    return capacity > 0 
                        ? `${safeText(room)} (${students}/${capacity})`
                        : `${safeText(room)} (${students})`;
                }).join(', ');
            } else if (Array. isArray(ex.rooms) && ex.rooms.length > 0) {
                // If no allocations, but rooms are specified
                const roomNames = ex.rooms. slice();
                if (students !== '') {
                    const total = Number(students) || 0;
                    const n = roomNames.length || 1;
                    const base = Math.floor(total / n);
                    let rem = total - base * n;
                    const parts = roomNames.map((r) => {
                        const assigned = base + (rem > 0 ? 1 : 0);
                        rem = Math.max(0, rem - 1);
                        const capacity = getRoomCapacity(r);
                        return capacity > 0
                            ? `${safeText(r)} (${assigned}/${capacity})`
                            : `${safeText(r)} (${assigned})`;
                    });
                    roomsDisplay = parts.join(', ');
                } else {
                    // No students count, just show room names with capacity
                    roomsDisplay = roomNames.map(r => formatRoomWithCapacity(r)).join(', ');
                }
            } else if (ex.salles) {
                // Fallback: salles as string "S1, S2"
                roomsDisplay = String(ex.salles)
                    .split(',')
                    .map(r => formatRoomWithCapacity(r.trim()))
                    .filter(Boolean)
                    .join(', ');
            } else {
                roomsDisplay = '—';
            }

            html += `<tr>
                <td style="padding:8px; border-bottom:1px solid #eee">${safeText(ex.title)}</td>
                <td style="padding:8px; border-bottom:1px solid #eee">${safeText(ex.date)}</td>
                <td style="padding:8px; border-bottom:1px solid #eee">${safeText(ex.startTime)} - ${safeText(ex. endTime)}</td>
                <td style="padding:8px; border-bottom:1px solid #eee; text-align:center">${safeText(String(students || ''))}</td>
                <td style="padding:8px; border-bottom:1px solid #eee">${safeText(filiere)}</td>
                <td style="padding:8px; border-bottom:1px solid #eee">${safeText(subjects)}</td>
                <td style="padding:8px; border-bottom:1px solid #eee">${roomsDisplay}</td>
                <td style="padding:8px; border-bottom:1px solid #eee">
                    <button class="btn btn-sm btn-success" data-action="schedule" data-id="${ex.id}" title="Planifier automatiquement">⚙️</button>
                    <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${ex.id}">✏️</button>
                    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${ex.id}">🗑️</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        this.container.innerHTML = html;

        // Attach delegated listeners for delete
        this.container.querySelectorAll('button[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-id');
                DialogManager. confirm('Supprimer Examen', 'Voulez-vous vraiment supprimer cet examen ?', async () => {
                    await import('../controllers/ExamController.js').then(m => m.default.removeExam(id));
                    this.render();
                    // refresh timetable if present
                    import('./ExamTimetable.js').then(t => t.default.render()).catch(() => { });
                });
            });
        });

        // Attach listeners for edit
        this.container.querySelectorAll('button[data-action="edit"]').forEach(btn => {
            btn. addEventListener('click', (e) => {
                const id = btn. getAttribute('data-id');
                // Fill the form in the tab with the exam data (form exists in index.html)
                const ex = (StateManager.state && Array. isArray(StateManager.state. examens)) ? StateManager.state.examens.find(x => x.id === id) : null;
                if (!ex) { DialogManager.error('Examen introuvable'); return; }
                try {
                   // ✅ 1.  DÉFINIR L'ID D'ÉDITION EN PREMIER (avant toute assignation)
                    const form = document.getElementById('formAjouterExamen');
                    if (form) {
                        form.dataset.editingId = ex.id;
                        console.log('[ExamRenderer] Set editingId:', ex.id);
                    } else {
                        console.error('[ExamRenderer] Form not found!  ');
                        return;
                    }
                    
                    // ✅ 2. REMPLIR LES CHAMPS
                    console.log('[ExamRenderer] Filling form with exam data:', {
                        title: ex.title,
                        date: ex.date,
                        start: ex.startTime,
                        end: ex.  endTime
                    });
                    
                    document.getElementById('inputExamTitle'). value = ex.title || '';
                    document.getElementById('inputExamDate').value = ex.date || '';
                    document.getElementById('inputExamStart').value = ex.startTime || '';
                    document.getElementById('inputExamEnd').value = ex.endTime || '';
                    document.getElementById('inputExamSession').value = ex.session || '';
                    document.getElementById('inputExamDept').value = ex.department || '';
                    
                    // ✅ DEBUG : Vérifier que les valeurs sont assignées
                    console.log('[ExamRenderer] Form values after assignment:', {
                        date: document.getElementById('inputExamDate').value,
                        start: document.getElementById('inputExamStart').value,
                        end: document.getElementById('inputExamEnd').value,
                        editingId: form.dataset.editingId
                    });
                    
                    // If subjects select exists (multi-select), set selected options after triggering filiere change population
                    const filSelect = document.getElementById('inputExamFiliere');
                    if (filSelect) {
                        filSelect.  value = ex.filiere || '';
                        // trigger change to populate subjects for this filière (ExamHandlers listens to change)
                        try { filSelect.dispatchEvent(new Event('change')); } catch (err) { /* noop */ }
                    }

                    const subjSelect = document.  getElementById('inputExamSubjects');
                    if (subjSelect) {
                        const wanted = Array.isArray(ex.subjects) ?   ex.subjects.map(s => String(s)) : (ex. subjects ? [String(ex.subjects)] : []);
                        Array.from(subjSelect.options). forEach(opt => {
                            opt.selected = wanted.includes(opt.value);
                        });
                    }

                    document.getElementById('inputExamRooms').value = Array.isArray(ex.rooms) ? ex. rooms.join(', ') : (ex.rooms || '');
                    document.getElementById('inputExamNotes').value = ex. notes || '';
                    
                    // studentsCount
                    const studentsInput = document.getElementById('inputExamStudentsCount');
                    if (studentsInput) {
                        studentsInput.value = (ex.studentsCount !== undefined && ex.studentsCount !== null) ? ex.studentsCount : '';
                    }
                    
                    // ✅ 3. CHANGER D'ONGLET
                    const tabBtn = document.querySelector('.tab-btn[data-tab="examens"]');
                    if (tabBtn) tabBtn.click();
                    
                    // ✅ 4. SCROLL
                    const elForm = document. getElementById('formAjouterExamen');
                    if (elForm) elForm.scrollIntoView({ behavior: 'smooth' });
                   // ✅ DÉCLENCHER UN ÉVÉNEMENT PERSONNALISÉ après que tout soit chargé
                    console.log('[ExamRenderer] Form filled, dispatching event');
                    
                    // Attendre que le navigateur ait fini de mettre à jour le DOM
                    setTimeout(() => {
                        const event = new CustomEvent('exam:loaded-for-edit', {
                            detail: {
                                examId: ex.id,
                                date: ex.date,
                                startTime: ex.startTime,
                                endTime: ex.endTime
                            }
                        });
                        document.dispatchEvent(event);
                    }, 300);
                    
                } catch (err) {
                    console.warn('Failed to populate exam form', err);
                }
            });
        });

        // Attach listeners for schedule (dynamic import to avoid circular deps)
        this.container.querySelectorAll('button[data-action="schedule"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-id');
                import('../handlers/ExamHandlers.js'). then(mod => {
                    if (mod && mod.default && typeof mod.default.scheduleExam === 'function') {
                        mod.default.scheduleExam(id);
                    } else {
                        console. error('ExamHandlers.scheduleExam not available');
                    }
                }).catch(err => console.error('Failed to import ExamHandlers for scheduling', err));
            });
        });
    }
}

export default new ExamRenderer();