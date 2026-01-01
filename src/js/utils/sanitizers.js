
/**
 * Utilitaires de sanitization et d'échappement
 * @author Ibrahim Mrani - UCD
 */

/**
 * Échappe le HTML pour éviter les injections XSS
 * @param {*} str - La chaîne à échapper
 * @returns {string} La chaîne échappée
 */
export function escapeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str == null ? '' : String(str);
    return temp.innerHTML;
}

/**
 * Inverse l'échappement HTML
 * @param {*} str - La chaîne HTML à déséchapper
 * @returns {string} La chaîne déséchappée
 */
export function unescapeHTML(str) {
    const temp = document.createElement('textarea');
    temp.innerHTML = str == null ? '' : String(str);
    return temp.value || temp.textContent || '';
}

/**
 * Garantit un affichage sûr (échappe puis déséchappe pour idempotence)
 * @param {*} str - La chaîne à sécuriser
 * @returns {string} La chaîne sécurisée
 */
export function safeText(str) {
    return escapeHTML(unescapeHTML(str));
}

/**
 * Sanitize HTML pour affichage sûr (alias de escapeHTML)
 * @param {*} str - La chaîne à sanitizer
 * @returns {string} La chaîne sanitizée
 */
export function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

/**
 * Supprime les balises HTML d'une chaîne
 * @param {string} html - La chaîne HTML
 * @returns {string} Le texte sans balises
 */
export function stripHTML(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}