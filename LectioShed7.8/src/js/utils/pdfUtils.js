/**
 * Utilitaires pour les exports PDF
 * - getEtablissement(): récupère la valeur depuis StateManager ou localStorage
 * - sanitizeFileName(): nettoie une chaîne pour servir de nom de fichier
 * - drawPdfHeader(doc, opts): dessine l'en-tête (établissement, année, session, département) sur un jsPDF `doc`
 *
 * Retour de drawPdfHeader: object { height } en points (hauteur verticale occupée par l'en-tête)
 */

import StateManager from '../controllers/StateManager.js';

export function getEtablissement() {
    try {
        const s = StateManager && StateManager.state && StateManager.state.header && StateManager.state.header.etablissement;
        if (s && String(s).trim()) return String(s).trim();
    } catch (e) { /* noop */ }

    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const ls = window.localStorage.getItem('edt_etablissement');
            if (ls && String(ls).trim()) return String(ls).trim();
        }
    } catch (e) { /* noop */ }

    return '';
}

export function sanitizeFileName(name = '') {
    try {
        let s = String(name || '').trim();
        if (!s) return '';
        // replace spaces with underscore, remove risky chars
        s = s.replace(/\s+/g, '_');
        s = s.replace(/[^a-zA-Z0-9_\-\.]/g, '');
        // limit length
        if (s.length > 60) s = s.slice(0, 60);
        return s || '';
    } catch (e) {
        return '';
    }
}

/**
 * Dessine un en-tête simple sur un document jsPDF.
 * opts:
 *  - margin (number) default 20
 *  - includeSession (boolean) include année/session/departement from StateManager.header
 *  - font (object) { family, sizeTitle, sizeSub, color }
 *
 * Retourne : { height } hauteur occupée en points (approx.)
 */
export function drawPdfHeader(doc, opts = {}) {
    if (!doc || typeof doc.text !== 'function') return { height: 0 };

    const margin = typeof opts.margin === 'number' ? opts.margin : 20;
    const fontFamily = opts.font?.family || 'helvetica';
    const sizeTitle = opts.font?.sizeTitle || 12;
    const sizeSub = opts.font?.sizeSub || 9;
    const color = opts.font?.color || '#222222';

    const etab = getEtablissement();

    let y = margin;
    try {
        const header = StateManager && StateManager.state && StateManager.state.header ? StateManager.state.header : {};
        const annee = header.annee || '';
        const session = header.session || '';
        const departement = header.departement || '';
        const filiereOpt = opts.filiere || null; // optional filiere passed by caller

        // Compact single-line mode: put all labels on same line, omit "Établissement :" label if requested
        const compact = !!opts.compact;
        const includeEtabLabel = (typeof opts.includeEtablissementLabel === 'boolean') ? opts.includeEtablissementLabel : true;

        if (compact) {
            const parts = [];
            // établissement (without label when includeEtabLabel === false)
            if (etab) {
                parts.push(includeEtabLabel ? `Établissement: ${etab}` : `${etab}`);
            }
            if (filiereOpt && filiereOpt !== 'global' && filiereOpt !== 'all') parts.push(String(filiereOpt));
            if (departement) parts.push(String(departement));
            if (annee) parts.push(String(annee));
            if (session) parts.push(String(session));

            if (parts.length) {
                doc.setFont(fontFamily, 'bold');
                doc.setFontSize(sizeTitle);
                doc.setTextColor(color);
                // draw single-line centered or left depending on opts.align (default left)
                const align = opts.align || 'left';
                const text = parts.join(' | ');
                if (align === 'center') {
                    const pageWidth = doc.internal.pageSize.getWidth();
                    doc.text(text, pageWidth / 2, y, { align: 'center' });
                } else {
                    doc.text(text, margin, y);
                }
                y += sizeTitle + 6;
            }
        } else {
            // Title / établissement (multi-line mode - backwards compatible)
            doc.setFont(fontFamily, 'bold');
            doc.setFontSize(sizeTitle);
            doc.setTextColor(color);
            if (etab) {
                doc.text(`Établissement : ${etab}`, margin, y);
                y += sizeTitle + 4;
            }

            // Optional: année / session / département (second line)
            if (opts.includeSession) {
                try {
                    const parts = [];
                    if (annee) parts.push(String(annee));
                    if (session) parts.push(String(session));
                    if (departement) parts.push(String(departement));
                    if (parts.length) {
                        doc.setFont(fontFamily, 'normal');
                        doc.setFontSize(sizeSub);
                        doc.setTextColor('#444444');
                        doc.text(parts.join(' — '), margin, y);
                        y += sizeSub + 6;
                    }
                } catch (e) { /* noop */ }
            }
        }
    } catch (e) {
        // ignore rendering errors
    }

    const headerHeight = Math.max(0, y - margin);
    return { height: headerHeight };
}
// Expose helpers on window for compatibility non-module (fallback)
try {
    if (typeof window !== 'undefined') {
        window.getEtablissement = getEtablissement;
        window.sanitizeFileName = sanitizeFileName;
        window.drawPdfHeader = drawPdfHeader;
        window.PDFUtils = {
            getEtablissement,
            sanitizeFileName,
            drawPdfHeader
        };
    }
} catch (e) { /* noop */ }