/**
 * Affiche sous les sélecteurs "Enseignant 1" / "Enseignant 2" du formulaire Séances
 * le volume horaire annuel estimé pour l'enseignant et une barre de progression.
 *
 * Référence utilisée : VHM annuel calculé par VolumeService.calculateAnnualGlobalMetrics()
 * Règles de couleur (demandées) :
 *  - orange : volume < (reference - tolerance)
 *  - vert   : (reference - 16) < volume < (reference + tolerance)
 *  - rouge  : sinon
 *
 * Export : initTeacherVolumePreviews()
 *
 * Remarques :
 * - Le module est tolérant : il tente plusieurs sources (StateManager, StorageService) pour récupérer
 *   sujets / séances par session afin de calculer la référence annuelle.
 * - Si la référence annuelle n'est pas disponible, il retombe sur SchedulingService.computeMaxWorkloadForCurrentSession()
 *   ou sur un fallback à 0.
 */

import StateManager from '../controllers/StateManager.js';
import VolumeService from '../services/VolumeService.js';
import SchedulingService from '../services/SchedulingService.js';
import { normalizeSessionLabel, getStorageSessionKey } from '../utils/session.js';

// Try to dynamically import StorageService if available (non-blocking)
let StorageService = null;
import('../services/StorageService.js').then(m => { StorageService = m.default || m; }).catch(() => { StorageService = null; });

/* -------------------------
   Helpers / DOM builders
   ------------------------- */

function normalizeName(n) {
    if (!n && n !== 0) return '';
    return String(n).trim();
}

/**
 * Nettoie et normalise un label d'enseignant afin de faire correspondre
 * les clés retournées par VolumeService (tolérant aux préfixes, accents, etc.)
 */
function cleanTeacherLabel(label) {
    if (!label && label !== 0) return '';
    let s = String(label).trim();
    // enlever préfixes visuels (★, -, •, etc.)
    s = s.replace(/^[^0-9A-Za-zÀ-ÖØ-öø-ÿ]+/, '');
    // normalisation unicode et suppression diacritiques si possible
    try {
        s = s.normalize('NFKD').replace(/\p{Diacritic}/gu, '');
    } catch (e) {
        // fallback pour environnements sans \p{Diacritic}
        s = s.replace(/[\u0300-\u036f]/g, '');
    }
    return s.trim().toLowerCase();
}

function createPreviewElement(id) {
    const container = document.createElement('div');
    container.className = 'teacher-volume-preview';
    container.id = id;
    container.style.marginTop = '6px';
    container.style.fontSize = '0.9em';

    const row = document.createElement('div');
    row.className = 'tvp-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';

    const valueDiv = document.createElement('div');
    valueDiv.className = 'tvp-value';
    valueDiv.style.minWidth = '70px';
    valueDiv.style.fontWeight = '600';
    valueDiv.textContent = '—';

    const bar = document.createElement('div');
    bar.className = 'tvp-bar';
    Object.assign(bar.style, { flex: '1', background: '#e9ecef', height: '12px', borderRadius: '6px', overflow: 'hidden' });

    const fill = document.createElement('div');
    fill.className = 'tvp-bar-fill';
    Object.assign(fill.style, { height: '100%', width: '0%', background: '#fd7e14' });

    bar.appendChild(fill);

    const percentDiv = document.createElement('div');
    percentDiv.className = 'tvp-percent';
    percentDiv.style.minWidth = '48px';
    percentDiv.style.textAlign = 'right';
    percentDiv.style.fontWeight = '600';
    percentDiv.textContent = '—';

    row.appendChild(valueDiv);
    row.appendChild(bar);
    row.appendChild(percentDiv);

    const sub = document.createElement('div');
    sub.className = 'tvp-sub';
    sub.style.marginTop = '4px';
    sub.style.color = '#6c757d';
    sub.style.fontSize = '0.85em';
    sub.textContent = 'Réf: — | Tol: —';

    container.appendChild(row);
    container.appendChild(sub);
    return container;
}

/* -------------------------
   Data / reference calculation
   ------------------------- */

