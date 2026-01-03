/**
 * Point d'entrée principal de l'application EDT
 * @author Ibrahim Mrani - UCD
 * @developer mranii-cmd
 * @version 2.9-modular-final
 * @date 2025-11-04
 */

// === IMPORTS ===

import { initCreneaux } from './utils/helpers.js';
import StateManager from './controllers/StateManager.js';
import SessionController from './controllers/SessionController.js';
import TeacherController from './controllers/TeacherController.js';
import SubjectController from './controllers/SubjectController.js';
import RoomController from './controllers/RoomController.js';
import ForfaitController from './controllers/ForfaitController.js';
import StorageService from './services/StorageService.js';
import LogService from './services/LogService.js';
import ConflictService from './services/ConflictService.js';
import VolumeService from './services/VolumeService.js';
import DialogManager from './ui/DialogManager.js';
import SpinnerManager from './ui/SpinnerManager.js';
import NotificationManager from './ui/NotificationManager.js';
import TableRenderer from './ui/TableRenderer.js';
import VolumeRenderer from './ui/VolumeRenderer.js';
import StatsRenderer from './ui/StatsRenderer.js';
import ListRenderer from './ui/ListRenderer.js';
import WishesRenderer from './ui/WishesRenderer.js';
import ConfigListRenderer from './ui/ConfigListRenderer.js';
import FormManager from './ui/FormManager.js';
import EventHandlers from './handlers/EventHandlers.js';
import FormHandlers from './handlers/FormHandlers.js';
import SchedulingHandlers from './handlers/SchedulingHandlers.js';
import ExportHandlers from './handlers/ExportHandlers.js';
import ImportHandlers from './handlers/ImportHandlers.js';
import DashboardController from './controllers/DashboardController.js';
import DashboardRenderer from './ui/DashboardRenderer.js';
import DashboardHandlers from './handlers/DashboardHandlers.js';
import AnalyticsService from './services/AnalyticsService.js';
import RoomManagementRenderer from './ui/RoomManagementRenderer.js';
import TabPersistence from './utils/TabPersistence.js';
import { extractTeachersFromMatiereEntry } from './utils/teacherHelpers.js'; // <-- nouvel import
import { escapeHTML } from './utils/sanitizers.js';
import ValidationService from './services/ValidationService.js';
import TeacherVolumePreview from './ui/TeacherVolumePreview.js';
import * as TeacherVolumeIndicator from './ui/TeacherVolumeIndicator.js';
import ExamController from './controllers/ExamController.js';
import ExamRenderer from './ui/ExamRenderer.js';
import ExamHandlers from './handlers/ExamHandlers.js';
import ExamRoomAllocator from './ui/ExamRoomAllocator.js';
import ExamRoomAllocatorIntegration from './ui/ExamRoomAllocatorIntegration.js';
import './utils/attemptSaveSession.js';
import './ui/BackupModal.js';
import DatabaseService from './services/DatabaseService.js';


/**
 * Configuration: contrôler l'exposition globale
 * Par défaut, on n'expose que l'essentiel (debug: true pour exposer tout)
 */
const EXPOSE_ALL_GLOBALS = false;

/**
 * Helper utilitaire pour accéder de façon défensive à l'état global
 * Retourne toujours un objet (vide si StateManager ou state manquent)
 */
function getState() {
    try {
        return (StateManager && StateManager.state) || {};
    } catch (e) {
        return {};
    }
}

/**
 * Helper utilitaire pour setter la valeur d'un input/select de manière sûre
 * évite les erreurs quand l'élément est absent.
 */
function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    // Some fields are selects/inputs; use value assignment
    try {
        el.value = value ?? '';
    } catch (e) {
        // fallback: ignore
    }
}

/**
 * Utilitaires DOM sûrs — éviter innerHTML quand possible
 */
function createOption({ value = '', text = '', attrs = {} } = {}) {
    const opt = document.createElement('option');
    opt.value = value;
    // textContent protège contre injection
    opt.textContent = text;
    Object.entries(attrs).forEach(([k, v]) => {
        if (v === true) opt.setAttribute(k, '');
        else if (v !== false && v !== undefined && v !== null) opt.setAttribute(k, String(v));
    });
    return opt;
}

/**
 * Remplace la construction de chaînes HTML pour les <select>.
 * - selectEl: élément <select>
 * - items: array de données
 * - valueFn: fn(item) => value
 * - textFn: fn(item) => display text
 * - makeAttrsFn: fn(item) => { attrName: attrValue } (optionnel)
 */
function populateSelectSafe(selectEl, items = [], valueFn = x => x, textFn = x => x, makeAttrsFn = null, emptyLabel = '-- Sélectionner --') {
    if (!selectEl) return;
    // vider en utilisant DOM
    while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
    selectEl.appendChild(createOption({ value: '', text: emptyLabel }));

    items.forEach(item => {
        const value = valueFn(item);
        const text = textFn(item);
        const attrs = makeAttrsFn ? makeAttrsFn(item) : {};
        const opt = createOption({ value: value === undefined || value === null ? '' : value, text: text || '', attrs });
        selectEl.appendChild(opt);
    });
}

/**
 * Debounce simple
 */
function debounce(fn, wait = 500) {
    let timer = null;
    return function (...args) {
        const ctx = this;
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(ctx, args), wait);
    };
}
/**
 * Classe principale de l'application
 */
class EDTApplication {
    constructor() {
        this.initialized = false;
        this.version = '3.0-modular-final';
        this.developer = 'mranii-cmd';
        // Flags for dynamic relocation of planning/session panels
        this._relocatedPlanning = false;
        this._relocateObserver = null;
        this.debouncedSaveState = debounce(() => {
            try {
                StateManager.saveState(true);
            } catch (e) {
                console.warn('debouncedSaveState error', e);
            }
        }, 800); // 800 ms -> réglable
    }

