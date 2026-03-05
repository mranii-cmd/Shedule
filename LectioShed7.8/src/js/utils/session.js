/**
 * Helpers pour normaliser les sessions académiques (Automne / Printemps)
 * Fournit :
 *  - normalizeSessionLabel(label) -> 'autumn' | 'spring' | 'unknown'
 *  - isAutumn(label), isSpring(label)
 *  - getStorageSessionKey(normalized) -> clé utilisée par StorageService ("Session d'automne" / "Session de printemps")
 *  - friendlyLabel(normalized) -> label lisible (ex: "Session d'automne")
 */
export function normalizeSessionLabel(label) {
    if (!label && label !== 0) return 'unknown';
    const s = String(label).trim().toLowerCase();
    if (s.includes('automne') || s.includes('autumn')) return 'autumn';
    if (s.includes('printemps') || s.includes('spring')) return 'spring';
    // Some code stores exact tokens like "Session d'automne" or "Session de printemps"
    // previous checks above already cover those because includes() is used.
    return 'unknown';
}

export function isAutumn(label) {
    return normalizeSessionLabel(label) === 'autumn';
}

export function isSpring(label) {
    return normalizeSessionLabel(label) === 'spring';
}

/**
 * Retourne la clé 'humaine' utilisée dans StorageService pour une session normalisée.
 * Input: 'autumn' | 'spring' | 'unknown'
 * Output: "Session d'automne" | "Session de printemps" | original
 */
export function getStorageSessionKey(normalizedOrLabel) {
    const norm = typeof normalizedOrLabel === 'string' && (normalizedOrLabel === 'autumn' || normalizedOrLabel === 'spring')
        ? normalizedOrLabel
        : normalizeSessionLabel(normalizedOrLabel);

    if (norm === 'autumn') return "Session d'automne";
    if (norm === 'spring') return "Session de printemps";
    // fallback: return original stringified value
    return String(normalizedOrLabel || '').trim();
}

/**
 * Label lisible (pour UI) à partir d'un normalized key
 */
export function friendlyLabel(normalized) {
    if (normalized === 'autumn' || normalizeSessionLabel(normalized) === 'autumn') return "Session d'automne";
    if (normalized === 'spring' || normalizeSessionLabel(normalized) === 'spring') return "Session de printemps";
    return String(normalized || '').trim();
}