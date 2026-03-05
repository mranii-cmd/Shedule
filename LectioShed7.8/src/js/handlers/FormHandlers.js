/**
 * Gestionnaire des événements de formulaires
 * @author Ibrahim Mrani - UCD
 */

import FormManager from '../ui/FormManager.js';
import SessionController from '../controllers/SessionController.js';
import StateManager from '../controllers/StateManager.js';
import LogService from '../services/LogService.js';
import NotificationManager from '../ui/NotificationManager.js';
import DialogManager from '../ui/DialogManager.js';
import TableRenderer from '../ui/TableRenderer.js';
import SchedulingService from '../services/SchedulingService.js';
import SubjectController from '../controllers/SubjectController.js';
import TeacherController from '../controllers/TeacherController.js';
import { deepClone } from '../utils/helpers.js';

// Defensive: ensure a minimal ValidationService API exists as early as module load time
try {
    if (typeof window !== 'undefined') {
        if (typeof window.ValidationService === 'undefined') {
            window.ValidationService = { clearFormErrors: function () { /* noop for compatibility */ } };
        } else if (window.ValidationService && typeof window.ValidationService.clearFormErrors !== 'function') {
            window.ValidationService.clearFormErrors = function () { /* noop for compatibility */ };
        }
    }
} catch (e) { /* noop */ }

class FormHandlers {

    constructor() {
        // Lier le contexte 'this' pour éviter les erreurs lors des callbacks d'événements
        this.handleSeanceFormSubmit = this.handleSeanceFormSubmit.bind(this);
        this.handleAddTeacher = this.handleAddTeacher.bind(this);
        this.handleAddSubject = this.handleAddSubject.bind(this);
        this.handleAddFiliere = this.handleAddFiliere.bind(this);
        this.handleRemoveSubject = this.handleRemoveSubject.bind(this);
        this._subjectDeleteProxy = null;
    }

    /**
     * Initialisation appelée par main.js
     */
    init() {
        console.log("📝 FormHandlers initialized");
        this.setupEventListeners();

        // Reassure: ensure ValidationService.clearFormErrors exists (redundant but safe)
        try {
            if (typeof window !== 'undefined' && typeof ValidationService === 'undefined') {
                window.ValidationService = { clearFormErrors: function () { /* noop for compatibility */ } };
            } else if (typeof window !== 'undefined' && window.ValidationService && typeof window.ValidationService.clearFormErrors !== 'function') {
                window.ValidationService.clearFormErrors = function () { /* noop for compatibility */ };
            }
        } catch (e) { /* noop */ }
    }