    /**
     * Initialise l'application
     */
    /**
      * Initialise l'application
      */
    async init() {
        console.log(`🚀 Initialisation de l'application EDT v${this.version}...`);
        // --- Auth check (redirect to login if not authenticated) ---
        try {
            const dbAuth = new DatabaseService();
            // Try to open / health-check (no-op if backend unreachable)
            try { await dbAuth.open(); } catch (e) { /* ignore open error */ }
            // If not authenticated, redirect to login page with redirect param
            if (!dbAuth.isAuthenticated()) {
                const redirect = encodeURIComponent(window.location.pathname + window.location.search);
                // Use login.html (create it if not present) — adjust path if your login route differs
                window.location.replace(`/login.html?redirect=${redirect}`);
                return; // stop app init
            }
        } catch (e) {
            // If auth check fails unexpectedly, continue initialization but log the issue.
            console.warn('Auth check failed during init — continuing bootstrap', e);
        }

        try {
            // 1. UI Managers & Spinner
            this.initializeUIManagers();
            // SpinnerManager.show('Chargement de la base de données...');
            SpinnerManager.show();

            // 2. Chargement des données (ASYNC - IndexedDB)
            await StateManager.init();

            // 3. Gestion des Créneaux
            const stateCreneaux = (StateManager && StateManager.state && StateManager.state.creneaux) ? StateManager.state.creneaux : null;
            if (!stateCreneaux || Object.keys(stateCreneaux).length === 0) {
                console.warn('⚠️ Créneaux manquants - initialisation par défaut');
                initCreneaux(); // initialise avec la configuration par défaut
                try {
                    if (StateManager && typeof StateManager.saveState === 'function') {
                        await StateManager.saveState();
                    }
                } catch (e) {
                    console.warn('Échec de la sauvegarde de l\'état après initialisation des créneaux', e);
                }
            } else {
                initCreneaux(stateCreneaux);
            }
            // 4. Sécurisation des données
            if (!Array.isArray(StateManager.state.examens)) StateManager.state.examens = [];
            if (!Array.isArray(StateManager.state.examRoomConfigs)) StateManager.state.examRoomConfigs = [];
            if (!StateManager.state.header) StateManager.state.header = {};

            // 5. Initialisation UI
            TabPersistence.init();
            this.initializeUI();
            this.initializeRenderers();

            // 6. Init Contrôleurs
            // NOTE : SessionController, TeacherController, etc. sont maintenant des instances prêtes à l'emploi.
            // Ils n'ont pas de méthode init(), donc on ne les appelle pas.

            // Seul le Dashboard a besoin d'un init pour s'abonner aux événements
            if (window.EDTDashboardController) {
                // Si vous l'avez importé sous ce nom ou via le module global
                // Sinon, si importé via import DashboardController... :
                // DashboardController.init(); 
            } else {
                // Appel direct selon votre import
                this.initDashboard();
            }

            // 7. Handlers & Modules
            EventHandlers.init();
            FormHandlers.init();

            // AJOUT : Initialiser les gestionnaires d'examens
            if (ExamHandlers && typeof ExamHandlers.init === 'function') {
                ExamHandlers.init();
            }

            this.initRoomManagement();

            if (window.TeacherVolumePreview) TeacherVolumePreview.initTeacherVolumePreviews();

            // 8. Prêt
            this.initialized = true;

            // 9. Rendu Final (Répare les écrans blancs)
            this.forceInitialRender();

            LogService.success(`✅ Application initialisée`);

            // Check conflits différé
            setTimeout(() => {
                if (window.EDTConflictService) {
                    ConflictService.checkAllConflicts();
                    TableRenderer.updateConflictCounts();
                }
            }, 1000);

            SpinnerManager.hide();

        } catch (error) {
            console.error('❌ Erreur init:', error);
            NotificationManager.error('Erreur chargement: ' + error.message);
            SpinnerManager.hide();
        }
    }
    // Ajoute ceci dans la classe EDTApplication
    async initLogoutButton() {
        try {
            // Choisir emplacement : prefer header (#appHeader) sinon <header> sinon body
            const headerEl = document.getElementById('appHeader') || document.querySelector('header') || document.body;
            if (!headerEl) return;

            // Créer le bouton si nécessaire
            let btn = document.getElementById('btnLogoutApp');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'btnLogoutApp';
                btn.className = 'btn btn-logout';
                btn.textContent = 'Se déconnecter';
                // Style simple non intrusif (tu peux adapter / déplacer dans le CSS)
                btn.style.position = 'fixed';
                btn.style.top = '12px';
                btn.style.right = '12px';
                btn.style.zIndex = '9999';
                btn.style.padding = '6px 10px';
                btn.style.borderRadius = '6px';
                btn.style.background = '#007bff';
                btn.style.color = '#fff';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
                headerEl.appendChild(btn);
            }

            const db = new DatabaseService();

            // Met à jour la visibilité selon l'état d'authentification
            const updateVisibility = () => {
                try {
                    const authed = (window.__edt_authenticated === true) || (db && typeof db.isAuthenticated === 'function' && db.isAuthenticated());
                    btn.style.display = authed ? '' : 'none';
                } catch (e) {
                    btn.style.display = 'none';
                }
            };

            updateVisibility();
            window.addEventListener('edt:login', updateVisibility);
            window.addEventListener('edt:logout', updateVisibility);

            // Handler du clic : logout puis redirect vers /login.html
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    // Afficher un spinner si dispo
                    try { SpinnerManager && SpinnerManager.show && SpinnerManager.show(); } catch (e) { }
                    // Logout via service
                    await db.logout();
                    // Nettoyage supplémentaire (défensif)
                    try {
                        if (typeof window !== 'undefined' && window.localStorage) {
                            window.localStorage.removeItem && window.localStorage.removeItem('EDT_API_TOKEN');
                            window.localStorage.removeItem && window.localStorage.removeItem('EDT_API_TOKEN_EXP');
                            window.localStorage.removeItem && window.localStorage.removeItem('edt_unload_state');
                        }
                    } catch (e) { }
                    try { window.__edt_authenticated = false; window.__edt_prevent_auto_show = false; } catch (e) { }
                    try { window.dispatchEvent(new CustomEvent('edt:logout')); } catch (e) { }
                } catch (err) {
                    console.error('Logout failed', err);
                } finally {
                    try { SpinnerManager && SpinnerManager.hide && SpinnerManager.hide(); } catch (e) { }
                    // Rediriger vers la page de connexion en conservant l'URL courante comme redirect
                    try {
                        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
                        window.location.replace(`/login.html?redirect=${redirect}`);
                    } catch (e) {
                        // fallback: reload page
                        window.location.reload();
                    }
                }
            });
        } catch (e) {
            console.warn('initLogoutButton failed', e);
        }
    }
    /**
     * NOUVEAU : Initialise la gestion des salles
     */
    initRoomManagement() {
        try {
            RoomManagementRenderer.init('roomManagementContainer');

            // Exposer globalement
            window.EDTRoomManagement = RoomManagementRenderer;
            window.EDTRoomController = RoomController;

            LogService.success('✅ Gestion des salles initialisée');
        } catch (error) {
            LogService.error(`❌ Erreur init gestion salles: ${error.message}`);
        }
    }
    /**
     * NOUVELLE MÉTHODE : Initialise le dashboard
     */
    /**
    * NOUVEAU : Initialise le dashboard
    */
    initDashboard() {
        try {
            // Initialiser le contrôleur
            DashboardController.init();

            // Initialiser le renderer
            DashboardRenderer.init('dashboardContainer');

            // Initialiser les handlers
            DashboardHandlers.init();

            // Exposer globalement pour les onclick dans le HTML
            window.EDTDashboardController = DashboardController;
            window.EDTDashboardHandlers = DashboardHandlers;
            window.EDTDashboardRenderer = DashboardRenderer;
            window.EDTAnalyticsService = AnalyticsService;

            LogService.success('✅ Dashboard initialisé');
        } catch (error) {
            LogService.error(`❌ Erreur initialisation dashboard: ${error.message}`);
            console.error('Dashboard init error:', error);
        }
    }
    /**
     * Initialise les gestionnaires UI
     */
    initializeUIManagers() {
        LogService.init('messages');
        //DialogManager.init('dialogModal');
        if (typeof document !== 'undefined' && document.getElementById('dialogModal')) {
            DialogManager.init('dialogModal');
        } else {
            console.warn('DialogManager.init skipped: modal #dialogModal not found');
        }
        SpinnerManager.init('loading-overlay');
        NotificationManager.init('edt-notification-area');
    }

    /**
     * Initialise l'interface utilisateur
     */
    initializeUI() {
        // Charger les en-têtes
        this.loadHeaderValues();

        // Initialiser les formulaires
        this.initializeForms();

        // Initialiser les onglets
        this.initializeTabs();

        // Initialiser les sous-onglets de configuration
        this.initializeSubTabs();

        // Initialiser les event listeners
        this.attachEventListeners();

        // Initialiser les listeners des services avancés
        this.attachAdvancedServiceListeners();

        // Initialiser les handlers d'export/import et examens (attach listeners aux éléments DOM)
        try {
            if (ExportHandlers && typeof ExportHandlers.init === 'function') ExportHandlers.init();
            if (ImportHandlers && typeof ImportHandlers.init === 'function') ImportHandlers.init();
            if (ExamHandlers && typeof ExamHandlers.init === 'function') ExamHandlers.init();
        } catch (e) {
            console.warn('Failed to initialize some handlers', e);
        }
        // Installer le bouton de déconnexion (si présent dans la classe)
        try { this.initLogoutButton && this.initLogoutButton(); } catch (e) { console.warn('initLogoutButton call failed', e); }

        // Relocate planning panel and session menu if needed (non-destructive, idempotent).
        // Run after a small delay so renderers have time to mount DOM nodes.
        setTimeout(() => {
            try {
                this.relocatePlanningAndSessionMenu();
            } catch (err) {
                console.debug('relocatePlanningAndSessionMenu failed', err);
            }
        }, 150);

    }

    /**
     * Initialise tous les renderers
     */
    initializeRenderers() {
        // Table EDT
        TableRenderer.init('edtTable');
        this.initializeTableRenderer();

        // Volumes
        VolumeRenderer.init('volumesContainer');

        // Statistiques
        StatsRenderer.init('statsContainer');

        // Examens

        ExamRenderer.init('examsListContainer');
        // Initialize the manual global allocator (button-based)
        try { ExamRoomAllocator && typeof ExamRoomAllocator.init === 'function' && ExamRoomAllocator.init(); } catch (e) { console.warn('ExamRoomAllocator.init failed', e); }
        // Integrate per-exam "manage allocation" buttons (gear near each exam)
        try { ExamRoomAllocatorIntegration && typeof ExamRoomAllocatorIntegration.init === 'function' && ExamRoomAllocatorIntegration.init('examsListContainer'); } catch (e) { console.warn('ExamRoomAllocatorIntegration.init failed', e); }


        // Listes
        ListRenderer.init({
            teachers: 'teachersListContainer',
            subjects: 'subjectsListContainer',
            rooms: 'roomsListContainer'
        });

        // Souhaits
        WishesRenderer.init('wishesListContainer');

        // Listes de configuration
        // ConfigListRenderer n'a pas besoin d'init car il rend directement dans les conteneurs
    }

    safeAppendChild(parent, child) {
        try {
            if (!parent || !child) return false;
            if (parent === child) return false;
            if (child.contains && child.contains(parent)) return false;
            if (parent.contains && parent.contains(child)) return false;
            if (child.parentNode === parent) return false;
            if (child.parentNode && child.parentNode !== parent)
                child.parentNode.removeChild(child);
            parent.appendChild(child);
            return true;
        } catch (e) {
            console.warn('safeAppendChild: failed to move node', e);
            return false;
        }
    }
    /**
    +     * Déplace le panneau "Planification automatique" vers Config > subtab-planification
    +     * et déplace le "menu séance" (formAjouterSeance / container) à la place de ce panneau
    +     * dans l'onglet Planification.
    +     *
    +     * Non destructif : déplace les noeuds existants, idempotent.
    +     * Si les éléments sont rendus plus tard, un MutationObserver temporaire tentera la relocalisation.
    +     */
    relocatePlanningAndSessionMenu() {

        if (this._relocatedPlanning) return;
        if (this._relocatedPlanning) {
            console.debug('relocatePlanningAndSessionMenu: already performed');
            return;
        }

        const doc = document;

        const findAutoPanel = () => {
            // 1) Quick selectors (explicit ids/classes that might exist)
            const quickSelectors = [
                '#autoPlanningPanel',
                '#auto-planning-panel',
                '.auto-planning',
                '.panel-auto-planning',
                '[data-auto-planning]',
                '[data-module="auto-planning"]'
            ];
            for (const sel of quickSelectors) {
                try {
                    const el = doc.querySelector(sel);
                    if (el) {
                        console.debug('findAutoPanel: found by quick selector', sel, el);
                        return el;
                    }
                } catch (e) { /* noop */ }
            }

            // 2) Look for container that contains known buttons (reliable)
            const candidates = Array.from(doc.querySelectorAll('section, div, .panel, .card, .form-section, aside, .well, .container'));
            const btnPatterns = [/btnAutoGenerateAll/i, /btnOptimizeSchedule/i, /btnResolveConflicts/i];
            for (const el of candidates) {
                try {
                    // known ids/buttons inside the panel
                    if (el.querySelector('#btnAutoGenerateAll') || el.querySelector('#btnOptimizeSchedule') || el.querySelector('#btnResolveConflicts')) {
                        console.debug('findAutoPanel: found by known button ids inside element', el);
                        return el;
                    }

                    // buttons whose text suggests auto-planning
                    const buttons = Array.from(el.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
                    if (buttons.some(b => {
                        const t = (b.innerText || b.value || '').trim();
                        return /\b(auto|automatique|auto ?génération|génération automatique|générer)\b/i.test(t);
                    })) {
                        console.debug('findAutoPanel: found by button text inside element', el);
                        return el;
                    }

                    // text heuristics
                    const text = (el.innerText || '').slice(0, 800);
                    if (/\bplanification automatique\b/i.test(text) ||
                        /\bgénération (?:de )?séances\b/i.test(text) ||
                        /\bauto-?génér/i.test(text) ||
                        /\bgénérer (?:les )?séances\b/i.test(text) ||
                        /\bplanification\b/i.test(text) && /\bautom/i.test(text)) {
                        console.debug('findAutoPanel: found by text heuristic', el);
                        return el;
                    }
                } catch (e) { /* noop */ }
            }

            // 3) Fallback: try a looser id-based hunt (any id containing "auto" and "plan")
            try {
                const loose = Array.from(doc.querySelectorAll('[id]')).find(n => {
                    const id = (n.id || '').toLowerCase();
                    return id.includes('auto') && id.includes('plan');
                });
                if (loose) {
                    console.debug('findAutoPanel: found by loose id match', loose.id, loose);
                    return loose;
                }
            } catch (e) { /* noop */ }

            return null;
        };
        const findSessionMenu = () => {
            // prefer the explicit form
            const form = doc.getElementById('formAjouterSeance');
            if (form) return form.closest('section, div, .panel, .card, .form-section') || form.parentElement;

            // fallback: find container with fields typical to the seance form
            const candidates = Array.from(doc.querySelectorAll('section, div, .panel, .card, .form-section, form'));
            for (const c of candidates) {
                try {
                    if (c.querySelector('#inputEnseignant1') || c.querySelector('#selectMatiere') || c.querySelector('#btnResetSeanceForm')) return c;
                    const text = (c.innerText || '').slice(0, 400);
                    if (/\bAjouter une séance\b/i.test(text) || /\bFormulaire de séance\b/i.test(text) || /\bSéance\b/i.test(text)) return c;
                } catch (e) { /* noop */ }
            }
            return null;
        };

        const planPane = doc.getElementById('tab-planning') || doc.querySelector('[data-tab="planning"]') || doc.querySelector('#tab-planning');
        const configPane = doc.getElementById('tab-config') || doc.querySelector('[data-tab="config"]');
        if (!planPane || !configPane) {
            console.debug('relocatePlanningAndSessionMenu: planPane or configPane not found');
            return;
        }

        const attemptRelocate = () => {
            const autoPanel = findAutoPanel();
            const sessionMenu = findSessionMenu();
            if (!autoPanel && !sessionMenu) return false;

            // ensure config subtab container/button/pane exists
            let subtabButtonsContainer = configPane.querySelector('.sub-tab-buttons') || configPane.querySelector('.sub-tab-btns');
            if (!subtabButtonsContainer) {
                subtabButtonsContainer = doc.createElement('div');
                subtabButtonsContainer.className = 'sub-tab-buttons';
                subtabButtonsContainer.style.marginBottom = '8px';
                configPane.insertBefore(subtabButtonsContainer, configPane.firstChild);
            }

            let planifBtn = doc.querySelector('.sub-tab-btn[data-subtab="planification"]');
            if (!planifBtn) {
                planifBtn = doc.createElement('button');
                planifBtn.className = 'sub-tab-btn';
                planifBtn.setAttribute('data-subtab', 'planification');
                planifBtn.type = 'button';
                planifBtn.textContent = '📅 Planification';
                planifBtn.style.marginRight = '6px';
                // Prefer to append to an existing sub-tab button container within configPane
                const existingBtn = configPane.querySelector('.sub-tab-btn');
                if (existingBtn && existingBtn.parentNode) {
                    existingBtn.parentNode.appendChild(planifBtn);
                } else {
                    subtabButtonsContainer.appendChild(planifBtn);
                }
            }

            let planifPane = doc.getElementById('subtab-planification');
            if (!planifPane) {
                planifPane = doc.createElement('div');
                planifPane.id = 'subtab-planification';
                planifPane.className = 'sub-tab-pane';
                planifPane.style.display = 'none';
                configPane.appendChild(planifPane);
            }

            // Move sessionMenu into planning pane (where autoPanel was)
            try {
                // choose insertion point in planning pane: prefer where autoPanel used to be
                let insertBeforeNode = null;
                if (autoPanel && planPane.contains(autoPanel)) insertBeforeNode = autoPanel;
                else insertBeforeNode = planPane.querySelector('.panel, .card, .form-section, .left-col') || null;

                if (sessionMenu && sessionMenu !== autoPanel) {
                    if (insertBeforeNode && insertBeforeNode.parentNode) {
                        insertBeforeNode.parentNode.insertBefore(sessionMenu, insertBeforeNode);
                    } else {
                        planPane.insertBefore(sessionMenu, planPane.firstChild);
                    }
                    console.info('relocatePlanningAndSessionMenu: sessionMenu moved into planning pane');
                }
            } catch (e) {
                console.warn('relocatePlanningAndSessionMenu: failed to move sessionMenu', e);
            }

            // Move autoPanel into config subtab planification
            try {
                if (autoPanel && !planifPane.contains(autoPanel)) {
                    this.safeAppendChild(planifPane, autoPanel);
                    console.info('relocatePlanningAndSessionMenu: autoPanel moved into config subtab planification');
                }
            } catch (e) {
                console.warn('relocatePlanningAndSessionMenu: failed to move autoPanel', e);
            }

            // Attach show handler to planifBtn idempotently
            if (!planifBtn._relocateHandlerAttached) {
                planifBtn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    doc.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
                    doc.querySelectorAll('.sub-tab-pane').forEach(p => {
                        p.classList.remove('active');
                        try { p.style.display = 'none'; } catch (e) { /* noop */ }
                    });
                    planifBtn.classList.add('active');
                    planifPane.classList.add('active');
                    try { planifPane.style.display = ''; } catch (e) { /* noop */ }
                    try { this.refreshConfigSubTab && this.refreshConfigSubTab('planification'); } catch (e) { /* noop */ }
                });
                planifBtn._relocateHandlerAttached = true;
            }

            // Ensure initializeSubTabs picks up this new button (re-scan handlers)
            try {
                if (typeof this.initializeSubTabs === 'function') {
                    // re-run subtab initialization to attach click handlers to newly inserted buttons
                    this.initializeSubTabs();
                }
            } catch (e) {
                console.debug('relocatePlanningAndSessionMenu: initializeSubTabs re-run failed', e);
            }

            // If the Configuration tab is currently active and no config subtab is active,
            // activate the new "planification" subtab so it appears beside other subtabs.
            try {
                const configTabBtn = document.querySelector('.tab-btn.active[data-tab="config"]') || document.querySelector('.tab-btn[data-tab="config"].active');
                if (configTabBtn) {
                    const anyActiveSub = configPane.querySelector('.sub-tab-btn.active') || configPane.querySelector('.sub-tab-pane.active');
                    if (!anyActiveSub) {
                        // activate planifBtn (use its click handler)
                        planifBtn.click();
                    }
                }
            } catch (e) {
                console.debug('relocatePlanningAndSessionMenu: activating planification subtab failed', e);
            }

            this._relocatedPlanning = true;
            return true;
        };

        // Try relocate immediately; if not possible yet, observe DOM for a short time
        if (attemptRelocate()) return;

        // If not found, set up MutationObserver that disconnects after success or timeout
        if (this._relocateObserver) return;
        const observer = new MutationObserver((mutations, obs) => {
            if (this._relocatedPlanning) {
                try { obs.disconnect(); } catch { }
                return;
            }
            if (attemptRelocate()) {
                this._relocatedPlanning = true;
                try { obs.disconnect(); } catch { }
                this._relocateObserver = null;
            }
        });
        this._relocateObserver = observer;
        try {
            observer.observe(doc.body, { childList: true, subtree: true });
            // auto-stop after 6s if nothing found
            setTimeout(() => {
                try {
                    if (this._relocateObserver) {
                        this._relocateObserver.disconnect();
                        this._relocateObserver = null;
                        console.debug('relocatePlanningAndSessionMenu: observer timed out (no nodes found)');
                    }
                } catch (e) { /* noop */ }
            }, 6000);
        } catch (e) {
            console.debug('relocatePlanningAndSessionMenu: unable to observe DOM for late-rendered panels', e);
        }
    }

    /**
     * Charge les valeurs d'en-tête
     */
    loadHeaderValues() {
        const header = getState().header || {};

        const inputAnnee = document.getElementById('inputAnneeUniversitaire');
        const selectSession = document.getElementById('selectSession');
        const selectDept = document.getElementById('selectDepartement');

        if (inputAnnee) inputAnnee.value = header.annee || '';
        if (selectSession) selectSession.value = header.session || '';
        if (selectDept) selectDept.value = header.departement || '';
    }

    /**
     * Initialise les formulaires
     */
    initializeForms() {
        console.log('Initialisation des formulaires...');

        // Initialiser le FormManager
        FormManager.init();

        // Peupler les listes déroulantes
        this.populateFormSelects();

        // Attacher les event listeners des formulaires
        this.attachFormListeners();
    }

    /**
     * Attache les event listeners des formulaires
     */
    attachFormListeners() {
        // Formulaire de séance
        const formSeance = document.getElementById('formAjouterSeance');
        if (formSeance) {
            formSeance.addEventListener('submit', (e) => {
                FormHandlers.handleSeanceFormSubmit(e);
            });
        }
        // Afficher les souhaits de l'enseignant sélectionné dans le formulaire de séance
        // --- Remplacer la gestion des listeners des selects d'enseignants ---

        const selectEns1Preview = document.getElementById('inputEnseignant1');
        if (selectEns1Preview && !selectEns1Preview.dataset.changeAttached) {
            selectEns1Preview.addEventListener('change', (e) => {
                this.renderTeacherWishes(e.target.value);
            });
            // afficher au chargement si une valeur est déjà sélectionnée
            if (selectEns1Preview.value) {
                this.renderTeacherWishes(selectEns1Preview.value);
            }
            selectEns1Preview.dataset.changeAttached = '1';
        }

        const selectEns2Preview = document.getElementById('inputEnseignant2');
        if (selectEns2Preview && !selectEns2Preview.dataset.changeAttached) {
            selectEns2Preview.addEventListener('change', (e) => {
                // si vous voulez afficher aussi le second enseignant, on concatène ses souhaits
                // pour l'instant on affiche uniquement le 1er enseignant; afficher 2ème remplace le preview
                this.renderTeacherWishes(e.target.value);
            });
            selectEns2Preview.dataset.changeAttached = '1';
        }
        try {
            if (selectEns1Preview) TeacherVolumeIndicator.attachIndicator(selectEns1Preview);
            if (selectEns2Preview) TeacherVolumeIndicator.attachIndicator(selectEns2Preview);
        } catch (e) {
            console.debug('Failed to attach teacher volume indicators', e);
        }
        // Bouton annuler édition
        const btnCancelEdit = document.getElementById('btnCancelSeanceEdit');
        if (btnCancelEdit) {
            btnCancelEdit.addEventListener('click', () => {
                FormHandlers.handleCancelSeanceEdit();
            });
        }

        // Bouton reset formulaire séance
        const btnResetSeanceForm = document.getElementById('btnResetSeanceForm');
        if (btnResetSeanceForm) {
            btnResetSeanceForm.addEventListener('click', () => {
                FormManager.resetSeanceForm();
                NotificationManager.info('Formulaire réinitialisé', 2000);
            });
        }

        // Formulaire de forfait
        const formForfait = document.getElementById('formAjouterForfait');
        if (formForfait) {
            formForfait.addEventListener('submit', (e) => {
                this.handleForfaitFormSubmit(e);
            });
        }

        // Bouton reset formulaire forfait
        const btnResetForfaitForm = document.getElementById('btnResetForfaitForm');
        if (btnResetForfaitForm) {
            btnResetForfaitForm.addEventListener('click', () => {
                this.resetForfaitForm();
                NotificationManager.info('Formulaire réinitialisé', 2000);
            });
        }

        // Bouton cancel forfait edit
        const btnCancelForfaitEdit = document.getElementById('btnCancelForfaitEdit');
        if (btnCancelForfaitEdit) {
            btnCancelForfaitEdit.addEventListener('click', () => {
                this.cancelForfaitEdit();
            });
        }
    }

    /**
     * Peuple les listes déroulantes des formulaires
     */
    populateFormSelects() {
        // Filières (pour formulaire de séance et de matière)
        const selectFiliere = document.getElementById('selectFiliere');
        const selectFiliereMatiere = document.getElementById('selectFiliereMatiere');

        if (selectFiliere || selectFiliereMatiere) {
            const filieres = (StateManager && StateManager.getCurrentSessionFilieres) ? StateManager.getCurrentSessionFilieres() : [];

            if (selectFiliere) {
                populateSelectSafe(selectFiliere, filieres, f => f.nom, f => f.nom, null, '-- Sélectionner --');
            }
            if (selectFiliereMatiere) {
                populateSelectSafe(selectFiliereMatiere, filieres, f => f.nom, f => f.nom, null, '-- Sélectionner --');
            }
        }
        //  Départements (pour formulaire de filière)
        const selectDepartementFiliere = document.getElementById('selectDepartementFiliere');
        if (selectDepartementFiliere) {
            // On récupère la liste de départements depuis le select header #selectDepartement
            const headerDeptSelect = document.getElementById('selectDepartement');
            const departments = headerDeptSelect
                ? Array.from(headerDeptSelect.options).map(opt => opt.value).filter(v => v && v.trim() !== '')
                : [];

            // Construire options (garder une option vide)
            // Remplacer innerHTML par population sûre
            while (selectDepartementFiliere.firstChild) selectDepartementFiliere.removeChild(selectDepartementFiliere.firstChild);
            selectDepartementFiliere.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
            departments.forEach(d => {
                selectDepartementFiliere.appendChild(createOption({ value: d, text: d }));
            });
        }
        // Départements pour le formulaire "Ajouter une Matière"
        const selectDepartementMatiere = document.getElementById('selectDepartementMatiere');
        if (selectDepartementMatiere) {
            const headerDeptSelect2 = document.getElementById('selectDepartement');
            const departments2 = headerDeptSelect2
                ? Array.from(headerDeptSelect2.options).map(opt => opt.value).filter(v => v && v.trim() !== '')
                : [];

            while (selectDepartementMatiere.firstChild) selectDepartementMatiere.removeChild(selectDepartementMatiere.firstChild);
            selectDepartementMatiere.appendChild(createOption({ value: '', text: '-- Sélectionner --' }));
            departments2.forEach(d => {
                selectDepartementMatiere.appendChild(createOption({ value: d, text: d }));
            });
        }
        // Matières (filtrables par filière si une filière est sélectionnée dans le formulaire "Séance")
        const selectMatiere = document.getElementById('selectMatiere');

        /**
         * Remplit le select des matières. Si filiereParam est fourni et non vide,
         * on n'affiche que les matières appartenant à cette filière.
         * @param {string} filiereParam
         */
        const populateMatieresSelect = (filiereParam = '') => {
            if (!selectMatiere) return;
            const subjects = (StateManager && StateManager.getCurrentSessionSubjects) ? StateManager.getCurrentSessionSubjects() : [];
            const filtered = filiereParam
                ? subjects.filter(s => (s.filiere || '').toString() === filiereParam.toString())
                : subjects;

            const currentValue = selectMatiere.value;
            populateSelectSafe(selectMatiere, filtered, s => s.nom, s => s.nom, null, '-- Sélectionner --');

            // Restaurer la valeur sélectionnée si elle existe toujours dans la liste filtrée
            if (currentValue && filtered.some(s => s.nom === currentValue)) {
                selectMatiere.value = currentValue;
            }
        };

        // Initialisation du select Matière (filtré si une filière est déjà sélectionnée)
        const initialFiliere = selectFiliere?.value || '';
        populateMatieresSelect(initialFiliere);

        // Lorsque la filière change dans le formulaire séance, ne montrer que les matières de cette filière
        if (selectFiliere) {
            selectFiliere.addEventListener('change', (e) => {
                populateMatieresSelect(e.target.value || '');
            });
        }
        // Enseignants
        this.populateTeacherSelects();

        // Mettre à jour / reconstruire les listes d'enseignants lorsque la matière change

        // Lorsque la matière change, reconstruire la liste des enseignants (listener protégé)
        if (selectMatiere && !selectMatiere.dataset.changeAttached) {
            selectMatiere.addEventListener('change', () => {
                this.populateTeacherSelects();
            });
            selectMatiere.dataset.changeAttached = '1';
        }


        // Salles
        this.populateRoomSelects();

        // Type de salle (pour le formulaire d'ajout de salle)
        const selectTypeSalle = document.getElementById('selectTypeSalle');
        if (selectTypeSalle) {
            // Remplacer innerHTML par populateSelectSafe
            populateSelectSafe(selectTypeSalle, ['Standard', 'Amphi', 'STP'], x => x, x => x, null, '-- Sélectionner --');
        }

        // Session de filière
        const selectSessionFiliere = document.getElementById('selectSessionFiliere');
        if (selectSessionFiliere) {
            populateSelectSafe(selectSessionFiliere, ['Automne', 'Printemps'], x => x, x => x, null, '-- Sélectionner --');
        }

        // Peupler le sélecteur de vue EDT
        this.populateEDTViewSelector();

        // Peupler les selects de souhaits
        this.populateWishesSelects();

        // Peupler les selects de forfaits
        this.populateForfaitSelects();
    }

    /**
     * Peuple le sélecteur d'enseignants pour les forfaits
     */
    populateForfaitSelects() {
        const selectEnseignantForfait = document.getElementById('selectEnseignantForfait');
        if (selectEnseignantForfait) {
            const enseignants = getState().enseignants || [];
            populateSelectSafe(selectEnseignantForfait, enseignants, e => e, e => e, null, '-- Sélectionner un enseignant --');
        }
    }

    /**
     * Peuple le sélecteur de vue EDT
     */
    populateEDTViewSelector() {
        const selectView = document.getElementById('selectEDTView');
        if (!selectView) return;

        const filieres = (StateManager && StateManager.getCurrentSessionFilieres) ? StateManager.getCurrentSessionFilieres() : [];

        // Remplacer construction de string par création DOM sûre
        while (selectView.firstChild) selectView.removeChild(selectView.firstChild);
        selectView.appendChild(createOption({ value: 'global', text: 'Vue Globale' }));
        selectView.appendChild(createOption({ value: 'enseignant_selectionne', text: 'Enseignant Sélectionné' }));

        filieres.forEach(f => {
            selectView.appendChild(createOption({ value: f.nom, text: f.nom }));
        });
    }

    /**
     * Peuple les listes déroulantes d'enseignants
     */
    populateTeacherSelects() {
        const selects = ['inputEnseignant1', 'inputEnseignant2'];
        const teachers = getState().enseignants || [];

        // Déterminer la matière sélectionnée (si présente)
        const selectedMatiere = document.getElementById('selectMatiere')?.value || '';

        // Construire set d'enseignants intéressés : matiereGroupes + souhaits (fallback)
        const interestedSet = new Set(this.getInterestedTeachersForMatiere(selectedMatiere));
        try {
            const wishes = (window.EDTState && window.EDTState.state && window.EDTState.state.enseignantSouhaits)
                || (StateManager && StateManager.state && StateManager.state.enseignantSouhaits)
                || {};
            const needle = selectedMatiere.toString().trim().toLowerCase();
            Object.entries(wishes).forEach(([teacher, w]) => {
                if (!w) return;
                const choices = [
                    (w.choix1 || '').toString(),
                    (w.choix2 || '').toString(),
                    (w.choix3 || '').toString()
                ].map(s => s.trim().toLowerCase());
                if (needle && choices.includes(needle)) interestedSet.add(teacher);
            });
        } catch (e) {
            console.debug('populateTeacherSelects: erreur en lisant enseignantSouhaits', e);
        }

        // Normaliser noms selon la liste complète d'enseignants
        const teachersList = (StateManager && StateManager.state && StateManager.state.enseignants) || [];
        const normInterested = new Set();
        interestedSet.forEach(name => {
            if (!name) return;
            const trimmed = String(name).trim();
            const found = teachersList.find(t => t && String(t).trim().toLowerCase() === trimmed.toLowerCase());
            normInterested.add(found || trimmed);
        });

        selects.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                const currentValue = select.value;

                // vider
                while (select.firstChild) select.removeChild(select.firstChild);
                select.appendChild(createOption({ value: '', text: '-- Aucun --' }));

                teachers.forEach(t => {
                    const isInterested = normInterested.has(t);
                    const attrs = {};
                    if (isInterested) attrs['data-interested'] = 'true';
                    attrs['data-teacher'] = t;
                    const displayLabel = isInterested ? `★ ${t}` : t;
                    if (isInterested && selectedMatiere) attrs['title'] = `Intéressé par ${selectedMatiere}`;
                    const opt = createOption({ value: t, text: displayLabel, attrs });
                    select.appendChild(opt);
                });

                // Restaurer la valeur sélectionnée si elle existe toujours
                if (currentValue && teachers.includes(currentValue)) {
                    select.value = currentValue;
                }
                // Gérer la classe highlight
                if (normInterested.size > 0) {
                    select.classList.add('teacher-highlight');
                } else {
                    select.classList.remove('teacher-highlight');
                }
            }
        });

        // Appliquer un marquage additionnel de sécurité (doit être inoffensif si déjà appliqué)
        this.applyTeacherInterestHighlighting();
    }

    /**
     * Retourne la liste d'enseignants intéressés pour une matière donnée.
 +     * Essaie plusieurs formats possibles pour être tolérant aux différences de structure.
 +     * @param {string} subject
 +     * @returns {Array<string>}
 +     */
    getInterestedTeachersForMatiere(subject) {
        if (!subject) return [];

        const mg = getState().matiereGroupes || {};
        const entry = mg[subject];
        if (!entry) {
            // Essayons de trouver par insensibilité à la casse (petite heuristique)
            const foundKey = Object.keys(mg).find(k => k && k.toLowerCase() === String(subject).toLowerCase());
            if (foundKey) {
                return this.extractTeachersFromMatiereEntry(mg[foundKey]);
            }
            console.debug(`getInterestedTeachersForMatiere: aucune entrée matiereGroupes pour "${subject}", tentative fallback par souhaits enseignants`);
            // Fallback : rechercher dans les souhaits des enseignants (enseignantSouhaits)
            const wishes = getState().enseignantSouhaits || {};
            const teachersFromWishes = [];
            const needle = String(subject).trim().toLowerCase();
            Object.entries(wishes).forEach(([teacher, w]) => {
                if (!w) return;
                const choices = [
                    (w.choix1 || '').toString(),
                    (w.choix2 || '').toString(),
                    (w.choix3 || '').toString()
                ].map(s => s.trim().toLowerCase());

                if (choices.includes(needle)) teachersFromWishes.push(teacher);
            });

            return teachersFromWishes;
        }
        // déléguer à l'utilitaire
        return extractTeachersFromMatiereEntry(entry);

        //return this.extractTeachersFromMatiereEntry(entry);
    }

    /**
 +     * Extrait un tableau d'enseignants depuis une entrée matiereGroupes (gestion de plusieurs formats)
 +     * @param {any} entry
 +     * @returns {Array<string>}
 +     */
    extractTeachersFromMatiereEntry(entry) {
        return extractTeachersFromMatiereEntry(entry);
    }

    /**
 +     * Calcule et applique data-interested / classe teacher-highlight sur les <select> d'enseignants.
 +     * Fonction tolérante : combine matiereGroupes et enseignantSouhaits et normalise les noms.
 +     */
    applyTeacherInterestHighlighting() {
        const selM = document.getElementById('selectMatiere');
        const subject = selM ? String(selM.value).trim() : '';

        // Récupérer la liste d'enseignants intéressés via matiereGroupes
        let interested = new Set(this.getInterestedTeachersForMatiere(subject));

        // Fallback supplémentaire : parcourir enseignantSouhaits et ajouter ceux qui ont la matière dans choix1/2/3
        try {
            const wishes = (window.EDTState && window.EDTState.state && window.EDTState.state.enseignantSouhaits)
                || (StateManager && StateManager.state && StateManager.state.enseignantSouhaits)
                || {};
            const needle = subject.toLowerCase();
            Object.entries(wishes).forEach(([teacher, w]) => {
                if (!w) return;
                const choices = [
                    (w.choix1 || '').toString(),
                    (w.choix2 || '').toString(),
                    (w.choix3 || '').toString()
                ].map(s => s.trim().toLowerCase());
                if (choices.includes(needle)) interested.add(teacher);
            });
        } catch (e) {
            console.debug('applyTeacherInterestHighlighting: erreur en lisant enseignantSouhaits', e);
        }

        // Normaliser (trim, majuscules exactes comme dans la liste enseignants)
        const teachersList = (StateManager && StateManager.state && StateManager.state.enseignants) || [];
        const normInterested = new Set();
        interested.forEach(name => {
            if (!name) return;
            const trimmed = String(name).trim();
            const found = teachersList.find(t => t && String(t).trim().toLowerCase() === trimmed.toLowerCase());
            normInterested.add(found || trimmed);
        });

        // Appliquer aux selects
        const selects = ['inputEnseignant1', 'inputEnseignant2'];
        selects.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            let hasInterested = false;
            Array.from(sel.options).forEach(opt => {
                const teacherName = (opt.getAttribute('data-teacher') || opt.value || '').toString().trim();
                if (!teacherName) {
                    opt.removeAttribute('data-interested');
                    return;
                }
                if (normInterested.has(teacherName)) {
                    opt.setAttribute('data-interested', 'true');
                    hasInterested = true;
                } else {
                    opt.removeAttribute('data-interested');
                }
            });
            if (hasInterested) sel.classList.add('teacher-highlight');
            else sel.classList.remove('teacher-highlight');
        });

        //console.debug('applyTeacherInterestHighlighting: subject=', subject, 'interested=', Array.from(normInterested));
    }

    /**
 * Met à jour le surlignage des options des selects d'enseignants selon la matière donnée.
  * Si subject est vide, enlève tout surlignage.
  * @param {string} subject
  */
    highlightTeachersForSubject(subject) {
        const interested = new Set(this.getInterestedTeachersForMatiere(subject));

        ['inputEnseignant1', 'inputEnseignant2'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;

            // Marquer les options via data-interested et gérer la classe sur le select
            let hasInterested = false;
            Array.from(sel.options).forEach(opt => {
                const teacherName = opt.getAttribute('data-teacher') || opt.value;
                if (!teacherName) {
                    // placeholder, s'assurer que l'attribut est retiré
                    opt.removeAttribute('data-interested');
                    return;
                }

                if (interested.has(teacherName)) {
                    opt.setAttribute('data-interested', 'true');
                    hasInterested = true;
                } else {
                    opt.removeAttribute('data-interested');
                }
            });

            if (hasInterested) sel.classList.add('teacher-highlight');
            else sel.classList.remove('teacher-highlight');
        });
    }

    /**
     * Peuple les listes déroulantes de salles
     */
    populateRoomSelects() {
        const selectSalle = document.getElementById('selectSalle');
        if (selectSalle) {
            const salles = Object.keys(getState().sallesInfo || {}).sort();
            const currentValue = selectSalle.value;

            // Construire via populateSelectSafe pour éviter innerHTML
            const items = ['__NOSALLE__'].concat(salles); // sentinel for "Sans salle"
            populateSelectSafe(selectSalle, items,
                s => (s === '__NOSALLE__' ? '' : s),
                s => (s === '__NOSALLE__' ? 'Sans salle' : `${s} (${(getState().sallesInfo || {})[s]})`),
                null, '-- Sélectionner --');

            // Restaurer la valeur sélectionnée si elle existe toujours
            if (currentValue && salles.includes(currentValue)) {
                selectSalle.value = currentValue;
            }
        }
    }

    /**
     * Peuple les selects du formulaire de souhaits
     */
    populateWishesSelects() {
        const enseignants = getState().enseignants || [];
        const matieres = Object.keys(getState().matiereGroupes || {});

        // Select enseignant
        const selectEns = document.getElementById('selectEnseignantSouhaits');
        if (selectEns) {
            populateSelectSafe(selectEns, enseignants, e => e, e => e, null, '-- Sélectionner un enseignant --');
        }

        // Selects matières
        const matiereSelects = ['inputChoix1', 'inputChoix2', 'inputChoix3'];
        matiereSelects.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                populateSelectSafe(select, matieres, m => m, m => m, null, '-- Sélectionner --');
            }
        });
    }

    /**
     * Initialise les onglets
     */
    initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;

                // Retirer la classe active de tous les boutons et panneaux
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

                // Activer le bouton et le panneau sélectionné
                button.classList.add('active');
                const targetPane = document.getElementById(`tab-${tabId}`);
                if (targetPane) {
                    targetPane.classList.add('active');
                }

                // Rafraîchir le contenu de l'onglet
                this.refreshTabContent(tabId);
                // Special-case: when opening Configuration, ensure at least one subtab is active.
                if (tabId === 'config') {
                    try {
                        const configPane = document.getElementById('tab-config');
                        if (configPane) {
                            const anyActiveSub = configPane.querySelector('.sub-tab-btn.active') || configPane.querySelector('.sub-tab-pane.active');
                            if (!anyActiveSub) {
                                // Try to activate a logical default subtab: planification if present, else forfaits, else first
                                const prefer = configPane.querySelector('.sub-tab-btn[data-subtab="planification"]') ||
                                    configPane.querySelector('.sub-tab-btn[data-subtab="forfaits"]') ||
                                    configPane.querySelector('.sub-tab-btn');
                                if (prefer && typeof prefer.click === 'function') prefer.click();
                            }
                        }
                    } catch (e) {
                        console.debug('initializeTabs: config default subtab activation failed', e);
                    }
                }
            });
        });
    }

    // Remplacez uniquement la fonction initializeSubTabs() existante par ce bloc

    initializeSubTabs() {
        const subTabButtons = document.querySelectorAll('.sub-tab-btn');

        subTabButtons.forEach(button => {
            // éviter d'attacher plusieurs fois
            if (button._initSubtabAttached) return;
            button._initSubtabAttached = true;

            button.addEventListener('click', () => {
                // Lire la valeur data-subtab (tolérant aux deux formes : "enseignants" ou "subtab-enseignants")
                const raw = button.dataset.subtab || button.getAttribute('data-subtab');
                if (!raw) return;

                // Normaliser l'id du pane : utiliser tel quel si commence par 'subtab-', sinon préfixer
                const targetPaneId = String(raw).startsWith('subtab-') ? String(raw) : `subtab-${String(raw)}`;

                // Retirer la classe active/affichage de tous les boutons et panneaux
                document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.sub-tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                    // essayer de garder compatibilité avec les renderers qui utilisent style.display
                    try { pane.style.display = 'none'; } catch (e) { /* noop */ }
                });

                // Activer le bouton cliqué
                button.classList.add('active');

                // Activer le panneau correspondant (recherche tolérante)
                let targetPane = document.getElementById(targetPaneId);
                if (!targetPane) {
                    // fallback : chercher un pane dont l'id contient la valeur raw (pratique si les ids diffèrent légèrement)
                    const fallback = Array.from(document.querySelectorAll('.sub-tab-pane')).find(p => {
                        const pid = p.id || p.getAttribute('data-subtab-id') || p.getAttribute('data-subtab') || '';
                        return pid === raw || pid === targetPaneId || (pid && pid.indexOf(raw) !== -1);
                    });
                    if (fallback) targetPane = fallback;
                }

                if (targetPane) {
                    targetPane.classList.add('active');
                    try { targetPane.style.display = ''; } catch (e) { /* noop */ }
                } else {
                    console.warn('[initializeSubTabs] panneau cible introuvable pour', raw, targetPaneId);
                }

                // Rafraîchir le contenu du sous-onglet : appeler la méthode existante en lui passant l'identifiant "nu"
                // (refreshConfigSubTab attend des valeurs comme 'enseignants', 'matieres', 'forfaits', etc.)
                const logicalId = targetPaneId.replace(/^subtab-/, '');
                try {
                    this.refreshConfigSubTab(logicalId);
                } catch (e) {
                    // fallback silencieux si refreshConfigSubTab n'existe pas pour ce subtab
                    console.debug('refreshConfigSubTab non applicable pour', logicalId, e);
                }
            });
        });
    }

    /**
     * Rafraîchit le contenu d'un onglet
     * @param {string} tabId - L'ID de l'onglet
     */
    refreshTabContent(tabId) {
        switch (tabId) {
            case 'planning':
                TableRenderer.render();
                // If automatic planning nodes were moved into Config > Planification, restore them back
                try {
                    if (this._planningPanelMoved && Array.isArray(this._movedPlanningNodes) && this._movedPlanningNodes.length) {
                        const planPane = document.getElementById('tab-planning');
                        if (planPane) {
                            this._movedPlanningNodes.forEach(item => {
                                try {
                                    // restore to original parent/position if still detached
                                    if (item.node && (!item.node.parentNode || item.node.parentNode.id === 'subtab-planification')) {
                                        if (item.nextSibling && item.nextSibling.parentNode === item.originalParent) {
                                            item.originalParent.insertBefore(item.node, item.nextSibling);
                                        } else {
                                            item.originalParent.appendChild(item.node);
                                        }
                                    }
                                } catch (e) { /* noop */ }
                            });
                        }
                        // clear moved state
                        this._planningPanelMoved = false;
                        this._movedPlanningNodes = [];
                        // re-run attach listeners to ensure handlers still wired (idempotent guards inside)
                        try { this.attachAdvancedServiceListeners(); } catch (e) { /* noop */ }
                    }
                } catch (e) { console.debug('refreshTabContent restore planning nodes failed', e); }
                break;
            case 'dashboard':
                DashboardRenderer.render();
                break;
            case 'config':
                ConfigListRenderer.renderAll();
                break;
            case 'volumes':
                VolumeRenderer.render();
                break;
            case 'stats':
                StatsRenderer.render();
                break;
            case 'gestion':
                ListRenderer.renderAll();
                break;
            case 'salles':
                RoomManagementRenderer.render();
                break;
            case 'souhaits':
                WishesRenderer.render();
                this.populateWishesSelects();
                break;
        }
    }

    /**
     * Rafraîchit le contenu d'un sous-onglet de configuration
     * @param {string} subtabId - L'ID du sous-onglet
     */
    refreshConfigSubTab(subtabId) {
        switch (subtabId) {
            case 'enseignants':
                ConfigListRenderer.renderEnseignantsList();
                break;
            case 'matieres':
                ConfigListRenderer.renderMatieresList();
                break;
            case 'salles':
                ConfigListRenderer.renderSallesList();
                break;
            case 'filieres':
                ConfigListRenderer.renderFilieresList();
                break;
            case 'forfaits':
                ConfigListRenderer.renderForfaitsList();
                this.populateForfaitSelects();
                break;
            case 'planification':
                // Ensure subtab pane exists
                try {
                    let planifPane = document.getElementById('subtab-planification');
                    const configPane = document.getElementById('tab-config');
                    if (!planifPane && configPane) {
                        planifPane = document.createElement('div');
                        planifPane.id = 'subtab-planification';
                        planifPane.className = 'sub-tab-pane';
                        planifPane.style.display = 'none';
                        configPane.appendChild(planifPane);
                    }

                    // Find source nodes in Planning tab and prefer to MOVE them if present.
                    // However if the original markup was removed from the DOM (deleted from index.html),
                    // we must recreate the controls inside the config subtab so they remain available there.
                    const selectorsToMove = [
                        '.planning-options-panel',
                        '.planning-actions',
                        '#optimizationOptionsPanel'
                    ];

                    // Remember moved nodes only when actually moving existing DOM nodes.
                    if (!this._planningPanelMoved) {
                        this._movedPlanningNodes = [];
                        let foundAny = false;

                        selectorsToMove.forEach(sel => {
                            try {
                                const nodes = Array.from(document.querySelectorAll(`#tab-planning ${sel}, ${sel}`));
                                if (nodes && nodes.length) foundAny = true;
                                nodes.forEach(node => {
                                    if (!node) return;
                                    // record original position (for possible restoration)
                                    const record = {
                                        node,
                                        originalParent: node.parentNode,
                                        nextSibling: node.nextSibling || null
                                    };
                                    // move node into planifPane
                                    // planifPane.appendChild(node);
                                    this.safeAppendChild(planifPane, node);
                                    this._movedPlanningNodes.push(record);
                                });
                            } catch (e) { console.debug('refreshConfigSubTab move selector failed', sel, e); }
                        });

                        // If nothing was found in the DOM (markup removed), create a safe minimal copy from template
                        // only if the target pane doesn't already contain the main controls.
                        if (!foundAny && !planifPane.querySelector('#btnAutoGenerateAll')) {
                            try {
                                const tmpl = `
                                    <div class="planning-options-panel">
                                        <h3>⚙️ Options de Génération</h3>
                                        <label><input type="checkbox" id="optionAssignTeachers" checked> Attribuer automatiquement les enseignants</label>
                                        <label><input type="checkbox" id="optionAssignRooms" checked> Attribuer automatiquement les salles</label>
                                        <label><input type="checkbox" id="optionRespectWishes" checked> Respecter les souhaits des enseignants</label>
                                        <label><input type="checkbox" id="optionAvoidConflicts" checked> Éviter les conflits</label>
                                    </div>
                                    <div class="planning-actions">
                                        <button id="btnAutoGenerateAll" class="btn btn-primary">🚀 Générer Toutes les Séances</button>

                                        <div id="optimizationOptionsPanel" style="display:none; margin-top:10px;">
                                            <!-- minimal placeholder for options avancées (can be expanded) -->
                                            <div style="padding:10px; background:#f8f9fa; border-radius:6px;">
                                                <strong>Options d'optimisation</strong>
                                                <div style="font-size:0.9em; color:#6c757d; margin-top:6px;">(Détails disponibles dans Configuration → Planification)</div>
                                            </div>
                                            <div style="margin-top:8px; display:flex; gap:8px;">
                                                <button id="btnResetOptOptions" class="btn btn-secondary">Réinitialiser</button>
                                                <button id="btnCloseOptOptions" class="btn btn-secondary">Fermer</button>
                                            </div>
                                        </div>

                                        <div style="display:flex; gap:10px; margin-top:10px;">
                                            <button id="btnShowOptOptions" class="btn btn-secondary">⚙️ Options avancées</button>
                                            <button id="btnOptimizeSchedule" class="btn btn-primary">✨ Optimiser l'EDT</button>
                                            <button id="btnResolveConflicts" class="btn btn-warning">🔧 Résoudre les Conflits</button>
                                        </div>
                                    </div>
                                `;
                                const frag = document.createRange().createContextualFragment(tmpl);
                                this.safeAppendChild(planifPane, frag);
                                console.info('refreshConfigSubTab: inserted planning controls template into Config > Planification');
                                // No original nodes to restore later, but we mark as "moved" so we don't duplicate next time.
                                this._planningPanelMoved = true;
                            } catch (e) {
                                console.warn('refreshConfigSubTab: failed to insert planning template', e);
                            }
                        } else if (this._movedPlanningNodes.length) {
                            this._planningPanelMoved = true;
                            console.info('refreshConfigSubTab: moved planning nodes into Config > Planification', this._movedPlanningNodes.length);
                        }

                        // Re-attach advanced listeners to ensure handlers point to the controls now present in planifPane
                        try { this.attachAdvancedServiceListeners(); } catch (e) { /* noop */ }
                        // Ensure the "Options avancées" button works inside the moved planifPane.
                        try {
                            const localBtnShow = planifPane.querySelector('#btnShowOptOptions') || document.getElementById('btnShowOptOptions');
                            const localOptPanel = planifPane.querySelector('#optimizationOptionsPanel') || document.getElementById('optimizationOptionsPanel');
                            const localBtnClose = planifPane.querySelector('#btnCloseOptOptions') || document.getElementById('btnCloseOptOptions');
                            const localBtnReset = planifPane.querySelector('#btnResetOptOptions') || document.getElementById('btnResetOptOptions');

                            if (localBtnShow && localOptPanel && !localBtnShow._planifOptAttached) {
                                localBtnShow.addEventListener('click', (ev) => {
                                    ev.preventDefault();
                                    const computed = getComputedStyle(localOptPanel).display;
                                    const isHidden = (localOptPanel.style.display === 'none' || computed === 'none');
                                    localOptPanel.style.display = isHidden ? 'block' : 'none';
                                    if (isHidden) {
                                        try { localOptPanel.scrollIntoView({ behavior: 'smooth' }); } catch (e) { /* noop */ }
                                    }
                                });
                                localBtnShow._planifOptAttached = true;
                            }

                            if (localBtnClose && localOptPanel && !localBtnClose._planifOptAttached) {
                                localBtnClose.addEventListener('click', (ev) => {
                                    ev.preventDefault();
                                    try { localOptPanel.style.display = 'none'; } catch (e) { /* noop */ }
                                });
                                localBtnClose._planifOptAttached = true;
                            }

                            if (localBtnReset && localOptPanel && !localBtnReset._planifOptAttached) {
                                localBtnReset.addEventListener('click', (ev) => {
                                    ev.preventDefault();
                                    try {
                                        // Best-effort reset: restore form controls inside the optimization panel to their defaults
                                        localOptPanel.querySelectorAll('input, select, textarea').forEach(inp => {
                                            if (inp.type === 'checkbox' || inp.type === 'radio') {
                                                inp.checked = !!inp.defaultChecked;
                                            } else if (typeof inp.defaultValue !== 'undefined') {
                                                inp.value = inp.defaultValue;
                                            }
                                        });
                                        // Reinitialize advanced options via SchedulingHandlers if available
                                        if (SchedulingHandlers && typeof SchedulingHandlers.initAdvancedOptions === 'function') {
                                            try { SchedulingHandlers.initAdvancedOptions(); } catch (e) { /* noop */ }
                                        }
                                    } catch (e) { /* noop */ }
                                });
                                localBtnReset._planifOptAttached = true;
                            }
                        } catch (e) {
                            console.debug('refreshConfigSubTab: attach planification options handlers failed', e);
                        }
                    }

                    // Ensure pane is visible (the initializeSubTabs click handler will handle activation visual)
                    if (planifPane) {
                        try { planifPane.style.display = ''; } catch (e) { /* noop */ }
                    }
                } catch (err) {
                    console.warn('refreshConfigSubTab(planification) encountered an error', err);
                }
                break;
        }
    }

    /**
     * Attache les event listeners principaux
     */
    attachEventListeners() {
        // Bouton de sauvegarde
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                StateManager.saveState();
                NotificationManager.success('Données sauvegardées');
            });
        }

        // Bouton clear log
        const clearLogBtn = document.getElementById('btnClearLog');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                LogService.clear();
            });
        }

        // Changement de session
        const selectSession = document.getElementById('selectSession');
        if (selectSession) {
            selectSession.addEventListener('change', (e) => {
                this.handleSessionChange(e.target.value);
            });
        }

        // Changement d'année universitaire
        const inputAnnee = document.getElementById('inputAnneeUniversitaire');
        if (inputAnnee) {
            inputAnnee.addEventListener('change', (e) => {
                const state = getState();
                if (!state.header) state.header = {};
                state.header.annee = e.target.value;
                StateManager.saveState();
                LogService.info(`Année universitaire mise à jour: ${e.target.value}`);
            });
        }

        // Changement de département
        const selectDept = document.getElementById('selectDepartement');
        if (selectDept) {
            selectDept.addEventListener('change', (e) => {
                const state = getState();
                if (!state.header) state.header = {};
                state.header.departement = e.target.value;
                StateManager.saveState();
                LogService.info(`Département mis à jour: ${e.target.value}`);
            });
        }

        // Bouton export projet
        const btnExportProject = document.getElementById('btnExportProject');
        if (btnExportProject) {
            btnExportProject.addEventListener('click', () => {
                this.exportProject();
            });
        }

        // Bouton import projet
        const btnImportProject = document.getElementById('btnImportProject');
        const fileImportProject = document.getElementById('fileImportProject');
        if (btnImportProject && fileImportProject) {
            btnImportProject.addEventListener('click', () => {
                fileImportProject.click();
            });

            fileImportProject.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importProject(file);
                    e.target.value = '';
                }
            });
        }

        // Bouton reset EDT
        const btnResetEDT = document.getElementById('btnResetEDT');
        if (btnResetEDT) {
            btnResetEDT.addEventListener('click', () => {
                this.resetCurrentSessionEDT();
            });
        }

        // Bouton reset projet complet
        const btnResetProject = document.getElementById('btnResetProject');
        if (btnResetProject) {
            btnResetProject.addEventListener('click', () => {
                this.resetProject();
            });
        }
    }

    /**
     * Attache les event listeners des services avancés
     */
    attachAdvancedServiceListeners() {
        // === PLANIFICATION AUTOMATIQUE ===
        const btnAutoGenerate = document.getElementById('btnAutoGenerateAll');
        if (btnAutoGenerate) {
            btnAutoGenerate.addEventListener('click', () => {
                SchedulingHandlers.generateAllSessions();
            });
        }

        const btnOptimize = document.getElementById('btnOptimizeSchedule');
        if (btnOptimize) {
            btnOptimize.addEventListener('click', () => {
                SchedulingHandlers.optimizeSchedule();
            });
        }

        const btnResolveConflicts = document.getElementById('btnResolveConflicts');
        if (btnResolveConflicts) {
            btnResolveConflicts.addEventListener('click', () => {
                SchedulingHandlers.resolveConflicts();
            });
        }

        // ✅ NOUVEAU : Initialiser les options avancées d'optimisation
        SchedulingHandlers.initAdvancedOptions();

        // === EXPORT ===
        const btnExportPDF = document.getElementById('btnExportPDF');
        if (btnExportPDF) {
            btnExportPDF.addEventListener('click', () => {
                ExportHandlers.showPDFExportDialog();
            });
        }

        const btnExportExcel = document.getElementById('btnExportExcel');
        if (btnExportExcel) {
            btnExportExcel.addEventListener('click', () => {
                ExportHandlers.showExcelExportDialog();
            });
        }
        // Export emplois du temps des enseignants
        const btnExportTeachersSchedules = document.getElementById('btnExportTeachersSchedules');
        if (btnExportTeachersSchedules) {
            btnExportTeachersSchedules.addEventListener('click', () => {
                ExportHandlers.exportTeachersSchedules();
            });
        }

        const btnExportVolumes = document.getElementById('btnExportVolumes');
        if (btnExportVolumes) {
            btnExportVolumes.addEventListener('click', () => {
                ExportHandlers.exportVolumes();
            });
        }

        const btnExportForfaits = document.getElementById('btnExportForfaits');
        if (btnExportForfaits) {
            btnExportForfaits.addEventListener('click', () => {
                ExportHandlers.exportForfaits();
            });
        }

        // === IMPORT (onglet rapports) ===
        const btnImportWishes = document.getElementById('btnImportWishes');
        const fileImportWishes = document.getElementById('fileImportWishes');

        if (btnImportWishes && fileImportWishes) {
            btnImportWishes.addEventListener('click', () => {
                ImportHandlers.triggerWishesImport();
            });

            fileImportWishes.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    ImportHandlers.importWishes(file);
                    e.target.value = '';
                }
            });
        }

        const btnImportSubjects = document.getElementById('btnImportSubjects');
        const fileImportSubjects = document.getElementById('fileImportSubjects');

        if (btnImportSubjects && fileImportSubjects) {
            btnImportSubjects.addEventListener('click', () => {
                ImportHandlers.triggerSubjectsImport();
            });

            fileImportSubjects.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    ImportHandlers.importSubjects(file);
                    e.target.value = '';
                }
            });
        }

        // Téléchargement des templates (onglet rapports)
        const btnDownloadWishesTemplate = document.getElementById('btnDownloadWishesTemplate');
        if (btnDownloadWishesTemplate) {
            btnDownloadWishesTemplate.addEventListener('click', () => {
                ImportHandlers.downloadWishesTemplate();
            });
        }

        const btnDownloadSubjectsTemplate = document.getElementById('btnDownloadSubjectsTemplate');
        if (btnDownloadSubjectsTemplate) {
            btnDownloadSubjectsTemplate.addEventListener('click', () => {
                ImportHandlers.downloadSubjectsTemplate();
            });
        }
    }

    /**
     * Attache les event listeners de l'onglet souhaits
     */
    attachWishesListeners() {
        // Import souhaits (onglet souhaits)
        const btnImportWishesMain = document.getElementById('btnImportWishesMain');
        const fileImportWishesMain = document.getElementById('fileImportWishesMain');

        if (btnImportWishesMain && fileImportWishesMain) {
            btnImportWishesMain.addEventListener('click', () => {
                fileImportWishesMain.click();
            });

            fileImportWishesMain.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    ImportHandlers.importWishes(file).then(() => {
                        WishesRenderer.render();
                    });
                    e.target.value = '';
                }
            });
        }

        const btnDownloadWishesTemplateMain = document.getElementById('btnDownloadWishesTemplateMain');
        if (btnDownloadWishesTemplateMain) {
            btnDownloadWishesTemplateMain.addEventListener('click', () => {
                ImportHandlers.downloadWishesTemplate();
            });
        }

        // Formulaire de souhaits manuel
        const formSouhaitsEnseignant = document.getElementById('formSouhaitsEnseignant');
        if (formSouhaitsEnseignant) {
            formSouhaitsEnseignant.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSaveWishes();
            });
        }

        const btnResetWishesForm = document.getElementById('btnResetWishesForm');
        if (btnResetWishesForm) {
            btnResetWishesForm.addEventListener('click', () => {
                this.resetWishesForm();
            });
        }

        const selectEnseignantSouhaits = document.getElementById('selectEnseignantSouhaits');
        if (selectEnseignantSouhaits) {
            selectEnseignantSouhaits.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.loadTeacherWishes(e.target.value);
                }
            });
        }
    }

    /**
     * Charge les souhaits d'un enseignant dans le formulaire
     * @param {string} nom - Le nom de l'enseignant
     */
    loadTeacherWishes(nom) {
        const state = getState();
        const souhaits = (state.enseignantSouhaits && state.enseignantSouhaits[nom]) || {};

        setInputValue('selectEnseignantSouhaits', nom);
        setInputValue('inputChoix1', souhaits.choix1 || '');
        setInputValue('inputC1', souhaits.c1 || '');
        setInputValue('inputTD1', souhaits.td1 || '');
        setInputValue('inputTP1', souhaits.tp1 || '');
        setInputValue('inputChoix2', souhaits.choix2 || '');
        setInputValue('inputC2', souhaits.c2 || '');
        setInputValue('inputTD2', souhaits.td2 || '');
        setInputValue('inputTP2', souhaits.tp2 || '');
        setInputValue('inputChoix3', souhaits.choix3 || '');
        setInputValue('inputC3', souhaits.c3 || '');
        setInputValue('inputTD3', souhaits.td3 || '');
        setInputValue('inputTP3', souhaits.tp3 || '');
        setInputValue('inputContraintes', souhaits.contraintes || 'Aucune remarque.');

        // Scroll vers le formulaire
        const form = document.getElementById('formSouhaitsEnseignant');
        if (form && typeof form.scrollIntoView === 'function') {
            form.scrollIntoView({ behavior: 'smooth' });
        }
    }
    /**
      * Rend un petit tableau résumé des souhaits d'un enseignant
      * Affiché dans le formulaire d'ajout de séance quand un enseignant est sélectionné.
      * @param {string} enseignant
      */
    renderTeacherWishes(enseignant) {
        const container = document.getElementById('teacherWishesPreview');
        if (!container) return;

        // Reset safely
        while (container.firstChild) container.removeChild(container.firstChild);

        if (!enseignant) return;

        const souhaits = ((getState().enseignantSouhaits) && getState().enseignantSouhaits[enseignant]) || {};

        // Construire tableau si des souhaits ont été exprimés
        const choixRows = [];
        for (let i = 1; i <= 3; i++) {
            const nomChoix = souhaits[`choix${i}`];
            const c = souhaits[`c${i}`];
            const td = souhaits[`td${i}`];
            const tp = souhaits[`tp${i}`];

            if (nomChoix || (c || td || tp)) {
                choixRows.push({
                    nom: nomChoix || `Choix ${i}`,
                    c: (c !== undefined && c !== null && c !== '') ? Number(c) : '-',
                    td: (td !== undefined && td !== null && td !== '') ? Number(td) : '-',
                    tp: (tp !== undefined && tp !== null && tp !== '') ? Number(tp) : '-'
                });
            }
        }

        const section = document.createElement('div');
        section.className = 'form-section';

        const h4 = document.createElement('h4');
        h4.textContent = `Souhaits — ${enseignant}`;
        section.appendChild(h4);

        if (choixRows.length === 0 && !souhaits.contraintes) {
            const p = document.createElement('p');
            p.className = 'empty-message';
            p.textContent = 'Aucun souhait explicite pour cet enseignant.';
            section.appendChild(p);
        } else {
            const table = document.createElement('table');
            table.className = 'wishes-preview-table';
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';

            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            ['Choix', 'Cours', 'TD', 'TP'].forEach(text => {
                const th = document.createElement('th');
                th.style.textAlign = 'left';
                th.style.padding = '6px';
                th.style.borderBottom = '1px solid #e9ecef';
                th.textContent = text;
                headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            choixRows.forEach(row => {
                const tr = document.createElement('tr');
                const tdNom = document.createElement('td');
                tdNom.style.padding = '6px';
                tdNom.style.borderBottom = '1px solid #f1f3f5';
                tdNom.textContent = row.nom;
                tr.appendChild(tdNom);

                const tdC = document.createElement('td');
                tdC.style.padding = '6px';
                tdC.style.borderBottom = '1px solid #f1f3f5';
                tdC.style.textAlign = 'center';
                tdC.textContent = String(row.c);
                tr.appendChild(tdC);

                const tdTd = document.createElement('td');
                tdTd.style.padding = '6px';
                tdTd.style.borderBottom = '1px solid #f1f3f5';
                tdTd.style.textAlign = 'center';
                tdTd.textContent = String(row.td);
                tr.appendChild(tdTd);

                const tdTp = document.createElement('td');
                tdTp.style.padding = '6px';
                tdTp.style.borderBottom = '1px solid #f1f3f5';
                tdTp.style.textAlign = 'center';
                tdTp.textContent = String(row.tp);
                tr.appendChild(tdTp);

                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            section.appendChild(table);

            if (souhaits.contraintes) {
                const div = document.createElement('div');
                div.style.marginTop = '8px';
                div.style.color = '#6c757d';
                const strong = document.createElement('strong');
                strong.textContent = 'Contraintes : ';
                div.appendChild(strong);
                const span = document.createElement('span');
                // sanitize contraintes using DOMPurify if available
                const constraintsText = (typeof DOMPurify !== 'undefined' && DOMPurify && DOMPurify.sanitize)
                    ? DOMPurify.sanitize(String(souhaits.contraintes))
                    : String(souhaits.contraintes);
                // assign as textContent to avoid HTML injection
                span.textContent = constraintsText;
                div.appendChild(span);
                section.appendChild(div);
            }
        }

        container.appendChild(section);
    }

    /**
     * Sauvegarde les souhaits saisis manuellement
     */
    handleSaveWishes() {
        const nom = document.getElementById('selectEnseignantSouhaits') ? document.getElementById('selectEnseignantSouhaits').value : '';

        if (!nom) {
            DialogManager.error('Veuillez sélectionner un enseignant.');
            return;
        }

        const souhaits = {
            choix1: document.getElementById('inputChoix1') ? document.getElementById('inputChoix1').value : '',
            c1: parseFloat(document.getElementById('inputC1') ? document.getElementById('inputC1').value : '') || 0,
            td1: parseFloat(document.getElementById('inputTD1') ? document.getElementById('inputTD1').value : '') || 0,
            tp1: parseFloat(document.getElementById('inputTP1') ? document.getElementById('inputTP1').value : '') || 0,
            choix2: document.getElementById('inputChoix2') ? document.getElementById('inputChoix2').value : '',
            c2: parseFloat(document.getElementById('inputC2') ? document.getElementById('inputC2').value : '') || 0,
            td2: parseFloat(document.getElementById('inputTD2') ? document.getElementById('inputTD2').value : '') || 0,
            tp2: parseFloat(document.getElementById('inputTP2') ? document.getElementById('inputTP2').value : '') || 0,
            choix3: document.getElementById('inputChoix3') ? document.getElementById('inputChoix3').value : '',
            c3: parseFloat(document.getElementById('inputC3') ? document.getElementById('inputC3').value : '') || 0,
            td3: parseFloat(document.getElementById('inputTD3') ? document.getElementById('inputTD3').value : '') || 0,
            tp3: parseFloat(document.getElementById('inputTP3') ? document.getElementById('inputTP3').value : '') || 0,
            contraintes: document.getElementById('inputContraintes') ? document.getElementById('inputContraintes').value : 'Aucune remarque.'
        };

        const state = getState();
        if (!state.enseignantSouhaits) state.enseignantSouhaits = {};
        state.enseignantSouhaits[nom] = souhaits;
        StateManager.saveState();

        LogService.success(`✅ Souhaits de ${nom} enregistrés`);
        NotificationManager.success('Souhaits enregistrés');
        WishesRenderer.render();
        this.resetWishesForm();
    }

    /**
     * Réinitialise le formulaire de souhaits
     */
    resetWishesForm() {
        const form = document.getElementById('formSouhaitsEnseignant');
        if (form && typeof form.reset === 'function') form.reset();
    }

    /**
     * Initialise le renderer de tableau
     */
    initializeTableRenderer() {
        // Initialiser le sélecteur de vue
        const selectView = document.getElementById('selectEDTView');
        if (selectView) {
            selectView.addEventListener('change', (e) => {
                TableRenderer.setFilter(e.target.value);
                this.renderAll();
            });
        }

        // Initialiser les filtres de recherche
        const searchInputs = {
            searchMatiere: 'matiere',
            searchEnseignant: 'enseignant',
            searchSalle: 'salle',
            searchSectionGroupe: 'sectionGroupe'
        };

        Object.entries(searchInputs).forEach(([inputId, filterKey]) => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    const filters = {};
                    Object.entries(searchInputs).forEach(([id, key]) => {
                        filters[key] = document.getElementById(id)?.value || '';
                    });
                    TableRenderer.setSearchFilters(filters);
                    this.renderAll();
                });
            }
        });

        // Bouton clear filters
        const btnClearFilters = document.getElementById('btnClearFilters');
        if (btnClearFilters) {
            btnClearFilters.addEventListener('click', () => {
                Object.keys(searchInputs).forEach(id => {
                    const input = document.getElementById(id);
                    if (input) input.value = '';
                });
                TableRenderer.setSearchFilters({
                    matiere: '',
                    enseignant: '',
                    salle: '',
                    sectionGroupe: ''
                });
                this.renderAll();
                NotificationManager.info('Filtres réinitialisés', 2000);
            });
        }
    }

    /**
     * Gère le changement de session
     * @param {string} newSession - La nouvelle session
     */
    handleSessionChange(newSession) {
        const oldSession = getState().header ? getState().header.session : undefined;

        if (oldSession === newSession) return;

        DialogManager.confirm(
            'Changer de Session',
            `Voulez-vous vraiment passer à <strong>${newSession}</strong> ?<br><br>L'emploi du temps actuel sera sauvegardé.`,
            () => {
                SpinnerManager.show();

                setTimeout(() => {
                    StateManager.changeSession(newSession);
                    this.populateFormSelects();
                    this.renderAll();
                    SpinnerManager.hide();
                    NotificationManager.success(`Session changée : ${newSession}`);
                }, 300);
            },
            () => {
                const sel = document.getElementById('selectSession');
                if (sel && typeof sel.value !== 'undefined') sel.value = oldSession;
            }
        );
    }

    /**
     * S'abonne aux événements d'état
     */
    subscribeToStateEvents() {
        StateManager.subscribe('seance:added', () => {
            this.renderAll();
        });

        StateManager.subscribe('seance:removed', () => {
            this.renderAll();
        });

        StateManager.subscribe('seance:updated', () => {
            this.renderAll();
        });

        StateManager.subscribe('seance:moved', () => {
            this.renderAll();
        });

        StateManager.subscribe('session:changed', () => {
            // ✅ Rafraîchir le sélecteur de vue EDT
            this.populateEDTViewSelector();
            this.renderAll();
        });

        StateManager.subscribe('teacher:added', () => {
            this.populateTeacherSelects();
            this.populateWishesSelects();
            this.populateForfaitSelects();
            ConfigListRenderer.renderEnseignantsList();
            this.renderAll();
        });

        StateManager.subscribe('teacher:removed', () => {
            this.populateTeacherSelects();
            this.populateWishesSelects();
            this.populateForfaitSelects();
            ConfigListRenderer.renderEnseignantsList();
            this.renderAll();
        });

        StateManager.subscribe('subject:added', () => {
            this.populateFormSelects();
            ConfigListRenderer.renderMatieresList();
            this.renderAll();
        });

        StateManager.subscribe('subject:removed', () => {
            this.populateFormSelects();
            ConfigListRenderer.renderMatieresList();
            this.renderAll();
        });

        StateManager.subscribe('forfait:added', () => {
            ConfigListRenderer.renderForfaitsList();
            this.renderAll();
        });

        StateManager.subscribe('forfait:updated', () => {
            ConfigListRenderer.renderForfaitsList();
            this.renderAll();
        });

        StateManager.subscribe('forfait:deleted', () => {
            ConfigListRenderer.renderForfaitsList();
            this.renderAll();
        });

        StateManager.subscribe('edt:reset', () => {
            this.renderAll();
        });

        StateManager.subscribe('project:reset', () => {
            this.populateFormSelects();
            this.renderAll();
        });

        // Écoute événement custom émis par ExamRoomAllocator lors d'une mise à jour
        try {
            document.addEventListener('exam:room-config-updated', (e) => {
                try {
                    // Re-render des examens afin que l'UI reflète la nouvelle répartition
                    ExamRenderer && typeof ExamRenderer.render === 'function' && ExamRenderer.render();
                    // Sauvegarder l'état (l'allocator appelle déjà saveState mais on double-check)
                    StateManager.saveState && StateManager.saveState();
                    // notification utilisateur non intrusive
                    NotificationManager && typeof NotificationManager.success === 'function' && NotificationManager.success('Répartition des salles mise à jour', 1200);
                } catch (err) {
                    console.warn('Handler exam:room-config-updated failed', err);
                }
            });
        } catch (err) {
            console.debug('Failed to attach exam:room-config-updated listener', err);
        }
    }

    /**
     * Rafraîchit toute l'interface
     */
    renderAll() {
        console.log('🔄 Rafraîchissement de l\'interface...');

        // Rendre le tableau EDT
        TableRenderer.render();

        // Rendre les volumes
        VolumeRenderer.render();

        // Rendre les stats
        StatsRenderer.render();

        // Rendre les examens
        try { ExamRenderer.render(); } catch (e) { /* noop */ }

        // Rendre les listes
        ListRenderer.renderAll();

        // Rendre les souhaits
        WishesRenderer.render();

        // Rendre les listes de configuration
        ConfigListRenderer.renderAll();

        // Sauvegarder automatiquement
        this.debouncedSaveState();
    }

    /**
     * Bascule vers l'onglet Configuration
     */
    switchToConfigTab() {
        // Activer l'onglet Configuration
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

        const configBtn = document.querySelector('.tab-btn[data-tab="config"]');
        const configPane = document.getElementById('tab-config');

        if (configBtn) configBtn.classList.add('active');
        if (configPane) configPane.classList.add('active');

        // Scroll vers le haut de la page
        window.scrollTo({ top: 0, behavior: 'smooth' });

        NotificationManager.info('Utilisez les formulaires ci-dessous pour ajouter des ressources', 3000);
    }

    /**
     * Édite les souhaits d'un enseignant
     * @param {string} nom - Le nom de l'enseignant
     */
    editTeacherWishes(nom) {
        // Activer l'onglet Souhaits
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

        const souhaitBtn = document.querySelector('.tab-btn[data-tab="souhaits"]');
        const souhaitPane = document.getElementById('tab-souhaits');

        if (souhaitBtn) souhaitBtn.classList.add('active');
        if (souhaitPane) souhaitPane.classList.add('active');

        // Charger les souhaits de l'enseignant
        setTimeout(() => {
            this.loadTeacherWishes(nom);
        }, 100);

        NotificationManager.info(`Modification des souhaits de ${nom}`, 3000);
    }

    /**
     * Supprime un enseignant
     * @param {string} nom - Le nom de l'enseignant
     */
    deleteEnseignant(nom) {
        TeacherController.removeTeacher(nom);
    }

    /**
     * Supprime une matière
     * @param {string} nom - Le nom de la matière
     */
    deleteMatiere(nom) {
        SubjectController.removeSubject(nom);
    }

    /**
     * Supprime une salle
     * @param {string} nom - Le nom de la salle
     */
    deleteSalle(nom) {
        RoomController.removeRoom(nom);
    }

    /**
     * Supprime une filière
     * @param {string} nom - Le nom de la filière
     */
    deleteFiliere(nom) {
        const filiere = (getState().filieres || []).find(f => f.nom === nom);
        if (!filiere) return;

        // Vérifier s'il y a des matières associées
        const matieres = Object.keys(getState().matiereGroupes || {}).filter(m =>
            (getState().matiereGroupes[m].filiere || '') === nom
        );

        if (matieres.length > 0) {
            DialogManager.warning(
                `La filière <strong>${nom}</strong> est utilisée par ${matieres.length} matière(s).<br><br>
                Voulez-vous vraiment la supprimer ?<br>
                <em>Les matières seront conservées mais sans filière.</em>`,
                () => {
                    this.performDeleteFiliere(nom);
                }
            );
        } else {
            DialogManager.confirm(
                'Supprimer la Filière',
                `Voulez-vous vraiment supprimer <strong>${nom}</strong> ?`,
                () => {
                    this.performDeleteFiliere(nom);
                }
            );
        }
    }

    /**
     * Effectue la suppression de la filière
     * @param {string} nom - Le nom de la filière
     */
    performDeleteFiliere(nom) {
        const filieres = getState().filieres || [];
        const index = filieres.findIndex(f => f.nom === nom);
        if (index > -1) {
            filieres.splice(index, 1);

            // Retirer la filière des matières associées
            Object.keys(getState().matiereGroupes || {}).forEach(matiere => {
                if ((getState().matiereGroupes[matiere].filiere || '') === nom) {
                    getState().matiereGroupes[matiere].filiere = '';
                }
            });

            LogService.success(`✅ Filière "${nom}" supprimée`);
            NotificationManager.success('Filière supprimée');
            StateManager.saveState();
            this.populateFormSelects();
            ConfigListRenderer.renderFilieresList();
            this.renderAll();
        }
    }

    /**
     * Gère la soumission du formulaire de forfait
     * @param {Event} e - L'événement de soumission
     */
    handleForfaitFormSubmit(e) {
        e.preventDefault();

        const enseignant = document.getElementById('selectEnseignantForfait') ? document.getElementById('selectEnseignantForfait').value : '';
        const nature = document.getElementById('selectNatureForfait') ? document.getElementById('selectNatureForfait').value : '';
        const volumeHoraire = document.getElementById('inputVolumeHoraireForfait') ? document.getElementById('inputVolumeHoraireForfait').value : '';
        const description = document.getElementById('inputDescriptionForfait') ? document.getElementById('inputDescriptionForfait').value : '';

        const editingId = document.getElementById('formAjouterForfait') ? document.getElementById('formAjouterForfait').dataset.editingId : undefined;

        if (editingId) {
            // Mode édition
            const success = ForfaitController.updateForfait(editingId, {
                nature,
                volumeHoraire,
                description
            });

            if (success) {
                this.resetForfaitForm();
                this.cancelForfaitEdit();
            }
        } else {
            // Mode ajout
            const forfait = ForfaitController.addForfait({
                enseignant,
                nature,
                volumeHoraire,
                description
            });

            if (forfait) {
                this.resetForfaitForm();
            }
        }
    }

    /**
     * Réinitialise le formulaire de forfait
     */
    resetForfaitForm() {
        const form = document.getElementById('formAjouterForfait');
        if (form) {
            form.reset();
            delete form.dataset.editingId;
        }

        const btnCancel = document.getElementById('btnCancelForfaitEdit');
        const btnSubmit = document.getElementById('btnAjouterForfait');

        if (btnCancel) btnCancel.style.display = 'none';
        if (btnSubmit) btnSubmit.textContent = '➕ Ajouter le Forfait';

        // Réactiver le champ enseignant
        const selectEnseignant = document.getElementById('selectEnseignantForfait');
        if (selectEnseignant) selectEnseignant.disabled = false;
    }

    /**
     * Annule l'édition d'un forfait
     */
    cancelForfaitEdit() {
        this.resetForfaitForm();
        NotificationManager.info('Édition annulée', 2000);
    }

    /**
     * Édite un forfait
     * @param {string} id - L'ID du forfait
     */
    editForfait(id) {
        const forfaits = ForfaitController.getAllForfaits();
        const forfait = forfaits.find(f => f.id === id);

        if (!forfait) {
            DialogManager.error('Forfait introuvable');
            return;
        }

        // Activer le sous-onglet forfaits
        document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.sub-tab-pane').forEach(pane => pane.classList.remove('active'));

        const forfaitBtn = document.querySelector('.sub-tab-btn[data-subtab="forfaits"]');
        const forfaitPane = document.getElementById('subtab-forfaits');

        if (forfaitBtn) forfaitBtn.classList.add('active');
        if (forfaitPane) forfaitPane.classList.add('active');

        // Remplir le formulaire
        const form = document.getElementById('formAjouterForfait');
        const selectEnseignant = document.getElementById('selectEnseignantForfait');
        const selectNature = document.getElementById('selectNatureForfait');
        const inputVolume = document.getElementById('inputVolumeHoraireForfait');
        const inputDescription = document.getElementById('inputDescriptionForfait');

        if (selectEnseignant) {
            selectEnseignant.value = forfait.enseignant;
            selectEnseignant.disabled = true; // Empêcher le changement d'enseignant
        }
        if (selectNature) selectNature.value = forfait.nature;
        if (inputVolume) inputVolume.value = forfait.volumeHoraire;
        if (inputDescription) inputDescription.value = forfait.description || '';

        // Mettre en mode édition
        if (form) form.dataset.editingId = id;

        const btnCancel = document.getElementById('btnCancelForfaitEdit');
        const btnSubmit = document.getElementById('btnAjouterForfait');

        if (btnCancel) btnCancel.style.display = 'inline-block';
        if (btnSubmit) btnSubmit.textContent = '💾 Mettre à jour le Forfait';

        // Scroll vers le formulaire
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });

        NotificationManager.info(`Édition du forfait de ${forfait.enseignant}`, 3000);
    }

    /**
     * Supprime un forfait (appelé depuis ConfigListRenderer)
     * @param {string} id - L'ID du forfait
     */
    deleteForfait(id) {
        ForfaitController.deleteForfait(id);
    }

    /**
     * Exporte le projet complet
     */
    exportProject() {
        try {
            const data = StorageService.exportProject();
            const jsonString = JSON.stringify(data, null, 2);

            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sauvegarde_edt_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            LogService.success('✅ Projet exporté avec succès');
            NotificationManager.success('Projet exporté');
        } catch (error) {
            LogService.error(`❌ Erreur lors de l'export: ${error.message}`);
            NotificationManager.error('Erreur lors de l\'export');
        }
    }

    /**
     * Importe un projet
     * @param {File} file - Le fichier à importer
     */
    async importProject(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    // Valider le schema avant toute importation destructrice
                    const validation = ValidationService.validateProjectSchema(data);
                    if (!validation.ok) {
                        const message = 'Fichier invalide: ' + validation.errors.join('; ');
                        LogService.error('Import validation failed: ' + validation.errors.join('; '));
                        NotificationManager.error('Import annulé — fichier invalide. Voir console pour détails.');
                        DialogManager.error(message);
                        reject(new Error('schema invalid'));
                        return;
                    }

                    DialogManager.confirm(
                        'Confirmer l\'Importation',
                        'Êtes-vous sûr de vouloir importer ce projet ?<br><strong>Tout votre travail actuel sera écrasé.</strong>',
                        () => {
                            SpinnerManager.show();

                            setTimeout(() => {
                                const success = StorageService.importProject(data);

                                if (success) {
                                    StateManager.loadState();
                                    initCreneaux(getState().creneaux);
                                    this.populateFormSelects();
                                    this.renderAll();
                                    SpinnerManager.hide();
                                    LogService.success('✅ Projet importé avec succès');
                                    NotificationManager.success('Projet importé');
                                    resolve(true);
                                } else {
                                    SpinnerManager.hide();
                                    LogService.error('❌ Erreur lors de l\'importation');
                                    NotificationManager.error('Erreur d\'importation');
                                    reject(new Error('Import failed'));
                                }
                            }, 500);
                        },
                        () => {
                            resolve(false);
                        }
                    );
                } catch (error) {
                    LogService.error(`❌ Erreur: ${error.message}`);
                    NotificationManager.error('Fichier invalide');
                    reject(error);
                }
            };

            reader.onerror = () => {
                LogService.error('❌ Erreur de lecture du fichier');
                NotificationManager.error('Erreur de lecture');
                reject(new Error('File read error'));
            };

            reader.readAsText(file);
        });
    }

    /**
     * Réinitialise l'EDT de la session actuelle
     */
    resetCurrentSessionEDT() {
        DialogManager.confirm(
            'Réinitialiser l\'EDT',
            `Voulez-vous vraiment <strong>supprimer toutes les séances</strong> de la session actuelle ?<br><br>Cette action est <strong>irréversible</strong>.`,
            () => {
                StateManager.resetCurrentSessionEDT();
                this.renderAll();
                LogService.warning('⚠️ EDT de la session réinitialisé');
                NotificationManager.warning('EDT réinitialisé');
            }
        );
    }

    /**
     * Réinitialise complètement le projet
     */
    resetProject() {
        DialogManager.confirm(
            'Réinitialiser le Projet Complet',
            `<strong style="color: red;">ATTENTION !</strong><br><br>Voulez-vous vraiment <strong>supprimer TOUTES les données</strong> du projet ?<br><br>Cela inclut :<br>
            - Toutes les séances (automne et printemps)<br>
            - Tous les enseignants<br>
            - Toutes les matières<br>
            - Toutes les configurations<br><br>
            Cette action est <strong>IRRÉVERSIBLE</strong>.`,
            () => {
                StateManager.resetProject();
                initCreneaux(getState().creneaux);
                this.populateFormSelects();
                this.renderAll();
                LogService.warning('⚠️ Projet complètement réinitialisé');
                NotificationManager.warning('Projet réinitialisé');
            }
        );
    }
    /**
     * Force le rendu de l'onglet actif après le chargement asynchrone
     * (Méthode manquante à ajouter dans la classe EDTApplication)
     */
    forceInitialRender() {
        // Trouver l'onglet actif (stocké par TabPersistence ou par défaut)
        const activeTab = document.querySelector('.tab-btn.active');

        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            console.log(`🔄 Rendu forcé pour l'onglet actif : ${tabId}`);

            switch (tabId) {
                case 'emploitemps':
                    TableRenderer.render();
                    break;
                case 'examens':
                case 'salles-examen':
                    // Si vous utilisez ConfigListRenderer pour les salles d'examen
                    if (window.EDTConfigListRenderer) window.EDTConfigListRenderer.render();
                    // Si vous utilisez ExamRenderer pour la liste des examens
                    if (typeof ExamRenderer !== 'undefined') ExamRenderer.render();
                    break;
                case 'dashboard':
                    // Si le dashboard a une méthode render explicite
                    if (window.EDTDashboardController) window.EDTDashboardController.refreshData();
                    else if (this.initDashboard) this.initDashboard();
                    break;
                case 'enseignants':
                    if (window.EDTListRenderer) window.EDTListRenderer.renderTeachers();
                    break;
                case 'salles':
                    if (window.EDTListRenderer) window.EDTListRenderer.renderRooms();
                    break;
                case 'matieres':
                    if (window.EDTListRenderer) window.EDTListRenderer.renderSubjects();
                    break;
                default:
                    // Par sécurité, on rafraîchit le tableau principal
                    TableRenderer.render();
            }
        } else {
            // Aucun onglet actif ? On rend le tableau par défaut
            TableRenderer.render();
        }
    }
}

