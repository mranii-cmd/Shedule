/**
 * Gestionnaire de formulaires
 * @author Ibrahim Mrani - UCD
 *
 * Améliorations apportées :
 * - idempotence de init() (évite double-binding)
 * - tracking / détachement des listeners (_listeners)
 * - évitement d'innerHTML pour insérer du contenu dynamique (utilisation de createElement/textContent)
 * - options "Sans salle" utilisent une valeur sentinel '__NOSALLE__' (évite duplicate empty value)
 * - parseInt(..., 10) avec fallback robuste via toNumber helper
 * - défensive : vérifications d'existence d'objet StateManager.state.*
 * - helpers createOption / populateSelectFromArray pour centraliser la construction d'options
 *
 * Corrections appliquées ici :
 * - toNumber rend maintenant 0 quand l'utilisateur saisit "0" (fallback seulement si champ vide ou non-numérique)
 * - getMatiereFormData n'utilise plus des fallbacks 48/32/36 : les valeurs par défaut des volumes sont 0
 * - resetMatiereForm remet les volumes à 0 (et non aux anciens defaults)
 * - fillMatiereForm respecte explicitement la valeur 0 si présente dans les données
 */

import StateManager from '../controllers/StateManager.js';
import ValidationService from '../services/ValidationService.js';
import { LISTE_JOURS, LISTE_TYPES_SEANCE } from '../config/constants.js';
import { getSortedCreneauxKeys } from '../utils/helpers.js';
// import { escapeHTML } from '../utils/sanitizers.js';

function createOption({ value = '', text = '', attrs = {} } = {}) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    Object.entries(attrs).forEach(([k, v]) => {
        if (v === true) opt.setAttribute(k, '');
        else if (v !== false && v !== undefined && v !== null) opt.setAttribute(k, String(v));
    });
    return opt;
}

function clearElement(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
}

function populateSelectFromArray(selectEl, items = [], valueFn = x => x, textFn = x => x, emptyLabel = '-- Sélectionner --') {
    if (!selectEl) return;
    clearElement(selectEl);
    selectEl.appendChild(createOption({ value: '', text: emptyLabel }));
    items.forEach(item => {
        const v = valueFn(item);
        const t = textFn(item);
        selectEl.appendChild(createOption({ value: v === undefined || v === null ? '' : v, text: t || '' }));
    });
}

/**
 * Conversion numérique robuste
 * - accepte "0" (ne le traite pas comme falsy)
 * - accepte les nombres avec virgule (remplace par point)
 * - retourne fallback uniquement si la valeur est vide ou non-numérique
 */
function toNumber(v, fallback = 0) {
    if (v === undefined || v === null) return fallback;
    const s = String(v).trim();
    if (s === '') return fallback;
    // remplacer virgule par point pour les décimales éventuelles
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
}

class FormManager {
    constructor() {
        this.forms = {
            seance: null,
            matiere: null,
            enseignant: null,
            salle: null,
            filiere: null
        };

        this.currentMode = 'create'; // 'create' ou 'edit'
        this.editingSessionId = null;

        this._inited = false;
        this._listeners = []; // {el, type, fn}
    }
    /**
    +     * Défensif : déclenche un événement 'change' natif sur un élément si possible.
    +     * Utile pour forcer les listeners externes à réagir après un setValue programmatique.
    +     */
    _dispatchChange(el) {
        if (!el) return;
        try {
            const evt = new Event('change', { bubbles: true });
            el.dispatchEvent(evt);
        } catch (e) {
            console.debug('_dispatchChange failed', e);
        }
    }
    /**
     * Initialise tous les formulaires (idempotent)
     */
    init() {
        if (this._inited) return;
        this._inited = true;

        this.forms.seance = document.getElementById('formAjouterSeance') || document.getElementById('formSeance') || document.querySelector('[data-seance-form]');
        this.forms.matiere = document.getElementById('formAjouterMatiere');
        this.forms.enseignant = document.getElementById('formAjouterEnseignant');
        this.forms.salle = document.getElementById('formAjouterSalle');
        this.forms.filiere = document.getElementById('formAjouterFiliere');

        this.initializeSeanceForm();
        this.initializeMatiereForm();
        this.initializeEnseignantForm();
        this.initializeSalleForm();
        this.initializeFiliereForm();

        StateManager.subscribe && StateManager.subscribe('stateChanged', () => {
            // Repopule toutes les listes déroulantes
            this.populateSelects();
        });
    }

    /**
     * Détache les listeners attachés par ce manager (utile pour tests/teardown)
     */
    destroy() {
        this._listeners.forEach(({ el, type, fn }) => {
            try { el.removeEventListener(type, fn); } catch (e) { /* noop */ }
        });
        this._listeners = [];
        this._inited = false;
    }

    _addListener(el, type, fn) {
        if (!el) return;
        el.addEventListener(type, fn);
        this._listeners.push({ el, type, fn });
    }

