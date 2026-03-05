/**
 * Renderer pour l'affichage des volumes horaires
 * (Patch : persistance automatique des volumes d'automne calculés si l'état ne les contient pas)
 *
 * Ajout : fallback _computeVolumesFromSeances pour calculer les volumes d'automne à partir
 * des séances persistées si ni l'état ni le service ne fournissent de données utiles.
 *
 * Améliorations UI & pagination :
 * - recherche + per-page + pagination pour la table Matières
 * - recherche + per-page + pagination pour la table Enseignants
 * - gestion des événements via délégation (init)
 */

import StateManager from '../controllers/StateManager.js';
import TeacherController from '../controllers/TeacherController.js';
import SubjectController from '../controllers/SubjectController.js';
import VolumeService from '../services/VolumeService.js';
import StorageService from '../services/StorageService.js';
import { safeText } from '../utils/sanitizers.js';
import SchedulingService from '../services/SchedulingService.js';
import { normalizeSessionLabel, getStorageSessionKey } from '../utils/session.js';
import { attachIndicator } from '../ui/indicators.js';
import { filterSubjectsByDepartment } from '../utils/helpers.js';

class VolumeRenderer {
    constructor() {
        this.container = null;
        this.annualMetrics = null; // cache des métriques annuelles

        // Pagination / UI state
        this.pageState = {
            teachers: 1,
            subjects: 1
        };
        this.pageSize = {
            teachers: 10,
            subjects: 10
        };
        this.filters = {
            teacherQuery: '',
            subjectQuery: ''
        };

        // handlers
        this._onPaginationClick = this._onPaginationClick.bind(this);
        this._onControlInput = this._onControlInput.bind(this);
        this._listenerAttached = false;
        this._searchDebounce = null;
    }

    init(containerId = 'volumesContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found — fallback to document-level handlers`);
            if (!this._listenerAttached) {
                document.addEventListener('click', this._onPaginationClick);
                document.addEventListener('input', this._onControlInput);
                document.addEventListener('change', this._onControlInput);
                this._listenerAttached = true;
            }
            return;
        }

