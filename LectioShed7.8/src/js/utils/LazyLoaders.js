// Utilitaires de chargement dynamique de scripts (lazy-load)
// Usage : await loadXLSX(); puis utiliser window.XLSX
export async function loadScript(src, { timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    // Si déjà chargé (par url strict) on essaie de détecter
    const existing = Array.from(document.scripts).find(s => s.src && s.src.includes(src));
    if (existing && (window.XLSX || existing.getAttribute('data-loaded') === 'true')) {
      return resolve(existing);
    }

    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;

    const t = setTimeout(() => {
      s.onerror = s.onload = null;
      reject(new Error(`Timeout loading ${src}`));
    }, timeout);

    s.onload = () => {
      clearTimeout(t);
      s.setAttribute('data-loaded', 'true');
      resolve(s);
    };
    s.onerror = (ev) => {
      clearTimeout(t);
      reject(new Error(`Failed to load script ${src}`));
    };

    document.head.appendChild(s);
  });
}

/**
 * Charge XLSX si nécessaire.
 * Stratégie :
 * 1) si window.XLSX existe → retourne instantanément
 * 2) essayer de charger la version locale 'lib/xlsx.full.min.js'
 * 3) fallback sur CDN si le local échoue
 *
 * @param {{local?:string, cdn?:string, timeout?:number}} opts
 * @returns {Promise<any>} window.XLSX
 */
export async function loadXLSX(opts = {}) {
  const local = opts.local || 'lib/xlsx.full.min.js';
  const cdn = opts.cdn || 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
  const timeout = opts.timeout || 10000;

  if (typeof window !== 'undefined' && window.XLSX) {
    return window.XLSX;
  }

  // 1) essayer le local
  try {
    await loadScript(local, { timeout });
    if (window.XLSX) return window.XLSX;
    // Certaines builds UMD attachent XLSX après load => vérification et fallback si absent
  } catch (errLocal) {
    // ignore and try CDN
  }

  // 2) essayer CDN
  try {
    await loadScript(cdn, { timeout });
    if (window.XLSX) return window.XLSX;
    throw new Error('XLSX loaded but window.XLSX not present');
  } catch (errCdn) {
    // échec total
    throw new Error(`Unable to load XLSX (local and CDN failed): ${errCdn.message}`);
  }
}