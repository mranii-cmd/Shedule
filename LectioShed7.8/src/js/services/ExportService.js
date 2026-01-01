/**
 * Service d'export de documents (PDF, Excel)
 * @author Ibrahim Mrani - UCD
 */
import { LISTE_JOURS } from '../config/constants.js';
import { getSortedCreneauxKeys } from '../utils/helpers.js';
import DialogManager from '../ui/DialogManager.js';
import LogService from './LogService.js';
import NotificationManager from '../ui/NotificationManager.js';
import StateManager from '../controllers/StateManager.js';
import TableRenderer from '../ui/TableRenderer.js';
import VolumeService from './VolumeService.js';
import StorageService from './StorageService.js';
import { SEANCE_COLORS } from '../config/constants.js';
import { downloadFile } from '../utils/helpers.js';

class ExportService {
    /**
     * Exporte l'EDT en PDF
     * @param {Object} options - Options d'export
     * @returns {Promise<boolean>} Succès de l'export
     */
    async exportToPDF(options = {}) {
        const {
            filter = 'global',
            orientation = 'landscape',
            includeHeader = true,
            includeStats = false
        } = options;

        try {
            // Charger jsPDF
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation,
                unit: 'mm',
                format: 'a4'
            });

            let currentY = 10;

            // En-tête
            if (includeHeader) {
                // currentY = this.addPDFHeader(doc, currentY);
                currentY = this.addPDFHeader(doc, currentY, filter);
            }

            // Tableau EDT
            currentY = await this.addPDFTable(doc, currentY, filter);

            // Statistiques
            if (includeStats) {
                currentY = this.addPDFStats(doc, currentY);
            }

            // Sauvegarder
            const filename = this.generateFilename('edt', 'pdf');
            doc.save(filename);