    /**
     * Configure les écouteurs d'événements sur les formulaires
     */
    setupEventListeners() {
        // 1. Formulaire d'édition/création de séance (si déjà présent)
        const formSeance = document.getElementById('formSeance');
        if (formSeance) {
            // Retirer l'ancien listener pour éviter les doublons (si rechargement)
            formSeance.removeEventListener('submit', this.handleSeanceFormSubmit);
            formSeance.addEventListener('submit', this.handleSeanceFormSubmit);
        } else {
            // si le formulaire est injecté plus tard, installer un handler délégué unique (capture)
            if (!window.__formSeanceDelegationInstalled) {
                document.addEventListener('submit', (ev) => {
                    try {
                        const target = ev.target;
                        if (!target) return;
                        if (target.id === 'formSeance' || (target.matches && target.matches('#formSeance'))) {
                            // Déléguer vers la méthode instance (binding ok)
                            ev.preventDefault();
                            this.handleSeanceFormSubmit(ev);
                        }
                    } catch (e) { /* noop */ }
                }, true);
                window.__formSeanceDelegationInstalled = true;
            }
        }

        // 2. Formulaire Ajout Enseignant (button handler)
        const btnAddTeacher = document.getElementById('btnSubmitTeacher');
        if (btnAddTeacher) {
            btnAddTeacher.removeEventListener && btnAddTeacher.removeEventListener('click', this._btnAddTeacherProxy);
            // small proxy to avoid creating many closures when reattaching
            this._btnAddTeacherProxy = (e) => {
                e.preventDefault();
                const inputName = document.getElementById('inputTeacherName');
                if (inputName) this.handleAddTeacher(inputName.value);
            };
            btnAddTeacher.addEventListener('click', this._btnAddTeacherProxy);
        }
        // If it's a real <form id="formAddTeacher">
        const formTeacher = document.getElementById('formAddTeacher');
        if (formTeacher) {
            formTeacher.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = formTeacher.querySelector('input[name="nom"]');
                if (input) this.handleAddTeacher(input.value);
            });
        }

        // 3. Formulaire Ajout Matière
        const btnAddSubject = document.getElementById('btnSubmitSubject');
        if (btnAddSubject) {
            btnAddSubject.addEventListener('click', (e) => {
                e.preventDefault();
                const name = document.getElementById('inputSubjectName')?.value;
                if (name) this.handleAddSubject({ nom: name });
            });
        }
        // --- NEW: délégation pour suppression de matière via bouton avec data-subject-name ---
        if (!this._subjectDeleteProxy) {
            this._subjectDeleteProxy = (e) => {
                try {
                    // Recherche robuste de l'élément le plus proche correspondant au sélecteur,
                    // tenant compte des Text nodes et du Shadow DOM (composedPath).
                    const findClosestFromEventTarget = (evt, selector) => {
                        if (!evt) return null;
                        try {
                            if (typeof evt.composedPath === 'function') {
                                const path = evt.composedPath();
                                for (const node of path) {
                                    if (node && node.nodeType === Node.ELEMENT_NODE) {
                                        try {
                                            if (node.matches && node.matches(selector)) return node;
                                        } catch (err) { /* ignore malformed selector errors */ }
                                    }
                                }
                            }
                        } catch (err) { /* ignore composedPath errors */ }

                        let target = evt.target || evt.srcElement || null;
                        if (!target) return null;
                        // if clicked on a Text node, climb to parent element
                        if (target.nodeType === Node.TEXT_NODE) target = target.parentElement;

                        if (target && typeof target.closest === 'function') {
                            try { return target.closest(selector); } catch (err) { /* ignore */ }
                        }

                        // fallback manual climb
                        let node = target;
                        while (node && node.nodeType === Node.ELEMENT_NODE) {
                            try { if (node.matches && node.matches(selector)) return node; } catch (err) { /* ignore */ }
                            node = node.parentElement;
                        }
                        return null;
                    };

                    const btn = findClosestFromEventTarget(e, '.btnDeleteSubject, [data-action="delete-subject"]');
                    if (!btn) return;
                    e.preventDefault();
                    const name = btn.getAttribute('data-subject-name') || btn.dataset?.subjectName || btn.dataset?.name;
                    if (!name) {
                        DialogManager.error('Nom de matière introuvable pour la suppression.');
                        return;
                    }
                    const confirmMsg = `Supprimer la matière "${name}" ? Cette action est irréversible.`;
                    if (!window.confirm(confirmMsg)) return;
                    this.handleRemoveSubject(name);
                } catch (err) {
                    console.error('subject delete proxy error', err);
                }
            };
            document.addEventListener('click', this._subjectDeleteProxy, true);
        }
        // 4. Formulaire Ajout Filière
        const formFiliere = document.getElementById('formFiliere');
        if (formFiliere) {
            formFiliere.addEventListener('submit', (e) => {
                e.preventDefault();
                const nom = document.getElementById('inputFiliereName')?.value;
                const session = document.getElementById('inputFiliereSession')?.value || StateManager.state.header.session;
                if (nom) this.handleAddFiliere({ nom, session });
            });
        }
    }

    /**
     * Gère la soumission du formulaire de séance
     * @param {Event} event - L'événement de soumission
     */
    async handleSeanceFormSubmit(event) {
        try {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();

            // Snapshot état des séances avant tentative pour pouvoir rollback si nécessaire
            const prevSeances = deepClone(typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : (StateManager.state.seances || []));

            // Obtain formData defensively
            let formData = {};
            try {
                if (FormManager && typeof FormManager.getSeanceFormData === 'function') {
                    formData = FormManager.getSeanceFormData() || {};
                } else {
                    // Fallback: build minimal formData from DOM
                    const formEl = document.getElementById('formSeance') || document.querySelector('[data-seance-form]');
                    if (formEl) {
                        formData.matiere = (formEl.querySelector('input[name="matiere"]') || {}).value || formEl.querySelector('input[name="titre"]')?.value || '';
                        formData.type = (formEl.querySelector('select[name="type"]') || {}).value || '';
                        formData.jour = (formEl.querySelector('select[name="jour"]') || {}).value || '';
                        formData.creneau = (formEl.querySelector('select[name="creneau"]') || {}).value || formEl.querySelector('input[name="creneau"]')?.value || '';
                        formData.enseignant = (formEl.querySelector('#inputEnseignant1') || {}).value || '';
                        formData.enseignants = [];
                        const e2 = formEl.querySelector('#inputEnseignant2');
                        if (e2 && e2.value) formData.enseignants.push(e2.value);
                    }
                }
            } catch (e) {
                console.warn('handleSeanceFormSubmit: failed to get formData from FormManager, proceeding with empty object', e);
                formData = formData || {};
            }
            // Repérer si la case à cocher des conflits existe et est cochée
            const allowConflictCheckbox = document.getElementById('allowTimeSlotConflict');
            formData.allowTimeSlotConflict = allowConflictCheckbox && allowConflictCheckbox.checked;
            console.log('[FormHandlers] formData.allowTimeSlotConflict =', formData.allowTimeSlotConflict);
            if (allowConflictCheckbox && allowConflictCheckbox.checked) {
                formData.allowTimeSlotConflict = true;
            }
            // --- BEGIN PATCH: empêcher la mise à jour des enseignants depuis une "continuation" (2e partie TP) ---
            try {
                const formEl = document.getElementById('formSeance') || document.querySelector('[data-seance-form]');
                const isContinuation = !!(formEl && (formEl.dataset?.isContinuation === '1' || formEl.dataset?.isContinuation === 'true'));
                if (isContinuation) {
                    delete formData.enseignant;
                    delete formData.enseignants;
                    delete formData.enseignantsArray;
                    delete formData.teachers;
                    if (formData.teacher) delete formData.teacher;
                    try { NotificationManager && NotificationManager.info && NotificationManager.info('Les enseignants ne peuvent pas être modifiés depuis cette partie du TP. Modifiez la séance principale pour changer les enseignants.', 4000); } catch (e) { }
                }
            } catch (e) {
                console.debug('handleSeanceFormSubmit: continuation guard failed', e);
            }
            // --- END PATCH ---

           // Supporter update/create qui peuvent retourner un objet ou une Promise
            // Calculer options: autoriser l'absence de salle si aucune salle sélectionnée
            const opts = {};
            try {
                const salleVal = formData && (formData.salle || formData.room || formData.local || '');
                if (!salleVal || String(salleVal).trim() === '' || String(salleVal) === '__NOSALLE__') {
                    opts.allowNoRoom = true;
                    // also keep explicit flag on formData for downstream consumers
                    formData.allowNoRoom = true;
                }
            } catch (e) { /* noop */ }

            let maybePromise;
            try {
                if (FormManager && FormManager.currentMode === 'edit') {
                    maybePromise = SessionController.updateSession(FormManager.editingSessionId, formData, opts);
                } else {
                    maybePromise = SessionController.createSession(formData, opts);
                }
            } catch (e) {
                console.error('SessionController call threw synchronously', e);
                // treat as failure
                try {
                    if (StateManager && StateManager.state) {
                        StateManager.state.seances = Array.isArray(prevSeances) ? prevSeances : (prevSeances || []);
                        if (typeof StateManager.saveState === 'function') await StateManager.saveState();
                    }
                } catch (errRollback) { console.warn('Rollback failed after synchronous throw', errRollback); }
                NotificationManager.error('Erreur lors de la tentative de sauvegarde de la séance.');
                try { TableRenderer.render(); } catch (e) { }
                return;
            }

            const result = (maybePromise && typeof maybePromise.then === 'function') ? await maybePromise : maybePromise;

            // Si succès : reset + render (garantir que reset ne casse pas l'app)
            if (result && result.success) {
                NotificationManager.success(FormManager && FormManager.currentMode === 'edit' ? 'Séance modifiée avec succès' : 'Séance créée avec succès');

                // FormManager.resetSeanceForm peut appeler des helpers qui n'existent pas
                try {
                    if (FormManager && typeof FormManager.resetSeanceForm === 'function') {
                        FormManager.resetSeanceForm();
                    } else {
                        const formEl = document.getElementById('formSeance');
                        if (formEl && typeof formEl.reset === 'function') formEl.reset();
                    }
                } catch (errReset) {
                    console.warn('FormManager.resetSeanceForm failed:', errReset);
                    try {
                        const formEl = document.getElementById('formSeance');
                        if (formEl && typeof formEl.reset === 'function') formEl.reset();
                    } catch (e) { /* noop */ }
                }

                try { await this._normalizeSeancesInMemory(); } catch (e) { console.debug('_normalizeSeancesInMemory failed', e); }
                try { TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render failed after submit', e); }
                return;
            }

            // Échec : rollback état si create/update a laissé des effets secondaires
            try {
                if (StateManager && StateManager.state) {
                    StateManager.state.seances = Array.isArray(prevSeances) ? prevSeances : (prevSeances || []);
                    if (typeof StateManager.saveState === 'function') {
                        const sv = StateManager.saveState();
                        if (sv && typeof sv.then === 'function') await sv;
                    }
                }
            } catch (errRollback) {
                console.warn('Rollback failed after failed create/update', errRollback);
            }

            // Ré-renderiser pour garantir DOM cohérent et nettoyage éventuel
            try {
                if (typeof this._cleanupPotentialInvalidSeances === 'function') {
                    await this._cleanupPotentialInvalidSeances();
                }
            } catch (e) { /* noop */ }
            try { TableRenderer.render(); } catch (e) { /* noop */ }

            // Afficher les conflits/erreurs de validation de façon lisible
            console.warn('handleSeanceFormSubmit: result indicates failure –', result);

            const conflicts = (result && result.conflicts) ? result.conflicts : null;
            if (Array.isArray(conflicts) && conflicts.length > 0) {
                const html = '<ul>' + conflicts.map(c => `<li>${c}</li>`).join('') + '</ul>';
                DialogManager.error('Conflits détectés', html);
                try {
                    if (FormManager && FormManager.currentMode === 'edit') {
                        const editingId = FormManager.editingSessionId;
                        let restored = (prevSeances || []).find(s => String(s.id) === String(editingId));
                        if (!restored) {
                            const all = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (StateManager.state.seances || []);
                            restored = (all || []).find(s => String(s.id) === String(editingId));
                        }
                        if (restored && typeof FormManager.fillSeanceForm === 'function') {
                            FormManager.fillSeanceForm(restored);
                        }
                        const formEl = document.getElementById('formSeance') || document.getElementById('formAjouterSeance');
                        if (formEl) {
                            const btn = formEl.querySelector('[type="submit"], button[type="submit"]');
                            if (btn) btn.disabled = false;
                        }
                    }
                } catch (e) {
                    console.debug('restore form after conflict failed', e);
                }
            } else if (result && result.error) {
                DialogManager.error('Erreur', String(result.error));
                try {
                    if (typeof this._cleanupPotentialInvalidSeances === 'function') {
                        await this._cleanupPotentialInvalidSeances();
                    }
                } catch (e) { /* noop */ }
                try {
                    const formEl = document.getElementById('formSeance') || document.getElementById('formAjouterSeance');
                    if (formEl) {
                        const btn = formEl.querySelector('[type="submit"], button[type="submit"]');
                        if (btn) btn.disabled = false;
                    }
                } catch (e) { }
            } else {
                NotificationManager.warning('La soumission a échoué. Vérifiez les champs du formulaire.');
            }

        } catch (err) {
            console.error('handleSeanceFormSubmit unexpected error:', err);
            NotificationManager.error('Erreur lors de la soumission du formulaire (voir la console).');

            // Tentative de restore si possible
            try {
                const prevSeances = deepClone(typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : (StateManager.state.seances || []));
                if (StateManager && StateManager.state && !Array.isArray(StateManager.state.seances)) {
                    StateManager.state.seances = prevSeances;
                    if (typeof StateManager.saveState === 'function') StateManager.saveState();
                    try { TableRenderer.render(); } catch (e) { }
                }
            } catch (e) { /* noop */ }
        }
    }

    async _cleanupPotentialInvalidSeances() {
        try {
            const state = StateManager && StateManager.state ? StateManager.state : null;
            if (!state) return;

            const seances = Array.isArray(state.seances) ? state.seances : (Array.isArray(state.seances) ? state.seances : []);
            if (!Array.isArray(seances)) return;

            const beforeCount = seances.length;

            const filtered = seances.filter(s => {
                if (!s) return false;
                if (typeof s.id === 'undefined' || s.id === null || String(s.id).trim() === '') return false;
                if (!s.jour || !s.creneau || !s.matiere) return false;
                return true;
            });

            if (filtered.length !== beforeCount) {
                try {
                    state.seances = filtered;
                } catch (e) {
                    try {
                        StateManager.state.seances = filtered;
                    } catch (e2) { /* noop */ }
                }

                try {
                    if (StateManager && typeof StateManager.saveState === 'function') {
                        const maybe = StateManager.saveState();
                        if (maybe && typeof maybe.then === 'function') await maybe;
                    }
                } catch (errSave) {
                    console.warn('FormHandlers._cleanupPotentialInvalidSeances: StateManager.saveState failed', errSave);
                }
            }
        } catch (err) {
            console.warn('FormHandlers._cleanupPotentialInvalidSeances error', err);
        } finally {
            try { await this._normalizeSeancesInMemory(); } catch (e) { /* noop */ }
            try { TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render failed in cleanup', e); }
        }
    }

    /**
     * Ensure seances in StateManager.state have the runtime shape expected by renderers.
     */
    async _normalizeSeancesInMemory() {
        try {
            const state = StateManager && StateManager.state ? StateManager.state : null;
            if (!state || !Array.isArray(state.seances)) return;

            for (let i = 0; i < state.seances.length; i++) {
                const s = state.seances[i];
                if (!s || typeof s !== 'object') continue;

                if (!Array.isArray(s.enseignants)) {
                    if (Array.isArray(s.enseignantsArray)) {
                        s.enseignants = s.enseignantsArray.slice();
                    } else if (Array.isArray(s.teachers)) {
                        s.enseignants = s.teachers.slice();
                    } else {
                        s.enseignants = [];
                    }
                }

                if (!s.jour) s.jour = s.jour || '';
                if (!s.creneau) s.creneau = s.creneau || '';
                if (!s.matiere) s.matiere = s.matiere || '';

                if (typeof s.hasTeacher !== 'function') {
                    Object.defineProperty(s, 'hasTeacher', {
                        configurable: true,
                        enumerable: false,
                        writable: true,
                        value: function (name) {
                            if (!name) return this.enseignants && this.enseignants.length > 0;
                            try {
                                const n = String(name).trim().toLowerCase();
                                return Array.isArray(this.enseignants) && this.enseignants.some(x => String(x).trim().toLowerCase() === n);
                            } catch (e) { return false; }
                        }
                    });
                }

                if (!s.salle && s.room) s.salle = s.room;
                if (!s.salle && s.roomName) s.salle = s.roomName;

                if (typeof s.hasRoom !== 'function') {
                    Object.defineProperty(s, 'hasRoom', {
                        configurable: true,
                        enumerable: false,
                        writable: true,
                        value: function (roomName) {
                            if (!roomName) return !!(this.salle || (this.room && String(this.room).trim() !== ''));
                            try {
                                const r = String(roomName).trim().toLowerCase();
                                if (this.salle && String(this.salle).trim().toLowerCase() === r) return true;
                                if (this.room && String(this.room).trim().toLowerCase() === r) return true;
                                if (this.salleLabel && String(this.salleLabel).trim().toLowerCase() === r) return true;
                                return false;
                            } catch (e) { return false; }
                        }
                    });
                }

                if (typeof s.getRoomName !== 'function') {
                    Object.defineProperty(s, 'getRoomName', {
                        configurable: true,
                        enumerable: false,
                        writable: true,
                        value: function () {
                            return this.salle || this.room || this.roomName || (this.salleLabel || '');
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('_normalizeSeancesInMemory failed', e);
        }
    }

    handleAddTeacher(nom) {
        if (!nom) return;

        try {
            const result = TeacherController.addTeacher(nom);

            if (result) {
                NotificationManager.success(`Enseignant "${nom}" ajouté`);
                if (FormManager.resetTeacherForm) FormManager.resetTeacherForm();
                if (window.EDTApp && window.EDTApp.populateFormSelects) window.EDTApp.populateFormSelects();
            }
        } catch (e) {
            console.error('handleAddTeacher error', e);
            NotificationManager.error('Erreur lors de l\'ajout de l\'enseignant.');
        }
    }

    async handleAddSubject(data) {
        if (!data || !data.nom) return;

        try {
            // Preferer l'API StateManager pour cohérence et persistance
            let ok = false;
            if (typeof StateManager.addMatiere === 'function') {
                ok = StateManager.addMatiere(data.nom, data);
            } else if (typeof StateManager.addSubject === 'function') {
                ok = StateManager.addSubject(data.nom, data);
            } else if (typeof SubjectController !== 'undefined' && typeof SubjectController.addSubject === 'function') {
                // fallback si contrôleur existant (ancienne API)
                ok = SubjectController.addSubject(data.nom, data);
            } else {
                console.warn('Aucune API d\'ajout de matière trouvée.');
            }

            if (!ok) {
                NotificationManager.error(`Impossible d'ajouter la matière "${data.nom}". (doublon ou données invalides)`);
                return;
            }

            // Persister explicitement et attendre la fin
            if (typeof StateManager.saveState === 'function') {
                try {
                    await StateManager.saveState();
                } catch (e) {
                    console.warn('saveState failed after addMatiere:', e);
                }
            }

            NotificationManager.success(`Matière "${data.nom}" ajoutée`);
            if (FormManager.resetSubjectForm) FormManager.resetSubjectForm();
            if (window.EDTApp && window.EDTApp.populateFormSelects) window.EDTApp.populateFormSelects();
        } catch (e) {
            console.error('handleAddSubject error', e);
            NotificationManager.error('Erreur lors de l\'ajout de la matière.');
        }
     }

    /**
     * Supprime une matière par nom (handler appelé depuis UI)
     * @param {string} nom - Nom exact de la matière à supprimer
     */
    async handleRemoveSubject(nom) {
        if (!nom) return;
        try {
            const removed = typeof StateManager.removeSubject === 'function'
                ? StateManager.removeSubject(nom)
                : (delete StateManager.state.matiereGroupes[nom]);
            if (!removed) {
                DialogManager.error(`La matière "${nom}" est introuvable ou ne peut pas être supprimée.`);
                return;
            }

            // Persister
            if (typeof StateManager.saveState === 'function') {
                try { await StateManager.saveState(); } catch (e) { console.warn('saveState failed after removeSubject', e); }
            }

            NotificationManager.success(`Matière "${nom}" supprimée`);
            if (window.EDTApp && window.EDTApp.populateFormSelects) window.EDTApp.populateFormSelects();
        } catch (e) {
            console.error('handleRemoveSubject error', e);
            NotificationManager.error('Erreur lors de la suppression de la matière.');
        }
    }

    handleAddFiliere(data) {
        if (!data.nom || data.nom.trim() === '') {
            DialogManager.error('Veuillez saisir un nom de filière.');
            return;
        }

        try {
            const exists = StateManager.state.filieres.some(f => f.nom === data.nom);
            if (exists) {
                DialogManager.error(`La filière "${data.nom}" existe déjà.`);
                return;
            }

            StateManager.state.filieres.push({
                nom: data.nom,
                session: data.session
            });

            LogService.success(`✅ Filière "${data.nom}" (${data.session}) ajoutée`);
            NotificationManager.success('Filière ajoutée');

            if (FormManager.resetFiliereForm) FormManager.resetFiliereForm();
            StateManager.saveState();

            if (window.EDTApp && window.EDTApp.populateFormSelects) window.EDTApp.populateFormSelects();
        } catch (e) {
            console.error('handleAddFiliere error', e);
            NotificationManager.error('Erreur lors de l\'ajout de la filière.');
        }
    }

    /**
     * Attribue rapidement la séance configurée à une cellule
     */
    attribuerSeanceDirectement(jour, creneau) {
        (async () => {
            const prevSeances = deepClone(typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : (StateManager.state.seances || []));
            try {
                const formData = (FormManager && typeof FormManager.getSeanceFormData === 'function') ? FormManager.getSeanceFormData() : {};
                formData.jour = jour;
                formData.creneau = creneau;
                try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('direct assign ' + jour + ' ' + creneau); } catch (e) { console.debug('pushUndoState direct assign failed', e); }
                // propagate manual "allow conflict" checkbox if present (ensures createSession will receive it)
                try {
                    const allowConflictCheckbox = document.getElementById('allowTimeSlotConflict');
                    if (allowConflictCheckbox && allowConflictCheckbox.checked) {
                        formData.allowTimeSlotConflict = true;
                    }
                } catch (e) { /* noop */ }
                const maybePromise = SessionController.createSession(formData);
                const result = (maybePromise && typeof maybePromise.then === 'function') ? await maybePromise : maybePromise;

                if (result && result.success) {
                    try {
                        if (StateManager && typeof StateManager.saveState === 'function') {
                            const sav = StateManager.saveState();
                            if (sav && typeof sav.then === 'function') await sav;
                        }
                    } catch (errSave) {
                        console.warn('StateManager.saveState failed after direct assign:', errSave);
                    }

                    LogService.success(`✅ Séance attribuée à ${jour} ${creneau}`);
                    NotificationManager.success('Séance ajoutée');
                    TableRenderer.render();
                } else {
                    try {
                        if (StateManager && StateManager.state) {
                            StateManager.state.seances = Array.isArray(prevSeances) ? prevSeances : (prevSeances || []);
                            if (typeof StateManager.saveState === 'function') {
                                const sv = StateManager.saveState();
                                if (sv && typeof sv.then === 'function') await sv;
                            }
                        }
                    } catch (errRollback) {
                        console.warn('Rollback failed after failed direct assign', errRollback);
                    }
                    TableRenderer.render();
                    NotificationManager.error('Impossible d\'attribuer la séance : voir la console');
                }
            } catch (err) {
                try {
                    if (StateManager && StateManager.state) {
                        StateManager.state.seances = Array.isArray(prevSeances) ? prevSeances : (prevSeances || []);
                        if (typeof StateManager.saveState === 'function') StateManager.saveState();
                    }
                } catch (er) { /* noop */ }

                console.error('attribuerSeanceDirectement error', err);
                NotificationManager.error('Erreur lors de l\'attribution directe');
                try { TableRenderer.render(); } catch (e) { }
            }
        })();
    }

    resetSeanceForm() {
        try {
            const formEl = document.getElementById('formSeance') || document.getElementById('formAjouterSeance');
            if (formEl && typeof formEl.reset === 'function') {
                formEl.reset();
            }

            try {
                if (formEl) {
                    const submitBtn = formEl.querySelector('[type="submit"], button[type="submit"]');
                    if (submitBtn) submitBtn.disabled = false;
                }
            } catch (e) { /* noop */ }

            if (typeof ValidationService !== 'undefined' && typeof ValidationService.clearFormErrors === 'function') {
                try {
                    ValidationService.clearFormErrors();
                } catch (e) {
                    console.warn('FormManager.resetSeanceForm: ValidationService.clearFormErrors threw', e);
                }
            } else {
                try {
                    const errorSelectors = [
                        '.input-error',
                        '.has-error',
                        '.is-invalid',
                        '.validation-error',
                        '.field-error'
                    ];
                    errorSelectors.forEach(sel => {
                        if (!formEl) return;
                        formEl.querySelectorAll(sel).forEach(el => {
                            el.classList.remove('input-error', 'has-error', 'is-invalid', 'validation-error', 'field-error');
                            try { el.removeAttribute('aria-invalid'); } catch (e) { }
                        });
                    });

                    const messageSelectors = ['.validation-message', '.error-text', '.field-error-message'];
                    messageSelectors.forEach(sel => {
                        if (!formEl) return;
                        formEl.querySelectorAll(sel).forEach(el => { el.textContent = ''; });
                    });

                    formEl.querySelectorAll('.form-group.has-error').forEach(g => g.classList.remove('has-error'));
                } catch (e) {
                    console.debug('FormManager.resetSeanceForm fallback cleanup failed', e);
                }
            }

            try {
                if (typeof this.closeSeanceModal === 'function') {
                    this.closeSeanceModal();
                } else {
                    const modal = document.querySelector('#modalSeance, #modalFormSeance');
                    if (modal && modal.classList) {
                        modal.style.display = 'none';
                    }
                }
            } catch (e) { /* noop */ }

        } catch (err) {
            console.warn('FormManager.resetSeanceForm failed (caught)', err);
        }
    }
}

// Export instance (Singleton)
const instance = new FormHandlers();
export default instance;