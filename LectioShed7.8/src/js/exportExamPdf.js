/**
 * exportExamPdf.js
 * Fournit une fonction utilitaire pour exporter le rendu DOM des examens (html2canvas),
 * mais n'attache plus de listener automatique au bouton pour éviter les doublons.
 *
 * Si tu veux conserver l'export DOM pour tests, appelle exportExamTimetableFromDOM() manuellement
 * (par ex. via ExportHandlers ou la console). Par défaut on privilégie l'export structuré.
 */

import { getEtablissement, sanitizeFileName, drawPdfHeader } from './utils/pdfUtils.js';

/**
 * Exporte le rendu DOM (#examTimetableContainer) en PDF (html2canvas).
 * Cette fonction n'est plus appelée automatiquement : elle reste disponible si besoin.
 */
export async function exportExamTimetableFromDOM() {
    try {
        const container = document.getElementById('examTimetableContainer');
        if (!container) {
            alert('Conteneur de l\'emploi du temps introuvable.');
            return false;
        }

        // Choix : on garde l'implémentation existante (html2canvas -> jsPDF) si tu veux la tester manuellement.
        // Pour la production, on préfère l'export structuré (ExportService.exportExamTimetableStructuredPDF).
        let html2canvasFn = window.html2canvas || null;
        if (typeof html2canvasFn !== 'function') {
            try {
                await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
            } catch (e) {
                try {
                    await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
                } catch (e2) { /* noop */ }
            }
            html2canvasFn = window.html2canvas || window['html2canvas'] || null;
        }
        if (typeof html2canvasFn !== 'function') {
            alert('html2canvas introuvable, impossible d\'exporter le rendu DOM.');
            return false;
        }

        // small delay to ensure rendering
        await new Promise(r => setTimeout(r, 120));

        // clone nearest active tab-pane to avoid exporting wrong pane
        const tabPane = container.closest('.tab-pane.active') || container.closest('.tab-pane') || container;
        const clonePane = tabPane.cloneNode(true);
        clonePane.classList.add('active');

        const wrapper = document.createElement('div');
        wrapper.style.position = 'fixed';
        wrapper.style.left = '-10000px';
        wrapper.style.top = '0';
        wrapper.style.width = '1200px';
        wrapper.style.background = window.getComputedStyle(container).backgroundColor || '#fff';
        wrapper.appendChild(clonePane);
        document.body.appendChild(wrapper);

        const canvas = await html2canvasFn(clonePane, {
            scale: Math.min(2, window.devicePixelRatio || 1),
            useCORS: true,
            backgroundColor: '#ffffff'
        });

        // Resolve jsPDF
        let jsPDFCtor = null;
        try {
            if (window.jspdf && window.jspdf.jsPDF) jsPDFCtor = window.jspdf.jsPDF;
            else if (typeof window.jsPDF === 'function') jsPDFCtor = window.jsPDF;
        } catch (e) { /* noop */ }

        if (!jsPDFCtor) {
            try {
                const mod = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
                jsPDFCtor = mod && mod.jsPDF ? mod.jsPDF : (mod.default && mod.default.jsPDF ? mod.default.jsPDF : null);
            } catch (e) { /* noop */ }
        }
        if (!jsPDFCtor) {
            alert('jsPDF introuvable pour l\'export.');
            try { document.body.removeChild(wrapper); } catch (e) { /* noop */ }
            return false;
        }

        const doc = new jsPDFCtor('l', 'pt', 'a4');
        const margin = 20;
        const pdfPageWidth = doc.internal.pageSize.getWidth();
        const pdfPageHeight = doc.internal.pageSize.getHeight();
        const usablePdfWidth = pdfPageWidth - margin * 2;

        const imgDataUrl = canvas.toDataURL('image/png');
        const imgWidthPx = canvas.width;
        const imgHeightPx = canvas.height;

        const scale = usablePdfWidth / imgWidthPx;
        const imgDisplayHeightPt = imgHeightPx * scale;

        // draw header (optional)
        const headerInfo = drawPdfHeader(doc, { margin, includeSession: true });
        const contentTop = margin + (headerInfo && headerInfo.height ? headerInfo.height + 8 : 0);

        if (imgDisplayHeightPt <= (pdfPageHeight - margin * 2 - contentTop + margin)) {
            doc.addImage(imgDataUrl, 'PNG', margin, contentTop, usablePdfWidth, imgDisplayHeightPt);
        } else {
            const pxPerPage = Math.floor((pdfPageHeight - margin * 2) / scale);
            let renderedHeight = 0;
            while (renderedHeight < imgHeightPx) {
                const h = Math.min(pxPerPage, imgHeightPx - renderedHeight);
                const tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = imgWidthPx;
                tmpCanvas.height = h;
                const ctx = tmpCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, renderedHeight, imgWidthPx, h, 0, 0, imgWidthPx, h);
                const tmpDataUrl = tmpCanvas.toDataURL('image/png');
                const tmpDisplayHeightPt = h * scale;
                if (renderedHeight > 0) {
                    doc.addPage();
                    drawPdfHeader(doc, { margin, includeSession: true });
                }
                doc.addImage(tmpDataUrl, 'PNG', margin, contentTop, usablePdfWidth, tmpDisplayHeightPt);
                renderedHeight += h;
            }
        }

        const etab = getEtablissement();
        const fileEtab = etab ? `_${sanitizeFileName(etab)}` : '';
        doc.save(`emploi_du_temps_examens_${new Date().toISOString().slice(0,10)}${fileEtab}.pdf`);

        try { document.body.removeChild(wrapper); } catch (e) { /* noop */ }
        return true;
    } catch (err) {
        console.error('Export Exam Timetable (DOM) failed', err);
        alert('Erreur lors de l\'export DOM : ' + (err && err.message ? err.message : String(err)));
        return false;
    }
}