    /**
     * Initialise le formulaire de séance
     */
    initializeSeanceForm() {
        if (!this.forms.seance) return;

        // Peupler les listes déroulantes statiques
        this.populateJourSelect();
        this.populateCreneauSelect();
        this.populateTypeSeanceSelect();

        // Event listener pour le changement de matière
        const selectMatiere = document.getElementById('selectMatiere');
        if (selectMatiere) {
            this._addListener(selectMatiere, 'change', () => this.handleMatiereChange());
        }

        // Event listener pour le changement de filière
        const selectFiliere = document.getElementById('selectFiliere');
        if (selectFiliere) {
            this._addListener(selectFiliere, 'change', () => this.handleFiliereChange());
        }

        // Event listener pour le changement de type
        const selectType = document.getElementById('selectType');
        if (selectType) {
            this._addListener(selectType, 'change', () => this.handleTypeChange());
        }

        // Event listener pour section
        const selectSection = document.getElementById('selectSection');
        if (selectSection) {
            this._addListener(selectSection, 'change', () => this.handleSectionChange());
        }

        // Attacher le handler du bouton "Réinitialiser" (si présent)
        try {
            const resetBtn = document.querySelector('[data-action="reset-seance"], #btnResetSeance, button.reset-seance, button[name="reset"], button[type="reset"]');
            if (resetBtn) {
                // s'assurer que ce bouton n'est pas un submit implicite
                if (!resetBtn.hasAttribute('type')) resetBtn.setAttribute('type', 'button');
                // detach éventuels duplicate listeners (defensive)
                // attacher via _addListener pour pouvoir détacher proprement ensuite
                this._addListener(resetBtn, 'click', (e) => {
                    try { e && e.preventDefault && e.preventDefault(); } catch (ex) { }
                    this.resetSeanceForm(this.forms.seance);
                });
                // garantir qu'il est activé
                try { resetBtn.disabled = false; resetBtn.removeAttribute && resetBtn.removeAttribute('disabled'); } catch (e) { }
            }
        } catch (e) {
            console.debug('initializeSeanceForm: attach resetBtn failed', e);
        }

        // -- PATCH: Ajout case à cocher "Ignorer les conflits" pour modification manuelle --
        if (this.forms.seance && !document.getElementById('allowTimeSlotConflict')) {
            const allowConflictDiv = document.createElement('div');
            allowConflictDiv.className = 'form-group';
            allowConflictDiv.innerHTML = `
      <label style="display: flex; align-items: center; cursor: pointer;">
        <input type="checkbox" id="allowTimeSlotConflict" style="margin-right: 10px;">
        Autoriser le chevauchement et ignorer la détection des conflits sur ce créneau
      </label>
    `;
            // Insertion juste avant le bouton submit si possible, sinon à la fin du formulaire :
            const submitBtn = this.forms.seance.querySelector('[type="submit"], button[type="submit"], #btnAjouterSeance');
            if (submitBtn && submitBtn.parentNode) {
                submitBtn.parentNode.insertBefore(allowConflictDiv, submitBtn);
            } else {
                this.forms.seance.appendChild(allowConflictDiv);
            }
        }
    }

    /**
     * Peuple la liste déroulante des jours
     */
    populateJourSelect() {
        const select = document.getElementById('selectJour');
        if (!select) return;
        populateSelectFromArray(select, LISTE_JOURS, j => j, j => j, '-- Sélectionner --');
    }