function getSubjectsForSessionNames() {
    let autumnSubjects = [];
    let springSubjects = [];

    try {
        if (typeof StateManager.getCurrentSessionSubjects === 'function') {
            const current = StateManager.getCurrentSessionSubjects();
            if (Array.isArray(current)) {
                // fallback logic unchanged
            }
        }
    } catch (e) { /* ignore */ }

    try {
        const allSubjects = (typeof StateManager.getSubjects === 'function') ? StateManager.getSubjects() : (StateManager.state && StateManager.state.subjects ? StateManager.state.subjects : []);
        const filieres = StateManager.state && StateManager.state.filieres ? StateManager.state.filieres : [];

        if (Array.isArray(allSubjects) && allSubjects.length > 0) {
            const autumnFilieres = filieres.filter(f => String(f.session || '').toLowerCase().includes('automne') || String(f.session || '').toLowerCase().includes('autumn')).map(f => String(f.nom || '').trim());
            const springFilieres = filieres.filter(f => String(f.session || '').toLowerCase().includes('printemps') || String(f.session || '').toLowerCase().includes('spring')).map(f => String(f.nom || '').trim());

            if (autumnFilieres.length > 0) {
                autumnSubjects = allSubjects.filter(s => !s.filiere || autumnFilieres.includes(String(s.filiere || '').trim()));
            }
            if (springFilieres.length > 0) {
                springSubjects = allSubjects.filter(s => String(s.filiere || '').trim() && springFilieres.includes(String(s.filiere || '').trim()));
            }
            if (autumnSubjects.length === 0) {
                autumnSubjects = allSubjects.filter(s => String(s.session || '').toLowerCase().includes('automne') || String(s.session || '').toLowerCase().includes('autumn'));
            }
            if (springSubjects.length === 0) {
                springSubjects = allSubjects.filter(s => String(s.session || '').toLowerCase().includes('printemps') || String(s.session || '').toLowerCase().includes('spring'));
            }
        }
    } catch (e) { /* ignore */ }

    return { autumnSubjects, springSubjects };
}

function getSessionSeancesFallback() {
    let autumnSeances = [];
    let springSeances = [];
    try {
        if (StorageService && typeof StorageService.loadSessionData === 'function') {
            const a = StorageService.loadSessionData(getStorageSessionKey('autumn')) || {};
            const p = StorageService.loadSessionData(getStorageSessionKey('spring')) || {};
            autumnSeances = a.seances || [];
            springSeances = p.seances || [];
        }
    } catch (e) { /* ignore */ }

    try {
        const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (StateManager.state && StateManager.state.seances ? StateManager.state.seances : []);
        if ((!autumnSeances || autumnSeances.length === 0) && Array.isArray(allSeances) && allSeances.length > 0) {
            autumnSeances = allSeances.filter(s => String(s.session || '').toLowerCase().includes('automne') || String(s.session || '').toLowerCase().includes('autumn'));
        }
        if ((!springSeances || springSeances.length === 0) && Array.isArray(allSeances) && allSeances.length > 0) {
            springSeances = allSeances.filter(s => String(s.session || '').toLowerCase().includes('printemps') || String(s.session || '').toLowerCase().includes('spring'));
        }
    } catch (e) { /* ignore */ }

    return { autumnSeances, springSeances };
}

/**
 * Annual reference calculation (uncached helper)
 *
 * IMPORTANT: If the current session (header) is autumn, we apply the requested rule:
 * reference = annualVHM / 2
 */
async function computeAnnualReferenceAndToleranceUncached() {
    let reference = 0;
    let tolerance = 10;
    try {
        const enseignants = Array.isArray(StateManager.state && StateManager.state.enseignants) ? StateManager.state.enseignants : (typeof StateManager.getEnseignants === 'function' ? StateManager.getEnseignants() : []);

        const { autumnSubjects, springSubjects } = getSubjectsForSessionNames();
        const { autumnSeances, springSeances } = getSessionSeancesFallback();

        const allForfaits = Array.isArray(StateManager.state && StateManager.state.forfaits) ? StateManager.state.forfaits : [];
        const forfaitsAutumn = allForfaits.filter(f => !f.session || String(f.session).toLowerCase().includes('automne') || String(f.session).toLowerCase().includes('autumn'));
        const forfaitsSpring = allForfaits.filter(f => String(f.session).toLowerCase().includes('printemps') || String(f.session).toLowerCase().includes('spring'));

        if (VolumeService && typeof VolumeService.calculateAnnualGlobalMetrics === 'function') {
            const metrics = VolumeService.calculateAnnualGlobalMetrics(
                enseignants,
                autumnSubjects || [],
                autumnSeances || [],
                springSubjects || [],
                springSeances || [],
                {},
                forfaitsAutumn,
                forfaitsSpring
            );
            if (metrics && typeof metrics.annualVHM === 'number') {
                reference = Number(metrics.annualVHM || 0);
            }
        }
    } catch (e) {
        console.warn('TeacherVolumePreview.computeAnnualReferenceAndTolerance: VolumeService annual compute failed', e);
    }

    if ((!reference || reference === 0) && typeof SchedulingService !== 'undefined' && typeof SchedulingService.computeMaxWorkloadForCurrentSession === 'function') {
        try {
            const v = Number(SchedulingService.computeMaxWorkloadForCurrentSession() || 0);
            if (v && v > 0) reference = v;
        } catch (e) { /* ignore */ }
    }

    try {
        if (StateManager && StateManager.state) {
            if (typeof StateManager.state.toleranceMaxWorkload !== 'undefined') {
                tolerance = Number(StateManager.state.toleranceMaxWorkload || tolerance);
            } else if (typeof StateManager.state.tolerance !== 'undefined') {
                tolerance = Number(StateManager.state.tolerance || tolerance);
            }
        }
    } catch (e) { /* ignore */ }

    // Apply autumn rule: if header session is autumn, halve the annual reference
    try {
        const currentSessionName = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
        const sessionNormalized = normalizeSessionLabel(currentSessionName);
        if (sessionNormalized === 'autumn') {
            if (reference > 0) reference = reference / 2;
        }
    } catch (e) {
        // ignore
    }

    reference = Number(reference || 0);
    tolerance = Number(tolerance || 0);
    return { reference, tolerance };
}

