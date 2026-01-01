
/**
 * Handlers pour le panneau Examens : soumission formulaire, reset, initialisation selects
 */
import ExamController from '../controllers/ExamController.js';
import ExamRenderer from '../ui/ExamRenderer.js';
import StateManager from '../controllers/StateManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import DialogManager from '../ui/DialogManager.js';
import ExamSchedulerService from '../services/ExamSchedulerService.js';
import ExamTimetable from '../ui/ExamTimetable.js';
import ExamRoomAllocator from '../ui/ExamRoomAllocator.js';
import ExamFormWizard from '../ui/ExamFormWizard.js';

const ExamHandlers = {
    init() {
        // init renderer container
        ExamRenderer.init('examsListContainer');
        ExamRenderer.render();

        // Init timetable view (container id must exist in index.html)
        try {
            ExamTimetable.init('examTimetableContainer');
            ExamTimetable.render();
        } catch (e) { /* noop if timetable not present */ }

        // populate departments select from header #selectDepartement
        const deptSelect = document.getElementById('inputExamDept');
        if (deptSelect) {
            const headerDept = document.getElementById('selectDepartement');
            const options = headerDept ? Array.from(headerDept.options).map(o => o.value).filter(Boolean) : [];
            // clear and populate safely
            while (deptSelect.firstChild) deptSelect.removeChild(deptSelect.firstChild);
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '-- Sélectionner --';
            deptSelect.appendChild(opt);
            options.forEach(d => {
                const o = document.createElement('option');
                o.value = d;
                o.textContent = d;
                deptSelect.appendChild(o);
            });
        }

        // Populate filière select with filières de la session courante.
        // Provide a function so we can re-populate on session change or project reset.
        const filiereSelect = document.getElementById('inputExamFiliere');

        function getFilieresForCurrentSession() {
            // Prefer StateManager.getCurrentSessionFilieres if available
            if (StateManager && typeof StateManager.getCurrentSessionFilieres === 'function') {
                try {
                    const s = StateManager.getCurrentSessionFilieres();
                    if (Array.isArray(s)) return s;
                } catch (e) { /* ignore and fallback */ }
            }

            // Fallback: filter StateManager.state.filieres by session header value
            const all = Array.isArray(StateManager.state && StateManager.state.filieres) ? StateManager.state.filieres : [];
            let headerSession = (document.getElementById('selectSession')?.value) || (StateManager.state && StateManager.state.header && StateManager.state.header.session) || '';
            headerSession = String(headerSession || '').toLowerCase();

            if (!headerSession) {
                // If no session selected, return all filieres
                return all.slice();
            }

            const isAutumn = headerSession.includes('automne') || headerSession.includes('autumn');
            const isSpring = headerSession.includes('printemps') || headerSession.includes('spring');

            if (!isAutumn && !isSpring) return all.slice();

            return all.filter(f => {
                if (!f) return false;
                const s = String(f.session || '').toLowerCase();
                if (!s) return false;
                if (isAutumn) return s.includes('automne') || s.includes('autumn');
                if (isSpring) return s.includes('printemps') || s.includes('spring');
                return false;
            });
        }

        function populateFiliereSelect() {
            if (!filiereSelect) return;
            try {
                const filieres = getFilieresForCurrentSession();
                // clear and add placeholder
                while (filiereSelect.firstChild) filiereSelect.removeChild(filiereSelect.firstChild);
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = filieres.length ? '-- Sélectionner --' : '-- Aucune filière pour la session --';
                filiereSelect.appendChild(placeholder);
                filieres.forEach(f => {
                    if (!f || !f.nom) return;
                    const o = document.createElement('option');
                    o.value = f.nom;
                    o.textContent = f.nom;
                    filiereSelect.appendChild(o);
                });
            } catch (err) {
                console.warn('ExamHandlers.populateFiliereSelect failed', err);
            }
        }

        // initial populate
        populateFiliereSelect();

        // Re-populate when the header session changes (user action)
        const headerSessionSel = document.getElementById('selectSession');
        if (headerSessionSel) {
            headerSessionSel.addEventListener('change', () => {
                populateFiliereSelect();
            });
        }

        // Also react to state changes that may affect filieres (session change, project reset)
        if (StateManager && typeof StateManager.subscribe === 'function') {
            try {
                StateManager.subscribe('session:changed', () => populateFiliereSelect());
                StateManager.subscribe('project:reset', () => populateFiliereSelect());
                StateManager.subscribe('filieres:changed', () => {
                    populateFiliereSelect();
                    const cur = document.getElementById('inputExamFiliere')?.value || '';
                    populateSubjectsForFiliere(cur);
                });
                // If subjects/matières change, refresh subjects list for current filière
                StateManager.subscribe('subject:added', () => {
                    const cur = document.getElementById('inputExamFiliere')?.value || '';
                    populateSubjectsForFiliere(cur);
                });
                StateManager.subscribe('subject:removed', () => {
                    const cur = document.getElementById('inputExamFiliere')?.value || '';
                    populateSubjectsForFiliere(cur);
                });
                // If exams change (added/updated/removed), refresh subjects availability for the current filière
                // so subjects already planned are excluded in the selector.
                StateManager.subscribe('exam:added', () => {
                    // Écoutes pour mise à jour des sujets/examens — supporte noms FR/EN pour rétro-compatibilité
                    try {
                        ['examen:added', 'examen:updated', 'examen:removed', 'exam:added', 'exam:updated', 'exam:removed', 'examens:changed'].forEach(evt => {
                            StateManager.subscribe(evt, () => {
                                const cur = document.getElementById('inputExamFiliere')?.value || '';
                                populateSubjectsForFiliere(cur);
                            });
                        });
                    } catch (e) { /* noop */ }
                });
                StateManager.subscribe('exam:updated', () => {
                    const cur = document.getElementById('inputExamFiliere')?.value || '';
                    populateSubjectsForFiliere(cur);
                });
                StateManager.subscribe('exam:removed', () => {
                    const cur = document.getElementById('inputExamFiliere')?.value || '';
                    populateSubjectsForFiliere(cur);
                });
                StateManager.subscribe('examens:changed', () => {
                    const cur = document.getElementById('inputExamFiliere')?.value || '';
                    populateSubjectsForFiliere(cur);
                });
            } catch (e) { /* noop */ }
        }

        // --- Subjects population based on selected filière ---
        const subjectsSelect = document.getElementById('inputExamSubjects');

        function getSubjectsForFiliere(filiere) {
            // Prefer StateManager.getCurrentSessionSubjects if available
            if (StateManager && typeof StateManager.getCurrentSessionSubjects === 'function') {
                try {
                    const s = StateManager.getCurrentSessionSubjects() || [];
                    if (filiere) return s.filter(sub => String(sub.filiere || '').trim() === String(filiere).trim());
                    return s;
                } catch (e) { /* fallback below */ }
            }
            // Fallback: StateManager.state.matiereGroupes where entry.filiere === filiere
            const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) ? StateManager.state.matiereGroupes : {};
            const out = [];
            Object.keys(mg || {}).forEach(k => {
                try {
                    const entry = mg[k] || {};
                    const entryF = String(entry.filiere || '').trim();
                    if (!filiere || entryF === String(filiere).trim()) {
                        out.push({ nom: k, filiere: entryF });
                    }
                } catch (e) { /* noop */ }
            });
            return out;
        }
        // Helper: return a Set of subject names already planned for given filière.
        function getPlannedSubjectsForFiliere(filiere, excludingExamId) {
            const out = new Set();
            try {
                const exams = Array.isArray(StateManager.state && StateManager.state.examens) ? StateManager.state.examens : [];
                exams.forEach(ex => {
                    if (!ex) return;
                    if (excludingExamId && String(ex.id) === String(excludingExamId)) return;
                    if (!filiere || String(ex.filiere || '').trim() !== String(filiere).trim()) return;
                    const subs = Array.isArray(ex.subjects) ? ex.subjects : (ex.subjects ? [ex.subjects] : []);
                    subs.forEach(s => {
                        if (s) out.add(String(s).trim());
                    });
                });
            } catch (e) { /* noop */ }
            return out;
        }

        function populateSubjectsForFiliere(filiere) {
            if (!subjectsSelect) return;
            try {

                const subjects = getSubjectsForFiliere(filiere) || [];
                // determine if we are editing an existing exam so we don't exclude its own subjects
                const excludingId = document.getElementById('formAjouterExamen')?.dataset.editingId || null;
                const planned = filiere ? getPlannedSubjectsForFiliere(filiere, excludingId) : new Set();

                // clear
                while (subjectsSelect.firstChild) subjectsSelect.removeChild(subjectsSelect.firstChild);

                // Filter subjects: if filiere selected, exclude those already planned for that filiere
                const available = subjects.filter(s => {
                    const name = (s && (s.nom || s.name || s)) || '';
                    if (!name) return false;
                    // keep subject if not planned OR if we are editing and the subject belongs to the exam being edited
                    return !planned.has(String(name).trim());
                });

                if (!available || available.length === 0) {
                    const opt0 = document.createElement('option');
                    opt0.value = '';
                    opt0.textContent = '-- Aucune matière disponible --';
                    subjectsSelect.appendChild(opt0);
                    subjectsSelect.disabled = true;
                    return;
                }

                subjectsSelect.disabled = false;
                available.forEach(s => {
                    const val = s.nom || s.name || s;
                    const o = document.createElement('option');
                    o.value = val;
                    o.text = val;
                    subjectsSelect.appendChild(o);
                });

            } catch (err) {
                console.warn('populateSubjectsForFiliere failed', err);
            }
        }

        // Initially populate subjects for current filiere selection (if any)
        try {
            const currentFiliere = document.getElementById('inputExamFiliere')?.value || '';
            populateSubjectsForFiliere(currentFiliere);
        } catch (e) { /* noop */ }

        // Re-populate subjects when filiere changes
        if (filiereSelect) {
            filiereSelect.addEventListener('change', (ev) => {
                populateSubjectsForFiliere(ev.target.value || '');
            });
        }

        // ✅ Stocker dans window pour y accéder depuis le callback de planification
        window.updateExamCapacityIndicator = function () {
            try {
                //console.log('[ExamHandlers] ===== FUNCTION CALLED =====');
                //console.log('[ExamHandlers] Called from:', new Error().stack);
                //console.log('[ExamHandlers] ===== UPDATING CAPACITY INDICATOR =====');

                const indicator = document.getElementById('exam-capacity-indicator');
                const totalCapEl = document.getElementById('exam-total-capacity');
                const usedCapEl = document.getElementById('exam-used-capacity');
                const remainingCapEl = document.getElementById('exam-remaining-capacity');
                const remainingPctEl = document.getElementById('exam-remaining-percentage');

                if (!indicator || !totalCapEl) {
                    // console.log('[ExamHandlers] Indicator elements not found');
                    return;
                }

                // ========================================
                // 1. CALCULER LA CAPACITÉ TOTALE
                // ========================================
                let totalCapacity = 0;
                const configs = StateManager?.state?.examRoomConfigs || [];

               // console.log('[ExamHandlers] examRoomConfigs:', configs);

                if (Array.isArray(configs) && configs.length > 0) {
                    configs.forEach(config => {
                        if (config && config.capacity) {
                            const cap = Number(config.capacity) || 0;
                            totalCapacity += cap;
                           // console.log(`[ExamHandlers] Room ${config.room}: capacity = ${cap}`);
                        }
                    });
                } else {
                    // Fallback : calculer depuis sallesInfo
                    const roomsInfo = StateManager?.state?.sallesInfo || {};
                    const allRoomNames = Object.keys(roomsInfo);

                    //console.log('[ExamHandlers] Using sallesInfo, rooms count:', allRoomNames.length);

                    allRoomNames.forEach(roomName => {
                        let cap = 0;
                        const info = roomsInfo[roomName];

                        if (info && typeof info === 'object') {
                            cap = info.capacity || info.capacite || 0;
                        } else if (typeof info === 'string') {
                            if (info.toLowerCase().includes('amphi')) cap = 200;
                            else if (info === 'Standard') cap = 50;
                            else if (info === 'STP') cap = 30;
                        }

                        if (cap === 0) {
                            const nameLower = roomName.toLowerCase();
                            if (nameLower.includes('amphi')) cap = 200;
                            else if (nameLower.includes('tp')) cap = 30;
                            else if (nameLower.includes('td')) cap = 40;
                        }

                        totalCapacity += cap;
                    });
                }

               // console.log('[ExamHandlers] ✅ Total capacity:', totalCapacity);

                // ========================================
                // 2. RÉCUPÉRER DATE ET HORAIRE DU FORMULAIRE
                // ========================================
                const currentDate = document.getElementById('inputExamDate')?.value || '';
                const currentStartTime = document.getElementById('inputExamStart')?.value || '';
                const currentEndTime = document.getElementById('inputExamEnd')?.value || '';
                const currentExamId = document.getElementById('formAjouterExamen')?.dataset?.editingId || null;

                console.log('[ExamHandlers] Current form values:', {
                    date: currentDate,
                    start: currentStartTime,
                    end: currentEndTime,
                    editingId: currentExamId
                });
                // ✅ DEBUG : Vérifier si les valeurs sont vides
                if (!currentDate || !currentStartTime || !currentEndTime) {
                    // console.error('[ExamHandlers] ❌ PROBLÈME : Valeurs du formulaire vides !  ');
                    //console.error('[ExamHandlers] Date input element:', document.getElementById('inputExamDate'));
                    //console.error('[ExamHandlers] Start input element:', document.getElementById('inputExamStart'));
                    //console. error('[ExamHandlers] End input element:', document.getElementById('inputExamEnd'));
                }
                // ========================================
                // 3. FONCTION : VÉRIFIER CHEVAUCHEMENT HORAIRE
                // ========================================
                function timesOverlap(start1, end1, start2, end2) {
                    try {
                        if (!start1 || !end1 || !start2 || !end2) return false;

                        const toMinutes = (time) => {
                            const [h, m] = time.split(':').map(Number);
                            return h * 60 + m;
                        };

                        const s1 = toMinutes(start1);
                        const e1 = toMinutes(end1);
                        const s2 = toMinutes(start2);
                        const e2 = toMinutes(end2);

                        // Chevauchement si : start1 < end2 ET start2 < end1
                        const overlap = s1 < e2 && s2 < e1;

                       // console.log(`[ExamHandlers] Time overlap check: ${start1}-${end1} vs ${start2}-${end2} = ${overlap}`);

                        return overlap;
                    } catch (e) {
                        console.error('[ExamHandlers] Error checking time overlap:', e);
                        return false;
                    }
                }

                // ========================================
                // 4. FONCTION : EXTRAIRE SALLES D'UN EXAMEN
                // ========================================
                function extractRoomsFromExam(exam) {
                    let rooms = [];

                    // 1. Depuis exam.allocations
                    if (Array.isArray(exam.allocations) && exam.allocations.length > 0) {
                        rooms = exam.allocations.map(a => a.room).filter(Boolean);
                        //console.log(`[ExamHandlers]   - From allocations:`, rooms);
                        return rooms;
                    }

                    // 2.  Depuis exam.rooms (array)
                    if (Array.isArray(exam.rooms) && exam.rooms.length > 0) {
                        rooms = exam.rooms.filter(Boolean);
                       // console.log(`[ExamHandlers]   - From rooms array:`, rooms);
                        return rooms;
                    }

                    // 3.  Depuis exam.salles (string)
                    if (typeof exam.salles === 'string' && exam.salles.trim()) {
                        rooms = exam.salles.split(',').map(r => r.trim()).filter(Boolean);
                       // console.log(`[ExamHandlers]   - From salles string:`, rooms);
                        return rooms;
                    }

                    console.log(`[ExamHandlers]   - No rooms found`);
                    return [];
                }

                // ========================================
                // 5. FONCTION : OBTENIR CAPACITÉ D'UNE SALLE
                // ========================================
                function getRoomCapacity(roomName) {
                    // Chercher dans examRoomConfigs
                    if (Array.isArray(configs)) {
                        const config = configs.find(c => c.room === roomName);
                        if (config?.capacity) {
                            return Number(config.capacity);
                        }
                    }

                    // Fallback : heuristiques
                    const info = (StateManager?.state?.sallesInfo || {})[roomName];
                    let cap = 0;

                    if (info && typeof info === 'object') {
                        cap = info.capacity || info.capacite || 0;
                    } else if (typeof info === 'string') {
                        if (info.toLowerCase().includes('amphi')) cap = 200;
                        else if (info === 'Standard') cap = 50;
                        else if (info === 'STP') cap = 30;
                    }

                    if (cap === 0) {
                        const nameLower = roomName.toLowerCase();
                        if (nameLower.includes('amphi')) cap = 200;
                        else if (nameLower.includes('tp')) cap = 30;
                        else if (nameLower.includes('td')) cap = 40;
                    }

                    return cap;
                }

                // ========================================
                // 6. CALCULER LA CAPACITÉ UTILISÉE (NOMBRE D'ÉTUDIANTS PLACÉS)
                // ========================================
                let usedCapacity = 0;
                const allExams = StateManager?.state?.examens || [];

                console.log('[ExamHandlers] Total exams in system:', allExams.length);

                // Si pas de date/horaire, ne rien compter
                if (!currentDate || !currentStartTime || !currentEndTime) {
                    console.log('[ExamHandlers] ⚠️ No date/time selected, showing full capacity');
                    usedCapacity = 0;
                } else {
                    console.log('[ExamHandlers] Filtering exams by slot:', `${currentDate} ${currentStartTime}-${currentEndTime}`);

                    allExams.forEach(exam => {
                        // Ignorer l'examen en cours d'édition
                        if (currentExamId && String(exam.id) === String(currentExamId)) {
                            console.log(`[ExamHandlers] ⏭️ Skipping (editing):`, exam.title || exam.id);
                            return;
                        }

                        const examDate = exam.date || '';
                        const examStart = exam.startTime || exam.heureDebut || '';
                        const examEnd = exam.endTime || exam.heureFin || '';

                        console.log(`[ExamHandlers] 🔍 Checking exam:`, {
                            title: exam.title,
                            date: examDate,
                            time: `${examStart}-${examEnd}`,
                            students: exam.studentsCount || exam.nbEtudiants
                        });

                        // Vérifier la date
                        if (examDate !== currentDate) {
                            console.log(`[ExamHandlers]   ❌ Different date (${examDate} vs ${currentDate})`);
                            return;
                        }

                        // Vérifier le chevauchement horaire
                        if (!examStart || !examEnd) {
                            console.log(`[ExamHandlers]   ❌ Missing start/end time`);
                            return;
                        }

                        const overlap = timesOverlap(currentStartTime, currentEndTime, examStart, examEnd);

                        if (!overlap) {
                            console.log(`[ExamHandlers]   ❌ No time overlap`);
                            return;
                        }

                        // ✅ Cet examen est sur le même créneau
                        console.log(`[ExamHandlers]   ✅ MATCH - same slot!`);

                        // ✅ OPTION 1 : Compter le NOMBRE D'ÉTUDIANTS (recommandé)
                        const studentsCount = Number(exam.studentsCount || exam.nbEtudiants || exam.totalStudents || 0);

                        if (studentsCount > 0) {
                            usedCapacity += studentsCount;
                            console.log(`[ExamHandlers]   - Adding ${studentsCount} students`);
                        } else {
                            // Fallback : si pas de studentsCount, calculer depuis allocations
                            let totalAllocated = 0;

                            if (Array.isArray(exam.allocations) && exam.allocations.length > 0) {
                                exam.allocations.forEach(alloc => {
                                    const students = alloc.students || alloc.assigned || 0;
                                    totalAllocated += students;
                                });
                                console.log(`[ExamHandlers]   - Adding ${totalAllocated} students (from allocations)`);
                                usedCapacity += totalAllocated;
                            } else {
                                // Dernier fallback : compter la capacité des salles
                                const examRooms = extractRoomsFromExam(exam);
                                let roomsCapacity = 0;
                                examRooms.forEach(room => {
                                    const cap = getRoomCapacity(room);
                                    roomsCapacity += cap;
                                });
                                console.log(`[ExamHandlers]   - Adding ${roomsCapacity} places (from rooms capacity - fallback)`);
                                usedCapacity += roomsCapacity;
                            }
                        }
                    });
                }

               // console.log('[ExamHandlers] ✅ Used capacity:', usedCapacity);

                // ========================================
                // 7. CALCULER LA CAPACITÉ RESTANTE
                // ========================================
                const remainingCapacity = Math.max(0, totalCapacity - usedCapacity);
                const remainingPct = totalCapacity > 0 ? Math.round((remainingCapacity / totalCapacity) * 100) : 0;

                //console.log('[ExamHandlers] ✅ Remaining capacity:', remainingCapacity, `(${remainingPct}%)`);

                // ========================================
                // 8. AFFICHER LES RÉSULTATS
                // ========================================
                if (totalCapacity > 0) {
                    indicator.style.display = 'block';
                    totalCapEl.textContent = totalCapacity;
                    usedCapEl.textContent = usedCapacity;
                    remainingCapEl.textContent = remainingCapacity;

                    if (remainingPctEl) {
                        remainingPctEl.textContent = `${remainingPct}% disponible`;

                        // Code couleur dynamique
                        let color = '#17a2b8'; // Bleu par défaut

                        if (remainingPct > 50) {
                            color = '#28a745'; // Vert
                        } else if (remainingPct > 20) {
                            color = '#ffc107'; // Orange
                        } else {
                            color = '#dc3545'; // Rouge
                        }

                        remainingCapEl.style.color = color;
                        remainingPctEl.style.color = color;
                    }

                   // console.log('[ExamHandlers] ===== INDICATOR UPDATED =====');
                } else {
                    indicator.style.display = 'none';
                   // console.log('[ExamHandlers] No capacity data, hiding indicator');
                }
            } catch (e) {
                console.error('[ExamHandlers] ❌ Error updating capacity indicator:', e);
            }
        };

        // Mettre à jour l'indicateur quand on modifie le champ "salles"
        const roomsInput = document.getElementById('inputExamRooms');
        if (roomsInput) {
            roomsInput.addEventListener('input', window.updateExamCapacityIndicator);
            roomsInput.addEventListener('change', window.updateExamCapacityIndicator);
        }

        // Mettre à jour l'indicateur quand on modifie le nombre d'étudiants
        const studentsInput = document.getElementById('inputExamStudentsCount');
        if (studentsInput) {
            studentsInput.addEventListener('input', window.updateExamCapacityIndicator);
        }

        // Mettre à jour initialement
        setTimeout(window.updateExamCapacityIndicator, 500);

        // ✅ NOUVEAU : Mettre à jour quand on change la date ou l'horaire
        const dateInput = document.getElementById('inputExamDate');
        if (dateInput && !dateInput.dataset.capacityListenerAttached) {
            dateInput.addEventListener('change', () => {
                //console.log('[ExamHandlers] Date changed, updating capacity indicator');
                window.updateExamCapacityIndicator();
            });
            dateInput.dataset.capacityListenerAttached = 'true';
        }

        const startTimeInput = document.getElementById('inputExamStart');
        if (startTimeInput && !startTimeInput.dataset.capacityListenerAttached) {
            startTimeInput.addEventListener('change', () => {
               // console.log('[ExamHandlers] Start time changed, updating capacity indicator');
                window.updateExamCapacityIndicator();
            });
            startTimeInput.dataset.capacityListenerAttached = 'true';
        }

        const endTimeInput = document.getElementById('inputExamEnd');
        if (endTimeInput && !endTimeInput.dataset.capacityListenerAttached) {
            endTimeInput.addEventListener('change', () => {
               // console.log('[ExamHandlers] End time changed, updating capacity indicator');
                window.updateExamCapacityIndicator();
            });
            endTimeInput.dataset.capacityListenerAttached = 'true';
        }

        // ✅ NOUVEAU : Écouter les événements de planification d'examen
        document.addEventListener('exam:scheduled', () => {
            //console.log('[ExamHandlers] Event exam:scheduled received, updating capacity');
            setTimeout(() => {
                if (typeof window.updateExamCapacityIndicator === 'function') {
                    window.updateExamCapacityIndicator();
                }
            }, 500);
        });
        // ✅ NOUVEAU : Écouter l'événement de chargement d'examen pour édition
        document.addEventListener('exam:loaded-for-edit', (e) => {
            //console.log('[ExamHandlers] Event exam:loaded-for-edit received:', e.detail);

            // Attendre un peu plus pour être SÛR que les valeurs sont dans le DOM
            setTimeout(() => {
                const form = document.getElementById('formAjouterExamen');
                const dateInput = document.getElementById('inputExamDate');
                const startInput = document.getElementById('inputExamStart');
                const endInput = document.getElementById('inputExamEnd');

                console.log('[ExamHandlers] Checking form state:', {
                    editingId: form?.dataset?.editingId,
                    date: dateInput?.value,
                    start: startInput?.value,
                    end: endInput?.value
                });

                // Si les valeurs ne sont toujours pas là, les forcer
                if (!dateInput?.value && e.detail.date) {
                    // console.log('[ExamHandlers] Forcing date value:', e.detail.date);
                    dateInput.value = e.detail.date;
                }
                if (!startInput?.value && e.detail.startTime) {
                     //console.log('[ExamHandlers] Forcing start value:', e.detail.startTime);
                    startInput.value = e.detail.startTime;
                }
                if (!endInput?.value && e.detail.endTime) {
                    console.log('[ExamHandlers] Forcing end value:', e.detail.endTime);
                    endInput.value = e.detail.endTime;
                }
                if (form && !form.dataset.editingId && e.detail.examId) {
                   // console.log('[ExamHandlers] Forcing editingId:', e.detail.examId);
                    form.dataset.editingId = e.detail.examId;
                }

                // Mettre à jour l'indicateur
                setTimeout(() => {
                    if (typeof window.updateExamCapacityIndicator === 'function') {
                     //   console.log('[ExamHandlers] Calling updateExamCapacityIndicator after event');
                        window.updateExamCapacityIndicator();
                    }
                }, 200);
            }, 300);
        });

        document.addEventListener('exam:updated', () => {
            //console.log('[ExamHandlers] Event exam:updated received, updating capacity');
            setTimeout(() => {
                if (typeof window.updateExamCapacityIndicator === 'function') {
                    window.updateExamCapacityIndicator();
                }
            }, 500);
        });
        // -----------------------
        // Exam rooms configuration
        // -----------------------
        // Elements
        const selectRoomForConfig = document.getElementById('selectExamRoomForConfig');
        const inputRoomCapacity = document.getElementById('inputExamRoomCapacity');
        const inputRoomSupervisors = document.getElementById('inputExamRoomSupervisors');
        const btnAddRoomConfig = document.getElementById('btnAddExamRoomConfig');
        const configsContainer = document.getElementById('examRoomConfigsContainer');
        const btnSaveConfigs = document.getElementById('btnSaveExamRoomConfigs');

        // Helper: read existing registered rooms from StateManager
        function getRegisteredRooms() {
            try {
                // previous code uses StateManager.state.sallesInfo
                const info = StateManager && StateManager.state && StateManager.state.sallesInfo ? StateManager.state.sallesInfo : {};
                return Object.keys(info || {}).sort();
            } catch (e) {
                return [];
            }
        }

        // Ensure config storage exists
        if (!Array.isArray(StateManager.state.examRoomConfigs)) StateManager.state.examRoomConfigs = [];

        // Populate room select with registered rooms
        function populateRoomSelect() {
            if (!selectRoomForConfig) return;
            const rooms = getRegisteredRooms();
            // clear existing
            while (selectRoomForConfig.firstChild) selectRoomForConfig.removeChild(selectRoomForConfig.firstChild);
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = rooms.length ? '-- Sélectionner une salle --' : '-- Aucune salle enregistrée --';
            selectRoomForConfig.appendChild(placeholder);
            rooms.forEach(r => {
                const o = document.createElement('option');
                o.value = r;
                o.textContent = r;
                selectRoomForConfig.appendChild(o);
            });
        }

        // Render the list of configured exam rooms
        function renderExamRoomConfigs() {
            if (!configsContainer) return;
            const configs = Array.isArray(StateManager.state.examRoomConfigs) ? StateManager.state.examRoomConfigs : [];
            // Clear
            while (configsContainer.firstChild) configsContainer.removeChild(configsContainer.firstChild);

            if (!configs.length) {
                const p = document.createElement('p');
                p.className = 'empty-message';
                p.textContent = 'Aucune configuration de salle d\'examen définie.';
                configsContainer.appendChild(p);
                return;
            }

            configs.forEach(cfg => {
                const row = document.createElement('div');
                row.className = 'exam-room-config-row';
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';
                row.style.padding = '8px';
                row.style.border = '1px solid #e9ecef';
                row.style.borderRadius = '6px';
                row.style.marginBottom = '8px';

                const label = document.createElement('div');
                label.style.flex = '1';
                label.innerHTML = `<strong>${cfg.room}</strong>`;

                const cap = document.createElement('div');
                cap.innerHTML = `Capacité: <input type="number" min="0" value="${Number(cfg.capacity || 0)}" style="width:80px;" data-room="${cfg.room}" class="exam-room-capacity">`;

                const sup = document.createElement('div');
                sup.innerHTML = `Surveillants: <input type="number" min="0" value="${Number(cfg.supervisors || 0)}" style="width:60px;" data-room="${cfg.room}" class="exam-room-supervisors">`;

                const btnRemove = document.createElement('button');
                btnRemove.type = 'button';
                btnRemove.className = 'btn btn-sm btn-danger';
                btnRemove.textContent = '🗑️';
                btnRemove.addEventListener('click', () => {
                    DialogManager.confirm('Supprimer configuration', `Supprimer la configuration pour la salle "${cfg.room}" ?`, async () => {
                        try {
                            const arr = StateManager.state.examRoomConfigs || [];
                            const updated = arr.filter(x => x.room !== cfg.room);
                            if (typeof StateManager.setExamRoomConfigs === 'function') {
                                await StateManager.setExamRoomConfigs(updated);
                            } else {
                                StateManager.state.examRoomConfigs = updated;
                                await StateManager.saveState();
                            }
                            renderExamRoomConfigs();
                            NotificationManager.success('Configuration supprimée');
                            populateRoomSelect();
                        } catch (err) {
                            console.error('Failed to remove exam room config', err);
                            DialogManager.error('Erreur lors de la suppression de la configuration');
                        }
                    });
                });

                row.appendChild(label);
                row.appendChild(cap);
                row.appendChild(sup);
                row.appendChild(btnRemove);

                configsContainer.appendChild(row);
            });

            // attach change listeners for inline edits
            Array.from(document.querySelectorAll('.exam-room-capacity')).forEach(el => {
                el.addEventListener('change', async () => {
                    const room = el.getAttribute('data-room');
                    const val = Math.max(0, parseInt(el.value, 10) || 0);
                    try {
                        const arr = (StateManager.state.examRoomConfigs || []).slice();
                        const idx = arr.findIndex(x => x.room === room);
                        if (idx > -1) {
                            arr[idx] = Object.assign({}, arr[idx], { capacity: val });
                            if (typeof StateManager.setExamRoomConfigs === 'function') {
                                await StateManager.setExamRoomConfigs(arr);
                            } else {
                                StateManager.state.examRoomConfigs = arr;
                                await StateManager.saveState();
                            }
                            NotificationManager.info(`Capacité mise à jour pour ${room}`, 1200);
                        }
                    } catch (err) {
                        console.error('update capacity failed', err);
                        DialogManager.error('Erreur lors de la mise à jour de la capacité');
                    }
                });
            });

            Array.from(document.querySelectorAll('.exam-room-supervisors')).forEach(el => {
                el.addEventListener('change', async () => {
                    const room = el.getAttribute('data-room');
                    const val = Math.max(0, parseInt(el.value, 10) || 0);
                    try {
                        const arr = (StateManager.state.examRoomConfigs || []).slice();
                        const idx = arr.findIndex(x => x.room === room);
                        if (idx > -1) {
                            arr[idx] = Object.assign({}, arr[idx], { supervisors: val });
                            if (typeof StateManager.setExamRoomConfigs === 'function') {
                                await StateManager.setExamRoomConfigs(arr);
                            } else {
                                StateManager.state.examRoomConfigs = arr;
                                await StateManager.saveState();
                            }
                            NotificationManager.info(`Nombre de surveillants mis à jour pour ${room}`, 1200);
                        }
                    } catch (err) {
                        console.error('update supervisors failed', err);
                        DialogManager.error('Erreur lors de la mise à jour du nombre de surveillants');
                    }
                });
            });
        }

        // Add or update a config when clicking the add button
        if (btnAddRoomConfig) {
            btnAddRoomConfig.addEventListener('click', async () => {
                const room = selectRoomForConfig?.value || '';
                if (!room) {
                    DialogManager.error('Veuillez sélectionner une salle.');
                    return;
                }
                const capacity = Math.max(0, parseInt(inputRoomCapacity?.value || 0, 10) || 0);
                const supervisors = Math.max(0, parseInt(inputRoomSupervisors?.value || 0, 10) || 0);
                try {
                    const arr = (StateManager.state.examRoomConfigs || []).slice();
                    const idx = arr.findIndex(c => c.room === room);
                    let updated;
                    if (idx > -1) {
                        arr[idx] = Object.assign({}, arr[idx], { capacity, supervisors });
                        updated = arr;
                        NotificationManager.success('Configuration mise à jour');
                    } else {
                        updated = arr.concat([{ room, capacity, supervisors }]);
                        NotificationManager.success('Configuration ajoutée');
                    }
                    if (typeof StateManager.setExamRoomConfigs === 'function') {
                        await StateManager.setExamRoomConfigs(updated);
                    } else {
                        StateManager.state.examRoomConfigs = updated;
                        await StateManager.saveState();
                    }
                    renderExamRoomConfigs();
                    populateRoomSelect();
                } catch (err) {
                    console.error('add/update room config failed', err);
                    DialogManager.error('Erreur lors de l\'ajout / mise à jour de la configuration');
                }
            });
        }

        // Save all configs (explicit save)
        if (btnSaveConfigs) {
            btnSaveConfigs.addEventListener('click', async () => {
                try {
                    const normalized = (StateManager.state.examRoomConfigs || []).map(c => ({
                        room: c.room,
                        capacity: Math.max(0, parseInt(c.capacity || 0, 10) || 0),
                        supervisors: Math.max(0, parseInt(c.supervisors || 0, 10) || 0)
                    }));
                    if (typeof StateManager.setExamRoomConfigs === 'function') {
                        await StateManager.setExamRoomConfigs(normalized);
                    } else {
                        StateManager.state.examRoomConfigs = normalized;
                        await StateManager.saveState();
                    }
                    NotificationManager.success('Configurations salles enregistrées');
                } catch (e) {
                    console.error('save configs failed', e);
                    DialogManager.error('Erreur lors de l\'enregistrement des configurations');
                }
            });
        }

        // Populate room select initially and render existing configs
        populateRoomSelect();
        renderExamRoomConfigs();

        // React to changes in registered rooms (if StateManager emits events)
        if (StateManager && typeof StateManager.subscribe === 'function') {
            try {
                StateManager.subscribe('room:added', () => { populateRoomSelect(); });
                StateManager.subscribe('room:removed', () => {
                    populateRoomSelect();
                    renderExamRoomConfigs();
                });
            } catch (e) { /* noop */ }
        }
        // ===== NOUVEAU : Bouton pour ouvrir le wizard de création d'examen =====
        const btnOpenExamWizard = document.getElementById('btnOpenExamWizard');
        if (btnOpenExamWizard && !btnOpenExamWizard.dataset.attached) {
            btnOpenExamWizard.addEventListener('click', () => {
                ExamFormWizard.open();
            });
            btnOpenExamWizard.dataset.attached = '1';
        }


        // form submit
        const form = document.getElementById('formAjouterExamen');
        if (form && !form.dataset.handlersAttached) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const editingId = form.dataset.editingId;

                const subjectsSelectEl = document.getElementById('inputExamSubjects');
                const selectedSubjects = subjectsSelectEl
                    ? Array.from(subjectsSelectEl.selectedOptions).map(o => o.value).filter(Boolean)
                    : [];

                const roomsVal = (document.getElementById('inputExamRooms')?.value || '');
                const roomsArray = roomsVal ? roomsVal.split(',').map(s => s.trim()).filter(Boolean) : [];
                // ✅ Mettre à jour l'indicateur de capacité
                if (typeof window.updateExamCapacityIndicator === 'function') {
                    window.updateExamCapacityIndicator();
                }
                // total students
                const studentsRaw = document.getElementById('inputExamStudentsCount')?.value;
                const studentsCount = (studentsRaw !== undefined && studentsRaw !== null && studentsRaw !== '') ? Math.max(0, parseInt(studentsRaw, 10) || 0) : undefined;

                const payload = {
                    title: document.getElementById('inputExamTitle')?.value || '',
                    date: document.getElementById('inputExamDate')?.value || '',
                    startTime: document.getElementById('inputExamStart')?.value || '',
                    endTime: document.getElementById('inputExamEnd')?.value || '',
                    session: document.getElementById('inputExamSession')?.value || '',
                    filiere: document.getElementById('inputExamFiliere')?.value || '',
                    department: document.getElementById('inputExamDept')?.value || '',
                    subjects: selectedSubjects,
                    rooms: roomsArray,
                    notes: document.getElementById('inputExamNotes')?.value || '',
                    studentsCount: studentsCount
                };

                if (editingId) {
                    await ExamController.updateExam(editingId, payload);
                    delete form.dataset.editingId;
                } else {
                    await ExamController.createExam(payload);
                }
                form.reset();
                // Re-populate selects to reflect current session/state after reset
                try {
                    populateFiliereSelect();
                    populateSubjectsForFiliere(document.getElementById('inputExamFiliere')?.value || '');
                } catch (e) { /* noop */ }
                ExamRenderer.render();
                try { ExamTimetable.render(); } catch (e) { /* noop */ }
            });
            form.dataset.handlersAttached = '1';
        }

        // reset button
        const btnReset = document.getElementById('btnResetExamForm');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                const f = document.getElementById('formAjouterExamen');
                if (f) {
                    f.reset();
                    delete f.dataset.editingId;
                }
            });
        }

        // Planification automatique depuis le formulaire (bouton unique)
        const btnAuto = document.getElementById('btnAutoScheduleCurrentExam');

        if (btnAuto) {
            btnAuto.addEventListener('click', async () => {
                const formEl = document.getElementById('formAjouterExamen');
                if (!formEl) return;
                const editingId = formEl.dataset.editingId;

                if (editingId) {
                    // EXISTANT: schedule existing exam
                    const ok = await this.scheduleExam(editingId);
                    if (ok) {
                        try { ExamTimetable.render(); } catch (e) { /* noop */ }
                    }
                    return ok;
                }
                // ✅ SAUVEGARDER les valeurs du formulaire AVANT de créer l'examen
                const savedFormValues = {
                    title: document.getElementById('inputExamTitle')?.value || '',
                    date: document.getElementById('inputExamDate')?.value || '',
                    startTime: document.getElementById('inputExamStart')?.value || '',
                    endTime: document.getElementById('inputExamEnd')?.value || '',
                    session: document.getElementById('inputExamSession')?.value || '',
                    filiere: document.getElementById('inputExamFiliere')?.value || '',
                    department: document.getElementById('inputExamDept')?.value || '',
                    subjects: Array.from(document.getElementById('inputExamSubjects')?.selectedOptions || []).map(o => o.value),
                    notes: document.getElementById('inputExamNotes')?.value || '',
                    studentsCount: document.getElementById('inputExamStudentsCount')?.value || ''
                };
                // NOUVEAU EXAMEN: build payload from form fields (not yet saved)
                const payload = {
                    title: savedFormValues.title,
                    date: savedFormValues.date,
                    startTime: savedFormValues.startTime,
                    endTime: savedFormValues.endTime,
                    session: savedFormValues.session,
                    filiere: savedFormValues.filiere,
                    department: savedFormValues.department,
                    subjects: savedFormValues.subjects,
                    rooms: (document.getElementById('inputExamRooms')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
                    notes: savedFormValues.notes,
                    studentsCount: savedFormValues.studentsCount ? Math.max(0, parseInt(savedFormValues.studentsCount, 10) || 0) : 0
                };

                // CORRECTION: Utiliser computeAllocationForExam (pas scheduleExam) pour les nouveaux examens
                const allocationResult = ExamSchedulerService.computeAllocationForExam(payload);

                // Gérer les erreurs
                if (allocationResult.error) {
                    if (allocationResult.error === 'filiere_conflict') {
                        const otherId = allocationResult.conflictingExamId || 'inconnu';
                        const otherExam = otherId ? (StateManager.state && Array.isArray(StateManager.state.examens) ? StateManager.state.examens.find(e => e.id === otherId) : null) : null;
                        const otherLabel = otherExam ? `${otherExam.title || ''} (id=${otherId})` : `examen id=${otherId}`;
                        const msg = `Impossible d'enregistrer : une autre matière de la même filière est déjà programmée sur ce créneau — ${otherLabel}. `;
                        DialogManager.error('Planification impossible', msg);
                        NotificationManager.error(msg);
                        return false;
                    }

                    if (allocationResult.error === 'subject_duplicate') {
                        const subs = Array.isArray(allocationResult.conflictingSubjects) ? allocationResult.conflictingSubjects.join(', ') : '';
                        const otherId = allocationResult.conflictingExamId || 'inconnu';
                        const msg = `Impossible d'enregistrer : la/les matière(s) ${subs} ont déjà un examen programmé (examen id=${otherId}).`;
                        DialogManager.error('Planification impossible', msg);
                        NotificationManager.error(msg);
                        return false;
                    }

                    DialogManager.error('Erreur', allocationResult.error || 'Erreur inconnue');
                    return false;
                }

                // Convertir allocations au format simplifié
                const allocations = (allocationResult.allocations || []).map(a => ({
                    room: a.room,
                    students: a.assigned || 0
                }));

                const totalAssigned = allocationResult.totalAssigned || 0;
                const remaining = allocationResult.remaining || 0;

                // Construire le résumé
                let summary = `<p>Répartition proposée pour <strong>${payload.title || ''}</strong> (${payload.studentsCount || 0} étudiant(s)) :</p>`;

                if (!allocations || allocations.length === 0) {
                    summary += '<p style="color:darkred">Aucune salle disponible.  Vérifiez la configuration. </p>';
                } else {
                    summary += '<ul>';
                    allocations.forEach(a => {
                        const capacity = this._getRoomCapacityForDisplay(a.room);
                        summary += `<li>${a.room} — ${a.students}${capacity ? `/${capacity}` : ''} étudiant(s)</li>`;
                    });
                    summary += '</ul>';

                    if (remaining > 0) {
                        summary += `<p style="color:darkred">Étudiants non affectés : <strong>${remaining}</strong></p>`;
                    } else {
                        summary += `<p style="color:green">Tous les étudiants affectés.  Total : <strong>${totalAssigned}</strong></p>`;
                    }
                }

                DialogManager.confirm(
                    'Enregistrer & Planifier',
                    summary,
                    async () => {
                        // Créer l'examen avec les allocations déjà calculées
                        const toCreate = Object.assign({}, payload, {
                            allocations: allocations,
                            totalAssigned: totalAssigned,
                            remaining: remaining,
                            rooms: allocations.map(a => a.room),
                            salles: allocations.map(a => a.room).join(', ')
                        });

                        try {
                            const created = await ExamController.createExam(toCreate);

                            if (created && created.id) {
                                // ❌ NE PLUS définir editingId pour permettre la création d'un nouvel examen
                                delete formEl.dataset.editingId;

                               // console.log('[ExamHandlers] Exam created with ID:', created.id);

                                // IMPORTANT: Dispatch event AVEC le vrai ID de l'examen créé
                                try {
                                    document.dispatchEvent(new CustomEvent('exam:scheduled', {
                                        detail: {
                                            examId: created.id,
                                            allocations: allocations,
                                            totalAssigned: totalAssigned,
                                            remaining: remaining
                                        }
                                    }));
                                   // console.log('[ExamHandlers] ✅ Dispatched exam:scheduled for new exam', created.id);
                                } catch (e) {
                                    console.warn('[ExamHandlers] Failed to dispatch event', e);
                                }
                                // ✅ RESTAURER les valeurs du formulaire (sauf le titre pour éviter les doublons)
                                document.getElementById('inputExamDate').value = savedFormValues.date;
                                document.getElementById('inputExamStart').value = savedFormValues.startTime;
                                document.getElementById('inputExamEnd').value = savedFormValues.endTime;
                                document.getElementById('inputExamSession').value = savedFormValues.session;
                                document.getElementById('inputExamFiliere').value = savedFormValues.filiere;
                                document.getElementById('inputExamDept').value = savedFormValues.department;
                                document.getElementById('inputExamNotes').value = savedFormValues.notes;
                                document.getElementById('inputExamStudentsCount').value = savedFormValues.studentsCount;

                                // ✅ Restaurer les matières sélectionnées
                                const subjectsSelect = document.getElementById('inputExamSubjects');
                                if (subjectsSelect) {
                                    Array.from(subjectsSelect.options).forEach(option => {
                                        option.selected = savedFormValues.subjects.includes(option.value);
                                    });
                                }

                                // ✅ VIDER seulement le titre et suggérer un nouveau
                                const titleInput = document.getElementById('inputExamTitle');
                                if (titleInput) {
                                    // Suggérer un titre incrémenté
                                    const originalTitle = savedFormValues.title;
                                    const match = originalTitle.match(/(. +?)\s*(\d+)$/);
                                    if (match) {
                                        const base = match[1];
                                        const num = parseInt(match[2], 10);
                                        titleInput.value = `${base} ${num + 1}`;
                                    } else {
                                        titleInput.value = `${originalTitle} 2`;
                                    }
                                    titleInput.focus();
                                    titleInput.select();
                                }

                                // ✅ Vider le champ salles pour permettre une nouvelle allocation
                                const roomsInput = document.getElementById('inputExamRooms');
                                if (roomsInput) roomsInput.value = '';
                                // ✅ IMPORTANT : Mettre à jour l'indicateur de capacité
                                if (typeof window.updateExamCapacityIndicator === 'function') {
                                    setTimeout(window.updateExamCapacityIndicator, 200);
                                }

                                ExamRenderer.render();
                                try { ExamTimetable.render(); } catch (e) { /* noop */ }

                                // ✅ IMPORTANT : Forcer la mise à jour de l'indicateur de capacité
                               // console.log('[ExamHandlers] Forcing capacity indicator update after exam creation');
                                setTimeout(() => {
                                    if (typeof window.updateExamCapacityIndicator === 'function') {
                                        window.updateExamCapacityIndicator();
                                    }
                                }, 300);
                                // ✅ Message de succès amélioré
                                NotificationManager.success('✅ Examen planifié !  Vous pouvez créer un autre examen sur le même créneau.');

                                // ✅ Afficher le message d'aide (si l'élément existe)
                                const helper = document.getElementById('exam-form-helper');
                                if (helper) {
                                    helper.style.display = 'block';
                                    setTimeout(() => {
                                        helper.style.transition = 'opacity 0.5s ease';
                                        helper.style.opacity = '0. 7';
                                    }, 5000);
                                }
                            } else {
                                DialogManager.error('Erreur', 'La création de l\'examen a échoué.');
                            }
                        } catch (err) {
                            console.error('createExam failed', err);
                            DialogManager.error('Erreur', 'La création a échoué (erreur interne).');
                        }
                    }
                );
            });
        }
    },

    /**
     * Planifie automatiquement un examen (affectation greedy optimisée vers grandes capacités).
     * Met à jour l'examen et sauvegarde via ExamController.
     * @param {string} id
     */
    async scheduleExam(id) {
        try {
            const exam = (StateManager.state && Array.isArray(StateManager.state.examens)) ? StateManager.state.examens.find(x => x.id === id) : null;
            if (!exam) {
                DialogManager.error('Examen introuvable pour la planification');
                return false;
            }

            // NOUVEAU: Utiliser scheduleExam au lieu de computeAllocationForExam
            const result = ExamSchedulerService.scheduleExam(exam);

            // Gérer les erreurs
            if (!result.ok) {
                const otherId = result.conflictingExamId || null;
                const conflictingExam = otherId ? (StateManager.state && Array.isArray(StateManager.state.examens) ? StateManager.state.examens.find(e => e.id === otherId) : null) : null;
                const otherLabel = conflictingExam ? `${conflictingExam.title || ''} (id=${otherId}) le ${conflictingExam.date || ''} ${conflictingExam.startTime || ''}-${conflictingExam.endTime || ''}` : (otherId ? `examen id=${otherId}` : 'un autre examen');

                if (result.error === 'filiere_conflict') {
                    const msg = `Impossible de planifier : une autre matière de la même filière est déjà programmée sur ce créneau — ${otherLabel}.`;
                    DialogManager.error('Planification impossible', msg);
                    NotificationManager.error(msg);
                    return false;
                }

                if (result.error === 'subject_duplicate') {
                    const subs = Array.isArray(result.conflictingSubjects) ? result.conflictingSubjects.join(', ') : '';
                    const msg = `Impossible de planifier : la/les matière(s) ${subs} ont déjà un examen programmé — ${otherLabel}.`;
                    DialogManager.error('Planification impossible', msg);
                    NotificationManager.error(msg);
                    return false;
                }

                DialogManager.error('Erreur de planification', result.error || 'Erreur inconnue');
                return false;
            }

            // Planification réussie - construire le résumé
            const { allocations, totalAssigned, remaining } = result;

            let summary = `<p>Répartition proposée pour <strong>${exam.title || ''}</strong> (${exam.studentsCount || 0} étudiant(s)) :</p>`;

            if (!allocations || allocations.length === 0) {
                summary += '<p style="color:darkred">Aucune salle disponible.  Vérifiez la configuration des salles d\'examen.</p>';
            } else {
                summary += '<ul>';
                allocations.forEach(a => {
                    const capacity = this._getRoomCapacityForDisplay(a.room);
                    summary += `<li>${a.room} — ${a.students}${capacity ? `/${capacity}` : ''} étudiant(s)</li>`;
                });
                summary += '</ul>';

                if (remaining > 0) {
                    summary += `<p style="color:darkred">Étudiants non affectés : <strong>${remaining}</strong></p>`;
                } else {
                    summary += `<p style="color:green">Tous les étudiants affectés. Total : <strong>${totalAssigned}</strong></p>`;
                }
            }

            DialogManager.confirm(
                'Planification automatique',
                summary,
                async () => {
                    // Les allocations sont déjà sauvegardées par scheduleExam()
                    // Il suffit de rafraîchir l'UI
                    ExamRenderer.render();
                    try { ExamTimetable.render(); } catch (e) { /* noop */ }
                    NotificationManager.success('Planification automatique appliquée');
                },
                () => { /* cancel */ }
            );

            return true;

        } catch (err) {
            console.error('scheduleExam error', err);
            DialogManager.error('Erreur lors de la planification automatique');
            return false;
        }
    },
    /**
     * NOUVEAU: Helper pour afficher la capacité d'une salle
     */
    _getRoomCapacityForDisplay(roomName) {
        try {
            const configs = StateManager?.state?.examRoomConfigs || [];
            const config = configs.find(c => c.room === roomName);
            return config?.capacity || 0;
        } catch (e) {
            return 0;
        }
    },

    /**
 * Ouvre le gestionnaire de répartition pour un examen
 */
    manageExamRoomAllocation(examId) {
        try {
            // Import déjà fait en haut du fichier
            if (ExamRoomAllocator && typeof ExamRoomAllocator.openAllocatorModal === 'function') {
                ExamRoomAllocator.openAllocatorModal(examId);
            } else {
                DialogManager?.error('Le gestionnaire de répartition n\'est pas disponible');
            }
        } catch (err) {
            console.error('Erreur ouverture gestionnaire répartition:', err);
            DialogManager?.error('Impossible d\'ouvrir le gestionnaire de répartition');
        }
    }

};
// Bouton planification automatique
document.getElementById('btnAutoScheduleCurrentExam')?.addEventListener('click', () => {
    const examId = document.getElementById('inputExamId')?.value;
    if (!examId) return;

    const exams = StateManager.state.examens || [];
    const exam = exams.find(e => String(e.id) === examId);
    if (!exam) {
        NotificationManager.error('Examen non trouvé');
        return;
    }

    // NOUVELLE MÉTHODE
    const result = ExamSchedulerService.scheduleExam(exam);

    if (result.ok) {
        NotificationManager.success(
            `Planification réussie !  ${result.totalAssigned} étudiants placés dans ${result.usedRooms.length} salle(s)`
        );

        // Rafraîchir l'UI
        ExamRenderer?.render?.();
    } else {
        if (result.error === 'subject_duplicate') {
            NotificationManager.error(`Cette matière est déjà planifiée dans un autre examen (ID: ${result.conflictingExamId})`);
        } else if (result.error === 'filiere_conflict') {
            NotificationManager.error(`Conflit de filière avec l'examen ${result.conflictingExamId}`);
        } else {
            NotificationManager.error(`Erreur de planification: ${result.error}`);
        }
    }

});

export default ExamHandlers;