    /**
     * Peuple la liste déroulante des créneaux
     */
    populateCreneauSelect() {
        const select = document.getElementById('selectCreneau');
        if (!select) return;

        const creneauxState = (StateManager && StateManager.state && StateManager.state.creneaux) || null;

        // Helper: parse label like "8h30" or "08:30" to minutes
        const parseToMinutes = str => {
            if (!str) return null;
            const s = String(str).trim().replace('H', 'h').replace(':', 'h').toLowerCase();
            const m = s.match(/^(\d{1,2})h(\d{1,2})$/);
            if (!m) return null;
            const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
            if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
            return hh * 60 + mm;
        };

        clearElement(select);
        select.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));

        if (creneauxState && typeof creneauxState === 'object' && Object.keys(creneauxState).length) {
            // Expect creneauxState = { "8h30": { debut: "8h30", fin: "10h00", label: "8h30-10h00" }, ... }
            const keys = Object.keys(creneauxState).slice();
            keys.sort((a, b) => {
                const aMin = parseToMinutes(creneauxState[a] && (creneauxState[a].debut || creneauxState[a].label) || a);
                const bMin = parseToMinutes(creneauxState[b] && (creneauxState[b].debut || creneauxState[b].label) || b);
                if (aMin === null && bMin === null) return String(a).localeCompare(String(b));
                if (aMin === null) return 1;
                if (bMin === null) return -1;
                return aMin - bMin;
            });

            keys.forEach(key => {
                const def = creneauxState[key] || {};
                const label = def.label || key;
                const fin = def.fin || '';
                const display = fin ? `${label} (${def.debut || key} - ${fin})` : label;
                select.appendChild(createOption({ value: label, text: display }));
            });
        } else {
            // Fallback to legacy helper if no state-defined creneaux
            try {
                const sortedCreneaux = (typeof getSortedCreneauxKeys === 'function') ? (getSortedCreneauxKeys() || []) : [];
                const creneauxData = (StateManager && StateManager.state && StateManager.state.creneaux) || {};
                sortedCreneaux.forEach(creneau => {
                    const fin = creneauxData[creneau] ? (creneauxData[creneau].fin || '') : '';
                    select.appendChild(createOption({ value: creneau, text: `${creneau} - ${fin}` }));
                });
            } catch (e) {
                // best-effort: no creneaux
            }
        }
    }

    /**
     * Peuple la liste déroulante des types de séance
     */
    populateTypeSeanceSelect() {
        const select = document.getElementById('selectType');
        if (!select) return;
        populateSelectFromArray(select, LISTE_TYPES_SEANCE, t => t, t => t, '-- Sélectionner --');
    }

    /**
     * Gère le changement de matière
     */
    handleMatiereChange() {
        const selectMatiere = document.getElementById('selectMatiere');
        const matiere = (selectMatiere?.value || '').trim();

        if (!matiere) {
            this.resetSectionAndGroupSelects();
            // clear matiere info
            const infoDiv = document.getElementById('matiereInfoDisplay');
            if (infoDiv) clearElement(infoDiv);
            return;
        }

        const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
        const matiereInfo = mg[matiere];
        if (!matiereInfo) return;

        // Pré-remplir la filière si définie
        const selectFiliere = document.getElementById('selectFiliere');
        if (selectFiliere && matiereInfo.filiere) {
            selectFiliere.value = String(matiereInfo.filiere);
            this.handleFiliereChange();
        }

        // Afficher les infos de la matière
        this.displayMatiereInfo(matiereInfo);

        // Recalculer l'affichage de l'enseignant 2 si le type est déjà sélectionné
        const selectType = document.getElementById('selectType');
        if (selectType?.value) {
            this.handleTypeChange();
        }
    }

    /**
     * Affiche les informations de la matière (construction DOM sûre)
     * @param {Object} matiereInfo - Les informations de la matière
     */
    displayMatiereInfo(matiereInfo) {
        const infoDiv = document.getElementById('matiereInfoDisplay');
        if (!infoDiv) return;

        clearElement(infoDiv);

        const nbEnsTP = toNumber(matiereInfo.nbEnseignantsTP, 1);
        const ensTPText = nbEnsTP > 1 ? `${nbEnsTP} enseignants` : `${nbEnsTP} enseignant`;

        const container = document.createElement('div');
        container.className = 'matiere-info-box';

        const title = document.createElement('strong');
        title.textContent = 'Configuration de la matière :';
        container.appendChild(title);
        container.appendChild(document.createElement('br'));

        const sections = document.createElement('div');
        sections.textContent = `Sections: ${toNumber(matiereInfo.sections_cours, 0)} | Groupes TD: ${toNumber(matiereInfo.td_groups, 0)} | Groupes TP: ${toNumber(matiereInfo.tp_groups, 0)}`;
        container.appendChild(sections);

        const volumes = document.createElement('div');
        const v = matiereInfo.volumeHTP || {};
        volumes.textContent = `Volume hTP - Cours: ${toNumber(v.Cours, 0)}h | TD: ${toNumber(v.TD, 0)}h | TP: ${toNumber(v.TP, 0)}h`;
        container.appendChild(volumes);

        const footer = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = `TP: ${ensTPText} par séance`;
        footer.appendChild(strong);
        container.appendChild(footer);

        infoDiv.appendChild(container);
    }

    /**
     * Gère le changement de filière
     */
    handleFiliereChange() {
        const selectFiliere = document.getElementById('selectFiliere');
        const selectMatiere = document.getElementById('selectMatiere');

        const filiere = (selectFiliere?.value || '').trim();
        const matiere = (selectMatiere?.value || '').trim();

        if (!matiere) return;

        const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
        const matiereInfo = mg[matiere];
        if (!matiereInfo) return;

        // Générer les sections
        this.populateSectionSelect(toNumber(matiereInfo.sections_cours, 0));
    }

    /**
     * Peuple la liste des sections
     * @param {number} nbSections - Nombre de sections
     */
    populateSectionSelect(nbSections) {
        const select = document.getElementById('selectSection');
        if (!select) return;

        clearElement(select);
        select.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));

        for (let i = 0; i < nbSections; i++) {
            const sectionName = `Section ${String.fromCharCode(65 + i)}`;
            select.appendChild(createOption({ value: sectionName, text: sectionName }));
        }
    }

    /**
     * Gère le changement de type de séance
     */
    handleTypeChange() {
        const selectType = document.getElementById('selectType');
        const selectMatiere = document.getElementById('selectMatiere');
        const type = (selectType?.value || '').trim();

        const groupeTDTPContainer = document.getElementById('groupeTDTPContainer');
        const enseignant2Container = document.getElementById('enseignant2Container');

        if (!groupeTDTPContainer) return;

        // Afficher/masquer le champ groupe TD/TP
        if (type === 'TD' || type === 'TP') {
            groupeTDTPContainer.style.display = 'block';
            this.handleSectionChange(); // Régénérer les groupes
        } else {
            groupeTDTPContainer.style.display = 'none';
            const selectGroupe = document.getElementById('selectGroupeTDTP');
            if (selectGroupe) selectGroupe.value = '';
        }

        // Gérer l'affichage de l'enseignant 2
        if (enseignant2Container) {
            let showEnseignant2 = false;

            //if (type === 'Cours') {
            if (type === 'Cours' || type === 'TD') {
                showEnseignant2 = true;
            } else if (type === 'TP') {
                const matiere = (selectMatiere?.value || '').trim();
                if (matiere) {
                    const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
                    const matiereInfo = mg[matiere];
                    if (matiereInfo && toNumber(matiereInfo.nbEnseignantsTP, 1) >= 2) {
                        showEnseignant2 = true;
                    }
                }
            }

            enseignant2Container.style.display = showEnseignant2 ? 'block' : 'none';

            if (!showEnseignant2) {
                const inputEns2 = document.getElementById('inputEnseignant2');
                if (inputEns2) inputEns2.value = '';
            }
        }

        // Filtrer les salles compatibles
        this.filterCompatibleRooms(type);
    }

    /**
     * Gère le changement de section
     */
    handleSectionChange() {
        const selectType = document.getElementById('selectType');
        const selectMatiere = document.getElementById('selectMatiere');

        const type = (selectType?.value || '').trim();
        const matiere = (selectMatiere?.value || '').trim();

        if (!type || !matiere) return;
        if (type !== 'TD' && type !== 'TP') return;

        const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
        const matiereInfo = mg[matiere];
        if (!matiereInfo) return;

        const nbGroupes = type === 'TD' ? toNumber(matiereInfo.td_groups, 0) : toNumber(matiereInfo.tp_groups, 0);
        this.populateGroupeTDTPSelect(nbGroupes);
    }

    /**
     * Peuple la liste des groupes TD/TP
     * @param {number} nbGroupes - Nombre de groupes
     */
    populateGroupeTDTPSelect(nbGroupes) {
        const select = document.getElementById('selectGroupeTDTP');
        if (!select) return;

        clearElement(select);
        select.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));

        for (let i = 1; i <= nbGroupes; i++) {
            const label = `G${i}`;
            select.appendChild(createOption({ value: label, text: label }));
        }
    }

    /**
     * Filtre les salles compatibles avec le type de séance
     * @param {string} type - Le type de séance
     */
    filterCompatibleRooms(type) {
        const selectSalle = document.getElementById('selectSalle');
        if (!selectSalle) return;

        const sallesInfo = (StateManager && StateManager.state && StateManager.state.sallesInfo) || {};
        const currentValue = selectSalle.value;

        clearElement(selectSalle);
        selectSalle.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
        // sentinel value to represent "Sans salle" distinct from placeholder
        selectSalle.appendChild(createOption({ value: '__NOSALLE__', text: 'Sans salle' }));

        Object.keys(sallesInfo || {}).sort().forEach(salle => {
            const compatible = ValidationService.validateSalleCompatibility(type, salle, sallesInfo);
            if (compatible) {
                const typeSalle = sallesInfo[salle];
                selectSalle.appendChild(createOption({ value: salle, text: `${salle} (${typeSalle})` }));
            }
        });

        // Restaurer la valeur si elle est toujours compatible (prendre en compte le sentinel)
        if (currentValue) {
            if (currentValue === '__NOSALLE__') {
                selectSalle.value = '__NOSALLE__';
            } else if (ValidationService.validateSalleCompatibility(type, currentValue, sallesInfo)) {
                selectSalle.value = currentValue;
            }
        }
    }

    /**
     * Réinitialise les selects de section et groupe
     */
    resetSectionAndGroupSelects() {
        const selectSection = document.getElementById('selectSection');
        const selectGroupe = document.getElementById('selectGroupeTDTP');

        if (selectSection) {
            clearElement(selectSection);
            selectSection.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
        }
        if (selectGroupe) {
            clearElement(selectGroupe);
            selectGroupe.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
        }
    }

    /**
     * Récupère les données du formulaire de séance
     * @returns {Object} Les données du formulaire
     */
    getSeanceFormData() {
        return {
            jour: (document.getElementById('selectJour')?.value || '').trim(),
            creneau: (document.getElementById('selectCreneau')?.value || '').trim(),
            filiere: (document.getElementById('selectFiliere')?.value || '').trim(),
            matiere: (document.getElementById('selectMatiere')?.value || '').trim(),
            type: (document.getElementById('selectType')?.value || '').trim(),
            section: (document.getElementById('selectSection')?.value || '').trim(),
            groupeTDTP: (document.getElementById('selectGroupeTDTP')?.value || '').trim(),
            enseignant1: (document.getElementById('inputEnseignant1')?.value || '').trim(),
            enseignant2: (document.getElementById('inputEnseignant2')?.value || '').trim(),
            salle: (document.getElementById('selectSalle')?.value || '').trim()
        };
    }

    /**
     * Remplit le formulaire avec les données d'une séance (pour édition)
     * @param {Session} seance - La séance à éditer
     */
    fillSeanceForm(seance) {
        this.currentMode = 'edit';
        this.editingSessionId = seance.id;

        const setSelectValue = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.value = value || '';
        };

        setSelectValue('selectJour', seance.jour);
        setSelectValue('selectCreneau', seance.creneau);
        setSelectValue('selectFiliere', seance.filiere);
        setSelectValue('selectMatiere', seance.matiere);

        // Forcer l'événement 'change' sur la matière pour que les listeners
        // (ex : peupler la liste des enseignants souhaitant la matière) se déclenchent.
        try {
            const selMatiere = document.getElementById('selectMatiere');
            if (selMatiere) this._dispatchChange(selMatiere);
        } catch (e) { /* noop */ }

        // Déclencher le changement de matière pour peupler les sections
        this.handleMatiereChange();

        setSelectValue('selectType', seance.type);
        this.handleTypeChange();

        setSelectValue('selectSection', seance.section);
        this.handleSectionChange();

        // Extraire le groupe TD/TP du groupe complet
        if (seance.type === 'TD' || seance.type === 'TP') {
            const groupeParts = (seance.groupe || '').split(' - ');
            const groupeTDTP = groupeParts.length > 1 ? groupeParts[1] : '';
            setSelectValue('selectGroupeTDTP', groupeTDTP);
        }

        // Enseignants
        const enseignants = seance.enseignantsArray || [];
        setSelectValue('inputEnseignant1', enseignants[0] || '');
        setSelectValue('inputEnseignant2', enseignants[1] || '');

        // Forcer l'événement 'change' sur l'enseignant principal pour que
        // le témoin de volume horaire et autres dépendances se recalculent.
        try {
            const inputEns1 = document.getElementById('inputEnseignant1');
            if (inputEns1) this._dispatchChange(inputEns1);
            const inputEns2 = document.getElementById('inputEnseignant2');
            if (inputEns2) this._dispatchChange(inputEns2);
        } catch (e) { /* noop */ }

        // Salle
        // si la séance n'a pas de salle explicite, stockage peut être '' ou '__NOSALLE__'
        setSelectValue('selectSalle', seance.salle || '');

        // Changer le texte du bouton
        const submitBtn = document.getElementById('btnAjouterSeance');
        if (submitBtn) {
            submitBtn.textContent = '✏️ Modifier la Séance';
        }

        // Scroll vers le formulaire
        this.forms.seance?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Réinitialise le formulaire de séance
     */
    resetSeanceForm(formElement) {
        // Accept an optional formElement; fallback to managed form reference or DOM lookup
        const form = formElement || this.forms.seance || document.getElementById('formAjouterSeance') || document.getElementById('formSeance') || document.querySelector('[data-seance-form]');
        if (!form) {
            console.warn('resetSeanceForm: aucun formulaire trouvé');
            return;
        }

        try {
            // Natif reset
            if (typeof form.reset === 'function') form.reset();
        } catch (e) {
            console.warn('resetSeanceForm: form.reset failed', e);
        }

        // Clear validation UI via ValidationService if available
        try {
            if (typeof ValidationService !== 'undefined' && typeof ValidationService.clearFormErrors === 'function') {
                ValidationService.clearFormErrors(form);
            } else if (typeof window.clearFormErrors === 'function') {
                window.clearFormErrors(form);
            } else {
                // Best-effort: remove common error classes
                try {
                    form.querySelectorAll('.is-invalid, .error, .validation-error').forEach(el => {
                        el.classList.remove('is-invalid', 'error', 'validation-error');
                    });
                } catch (e) { /* noop */ }
            }
        } catch (e) {
            console.debug('resetSeanceForm: clearFormErrors failed', e);
        }

        // Clear teacher selects/inputs
        try {
            const i1 = form.querySelector('#inputEnseignant1');
            const i2 = form.querySelector('#inputEnseignant2');
            if (i1) { i1.value = ''; this._dispatchChange(i1); }
            if (i2) { i2.value = ''; this._dispatchChange(i2); }
        } catch (e) { /* noop */ }

        // Reset selects that could hold sentinel values
        try {
            const selectSalle = form.querySelector('#selectSalle');
            if (selectSalle) selectSalle.value = '';
            const selectGroupe = form.querySelector('#selectGroupeTDTP');
            if (selectGroupe) selectGroupe.value = '';
            const selectType = form.querySelector('#selectType');
            if (selectType) selectType.value = '';
            const selectMatiere = form.querySelector('#selectMatiere');
            if (selectMatiere) selectMatiere.value = '';
            const selectJour = form.querySelector('#selectJour');
            if (selectJour) selectJour.value = '';
            const selectCreneau = form.querySelector('#selectCreneau');
            if (selectCreneau) selectCreneau.value = '';
            const selectFiliere = form.querySelector('#selectFiliere');
            if (selectFiliere) selectFiliere.value = '';
            const selectSection = form.querySelector('#selectSection');
            if (selectSection) selectSection.value = '';
        } catch (e) { /* noop */ }

        // Restore FormManager internal state
        this.currentMode = 'create';
        this.editingSessionId = null;

        // Restore submit button label and ensure it's enabled
        try {
            const submitBtn = document.getElementById('btnAjouterSeance') || form.querySelector('[type="submit"], button[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = '➕ Ajouter la Séance';
                submitBtn.disabled = false;
            }
        } catch (e) { /* noop */ }

        // Notify UI/state for re-render if supported
        try {
            if (StateManager && typeof StateManager.notify === 'function') {
                StateManager.notify('form:reset', { form: 'seance' });
            }
        } catch (e) { /* noop */ }

        // Defensive: force a global render if TableRenderer is available (ensures cell visuals sync)
        try { if (typeof TableRenderer !== 'undefined' && TableRenderer && typeof TableRenderer.render === 'function') TableRenderer.render(); } catch (e) { /* noop */ }
    }

    /**
      * Initialise le formulaire de matière
      */
    initializeMatiereForm() {
        if (!this.forms.matiere) return;

        // Event listener pour le changement de filière
        const selectFiliereMatiere = document.getElementById('selectFiliereMatiere');
        if (selectFiliereMatiere) {
            this._addListener(selectFiliereMatiere, 'change', () => {
                // Optionnel: actions lors du changement
            });
        }

        // Event listener pour le changement de département (s'il existe)
        const selectDepartementMatiere = document.getElementById('selectDepartementMatiere');
        if (selectDepartementMatiere) {
            this._addListener(selectDepartementMatiere, 'change', () => {
                // actuellement pas d'action spécifique, mais permet d'écouter les changements si besoin
            });
        }

        // Event listeners pour les volumes hTP
        ['inputVolumeCoursHTP', 'inputVolumeTDHTP', 'inputVolumeTPHTP'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                this._addListener(input, 'input', () => this.updateMatiereVHTPreview());
            }
        });

        // Event listeners pour les sections et groupes
        ['inputSectionsCours', 'inputTDGroups', 'inputTPGroups'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                this._addListener(input, 'input', () => this.updateMatiereVHTPreview());
            }
        });

        // IMPORTANT : écouter le champ Nb Enseignants TP pour recalculer le VHT
        const inputNbEnsTP = document.getElementById('inputNbEnseignantsTP');
        if (inputNbEnsTP) {
            // 'input' pour mise à jour en live (ou 'change' si vous préférez après blur)
            this._addListener(inputNbEnsTP, 'input', () => this.updateMatiereVHTPreview());
        }

        // Optionnel : initialiser la prévisualisation au chargement si les champs ont déjà des valeurs
        this.updateMatiereVHTPreview();
        // PATCH : Ajoute handler submit matière
        this._addListener(this.forms.matiere, 'submit', e => {
            e.preventDefault();
            const data = this.getMatiereFormData();
            if (!data.nom) {
                alert("Veuillez saisir le nom de la matière.");
                return;
            }
            if (typeof StateManager.addMatiere === 'function') {
                StateManager.addMatiere(data.nom, data);
            } else {
                if (!StateManager.state.matiereGroupes[data.nom]) {
                    StateManager.state.matiereGroupes[data.nom] = data;
                    StateManager.saveState && StateManager.saveState();
                }
            }
            this.resetMatiereForm();
            alert("Matière enregistrée !");
        });
    }

    /**
     * Met à jour la prévisualisation du VHT de la matière (construction DOM sûre)
     */
    updateMatiereVHTPreview() {
        const sections = toNumber(document.getElementById('inputSectionsCours')?.value, 0);
        const tdGroups = toNumber(document.getElementById('inputTDGroups')?.value, 0);
        const tpGroups = toNumber(document.getElementById('inputTPGroups')?.value, 0);
        const nbEnsTP = toNumber(document.getElementById('inputNbEnseignantsTP')?.value, 1);

        const volCours = toNumber(document.getElementById('inputVolumeCoursHTP')?.value, 0);
        const volTD = toNumber(document.getElementById('inputVolumeTDHTP')?.value, 0);
        const volTP = toNumber(document.getElementById('inputVolumeTPHTP')?.value, 0);

        const vhtCours = sections * volCours;
        const vhtTD = sections * tdGroups * volTD;
        const vhtTP = sections * tpGroups * volTP * nbEnsTP;
        const vhtTotal = vhtCours + vhtTD + vhtTP;

        const previewDiv = document.getElementById('vhtPreview');
        if (!previewDiv) return;
        clearElement(previewDiv);

        const box = document.createElement('div');
        box.className = 'vht-preview-box';

        const strong = document.createElement('strong');
        strong.textContent = 'VHT Prévisionnel :';
        box.appendChild(strong);
        box.appendChild(document.createElement('br'));

        const line1 = document.createElement('div');
        line1.textContent = `Cours: ${vhtCours}h | TD: ${vhtTD}h | TP: ${vhtTP}h`;
        box.appendChild(line1);

        const total = document.createElement('div');
        total.innerHTML = `<strong>Total: ${vhtTotal}h</strong>`;
        box.appendChild(total);

        previewDiv.appendChild(box);
    }

    /**
     * Récupère les données du formulaire de matière
     * @returns {Object} Les données du formulaire
     */
    getMatiereFormData() {
        return {
            nom: (document.getElementById('inputNomMatiere')?.value || '').trim(),
            filiere: (document.getElementById('selectFiliereMatiere')?.value || '').trim(),
            departement: (document.getElementById('selectDepartementMatiere')?.value || '').trim(),
            sections_cours: toNumber(document.getElementById('inputSectionsCours')?.value, 0),
            td_groups: toNumber(document.getElementById('inputTDGroups')?.value, 0),
            tp_groups: toNumber(document.getElementById('inputTPGroups')?.value, 0),
            // IMPORTANT : default volumes = 0 (ne pas écraser "0" saisi par l'utilisateur)
            volumeHTP: {
                Cours: toNumber(document.getElementById('inputVolumeCoursHTP')?.value, 0),
                TD: toNumber(document.getElementById('inputVolumeTDHTP')?.value, 0),
                TP: toNumber(document.getElementById('inputVolumeTPHTP')?.value, 0)
            },
            nbEnseignantsTP: toNumber(document.getElementById('inputNbEnseignantsTP')?.value, 1)
        };
    }

    /**
     * Remplit le formulaire de matière pour édition.
     * @param {string} matiereName - Nom exact de la matière (clé dans StateManager.state.matiereGroupes)
     */
    fillMatiereForm(matiereName) {
        if (!matiereName) return;
        const mg = (StateManager && StateManager.state && StateManager.state.matiereGroupes) || {};
        const matiereInfo = mg[matiereName];
        if (!matiereInfo) {
            console.warn(`fillMatiereForm: matière "${matiereName}" introuvable`);
            return;
        }

        // Mettre le formulaire en mode édition
        this.currentMode = 'edit';

        // Remplir les champs standards
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val !== undefined && val !== null ? String(val) : '';
        };

        set('inputNomMatiere', matiereName);
        set('selectFiliereMatiere', matiereInfo.filiere || '');
        set('selectDepartementMatiere', matiereInfo.departement || '');
        set('inputSectionsCours', toNumber(matiereInfo.sections_cours, 0));
        set('inputTDGroups', toNumber(matiereInfo.td_groups, 0));
        set('inputTPGroups', toNumber(matiereInfo.tp_groups, 0));
        // Respecter explicitement la valeur 0 si présente dans les données
        set('inputVolumeCoursHTP', toNumber(matiereInfo.volumeHTP?.Cours, 0));
        set('inputVolumeTDHTP', toNumber(matiereInfo.volumeHTP?.TD, 0));
        set('inputVolumeTPHTP', toNumber(matiereInfo.volumeHTP?.TP, 0));
        set('inputNbEnseignantsTP', toNumber(matiereInfo.nbEnseignantsTP, 1));

        // Stocker l'information d'édition sur le formulaire HTML pour que le handler sache
        if (this.forms.matiere) {
            this.forms.matiere.dataset.editingName = matiereName;
        }

        // Changer le texte du bouton Submit
        const btn = document.querySelector('#formAjouterMatiere button[type="submit"], #formAjouterMatiere .btn-primary');
        if (btn) btn.textContent = '💾 Mettre à jour la Matière';

        // Afficher la prévisualisation VHT
        this.updateMatiereVHTPreview();

        // Scroll vers le formulaire
        this.forms.matiere?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Réinitialise le formulaire de matière
     */
    resetMatiereForm() {
        if (this.forms.matiere) {
            this.forms.matiere.reset();
            if (this.forms.matiere.dataset) delete this.forms.matiere.dataset.editingName;
        }

        // Réinitialiser les valeurs par défaut
        const defaults = {
            // set default volumes to 0 so user can explicitly set 0
            inputVolumeCoursHTP: 0,
            inputVolumeTDHTP: 0,
            inputVolumeTPHTP: 0,
            inputNbEnseignantsTP: 1,
            inputSectionsCours: 1,
            inputTDGroups: 0,
            inputTPGroups: 0
        };

        Object.entries(defaults).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
        });

        // Réinitialiser le département (si présent)
        const selectDepartementMatiere = document.getElementById('selectDepartementMatiere');
        if (selectDepartementMatiere) selectDepartementMatiere.value = '';

        // Effacer la prévisualisation puis recalculer (affiche la valeur par défaut)
        const previewDiv = document.getElementById('vhtPreview');
        if (previewDiv) {
            clearElement(previewDiv);
        }

        // Remettre le libellé par défaut du bouton
        const btn = document.querySelector('#formAjouterMatiere button[type="submit"], #formAjouterMatiere .btn-primary');
        if (btn) btn.textContent = '➕ Ajouter la Matière';

        // Recalculer et afficher la prévisualisation avec les valeurs par défaut
        this.updateMatiereVHTPreview();
    }

    /**
     * Initialise le formulaire d'enseignant
     */
    initializeEnseignantForm() {
        if (!this.forms.enseignant) return;
        this._addListener(this.forms.enseignant, 'submit', e => {
            e.preventDefault();
            const data = this.getEnseignantFormData();
            if (!data.nom) {
                alert("Veuillez saisir le nom de l'enseignant.");
                return;
            }
            if (typeof StateManager.addEnseignant === 'function') {
                StateManager.addEnseignant(data.nom);
            } else {
                if (!StateManager.state.enseignants.includes(data.nom)) {
                    StateManager.state.enseignants.push(data.nom);
                    StateManager.state.enseignants.sort();
                    StateManager.saveState && StateManager.saveState();
                }
            }
            this.resetEnseignantForm();
            alert("Enseignant enregistré !");
        });
    }

    /**
     * Récupère les données du formulaire d'enseignant
     * @returns {Object} Les données du formulaire
     */
    getEnseignantFormData() {
        return {
            nom: (document.getElementById('inputNomEnseignant')?.value || '').trim()
        };
    }

    /**
     * Réinitialise le formulaire d'enseignant
     */
    resetEnseignantForm() {
        if (this.forms.enseignant) {
            this.forms.enseignant.reset();
        }
    }

    /**
     * Initialise le formulaire de salle
     */
    initializeSalleForm() {
        if (!this.forms.salle) return;
        this._addListener(this.forms.salle, 'submit', e => {
            e.preventDefault();
            const data = this.getSalleFormData();
            if (!data.nom) {
                alert("Veuillez saisir le nom de la salle.");
                return;
            }
            if (typeof StateManager.addSalle === 'function') {
                StateManager.addSalle(data.nom, data.type || 'Standard');
            } else {
                if (!StateManager.state.sallesInfo[data.nom]) {
                    StateManager.state.sallesInfo[data.nom] = data.type || 'Standard';
                    StateManager.saveState && StateManager.saveState();
                }
            }
            this.resetSalleForm();
            alert("Salle enregistrée !");
        });
    }

    /**
     * Récupère les données du formulaire de salle
     * @returns {Object} Les données du formulaire
     */
    getSalleFormData() {
        return {
            nom: (document.getElementById('inputNomSalle')?.value || '').trim(),
            type: (document.getElementById('selectTypeSalle')?.value || 'Standard').trim()
        };
    }

    /**
     * Réinitialise le formulaire de salle
     */
    resetSalleForm() {
        if (this.forms.salle) {
            this.forms.salle.reset();
        }
    }

    /**
     * Initialise le formulaire de filière
     */
    initializeFiliereForm() {
        if (!this.forms.filiere) return;
        this._addListener(this.forms.filiere, 'submit', e => {
            e.preventDefault();
            const filiere = this.getFiliereFormData();
            if (!filiere.nom || !filiere.session) {
                alert("Veuillez saisir le nom et la session de la filière.");
                return;
            }
            if (typeof StateManager.addFiliere === 'function') {
                StateManager.addFiliere(filiere);
            } else {
                if (!StateManager.state.filieres.some(f => f.nom === filiere.nom && f.session === filiere.session)) {
                    StateManager.state.filieres.push(filiere);
                    StateManager.saveState && StateManager.saveState();
                }
            }
            this.resetFiliereForm();
            alert("Filière enregistrée !");
        });
    }

    /**
     * Récupère les données du formulaire de filière
     * @returns {Object} Les données du formulaire
     */
    getFiliereFormData() {
        return {
            nom: (document.getElementById('inputNomFiliere')?.value || '').trim(),
            session: (document.getElementById('selectSessionFiliere')?.value || 'Automne').trim()
        };
    }

    /**
     * Réinitialise le formulaire de filière
     */
    resetFiliereForm() {
        if (this.forms.filiere) {
            this.forms.filiere.reset();
        }
    }
    /**
 * Peupler le select des filières
 * Utilise l'état courant
 */
    populateFiliereSelect() {
        const select = document.getElementById('selectFiliere');
        if (!select) return;

        const filieres = (StateManager && StateManager.state && StateManager.state.filieres) || [];
        clearElement(select);
        select.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
        filieres.forEach(f => {
            if (!f || !f.nom) return;
            let txt = f.nom;
            if (f.session) txt += ` (${f.session})`;
            if (f.departement) txt += ` [${f.departement}]`;
            select.appendChild(createOption({ value: f.nom, text: txt }));
        });

    }
    /**
     * Peuple le select des enseignants
     */
    populateEnseignantSelect() {
        const select = document.getElementById('inputEnseignant1');
        const select2 = document.getElementById('inputEnseignant2');
        if (!select && !select2) return;

        const enseignants = (StateManager && StateManager.state && StateManager.state.enseignants) || [];
        // Pour les deux selects enseignants 1 et 2
        [select, select2].forEach(sel => {
            if (!sel) return;
            clearElement(sel);
            sel.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
            enseignants.forEach(nom => {
                if (!nom) return;
                sel.appendChild(createOption({ value: nom, text: nom }));
            });
        });
    }
    /**
     * Peuple la liste déroulante des matières
     */
    populateMatiereSelect() {
        // Essaye pour le select de séance
        const select = document.getElementById('selectMatiere');
        // Et pour le formulaire d'ajout matière si besoin
        const selectAjout = document.getElementById('inputNomMatiere');
        const matieres = (StateManager && StateManager.state && StateManager.state.matiereGroupes)
            ? Object.keys(StateManager.state.matiereGroupes)
            : [];
        [select, selectAjout].forEach(sel => {
            if (!sel) return;
            clearElement(sel);
            sel.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
            matieres.forEach(nom => {
                if (!nom) return;
                sel.appendChild(createOption({ value: nom, text: nom }));
            });
        });
    }
    /**
     * Peuple la liste déroulante des salles
     */
    populateSalleSelect() {
        const select = document.getElementById('selectSalle');
        if (!select) return;
        const salles = (StateManager && StateManager.state && StateManager.state.sallesInfo)
            ? Object.keys(StateManager.state.sallesInfo)
            : [];
        clearElement(select);
        select.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
        select.appendChild(createOption({ value: '__NOSALLE__', text: 'Sans salle' }));
        salles.forEach(nom => {
            if (!nom) return;
            const typeSalle = StateManager.state.sallesInfo[nom];
            select.appendChild(createOption({ value: nom, text: `${nom} (${typeSalle})` }));
        });
    }
    populateSelects() {
        // Repopule tous les select de matières, enseignants, salles, filières selon l'état
        this.populateFiliereSelect();
        this.populateEnseignantSelect();
        this.populateMatiereSelect();
        this.populateSalleSelect();
    }
}

// Export d'une instance singleton
const _instance = new FormManager();
// Exposer globalement pour compatibilité code non module / console hotfix
try { window.FormManager = _instance; } catch (e) { /* noop in strict module env */ }
export default _instance;