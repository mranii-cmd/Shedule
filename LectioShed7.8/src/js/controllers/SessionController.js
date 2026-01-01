/**
 * Contrôleur pour la gestion des séances (CRUD)
 * @author Ibrahim Mrani - UCD
 */

import Session from '../models/Session.js';
import StateManager from './StateManager.js';
import ConflictService from '../services/ConflictService.js';
import ValidationService from '../services/ValidationService.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import TableRenderer from '../ui/TableRenderer.js';
import { CRENEAUX_COUPLES_SUIVANT } from '../config/constants.js';

class SessionController {
    /**
     * Crée une nouvelle séance
     * ...
     */
    createSession(formData, options = {}) {
        const { allowNoRoom = false, excludeIds = [] } = options;
        // (contenu inchangé)
        const validation = ValidationService.validateSeanceData(formData, allowNoRoom);

        if (!validation.isValid) {
            ValidationService.highlightFormErrors(
                validation.missingFields.map(f => `input${f.replace(/\s/g, '')}`)
            );

            DialogManager.error(
                `Veuillez remplir les champs manquants : <strong>${validation.missingFields.join(', ')}</strong>.`
            );

            return { success: false, session: null, conflicts: validation.errors };
        }

        const htpValue = this.getHtpForSubject(formData.matiere, formData.type);
        const session = Session.fromFormData(formData, StateManager.state.nextSessionId, htpValue);

        // push undo snapshot before mutating global state (create session)
        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('create session'); } catch (e) { console.debug('pushUndoState create failed', e); }