// === INITIALISATION ===
const app = new EDTApplication();

// Attendre que le DOM soit chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// === EXPORTS GLOBAUX ===
// Exposer un petit sous-ensemble par défaut pour réduire la surface d'attaque
window.EDTApp = app;
window.EDTState = StateManager;
window.EDTStorage = StorageService;
window.EDTDialog = DialogManager;
window.EDTNotification = NotificationManager;
// Exposer DatabaseService et StateManager pour la console
window.DatabaseService = DatabaseService;
window.StateManager = StateManager;

// Exposer TableRenderer pour la console et le debugging
window.TableRenderer = TableRenderer;
window. EDTTableRenderer = TableRenderer;

// Aussi exposer l'instance du service si disponible
if (StateManager && StateManager.dbService) {
    window.dbService = StateManager.dbService;
}
// Exposer l'instance EventHandlers globalement de façon permanente :
// Plusieurs éléments HTML et renderers utilisent des handlers inline (ex: ondragover="EDTHandlers.handleDragOver(event)")
// Il est nécessaire que window.EDTHandlers référence l'instance exportée (EventHandlers) — pas une fusion
// via Object.assign — afin que les méthodes définies sur le prototype soient disponibles.
try {
    if (typeof EventHandlers !== 'undefined' && EventHandlers) {
        window.EDTHandlers = EventHandlers;
    } else {
        // Defensive fallback to avoid ReferenceError in case EventHandlers failed to load.
        window.EDTHandlers = window.EDTHandlers || {};
        console.warn('EventHandlers not available at export time; EDTHandlers set to stub object.');
    }
} catch (e) {
    // Ensure EDTHandlers always exists
    window.EDTHandlers = window.EDTHandlers || {};
    console.error('Error while exposing EDTHandlers globally', e);
}

