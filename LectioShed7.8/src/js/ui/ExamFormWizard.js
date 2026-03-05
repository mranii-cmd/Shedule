/**
 * ExamFormWizard - Formulaire progressif intuitif pour la planification d'examens
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import DialogManager from './DialogManager.js';
import NotificationManager from './NotificationManager.js';
import ExamController from '../controllers/ExamController.js';
import ExamSchedulerService from '../services/ExamSchedulerService.js';

const EXAM_FORM_STEPS = [
  {
    id: 'basic',
    title: '📋 Informations de base',
    icon: '📝',
    fields: ['title', 'session', 'filiere', 'department']
  },
  {
    id: 'subjects',
    title: '📚 Matières',
    icon: '📖',
    fields: ['subjects']
  },
  {
    id: 'schedule',
    title: '📅 Date et horaire',
    icon: '🕐',
    fields: ['date', 'startTime', 'endTime']
  },
  {
    id: 'students',
    title: '👥 Étudiants',
    icon: '🎓',
    fields: ['studentsCount']
  },
  {
    id: 'summary',
    title: '✅ Récapitulatif',
    icon: '📋',
    fields: []
  }
];

class ExamFormWizard {
  constructor() {
    this._currentStep = 0;
    this._formData = this._getEmptyFormData();
  }

  _getEmptyFormData() {
    return {
      title: '',
      session: '',
      filiere: '',
      department: '',
      subjects: [],
      date: '',
      startTime: '',
      endTime: '',
      studentsCount: '',
      notes: ''
    };
  }

  /**
   * Ouvre le formulaire wizard
   */
  open(initialData = {}) {
    this._currentStep = 0;
    this._formData = Object.assign(this._getEmptyFormData(), initialData);

    // ✅ Créer notre propre modale (pas DialogManager)
    this._showModal();
  }

  _showModal() {
    // Supprimer l'ancienne modale si elle existe
    const oldModal = document.getElementById('exam-wizard-modal');
    if (oldModal) oldModal.remove();

    const contentHTML = this._buildHTML();

    // Créer la modale complète avec overlay
    const modalHTML = `
      <div id="exam-wizard-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10000; animation:fadeIn 0.2s ease;">
        <div style="background:white; border-radius:16px; max-width:900px; width:90%; max-height:90vh; overflow:auto; box-shadow:0 10px 40px rgba(0,0,0,0.3); animation:slideIn 0.3s ease;">
          
          <!-- Header -->
          <div style="padding:20px 30px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; border-radius:16px 16px 0 0; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:1;">
            <h2 style="margin:0; font-size:1.5em;">✨ Planifier un nouvel examen</h2>
            <button id="exam-wizard-close-btn" style="background:none; border:none; color:white; font-size:2em; cursor:pointer; padding:0; width:35px; height:35px; line-height:1; opacity:0.8; transition:all 0.2s;" onmouseover="this.style. opacity='1'; this.style.transform='rotate(90deg)'" onmouseout="this.style.opacity='0. 8'; this.style.transform='rotate(0deg)'">×</button>
          </div>
          
          <!-- Body -->
          <div id="exam-wizard-body">
            ${contentHTML}
          </div>
          
        </div>
      </div>
      
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      </style>
    `;

    // Insérer dans le DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Attacher les événements
    this._attachHandlers();
    this._attachModalEvents();
  }

  _attachModalEvents() {
    // Bouton fermer (X)
    const closeBtn = document.getElementById('exam-wizard-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this._closeModal());
    }

    // Clic sur le backdrop
    const modal = document.getElementById('exam-wizard-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'exam-wizard-modal') {
          this._closeModal();
        }
      });
    }

    // Touche Escape
    if (!this._escapeHandler) {
      this._escapeHandler = (e) => {
        if (e.key === 'Escape') {
          const modal = document.getElementById('exam-wizard-modal');
          if (modal) this._closeModal();
        }
      };
      document.addEventListener('keydown', this._escapeHandler);
    }
  }

  _closeModal() {
    const modal = document.getElementById('exam-wizard-modal');
    if (modal) {
      // Animation de sortie
      modal.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => {
        modal.remove();
      }, 200);
    }

    // Retirer l'event listener Escape
    if (this._escapeHandler) {
      document.removeEventListener('keydown', this._escapeHandler);
      this._escapeHandler = null;
    }
  }

  _buildHTML() {
    let html = `
      <style>
        @keyframes fadeOut {
         from { opacity: 1; }
         to { opacity: 0; }
       }
        .exam-wizard-container {
          min-height: 550px;
          padding: 20px;
        }
        
        .exam-wizard-steps {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
          position: relative;
        }
        
        .exam-wizard-step {
          flex: 1;
          text-align: center;
          position: relative;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .exam-wizard-step-icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #e9ecef;
          color: #6c757d;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 10px;
          font-size: 1.8em;
          font-weight: bold;
          border: 3px solid #e9ecef;
          transition: all 0.3s ease;
        }
        
        .exam-wizard-step. active .exam-wizard-step-icon {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-color: #667eea;
          transform: scale(1.15);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }
        
        .exam-wizard-step. completed .exam-wizard-step-icon {
          background: #28a745;
          color: white;
          border-color: #28a745;
        }
        
        .exam-wizard-step-title {
          font-size: 0.9em;
          color: #6c757d;
          font-weight: 600;
          margin-top: 10px;
        }
        
        .exam-wizard-step. active .exam-wizard-step-title {
          color: #667eea;
          font-weight: 700;
        }
        
        .exam-wizard-step-line {
          position: absolute;
          top: 30px;
          left: 50%;
          right: -50%;
          height: 3px;
          background: #e9ecef;
          z-index: -1;
        }
        
        .exam-wizard-step. completed .exam-wizard-step-line {
          background: linear-gradient(90deg, #28a745 0%, #667eea 100%);
        }
        
        .exam-wizard-content {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 35px;
          min-height: 350px;
        }
        
        .exam-wizard-field {
          margin-bottom: 25px;
        }
        
        .exam-wizard-label {
          display: block;
          font-weight: 600;
          margin-bottom: 10px;
          color: #495057;
          font-size: 1.05em;
        }
        
        .exam-wizard-label . required {
          color: #dc3545;
          margin-left: 3px;
        }
        
        .exam-wizard-input,
        .exam-wizard-select {
          width: 100%;
          padding: 14px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 1. 05em;
          transition: all 0.2s ease;
        }
        
        .exam-wizard-input:focus,
        .exam-wizard-select:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.15);
        }
        
        .exam-wizard-help {
          font-size: 0.9em;
          color: #6c757d;
          margin-top: 6px;
          font-style: italic;
        }
        
        .exam-wizard-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          padding-top: 25px;
          border-top: 2px solid #e9ecef;
        }
        
        . exam-wizard-summary {
          background: white;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 20px;
          border-left: 5px solid #667eea;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        
        .exam-wizard-summary-title {
          font-weight: 700;
          color: #667eea;
          margin-bottom: 15px;
          font-size: 1.15em;
        }
        
        .exam-wizard-summary-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .exam-wizard-summary-item:last-child {
          border-bottom: none;
        }
        
        .exam-subject-tag {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 6px 15px;
          border-radius: 20px;
          margin: 4px;
          font-size: 0.9em;
          box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
        }
      </style>
      
      <div class="exam-wizard-container">
        <!-- Barre de progression -->
        <div class="exam-wizard-steps">
    `;

    // Générer les étapes
    EXAM_FORM_STEPS.forEach((step, index) => {
      const isActive = index === this._currentStep;
      const isCompleted = index < this._currentStep;
      const classes = `exam-wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;

      html += `
        <div class="${classes}" data-step="${index}">
          <div class="exam-wizard-step-icon">
            ${isCompleted ? '✓' : step.icon}
          </div>
          <div class="exam-wizard-step-title">${step.title}</div>
          ${index < EXAM_FORM_STEPS.length - 1 ? '<div class="exam-wizard-step-line"></div>' : ''}
        </div>
      `;
    });

    html += `</div>`;

    // Contenu du formulaire
    html += `<div class="exam-wizard-content">`;
    html += this._buildStepContent(this._currentStep);
    html += `</div>`;

    // Boutons de navigation
    html += `
      <div class="exam-wizard-actions">
        <button id="exam-wizard-prev" class="btn btn-secondary" ${this._currentStep === 0 ? 'disabled' : ''}>
          ← Précédent
        </button>
        <button id="exam-wizard-cancel" class="btn btn-secondary">
          ❌ Annuler
        </button>
        <button id="exam-wizard-next" class="btn btn-primary">
          ${this._currentStep === EXAM_FORM_STEPS.length - 1 ? '✅ Planifier l\'examen' : 'Suivant →'}
        </button>
      </div>
    `;

    html += `</div>`;

    return html;
  }

  _buildStepContent(step) {
    const sessions = ['Automne', 'Printemps', 'Été', 'Rattrapage'];
    const filieres = (StateManager?.state?.filieres || []).map(f => f.nom || f);
    const departments = this._getDepartments();
    const subjects = this._getSubjectsForFiliere(this._formData.filiere);

    switch (step) {
      case 0: // Informations de base
        return `
          <h3 style="margin-bottom: 25px; color: #495057; font-size: 1.4em;">
            📋 Informations de base
          </h3>
          
          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Titre de l'examen
              <span class="required">*</span>
            </label>
            <input 
              type="text" 
              id="exam-wizard-title" 
              class="exam-wizard-input" 
              value="${this._escapeHtml(this._formData.title)}"
              placeholder="Ex: Examen final Algorithmique"
              required
            >
            <div class="exam-wizard-help">
              💡 Conseil : Soyez précis et descriptif
            </div>
          </div>

          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Session
              <span class="required">*</span>
            </label>
            <select id="exam-wizard-session" class="exam-wizard-select" required>
              <option value="">-- Sélectionner une session --</option>
              ${sessions.map(s => `<option value="${s}" ${this._formData.session === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>

          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Filière
              <span class="required">*</span>
            </label>
            <select id="exam-wizard-filiere" class="exam-wizard-select" required>
              <option value="">-- Sélectionner une filière --</option>
              ${filieres.map(f => `<option value="${f}" ${this._formData.filiere === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>

          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Département
              <span class="required">*</span>
            </label>
            <select id="exam-wizard-department" class="exam-wizard-select" required>
              <option value="">-- Sélectionner un département --</option>
              ${departments.map(d => `<option value="${d}" ${this._formData.department === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
        `;

      case 1: // Matières
        return `
          <h3 style="margin-bottom: 25px; color: #495057; font-size: 1.4em;">
            📚 Matières concernées
          </h3>
          
          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Sélectionner les matières
              <span class="required">*</span>
            </label>
            <select id="exam-wizard-subjects" class="exam-wizard-select" multiple size="12" style="min-height: 250px;">
              ${subjects.map(s => `
                <option value="${s}" ${this._formData.subjects.includes(s) ? 'selected' : ''}>
                  ${s}
                </option>
              `).join('')}
            </select>
            <div class="exam-wizard-help">
              💡 Maintenez Ctrl (Cmd sur Mac) pour sélectionner plusieurs matières
            </div>
          </div>

          <div style="margin-top: 20px;">
            <strong style="font-size: 1.1em;">Matières sélectionnées (${this._formData.subjects.length}) :</strong>
            <div id="selected-subjects-display" style="margin-top: 12px;">
              ${this._formData.subjects.length > 0
            ? this._formData.subjects.map(s => `<span class="exam-subject-tag">${s}</span>`).join('')
            : '<em style="color: #6c757d;">Aucune matière sélectionnée</em>'
          }
            </div>
          </div>
        `;

      case 2: // Date et horaire
        const today = new Date().toISOString().split('T')[0];
        return `
          <h3 style="margin-bottom: 25px; color: #495057; font-size: 1.4em;">
            📅 Planification temporelle
          </h3>
          
          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Date de l'examen
              <span class="required">*</span>
            </label>
            <input 
              type="date" 
              id="exam-wizard-date" 
              class="exam-wizard-input" 
              value="${this._formData.date}"
              min="${today}"
              required
            >
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="exam-wizard-field">
              <label class="exam-wizard-label">
                Heure de début
                <span class="required">*</span>
              </label>
              <input 
                type="time" 
                id="exam-wizard-start-time" 
                class="exam-wizard-input" 
                value="${this._formData.startTime}"
                required
              >
            </div>

            <div class="exam-wizard-field">
              <label class="exam-wizard-label">
                Heure de fin
                <span class="required">*</span>
              </label>
              <input 
                type="time" 
                id="exam-wizard-end-time" 
                class="exam-wizard-input" 
                value="${this._formData.endTime}"
                required
              >
            </div>
          </div>

          <div id="exam-wizard-duration-display" style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #e7f3ff 0%, #f0e7ff 100%); border-radius: 10px; text-align: center; border: 2px solid #667eea;">
            <strong style="font-size: 1. 1em;">⏱️ Durée calculée :</strong> 
            <span id="calculated-duration" style="font-size: 1.3em; color: #667eea; font-weight: bold; margin-left: 10px;">--</span>
          </div>
        `;

      case 3: // Étudiants
        return `
          <h3 style="margin-bottom: 25px; color: #495057; font-size: 1.4em;">
            👥 Nombre d'étudiants
          </h3>
          
          <div class="exam-wizard-field">
            <label class="exam-wizard-label">
              Nombre d'étudiants attendus
              <span class="required">*</span>
            </label>
            <input 
              type="number" 
              id="exam-wizard-students-count" 
              class="exam-wizard-input" 
              value="${this._formData.studentsCount}"
              min="1"
              placeholder="Ex: 150"
              required
              style="text-align: center; font-size: 1.5em; font-weight: bold; color: #667eea;"
            >
            <div class="exam-wizard-help">
              💡 Cette information permet de calculer automatiquement les salles nécessaires
            </div>
          </div>

          <div style="background: #fff3cd; border-left: 5px solid #ffc107; padding: 20px; border-radius: 10px; margin-top: 30px;">
            <strong style="font-size: 1.1em;">ℹ️ Information importante</strong>
            <p style="margin: 12px 0 0 0; line-height: 1.6;">
              Les salles seront automatiquement attribuées en fonction du nombre d'étudiants et des salles disponibles.  
              Vous pourrez ajuster manuellement cette répartition après la création de l'examen via le gestionnaire de répartition.
            </p>
          </div>
        `;

      case 4: // Récapitulatif
        const duration = this._calculateDuration(this._formData.startTime, this._formData.endTime);
        const dateFormatted = this._formData.date ?
          new Date(this._formData.date + 'T00:00:00').toLocaleDateString('fr-FR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }) : '—';

        return `
          <h3 style="margin-bottom: 25px; color: #495057; font-size: 1.4em;">
            ✅ Récapitulatif
          </h3>
          
          <div class="exam-wizard-summary">
            <div class="exam-wizard-summary-title">📋 Informations générales</div>
            <div class="exam-wizard-summary-item">
              <span>Titre :</span>
              <strong>${this._escapeHtml(this._formData.title) || '—'}</strong>
            </div>
            <div class="exam-wizard-summary-item">
              <span>Session :</span>
              <strong>${this._formData.session || '—'}</strong>
            </div>
            <div class="exam-wizard-summary-item">
              <span>Filière :</span>
              <strong>${this._formData.filiere || '—'}</strong>
            </div>
            <div class="exam-wizard-summary-item">
              <span>Département :</span>
              <strong>${this._formData.department || '—'}</strong>
            </div>
          </div>

          <div class="exam-wizard-summary">
            <div class="exam-wizard-summary-title">📚 Matières (${this._formData.subjects.length})</div>
            <div style="padding: 8px 0;">
              ${this._formData.subjects.length > 0
            ? this._formData.subjects.map(s => `<span class="exam-subject-tag">${s}</span>`).join('')
            : '<em>Aucune matière</em>'
          }
            </div>
          </div>

          <div class="exam-wizard-summary">
            <div class="exam-wizard-summary-title">📅 Planification</div>
            <div class="exam-wizard-summary-item">
              <span>Date :</span>
              <strong>${dateFormatted}</strong>
            </div>
            <div class="exam-wizard-summary-item">
              <span>Horaire :</span>
              <strong>${this._formData.startTime || '—'} - ${this._formData.endTime || '—'}</strong>
            </div>
            <div class="exam-wizard-summary-item">
              <span>Durée :</span>
              <strong style="color: #667eea;">${duration || '—'}</strong>
            </div>
          </div>

          <div class="exam-wizard-summary">
            <div class="exam-wizard-summary-title">👥 Étudiants</div>
            <div class="exam-wizard-summary-item">
              <span>Nombre attendu :</span>
              <strong style="font-size: 1.3em; color: #667eea;">${this._formData.studentsCount || 0} étudiants</strong>
            </div>
          </div>

          <div style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border-left: 5px solid #28a745; padding: 20px; border-radius: 10px; margin-top: 25px;">
            <strong style="font-size: 1.15em; color: #155724;">✅ Prêt à planifier !</strong>
            <p style="margin: 12px 0 0 0; color: #155724; line-height: 1.6;">
              Cliquez sur "Planifier l'examen" pour créer l'examen.  Les salles seront automatiquement attribuées en fonction de la disponibilité et de la capacité.
            </p>
          </div>
        `;

      default:
        return '<p>Étape inconnue</p>';
    }
  }

  _attachHandlers() {
    const nextBtn = document.getElementById('exam-wizard-next');
    const prevBtn = document.getElementById('exam-wizard-prev');
    const cancelBtn = document.getElementById('exam-wizard-cancel');

    // Validation en temps réel
    this._attachFieldValidation();

    // Calcul automatique de la durée (étape 2)
    if (this._currentStep === 2) {
      const startTime = document.getElementById('exam-wizard-start-time');
      const endTime = document.getElementById('exam-wizard-end-time');

      const updateDuration = () => {
        const duration = this._calculateDuration(startTime.value, endTime.value);
        const display = document.getElementById('calculated-duration');
        if (display) {
          display.textContent = duration || '—';
          display.style.color = duration ? '#28a745' : '#6c757d';
        }
      };

      if (startTime) startTime.addEventListener('change', updateDuration);
      if (endTime) endTime.addEventListener('change', updateDuration);
      updateDuration();
    }

    // Mise à jour visuelle des matières (étape 1)
    if (this._currentStep === 1) {
      const subjectsSelect = document.getElementById('exam-wizard-subjects');
      if (subjectsSelect) {
        subjectsSelect.addEventListener('change', () => {
          const selected = Array.from(subjectsSelect.selectedOptions).map(o => o.value);
          const display = document.getElementById('selected-subjects-display');
          if (display) {
            display.innerHTML = selected.length > 0
              ? selected.map(s => `<span class="exam-subject-tag">${s}</span>`).join('')
              : '<em style="color: #6c757d;">Aucune matière sélectionnée</em>';
          }
        });
      }
    }

    // Navigation
    nextBtn?.addEventListener('click', () => {
      if (this._validateCurrentStep()) {
        this._collectFormData();

        if (this._currentStep === EXAM_FORM_STEPS.length - 1) {
          // Dernière étape : soumettre
          this._submitExam();
        } else {
          // Passer à l'étape suivante
          this._currentStep++;
          this._refreshModal();
        }
      }
    });

    prevBtn?.addEventListener('click', () => {
      this._collectFormData();
      this._currentStep--;
      this._refreshModal();
    });

    cancelBtn?.addEventListener('click', () => {
      DialogManager.hide();
    });
  }

  _validateCurrentStep() {
    const errors = [];
    const step = this._currentStep;

    switch (step) {
      case 0:
        if (!document.getElementById('exam-wizard-title')?.value.trim()) {
          errors.push('Le titre est obligatoire');
        }
        if (!document.getElementById('exam-wizard-session')?.value) {
          errors.push('La session est obligatoire');
        }
        if (!document.getElementById('exam-wizard-filiere')?.value) {
          errors.push('La filière est obligatoire');
        }
        if (!document.getElementById('exam-wizard-department')?.value) {
          errors.push('Le département est obligatoire');
        }
        break;

      case 1:
        const subjects = document.getElementById('exam-wizard-subjects');
        if (!subjects || subjects.selectedOptions.length === 0) {
          errors.push('Veuillez sélectionner au moins une matière');
        }
        break;

      case 2:
        if (!document.getElementById('exam-wizard-date')?.value) {
          errors.push('La date est obligatoire');
        }
        if (!document.getElementById('exam-wizard-start-time')?.value) {
          errors.push('L\'heure de début est obligatoire');
        }
        if (!document.getElementById('exam-wizard-end-time')?.value) {
          errors.push('L\'heure de fin est obligatoire');
        }

        const start = document.getElementById('exam-wizard-start-time')?.value;
        const end = document.getElementById('exam-wizard-end-time')?.value;
        if (start && end && start >= end) {
          errors.push('L\'heure de fin doit être après l\'heure de début');
        }
        break;

      case 3:
        const count = document.getElementById('exam-wizard-students-count')?.value;
        if (!count || Number(count) < 1) {
          errors.push('Le nombre d\'étudiants doit être au moins 1');
        }
        break;
    }

    if (errors.length > 0) {
      NotificationManager.error(errors.join('\n'));
      return false;
    }

    return true;
  }

  _collectFormData() {
    const step = this._currentStep;

    switch (step) {
      case 0:
        this._formData.title = document.getElementById('exam-wizard-title')?.value || '';
        this._formData.session = document.getElementById('exam-wizard-session')?.value || '';
        this._formData.filiere = document.getElementById('exam-wizard-filiere')?.value || '';
        this._formData.department = document.getElementById('exam-wizard-department')?.value || '';
        break;

      case 1:
        const subjects = document.getElementById('exam-wizard-subjects');
        this._formData.subjects = subjects ? Array.from(subjects.selectedOptions).map(o => o.value) : [];
        break;

      case 2:
        this._formData.date = document.getElementById('exam-wizard-date')?.value || '';
        this._formData.startTime = document.getElementById('exam-wizard-start-time')?.value || '';
        this._formData.endTime = document.getElementById('exam-wizard-end-time')?.value || '';
        break;

      case 3:
        this._formData.studentsCount = document.getElementById('exam-wizard-students-count')?.value || '';
        break;
    }
  }

  async _submitExam() {
    try {
      // Calculer l'allocation automatiquement
      const allocResult = ExamSchedulerService.computeAllocationForExam(this._formData);

      if (allocResult.error) {
        NotificationManager.error(`Erreur de planification : ${allocResult.error}`);
        return;
      }

      const allocations = (allocResult.allocations || []).map(a => ({
        room: a.room,
        students: a.assigned || 0
      }));

      const examData = Object.assign({}, this._formData, {
        allocations,
        totalAssigned: allocResult.totalAssigned || 0,
        remaining: allocResult.remaining || 0,
        rooms: allocations.map(a => a.room),
        salles: allocations.map(a => a.room).join(', ')
      });

      const created = await ExamController.createExam(examData);

      if (created && created.id) {
        NotificationManager.success('✅ Examen planifié avec succès !');
        this._closeModal();

        // Rafraîchir l'UI
        try {
          const ExamRenderer = (await import('./ExamRenderer.js')).default;
          ExamRenderer?.render?.();
        } catch (e) { /* noop */ }
      }
    } catch (err) {
      console.error('[ExamFormWizard] Submit error:', err);
      NotificationManager.error('Erreur lors de la création de l\'examen');
    }
  }

    _refreshModal() {
    // Remplacer le contenu sans fermer/rouvrir la modale
    const body = document.getElementById('exam-wizard-body');
    if (body) {
      body.innerHTML = this._buildHTML();
      this._attachHandlers();
    }
  }
  
  _attachFieldValidation() {
    const inputs = document.querySelectorAll('.exam-wizard-input,.exam-wizard-select');

    inputs.forEach(input => {
      input.addEventListener('blur', function () {
        if (this.hasAttribute('required') && !this.value) {
          this.style.borderColor = '#dc3545';
        } else {
          this.style.borderColor = '#e0e0e0';
        }
      });

      input.addEventListener('input', function () {
        if (this.style.borderColor === 'rgb(220, 53, 69)') {
          this.style.borderColor = '#e0e0e0';
        }
      });
    });
  }

  _calculateDuration(start, end) {
    if (!start || !end) return null;

    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);

    const minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0 && mins > 0) {
      return `${hours}h ${mins}min`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${mins}min`;
    }
  }

  _getDepartments() {
    const headerDept = document.getElementById('selectDepartement');
    return headerDept ? Array.from(headerDept.options).map(o => o.value).filter(Boolean) : [];
  }

  _getSubjectsForFiliere(filiere) {
    if (!filiere) return [];

    try {
      const matiereGroupes = StateManager?.state?.matiereGroupes || {};
      return Object.keys(matiereGroupes).filter(matiere => {
        const entry = matiereGroupes[matiere];
        return entry && String(entry.filiere).trim() === String(filiere).trim();
      });
    } catch (e) {
      return [];
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

}

const examFormWizard = new ExamFormWizard();
export default examFormWizard;