        // push undo snapshot before mutating global state (create session)
        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('create session'); } catch (e) { console.debug('pushUndoState create failed', e); }
        // Propagate manual "allow conflict" / force flags from formData/options so ConflictService can honor them.
        // Accept several flag names to be resilient (allowTimeSlotConflict, force, meta.force).
        try {
            const allowFlag = Boolean(
                (formData && (formData.allowTimeSlotConflict === true || formData.force === true)) ||
                (options && options.allowTimeSlotConflict === true) ||
                (formData && formData.meta && (formData.meta.allowTimeSlotConflict === true || formData.meta.force === true))
            );
            session.allowTimeSlotConflict = allowFlag;
        } catch (e) {
            // defensive: don't break creation if something goes wrong here
            console.debug('Failed to propagate allowTimeSlotConflict on session', e);
        }
        const conflicts = ConflictService.checkAllConflicts(
            session,
            StateManager.getSeances(),
            excludeIds,
            StateManager.state.sallesInfo
        );

        if (conflicts.length > 0) {
            const errorHtml = '<ul>' + conflicts.map(c => `<li>${c}</li>`).join('') + '</ul>';
            DialogManager.error(`Conflits détectés :<br>${errorHtml}`);
            return { success: false, session: null, conflicts };
        }

        StateManager.addSeance(session);
        if (
            String(session.session || StateManager.state.header.session)
                .toLowerCase()
                .includes('automne')
        ) {
            StateManager.recomputeVolumesAutomne();
        }

        if (formData.type === 'TP') {
            const paired = CRENEAUX_COUPLES_SUIVANT[formData.creneau];

            if (paired) {
                const secondPart = session.clone();
                secondPart.id = StateManager.state.nextSessionId;
                secondPart.creneau = paired;
                secondPart.hTP_Affecte = 0;

                StateManager.addSeance(secondPart);
            }
        }

        LogService.success(
            `Séance ajoutée: ${formData.matiere} (${formData.type}) - ${formData.filiere} ${session.groupe} [${formData.jour} ${formData.creneau}]`
        );

        return { success: true, session, conflicts: [] };
    }

    /**
     * Supprime une séance (avec gestion TP couplés)
     * ...
     */
    deleteSession(id) {
        const seance = StateManager.findSeanceById(id);
        if (!seance) {
            return { success: false, deletedCount: 0 };
        }

        const allSeances = StateManager.getSeances();
        let idsToDelete = [id];

        if (seance.type === 'TP' && seance.hTP_Affecte > 0 && CRENEAUX_COUPLES_SUIVANT.hasOwnProperty(seance.creneau)) {
            const nextCreneau = CRENEAUX_COUPLES_SUIVANT[seance.creneau];
            const coupledSession = allSeances.find(s =>
                s.jour === seance.jour &&
                s.creneau === nextCreneau &&
                s.uniqueStudentEntity === seance.uniqueStudentEntity &&
                s.type === seance.type
            );

            if (coupledSession) {
                idsToDelete.push(coupledSession.id);
                LogService.info(`Suppression du créneau TP couplé de ${nextCreneau}.`);
            }
        } else if (seance.type === 'TP' && seance.hTP_Affecte === 0) {
            const prevCreneau = Object.keys(CRENEAUX_COUPLES_SUIVANT).find(
                k => CRENEAUX_COUPLES_SUIVANT[k] === seance.creneau
            );

            if (prevCreneau) {
                const firstPartSession = allSeances.find(s =>
                    s.jour === seance.jour &&
                    s.creneau === prevCreneau &&
                    s.uniqueStudentEntity === seance.uniqueStudentEntity &&
                    s.type === seance.type
                );

                if (firstPartSession) {
                    idsToDelete.push(firstPartSession.id);
                    LogService.info(`Suppression de la première partie TP (${prevCreneau}).`);
                }
            }
        }

        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('delete session ' + id); } catch (e) { console.debug('pushUndoState delete failed', e); }
        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('delete session ' + id); } catch (e) { console.debug('pushUndoState delete failed', e); }
        let deletedCount = 0;
        idsToDelete.forEach(sessionId => {
            if (StateManager.removeSeance(sessionId)) {
                deletedCount++;
            }
        });

        LogService.success(`${deletedCount} séance(s) supprimée(s).`);
        if (
            seance &&
            String(seance.session || StateManager.state.header.session)
                .toLowerCase()
                .includes('automne')
        ) {
            StateManager.recomputeVolumesAutomne();
        }
        return { success: true, deletedCount };
    }

    /**
     * Met à jour une séance existante (mise à jour in-place, sans suppression brutale)
     * @param {number} id - L'ID de la séance
     * @param {Object} formData - Les nouvelles données
     * @param {Object} options - Options
     * @returns {Object} { success: boolean, session: Session|null, conflicts: Array }
     */
    /**
 * Met à jour une séance existante (mise à jour in-place, sans suppression brutale)
 * - exclut les séances couplées des vérifications de conflit
 * - propagation enseignants 2e->1re
 * - la charge horaire hTP_Affecte est comptée uniquement depuis la 1re partie (la 2e reste à 0)
 */
    updateSession(id, formData, options = {}) {
        // Récupère la séance existante (référence directe)
        const seance = StateManager.findSeanceById(id);
        if (!seance) return { success: false, session: null };

        // Validation
        const validation = ValidationService.validateSeanceData(formData, options.allowNoRoom || false);
        if (!validation.isValid) {
            ValidationService.highlightFormErrors(validation.missingFields.map(f => `input${f.replace(/\s/g, '')}`));
            DialogManager.error(`Veuillez remplir les champs manquants : <strong>${validation.missingFields.join(', ')}</strong>.`);
            return { success: false, session: null, conflicts: validation.errors };
        }

        // Construire la séance mise à jour (même id)
        const htpValue = this.getHtpForSubject(formData.matiere, formData.type);
        let updatedSession;
        try {
            updatedSession = Session.fromFormData(formData, id, htpValue);
        } catch (e) {
            console.error('Session.fromFormData failed', e);
            return { success: false, session: null };
        }
        // push undo snapshot before applying the update in-place
        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('update session ' + id); } catch (e) { console.debug('pushUndoState update failed', e); }


        // Propagate manual "allow conflict" / force flags from formData/options so ConflictService can honor them.
        try {
            const allowFlag = Boolean(
                (formData && (formData.allowTimeSlotConflict === true || formData.force === true)) ||
                (options && options.allowTimeSlotConflict === true) ||
                (formData && formData.meta && (formData.meta.allowTimeSlotConflict === true || formData.meta.force === true))
            );
            updatedSession.allowTimeSlotConflict = allowFlag;
        } catch (e) {
            console.debug('Failed to propagate allowTimeSlotConflict on updatedSession', e);
        }

        // utilitaire enseignants (différentes clés possibles)
        const teacherKeys = ['enseignant', 'enseignants', 'enseignantsArray', 'teacher', 'teachers'];
        function copyTeachers(src, dst) {
            if (!src || !dst) return false;
            let copied = false;
            teacherKeys.forEach(k => {
                if (Object.prototype.hasOwnProperty.call(src, k) && src[k] != null && src[k] !== '') {
                    try { dst[k] = src[k]; copied = true; } catch (e) { }
                }
            });
            try {
                if (src.enseignant && !dst.enseignants) dst.enseignants = [src.enseignant];
                if (Array.isArray(src.enseignants) && (!dst.enseignants || !Array.isArray(dst.enseignants))) dst.enseignants = src.enseignants.slice();
            } catch (e) { }
            return copied;
        }
        // Helper local : met à jour le DOM pour une séance donnée (toggle classe + label)
        function updateDOMForSeanceObj(s) {
            try {
                if (!s || s.id == null) return;
                const idStr = String(s.id);
                const selector = '[data-seance-id="' + idStr + '"],[data-session-id="' + idStr + '"],[data-id="' + idStr + '"]';
                document.querySelectorAll(selector).forEach(function (el) {
                    if (!el) return;

                    // Déterminer présence enseignant de façon robuste
                    const hasTeacher = !!(
                        (s.enseignant && String(s.enseignant).trim() !== '') ||
                        (Array.isArray(s.enseignants) && s.enseignants.length > 0) ||
                        (Array.isArray(s.enseignantsArray) && s.enseignantsArray.length > 0) ||
                        (s.teacher && String(s.teacher).trim() !== '') ||
                        (Array.isArray(s.teachers) && s.teachers.length > 0)
                    );
                    const deptSelected = Boolean(StateManager && StateManager.state && StateManager.state.selectedDepartment);
                    if (hasTeacher && deptSelected) el.classList.add('teacher-assigned'); else el.classList.remove('teacher-assigned');

                    // Mettre à jour le label interne si présent (priorité: enseignants array > enseignants > enseignant)
                    try {
                        const label = el.querySelector('.teacher-label') || el.querySelector('.enseignants');
                        if (label) {
                            let txt = '';
                            if (Array.isArray(s.enseignants) && s.enseignants.length) txt = s.enseignants.join(', ');
                            else if (Array.isArray(s.enseignantsArray) && s.enseignantsArray.length) txt = s.enseignantsArray.join(', ');
                            else if (s.enseignant) txt = s.enseignant;
                            label.textContent = txt;
                            label.style.display = txt ? '' : 'none';
                        }
                    } catch (e) { /* noop */ }
                });
            } catch (e) {
                console.debug('updateDOMForSeanceObj failed', e);
            }
        }
        // Construire excludeIds (id courant + id(s) de la partie couplée)
        const excludeIds = new Set([String(id)]);
        try {
            const allSeances = StateManager.getSeances();

            const findCoupled = (s, creneauToFind) => {
                if (!s) return null;
                return allSeances.find(x =>
                    x &&
                    x.jour === s.jour &&
                    x.creneau === creneauToFind &&
                    x.uniqueStudentEntity === s.uniqueStudentEntity &&
                    x.type === s.type
                );
            };

            // pour la séance actuelle
            if (seance && seance.type === 'TP') {
                const paired = CRENEAUX_COUPLES_SUIVANT[seance.creneau];
                if (paired) {
                    const existingCoupled = findCoupled(seance, paired);
                    if (existingCoupled && String(existingCoupled.id) !== String(id)) excludeIds.add(String(existingCoupled.id));
                } else {
                    const prev = Object.keys(CRENEAUX_COUPLES_SUIVANT).find(k => CRENEAUX_COUPLES_SUIVANT[k] === seance.creneau);
                    if (prev) {
                        const firstPart = findCoupled(seance, prev);
                        if (firstPart && String(firstPart.id) !== String(id)) excludeIds.add(String(firstPart.id));
                    }
                }
            }

            // pour la séance mise à jour
            if (updatedSession && updatedSession.type === 'TP') {
                const pairedForUpdated = CRENEAUX_COUPLES_SUIVANT[updatedSession.creneau];
                if (pairedForUpdated) {
                    const maybeCoupled = allSeances.find(x =>
                        x &&
                        x.jour === updatedSession.jour &&
                        x.creneau === pairedForUpdated &&
                        x.uniqueStudentEntity === updatedSession.uniqueStudentEntity &&
                        x.type === updatedSession.type
                    );
                    if (maybeCoupled && String(maybeCoupled.id) !== String(id)) excludeIds.add(String(maybeCoupled.id));
                } else {
                    const prevForUpdated = Object.keys(CRENEAUX_COUPLES_SUIVANT).find(k => CRENEAUX_COUPLES_SUIVANT[k] === updatedSession.creneau);
                    if (prevForUpdated) {
                        const firstPart2 = allSeances.find(x =>
                            x &&
                            x.jour === updatedSession.jour &&
                            x.creneau === prevForUpdated &&
                            x.uniqueStudentEntity === updatedSession.uniqueStudentEntity &&
                            x.type === updatedSession.type
                        );
                        if (firstPart2 && String(firstPart2.id) !== String(id)) excludeIds.add(String(firstPart2.id));
                    }
                }
            }
        } catch (e) {
            console.debug('paired exclusion detection failed', e);
        }

        // Normaliser excludeIds
        const excludeArray = Array.from(excludeIds).map(x => {
            const n = Number(x);
            return Number.isNaN(n) ? x : n;
        });

        // Vérifier conflits en excluant les ids liés
        let conflicts = [];
        try {
            conflicts = ConflictService.checkAllConflicts(updatedSession, StateManager.getSeances(), excludeArray, StateManager.state.sallesInfo) || [];
        } catch (e) {
            console.error('ConflictService.checkAllConflicts failed', e);
            return { success: false, session: null, conflicts: ['Erreur interne lors de la vérification des conflits'] };
        }

        if (Array.isArray(conflicts) && conflicts.length > 0) {
            const errorHtml = '<ul>' + conflicts.map(c => `<li>${c}</li>`).join('') + '</ul>';
            DialogManager.error(`Conflits détectés :<br>${errorHtml}`);
            return { success: false, session: null, conflicts };
        }

        // Appliquer la mise à jour en place (préserver référence)
        try {
            Object.keys(seance).forEach(k => { try { delete seance[k]; } catch (e) { } });
            Object.assign(seance, updatedSession);
            // --- Begin immediate DOM & normalization update (paste after Object.assign(seance, updatedSession)) ---

            // Normaliser les champs enseignants sur l'objet en place
            try {
                if (!Array.isArray(seance.enseignantsArray)) {
                    if (Array.isArray(seance.enseignants)) seance.enseignantsArray = seance.enseignants.slice();
                    else if (seance.enseignant) seance.enseignantsArray = [String(seance.enseignant)];
                    else seance.enseignantsArray = [];
                }
                // garantir cohérence secondaire
                if (!Array.isArray(seance.enseignants)) seance.enseignants = seance.enseignantsArray.slice();
                if (!seance.enseignant) seance.enseignant = seance.enseignantsArray[0] || '';
            } catch (e) { console.debug('normalize seance teachers failed', e); }

            // Update DOM for the updated seance object if helper exists
            try {
                if (typeof updateDOMForSeanceObj === 'function') {
                    try { updateDOMForSeanceObj(seance); } catch (e) { /* noop */ }
                }
            } catch (e) { /* noop */ }

            // If this is a TP and has a coupled partner, update its DOM too (to reflect propagation)
            try {
                if (seance && seance.type === 'TP') {
                    // check forward mapping (first->second) and reverse (second->first)
                    const pairedForward = CRENEAUX_COUPLES_SUIVANT[seance.creneau];
                    const pairedBackwardKey = Object.keys(CRENEAUX_COUPLES_SUIVANT).find(k => CRENEAUX_COUPLES_SUIVANT[k] === seance.creneau);

                    const all = StateManager.getSeances();
                    let other = null;
                    if (pairedForward) {
                        other = all.find(s => s && s.jour === seance.jour && s.creneau === pairedForward && s.uniqueStudentEntity === seance.uniqueStudentEntity && s.type === seance.type);
                    } else if (pairedBackwardKey) {
                        other = all.find(s => s && s.jour === seance.jour && s.creneau === pairedBackwardKey && s.uniqueStudentEntity === seance.uniqueStudentEntity && s.type === seance.type);
                    }

                    if (other) {
                        // normalize other as well
                        try {
                            if (!Array.isArray(other.enseignantsArray)) {
                                if (Array.isArray(other.enseignants)) other.enseignantsArray = other.enseignants.slice();
                                else if (other.enseignant) other.enseignantsArray = [String(other.enseignant)];
                                else other.enseignantsArray = [];
                            }
                            if (!Array.isArray(other.enseignants)) other.enseignants = other.enseignantsArray.slice();
                            if (!other.enseignant) other.enseignant = other.enseignantsArray[0] || '';
                        } catch (e) { /* noop */ }

                        try { if (typeof updateDOMForSeanceObj === 'function') updateDOMForSeanceObj(other); } catch (e) { /* noop */ }
                    }
                }
            } catch (e) { console.debug('paired DOM update failed', e); }

            // Fallback : forcer rerender global si la mise à jour ciblée ne suffisait pas
            try {
                if (typeof TableRenderer !== 'undefined' && TableRenderer && typeof TableRenderer.render === 'function') {
                    TableRenderer.render();
                }
            } catch (e) {
                console.debug('TableRenderer.render failed (fallback)', e);
            }

            // --- End immediate DOM & normalization update ---
            // Update DOM for updated session immediately (no reload)
            try { updateDOMForSeanceObj(seance); } catch (e) { /* noop */ }
        } catch (e) {
            console.error('SessionController.updateSession: apply failed', e);
            return { success: false, session: null };
        }

        // Gérer la partie couplée TP, et la propagation hTP_Affecte / enseignants
        try {
            const all = StateManager.getSeances();

            if (updatedSession.type === 'TP') {
                const paired = CRENEAUX_COUPLES_SUIVANT[updatedSession.creneau];
                if (paired) {
                    // updatedSession est la 1re partie : update/create seconde partie, assurer hTP_Affecte = 0 sur la seconde
                    const existingCoupled = all.find(s =>
                        s &&
                        s.jour === updatedSession.jour &&
                        s.creneau === paired &&
                        s.uniqueStudentEntity === updatedSession.uniqueStudentEntity &&
                        s.type === updatedSession.type
                    );
                    if (existingCoupled) {
                        const second = Session.fromFormData(formData, existingCoupled.id, htpValue);
                        second.creneau = paired;
                        // Important : la 2e partie ne porte pas la charge horaire, elle reste à 0
                        second.hTP_Affecte = 0;
                        Object.keys(existingCoupled).forEach(k => { try { delete existingCoupled[k]; } catch (e) { } });
                        Object.assign(existingCoupled, second);
                    } else {
                        const secondPart = Session.fromFormData(formData, StateManager.state.nextSessionId, htpValue);
                        secondPart.creneau = paired;
                        secondPart.hTP_Affecte = 0; // la 2e partie n'a pas d'hTP comptabilisé
                        StateManager.addSeance(secondPart);
                    }
                } else {
                    // updatedSession est la 2e partie : trouver la 1re et propager/retirer enseignants + transférer hTP si nécessaire
                    const prev = Object.keys(CRENEAUX_COUPLES_SUIVANT).find(k => CRENEAUX_COUPLES_SUIVANT[k] === updatedSession.creneau);
                    if (prev) {
                        const firstPart = all.find(s =>
                            s &&
                            s.jour === updatedSession.jour &&
                            s.creneau === prev &&
                            s.uniqueStudentEntity === updatedSession.uniqueStudentEntity &&
                            s.type === updatedSession.type
                        );
                        if (firstPart) {
                            // Propager enseignants de la 2e vers la 1re (si présents)
                            const copied = copyTeachers(seance, firstPart);

                            // Détecter s'il n'y a PLUS d'enseignant sur la 2e partie -> dans ce cas, supprimer les enseignants sur la 1re partie
                            const hasTeacherOnSecond = !!(
                                (seance && seance.enseignant && String(seance.enseignant).trim() !== '') ||
                                (seance && Array.isArray(seance.enseignants) && seance.enseignants.length > 0) ||
                                (seance && seance.teacher && String(seance.teacher).trim() !== '') ||
                                (seance && Array.isArray(seance.teachers) && seance.teachers.length > 0)
                            );

                            if (!hasTeacherOnSecond) {
                                // Supprimer tous les champs enseignants possibles de la firstPart
                                try {
                                    ['enseignant', 'enseignants', 'enseignantsArray', 'teacher', 'teachers'].forEach(k => {
                                        if (Object.prototype.hasOwnProperty.call(firstPart, k)) {
                                            try { delete firstPart[k]; } catch (e) { /* noop */ }
                                        }
                                    });
                                } catch (e) { /* noop */ }
                            }

                            // Si l'utilisateur a renseigné un hTP_Affecte sur la 2e partie via le formulaire,
                            // on le transfère sur la 1re partie (la 2e reste à 0).
                            try {
                                const updatedHtp = Number(seance.hTP_Affecte);
                                if (!Number.isNaN(updatedHtp) && updatedHtp > 0) {
                                    firstPart.hTP_Affecte = updatedHtp;
                                    seance.hTP_Affecte = 0;
                                }
                            } catch (e) { /* noop */ }

                            // --- UI refresh after propagation/removal ---
                            try {
                                if (typeof StateManager !== 'undefined' && typeof StateManager.notify === 'function') {
                                    try { StateManager.notify('seance:updated', { seance: firstPart }); } catch (e) { /* noop */ }
                                }

                                if (typeof TableRenderer !== 'undefined' && TableRenderer && typeof TableRenderer.render === 'function') {
                                    try { TableRenderer.render(); } catch (e) { /* noop */ }
                                } else {
                                    try {
                                        var idStr = firstPart && firstPart.id != null ? String(firstPart.id) : null;
                                        if (idStr) {
                                            var selector = '[data-seance-id="' + idStr + '"],[data-session-id="' + idStr + '"],[data-id="' + idStr + '"]';
                                            document.querySelectorAll(selector).forEach(function (el) {
                                                if (!el) return;
                                                var hasTeacher = !!(
                                                    (firstPart.enseignant && String(firstPart.enseignant).trim() !== '') ||
                                                    (Array.isArray(firstPart.enseignants) && firstPart.enseignants.length > 0) ||
                                                    (firstPart.teacher && String(firstPart.teacher).trim() !== '') ||
                                                    (Array.isArray(firstPart.teachers) && firstPart.teachers.length > 0)
                                                );
                                                var deptSelected = Boolean(StateManager && StateManager.state && StateManager.state.selectedDepartment);
                                                if (hasTeacher && deptSelected) el.classList.add('teacher-assigned'); else el.classList.remove('teacher-assigned');

                                                // Mettre à jour aussi l'affichage interne de l'élément (si nécessaire)
                                                try {
                                                    // si ton rendu met le nom de l'enseignant dans un sous-élément .teacher-label par ex.
                                                    var label = el.querySelector('.teacher-label');
                                                    if (label) {
                                                        if (hasTeacher) {
                                                            // choisir la meilleure source pour le texte (priorité: enseignants array > enseignant > teacher)
                                                            var txt = '';
                                                            if (Array.isArray(firstPart.enseignants) && firstPart.enseignants.length) txt = firstPart.enseignants.join(', ');
                                                            else if (firstPart.enseignant) txt = firstPart.enseignant;
                                                            else if (firstPart.teacher) txt = firstPart.teacher;
                                                            label.textContent = txt;
                                                            label.style.display = '';
                                                        } else {
                                                            label.textContent = '';
                                                            label.style.display = 'none';
                                                        }
                                                    }
                                                } catch (e) { /* noop */ }
                                            });
                                        }
                                    } catch (e) { /* noop */ }
                                    // --- UI refresh after propagating teachers/hTP from 2nd -> 1st part ---
                                    try {
                                        // 1) préférer une notification si l'architecture supporte des listeners
                                        if (typeof StateManager !== 'undefined' && typeof StateManager.notify === 'function') {
                                            try { StateManager.notify('seance:updated', { seance: firstPart }); } catch (e) { /* noop */ }
                                        }

                                        // 2) forcer un re-render global si disponible
                                        if (typeof TableRenderer !== 'undefined' && TableRenderer && typeof TableRenderer.render === 'function') {
                                            try { TableRenderer.render(); } catch (e) { /* noop */ }
                                        } else {
                                            // 3) fallback direct DOM update : appliquer la classe visuelle 'teacher-assigned' sur la cellule correspondante
                                            try {
                                                var idStr = firstPart && firstPart.id != null ? String(firstPart.id) : null;
                                                if (idStr) {
                                                    var selector = '[data-seance-id="' + idStr + '"],[data-session-id="' + idStr + '"],[data-id="' + idStr + '"]';
                                                    document.querySelectorAll(selector).forEach(function (el) {
                                                        if (!el) return;
                                                        // re-évaluer présence enseignant + dept sélectionné
                                                        var hasTeacher = !!(
                                                            (firstPart.enseignant && String(firstPart.enseignant).trim() !== '') ||
                                                            (Array.isArray(firstPart.enseignants) && firstPart.enseignants.length > 0) ||
                                                            (firstPart.teacher && String(firstPart.teacher).trim() !== '') ||
                                                            (Array.isArray(firstPart.teachers) && firstPart.teachers.length > 0)
                                                        );
                                                        var deptSelected = Boolean(StateManager && StateManager.state && StateManager.state.selectedDepartment);
                                                        if (hasTeacher && deptSelected) el.classList.add('teacher-assigned'); else el.classList.remove('teacher-assigned');
                                                    });
                                                }
                                            } catch (e) { /* noop */ }
                                        }
                                    } catch (e) {
                                        console.debug('updateSession: UI refresh after propagation failed', e);
                                    }

                                }
                                // Ensure DOM for firstPart and updatedSession are updated (defensive)
                                try { updateDOMForSeanceObj(firstPart); } catch (e) { /* noop */ }
                                try {
                                    const updatedObj = StateManager.findSeanceById(updatedSession.id) || updatedSession;
                                    updateDOMForSeanceObj(updatedObj);
                                } catch (e) { /* noop */ }
                            } catch (e) {
                                console.debug('updateSession: UI refresh after propagation/removal failed', e);
                            }
                        }
                    }
                }
            } else {
                // Si on passe d'un TP vers autre chose, supprimer la partie couplée si elle existe
                const maybeCoupled = all.find(s =>
                    s &&
                    s.jour === seance.jour &&
                    s.uniqueStudentEntity === seance.uniqueStudentEntity &&
                    s.type === 'TP' &&
                    (CRENEAUX_COUPLES_SUIVANT[seance.creneau] === s.creneau || CRENEAUX_COUPLES_SUIVANT[s.creneau] === seance.creneau)
                );
                if (maybeCoupled) StateManager.removeSeance(maybeCoupled.id);
            }
        } catch (e) {
            console.debug('paired update/create/remove failed', e);
        }

        // Persister et rafraîchir l'UI
        try { if (typeof StateManager.saveState === 'function') StateManager.saveState(); } catch (e) { console.debug('saveState failed', e); }
        try { if (TableRenderer && typeof TableRenderer.render === 'function') TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render failed', e); }

        LogService.success(`Séance ID ${id} modifiée avec succès.`);
        return { success: true, session: seance, conflicts: [] };
    }

    /**
     * Déplace une séance vers un nouveau créneau
     * ...
     */
    moveSession(id, newJour, newCreneau, newSalle = null) {
        // (contenu inchangé)
        const seance = StateManager.findSeanceById(id);
        if (!seance) {
            return { success: false, message: 'Séance introuvable' };
        }
        if (seance.type === 'TP') {
            DialogManager.error(
                "Le glisser-déposer des séances de TP n'est pas pris en charge pour garantir la cohérence des créneaux couplés."
            );
            return { success: false, message: 'TP non déplaçable' };
        }

        const samePos = (seance.jour === newJour && seance.creneau === newCreneau);
        const sameSalle = (newSalle === null) || ((seance.salle || seance.room || seance.local || '') === newSalle);
        if (samePos && sameSalle) {
            return { success: false, message: 'Même position et même salle' };
        }

        const hypotheticalSession = seance.clone();
        hypotheticalSession.jour = newJour;
        hypotheticalSession.creneau = newCreneau;
        if (newSalle !== null) {
            hypotheticalSession.salle = newSalle;
        }

        const conflicts = ConflictService.checkAllConflicts(
            hypotheticalSession,
            StateManager.getSeances(),
            [id],
            StateManager.state.sallesInfo
        );

        if (conflicts.length > 0) {
            const roomConflicts = conflicts.filter(c => c.startsWith('❌ CONFLIT SALLE:'));
            if (roomConflicts.length > 0 && conflicts.length === roomConflicts.length) {
                const freeRooms = ConflictService.getFreeRooms(
                    newJour,
                    newCreneau,
                    seance.type,
                    StateManager.state.sallesInfo,
                    StateManager.getSeances(),
                    id
                );

                if (freeRooms.length > 0) {
                    const suggestedRoom = freeRooms[0];
                    DialogManager.confirm(
                        'Conflit de Salle Détecté',
                        `La salle <strong>${seance.salle}</strong> est déjà occupée.<br><br>Utiliser la salle <strong>${suggestedRoom}</strong> ?`,
                        async () => {
                            try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('move session ' + id); } catch (e) { console.debug('pushUndoState move failed', e); }
                            seance.jour = newJour;
                            seance.creneau = newCreneau;
                            seance.salle = suggestedRoom;

                            LogService.success(
                                `Séance déplacée vers ${newJour} ${newCreneau} (Salle: ${suggestedRoom})`
                            );

                            StateManager.notify('seance:moved', { seance });

                            if (typeof StateManager.saveState === 'function') {
                                try {
                                    await StateManager.saveState();
                                } catch (e) {
                                    console.debug('SessionController: saveState failed after confirmation', e);
                                }
                            }

                            try {
                                if (TableRenderer && typeof TableRenderer.render === 'function') {
                                    TableRenderer.render();
                                }
                            } catch (e) {
                                console.debug('SessionController: TableRenderer.render failed after confirmation', e);
                            }
                        }
                    );

                    return { success: false, message: 'En attente de confirmation' };
                }
            }

            const errorHtml = '<ul>' + conflicts.map(c => `<li>${c}</li>`).join('') + '</ul>';
            DialogManager.error(`Déplacement impossible :<br>${errorHtml}`);
            return { success: false, message: 'Conflits détectés' };
        }

        // push undo snapshot before moving (no confirmation branch)
        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('move session ' + id); } catch (e) { console.debug('pushUndoState move failed', e); }
        // push undo snapshot before moving (no confirmation branch)
        try { if (typeof StateManager.pushUndoState === 'function') StateManager.pushUndoState('move session ' + id); } catch (e) { console.debug('pushUndoState move failed', e); }
        seance.jour = newJour;
        seance.creneau = newCreneau;
        if (newSalle !== null) {
            seance.salle = newSalle;
        }

        LogService.success(`Séance déplacée vers ${newJour} ${newCreneau}${newSalle ? ' (Salle: ' + newSalle + ')' : ''}`);
        StateManager.notify('seance:moved', { seance });

        if (typeof StateManager.saveState === 'function') {
            try { StateManager.saveState(); } catch (e) { /* noop */ }
        }

        return { success: true };
    }

    /**
     * Obtient le volume hTP pour une matière et un type
     */
    getHtpForSubject(matiere, type) {
        const info = StateManager.state.matiereGroupes[matiere];
        if (info && info.volumeHTP && info.volumeHTP[type] !== undefined) {
            return info.volumeHTP[type];
        }
        return { Cours: 0, TD: 0, TP: 0 }[type] || 0;
    }
}

// Export d'une instance singleton
export default new SessionController();