            return true;
        } catch (error) {
            console.error('Erreur export PDF:', error);
            return false;
        }
    }

    /**
     * Ajoute l'en-tête au PDF
     * @param {Object} doc - Document jsPDF
     * @param {number} startY - Position Y de départ
     * @returns {number} Nouvelle position Y
     */
    addPDFHeader(doc, startY, selectedFiliere = null) {
        const { annee, session, departement } = StateManager.state.header;

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Emploi du Temps', 148, startY, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`${departement}`, 148, startY + 7, { align: 'center' });
        doc.text(`${annee} - ${session}`, 148, startY + 14, { align: 'center' });

        // Ajout du titre si le filtre est une filière
        if (
            selectedFiliere &&
            selectedFiliere !== 'global' &&
            selectedFiliere !== 'all'
        ) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text(`Filière : ${selectedFiliere}`, 148, startY + 20, { align: 'center' });
            return startY + 30;
        }

        return startY + 25;
    }

    /**
     * Ajoute le tableau EDT au PDF
     * @param {Object} doc - Document jsPDF
     * @param {number} startY - Position Y de départ
     * @param {string} filter - Filtre appliqué
     * @returns {number} Nouvelle position Y
     */
    async addPDFTable(doc, startY, filter) {
        TableRenderer.setFilter(filter);
        const seances = TableRenderer.getFilteredSeances();
        const pdfData = TableRenderer.generatePDFData(seances);

        // Utiliser autoTable
        doc.autoTable({
            head: pdfData.head,
            body: pdfData.body.map(row => {
                return row.map(cell => {
                    if (Array.isArray(cell)) {
                        // C'est une cellule avec des séances
                        return cell.map(s =>
                            `${s.matiere} (${s.type})\n${s.groupe}\n${s.enseignant || 'N/A'}\n${s.salle || 'N/A'}`
                        ).join('\n---\n');
                    }
                    return cell;
                });
            }),
            startY: startY,
            theme: 'grid',
            styles: {
                fontSize: 7,
                cellPadding: 2,
                overflow: 'linebreak',
                halign: 'center',
                valign: 'middle'
            },
            headStyles: {
                fillColor: [41, 128, 185],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [236, 240, 241] }
            },
            didParseCell: (data) => {
                // Colorer les cellules selon le type de séance
                if (data.section === 'body' && data.column.index > 0) {
                    const cellValue = data.cell.text.join('');

                    if (cellValue.includes('(Cours)')) {
                        data.cell.styles.fillColor = SEANCE_COLORS.Cours.bg;
                    } else if (cellValue.includes('(TD)')) {
                        data.cell.styles.fillColor = SEANCE_COLORS.TD.bg;
                    } else if (cellValue.includes('(TP)')) {
                        data.cell.styles.fillColor = SEANCE_COLORS.TP.bg;
                    }
                }
            }
        });

        return doc.lastAutoTable.finalY + 10;
    }

    /**
     * Ajoute les statistiques au PDF
     * @param {Object} doc - Document jsPDF
     * @param {number} startY - Position Y de départ
     * @returns {number} Nouvelle position Y
     */
    addPDFStats(doc, startY) {
        const seances = StateManager.getSeances();
        const subjects = StateManager.getCurrentSessionSubjects();

        const globalMetrics = VolumeService.calculateGlobalVolumeMetrics(
            subjects,
            seances,
            StateManager.state.enseignants.length,
            StateManager.state.enseignantVolumesSupplementaires,
            StateManager.state.forfaits || []
        );

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Statistiques Globales', 10, startY);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Nombre de séances : ${seances.length}`, 10, startY + 7);
        doc.text(`VHT Global : ${globalMetrics.globalVHT}h`, 10, startY + 14);
        doc.text(`VHM Global : ${globalMetrics.globalVHM}h`, 10, startY + 21);
        doc.text(`Enseignants actifs : ${globalMetrics.totalUniqueTeachers}/${globalMetrics.totalRegisteredTeachers}`, 10, startY + 28);

        return startY + 35;
    }

    /**
     * Exporte l'EDT en Excel
     * @param {Object} options - Options d'export
     * @returns {Promise<boolean>} Succès de l'export
     */
    async exportToExcel(options = {}) {
        const {
            filter = 'global',
            includeStats = false
        } = options;

        try {
            const workbook = XLSX.utils.book_new();

            // Feuille EDT
            TableRenderer.setFilter(filter);
            const seances = TableRenderer.getFilteredSeances();
            const htmlTable = TableRenderer.generateSimpleTableHTML(seances);

            // Convertir le HTML en worksheet
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlTable;
            const worksheet = XLSX.utils.table_to_sheet(tempDiv.querySelector('table'));

            XLSX.utils.book_append_sheet(workbook, worksheet, 'EDT');

            // Feuille Statistiques
            if (includeStats) {
                const statsSheet = this.generateStatsWorksheet();
                XLSX.utils.book_append_sheet(workbook, statsSheet, 'Statistiques');
            }

            // Sauvegarder
            const filename = this.generateFilename('edt', 'xlsx');
            XLSX.writeFile(workbook, filename);

            return true;
        } catch (error) {
            console.error('Erreur export Excel:', error);
            return false;
        }
    }

    /**
     * Génère la feuille de statistiques
     * @returns {Object} Worksheet XLSX
     */
    generateStatsWorksheet() {
        const seances = StateManager.getSeances();
        const subjects = StateManager.getCurrentSessionSubjects();

        const data = [
            ['Statistiques Globales'],
            [''],
            ['Métrique', 'Valeur'],
            ['Nombre de séances', seances.length],
            ['Nombre de matières', subjects.length],
            ['Nombre d\'enseignants', StateManager.state.enseignants.length],
            [''],
            ['Répartition par Type'],
            ['Type', 'Nombre'],
            ['Cours', seances.filter(s => s.type === 'Cours').length],
            ['TD', seances.filter(s => s.type === 'TD').length],
            ['TP', seances.filter(s => s.type === 'TP').length]
        ];

        return XLSX.utils.aoa_to_sheet(data);
    }

    /**
     * Exporte les volumes horaires en Excel
     * @returns {Promise<boolean>} Succès de l'export
     */
    async exportVolumesToExcel() {
        try {
            const workbook = XLSX.utils.book_new();

            // Calculer les volumes
            const seances = StateManager.getSeances();
            const enseignants = StateManager.state.enseignants;

            const volumes = VolumeService.calculateAllVolumes(
                enseignants,
                seances,
                StateManager.state.enseignantVolumesSupplementaires,
                StateManager.state.header.session,
                StateManager.state.volumesAutomne
            );

            // Préparer les données
            const data = [
                ['Volumes Horaires par Enseignant'],
                [''],
                ['Enseignant', 'Volume (hTP)']
            ];

            enseignants.forEach(ens => {
                data.push([ens, volumes[ens] || 0]);
            });

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Volumes');

            // Sauvegarder
            const filename = this.generateFilename('volumes', 'xlsx');
            XLSX.writeFile(workbook, filename);

            return true;
        } catch (error) {
            console.error('Erreur export volumes:', error);
            return false;
        }
    }

    /**
     * Génère un nom de fichier
     * @param {string} prefix - Préfixe du fichier
     * @param {string} extension - Extension
     * @returns {string} Le nom de fichier
     */
    generateFilename(prefix, extension) {
        const { session } = StateManager.state.header;
        const date = new Date().toISOString().slice(0, 10);
        const sessionSlug = session.replace(/\s+/g, '_').toLowerCase();

        return `${prefix}_${sessionSlug}_${date}.${extension}`;
    }
    /**
 * Exporte les emplois du temps de tous les enseignants en PDF
 * @returns {Promise<boolean>} Succès de l'export
 */
    async exportTeachersSchedulesToPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const enseignants = StateManager.state.enseignants;
            const seances = StateManager.getSeances();

            if (enseignants.length === 0) {
                DialogManager.error('Aucun enseignant enregistré.');
                return false;
            }

            let isFirstPage = true;

            for (const enseignant of enseignants) {
                if (!isFirstPage) {
                    doc.addPage();
                }
                isFirstPage = false;

                // Générer l'emploi du temps pour cet enseignant
                await this.generateTeacherSchedulePage(doc, enseignant, seances);
            }

            // Sauvegarder
            const filename = `edt_enseignants_${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(filename);

            LogService.success(`✅ Export PDF de ${enseignants.length} emploi(s) du temps réussi`);
            NotificationManager.success(`${enseignants.length} emploi(s) du temps exporté(s)`);

            return true;
        } catch (error) {
            console.error('Erreur export PDF enseignants:', error);
            LogService.error(`❌ Erreur export PDF: ${error.message}`);
            NotificationManager.error('Erreur lors de l\'export PDF');
            return false;
        }
    }

    /**
     * Génère une page PDF pour un enseignant
     * @param {Object} doc - Document jsPDF
     * @param {string} enseignant - Le nom de l'enseignant
     * @param {Array} allSeances - Toutes les séances
     */
    async generateTeacherSchedulePage(doc, enseignant, allSeances) {
        const { annee, session, departement } = StateManager.state.header;

        // Filtrer les séances de cet enseignant
        // const seancesEnseignant = allSeances.filter(s => s.hasTeacherAssigned(enseignant));
        const seancesEnseignant = allSeances.filter(s => {
            try {
                if (!s) return false;

                // 1) Si la méthode existe sur l'objet séance, l'utiliser (prioritaire)
                if (typeof s.hasTeacherAssigned === 'function') {
                    try { return !!s.hasTeacherAssigned(enseignant); } catch (e) { /* fallback below */ }
                }

                // 2) Chercher dans les propriétés habituelles (tableaux ou chaîne)
                const candidates = s.enseignantsArray ?? s.enseignants ?? s.teachers ?? s.teacher ?? s.enseignant ?? null;

                if (Array.isArray(candidates)) {
                    return candidates.some(t => {
                        if (!t) return false;
                        const candidate = (typeof t === 'object') ? (t.nom || t.name || t.id || '') : t;
                        try {
                            return String(candidate).trim().toLowerCase() === String(enseignant).trim().toLowerCase();
                        } catch (e) { return false; }
                    });
                }

                if (candidates) {
                    try {
                        return String(candidates).trim().toLowerCase() === String(enseignant).trim().toLowerCase();
                    } catch (e) { /* noop */ }
                }

                // 3) Fallback : scan any teacher-like fields inside the object
                const possibleFields = ['enseignants', 'enseignantsArray', 'teacher', 'teachers', 'enseignant'];
                for (const f of possibleFields) {
                    if (s[f]) {
                        const v = s[f];
                        if (Array.isArray(v)) {
                            if (v.some(t => String((t && (t.nom || t.name)) || t).trim().toLowerCase() === String(enseignant).trim().toLowerCase())) return true;
                        } else {
                            if (String(v).trim().toLowerCase() === String(enseignant).trim().toLowerCase()) return true;
                        }
                    }
                }

                return false;
            } catch (e) {
                return false;
            }
        });
        // En-tête
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(`Emploi du Temps - ${enseignant}`, 148, 15, { align: 'center' });

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.text(`${departement} | ${annee} | ${session}`, 148, 22, { align: 'center' });

        // Informations de volume horaire
        let currentY = 30;
        currentY = this.addTeacherVolumeInfo(doc, enseignant, allSeances, currentY);

        // Tableau récapitulatif des interventions
        currentY += 5;
        currentY = this.addTeacherInterventionsTable(doc, enseignant, seancesEnseignant, currentY);

        // Emploi du temps détaillé
        currentY += 5;
        this.addTeacherScheduleTable(doc, seancesEnseignant, currentY);
    }

    /**
 * Ajoute les informations de volume horaire de l'enseignant
 * @param {Object} doc - Document jsPDF
 * @param {string} enseignant - Le nom de l'enseignant
 * @param {Array} allSeances - Toutes les séances
 * @param {number} startY - Position Y de départ
 * @returns {number} Nouvelle position Y
 */
    addTeacherVolumeInfo(doc, enseignant, allSeances, startY) {
        // Données d'état
        const enseignants = StateManager.state.enseignants || [];
        const forfaits = StateManager.state.forfaits || [];
        const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires || {};
        const volumesAutomne = StateManager.state.volumesAutomne || {};

        // Détails individuels (séances passées en param)
        const volumeDetails = VolumeService.calculateTeacherVolumeDetails(
            enseignant,
            allSeances,
            volumesSupplementaires
        );

        // --- Reprendre la logique de VolumeRenderer.computeAnnualMetrics pour obtenir annualVHT ---
        const allSubjects = (typeof StateManager.getSubjects === 'function') ? StateManager.getSubjects() : (StateManager.getCurrentSessionSubjects ? StateManager.getCurrentSessionSubjects() : []);
        const filieres = StateManager.state.filieres || [];

        const getSubjectsForSession = (sessionLabel) => {
            const sessionType = (sessionLabel === 'autumn' ? 'Automne' : 'Printemps');
            const filieresNames = filieres
                .filter(f => f.session === sessionType)
                .map(f => f.nom);
            return allSubjects.filter(s => !s.filiere || filieresNames.includes(s.filiere));
        };

        const autumnSubjects = getSubjectsForSession('autumn');
        const springSubjects = getSubjectsForSession('spring');

        // Charger les séances depuis StorageService si disponible (même logique que VolumeRenderer)
        let autumnSessionData = { seances: [], nextId: 1 };
        let springSessionData = { seances: [], nextId: 1 };
        try {
            if (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function') {
                autumnSessionData = StorageService.loadSessionData("Session d'automne") || autumnSessionData;
                springSessionData = StorageService.loadSessionData("Session de printemps") || springSessionData;
            } else if (typeof window !== 'undefined' && window.EDTStorage && typeof window.EDTStorage.loadSessionData === 'function') {
                autumnSessionData = window.EDTStorage.loadSessionData("Session d'automne") || autumnSessionData;
                springSessionData = window.EDTStorage.loadSessionData("Session de printemps") || springSessionData;
            }
        } catch (e) {
            // fallback silencieux : utiliser allSeances en dessous si nécessaire
            console.warn('ExportService: StorageService.loadSessionData unavailable, using fallbacks', e);
        }

        // Forfaits par session (même logique que VolumeRenderer)
        const allForfaits = StateManager.state.forfaits || [];
        const forfaitsAutumn = allForfaits.filter(f => !f.session || String(f.session).toLowerCase().includes('automne') || String(f.session).toLowerCase().includes('autumn'));
        const forfaitsSpring = allForfaits.filter(f => String(f.session).toLowerCase().includes('printemps') || String(f.session).toLowerCase().includes('spring'));

        // --- Appel à calculateAnnualGlobalMetrics pour obtenir annualVHT (source de vérité) ---
        let annualMetrics = {};
        try {
            annualMetrics = VolumeService.calculateAnnualGlobalMetrics(
                enseignants,
                autumnSubjects,
                autumnSessionData.seances || [],
                springSubjects,
                springSessionData.seances || [],
                volumesSupplementaires,
                forfaitsAutumn,
                forfaitsSpring
            ) || {};
        } catch (err) {
            console.error('ExportService: erreur calculateAnnualGlobalMetrics', err);
            annualMetrics = {};
        }

        // annualVHT = somme déclarative annuelle (Automne + Printemps)
        const annualVHT = Number(annualMetrics.annualVHT || 0);

        // nombre d'enseignants à utiliser comme dénominateur (fallback sur StateManager)
        const totalRegisteredTeachers = Number(annualMetrics.totalRegisteredTeachers || (StateManager.state.enseignants || []).length || 1);

        // --- CALCUL DEMANDÉ : VHM = VHT / Nombre enseignants ---
        const VHM_calculated = totalRegisteredTeachers > 0 ? Math.round(annualVHT / totalRegisteredTeachers) : 0;

        // Préparer affichage conditionnel selon la session
        const currentSession = (StateManager.state && StateManager.state.header && StateManager.state.header.session) || '';

        // --- NEW: Si session = printemps, afficher le "Total (hTP)" tel que dans le menu Volume ---
        // Protection : snapshot des volumes d'automne et utilisation de copies pour éviter toute mutation/persistence accidentelle
        const _savedVolumesAutumnSnapshot = JSON.parse(JSON.stringify(StateManager.state.volumesAutomne || {}));
        try {
            const seancesForMenu = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (allSeances || []);

            // allVolumesCurrent (calcule selon session courante) — utiliser une copie du snapshot en paramètre
            let allVolumesCurrent = {};
            try {
                const volumesAutumnParam = JSON.parse(JSON.stringify(_savedVolumesAutumnSnapshot || {}));
                allVolumesCurrent = VolumeService.calculateAllVolumes(
                    enseignants,
                    seancesForMenu,
                    volumesSupplementaires,
                    currentSession,
                    volumesAutumnParam
                ) || {};
            } catch (e) {
                console.warn('ExportService: erreur calculateAllVolumes (current)', e);
                allVolumesCurrent = {};
            }

            // autumnPerTeacher : nécessaire pour l'affichage en printemps (calcule à partir des séances d'automne seulement)
            let autumnPerTeacher = {};
            try {
                let autumnSeances = [];
                if (typeof StorageService !== 'undefined' && StorageService && typeof StorageService.loadSessionData === 'function') {
                    autumnSeances = (StorageService.loadSessionData("Session d'automne") || {}).seances || [];
                } else if (typeof StateManager.getSeancesBySession === 'function') {
                    autumnSeances = StateManager.getSeancesBySession("Session d'automne") || [];
                } else {
                    const allFromState = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (allSeances || []);
                    autumnSeances = allFromState.filter(s => s && s.session && String(s.session).toLowerCase().includes('automne'));
                }

                autumnPerTeacher = VolumeService.calculateAllVolumes(
                    enseignants,
                    autumnSeances,
                    volumesSupplementaires,
                    "autumn",
                    {}
                ) || {};
            } catch (e) {
                console.warn('ExportService: erreur calculateAllVolumes (autumn)', e);
                autumnPerTeacher = {};
            }

            const baseCurrent = Number(allVolumesCurrent[enseignant] || 0);
            const addAutumn = (String(currentSession).toLowerCase().includes('printemps')) ? Number(autumnPerTeacher[enseignant] || 0) : 0;
            const menuTotal = Math.round(baseCurrent + addAutumn);

            if (String(currentSession).toLowerCase().includes('printemps')) {
                // afficher uniquement le Total (hTP) - identique au menu "Volumes" et ajouter VHM annuel
                const ecart = menuTotal - VHM_calculated;
                let ecartText = '';
                if (ecart > 0) ecartText = ` (+${ecart}h)`;
                else if (ecart < 0) ecartText = ` (${ecart}h)`;

                const totalAndVHMText = `Total (hTP): ${menuTotal}hTP | VHM Annuel: ${VHM_calculated}hTP${ecartText}`;
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setFont(undefined, 'normal');
                doc.text(totalAndVHMText, 14, startY);

                return startY + 3;
            }
        } catch (e) {
            console.warn('ExportService: erreur dans calcul affichage spécial printemps, fallback normal', e);
        } finally {
            // Restaurer la valeur d'origine en mémoire au cas où VolumeService ou d'autres aurait muté l'objet passé
            try {
                StateManager.state.volumesAutomne = JSON.parse(JSON.stringify(_savedVolumesAutumnSnapshot || {}));
            } catch (err) {
                console.warn('ExportService: failed to restore volumesAutomne snapshot', err);
            }
        }

        // --- Sinon : affichage classique (Automne / autres) ---
        const volumeEnseignement = volumeDetails.enseignement || 0;
        const volumeForfait = forfaits
            .filter(f => String(f.enseignant || '').trim() === String(enseignant || '').trim())
            .reduce((sum, f) => sum + (Number(f.volumeHoraire) || 0), 0);
        const volumeTotal = volumeEnseignement + volumeForfait;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');

        // Comparer le total personnel à la moyenne calculée
        const ecart = volumeTotal - VHM_calculated;
        let ecartText = '';
        if (ecart > 0) ecartText = ` (+${ecart}h)`;
        else if (ecart < 0) ecartText = ` (${ecart}h)`;

        const volumeText = `Vol. Enseignement: ${volumeEnseignement}hTP | Vol. Forfait: ${volumeForfait}hTP | Vol. Total: ${volumeTotal}hTP | VHM: ${VHM_calculated}hTP${ecartText}`;

        doc.setFont(undefined, 'normal');
        doc.text(volumeText, 14, startY);

        // Debug utile
        console.debug('ExportService:addTeacherVolumeInfo', {
            enseignant,
            annualVHT,
            totalRegisteredTeachers,
            VHM_calculated,
            volumeEnseignement,
            volumeForfait,
            volumeTotal,
            annualMetrics
        });

        return startY + 3;
    }

    /**
 * Ajoute le tableau récapitulatif des interventions
 * @param {Object} doc - Document jsPDF
 * @param {string} enseignant - Le nom de l'enseignant
 * @param {Array} seances - Les séances de l'enseignant
 * @param {number} startY - Position Y de départ
 * @returns {number} Nouvelle position Y
 */
    addTeacherInterventionsTable(doc, enseignant, seances, startY) {
        const toutesLesSeances = StateManager.getSeances();
        const matieresEnseignant = [...new Set(seances.map(s => s.matiere))];

        const interventionsParMatiere = {};

        matieresEnseignant.forEach(matiere => {
            interventionsParMatiere[matiere] = {
                cours: new Set(),
                td: new Set(),
                tp: new Set()
            };

            toutesLesSeances
                .filter(s => s.matiere === matiere)
                .forEach(seance => {
                    const type = seance.type.toLowerCase();
                    const intervenants = interventionsParMatiere[matiere][type];

                    seance.enseignantsArray.forEach(ens => {
                        if (ens && ens.trim()) {
                            intervenants.add(ens.trim());
                        }
                    });
                });
        });

        const formatIntervenants = (set) => {
            if (set.size === 0) return '-';

            // Retirer l'enseignant concerné de la liste
            const liste = Array.from(set)
                .filter(ens => ens !== enseignant)
                .sort();

            return liste.length > 0 ? liste.join(', ') : '-';
        };

        const tableData = [];
        Object.keys(interventionsParMatiere).sort().forEach(matiere => {
            const interv = interventionsParMatiere[matiere];

            tableData.push([
                matiere,
                formatIntervenants(interv.cours),
                formatIntervenants(interv.td),
                formatIntervenants(interv.tp)
            ]);
        });

        if (tableData.length === 0) {
            tableData.push(['Aucune matiere assignee', '-', '-', '-']);
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Recapitulatif des Interventions par Matiere', 14, startY);

        doc.autoTable({
            head: [['Matiere', 'Intervenants Cours', 'Intervenants TD', 'Intervenants TP']],
            body: tableData,
            startY: startY + 5,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [102, 126, 234],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { cellWidth: 60, fontStyle: 'bold' },
                1: { cellWidth: 60 },
                2: { cellWidth: 60 },
                3: { cellWidth: 60 }
            },
            margin: { left: 14, right: 14 }
        });

        return doc.lastAutoTable.finalY;
    }

    /**
     * Ajoute le tableau de l'emploi du temps
     * @param {Object} doc - Document jsPDF
     * @param {Array} seances - Les séances de l'enseignant
     * @param {number} startY - Position Y de départ
     */
    addTeacherScheduleTable(doc, seances, startY) {
        const sortedCreneaux = getSortedCreneauxKeys();
        const creneauxData = StateManager.state.creneaux;
        const jours = LISTE_JOURS;

        // En-tête
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Emploi du Temps Hebdomadaire', 14, startY);

        // Préparer les données
        const head = [['Jour/Heure', ...sortedCreneaux.map(c => `${c}\n${creneauxData[c].fin}`)]];
        const body = [];

        jours.forEach(jour => {
            const row = [jour];

            sortedCreneaux.forEach(creneau => {
                const seance = seances.find(s => s.jour === jour && s.creneau === creneau);

                if (seance) {
                    const text = `${seance.matiere}\n(${seance.type})\n${seance.groupe}\n${seance.salle || 'N/A'}`;
                    row.push(text);
                } else {
                    row.push('');
                }
            });

            body.push(row);
        });

        // Générer le tableau
        doc.autoTable({
            head: head,
            body: body,
            startY: startY + 5,
            theme: 'grid',
            styles: {
                fontSize: 7,
                cellPadding: 2,
                overflow: 'linebreak',
                halign: 'center',
                valign: 'middle'
            },
            headStyles: {
                fillColor: [102, 126, 234],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [236, 240, 241], cellWidth: 25 }
            },
            margin: { left: 14, right: 14 },
            didParseCell: (data) => {
                // Colorer les cellules selon le type
                if (data.section === 'body' && data.column.index > 0) {
                    const cellValue = data.cell.text.join('');

                    if (cellValue.includes('(Cours)')) {
                        data.cell.styles.fillColor = [255, 221, 221];
                    } else if (cellValue.includes('(TD)')) {
                        data.cell.styles.fillColor = [221, 255, 221];
                    } else if (cellValue.includes('(TP)')) {
                        data.cell.styles.fillColor = [221, 221, 255];
                    }
                }
            }
        });
    }
    /**
 * Nettoie le texte pour l'export PDF (retire les accents et caractères spéciaux)
 * @param {string} text - Le texte à nettoyer
 * @returns {string} Texte nettoyé
 */
    cleanTextForPDF(text) {
        if (!text) return '';

        // Remplacer les caractères accentués
        const accentsMap = {
            'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
            'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
            'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
            'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
            'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
            'ý': 'y', 'ÿ': 'y',
            'ñ': 'n', 'ç': 'c',
            'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
            'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
            'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
            'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O',
            'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
            'Ý': 'Y', 'Ÿ': 'Y',
            'Ñ': 'N', 'Ç': 'C'
        };

        return text.split('').map(char => accentsMap[char] || char).join('');
    }
    /**
 * Exporte l'emploi du temps des examens en PDF (version tableau structuré)
 * @returns {Promise<boolean>} Succès de l'export
 */
    /**
     * Exporte l'emploi du temps des examens en PDF (version tableau structuré)
     * @returns {Promise<boolean>} Succès de l'export
     */
    async exportExamTimetableStructuredPDF() {
        console.log('=== DÉBUT EXPORT PDF EXAMENS (STRUCTURÉ) ===');

        try {
            if (typeof window.jspdf === 'undefined') {
                console.error('❌ jsPDF non disponible');
                DialogManager.error('Bibliothèque jsPDF non chargée');
                NotificationManager.error('jsPDF manquant');
                return false;
            }

            const { jsPDF } = window.jspdf;
            const exams = (StateManager.state && StateManager.state.examens) || [];
            console.log('Nombre d\'examens:', exams.length);

            if (exams.length === 0) {
                console.warn('⚠️ Aucun examen à exporter');
                DialogManager.error('Aucun examen planifié');
                NotificationManager.warning('Aucun examen à exporter');
                return false;
            }

            const loadingMsg = this.showLoadingMessage('Génération du PDF en cours...');

            try {
                const doc = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a4',
                    compress: true
                });

                const pdfWidth = doc.internal.pageSize.getWidth();
                const pdfHeight = doc.internal.pageSize.getHeight();

                let y = 15;

                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('Emploi du Temps des Examens', pdfWidth / 2, y, { align: 'center' });
                y += 8;

                const { annee, session, departement } = StateManager.state.header || {};
                if (departement || annee || session) {
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'normal');
                    const info = [departement, annee, session].filter(Boolean).join(' | ');
                    doc.text(info, pdfWidth / 2, y, { align: 'center' });
                    y += 6;
                }

                doc.setFontSize(9);
                const now = new Date();
                const dateStr = now.toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                doc.text(`Généré le ${dateStr}`, pdfWidth / 2, y, { align: 'center' });
                y += 10;

                // ✅ Préparer les données (SANS examen et SANS total étudiants)
                const tableData = exams.map(exam => {
                    const subjects = Array.isArray(exam.subjects)
                        ? exam.subjects.join(', ')
                        : (exam.subjects || '');

                    const rooms = this.formatExamRooms(exam);
                    const time = `${exam.startTime || exam.start || ''} - ${exam.endTime || exam.end || ''}`;

                    // Formater la date avec le jour
                    const dateStr = exam.date || '';
                    let dateWithDay = dateStr;

                    if (dateStr) {
                        try {
                            const dateObj = new Date(dateStr);
                            if (!isNaN(dateObj.getTime())) {
                                const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
                                const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                });
                                const dayCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
                                dateWithDay = `${dayCapitalized}\n${formattedDate}`;
                            }
                        } catch (e) {
                            console.warn('Erreur parsing date:', dateStr, e);
                        }
                    }

                    return {
                        date: dateWithDay,
                        time,
                        filiere: exam.filiere || '',
                        subjects,
                        rooms
                    };
                });

                // Trier par date
                tableData.sort((a, b) => {
                    // Extraire la date brute pour le tri (dernière ligne après \n)
                    const getDateForSort = (str) => {
                        const parts = str.split('\n');
                        return parts[parts.length - 1] || str;
                    };

                    const dateA = getDateForSort(a.date);
                    const dateB = getDateForSort(b.date);

                    const dateCompare = dateA.localeCompare(dateB);
                    if (dateCompare !== 0) return dateCompare;
                    return (a.time || '').localeCompare(b.time || '');
                });

                // Convertir en tableau
                const bodyData = tableData.map(row => [
                    row.date,
                    row.time,
                    row.filiere,
                    row.subjects,
                    row.rooms
                ]);

                // ✅ Générer le tableau
                doc.autoTable({
                    head: [['Date', 'Horaire', 'Filière', 'Matières', 'Salles']],
                    body: bodyData,
                    startY: y,
                    theme: 'grid',
                    styles: {
                        font: 'helvetica',
                        fontSize: 8,
                        cellPadding: 2.5,
                        overflow: 'linebreak',
                        halign: 'center',
                        valign: 'middle',
                        lineColor: [200, 200, 200],
                        lineWidth: 0.1
                    },
                    headStyles: {
                        fillColor: [102, 126, 234],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        halign: 'center',
                        fontSize: 9,
                        cellPadding: 3
                    },
                    columnStyles: {
                        0: { cellWidth: 32, fontStyle: 'bold', valign: 'middle' },   // Date avec jour
                        1: { cellWidth: 35 },                       // Horaire
                        2: { cellWidth: 33 },                       // Filière
                        3: { cellWidth: 48 },                       // Matières
                        4: { cellWidth: 70 }                        // Salles
                    },
                    margin: { left: 14, right: 14 },
                    didParseCell: (data) => {
                        if (data.section === 'body' && data.row.index % 2 === 0) {
                            data.cell.styles.fillColor = [248, 248, 248];
                        }
                    }
                });

                const finalY = doc.lastAutoTable.finalY + 10;

                if (finalY < pdfHeight - 40) {
                    this.addExamStatistics(doc, finalY, exams);
                }

                const filename = `emploi-du-temps-examens-${now.toISOString().split('T')[0]}.pdf`;
                doc.save(filename);

                this.hideLoadingMessage(loadingMsg);

                LogService.success('✅ Export PDF emploi du temps examens réussi');
                NotificationManager.success(`PDF généré avec succès : ${filename}`);
                console.log('=== FIN EXPORT PDF (SUCCÈS) ===');

                return true;

            } catch (error) {
                this.hideLoadingMessage(loadingMsg);
                throw error;
            }

        } catch (error) {
            console.error('❌ Erreur export PDF examens:', error);
            LogService.error(`❌ Erreur export PDF: ${error.message}`);
            NotificationManager.error('Erreur lors de l\'export PDF');
            return false;
        }
    }

    /**
     * Ajoute les statistiques des examens au PDF
     * @param {Object} doc - Document jsPDF
     * @param {number} startY - Position Y de départ
     * @param {Array} exams - Liste des examens
     */
    addExamStatistics(doc, startY, exams) {
        const pdfHeight = doc.internal.pageSize.getHeight();

        // Vérifier s'il reste assez de place
        if (startY > pdfHeight - 40) {
            doc.addPage();
            startY = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Statistiques', 14, startY);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const totalExams = exams.length;
        const totalStudents = exams.reduce((sum, ex) => sum + (ex.studentsCount || ex.totalAssigned || 0), 0);

        // Compter les salles utilisées
        const roomsSet = new Set();
        exams.forEach(ex => {
            if (Array.isArray(ex.allocations)) {
                ex.allocations.forEach(a => roomsSet.add(a.room));
            } else if (Array.isArray(ex.rooms)) {
                ex.rooms.forEach(r => roomsSet.add(r));
            }
        });

        // Répartition par filière
        const byFiliere = {};
        exams.forEach(ex => {
            const fil = ex.filiere || 'Non spécifié';
            byFiliere[fil] = (byFiliere[fil] || 0) + 1;
        });

        let y = startY + 6;
        doc.text(`Nombre total d'examens : ${totalExams}`, 14, y);
        y += 5;
        doc.text(`Nombre total d'étudiants : ${totalStudents}`, 14, y);
        y += 5;
        doc.text(`Nombre de salles utilisées : ${roomsSet.size}`, 14, y);
        y += 7;

        doc.setFont('helvetica', 'bold');
        doc.text('Répartition par filière :', 14, y);
        y += 5;
        doc.setFont('helvetica', 'normal');

        Object.entries(byFiliere).forEach(([fil, count]) => {
            doc.text(`  • ${fil} : ${count} examen(s)`, 14, y);
            y += 5;
        });
    }

    /**
     * Formate l'affichage des salles pour un examen
     * @param {Object} exam - L'examen
     * @returns {string} Les salles formatées
     */
    /**
  * Formate l'affichage des salles pour un examen
  * @param {Object} exam - L'examen
  * @returns {string} Les salles formatées
  */
    /**
     * Formate l'affichage des salles pour un examen (SANS capacité ni étudiants)
     * @param {Object} exam - L'examen
     * @returns {string} Les salles formatées
     */
    /**
  * Formate l'affichage des salles pour un examen (noms uniquement)
  * @param {Object} exam - L'examen
  * @returns {string} Les salles formatées
  */
    // (Duplicate removed)

    /**
     * Ajoute les statistiques des examens au PDF
     * @param {Object} doc - Document jsPDF
     * @param {number} startY - Position Y de départ
     * @param {Array} exams - Liste des examens
     */
    addExamStatistics(doc, startY, exams) {
        const pdfHeight = doc.internal.pageSize.getHeight();

        // Vérifier s'il reste assez de place, sinon nouvelle page
        if (startY > pdfHeight - 40) {
            doc.addPage();
            startY = 20;
        }

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Statistiques', 14, startY);

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');

        const totalExams = exams.length;
        const totalStudents = exams.reduce((sum, ex) => sum + (ex.studentsCount || ex.totalAssigned || 0), 0);

        // Compter les salles utilisées
        const roomsSet = new Set();
        exams.forEach(ex => {
            if (Array.isArray(ex.allocations)) {
                ex.allocations.forEach(a => roomsSet.add(a.room));
            } else if (Array.isArray(ex.rooms)) {
                ex.rooms.forEach(r => roomsSet.add(r));
            }
        });

        // Répartition par filière
        const byFiliere = {};
        exams.forEach(ex => {
            const fil = ex.filiere || 'Non spécifié';
            byFiliere[fil] = (byFiliere[fil] || 0) + 1;
        });

        let y = startY + 7;
        doc.text(`Nombre total d'examens : ${totalExams}`, 14, y);
        y += 5;
        doc.text(`Nombre total d'étudiants : ${totalStudents}`, 14, y);
        y += 5;
        doc.text(`Nombre de salles utilisées : ${roomsSet.size}`, 14, y);
        y += 7;

        doc.setFont(undefined, 'bold');
        doc.text('Répartition par filière :', 14, y);
        y += 5;
        doc.setFont(undefined, 'normal');

        Object.entries(byFiliere).forEach(([fil, count]) => {
            doc.text(`  • ${fil} : ${count} examen(s)`, 14, y);
            y += 5;
        });
    }

    /**
     * Formate l'affichage des salles pour un examen
     * @param {Object} exam - L'examen
     * @returns {string} Les salles formatées
     */
    /**
 * Formate l'affichage des salles pour un examen (noms uniquement, sans parenthèses)
 * @param {Object} exam - L'examen
 * @returns {string} Les salles formatées
 */
    formatExamRooms(exam) {
        // Helper pour nettoyer les noms de salles
        const cleanRoom = (roomName) => {
            if (!roomName) return '';
            return String(roomName)
                .replace(/\s*\([^)]*\)/g, '')  // Retire (...)
                .trim();
        };

        // ✅ Option 1 : Depuis allocations
        if (Array.isArray(exam.allocations) && exam.allocations.length > 0) {
            return exam.allocations
                .map(a => cleanRoom(a.room))
                .filter(r => r && r.trim())
                .join(', ');
        }

        // ✅ Option 2 : Depuis rooms (array)
        if (Array.isArray(exam.rooms) && exam.rooms.length > 0) {
            return exam.rooms
                .map(r => cleanRoom(r))
                .filter(r => r && r.trim())
                .join(', ');
        }

        // ✅ Option 3 : Depuis salles (string)
        if (exam.salles) {
            const sallesArray = String(exam.salles)
                .split(',')
                .map(s => cleanRoom(s))
                .filter(s => s && s.trim());
            return sallesArray.join(', ');
        }

        return '—';
    }

    /**
     * Récupère la capacité d'une salle d'examen
     * @param {string} roomName - Nom de la salle
     * @returns {number} Capacité
     */
    getExamRoomCapacity(roomName) {
        if (!roomName) return 0;

        const configs = (StateManager.state && StateManager.state.examRoomConfigs) || [];
        const config = configs.find(c => c.room === roomName);
        return config ? (config.capacity || 0) : 0;
    }

    /**
     * Affiche un message de chargement
     * @param {string} message - Le message à afficher
     * @returns {HTMLElement} L'élément créé
     */
    showLoadingMessage(message) {
        // Supprimer l'ancien message s'il existe
        const existing = document.getElementById('pdf-loading-message');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'pdf-loading-message';
        div.style.cssText = `
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
        text-align: center;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    `;
        div.textContent = message;
        document.body.appendChild(div);
        return div;
    }

    /**
     * Masque le message de chargement
     * @param {HTMLElement} element - L'élément à supprimer
     */
    hideLoadingMessage(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        } else {
            const existing = document.getElementById('pdf-loading-message');
            if (existing) existing.remove();
        }
    }
}

// Export d'une instance singleton
export default new ExportService();