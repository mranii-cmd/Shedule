/**
 * TeacherVolumeIndicator
 * Robust indicator aligned with VolumeRenderer behavior:
 *  - Uses VolumeService.calculateAllVolumes(...) as source of truth.
 *  - Passes volumesAutomne to VolumeService ONLY when current session is Printemps.
 *  - Does NOT add autumn volumes a second time (avoids double-count).
 *  - Normalizes StateManager.state.volumesAutomne (case/diacritics-insensitive matching,
 *    drops zero/non-numeric entries) so residual/imported zeros don't leak into totals.
 *
 * Exports:
 *  - attachIndicator(selectEl)
 *  - updateAttached(selectEl)
 *  - detachIndicator(selectEl)
 *
 * Assumptions:
 *  - VolumeService.calculateAllVolumes exists and returns a map (sync or Promise).
 *  - StateManager is available and holds current in-memory state.
 */

import StateManager from '../controllers/StateManager.js';
import VolumeService from '../services/VolumeService.js';
import VolumeRenderer from './VolumeRenderer.js';
import SchedulingService from '../services/SchedulingService.js';
import StorageAdapter from '../services/StorageAdapter.js'; // optional adapter (StorageService or DatabaseService)
import { getStorageSessionKey } from '../utils/session.js';

/* ----------------- DOM helpers ----------------- */
function createDOMIndicator(referenceSelect) {
  const wrapper = document.createElement('div');
  wrapper.className = 'teacher-volume-indicator';
  wrapper.style.marginTop = '6px';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '8px';

  const barOuter = document.createElement('div');
  barOuter.className = 'tvi-bar-outer';
  barOuter.style.width = '120px';
  barOuter.style.height = '15px';
  barOuter.style.background = '#e9ecef';
  barOuter.style.borderRadius = '8px';
  barOuter.style.overflow = 'hidden';
  barOuter.style.position = 'relative';

  const barInner = document.createElement('div');
  barInner.className = 'tvi-bar-inner';
  barInner.style.height = '100%';
  barInner.style.width = '0%';
  barInner.style.transition = 'width 300ms ease, background-color 300ms';
  barInner.style.background = '#28a745';

  barOuter.appendChild(barInner);

  const label = document.createElement('div');
  label.className = 'tvi-label';
  label.style.fontSize = '0.9em';
  label.style.color = '#495057';
  label.textContent = '';

  wrapper.appendChild(barOuter);
  wrapper.appendChild(label);

  try {
    if (referenceSelect && referenceSelect.parentNode) {
      if (referenceSelect.nextSibling) referenceSelect.parentNode.insertBefore(wrapper, referenceSelect.nextSibling);
      else referenceSelect.parentNode.appendChild(wrapper);
    }
  } catch (e) { /* noop */ }

  return { wrapper, barInner, label };
}

/* ------------- utility helpers --------------- */
/**
 * Normalize a volumes map (e.g. StateManager.state.volumesAutomne or VolumeService result)
 * - Map keys to canonical teacher names found in enseignants list (case+diacritics insensitive).
 * - Keep numeric values only. Optionally drop zero entries (default true).
 */
function normalizeVolumesMap(volMap = {}, enseignants = [], { dropZero = true } = {}) {
  const out = {};
  try {
    if (!volMap || typeof volMap !== 'object') return out;

    // canonical lookup: lowerNormalized -> canonicalName
    const canonical = {};
    (Array.isArray(enseignants) ? enseignants : []).forEach(t => {
      try {
        const name = String(t || '').trim();
        if (!name) return;
        const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        canonical[lower] = name;
      } catch (e) { /* noop */ }
    });

    for (const rawKey of Object.keys(volMap)) {
      try {
        let rawVal = volMap[rawKey];
        // if object, try common numeric properties
        if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
          rawVal = rawVal.total ?? rawVal.volume ?? rawVal.htp ?? rawVal.value ?? rawVal.hTP_Affecte ?? 0;
        }
        const num = Number(rawVal);
        if (!isFinite(num)) continue;
        if (dropZero && Number(num) === 0) continue;

        const keyStr = String(rawKey || '').trim();
        const keyNorm = keyStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        if (keyNorm && canonical[keyNorm]) {
          out[canonical[keyNorm]] = (out[canonical[keyNorm]] || 0) + num;
        } else {
          // try case-insensitive match against canonical keys
          let matched = false;
          for (const candLower of Object.keys(canonical)) {
            if (candLower === keyNorm) {
              out[canonical[candLower]] = (out[canonical[candLower]] || 0) + num;
              matched = true;
              break;
            }
          }
          if (!matched) {
            // keep original key (best-effort)
            out[keyStr] = (out[keyStr] || 0) + num;
          }
        }
      } catch (e) {
        // ignore malformed entries
      }
    }
  } catch (e) {
    console.debug('normalizeVolumesMap failed', e);
  }
  return out;
}

