// Export visible exam timetable to a simple PDF.
// Tries to use the included jspdf UMD (lib/jspdf.umd.min.js) and falls back to CDN import if needed.
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnExportExamTimetablePDF');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        try {
            const container = document.getElementById('examTimetableContainer');
            if (!container) {
                alert('Conteneur de l\'emploi du temps introuvable.');
                return;
            }

            // Prefer a structured export if a table exists, otherwise use plain text snapshot.
            let text = '';
            const tbl = container.querySelector('table');
            if (tbl) {
                const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
                    Array.from(tr.querySelectorAll('th,td')).map(cell => cell.innerText.trim()).join('  |  ')
                );
                text = rows.join('\n');
            } else {
                // fallback: take visible text (trim excessive whitespace)
                text = (container.innerText || container.textContent || '').trim();
            }

            if (!text) {
                alert('Aucun contenu à exporter.');
                return;
            }

            // Resolve jsPDF constructor from loaded UMD or dynamic import
            let jsPDFCtor = null;
            try {
                if (window.jspdf && window.jspdf.jsPDF) jsPDFCtor = window.jspdf.jsPDF;
                else if (typeof window.jsPDF === 'function') jsPDFCtor = window.jsPDF;
                else if (window.jspdf && typeof window.jspdf === 'function') jsPDFCtor = window.jspdf;
            } catch (e) { /* noop */ }

            if (!jsPDFCtor) {
                // dynamic import as a last resort
                try {
                    const mod = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
                    jsPDFCtor = mod && (mod.jsPDF || (mod.default && mod.default.jsPDF)) ? (mod.jsPDF || mod.default.jsPDF) : null;
                } catch (impErr) {
                    console.error('Dynamic import jsPDF failed', impErr);
                    jsPDFCtor = null;
                }
            }

            if (!jsPDFCtor) {
                alert('Bibliothèque jsPDF introuvable pour l\'export PDF.');
                return;
            }

            const doc = new jsPDFCtor('p', 'pt', 'a4');
            const margin = 40;
            const pageWidth = doc.internal.pageSize.getWidth();
            const maxLineWidth = pageWidth - margin * 2;
            doc.setFontSize(10);

            const lines = doc.splitTextToSize(text, maxLineWidth);
            let y = margin;
            const pageHeight = doc.internal.pageSize.getHeight();
            const lineHeight = 12;
            for (let i = 0; i < lines.length; i++) {
                if (y + lineHeight > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
                doc.text(lines[i], margin, y);
                y += lineHeight;
            }

            doc.save('emploi_du_temps_examens.pdf');
        } catch (err) {
            console.error('Export Exam Timetable PDF failed', err);
            alert('Erreur lors de l\'export PDF : ' + (err && err.message ? err.message : String(err)));
        }
    });
});