import ExamService from '../services/ExamService.js';
import NotificationManager from '../ui/NotificationManager.js';
import DialogManager from '../ui/DialogManager.js';
import StateManager from './StateManager.js'; // <-- ajouté

const ExamController = {
    getExams() {
        return ExamService.getAllExams();
    },

    // Dans ExamController.js
    async createExam(examData) {
        try {
            // Générer un ID unique
            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

            const newExam = {
                id: id,
                ...examData,
                createdAt: new Date().toISOString()
            };

            // Ajouter à la liste
            if (!Array.isArray(StateManager.state.examens)) {
                StateManager.state.examens = [];
            }
            StateManager.state.examens.push(newExam);

            // Sauvegarder
            StateManager.saveState();

            // IMPORTANT: Retourner l'examen créé avec son ID
            console.log('[ExamController] Exam created:', id);
            return newExam;  // ✅ Retourne l'objet complet avec id

        } catch (err) {
            console.error('ExamController.createExam error:', err);
            throw err;
        }
    },

    async updateExam(id, payload) {
        const updated = ExamService.updateExam(id, payload);
        if (updated) NotificationManager.success('Examen mis à jour');
        else NotificationManager.error('Examen introuvable');
        return updated;
    },

    async removeExam(id) {
        const ok = ExamService.deleteExam(id);
        if (ok) NotificationManager.success('Examen supprimé');
        else NotificationManager.error('Examen introuvable');
        return ok;
    }
};

export default ExamController;