/**
 * Find teacher's value in a volume map using tolerant matching (direct key, teacher list, case-insensitive).
 */
function findVolumeInMap(volMap = {}, teacherIdentifier, enseignantsList = []) {
  if (!volMap || typeof volMap !== 'object') return 0;
  const key = String(teacherIdentifier || '').trim();
  if (key === '') return 0;

  if (Object.prototype.hasOwnProperty.call(volMap, key)) return Number(volMap[key] || 0);

  // try enseignants list match
  if (Array.isArray(enseignantsList) && enseignantsList.length) {
    for (const t of enseignantsList) {
      if (!t) continue;
      const tKey = (typeof t === 'object') ? (t.nom || t.id || t.name) : t;
      if (!tKey) continue;
      try {
        if (String(tKey).trim().toLowerCase() === key.trim().toLowerCase()) {
          if (Object.prototype.hasOwnProperty.call(volMap, tKey)) return Number(volMap[tKey] || 0);
        }
      } catch (e) { /* noop */ }
    }
  }

  // case-insensitive scan of map keys
  const lower = key.trim().toLowerCase();
  for (const k of Object.keys(volMap)) {
    try {
      if (String(k).trim().toLowerCase() === lower) return Number(volMap[k] || 0);
    } catch (e) { /* noop */ }
  }

  return 0;
}

/* ---------------- core logic ----------------- */
/**
 * Get teacher volume aligned with VolumeRenderer:
 * - Ask VolumeService.calculateAllVolumes(...) for the session total.
 * - Pass volumesAutomne ONLY when session is Printemps (so VolumeService will include it).
 * - Do NOT add autumn separately here (avoids double additions).
 * - Normalize volumesAutomne from state to avoid residual/import effects.
 */
async function getTeacherVolume(teacherIdentifier) {
  if (!teacherIdentifier) return 0;

  const enseignants = (StateManager.state && Array.isArray(StateManager.state.enseignants)) ? StateManager.state.enseignants : [];
  const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (StateManager.state && StateManager.state.seances) || [];
  const volumesSupplementaires = (StateManager.state && StateManager.state.enseignantVolumesSupplementaires) || {};
  const sessionLabel = (StateManager.state && StateManager.state.header && StateManager.state.header.session) ? StateManager.state.header.session : '';
  const isSpring = /\b(printemps|spring)\b/i.test(String(sessionLabel || ''));

  // normalize state's volumesAutomne (drop zeros/residuals)
  const normalizedStateVolumesAutumn = normalizeVolumesMap(StateManager.state.volumesAutomne || {}, enseignants, { dropZero: true });

  // choose volumesAutomne param only when spring
  const volumesAutomneParam = isSpring ? normalizedStateVolumesAutumn : {};

  try {
    if (VolumeService && typeof VolumeService.calculateAllVolumes === 'function') {
      const maybe = VolumeService.calculateAllVolumes(
        enseignants,
        allSeances,
        volumesSupplementaires,
        sessionLabel,
        volumesAutomneParam
      );
      const vols = (maybe && typeof maybe.then === 'function') ? await maybe : (maybe || {});
      const val = findVolumeInMap(vols, teacherIdentifier, enseignants);
      return Number(val || 0);
    }
  } catch (e) {
    console.warn('TeacherVolumeIndicator.getTeacherVolume: calculateAllVolumes failed', e);
  }

  // Fallback conservative: sum session seances + forfait once
  try {
    const curSessionNorm = String(sessionLabel || '').trim().toLowerCase();
    let total = 0;
    for (const s of (allSeances || [])) {
      if (!s) continue;
      const sSession = String(s.session || s.sessionLabel || (s.header && s.header.session) || '').trim().toLowerCase();
      if (sSession && curSessionNorm && sSession !== curSessionNorm) continue;
      const teachers = s.enseignants || s.enseignantsArray || s.teachers || s.enseignant || s.teacher || [];
      const matched = Array.isArray(teachers)
        ? teachers.some(t => {
            if (!t) return false;
            const candidate = (typeof t === 'object') ? (t.nom || t.id || t.name) : t;
            try { return String(candidate).trim().toLowerCase() === String(teacherIdentifier).trim().toLowerCase(); } catch (e) { return false; }
          })
        : (String(teachers).trim().toLowerCase() === String(teacherIdentifier).trim().toLowerCase());
      if (matched) {
        const h = Number(s.hTP_Affecte ?? s.htp ?? s.duration ?? 0) || 0;
        total += h;
      }
    }

    // forfait fallback
    let forfait = 0;
    try {
      const enseignantsList = (StateManager.state && StateManager.state.enseignants) || [];
      const teacherRecord = (Array.isArray(enseignantsList) ? enseignantsList.find(t => {
        if (!t) return false;
        const idOrName = (typeof t === 'object') ? (t.id || t.nom || t.name) : t;
        return String(idOrName).trim().toLowerCase() === String(teacherIdentifier).trim().toLowerCase();
      }) : null);
      if (teacherRecord) forfait = Number(teacherRecord.forfait ?? teacherRecord.forfaitHTP ?? teacherRecord.forfait_htp ?? 0) || 0;
      if ((!forfait || forfait === 0) && volumesSupplementaires) {
        const vsKey = String(teacherIdentifier);
        if (Object.prototype.hasOwnProperty.call(volumesSupplementaires, vsKey)) {
          const vs = volumesSupplementaires[vsKey];
          if (typeof vs === 'number') forfait = Number(vs) || 0;
        }
      }
    } catch (e) { /* noop */ }

    total += forfait;
    return Number(total || 0);
  } catch (e) {
    console.warn('TeacherVolumeIndicator.getTeacherVolume fallback failed', e);
    return 0;
  }
}

