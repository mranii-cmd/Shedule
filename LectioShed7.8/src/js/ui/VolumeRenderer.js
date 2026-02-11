/**
 * Renderer pour l'affichage des volumes horaires
 * (Patch : persistance automatique des volumes d'automne calculés si l'état ne les contient pas)
 *
 * Ajout : fallback _computeVolumesFromSeances pour calculer les volumes d'automne à partir
 * des séances persistées si ni l'état ni le service ne fournissent de données utiles.
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
    }

    init(containerId = 'volumesContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn(`Container #${containerId} not found`);
        }
    }

    render() {
        if (!this.container) return;

        // Calculer les métriques annuelles et mettre en cache
        this.annualMetrics = this.computeAnnualMetrics();

        const globalHtml = this.renderGlobalMetrics();
        const subjectHtml = this.renderSubjectVolumes();

        const maybeTeacherHtml = this.renderTeacherVolumes();

        if (maybeTeacherHtml && typeof maybeTeacherHtml.then === 'function') {
            // async path
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
            // sync path
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

        // Affichage simplifié : uniquement les métriques annuelles demandées (VHT annuel + VHM annuel)
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
     */
    renderTeacherVolumes() {
        // Associe séance à sa session via la filière
        function getSessionOfSeance(seance, filieres) {
            // Cherche la filière qui correspond
            const f = filieres.find(fil => String(fil.nom || fil.name || '').trim().toLowerCase() === String(seance.filiere || '').trim().toLowerCase());
            // Retourne "printemps", "automne" (en minuscules pour le filtre)
            return f && f.session ? String(f.session).trim().toLowerCase() : '';
        }
        function filterSeancesBySession(seances, filieres, sessionType) {
            return seances.filter(s => getSessionOfSeance(s, filieres).includes(sessionType));
        }
        function sumHTP(seances, teacherName) {
            // - For Cours and TD: split hTP_Affecte equally between participating teachers
            // - For TP: each teacher receives the full hTP_Affecte (existing behaviour)
            try {
                const tNameNorm = String(teacherName || '').trim().toLowerCase();
                return seances.reduce((acc, s) => {
                    try {
                        const h = Number(s.hTP_Affecte) || 0;
                        if (!h) return acc;

                        // determine teachers list for this seance
                        let teachers = null;
                        if (Array.isArray(s.enseignantsArray) && s.enseignantsArray.length) teachers = s.enseignantsArray;
                        else if (Array.isArray(s.enseignants) && s.enseignants.length) teachers = s.enseignants;
                        else if (s.enseignant) teachers = [s.enseignant];
                        else if (s.teacher) teachers = Array.isArray(s.teacher) ? s.teacher : [s.teacher];
                        else teachers = [];

                        if (!teachers || teachers.length === 0) return acc;

                        // check if this teacher is part of the teachers list
                        const isMember = teachers.some(e => {
                            const name = (typeof e === 'object') ? (e.nom || e.name || e.id || '') : String(e || '');
                            return String(name).trim().toLowerCase() === tNameNorm;
                        });
                        if (!isMember) return acc;

                        const type = String(s.type || '').toLowerCase();
                        const isTP = type === 'tp' || type.includes('tp');
                        const credit = isTP ? h : (h / (teachers.length || 1));
                        return acc + credit;
                    } catch (inner) {
                        return acc;
                    }
                }, 0);
            } catch (e) {
                return 0;
            }
        }
        function sumForfaits(forfaitsList, teacherName) {
            return (forfaitsList || [])
                .filter(f => String(f.enseignant || '').trim().toLowerCase() === String(teacherName).trim().toLowerCase())
                .reduce((acc, f) => acc + (Number(f.volumeHoraire) || 0), 0);
        }
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

        // ✅ Filtrage indirect des séances par session via filière
        const springSeances = filterSeancesBySession(allSeances, filieres, 'printemps');
        const autumnSeances = filterSeancesBySession(allSeances, filieres, 'automne');
        // Normalize stored volumes d'automne (if any) into canonical teacher names
        // Determine current session (normalize) to decide if forfaits must be added
        const headerSessionRawForRenderer = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
        const normalizedSessionForRenderer = normalizeSessionLabel(headerSessionRawForRenderer); // 'autumn'|'spring'|'unknown'
        // Only include forfaits in totals when rendering the autumn session (forfait already counted in stored autumn volumes)
        const includeForfaitInTotals = (normalizedSessionForRenderer === 'autumn');
        const storedVolumesRaw = StateManager.state.volumesAutomne || {};
        // try also localStorage as a last-resort fallback (if StateManager didn't load it)
        let persistedFromLS = {};
        try {
            if ((!storedVolumesRaw || Object.keys(storedVolumesRaw).length === 0) && typeof window !== 'undefined' && window.localStorage) {
                const raw = window.localStorage.getItem('volumesAutomne');
                if (raw) persistedFromLS = JSON.parse(raw || '{}') || {};
            }
        } catch (e) {
            // ignore
        }
        const mergedStoredVolumes = Object.assign({}, storedVolumesRaw || {}, persistedFromLS || {});
        const normalizedStoredVolumes = this._normalizeVolumesMap(mergedStoredVolumes, teachers.map(t => t.nom), { dropZero: false });

        // helper to get autumn volume either from actual autumnSeances or from stored volumes
        const getAutumnVolumeFor = (teacherName) => {
            // prefer actual autumn seances if present (pure séance-sum, SANS forfait)
            if (Array.isArray(autumnSeances) && autumnSeances.length > 0) {
                return sumHTP(autumnSeances, teacherName);
            }
            // if we must use a stored value, subtract forfait (to avoid double-count)
            const forfaitForTeacher = sumForfaits(allForfaits, teacherName) || 0;
            if (normalizedStoredVolumes && Object.prototype.hasOwnProperty.call(normalizedStoredVolumes, teacherName)) {
                const stored = Number(normalizedStoredVolumes[teacherName] || 0);
                return Math.max(0, stored - forfaitForTeacher);
            }
            // final tolerant lookup (different shapes / keys)
            try {
                const stored = Number(this._getValueFromMapTolerance(mergedStoredVolumes, teacherName) || 0);
                return Math.max(0, stored - forfaitForTeacher);
            } catch (e) {
                return 0;
            }
        };

        teachers.sort((a, b) => {
            const aForfait = sumForfaits(allForfaits, a.nom) || 0;
            const bForfait = sumForfaits(allForfaits, b.nom) || 0;
            const aTotal = (sumHTP(springSeances, a.nom) || 0) + (getAutumnVolumeFor(a.nom) || 0) + aForfait;
            const bTotal = (sumHTP(springSeances, b.nom) || 0) + (getAutumnVolumeFor(b.nom) || 0) + bForfait;
            return bTotal - aTotal;
        });
        // Reference used to compute progress percent & color (align with VolumeRenderer logic)
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
        let html = `
        <div class="teacher-volumes">
            <h3>👨‍🏫 Volumes horaires Total Annuel par Enseignant (Printemps + Automne + Forfait)</h3>
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
        teachers.forEach(teacher => {
            // volumes sessions (séances uniquement)
            const printempsVolume = sumHTP(springSeances, teacher.nom);
            const automneVolume = getAutumnVolumeFor(teacher.nom);

            // forfait : colonne dédiée (ne jamais l'ajouter dans printemps/automne)
            const forfaitVolume = sumForfaits(allForfaits, teacher.nom);

            // total annuel = printemps + automne + forfait (forfait compté UNE seule fois)
            const totalVolume = printempsVolume + automneVolume + forfaitVolume;

            // build progress indicator (pct + color) for the Total annuel cell
            const pct = this.computeProgressPercent(totalVolume, referenceForColors);
            const color = this.getProgressColorByReference(totalVolume, referenceForColors, tolerance);
            const progressHTML = `
        <span class="tvp-progress-wrapper" title="${totalVolume} h — ${pct}%">
            <span class="tvp-progress-bar" style="display:inline-block; width:84px; height:15px; background:#e9ecef; border-radius:8px; overflow:hidden; vertical-align:middle; position:relative;">
                <span class="tvp-progress-fill" style="position:absolute; left:0; top:0; bottom:0; width:${pct}%; background:${color}; transition:width .35s;"></span>
            </span>
            <span class="tvp-progress-text" style="margin-left:8px; font-size:0.9em; color:#495057;">${pct}%</span>
        </span>
    `;

            html += `
    <tr>
        <td><strong>${safeText(teacher.nom)}</strong></td>
        <td>${safeText(String(printempsVolume))}</td>
        <td>${safeText(String(automneVolume))}</td>
        <td>${safeText(String(forfaitVolume))}</td>
        <td>
            ${progressHTML}
            <strong style="margin-left:12px;">${safeText(String(totalVolume))}</strong>
            <!-- anchor for TeacherVolumeIndicator: hidden input contains teacher identifier -->
            <input type="hidden" class="tvi-reference" value="${safeText(teacher.nom)}" aria-hidden="true" />
        </td>
    </tr>
`;
        });
        html += `
                </tbody>
            </table>
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

            // choisir la fonction à utiliser (préférence pour import)
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

        let html = `
            <div class="subject-volumes">
                <h3>📚 Volumes Horaires par Matière (session courante)</h3>
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

        subjectsToShow.forEach(subject => {
            const completion = subject.stats.completionRate;
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
            </div>
        `;

        return html;
    }

    getAnnualTeacherVolumes() {
        // Tentatives non‑recursives pour récupérer une map teacher->hours depuis le renderer ou autres sources
        try {
            // 1) méthodes alternatives si elles existent (ne surtout pas appeler this.getAnnualTeacherVolumes)
            if (typeof this.getTeacherAnnualMap === 'function') {
                const m = this.getTeacherAnnualMap();
                if (m && Object.keys(m).length) return m;
            }
            if (typeof this.getVolumes === 'function') {
                const m = this.getVolumes();
                if (m && Object.keys(m).length) return m;
            }

            // 2) propriétés cache/nommées souvent présentes
            if (this.annualTeacherVolumes && typeof this.annualTeacherVolumes === 'object' && Object.keys(this.annualTeacherVolumes).length) {
                return this.annualTeacherVolumes;
            }
            if (this.annualVolumes && typeof this.annualVolumes === 'object' && Object.keys(this.annualVolumes).length) {
                return this.annualVolumes;
            }
            if (this.teacherAnnualVolumes && typeof this.teacherAnnualVolumes === 'object' && Object.keys(this.teacherAnnualVolumes).length) {
                return this.teacherAnnualVolumes;
            }

            // 3) objet this.data / this.metrics / this.state probe (conservateur)
            const probeCandidates = [this.data, this.metrics, this.state, this];
            for (const probe of probeCandidates) {
                if (probe && typeof probe === 'object') {
                    const out = {};
                    const candKeys = ['total', 'annual', 'volume', 'h', 'hTP', 'v', 'value', 'hours'];
                    for (const k of Object.keys(probe)) {
                        const v = probe[k];
                        if (typeof v === 'number' && !isNaN(v)) out[k] = v;
                        else if (v && typeof v === 'object') {
                            for (const ck of candKeys) {
                                if (v[ck] !== undefined && !isNaN(Number(v[ck]))) {
                                    out[k] = Number(v[ck]);
                                    break;
                                }
                            }
                        }
                    }
                    if (Object.keys(out).length) return out;
                }
            }
        } catch (e) {
            console.warn('VolumeRenderer.getAnnualTeacherVolumes: erreur lecture interne', e);
        }

        // Fallback : demander au VolumeService (logique métier)
        try {
            if (typeof VolumeService !== 'undefined' && VolumeService && typeof VolumeService.calculateAllVolumes === 'function') {
                const enseignants = (typeof StateManager !== 'undefined' && StateManager.state && Array.isArray(StateManager.state.enseignants))
                    ? StateManager.state.enseignants
                    : [];
                const allSeances = (typeof StateManager !== 'undefined' && typeof StateManager.getSeances === 'function')
                    ? StateManager.getSeances()
                    : [];

                const combined = VolumeService.calculateAllVolumes(
                    enseignants,
                    allSeances,
                    (StateManager.state && StateManager.state.enseignantVolumesSupplementaires) || {},
                    (StateManager.state && StateManager.state.header && StateManager.state.header.session) || '',
                    (StateManager.state && StateManager.state.volumesAutomne) || {}
                ) || {};

                if (combined && Object.keys(combined).length) return combined;
            }
        } catch (e) {
            console.warn('VolumeRenderer.getAnnualTeacherVolumes: erreur fallback VolumeService', e);
        }

        // Dernier recours : probe profond sur this.* comme avant
        try {
            const probe = this.annualMetrics || this.data || this.metrics || this.state || this;
            if (probe && typeof probe === 'object') {
                const out = {};
                Object.keys(probe).forEach(k => {
                    const v = probe[k];
                    if (typeof v === 'number' && !isNaN(v)) out[k] = v;
                    else if (v && typeof v === 'object') {
                        const candKeys = ['total', 'annual', 'volume', 'h', 'hTP', 'v', 'value', 'hours'];
                        for (const ck of candKeys) {
                            if (v[ck] !== undefined && !isNaN(Number(v[ck]))) {
                                out[k] = Number(v[ck]);
                                break;
                            }
                        }
                    }
                });
                if (Object.keys(out).length) return out;
            }
        } catch (e) {
            console.warn('VolumeRenderer.getAnnualTeacherVolumes: deep probe failed', e);
        }

        return {};
    }
}

// Export d'une instance singleton
const _VolumeRendererInstance = new VolumeRenderer();

// expose a global reference for code that may access the renderer via a global variable
if (typeof window !== 'undefined') {
    try {
        // only set if not already set to avoid clobbering test harnesses
        if (!window.EDTVolumeRenderer) window.EDTVolumeRenderer = _VolumeRendererInstance;
    } catch (e) {
        /* noop - defensive */
    }
}

export { VolumeRenderer as VolumeRendererClass };
export default _VolumeRendererInstance;