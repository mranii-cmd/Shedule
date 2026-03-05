/**
 * Utilitaires pour l'export PDF des emplois du temps
 */

/**
 * Exporte l'emploi du temps des examens en PDF
 * @param {string} containerId - ID du conteneur de l'emploi du temps
 * @param {string} filename - Nom du fichier PDF (sans extension)
 */
export async function exportTimetableToPDF(containerId = 'examTimetableContainer', filename = 'emploi-du-temps-examens') {
    try {
        // Vérifier que jsPDF est chargé
        if (typeof window.jspdf === 'undefined') {
            throw new Error('jsPDF non chargé.  Ajoutez la bibliothèque dans index.html');
        }

        // Vérifier que html2canvas est chargé
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas non chargé. Ajoutez la bibliothèque dans index.html');
        }

        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Conteneur #${containerId} non trouvé`);
        }

        // Vérifier qu'il y a du contenu
        if (! container.innerHTML || container.innerHTML.trim() === '') {
            throw new Error('L\'emploi du temps est vide');
        }

        // Afficher un message de chargement
        showLoadingMessage('Génération du PDF en cours.. .');

        // Capturer le conteneur en canvas
        const canvas = await html2canvas(container, {
            scale: 2, // Meilleure qualité
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        // Créer le PDF
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/png');
        
        // Dimensions A4 en mm
        const pdfWidth = 297; // A4 landscape width
        const pdfHeight = 210; // A4 landscape height
        
        // Calculer les dimensions de l'image pour qu'elle s'adapte
        const imgWidth = pdfWidth - 20; // marges de 10mm de chaque côté
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Créer le PDF en mode paysage
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Si l'image est trop haute, créer plusieurs pages
        let heightLeft = imgHeight;
        let position = 10; // marge supérieure

        // Ajouter l'en-tête
        pdf.setFontSize(16);
        pdf.text('Emploi du Temps des Examens', pdfWidth / 2, position, { align: 'center' });
        position += 10;

        // Ajouter la date de génération
        pdf.setFontSize(10);
        const now = new Date();
        const dateStr = now.toLocaleDateString('fr-FR', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        pdf.text(`Généré le ${dateStr}`, pdfWidth / 2, position, { align: 'center' });
        position += 10;

        // Ajouter l'image
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - position);

        // Ajouter des pages supplémentaires si nécessaire
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;
        }

        // Télécharger le PDF
        pdf.save(`${filename}.pdf`);

        hideLoadingMessage();
        showSuccessMessage('PDF généré avec succès !');

    } catch (error) {
        console. error('Erreur lors de l\'export PDF:', error);
        hideLoadingMessage();
        showErrorMessage(`Erreur lors de l'export PDF: ${error.message}`);
        throw error;
    }
}

/**
 * Export PDF simple (une seule page)
 */
export async function exportTimetableToSimplePDF(containerId = 'examTimetableContainer', filename = 'emploi-du-temps-examens') {
    try {
        if (typeof window.jspdf === 'undefined') {
            throw new Error('jsPDF non chargé');
        }

        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas non chargé');
        }

        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Conteneur non trouvé`);
        }

        showLoadingMessage('Génération du PDF.. .');

        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgWidth = pdfWidth - 20;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, pdfHeight - 20));
        pdf.save(`${filename}.pdf`);

        hideLoadingMessage();
        showSuccessMessage('PDF généré ! ');

    } catch (error) {
        console.error('Erreur export PDF:', error);
        hideLoadingMessage();
        showErrorMessage(`Erreur: ${error.message}`);
    }
}

// Fonctions utilitaires pour les messages
function showLoadingMessage(message) {
    const existing = document.getElementById('pdf-loading-message');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'pdf-loading-message';
    div. style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px 40px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 16px;
    `;
    div.textContent = message;
    document.body.appendChild(div);
}

function hideLoadingMessage() {
    const existing = document.getElementById('pdf-loading-message');
    if (existing) existing.remove();
}

function showSuccessMessage(message) {
    if (typeof NotificationManager !== 'undefined' && NotificationManager. success) {
        NotificationManager.success(message);
    } else {
        alert(message);
    }
}

function showErrorMessage(message) {
    if (typeof NotificationManager !== 'undefined' && NotificationManager.error) {
        NotificationManager.error(message);
    } else {
        alert(message);
    }
}