/* --------------- average & visuals -------------- */
async function getAverageVolume() {
  try {
    const enseignants = (StateManager.state && StateManager.state.enseignants) || [];
    if (!enseignants || enseignants.length === 0) return 0;

    try {
      if (VolumeService && typeof VolumeService.calculateAllVolumes === 'function') {
        const allSeances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (StateManager.state && StateManager.state.seances) || [];
        const maybe = VolumeService.calculateAllVolumes(
          enseignants,
          allSeances,
          (StateManager.state && StateManager.state.enseignantVolumesSupplementaires) || {},
          (StateManager.state && StateManager.state.header && StateManager.state.header.session) || '',
          // pass normalized volumesAutomne only if current session is spring
          (/\b(printemps|spring)\b/i.test(String((StateManager.state && StateManager.state.header && StateManager.state.header.session) || '')))
            ? normalizeVolumesMap(StateManager.state.volumesAutomne || {}, enseignants, { dropZero: true })
            : {}
        );
        const vols = (maybe && typeof maybe.then === 'function') ? await maybe : (maybe || {});
        const vals = Object.values(vols || {}).map(v => Number(v || 0));
        if (vals.length) return vals.reduce((s, x) => s + x, 0) / vals.length;
      }
    } catch (e) { /* fallback below */ }

    const promises = enseignants.map(t => {
      const idOrName = (t && (t.id || t.nom)) ? (t.id || t.nom) : t;
      return getTeacherVolume(idOrName);
    });
    const vals = await Promise.all(promises);
    const nums = vals.map(v => Number(v || 0));
    if (nums.length === 0) return 0;
    return nums.reduce((s, x) => s + x, 0) / nums.length;
  } catch (e) {
    return 0;
  }
}

function getReferenceForColors() {
  try {
    const renderer = VolumeRenderer || (window && window.EDTVolumeRenderer) || null;
    let ref = 0;
    if (renderer) {
      if (renderer.annualMetrics && typeof renderer.annualMetrics.annualVHM !== 'undefined') {
        ref = Number(renderer.annualMetrics.annualVHM || 0);
      } else if (typeof renderer.computeAnnualMetrics === 'function') {
        try {
          const am = renderer.computeAnnualMetrics();
          if (am && typeof am.annualVHM !== 'undefined') ref = Number(am.annualVHM || 0);
        } catch (e) { /* noop */ }
      }
    }

    const sessionRaw = (StateManager.state && StateManager.state.header && StateManager.state.header.session) || '';
    const isAutumn = /\b(automne|autumn)\b/i.test(String(sessionRaw));
    if (isAutumn && ref > 0) ref = Math.round(ref / 2);

    if ((!ref || ref === 0) && typeof SchedulingService !== 'undefined' && typeof SchedulingService.computeMaxWorkloadForCurrentSession === 'function') {
      try {
        ref = Number(SchedulingService.computeMaxWorkloadForCurrentSession() || 0);
      } catch (e) { /* noop */ }
    }

    return Number(ref || 0);
  } catch (e) {
    return 0;
  }
}