// --- Cache / memoization ---
const _cache = {
    volumes: new Map(), // key: sessionOverride||'' -> { value: map, ts }
    annualRef: { value: null, ts: 0 }
};
const CACHE_TTL = 5000; // ms

function isCacheFresh(entryTs) {
    return (Date.now() - entryTs) < CACHE_TTL;
}

/**
 * Extract the "Total (hTP)" numeric value from a VolumeService entry which may be:
 * - a number
 * - an object with columns (we try to find the "Total (hTP)" column or variants)
 */
function extractTotalHtpFromValue(val) {
    if (typeof val === 'number') return Number(val || 0);
    if (!val || typeof val !== 'object') return 0;

    const keys = Object.keys(val);
    const norm = k => String(k || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const exactCandidates = ['total (htp)', 'total (h tp)', 'total (hpt)', 'total (h)', 'total (ht)', 'total_htp', 'total htp', 'total'];

    for (const k of keys) {
        const nk = norm(k);
        if (exactCandidates.includes(nk)) {
            const v = Number(val[k] || 0);
            if (!Number.isNaN(v)) return v;
        }
    }

    for (const k of keys) {
        const nk = norm(k);
        if (nk.includes('total') && (nk.includes('htp') || nk.includes('tp') || nk.includes('h tp'))) {
            const v = Number(val[k] || 0);
            if (!Number.isNaN(v)) return v;
        }
    }

    for (const k of keys) {
        const nk = norm(k);
        if (nk.includes('htp') || nk.includes('tp') || nk.includes('h tp')) {
            const v = Number(val[k] || 0);
            if (!Number.isNaN(v)) return v;
        }
    }

    // last resort: sum all numeric columns
    let sum = 0, foundNumeric = false;
    for (const k of keys) {
        const v = Number(val[k]);
        if (!Number.isNaN(v)) { sum += v; foundNumeric = true; }
    }
    return foundNumeric ? sum : 0;
}

async function computeAllVolumesMapUncached(sessionOverride = null) {
    const out = {};
    try {
        if (typeof VolumeService !== 'undefined' && VolumeService && typeof VolumeService.calculateAllVolumes === 'function') {
            const enseignants = (StateManager.state && Array.isArray(StateManager.state.enseignants)) ? StateManager.state.enseignants : [];
            const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (StateManager.state && StateManager.state.seances ? StateManager.state.seances : []);
            const volumesSupplementaires = (StateManager.state && StateManager.state.enseignantVolumesSupplementaires) ? StateManager.state.enseignantVolumesSupplementaires : {};
            const volumesAutomne = (StateManager.state && StateManager.state.volumesAutomne) ? StateManager.state.volumesAutomne : {};

            // Determine which seances to pass to VolumeService:
            // - by default, use allSeances
            // - if sessionOverride provided, try StorageService.loadSessionData(sessionOverride).seances
            //   otherwise filter allSeances by sessionOverride (autumn/spring keywords)
            let seancesToUse = allSeances;
            if (sessionOverride) {
                try {
                    if (StorageService && typeof StorageService.loadSessionData === 'function') {
                        const loaded = StorageService.loadSessionData(getStorageSessionKey(sessionOverride)) || {};
                        if (Array.isArray(loaded.seances) && loaded.seances.length > 0) {
                            seancesToUse = loaded.seances;
                        }
                    }
                } catch (e) {
                    // ignore storage read errors
                }

                if ((!seancesToUse || seancesToUse.length === 0) && Array.isArray(allSeances) && allSeances.length > 0) {
                    const sLower = String(sessionOverride || '').toLowerCase();
                    if (sLower.includes('automne') || sLower.includes('autumn')) {
                        seancesToUse = allSeances.filter(s => String(s.session || '').toLowerCase().includes('automne') || String(s.session || '').toLowerCase().includes('autumn'));
                    } else if (sLower.includes('printemps') || sLower.includes('spring')) {
                        seancesToUse = allSeances.filter(s => String(s.session || '').toLowerCase().includes('printemps') || String(s.session || '').toLowerCase().includes('spring'));
                    } else {
                        // unknown override string: fallback to allSeances
                        seancesToUse = allSeances;
                    }
                }
            }

            // Call VolumeService with the chosen seances list
            const map = VolumeService.calculateAllVolumes(enseignants, seancesToUse, volumesSupplementaires, sessionOverride || ((StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : ''), volumesAutomne) || {};

            Object.keys(map).forEach(k => {
                const keyNorm = cleanTeacherLabel(k);
                out[keyNorm] = Number(extractTotalHtpFromValue(map[k]) || 0);
            });
        }
    } catch (e) {
        console.warn('TeacherVolumePreview.computeAllVolumesMap error', e);
    }
    return out;
}

async function computeAllVolumesMap(sessionOverride = null) {
    const key = sessionOverride || '';
    const cached = _cache.volumes.get(key);
    if (cached && isCacheFresh(cached.ts)) return cached.value;
    const val = await computeAllVolumesMapUncached(sessionOverride);
    _cache.volumes.set(key, { value: val, ts: Date.now() });
    return val;
}

async function computeAnnualReferenceAndTolerance() {
    const cached = _cache.annualRef;
    if (cached.value && isCacheFresh(cached.ts)) return cached.value;
    const val = await computeAnnualReferenceAndToleranceUncached();
    _cache.annualRef = { value: val, ts: Date.now() };
    return val;
}

/* -------------------------
   Update preview UI
   ------------------------- */

/**
 * For spring session: display spring_total (current) + autumn_total.
 * For autumn: display current (autumn) only.
 */
function updatePreviewForTeacher(name, previewEl, volumesMapCurrent, volumesMapAutumn, reference, tolerance, currentSessionName) {
    const displayValueEl = previewEl.querySelector('.tvp-value');
    const fillEl = previewEl.querySelector('.tvp-bar-fill');
    const percentEl = previewEl.querySelector('.tvp-percent');
    const subEl = previewEl.querySelector('.tvp-sub');

    const key = cleanTeacherLabel(name || '');

    const volumeCurrent = Number(volumesMapCurrent[key] || 0);
    const volumeAutumn = Number((volumesMapAutumn && volumesMapAutumn[key]) || 0);

    const isSpring = typeof currentSessionName === 'string' && (currentSessionName.toLowerCase().includes('printemps') || currentSessionName.toLowerCase().includes('spring'));
    const volumeToDisplay = isSpring ? (volumeCurrent + volumeAutumn) : volumeCurrent;

    let percent = 0;
    if (reference > 0) percent = Math.round((volumeToDisplay / reference) * 100);
    else percent = volumeToDisplay > 0 ? 100 : 0;
    percent = Math.max(0, Math.min(100, percent));

    let color = '#dc3545';
    if (!isFinite(reference) || reference === 0) {
        color = volumeToDisplay === 0 ? '#fd7e14' : '#28a745';
    } else {
        if (volumeToDisplay < (reference - tolerance)) color = '#fd7e14';
        else if ((volumeToDisplay > (reference - 16)) && (volumeToDisplay < (reference + tolerance))) color = '#28a745';
        else color = '#dc3545';
    }

    if (displayValueEl) displayValueEl.textContent = `${volumeToDisplay} h`;
    if (fillEl) {
        fillEl.style.width = percent + '%';
        fillEl.style.background = color;
        fillEl.style.transition = 'width 300ms ease, background-color 300ms ease';
    }
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (subEl) {
        if (isSpring && volumeAutumn > 0) subEl.textContent = `Réf: ${reference} | Tol: ${tolerance} · (incl. ${volumeAutumn}h automne)`;
        else subEl.textContent = `Réf: ${reference} | Tol: ${tolerance}`;
    }
}

/* -------------------------
   Public init function
   ------------------------- */

export async function initTeacherVolumePreviews() {
    const sel1 = document.getElementById('inputEnseignant1');
    const sel2 = document.getElementById('inputEnseignant2');
    if (!sel1 && !sel2) return null;

    // initial maps (current session + explicit autumn)
    let volumesMapCurrent = await computeAllVolumesMap(null);
    let volumesMapAutumn = await computeAllVolumesMap(getStorageSessionKey('autumn'));

    const refTol = await computeAnnualReferenceAndTolerance();
    let reference = refTol.reference;
    let tolerance = refTol.tolerance;

    function ensurePreviewAfter(selectEl, previewId) {
        if (!selectEl) return null;
        let parent = selectEl.closest('.form-group') || selectEl.parentElement || selectEl;
        let existing = parent.querySelector('#' + previewId);
        if (existing) return existing;
        const preview = createPreviewElement(previewId);
        parent.appendChild(preview);
        return preview;
    }

    const preview1 = ensurePreviewAfter(sel1, 'teacherVolumePreview1');
    const preview2 = ensurePreviewAfter(sel2, 'teacherVolumePreview2');

    // simple debounce helper to avoid many recalculations
    const debouncedRefresh = (function () {
        let timer = null;
        return function (fn, wait = 120) {
            clearTimeout(timer);
            timer = setTimeout(fn, wait);
        };
    })();

    async function refreshAndUpdate(selectEl, previewEl) {
        debouncedRefresh(async () => {
            // recompute currentSessionName at refresh-time so we reflect header changes
            const currentSessionName = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';

            volumesMapCurrent = await computeAllVolumesMap(null);
            volumesMapAutumn = await computeAllVolumesMap(getStorageSessionKey('autumn'));
            const rt = await computeAnnualReferenceAndTolerance();
            reference = rt.reference;
            tolerance = rt.tolerance;

            const selectedVal = (selectEl && selectEl.value) ? selectEl.value : '';
            const selectedName = selectedVal || ((selectEl && selectEl.selectedOptions && selectEl.selectedOptions[0]) ? selectEl.selectedOptions[0].textContent : '');
            updatePreviewForTeacher(selectedName, previewEl, volumesMapCurrent, volumesMapAutumn, reference, tolerance, currentSessionName);
        });
    }

    // initial update
    if (sel1 && preview1) refreshAndUpdate(sel1, preview1);
    if (sel2 && preview2) refreshAndUpdate(sel2, preview2);

    // attach listeners and observers (observe childList only to reduce noise)
    if (sel1 && preview1) {
        const handler1 = () => refreshAndUpdate(sel1, preview1);
        sel1.addEventListener('change', handler1);
        const obs1 = new MutationObserver(handler1);
        obs1.observe(sel1, { childList: true });
        observers.push({ elem: sel1, handler: handler1, observer: obs1 });
    }
    if (sel2 && preview2) {
        const handler2 = () => refreshAndUpdate(sel2, preview2);
        sel2.addEventListener('change', handler2);
        const obs2 = new MutationObserver(handler2);
        obs2.observe(sel2, { childList: true });
        observers.push({ elem: sel2, handler: handler2, observer: obs2 });
    }

    return {
        refreshAll: async () => {
            volumesMapCurrent = await computeAllVolumesMap(null);
            volumesMapAutumn = await computeAllVolumesMap(getStorageSessionKey('autumn'));
            const rt = await computeAnnualReferenceAndTolerance();
            reference = rt.reference;
            tolerance = rt.tolerance;
            if (sel1 && preview1) await refreshAndUpdate(sel1, preview1);
            if (sel2 && preview2) await refreshAndUpdate(sel2, preview2);
        },
        // Permet de nettoyer les observers/listeners créés par ce module
        stop: () => {
            try {
                observers.forEach(o => {
                    try {
                        if (o.observer && typeof o.observer.disconnect === 'function') o.observer.disconnect();
                    } catch (e) {}
                    try {
                        if (o.elem && o.handler) o.elem.removeEventListener('change', o.handler);
                    } catch (e) {}
                });
                // clear observers array
                observers.length = 0;
            } catch (e) {
                console.warn('TeacherVolumePreview.stop error', e);
            }
        }
    };
}

export default { initTeacherVolumePreviews };