// Exposer FormHandlers également pour compatibilité avec d'éventuelles références globales.
window.EDTFormHandlers = window.EDTFormHandlers || FormHandlers;
// Exposer l'ExamRoomAllocator pour accès console / appels manuels
try { window.EDTExamRoomAllocator = ExamRoomAllocator; } catch (e) { /* noop */ }


if (EXPOSE_ALL_GLOBALS) {
    // Controllers
    window.EDTSessionController = SessionController;
    window.EDTTeacherController = TeacherController;
    window.EDTSubjectController = SubjectController;
    window.EDTRoomController = RoomController;
    window.EDTForfaitController = ForfaitController;

    // Services
    window.EDTLog = LogService;
    window.EDTConflictService = ConflictService;
    window.EDTVolumeService = VolumeService;

    // UI Managers
    window.EDTSpinner = SpinnerManager;

    // Renderers
    window.EDTTableRenderer = TableRenderer;
    window.EDTVolumeRenderer = VolumeRenderer;
    window.EDTStatsRenderer = StatsRenderer;
    window.EDTListRenderer = ListRenderer;
    window.EDTWishesRenderer = WishesRenderer;
    window.EDTConfigListRenderer = ConfigListRenderer;
    window.EDTFormManager = FormManager;

    // Handlers
    window.EDTHandlers = EventHandlers;
    window.EDTFormHandlers = FormHandlers;
    window.EDTSchedulingHandlers = SchedulingHandlers;
    window.EDTExportHandlers = ExportHandlers;
    window.EDTImportHandlers = ImportHandlers;
}