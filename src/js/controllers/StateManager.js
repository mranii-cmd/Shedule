/**
 * Gestionnaire de l'état global de l'application
 * @author Ibrahim Mrani - UCD
 */

import { DEFAULT_CRENEAUX } from '../config/constants.js';
import Session from '../models/Session.js';
import Teacher from '../models/Teacher.js';
import Subject from '../models/Subject.js';
// import StorageService from '../services/StorageService.js';
import DatabaseService from '../services/DatabaseService.js';
import LogService from '../services/LogService.js';

class StateManager {
    constructor() {
        this.dbService = new DatabaseService();
        // État global de l'application
        this.state = {
            // Données principales
            seances: [],
            examens: [],
            nextSessionId: 1,
            enseignants: [],
            sallesInfo: {},
            matiereGroupes: {},
            filieres: [],
            examRoomConfigs: [],
            creneaux: { ...DEFAULT_CRENEAUX },
            forfaits: [],

            // Sessions importées / multi-sessions (clé: nomSession -> données de session)
            // +++ ADDED: stocke les sessions importées/backup pour permettre import partiel/activation ultérieure
            sessions: {},

            // Souhaits et volumes
            enseignantSouhaits: {},
            enseignantVolumesSupplementaires: {},
            volumesAutomne: {},
            autoSallesParFiliere: {},

            // En-tête
            header: {
                annee: '',
                session: '',
                departement: ''
            },

            // État UI
            currentlyEditingSessionId: null,
            currentlySelectedCell: null,
            currentlySelectedSeance: null,
            activeFiliereConstraint: null,
            draggedSessionId: null,

            // Changements temporaires
            tempFiliereSessionChanges: {}
        };
        // Charger volumesAutomne depuis localStorage si présents (durable entre sessions)
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const raw = window.localStorage.getItem('volumesAutomne');
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (parsed && typeof parsed === 'object') {
                            // Merge parsed values into initial state.volumesAutomne (préserve structure actuelle)
                            this.state.volumesAutomne = Object.assign({}, this.state.volumesAutomne || {}, parsed);
                        }
                    } catch (e) {
                        console.debug('StateManager: failed to parse volumesAutomne from localStorage', e);
                    }
                }
            }
        } catch (e) {
            // localStorage may be unavailable (SSR / private mode) — non-fatal
            console.debug('StateManager: localStorage not available for volumesAutomne', e);
        }

        this.listeners = new Map();
        // Initialize undo/redo stacks and limits so they are always available at runtime.
        // This prevents _undoStack being undefined and makes the API predictable for UI code.
        try {
            this._undoStack = this._undoStack || [];
            this._redoStack = this._redoStack || [];
            this._undoLimit = Number.isFinite(this._undoLimit) ? this._undoLimit : 50;
        } catch (e) {
            // Defensive: in constrained environments, just ensure arrays exist
            this._undoStack = [];
            this._redoStack = [];
            this._undoLimit = 50;
        }

        // best-effort save on unload to reduce data-loss on fast reloads
        try {
            if (typeof window !== 'undefined' && window.addEventListener) {
                window.addEventListener('beforeunload', () => {
                    try { this.saveState(true); } catch (e) { /* noop */ }
                });
            }
        } catch (e) {
            // noop
        }
    }

    /**
      * Initialise le StateManager et la connexion DB
      */
    async init() {
        try {
            await this.dbService.open();
            await this.loadState();
            console.log("StateManager initialized with IndexedDB");
        } catch (e) {
            console.error("StateManager init failed:", e);
        }
    }

    /**
     * Charge l'état complet depuis IndexedDB (Async)
     */
    async loadState() {
        try {
            const globalData = await this.dbService.load('global_data');
            let sessionName = await this.dbService.load('last_active_session_name');

            if (!sessionName && globalData && globalData.header) {
                sessionName = globalData.header.session;
            }

            const sessionKey = `session_${sessionName || 'defaut'}`;
            const sessionData = await this.dbService.load(sessionKey);

            // Réinitialiser l'état
            this.state = this.getEmptyState();

            // Fusionner Global
            if (globalData) Object.assign(this.state, globalData);

            // Fusionner Session
            if (sessionData) {
                this.state.seances = sessionData.seances || [];
                this.state.nextSessionId = sessionData.nextSessionId || 1;
                this.state.header = sessionData.header || this.state.header;
                // Restaurer les examens
                this.state.examens = sessionData.examens || [];
                this.state.examRoomConfigs = sessionData.examRoomConfigs || [];
                // Restaurer les créneaux pour la session (si présents)
                this.state.creneaux = sessionData.creneaux && typeof sessionData.creneaux === 'object'
                    ? sessionData.creneaux
                    : { ...DEFAULT_CRENEAUX };
            } else {
                if (sessionName) this.state.header.session = sessionName;
                // Pas de sessionData, initialise les créneaux par défaut
                this.state.creneaux = { ...DEFAULT_CRENEAUX };
            }

            // debug log
            try {
                console.debug('loadState: loaded sessionKey=', sessionKey, 'sessionDataPresent=', !!sessionData,
                    'examRoomConfigs.len=', (sessionData && sessionData.examRoomConfigs) ? sessionData.examRoomConfigs.length : 0,
                    'examens.len=', (sessionData && sessionData.examens) ? sessionData.examens.length : 0);
            } catch (e) { /* noop */ }

            this._hydrateState();
            this.notify('stateChanged', this.state);

        } catch (err) {
            console.error("Erreur loadState:", err);
        }
    }

    /**
     * Importe un backup JSON dans l'application.
     * Options :
     *  - apply (bool) : si true, applique immédiatement les données globales du backup dans l'état courant
     *                   (sans écraser les clés spécifiques à la session sauf si overwriteSessions = true)
     *  - activateSession (string|null) : nom de la session à activer juste après l'import (optionnel)
     *  - overwriteSessions (bool) : si true, remplace complètement la map this.state.sessions par celles du backup
     *
     * Exemple : await StateManager.importBackup(backupObj, { apply: true, activateSession: 'Automne', overwriteSessions: false })
     *
     * +++ ADDED: méthode pour importer backups et persister les sessions dans la base.
     *
     * @param {Object} backup
     * @param {Object} options
     */
    async importBackup(backup, options = {}) {
        if (!backup || typeof backup !== 'object') {
            throw new Error('importBackup: backup invalide');
        }

        const { apply = false, activateSession = null, overwriteSessions = false } = options;

        // 1) Stocker/merger les sessions fournies dans backup.sessions
        try {
            if (backup.sessions && typeof backup.sessions === 'object') {
                if (!this.state.sessions || typeof this.state.sessions !== 'object' || overwriteSessions) {
                    // Remplacer entièrement la map sessions si demandé
                    this.state.sessions = {};
                }

                for (const [name, sdata] of Object.entries(backup.sessions)) {
                    try {
                        // clone pour éviter références partagées
                        this.state.sessions[name] = sdata && typeof sdata === 'object' ? JSON.parse(JSON.stringify(sdata)) : sdata;
                    } catch (e) {
                        this.state.sessions[name] = sdata;
                    }
                }
            }
        } catch (e) {
            LogService && LogService.error && LogService.error('importBackup: erreur lors du merge des sessions', e);
        }

        // 2) Si le backup contient des données globales et qu'on veut les appliquer maintenant, merge minimal
        try {
            if (apply && backup.global && typeof backup.global === 'object') {
                // Appliquer les clés globales sans écraser les clés de session
                const globalCopy = { ...backup.global };
                // Supprimer clés session-specific si présentes dans backup.global
                delete globalCopy.seances;
                delete globalCopy.nextSessionId;
                delete globalCopy.header;
                delete globalCopy.examens;
                delete globalCopy.examRoomConfigs;

                // Merge shallow : les clés de globalCopy écraseront celles de this.state
                Object.assign(this.state, globalCopy);
            }
        } catch (e) {
            LogService && LogService.error && LogService.error('importBackup: erreur lors de l\'application des données globales', e);
        }

        // 3) Optionnel : si backup fournit une session active et qu'on n'a pas précisé activateSession, l'utiliser
        const sessionToActivate = activateSession || (backup.activeSession || (backup.global && backup.global.header && backup.global.header.session));

        // 4) Persister les sessions importées (saveState gère la persistance des this.state.sessions)
        try {
            await this.saveState(true);
        } catch (e) {
            LogService && LogService.error && LogService.error('importBackup: erreur lors de la sauvegarde après import', e);
        }

        // 5) Si demandé, activer la session importée / fournie
        if (sessionToActivate) {
            try {
                await this.loadSession(sessionToActivate);
            } catch (e) {
                LogService && LogService.error && LogService.error(`importBackup: impossible d'activer la session ${sessionToActivate}`, e);
            }
        }

        // 6) Notification / event
        try {
            this.notify('backup:imported', { sessions: Object.keys(this.state.sessions || {}), activated: sessionToActivate || null });
        } catch (e) {
            // noop
        }

        return true;
    }

    /**
     * Charge et applique une session (si existante) depuis la base ou depuis this.state.sessions.
     * Remplace uniquement les clés spécifiques à la session sans écraser l'état global.
     * @param {string} sessionName
     *
     * +++ ADDED: loadSession permet de charger une session sauvegardée/importée sans écraser le reste de l'état.
     */
    async loadSession(sessionName) {
        if (!sessionName) throw new Error('loadSession: sessionName requis');

        // tenter depuis DB d'abord
        const sessionKey = `session_${sessionName}`;
        let sessionData = null;
        try {
            sessionData = await this.dbService.load(sessionKey);
        } catch (e) {
            // ignore et tenter fallback sur state.sessions
            LogService && LogService.debug && LogService.debug('loadSession: db load failed, fallback to state.sessions', e);
        }

        if (!sessionData && this.state && this.state.sessions && this.state.sessions[sessionName]) {
            sessionData = this.state.sessions[sessionName];
        }

        // Appliquer la session (sans écraser les données globales)
        this.state.header = this.state.header || { annee: '', session: '', departement: '' };
        this.state.header.session = sessionName;

        if (sessionData) {
            this.state.seances = sessionData.seances || [];
            this.state.nextSessionId = sessionData.nextSessionId || 1;
            this.state.examens = sessionData.examens || [];
            this.state.examRoomConfigs = sessionData.examRoomConfigs || [];
            this.state.creneaux = (sessionData.creneaux && typeof sessionData.creneaux === 'object')
                ? sessionData.creneaux
                : { ...DEFAULT_CRENEAUX };
        } else {
            // nouvelle session vide
            this.state.seances = [];
            this.state.nextSessionId = 1;
            this.state.examens = [];
            this.state.examRoomConfigs = [];
            this.state.creneaux = { ...DEFAULT_CRENEAUX };
        }

        this._hydrateState();
        // Persist the active session name and session data (if present) via saveState
        if (typeof this.saveState === 'function') {
            const res = this.saveState(true);
            if (res && typeof res.then === 'function') await res;
        }

        this.notify('session:changed', { session: sessionName });
        this.notify('stateChanged', this.state);
        return true;
    }

    /**
     * Recrée les objets complexes (Session, Teacher) après chargement JSON
     */
    _hydrateState() {
        // Hydratation des séances
        if (Array.isArray(this.state.seances)) {
            this.state.seances = this.state.seances.map(s => s instanceof Session ? s : new Session(s));
        }
        // Vous pouvez ajouter ici l'hydratation d'autres objets si nécessaire (ex: Subject, Teacher)
    }
    /**
     * --- UNDO / REDO (snapshot-based) ---
     *
     * Implémentation simple : on stocke des snapshots JSON complets de this.state.
     * - pushUndoState(description) : enregistre un snapshot avant mutation (appelé par controllers)
     * - undo() / redo() : restaure snapshots
     *
     * Limitation : JSON clone : ne supporte pas fonctions / objets non-serialisables.
     */
    _snapshot() {
        try {
            // Prefer structuredClone when available (handles more types safely)
            if (typeof structuredClone === 'function') {
                return structuredClone(this.state || {});
            }
            // Fallback to JSON clone
            return JSON.parse(JSON.stringify(this.state || {}));
        } catch (e) {
            console.warn('StateManager._snapshot failed (structuredClone/JSON)', e);
            try {
                // Last-resort: shallow copy to avoid returning null
                return { ...(this.state || {}) };
            } catch (err) {
                return null;
            }
        }
    }

    pushUndoState(description = '') {
        try {
            // Debug: who called pushUndoState?
            try {
                console.debug('[StateManager] pushUndoState called:', description, new Date().toISOString());
                const st = (new Error()).stack;
                if (st) console.debug('[StateManager] pushUndoState caller stack:', st.split('\n').slice(2, 6).join(' | '));
            } catch (e) { /* noop */ }

            this._undoStack = this._undoStack || [];
            this._redoStack = this._redoStack || [];
            this._undoLimit = Number.isFinite(this._undoLimit) ? this._undoLimit : 50;

            const snap = this._snapshot();
            // Debug: inspect snapshot content
            try {
                if (!snap) {
                    console.warn('[StateManager] pushUndoState: snapshot is null or failed to clone.');
                } else {
                    const keys = Object.keys(snap || {});
                    const seancesLen = snap && Array.isArray(snap.seances) ? snap.seances.length : (snap && snap.seances ? '(non-array)' : 0);
                    console.debug('[StateManager] pushUndoState: snapshot keys.len=', keys.length, 'keys=', keys.slice(0, 20), 'seances_len=', seancesLen);
                }
            } catch (e) { console.debug('[StateManager] pushUndoState: snapshot inspect failed', e); }

            if (!snap) return false;
            this._undoStack.push({ ts: (new Date()).toISOString(), desc: description || '', state: snap });
            if (this._undoStack.length > this._undoLimit) this._undoStack.shift();
            // Clear redo on new action
            this._redoStack.length = 0;
            // Optional: notify UI that undo is available
            try { this.notify && this.notify('undo:stackChanged', { canUndo: this.canUndo(), canRedo: this.canRedo() }); } catch (e) { /* noop */ }
            // Dispatch a global DOM event so non-module UI can react immediately
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('undo:stackChanged', { detail: { canUndo: this.canUndo(), canRedo: this.canRedo() } }));
                }
            } catch (e) { /* noop */ }
            // Also call a global UI updater if present (covers timing races)
            try { if (typeof window !== 'undefined' && typeof window.__updateUndoUI === 'function') window.__updateUndoUI(); } catch (e) { /* noop */ }
            return true;
        } catch (e) {
            console.warn('StateManager.pushUndoState failed', e);
            return false;
        }
    }

    canUndo() {
        return Array.isArray(this._undoStack) && this._undoStack.length > 0;
    }

    canRedo() {
        return Array.isArray(this._redoStack) && this._redoStack.length > 0;
    }

    clearUndo() {
        this._undoStack = [];
    }

    clearRedo() {
        this._redoStack = [];
    }

    undo() {
        try {
            if (!this.canUndo()) return false;
            // push current to redo
            const current = this._snapshot();
            if (current) {
                this._redoStack = this._redoStack || [];
                this._redoStack.push({ ts: (new Date()).toISOString(), state: current });
                if (this._redoStack.length > (this._undoLimit || 50)) this._redoStack.shift();
            }
            const entry = this._undoStack.pop();
            if (!entry || !entry.state) return false;
            this.state = entry.state;
            try { if (typeof this._hydrateState === 'function') this._hydrateState(); } catch (e) { console.debug('hydrateState after undo failed', e); }
            try { if (typeof this.saveState === 'function') this.saveState(); } catch (e) { console.debug('saveState after undo failed', e); }
            try { this.notify && this.notify('state:undo', { from: entry }); } catch (e) { /* noop */ }
            try { if (typeof window !== 'undefined' && window.TableRenderer && typeof window.TableRenderer.render === 'function') window.TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render after undo failed', e); }
            try { this.notify && this.notify('undo:stackChanged', { canUndo: this.canUndo(), canRedo: this.canRedo() }); } catch (e) { }
            // Dispatch a global DOM event so non-module UI can react immediately
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('undo:stackChanged', { detail: { canUndo: this.canUndo(), canRedo: this.canRedo() } }));
                }
            } catch (e) { /* noop */ }
            try { if (typeof window !== 'undefined' && typeof window.__updateUndoUI === 'function') window.__updateUndoUI(); } catch (e) { /* noop */ }
            return true;
        } catch (e) {
            console.error('StateManager.undo failed', e);
            return false;
        }
    }

    redo() {
        try {
            if (!this.canRedo()) return false;
            const entry = this._redoStack.pop();
            if (!entry || !entry.state) return false;
            // push current to undo
            const current = this._snapshot();
            if (current) {
                this._undoStack = this._undoStack || [];
                this._undoStack.push({ ts: (new Date()).toISOString(), state: current });
                if (this._undoStack.length > (this._undoLimit || 50)) this._undoStack.shift();
            }
            this.state = entry.state;
            try { if (typeof this._hydrateState === 'function') this._hydrateState(); } catch (e) { console.debug('hydrateState after redo failed', e); }
            try { if (typeof this.saveState === 'function') this.saveState(); } catch (e) { console.debug('saveState after redo failed', e); }
            try { this.notify && this.notify('state:redo', { from: entry }); } catch (e) { /* noop */ }
            try { if (typeof window !== 'undefined' && window.TableRenderer && typeof window.TableRenderer.render === 'function') window.TableRenderer.render(); } catch (e) { console.debug('TableRenderer.render after redo failed', e); }
            try { this.notify && this.notify('undo:stackChanged', { canUndo: this.canUndo(), canRedo: this.canRedo() }); } catch (e) { }
            // Dispatch a global DOM event so non-module UI can react immediately
            try {
                if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('undo:stackChanged', { detail: { canUndo: this.canUndo(), canRedo: this.canRedo() } }));
                }
            } catch (e) { /* noop */ }
            try { if (typeof window !== 'undefined' && typeof window.__updateUndoUI === 'function') window.__updateUndoUI(); } catch (e) { /* noop */ }
            return true;
        } catch (e) {
            console.error('StateManager.redo failed', e);
            return false;
        }
    }

    // Helper pour réinitialiser l'objet state (si vous ne l'avez pas déjà)
    // Remplacer entièrement la méthode getEmptyState()
    getEmptyState() {
        // Retourne une structure d'état par défaut sans instancier de nouvel StateManager
        return {
            seances: [],
            examens: [],
            nextSessionId: 1,
            enseignants: [],
            sallesInfo: {},
            matiereGroupes: {},
            filieres: [],
            examRoomConfigs: [],
            creneaux: { ...DEFAULT_CRENEAUX },
            forfaits: [],
            sessions: {},
            enseignantSouhaits: {},
            enseignantVolumesSupplementaires: {},
            volumesAutomne: {},
            autoSallesParFiliere: {},
            header: {
                annee: '',
                session: '',
                departement: ''
            },
            currentlyEditingSessionId: null,
            currentlySelectedCell: null,
            currentlySelectedSeance: null,
            activeFiliereConstraint: null,
            draggedSessionId: null,
            tempFiliereSessionChanges: {}
        };
    }

    /**
      * Sauvegarde l'état (Async - IndexedDB)
      * @param {boolean} silent - Mode silencieux
      */
    async saveState(silent = false) {
        // BEGIN PATCH: skip remote save if not authenticated
        if (typeof window !== 'undefined') {
            try {
                if (!window.__edt_authenticated) {
                    console.debug('StateManager. saveState: skipping remote save — not authenticated');
                    return;
                }
            } catch (e) { /* noop */ }
        }
        // END PATCH
        try {
            // --- 1. Données Globales ---
            const globalData = { ...this.state };

            // Ne pas inclure les données spécifiques à la session dans global_data
            delete globalData.seances;
            delete globalData.nextSessionId;
            delete globalData.header;
            delete globalData.examens;
            delete globalData.examRoomConfigs;

            // Debug : résumé
            try {
                console.debug(
                    'saveState: persisting global_data',
                    'session=',
                    this.state?.header?.session,
                    'examRoomConfigs.len=',
                    (this.state.examRoomConfigs || []).length,
                    'examens.len=',
                    (this.state.examens || []).length
                );
            } catch (e) { /* noop */ }

            // Persist global data
            await this.dbService.save('global_data', globalData);

            // --- 2. Données de la session ACTIVE ---
            const activeSessionName = (this.state && this.state.header && this.state.header.session) ? String(this.state.header.session) : 'defaut';
            const sessionKey = `session_${activeSessionName}`;

            // Construire une snapshot session courante (clonée pour éviter références)
            const sessionData = {
                seances: Array.isArray(this.state.seances) ? JSON.parse(JSON.stringify(this.state.seances)) : (this.state.seances || []),
                nextSessionId: this.state.nextSessionId || 1,
                header: this.state.header ? JSON.parse(JSON.stringify(this.state.header)) : { session: activeSessionName },
                examens: Array.isArray(this.state.examens) ? JSON.parse(JSON.stringify(this.state.examens)) : (this.state.examens || []),
                examRoomConfigs: Array.isArray(this.state.examRoomConfigs) ? JSON.parse(JSON.stringify(this.state.examRoomConfigs)) : (this.state.examRoomConfigs || []),
                creneaux: (this.state.creneaux && typeof this.state.creneaux === 'object') ? JSON.parse(JSON.stringify(this.state.creneaux)) : { ...DEFAULT_CRENEAUX }
            };

            try {
                console.debug('saveState: persisting active session key=', sessionKey, 'examens_len=', sessionData.examens.length);
            } catch (e) { /* noop */ }

            await this.dbService.save(sessionKey, sessionData);

            // Mettre à jour la dernière session active
            await this.dbService.save('last_active_session_name', activeSessionName);

            // --- 3. Persister la map sessions (importées) SANS écraser la session active ---
            try {
                if (this.state && this.state.sessions && typeof this.state.sessions === 'object') {
                    const keys = Object.keys(this.state.sessions || {});
                    try { console.debug('saveState: persisting sessions map keys=', keys, 'skipping active=', activeSessionName); } catch (e) { }
                    for (const [name, sdata] of Object.entries(this.state.sessions)) {
                        if (!sdata) continue;
                        // Skip saving the active session from sessions map to avoid overwriting
                        if (String(name) === activeSessionName) {
                            try { console.debug('saveState: skip sessions[%s] (active)', name); } catch (e) { }
                            continue;
                        }
                        const sk = `session_${name}`;
                        // Save snapshot as-is (assume sdata is already a session snapshot)
                        await this.dbService.save(sk, sdata);
                    }
                }
            } catch (e) {
                // Non critique : log pour debug
                LogService && LogService.debug && LogService.debug('saveState: error saving sessions map', e);
            }

            // Notifications / event
            if (!silent) this.notify('state:saved');
            try {
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('app:stateUpdated', { detail: { timestamp: Date.now() } }));
                }
            } catch (e) { /* noop */ }

        } catch (err) {
            // Erreur critique de persistance
            console.error('Erreur saveState:', err);
        }
    }

    /**
     * Change la session active
     * @param {string} newSession - La nouvelle session
     */
    async changeSession(newSessionName) {
        // Sauvegarder l'ancienne session puis charger la nouvelle via loadSession
        try {
            const curName = (this.state && this.state.header && this.state.header.session) ? String(this.state.header.session) : null;
            if (curName) {
                if (!this.state.sessions || typeof this.state.sessions !== 'object') this.state.sessions = {};
                try {
                    this.state.sessions[curName] = {
                        seances: Array.isArray(this.state.seances) ? JSON.parse(JSON.stringify(this.state.seances)) : (this.state.seances || []),
                        nextSessionId: this.state.nextSessionId || 1,
                        header: this.state.header ? JSON.parse(JSON.stringify(this.state.header)) : { session: curName },
                        examens: Array.isArray(this.state.examens) ? JSON.parse(JSON.stringify(this.state.examens)) : (this.state.examens || []),
                        examRoomConfigs: Array.isArray(this.state.examRoomConfigs) ? JSON.parse(JSON.stringify(this.state.examRoomConfigs)) : (this.state.examRoomConfigs || []),
                        creneaux: (this.state.creneaux && typeof this.state.creneaux === 'object') ? JSON.parse(JSON.stringify(this.state.creneaux)) : { ...DEFAULT_CRENEAUX }
                    };
                } catch (e) {
                    this.state.sessions[curName] = {
                        seances: this.state.seances || [],
                        nextSessionId: this.state.nextSessionId || 1,
                        header: this.state.header || { session: curName },
                        examens: this.state.examens || [],
                        examRoomConfigs: this.state.examRoomConfigs || [],
                        creneaux: this.state.creneaux || { ...DEFAULT_CRENEAUX }
                    };
                }
            }
        } catch (e) {
            LogService && LogService.debug && LogService.debug('changeSession: failed to snapshot current session into sessions map', e);
        }

        await this.saveState(true);
        await this.loadSession(newSessionName);
    }

    /**
     * Obtient toutes les séances
     * @returns {Array<Session>} Les séances
     */
    getSeances() {
        return this.state.seances;
    }
    /**
     * Ajoute un examen (planification) à la session courante et persiste.
     * @param {Object} examen - objet examen (ex: { titre, date, duree, groupes, ... })
     * @returns {Object} examen ajouté (avec id)
     */
    async addExamen(examen = {}) {
        if (!examen || typeof examen !== 'object') return null;
        if (examen.id === undefined || examen.id === null) {
            examen.id = `ex_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        }
        this.state.examens = this.state.examens || [];
        this.state.examens.push(examen);
        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('addExamen: saveState failed', e);
        }
        this.notify('examen:added', { examen });
        this.notify('stateChanged', this.state);
        return examen;
    }

    /**
     * Met à jour un examen existant et persiste.
     * @param {string|number} id
     * @param {Object} updates
     * @returns {Object|null} examen mis à jour ou null
     */
    async updateExamen(id, updates = {}) {
        if (!id) return null;
        this.state.examens = this.state.examens || [];
        const idx = this.state.examens.findIndex(e => String(e.id) === String(id));
        if (idx === -1) return null;
        const examen = this.state.examens[idx];
        Object.assign(examen, updates);
        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('updateExamen: saveState failed', e);
        }
        this.notify('examen:updated', { examen });
        this.notify('stateChanged', this.state);
        return examen;
    }

    /**
     * Supprime un examen par id et persiste.
     * @param {string|number} id
     * @returns {boolean} true si supprimé
     */
    async removeExamen(id) {
        if (!id) return false;
        this.state.examens = this.state.examens || [];
        const idx = this.state.examens.findIndex(e => String(e.id) === String(id));
        if (idx === -1) return false;
        const removed = this.state.examens.splice(idx, 1)[0];
        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('removeExamen: saveState failed', e);
        }
        this.notify('examen:removed', { examen: removed });
        this.notify('stateChanged', this.state);
        return true;
    }

    /**
     * Ajoute ou met à jour une configuration de salle pour examen (examRoomConfigs)
     * @param {Object} cfg - { id?, salle, examId?, autres... }
     * @returns {Object} cfg ajouté/mis à jour
     */
    async upsertExamRoomConfig(cfg = {}) {
        if (!cfg || typeof cfg !== 'object') return null;
        this.state.examRoomConfigs = this.state.examRoomConfigs || [];
        if (cfg.id) {
            const idx = this.state.examRoomConfigs.findIndex(c => String(c.id) === String(cfg.id));
            if (idx !== -1) {
                Object.assign(this.state.examRoomConfigs[idx], cfg);
                try {
                    await this.saveState();
                } catch (e) {
                    LogService && LogService.error && LogService.error('upsertExamRoomConfig:update saveState failed', e);
                }
                this.notify('examRoomConfig:updated', { config: this.state.examRoomConfigs[idx] });
                this.notify('stateChanged', this.state);
                return this.state.examRoomConfigs[idx];
            }
        }
        if (!cfg.id) cfg.id = `erc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.state.examRoomConfigs.push(cfg);
        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('upsertExamRoomConfig:insert saveState failed', e);
        }
        this.notify('examRoomConfig:added', { config: cfg });
        this.notify('stateChanged', this.state);
        return cfg;
    }

    /**
     * Supprime une configuration de salle d'examen par id
     * @param {string|number} id
     * @returns {boolean}
     */
    async removeExamRoomConfig(id) {
        if (!id) return false;
        this.state.examRoomConfigs = this.state.examRoomConfigs || [];
        const idx = this.state.examRoomConfigs.findIndex(c => String(c.id) === String(id));
        if (idx === -1) return false;
        const removed = this.state.examRoomConfigs.splice(idx, 1)[0];
        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('removeExamRoomConfig: saveState failed', e);
        }
        this.notify('examRoomConfig:removed', { config: removed });
        this.notify('stateChanged', this.state);
        return true;
    }

    /**
     * Remplace la liste complète des configurations de salles d'examen et persiste.
     * Usage recommandé depuis l'UI : await StateManager.setExamRoomConfigs(updatedArray)
     * @param {Array} configs
     */
    async setExamRoomConfigs(configs = []) {
        try {
            const shortStack = (new Error()).stack.split('\n').slice(2, 5).map(s => s.trim()).join(' | ');
            console.debug(`setExamRoomConfigs called — configs.len=${Array.isArray(configs) ? configs.length : 0} — session="${this.state?.header?.session}" — from=${shortStack}`);
        } catch (e) { /* noop */ }

        this.state.examRoomConfigs = Array.isArray(configs) ? configs : [];

        // Ensure header.session exists (avoid writing to session_defaut unintentionally)
        if (!this.state.header || !this.state.header.session || String(this.state.header.session).trim() === '') {
            try {
                if (typeof window !== 'undefined') {
                    const uiSession = document.getElementById('selectSession')?.value;
                    if (uiSession) this.state.header = this.state.header || { annee: '', session: '', departement: '' }, this.state.header.session = uiSession;
                }
            } catch (e) { /* noop */ }
            if (!this.state.header) this.state.header = { annee: '', session: 'defaut', departement: '' };
            if (!this.state.header.session) this.state.header.session = 'defaut';
            console.warn('setExamRoomConfigs: header.session was empty — forced to', this.state.header.session);
        }

        // Defensive snapshot into sessions map so session-specific data is consistent
        try {
            if (!this.state.sessions || typeof this.state.sessions !== 'object') this.state.sessions = {};
            const cur = String(this.state.header.session);
            this.state.sessions[cur] = {
                seances: Array.isArray(this.state.seances) ? JSON.parse(JSON.stringify(this.state.seances)) : (this.state.seances || []),
                nextSessionId: this.state.nextSessionId || 1,
                header: this.state.header ? JSON.parse(JSON.stringify(this.state.header)) : { session: cur },
                examens: Array.isArray(this.state.examens) ? JSON.parse(JSON.stringify(this.state.examens)) : (this.state.examens || []),
                examRoomConfigs: Array.isArray(this.state.examRoomConfigs) ? JSON.parse(JSON.stringify(this.state.examRoomConfigs)) : (this.state.examRoomConfigs || []),
                creneaux: (this.state.creneaux && typeof this.state.creneaux === 'object') ? JSON.parse(JSON.stringify(this.state.creneaux)) : { ...DEFAULT_CRENEAUX }
            };
        } catch (e) {
            console.debug('setExamRoomConfigs: snapshot into sessions map failed, continuing', e);
        }

        // Persist state (global + session). Await fully.
        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('setExamRoomConfigs: saveState failed', e);
        }

        // Extra explicit save of the session key to be extra-safe
        try {
            const sessionKey = `session_${this.state.header.session || 'defaut'}`;
            const sessionData = {
                seances: this.state.seances,
                nextSessionId: this.state.nextSessionId,
                header: this.state.header,
                examens: this.state.examens || [],
                examRoomConfigs: this.state.examRoomConfigs || [],
                creneaux: this.state.creneaux || {}
            };
            if (this.dbService && typeof this.dbService.save === 'function') {
                await this.dbService.save(sessionKey, sessionData);
                console.debug('setExamRoomConfigs: explicitly saved sessionKey=', sessionKey);
            }
        } catch (e) {
            LogService && LogService.error && LogService.error('setExamRoomConfigs: explicit session save failed', e);
        }

        // Notify subscribers/UI
        try {
            this.notify('examRoomConfigs:updated', { configs: this.state.examRoomConfigs });
            this.notify('stateChanged', this.state);
        } catch (e) {
            console.debug('setExamRoomConfigs: notify failed', e);
        }

        return this.state.examRoomConfigs;
    }
    /**
     * Remplace la liste complète des examens de la session et persiste.
     * Usage: await StateManager.setExamens(arrayOfExamens)
     * @param {Array} exams
     */
    async setExamens(exams = []) {
        try {
            console.debug('setExamens called — exams.len=', Array.isArray(exams) ? exams.length : 0, 'session=', this.state?.header?.session);
        } catch (e) { /* noop */ }

        this.state.examens = Array.isArray(exams) ? exams : [];

        // ensure header.session
        if (!this.state.header || !this.state.header.session || String(this.state.header.session).trim() === '') {
            if (!this.state.header) this.state.header = { annee: '', session: 'defaut', departement: '' };
            if (!this.state.header.session) this.state.header.session = 'defaut';
            console.warn('setExamens: header.session was empty — forced to', this.state.header.session);
        }

        // snapshot session
        try {
            if (!this.state.sessions || typeof this.state.sessions !== 'object') this.state.sessions = {};
            const cur = String(this.state.header.session);
            this.state.sessions[cur] = {
                seances: Array.isArray(this.state.seances) ? JSON.parse(JSON.stringify(this.state.seances)) : (this.state.seances || []),
                nextSessionId: this.state.nextSessionId || 1,
                header: this.state.header ? JSON.parse(JSON.stringify(this.state.header)) : { session: cur },
                examens: Array.isArray(this.state.examens) ? JSON.parse(JSON.stringify(this.state.examens)) : (this.state.examens || []),
                examRoomConfigs: Array.isArray(this.state.examRoomConfigs) ? JSON.parse(JSON.stringify(this.state.examRoomConfigs)) : (this.state.examRoomConfigs || []),
                creneaux: (this.state.creneaux && typeof this.state.creneaux === 'object') ? JSON.parse(JSON.stringify(this.state.creneaux)) : { ...DEFAULT_CRENEAUX }
            };
        } catch (e) {
            console.debug('setExamens: snapshot into sessions map failed, continuing', e);
        }

        try {
            await this.saveState();
        } catch (e) {
            LogService && LogService.error && LogService.error('setExamens: saveState failed', e);
        }

        // explicit save of session key
        try {
            const sessionKey = `session_${this.state.header.session || 'defaut'}`;
            const sessionData = {
                seances: this.state.seances,
                nextSessionId: this.state.nextSessionId,
                header: this.state.header,
                examens: this.state.examens || [],
                examRoomConfigs: this.state.examRoomConfigs || [],
                creneaux: this.state.creneaux || {}
            };
            if (this.dbService && typeof this.dbService.save === 'function') {
                await this.dbService.save(sessionKey, sessionData);
                console.debug('setExamens: explicitly saved sessionKey=', sessionKey);
            }
        } catch (e) {
            LogService && LogService.error && LogService.error('setExamens: explicit session save failed', e);
        }

        try {
            this.notify('examens:changed', { examens: this.state.examens });
            this.notify('stateChanged', this.state);
        } catch (e) { /* noop */ }

        return this.state.examens;
    }

    /**
     * Ajoute une séance
     * @param {Session} session - La séance à ajouter
     * @returns {Session} La séance ajoutée
     */
    addSeance(session) {
        session.id = this.state.nextSessionId++;
        this.state.seances.push(session);
        this.notify('seance:added', { seance: session });
        return session;
    }

    /**
     * Supprime une séance
     * @param {number} id - L'ID de la séance
     * @returns {boolean} True si supprimée
     */
    removeSeance(id) {
        const index = this.state.seances.findIndex(s => s.id === id);
        if (index === -1) return false;

        const removed = this.state.seances.splice(index, 1)[0];
        this.notify('seance:removed', { seance: removed });
        return true;
    }

    /**
     * Met à jour une séance
     * @param {number} id - L'ID de la séance
     * @param {Object} updates - Les mises à jour
     * @returns {Session|null} La séance mise à jour
     */
    updateSeance(id, updates) {
        const seance = this.state.seances.find(s => s.id === id);
        if (!seance) return null;

        Object.assign(seance, updates);
        this.notify('seance:updated', { seance });
        return seance;
    }

    /**
     * Trouve une séance par ID
     * @param {number} id - L'ID
     * @returns {Session|null} La séance
     */
    findSeanceById(id) {
        return this.state.seances.find(s => String(s.id) === String(id)) || null;
    }

    /**
     * Obtient les enseignants sous forme d'objets Teacher
     * @returns {Array<Teacher>} Les enseignants
     */
    getTeachers() {
        return this.state.enseignants.map(nom => {
            return new Teacher(nom, {
                souhaits: this.state.enseignantSouhaits[nom],
                volumesSupplementaires: this.state.enseignantVolumesSupplementaires[nom] || []
            });
        });
    }

    /**
     * Obtient les matières sous forme d'objets Subject
     * @returns {Array<Subject>} Les matières
     */
    getSubjects() {
        return Object.keys(this.state.matiereGroupes).map(nom => {
            return new Subject(nom, this.state.matiereGroupes[nom]);
        });
    }

    /**
     * Obtient les matières de la session actuelle
     * @returns {Array<Subject>} Les matières
     */
    getCurrentSessionSubjects() {
        const currentSession = this.state.header.session;
        const sessionType = currentSession.toLowerCase().includes('automne') ? 'Automne' : 'Printemps';

        const filieresDeSession = new Set(
            this.state.filieres
                .filter(f => f.session === sessionType)
                .map(f => f.nom)
        );

        return this.getSubjects().filter(subject => {
            if (!subject.filiere) return true; // Inclure les matières non assignées
            return filieresDeSession.has(subject.filiere);
        });
    }

    /**
     * Obtient les filières de la session actuelle
     * @returns {Array<Object>} Les filières
     */
    getCurrentSessionFilieres() {
        const sessionType = this.state.header.session.toLowerCase().includes('automne')
            ? 'Automne'
            : 'Printemps';

        return this.state.filieres.filter(f => f.session === sessionType);
    }

    /**
     * Ajoute un enseignant
     * @param {string} nom - Le nom
     * @returns {boolean} True si ajouté
     */
    addTeacher(nom) {
        if (!nom || this.state.enseignants.includes(nom)) return false;

        this.state.enseignants.push(nom);
        this.state.enseignants.sort();
        this.notify('teacher:added', { nom });
        return true;
    }

    /**
     * Supprime un enseignant (pas de doublon)
     * @param {string} nom - Le nom de l'enseignant
     * @returns {boolean} True si supprimé
     */
    removeTeacher(nom) {
        const index = this.state.enseignants.indexOf(nom);
        if (index === -1) return false;

        this.state.enseignants.splice(index, 1);
        delete this.state.enseignantSouhaits[nom];
        delete this.state.enseignantVolumesSupplementaires[nom];

        this.notify('teacher:removed', { nom });
        return true;
    }

    /**
     * Normalise et extrait un entier depuis plusieurs clés possibles
     * @param {Object} config - objet de configuration
     * @param {Array<string>} keys - clés candidates
     * @param {number} fallback - valeur de repli
     * @returns {number}
     */
    _extractInt(config, keys, fallback = 0) {
        for (const k of keys) {
            if (config[k] !== undefined && config[k] !== null && String(config[k]).toString().trim() !== '') {
                const n = Number.parseInt(String(config[k]).replace(',', ''), 10);
                if (Number.isFinite(n)) return n;
            }
        }
        return fallback;
    }

    /**
     * Ajoute une matière
     * @param {string} nom - Le nom de la matière
     * @param {Object} config - La configuration (plusieurs formats acceptés)
     * @returns {boolean} True si ajoutée
     */
    addSubject(nom, config = {}) {
        if (!nom || this.state.matiereGroupes[nom]) return false;

        // Normaliser les champs variants possibles
        const sections = Math.max(1, this._extractInt(config, ['sections_cours', 'sections', 'sectionsCours', 'sections_cours'], 1));
        const tdGroups = Math.max(0, this._extractInt(config, ['td_groups', 'tdGroups', 'td_groups'], 0));
        const tpGroups = Math.max(0, this._extractInt(config, ['tp_groups', 'tpGroups', 'tp_groups'], 0));
        const nbEnseignantsTP = Math.max(1, this._extractInt(config, ['nbEnseignantsTP', 'nb_enseignants_tp', 'nbEnseignantsTp'], 1));

        // Volumes : supporter objet volumeHTP ou colonnes plate (volumeCoursHTP...)
        let volumeHTP = { Cours: 0, TD: 0, TP: 0 };
        if (config.volumeHTP && typeof config.volumeHTP === 'object') {
            volumeHTP = {
                Cours: Number(config.volumeHTP.Cours ?? config.volumeHTP.cours ?? volumeHTP.Cours) || volumeHTP.Cours,
                TD: Number(config.volumeHTP.TD ?? config.volumeHTP.td ?? volumeHTP.TD) || volumeHTP.TD,
                TP: Number(config.volumeHTP.TP ?? config.volumeHTP.tp ?? volumeHTP.TP) || volumeHTP.TP
            };
        } else {
            const volCours = this._extractInt(config, ['volumeCoursHTP', 'volCours', 'vol_cours', 'volume_cours'], volumeHTP.Cours);
            const volTd = this._extractInt(config, ['volumeTDHTP', 'volTD', 'vol_td', 'volume_td'], volumeHTP.TD);
            const volTp = this._extractInt(config, ['volumeTPHTP', 'volTP', 'vol_tp', 'volume_tp'], volumeHTP.TP);
            volumeHTP = { Cours: volCours, TD: volTd, TP: volTp };
        }

        const vhtTotal = (Number(volumeHTP.Cours) || 0) + (Number(volumeHTP.TD) || 0) + (Number(volumeHTP.TP) || 0);

        // Heures par séance configurables (fallbacks)
        const defaultHours = {
            cours: (this.state.config && this.state.config.hoursPerSessionCours) || 2,
            td: (this.state.config && this.state.config.hoursPerSessionTD) || 1,
            tp: (this.state.config && this.state.config.hoursPerSessionTP) || 1
        };

        // Calcul des séances attendues (arrondi supérieur)
        const expectedSessions = {
            cours: (volumeHTP.Cours > 0) ? Math.ceil(volumeHTP.Cours / (defaultHours.cours || 1)) : 0,
            td: (volumeHTP.TD > 0) ? Math.ceil(volumeHTP.TD / (defaultHours.td || 1)) : 0,
            tp: (volumeHTP.TP > 0) ? Math.ceil(volumeHTP.TP / (defaultHours.tp || 1)) : 0
        };

        let expectedTotal = expectedSessions.cours + expectedSessions.td + expectedSessions.tp;
        // Fallback logique : si aucun volume renseigné mais il y a sections, estimer au moins 'sections' séances de cours
        if (expectedTotal === 0 && sections > 0) {
            expectedTotal = sections;
        }

        // Construire l'entrée avec compatibilité ascendante
        this.state.matiereGroupes[nom] = {
            filiere: config.filiere || '',
            sections_cours: sections,
            td_groups: tdGroups,
            tp_groups: tpGroups,
            // Champs plats historiques
            volumeCoursHTP: volumeHTP.Cours,
            volumeTDHTP: volumeHTP.TD,
            volumeTPHTP: volumeHTP.TP,
            // Structure moderne
            volumeHTP: { ...volumeHTP },
            volumes: { cours: volumeHTP.Cours, td: volumeHTP.TD, tp: volumeHTP.TP },
            // Résumés pour l'UI
            expectedSessions,
            expectedTotalSessions: expectedTotal,
            nbSeancesAttendue: expectedTotal,
            vhtTotal,
            nbEnseignantsTP,
            // Conserver métadonnées passées si présentes
            enseignants: config.enseignants || [],
            notes: config.notes || ''
        };

        this.notify('subject:added', { nom });
        return true;
    }

    /**
     * Supprime une matière
     * @param {string} nom - Le nom de la matière
     * @returns {boolean} True si supprimée
     */
    removeSubject(nom) {
        if (!this.state.matiereGroupes[nom]) return false;

        delete this.state.matiereGroupes[nom];
        this.notify('subject:removed', { nom });
        return true;
    }

    /**
     * Réinitialise l'EDT de la session actuelle
     */
    resetCurrentSessionEDT() {
        this.state.seances = [];
        this.state.nextSessionId = 1;
        this.recomputeVolumesAutomne();
        this.notify('edt:reset');
    }

    /**
     * Réinitialise complètement le projet
     */
    async resetProject() {
        await this.dbService.clear();
        this.state = this.getEmptyState();
        this.notify('project:reset');
        this.notify('stateChanged', this.state);
    }

    /**
     * S'abonne à un'événement
     * @param {string} event - Le nom de l'événement
     * @param {Function} callback - La fonction de callback
     * @returns {Function} Fonction de désabonnement
     */
    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        this.listeners.get(event).push(callback);

        // Retourner une fonction de désabonnement
        return () => {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Notifie les listeners d'un événement
     * @param {string} event - Le nom de l'événement
     * @param {*} data - Les données de l'événement
     */
    notify(event, data = null) {
        if (!this.listeners.has(event)) return;

        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in listener for ${event}:`, error);
            }
        });
    }

    /**
     * Obtient l'état complet (pour debug)
     * @returns {Object} L'état
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Récupère une séance par son ID
     * @param {string|number} id - L'ID de la séance
     * @returns {Object|null} La séance trouvée ou null
     */
    getSeanceById(id) {
        const seances = this.getSeances();
        return seances.find(s => String(s.id) === String(id)) || null;
    }
    /**
    * Ajoute une filière à l'état
    * @param {Object} filiere { nom: string, session: string }
    * @returns {boolean} True si ajoutée
    */
    addFiliere(filiere) {
        if (!filiere || !filiere.nom) return false;
        if (this.state.filieres.some(f => f.nom === filiere.nom && f.session === filiere.session)) return false;
        this.state.filieres.push(filiere);
        this.notify('filiere:added', { filiere });
        this.notify('stateChanged', this.state);
        this.saveState();
        return true;
    }

    /**
     * Ajoute un enseignant (pas de doublon)
     * @param {string} nom
     * @returns {boolean}
     */
    addEnseignant(nom) {
        if (!nom || this.state.enseignants.includes(nom)) return false;
        this.state.enseignants.push(nom);
        this.state.enseignants.sort();
        this.notify('enseignant:added', { nom });
        this.notify('stateChanged', this.state);
        this.saveState();
        return true;
    }

    /**
     * Ajoute une matière
     * @param {string} nom
     * @param {Object} config
     * @returns {boolean}
     */
    addMatiere(nom, config = {}) {
        if (!nom || this.state.matiereGroupes[nom]) return false;
        this.state.matiereGroupes[nom] = config;
        this.notify('matiere:added', { nom, config });
        this.notify('stateChanged', this.state);
        this.saveState();
        return true;
    }

    /**
     * Ajoute une salle
     * @param {string} nom
     * @param {string} type
     * @returns {boolean}
     */
    addSalle(nom, type = 'Standard') {
        if (!nom || this.state.sallesInfo[nom]) return false;
        this.state.sallesInfo[nom] = type;
        this.notify('salle:added', { nom, type });
        this.notify('stateChanged', this.state);
        this.saveState();
        return true;
    }
    /**
     * Recalcule les volumes horaires d'automne pour chaque enseignant.
     * À appeler après modification/suppression des séances d'automne.
     */
    recomputeVolumesAutomne() {
        console.log('Recalcul volumesAutomne');
        const enseignants = this.state.enseignants || [];
        // Charger toutes les séances de la session d'automne
        const autumnSeances = (this.getSeances())
            .filter(s =>
                String(s.session || '').toLowerCase().includes('automne') ||
                String(s.session || '').toLowerCase().includes('autumn')
            );

        const volumes = {};
        enseignants.forEach(name => {
            volumes[name] = autumnSeances
                .filter(s => Array.isArray(s.enseignantsArray) && s.enseignantsArray.includes(name))
                .reduce((sum, s) => sum + (s.hTP_Affecte || 0), 0);
        });

        this.state.volumesAutomne = volumes;
        this.saveState && this.saveState();
    }
}

// À la fin du fichier : créer l'instance, l'exposer et l'exporter
const stateManagerInstance = new StateManager();
if (typeof window !== 'undefined') {
    // exposer pour debug / compatibilité globale
    window.StateManager = stateManagerInstance;
}

// Export d'une instance singleton
export default stateManagerInstance;