function pickColorFromRendererOrFallback(teacherVol, avg) {
  try {
    const renderer = VolumeRenderer || (window && window.EDTVolumeRenderer) || null;
    const reference = getReferenceForColors();
    const tolerance = Number((StateManager.state && StateManager.state.toleranceMaxWorkload) || 16);

    if (renderer && typeof renderer.getProgressColorByReference === 'function') {
      return renderer.getProgressColorByReference(Number(teacherVol || 0), Number(reference || 0), Number(tolerance || 16));
    }
  } catch (e) { /* noop */ }

  const safeAvg = (avg && avg > 0) ? avg : Math.max(1, teacherVol);
  const ratio = teacherVol / safeAvg;
  if (ratio >= 0.95 && ratio <= 1.05) return '#ff9800';
  if (ratio > 1.05) return '#dc3545';
  return '#28a745';
}

function computePercentViaRendererOrFallback(teacherVol, avg) {
  try {
    const renderer = VolumeRenderer || (window && window.EDTVolumeRenderer) || null;
    const reference = getReferenceForColors();
    if (renderer && typeof renderer.computeProgressPercent === 'function') {
      return Number(renderer.computeProgressPercent(Number(teacherVol || 0), Number(reference || 0)) || 0);
    }
  } catch (e) { /* noop */ }

  const safeAvg = (avg && avg > 0) ? avg : Math.max(1, teacherVol);
  const denom = safeAvg * 1.2;
  const pct = denom > 0 ? Math.min(100, Math.round((teacherVol / denom) * 100)) : 0;
  return pct;
}

function applyVisual(barInner, labelEl, teacherVol, avg) {
  const color = pickColorFromRendererOrFallback(teacherVol, avg);
  const pct = computePercentViaRendererOrFallback(teacherVol, avg);

  try {
    barInner.style.width = `${pct}%`;
    barInner.style.background = color;
    const rounded = Number(Math.round((Number(teacherVol) || 0) * 10) / 10);
    const sessionRaw = (StateManager.state && StateManager.state.header && StateManager.state.header.session) || '';
    const isSpring = /\b(printemps|spring)\b/i.test(String(sessionRaw));
    if (isSpring) {
      labelEl.textContent = `Volume annuel: ${rounded} hTP`;
    } else {
      labelEl.textContent = `Total (htp): ${rounded} hTP`;
    }
  } catch (e) { /* noop */ }
}

/* ---------- attach/update/detach UI API ---------- */
export function attachIndicator(selectEl) {
  if (!selectEl) return null;
  try {
    if (selectEl._tviAttached) return selectEl._tviRef || null;

    const { wrapper, barInner, label } = createDOMIndicator(selectEl);
    const ref = { wrapper, barInner, label };

    const update = async (teacherName) => {
      try {
        const vol = await getTeacherVolume(teacherName);
        const avg = await getAverageVolume();
        applyVisual(barInner, label, vol, avg);
      } catch (e) {
        try { barInner.style.width = '0%'; label.textContent = ''; } catch (e2) {}
      }
    };

    const handler = (e) => update(e.target.value);
    selectEl.addEventListener('change', handler);

    // initial
    update(selectEl.value);

    selectEl._tviAttached = true;
    selectEl._tviRef = { ref, update, handler };

    return selectEl._tviRef;
  } catch (e) {
    console.debug('TeacherVolumeIndicator.attachIndicator failed', e);
    return null;
  }
}

export function updateAttached(selectEl) {
  if (!selectEl || !selectEl._tviAttached) return;
  try {
    const { update } = selectEl._tviRef || {};
    if (typeof update === 'function') update(selectEl.value);
  } catch (e) { /* noop */ }
}

export function detachIndicator(selectEl) {
  if (!selectEl || !selectEl._tviAttached) return;
  try {
    const { handler, ref } = selectEl._tviRef || {};
    if (handler) selectEl.removeEventListener('change', handler);
    if (ref && ref.wrapper && ref.wrapper.parentNode) ref.wrapper.parentNode.removeChild(ref.wrapper);
  } catch (e) { /* noop */ }
  delete selectEl._tviAttached;
  delete selectEl._tviRef;
}