        // attach handlers to container
        if (!this._listenerAttached) {
            this.container.addEventListener('click', this._onPaginationClick);
            this.container.addEventListener('input', this._onControlInput);
            this.container.addEventListener('change', this._onControlInput);
            this._listenerAttached = true;
        }
    }

    render() {
        if (!this.container) return;

        // Calculer les métriques annuelles et mettre en cache
        this.annualMetrics = this.computeAnnualMetrics();

        const globalHtml = this.renderGlobalMetrics();
        const subjectHtml = this.renderSubjectVolumes();
        const maybeTeacherHtml = this.renderTeacherVolumes();

        // Sync/async handling same as before (teacher part may be sync)
        if (maybeTeacherHtml && typeof maybeTeacherHtml.then === 'function') {
            this.container.innerHTML = `
                <div class="volumes-section">
                    ${globalHtml}
                    <div class="teacher-volumes">Chargement des volumes...</div>
                    ${subjectHtml}
                </div>
            `;
            maybeTeacherHtml.then(teacherHtml => {
                try {
                    this.container.innerHTML = `
                        <div class="volumes-section">
                            ${globalHtml}
                            ${teacherHtml}
                            ${subjectHtml}
                        </div>
                    `;
                    this._attachAllTeacherIndicators();
                } catch (e) {
                    console.error('VolumeRenderer.render async update failed', e);
                }
            }).catch(err => {
                console.error('VolumeRenderer.render: failed to compute teacher volumes', err);
                this.container.innerHTML = `
                    <div class="volumes-section">
                        ${globalHtml}
                        <div class="teacher-volumes"><div class="empty-message">Impossible de calculer les volumes des enseignants.</div></div>
                        ${subjectHtml}
                    </div>
                `;
                this._attachAllTeacherIndicators();
            });
        } else {
            this.container.innerHTML = `
                <div class="volumes-section">
                    ${globalHtml}
                    ${maybeTeacherHtml}
                    ${subjectHtml}
                </div>
            `;
            this._attachAllTeacherIndicators();
        }
    }

    computeAnnualMetrics() {
        const enseignants = StateManager.state.enseignants || [];
        const allSubjects = StateManager.getSubjects(); // objets Subject
        const filieres = StateManager.state.filieres || [];

        // helper : récupérer matières pour une session (Automne / Printemps)
        const getSubjectsForSession = (sessionLabel) => {
            const sessionType = sessionLabel === 'autumn' ? 'Automne' : 'Printemps';
            const filieresNames = filieres
                .filter(f => f.session === sessionType)
                .map(f => f.nom);
            // Inclure matières sans filière également (compatibilité)
            return allSubjects.filter(s => !s.filiere || filieresNames.includes(s.filiere));
        };

        const autumnSubjects = getSubjectsForSession('autumn');
        const springSubjects = getSubjectsForSession('spring');

        // Charger les séances depuis le StorageService sans changer l'état courant
        const autumnSessionKey = getStorageSessionKey('autumn');
        const springSessionKey = getStorageSessionKey('spring');

        const autumnSessionData = (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function')
            ? StorageService.loadSessionData(autumnSessionKey) || { seances: [], nextId: 1 }
            : { seances: [], nextId: 1 };

        const springSessionData = (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function')
            ? StorageService.loadSessionData(springSessionKey) || { seances: [], nextId: 1 }
            : { seances: [], nextId: 1 };

        // Forfaits : tentative de répartition par session si champ session présent
        const allForfaits = StateManager.state.forfaits || [];
        const forfaitsAutumn = allForfaits.filter(f => !f.session || String(f.session).toLowerCase().includes('automne') || String(f.session).toLowerCase().includes('autumn'));
        const forfaitsSpring = allForfaits.filter(f => String(f.session).toLowerCase().includes('printemps') || String(f.session).toLowerCase().includes('spring'));

        const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires || {};

        // Calcul des métriques annuelles via VolumeService
        const annualMetrics = VolumeService.calculateAnnualGlobalMetrics(
            enseignants,
            autumnSubjects,
            autumnSessionData.seances || [],
            springSubjects,
            springSessionData.seances || [],
            volumesSupplementaires,
            forfaitsAutumn,
            forfaitsSpring
        );

        return annualMetrics || {
            autumn: {},
            spring: {},
            annualVHT: 0,
            annualVHM: 0,
            totalRegisteredTeachers: (enseignants || []).length
        };
    }

    renderGlobalMetrics() {
        const annualMetrics = this.annualMetrics || this.computeAnnualMetrics();

        const annualVHT = annualMetrics.annualVHT || 0;
        const annualVHM = annualMetrics.annualVHM || 0;
        const totalRegisteredTeachers = annualMetrics.totalRegisteredTeachers || (StateManager.state.enseignants || []).length;

        return `
            <div class="global-metrics">
                <h3>📊 Métriques Globales Annuelles</h3>
                <div class="metrics-grid">
                    <div class="metric-card highlight-annual">
                        <div class="metric-value">${safeText(String(annualVHT))}h</div>
                        <div class="metric-label">VHT Annuel (Automne + Printemps)</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${safeText(String(annualVHM))}h</div>
                        <div class="metric-label">VHM Annuel moyen par enseignant</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${safeText(String(totalRegisteredTeachers))}</div>
                        <div class="metric-label">Enseignants inscrits</div>
                    </div>
                </div>
            </div>
        `;
    }

    _normalizeVolumesMap(volMap = {}, enseignants = [], { dropZero = false } = {}) {
        const out = {};
        try {
            if (!volMap || typeof volMap !== 'object') return out;

            // build canonical map of enseignants: canonicalLower -> canonicalName
            const canonical = {};
            (Array.isArray(enseignants) ? enseignants : []).forEach(t => {
                try {
                    const name = String(t || '').trim();
                    if (!name) return;
                    const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    canonical[lower] = name;
                } catch (e) { /* noop */ }
            });

            for (const k of Object.keys(volMap)) {
                try {
                    let rawVal = volMap[k];
                    // if rawVal is object, try common numeric properties
                    if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
                        rawVal = rawVal.total ?? rawVal.volume ?? rawVal.htp ?? rawVal.value ?? rawVal.hTP_Affecte ?? 0;
                    }
                    const num = Number(rawVal);
                    if (!isFinite(num)) continue;
                    if (dropZero && Number(num) === 0) continue;

                    const keyStr = String(k || '').trim();
                    const keyNorm = keyStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                    if (keyNorm && canonical[keyNorm]) {
                        out[canonical[keyNorm]] = (out[canonical[keyNorm]] || 0) + Number(num || 0);
                    } else {
                        // try case-insensitive scan of canonical keys
                        let matched = false;
                        for (const candLower of Object.keys(canonical)) {
                            if (candLower === keyNorm) {
                                out[canonical[candLower]] = (out[canonical[candLower]] || 0) + Number(num || 0);
                                matched = true;
                                break;
                            }
                        }
                        if (!matched) {
                            // keep as-is keyed by original key to avoid losing info (lookup later is permissive)
                            out[keyStr] = (out[keyStr] || 0) + Number(num || 0);
                        }
                    }
                } catch (e) {
                    // ignore malformed entry
                }
            }
        } catch (e) {
            console.debug('VolumeRenderer._normalizeVolumesMap failed', e);
        }
        return out;
    }

    /**
     * Fallback : compute volumes per teacher directly from seances array (very defensive).
     * Sums htp-like fields and returns map { teacherName: hours, ... }.
     */
    _computeVolumesFromSeances(seances = []) {
        const map = {};
        if (!Array.isArray(seances)) return map;

        const hoursCandidates = ['hTP_Affecte', 'htp', 'duration', 'hours', 'heures', 'h'];
        const teacherFields = ['enseignants', 'enseignant', 'teachers', 'teacher', 'enseignantsArray'];

        for (const s of seances) {
            if (!s) continue;
            let h = 0;
            // try common keys first
            for (const key of hoursCandidates) {
                if (s[key] !== undefined && s[key] !== null && !isNaN(Number(s[key]))) {
                    h = Number(s[key]);
                    break;
                }
            }
            // heuristic fallback: scan object for a small positive numeric field
            if ((!h || h === 0) && typeof s === 'object') {
                for (const k of Object.keys(s || {})) {
                    const v = s[k];
                    if ((typeof v === 'number' || (typeof v === 'string' && String(v).trim() !== '')) && !isNaN(Number(v))) {
                        const n = Number(v);
                        if (n > 0 && n < 100) { h = n; break; }
                    }
                }
            }

            // find teachers list
            let teachers = null;
            for (const tf of teacherFields) {
                if (s[tf]) {
                    teachers = s[tf];
                    break;
                }
            }
            if (!teachers) {
                // maybe property 'enseignant' single value
                teachers = s.enseignant || s.teacher || null;
            }
            if (!teachers) continue;
            if (!Array.isArray(teachers)) teachers = [teachers];

            // Determine credit per teacher:
            // - For Cours/TD -> split h equally between teachers
            // - For TP -> full h to each teacher
            const type = String(s.type || '').toLowerCase();
            const isTP = type === 'tp' || type.includes('tp');
            const creditPerTeacher = isTP ? h : (h / (teachers.length || 1));

            for (const t of teachers) {
                if (!t) continue;
                let name = '';
                if (typeof t === 'object') {
                    name = t.nom || t.name || t.id || '';
                } else {
                    name = String(t);
                }
                name = String(name || '').trim();
                if (!name) continue;
                map[name] = (map[name] || 0) + (Number(creditPerTeacher) || 0);
            }
        }

        return map;
    }
/** 
     * Retourne une map normalisée { teacherName: hours } pour l'ensemble des enseignants,
     * en privilégiant VolumeService.calculateAllVolumes (source de vérité), puis en
     * retombant sur un fallback calculé directement depuis les séances + volumes stockés.
     *
     * Méthode synchronique : DashboardRenderer et d'autres composants peuvent l'appeler
     * directement pour récupérer les volumes complets même si l'UI de VolumeRenderer est paginée.
     */
    getAnnualTeacherVolumes() {
        try {
            // cache simple pour éviter recalculs répétés pendant le rendu
            if (this._annualTeacherMapCache && typeof this._annualTeacherMapCache === 'object') {
                return this._annualTeacherMapCache;
            }

            const enseignants = (StateManager.state && Array.isArray(StateManager.state.enseignants)) ? StateManager.state.enseignants.slice() : [];
            const allSeances = Array.isArray(StateManager.state.seances) && StateManager.state.seances.length ? StateManager.state.seances : (typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : []);
            const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires || {};
            const storedVolumes = StateManager.state.volumesAutomne || {};
            const sessionLabel = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';

            let combined = {};

            // 1) Prefer VolumeService.calculateAllVolumes if available
            try {
                if (typeof VolumeService !== 'undefined' && VolumeService && typeof VolumeService.calculateAllVolumes === 'function') {
                    const vs = VolumeService.calculateAllVolumes(enseignants, allSeances, volumesSupplementaires || {}, sessionLabel || '', storedVolumes || {}) || {};
                    if (vs && Object.keys(vs).length > 0) {
                        combined = vs;
                    }
                }
            } catch (e) {
                console.warn('VolumeRenderer.getAnnualTeacherVolumes: VolumeService.calculateAllVolumes failed', e);
            }

            // 2) Fallback: use stored volumes and/or compute from seances
            if (!combined || Object.keys(combined).length === 0) {
                try {
                    // start from stored volumes (volumesAutomne etc.)
                    combined = Object.assign({}, storedVolumes || {});

                    // compute from seances and merge (seances-derived values accumulate)
                    const fromSeances = this._computeVolumesFromSeances(allSeances || []);
                    // merge: sum values (storedVolumes may represent only autumn or partial)
                    for (const k of Object.keys(fromSeances || {})) {
                        combined[k] = (Number(combined[k] || 0) + Number(fromSeances[k] || 0));
                    }
                } catch (e) {
                    console.warn('VolumeRenderer.getAnnualTeacherVolumes: fallback computation failed', e);
                    combined = combined || {};
                }
            }

            // Normalize keys against the registered enseignants list
            const normalized = this._normalizeVolumesMap(combined || {}, enseignants || [], { dropZero: false });

            // cache result for the current render lifecycle
            this._annualTeacherMapCache = normalized;
            return normalized;
        } catch (err) {
            console.warn('VolumeRenderer.getAnnualTeacherVolumes unexpected error', err);
            return {};
        }
    }

    /**
     * Vide le cache interne de getAnnualTeacherVolumes.
     * Appeler avant render si l'état a changé.
     */
    clearAnnualTeacherVolumesCache() {
        this._annualTeacherMapCache = null;
    }



    computeProgressPercent(volumeHours, reference) {
        let ref = Number(reference || 0);
        try {
            if ((!ref || ref === 0) && typeof SchedulingService !== 'undefined' && typeof SchedulingService.computeMaxWorkloadForCurrentSession === 'function') {
                ref = Number(SchedulingService.computeMaxWorkloadForCurrentSession() || 0);
            }
        } catch (e) {
            // ignore
        }
        if ((!ref || ref === 0) && StateManager && StateManager.state && StateManager.state.toleranceMaxWorkload) {
            ref = Number(StateManager.state.toleranceMaxWorkload || 0);
        }
        if (!ref || ref <= 0) {
            return Math.min(100, Math.round(volumeHours > 0 ? 100 : 0));
        }
        const pct = Math.round((Number(volumeHours || 0) / ref) * 100);
        return Math.max(0, Math.min(100, pct));
    }

    getProgressColorByReference(volumeHours, reference, tolerance = 16) {
        const vol = Number(volumeHours || 0);
        const ref = Number(reference || 0);
        const tol = Number(tolerance || 0);

        if (!isFinite(ref) || ref === 0) {
            // pas de référence significative
            return vol === 0 ? '#fd7e14' : '#28a745';
        }

        if (vol > (ref + tol)) return '#dc3545'; // rouge
        if (vol < (ref - 16)) return '#fd7e14'; // orange
        return '#28a745'; // vert
    }

    /**
     * Rend le tableau des volumes par enseignant.
     * Supporte calculateAllVolumes sync ou Promise.
     * Persist computed autumn volumes into StateManager.state.volumesAutomne if empty or only zeros.
     *
     * Ajout UI : recherche + per-page + pagination.
     */
    renderTeacherVolumes() {
        // reuse original logic for computing volumes, but return HTML filtered/paginated
        let teachers = [];
        try {
            teachers = TeacherController.getAllTeachersWithStats();
            if (!Array.isArray(teachers) || !teachers.length) {
                teachers = (StateManager.state.enseignants || []).map(n => ({
                    nom: typeof n === 'string' ? n : (n.nom || ''),
                    stats: {}
                }));
            }
        } catch (e) {
            teachers = (StateManager.state.enseignants || []).map(n => ({
                nom: typeof n === 'string' ? n : (n.nom || ''),
                stats: {}
            }));
        }

        const allSeances = StateManager.state.seances || [];
        const allForfaits = StateManager.state.forfaits || [];
        const filieres = StateManager.state.filieres || [];

        const springSeances = (Array.isArray(allSeances) && allSeances.length) ? allSeances.filter(s => {
            const f = filieres.find(fi => String(fi.nom || '').trim().toLowerCase() === String(s.filiere || '').trim().toLowerCase());
            return f && String(f.session || '').toLowerCase().includes('printemps');
        }) : [];

        const autumnSeances = (Array.isArray(allSeances) && allSeances.length) ? allSeances.filter(s => {
            const f = filieres.find(fi => String(fi.nom || '').trim().toLowerCase() === String(s.filiere || '').trim().toLowerCase());
            return f && String(f.session || '').toLowerCase().includes('automne');
        }) : [];

        // reuse helper functions from original file by inlining essential pieces
        const sumHTP = (seances, teacherName) => {
            try {
                const tNameNorm = String(teacherName || '').trim().toLowerCase();
                return seances.reduce((acc, s) => {
                    try {
                        const h = Number(s.hTP_Affecte) || 0;
                        if (!h) return acc;
                        let teachersList = null;
                        if (Array.isArray(s.enseignantsArray) && s.enseignantsArray.length) teachersList = s.enseignantsArray;
                        else if (Array.isArray(s.enseignants) && s.enseignants.length) teachersList = s.enseignants;
                        else if (s.enseignant) teachersList = [s.enseignant];
                        else if (s.teacher) teachersList = Array.isArray(s.teacher) ? s.teacher : [s.teacher];
                        else teachersList = [];

                        if (!teachersList || teachersList.length === 0) return acc;

                        const isMember = teachersList.some(e => {
                            const name = (typeof e === 'object') ? (e.nom || e.name || e.id || '') : String(e || '');
                            return String(name).trim().toLowerCase() === tNameNorm;
                        });
                        if (!isMember) return acc;

                        const type = String(s.type || '').toLowerCase();
                        const isTP = type === 'tp' || type.includes('tp');
                        const credit = isTP ? h : (h / (teachersList.length || 1));
                        return acc + credit;
                    } catch (inner) {
                        return acc;
                    }
                }, 0);
            } catch (e) {
                return 0;
            }
        };

        const sumForfaits = (forfaitsList, teacherName) => {
            return (forfaitsList || [])
                .filter(f => String(f.enseignant || '').trim().toLowerCase() === String(teacherName).trim().toLowerCase())
                .reduce((acc, f) => acc + (Number(f.volumeHoraire) || 0), 0);
        };

        // build an array of teacher rows with computed values
        const teacherRows = teachers.map(teacher => {
            const name = teacher.nom || '';
            const printempsVolume = sumHTP(springSeances, name);
            // autumn volume: prefer autumnSeances if present, otherwise stored volumes
            const storedVolumesRaw = StateManager.state.volumesAutomne || {};
            let persistedFromLS = {};
            try {
                if ((!storedVolumesRaw || Object.keys(storedVolumesRaw).length === 0) && typeof window !== 'undefined' && window.localStorage) {
                    const raw = window.localStorage.getItem('volumesAutomne');
                    if (raw) persistedFromLS = JSON.parse(raw || '{}') || {};
                }
            } catch (e) { /* noop */ }
            const mergedStoredVolumes = Object.assign({}, storedVolumesRaw || {}, persistedFromLS || {});
            let automneVolume = 0;
            if (Array.isArray(autumnSeances) && autumnSeances.length > 0) {
                automneVolume = sumHTP(autumnSeances, name);
            } else {
                const forfaitForTeacher = sumForfaits(allForfaits, name) || 0;
                const normMap = this._normalizeVolumesMap(mergedStoredVolumes, teachers.map(t => t.nom), { dropZero: false });
                if (Object.prototype.hasOwnProperty.call(normMap, name)) {
                    automneVolume = Math.max(0, Number(normMap[name]) - forfaitForTeacher);
                } else {
                    // tolerant lookup
                    const tolerant = Number(this._getValueFromMapTolerance(mergedStoredVolumes, name) || 0);
                    automneVolume = Math.max(0, tolerant - forfaitForTeacher);
                }
            }
            const forfaitVolume = sumForfaits(allForfaits, name);
            const totalVolume = printempsVolume + automneVolume + forfaitVolume;
            return {
                nom: name,
                printemps: printempsVolume,
                automne: automneVolume,
                forfait: forfaitVolume,
                total: totalVolume
            };
        });

        // apply teacher search filter
        const q = String(this.filters.teacherQuery || '').trim().toLowerCase();
        let filtered = teacherRows;
        if (q) {
            filtered = teacherRows.filter(r => String(r.nom || '').toLowerCase().includes(q));
        }

        // sort by total desc
        filtered.sort((a, b) => b.total - a.total);

        // pagination
        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.teachers) || 1);
        const perPage = this.pageSize.teachers || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // controls: search + per-page
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        // reference for colors
        const VHM_annual = (this.annualMetrics && this.annualMetrics.annualVHM) ? this.annualMetrics.annualVHM : (this.computeAnnualMetrics().annualVHM || 0);
        let referenceForColors = Number(VHM_annual || 0);
        const headerSessionRaw = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
        const sessionNorm = normalizeSessionLabel(headerSessionRaw);
        if (sessionNorm === 'autumn' && referenceForColors > 0) referenceForColors = Math.round(referenceForColors / 2);
        try {
            if (!referenceForColors || referenceForColors === 0) {
                referenceForColors = Number(SchedulingService.computeMaxWorkloadForCurrentSession() || 0);
            }
        } catch (e) { /* noop */ }
        const tolerance = Number(StateManager.state.toleranceMaxWorkload || 16);

        // build HTML
        let html = `
        <div class="teacher-volumes">
            <div class="teacher-header">
                <h3>👨‍🏫 Volumes horaires Total Annuel par Enseignant (${total})</h3>
                <div class="teacher-controls">
                    <input type="search" class="teacher-search stats-search" placeholder="Rechercher un enseignant…" value="${safeText(this.filters.teacherQuery || '')}" aria-label="Rechercher un enseignant">
                    <label class="per-page-label">Afficher
                        <select class="per-page-select" data-list="teachers" aria-label="Sélectionner le nombre d'enseignants par page">
                            ${perPageSelectHtml}
                        </select>
                    </label>
                </div>
            </div>

            <table class="volumes-table">
              <thead>
                <tr>
                    <th>Enseignant</th>
                    <th>Printemps (hTP)</th>
                    <th>Automne (hTP)</th>
                    <th>Forfait (hTP)</th>
                    <th>Total annuel (hTP)</th>
                </tr>
              </thead>
              <tbody>
        `;

        pageItems.forEach(row => {
            const pct = this.computeProgressPercent(row.total, referenceForColors);
            const color = this.getProgressColorByReference(row.total, referenceForColors, tolerance);
            const progressHTML = `
            <span class="tvp-progress-wrapper" title="${row.total} h — ${pct}%">
                <span class="tvp-progress-bar" title="${row.total} h" style="display:inline-block; width:84px; height:15px; background:#e9ecef; border-radius:8px; overflow:hidden; vertical-align:middle; position:relative;">
                    <span class="tvp-progress-fill" style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:${color}; transition:width .35s;"></span>
                </span>
                <span class="tvp-progress-text" style="margin-left:8px; font-size:0.9em; color:#495057;">${pct}%</span>
            </span>
            `;
            html += `
    <tr>
        <td><strong>${safeText(row.nom)}</strong></td>
        <td>${safeText(String(row.printemps))}</td>
        <td>${safeText(String(row.automne))}</td>
        <td>${safeText(String(row.forfait))}</td>
        <td>
            ${progressHTML}
            <strong style="margin-left:12px;">${safeText(String(row.total))}</strong>
            <input type="hidden" class="tvi-reference" value="${safeText(row.nom)}" aria-hidden="true" />
        </td>
    </tr>
            `;
        });

        html += `
              </tbody>
            </table>

            <div class="pagination-row">
                ${this._renderPaginationHtml('teachers', page, totalPages)}
            </div>
        </div>
        `;
        return html;
    }

    /**
     * Parcourt le DOM rendu et attache les indicateurs (TeacherVolumeIndicator)
     * aux éléments de référence (input.tvi-reference) insérés dans la cellule Total annuel.
     */
    _attachAllTeacherIndicators() {
        try {
            if (!this.container) return;
            const refs = this.container.querySelectorAll('input.tvi-reference');
            if (!refs || refs.length === 0) return;

            const fn = (typeof attachIndicator === 'function') ? attachIndicator
                : (typeof window.attachIndicator === 'function') ? window.attachIndicator
                    : null;

            if (!fn) {
                console.debug('VolumeRenderer._attachAllTeacherIndicators: attachIndicator not available');
                return;
            }

            refs.forEach(ref => {
                try {
                    fn(ref);
                } catch (e) {
                    console.debug('Failed to attach TVI for', ref, e);
                }
            });
        } catch (e) {
            console.debug('VolumeRenderer._attachAllTeacherIndicators failed', e);
        }
    }

    /**
     * Tolerant extractor: try multiple key shapes to read numeric value from a map for a teacher.
     * (reused from original)
     */
    _getValueFromMapTolerance(map = {}, teacher) {
        if (!map || typeof map !== 'object') return 0;
        const teacherName = (teacher && teacher.nom) ? String(teacher.nom).trim() : String(teacher).trim();
        const teacherId = (teacher && (teacher.id || teacher._id)) ? String(teacher.id || teacher._id).trim() : '';

        if (teacherName && Object.prototype.hasOwnProperty.call(map, teacherName)) return this._extractNumeric(map[teacherName]);
        if (teacherId && Object.prototype.hasOwnProperty.call(map, teacherId)) return this._extractNumeric(map[teacherId]);

        const lowerName = teacherName.toLowerCase();
        for (const k of Object.keys(map)) {
            try {
                if (String(k).trim().toLowerCase() === lowerName) return this._extractNumeric(map[k]);
            } catch (e) { /* noop */ }
        }

        const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normName = normalize(teacherName);
        for (const k of Object.keys(map)) {
            try {
                if (normalize(k) === normName) return this._extractNumeric(map[k]);
            } catch (e) { /* noop */ }
        }

        // substring normalized match
        for (const k of Object.keys(map)) {
            try {
                const kn = normalize(k);
                if (!kn) continue;
                if (normName.indexOf(kn) !== -1 || kn.indexOf(normName) !== -1) {
                    return this._extractNumeric(map[k]);
                }
            } catch (e) { /* noop */ }
        }

        for (const k of Object.keys(map)) {
            try {
                const v = map[k];
                if (v && typeof v === 'object') {
                    const candidateName = (v.nom || v.name || v.teacher) ? String(v.nom || v.name || v.teacher).trim().toLowerCase() : null;
                    const candidateId = (v.id || v._id) ? String(v.id || v._id).trim() : null;
                    if (candidateName && candidateName === lowerName) return this._extractNumeric(v);
                    if (candidateId && teacherId && String(candidateId) === teacherId) return this._extractNumeric(v);
                    if (candidateName && normalize(candidateName) === normName) return this._extractNumeric(v);
                }
            } catch (e) { /* noop */ }
        }

        return 0;
    }

    _extractNumeric(v) {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            const n = Number(v.replace(',', '.'));
            return isFinite(n) ? n : 0;
        }
        if (typeof v === 'object') {
            return Number(v.total ?? v.volume ?? v.htp ?? v.hTP_Affecte ?? v.value ?? 0) || 0;
        }
        return 0;
    }

    renderSubjectVolumes() {
        const subjects = SubjectController.getAllSubjectsWithStats() || [];
        const filieres = StateManager.state.filieres || [];

        // Filtrer par département
        const departement = StateManager.state?.header?.departement || '';
        const subjectsFilteredByDept = filterSubjectsByDepartment(subjects, departement);

        const headerSessionRaw = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
        const normalized = normalizeSessionLabel(headerSessionRaw); // 'autumn'|'spring'|'unknown'
        let sessionLabelHuman = null;
        if (normalized === 'autumn') sessionLabelHuman = 'Automne';
        else if (normalized === 'spring') sessionLabelHuman = 'Printemps';

        // If session unknown -> show all subjects (but put a note)
        let subjectsToShow = subjectsFilteredByDept;
        let noteHtml = '';
        if (!sessionLabelHuman) {
            noteHtml = `<div class="subjects-note">Session non définie — affichage de toutes les matières${departement && departement !== 'Administration' ? ` (département: ${safeText(departement)})` : ''}</div>`;
        } else {
            // collect filiere names for this session
            const filieresForSession = filieres
                .filter(f => String(f.session || '').toLowerCase() === sessionLabelHuman.toLowerCase())
                .map(f => String(f.nom || '').trim())
                .filter(Boolean);

            if (filieresForSession.length === 0) {
                return `
                    <div class="subject-volumes">
                        <h3>📚 Volumes Horaires par Matière (session courante)</h3>
                        <div class="empty-message">Aucune filière configurée pour la session ${safeText(sessionLabelHuman)}${departement && departement !== 'Administration' ? ` (département: ${safeText(departement)})` : ''}.</div>
                    </div>
                `;
            }

            // filter subjects by their configured filiere (support multiple storage shapes)
            subjectsToShow = subjectsFilteredByDept.filter(s => {
                const cfgFiliere = (s.config && s.config.filiere) ? String(s.config.filiere).trim()
                    : (StateManager.state.matiereGroupes && StateManager.state.matiereGroupes[s.nom] ? StateManager.state.matiereGroupes[s.nom].filiere : '');
                return cfgFiliere && filieresForSession.includes(cfgFiliere);
            });

            noteHtml = `<div class="subjects-note">Matières pour la session ${safeText(sessionLabelHuman)}${departement && departement !== 'Administration' ? ` — Département: ${safeText(departement)}` : ''}</div>`;
        }

        // Sort by VHT desc
        subjectsToShow.sort((a, b) => (b.stats?.vht || 0) - (a.stats?.vht || 0));

        if (!subjectsToShow || subjectsToShow.length === 0) {
            return `
                <div class="subject-volumes">
                    <h3>📚 Volumes Horaires par Matière (session courante)</h3>
                    <div class="empty-message">Aucune matière disponible pour la sélection actuelle.</div>
                </div>
            `;
        }

        // Apply subject search filter
        const q = String(this.filters.subjectQuery || '').trim().toLowerCase();
        let filtered = subjectsToShow;
        if (q) {
            filtered = subjectsToShow.filter(s => String(s.nom || '').toLowerCase().includes(q));
        }

        // Pagination
        const total = filtered.length;
        const page = Math.max(1, Number(this.pageState.subjects) || 1);
        const perPage = this.pageSize.subjects || 10;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const start = (page - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // controls
        const perPageOptions = [5, 10, 20, 50];
        const perPageSelectHtml = perPageOptions.map(n => `<option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>`).join('');

        let html = `
            <div class="subject-volumes">
                <div class="subject-header">
                    <h3>📚 Volumes Horaires par Matière (session courante) — ${total} matières</h3>
                    <div class="subject-controls">
                        <input type="search" class="subject-search stats-search" placeholder="Rechercher une matière…" value="${safeText(this.filters.subjectQuery || '')}" aria-label="Rechercher une matière">
                        <label class="per-page-label">Afficher
                            <select class="per-page-select" data-list="subjects" aria-label="Sélectionner le nombre d'éléments par page">
                                ${perPageSelectHtml}
                            </select>
                        </label>
                    </div>
                </div>

                ${noteHtml}
                <table class="volumes-table">
                    <thead>
                        <tr>
                            <th>Matière</th>
                            <th>Filière</th>
                            <th>Sections</th>
                            <th>VHT (hTP)</th>
                            <th>Cours (Planifiés/Attendus)</th>
                            <th>TD (Planifiés/Attendus)</th>
                            <th>TP (Planifiés/Attendus)</th>
                            <th>Enseignants</th>
                            <th>Taux Complétion</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        pageItems.forEach(subject => {
            const completion = subject.stats.completionRate ?? subject.stats.completion ?? 0;
            const completionClass = completion >= 100 ? 'complete' : completion >= 50 ? 'partial' : 'incomplete';

            html += `
                <tr>
                    <td><strong>${safeText(subject.nom)}</strong></td>
                    <td>${safeText((subject.config && subject.config.filiere) || (StateManager.state.matiereGroupes && StateManager.state.matiereGroupes[subject.nom] ? StateManager.state.matiereGroupes[subject.nom].filiere : ''))}</td>
                    <td>${safeText(String((subject.config && subject.config.sections_cours) || (subject.config?.sections_cours) || 0))}</td>
                    <td><strong>${safeText(String(subject.stats.vht || 0))}</strong></td>
                    <td>${safeText(String(subject.stats.plannedCours || 0))}/${safeText(String(subject.stats.expectedCours || 0))}</td>
                    <td>${safeText(String(subject.stats.plannedTD || 0))}/${safeText(String(subject.stats.expectedTD || 0))}</td>
                    <td>${safeText(String(subject.stats.plannedTP || 0))}/${safeText(String(subject.stats.expectedTP || 0))}</td>
                    <td>${safeText(String((subject.stats.enseignants || []).length))}</td>
                    <td class="completion ${completionClass}">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${safeText(String(completion))}%"></div>
                        </div>
                        ${safeText(String(completion))}%
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>

                <div class="pagination-row">
                    ${this._renderPaginationHtml('subjects', page, totalPages)}
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Génère l'HTML des contrôles de pagination pour une liste donnée
     */
    _renderPaginationHtml(listName, currentPage, totalPages) {
        const maxButtons = 7;
        let start = 1;
        let end = totalPages;
        if (totalPages > maxButtons) {
            const half = Math.floor(maxButtons / 2);
            start = Math.max(1, currentPage - half);
            end = Math.min(totalPages, start + maxButtons - 1);
            if (end - start + 1 < maxButtons) {
                start = Math.max(1, end - maxButtons + 1);
            }
        }

        let html = `<button class="pager-btn" data-list="${listName}" data-page="${Math.max(1, currentPage - 1)}" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>`;

        for (let p = start; p <= end; p++) {
            html += `<button class="pager-btn ${p === currentPage ? 'active' : ''}" data-list="${listName}" data-page="${p}">${p}</button>`;
        }

        html += `<button class="pager-btn" data-list="${listName}" data-page="${Math.min(totalPages, currentPage + 1)}" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>`;

        return html;
    }

    /**
     * Handler délégation clics pour pagination
     */
    _onPaginationClick(e) {
        // robust detection
        const btn = (e.target && typeof e.target.closest === 'function') ? e.target.closest('.pager-btn') : (e.target && e.target.classList && e.target.classList.contains('pager-btn') ? e.target : null);
        if (!btn) return;
        if (this.container && !this.container.contains(btn)) return;
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

        const list = btn.getAttribute('data-list');
        const page = parseInt(btn.getAttribute('data-page'), 10) || 1;
        if (!list) return;

        this.pageState[list] = page;
        this.render();

        // scroll to section
        const sectionSelector = list === 'teachers' ? '.teacher-volumes' : (list === 'subjects' ? '.subject-volumes' : null);
        if (sectionSelector) {
            const el = this.container ? this.container.querySelector(sectionSelector) : document.querySelector(sectionSelector);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Handler pour inputs / selects (recherche, per-page)
     */
    _onControlInput(e) {
        const target = e.target;
        if (!target) return;

        // teacher search
        if (target.matches && target.matches('.teacher-search')) {
            const value = target.value || '';
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.teacherQuery = value;
                this.pageState.teachers = 1;
                this.render();
            }, 200);
            return;
        }

        // subject search
        if (target.matches && target.matches('.subject-search')) {
            const value = target.value || '';
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this.filters.subjectQuery = value;
                this.pageState.subjects = 1;
                this.render();
            }, 200);
            return;
        }

        // per-page selector
        if (target.matches && target.matches('.per-page-select')) {
            const list = target.getAttribute('data-list') || 'subjects';
            const n = parseInt(target.value, 10) || this.pageSize[list] || 10;
            this.pageSize[list] = n;
            this.pageState[list] = 1;
            this.render();
            return;
        }
    }
}

// Export d'une instance singleton
const _VolumeRendererInstance = new VolumeRenderer();

// expose a global reference for code that may access the renderer via a global variable
if (typeof window !== 'undefined') {
    try {
        if (!window.EDTVolumeRenderer) window.EDTVolumeRenderer = _VolumeRendererInstance;
    } catch (e) {
        /* noop - defensive */
    }
}

export { VolumeRenderer as VolumeRendererClass };
export default _VolumeRendererInstance;