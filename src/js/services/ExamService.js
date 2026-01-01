 /* Service de gestion des examens (CRUD léger, persisté via StateManager)
 */
import StateManager from '../controllers/StateManager.js';
import LogService from './LogService.js';
import NotificationManager from '../ui/NotificationManager.js';

const ExamService = {
     _ensureState() {
        if (!StateManager.state) StateManager.state = {};
        if (!Array.isArray(StateManager.state.examens)) StateManager.state.examens = [];
        if (!Array.isArray(StateManager.state.examRoomConfigs)) StateManager.state.examRoomConfigs = [];
    },

    getAllExams() {
        this._ensureState();
        return (StateManager.state.examens || []).slice();
    },

    addExam(exam) {
        this._ensureState();
        try {
            const id = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8);
            const payload = { id, ...exam };
            StateManager.state.examens.push(payload);
            try {
                StateManager.saveState();
                LogService.success(`✅ Examen ajouté : ${payload.title || payload.id}`);
                // Notify subscribers
                try { StateManager.notify && StateManager.notify('exam:added', { exam: payload }); } catch(e){/*noop*/}
                NotificationManager && typeof NotificationManager.success === 'function' && NotificationManager.success('Examen ajouté');
            } catch (errSave) {
                console.error('ExamService.addExam: saveState failed', errSave);
                throw errSave;
            }
            return payload;
        } catch (err) {
            console.error('ExamService.addExam error', err);
            throw err;
        }
    },

    updateExam(id, patch) {
        this._ensureState();
        const idx = (StateManager.state.examens || []).findIndex(e => e.id === id);
        if (idx === -1) return null;
        try {
            StateManager.state.examens[idx] = { ...StateManager.state.examens[idx], ...patch };
            StateManager.saveState();
            LogService.info(`✏️ Examen mis à jour : ${id}`);
            try { StateManager.notify && StateManager.notify('exam:updated', { exam: StateManager.state.examens[idx] }); } catch(e){/*noop*/}
            NotificationManager && typeof NotificationManager.success === 'function' && NotificationManager.success('Examen mis à jour');
            return StateManager.state.examens[idx];
        } catch (err) {
            console.error('ExamService.updateExam save failed', err);
            throw err;
        }
    },

    deleteExam(id) {
        this._ensureState();
        const idx = (StateManager.state.examens || []).findIndex(e => e.id === id);
        if (idx === -1) return false;
        try {
            const removed = StateManager.state.examens.splice(idx, 1)[0];
            StateManager.saveState();
            LogService.warning(`🗑️ Examen supprimé : ${removed.title || id}`);
            try { StateManager.notify && StateManager.notify('exam:removed', { exam: removed }); } catch(e){/*noop*/}
            NotificationManager && typeof NotificationManager.success === 'function' && NotificationManager.success('Examen supprimé');
            return true;
        } catch (err) {
            console.error('ExamService.deleteExam save failed', err);
            throw err;
        }
    },

    validateExam(exam) {
        const errors = [];
        if (!exam.title || String(exam.title).trim() === '') errors.push('Titre manquant');
        if (!exam.date) errors.push('Date manquante');
        if (!exam.startTime) errors.push('Heure de début manquante');
        if (!exam.endTime) errors.push('Heure de fin manquante');
        if (exam.studentsCount !== undefined && exam.studentsCount !== null && exam.studentsCount !== '') {
            const n = Number(exam.studentsCount);
            if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) errors.push('Nombre d\'étudiants invalide (doit être un entier >= 0)');
        }
        return errors;
    }
};

export default ExamService;