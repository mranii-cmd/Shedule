/**
 * Service d'import de fichiers Excel (souhaits, matières)
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import LogService from './LogService.js';
import DialogManager from '../ui/DialogManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import SchedulingService from './SchedulingService.js'; // <-- ajouté
import TeacherController from '../controllers/TeacherController.js';
import SubjectController from '../controllers/SubjectController.js';

const DEFAULT_MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 Mo
const WISHES_EXPECTED_HEADERS = ["Enseignant", "Choix1", "C1", "TD1", "TP1", "Choix2", "C2", "TD2", "TP2", "Choix3", "C3", "TD3", "TP3", "Contraintes"];
const SUBJECTS_EXPECTED_HEADERS = ["NomMatiere", "Filiere", "Departement", "SectionsCours", "TDGroups", "TPGroups", "VolumeCoursHTP", "VolumeTDHTP", "VolumeTPHTP", "NbEnseignantsTP"];

class ImportService {
    // -------------------
    // Helpers / Validation
    // -------------------

    validateFileMeta(file, { maxSize = DEFAULT_MAX_FILE_SIZE, allowedExt = ['xlsx', 'xls'] } = {}) {
        const issues = [];
        if (!file) {
            issues.push({ code: 'NO_FILE', message: 'Aucun fichier fourni.' });
            return issues;
        }
        const name = file.name || '';
        const ext = (name.split('.').pop() || '').toLowerCase();
        if (!allowedExt.includes(ext)) {
            issues.push({ code: 'BAD_FORMAT', message: 'Format de fichier non pris en charge. Utilisez .xlsx ou .xls.' });
        }
        if (file.size > maxSize) {
            issues.push({ code: 'FILE_TOO_LARGE', message: `Fichier trop volumineux (> ${Math.round(maxSize / 1024 / 1024)} Mo).` });
        }
        return issues;
    }

    normalizeHeaders(sheetHeaders) {
        return sheetHeaders.map(h => typeof h === 'string' ? h.trim() : String(h || '').trim());
    }

    validateHeaders(sheetHeaders, expectedHeaders) {
        const sheet = sheetHeaders.map(h => h || '');
        const missing = expectedHeaders.filter(h => !sheet.includes(h));
        const extra = sheet.filter(h => h && !expectedHeaders.includes(h));
        const issues = [];
        if (missing.length) issues.push({ code: 'MISSING_HEADERS', message: `Colonnes manquantes : ${missing.join(', ')}`, missing });
        if (extra.length) issues.push({ code: 'EXTRA_HEADERS', message: `Colonnes inattendues (seront ignorées) : ${extra.join(', ')}`, extra });
        return issues;
    }

    parseNumberOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : NaN;
    }

    rowToObject(headers, row) {
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
            obj[headers[i]] = row[i] !== undefined ? row[i] : '';
        }
        return obj;
    }

    errorsToCSV(errors) {
        const header = ['row', 'column', 'code', 'message', 'hint'];
        const lines = [header.join(',')];
        errors.forEach(e => {
            const line = [
                e.row ?? '',
                `"${(e.column || '').toString().replace(/"/g, '""')}"`,
                e.code || '',
                `"${(e.message || '').toString().replace(/"/g, '""')}"`,
                `"${(e.hint || '').toString().replace(/"/g, '""')}"`
            ];
            lines.push(line.join(','));
        });
        return lines.join('\n');
    }

    // Validate a single wish row (returns array of errors)
    validateWishRow(rowObj, rowIndex, context = {}) {
        const errs = [];
        const teacherRaw = rowObj['Enseignant'];
        const teacher = (teacherRaw || '').toString().trim();

        if (!teacher) {
            errs.push({ row: rowIndex, column: 'Enseignant', code: 'MISSING_TEACHER', message: 'Enseignant manquant', hint: 'Saisir le nom complet tel qu\'en configuration' });
        } else if (context.teachersList && !context.teachersList.includes(teacher)) {
            // Non bloquant : signaler que l'on créera l'enseignant automatiquement (optionnel)
            errs.push({ row: rowIndex, column: 'Enseignant', code: 'TEACHER_NOT_FOUND', message: `Enseignant '${teacher}' introuvable. Il sera créé automatiquement.`, hint: 'Vérifier l\'orthographe si vous souhaitez éviter la création automatique' });
        }

        // validate numeric cols
        ['C1', 'TD1', 'TP1', 'C2', 'TD2', 'TP2', 'C3', 'TD3', 'TP3'].forEach(col => {
            if (col in rowObj) {
                const parsed = this.parseNumberOrNull(rowObj[col]);
                if (Number.isNaN(parsed)) errs.push({ row: rowIndex, column: col, code: 'BAD_NUMBER', message: `Valeur numérique invalide dans ${col}`, hint: 'Saisir un nombre entier ou laisser vide' });
                else if (parsed !== null && parsed < 0) errs.push({ row: rowIndex, column: col, code: 'NEGATIVE_NUMBER', message: `Nombre négatif non autorisé dans ${col}` });
            }
        });

        if (rowObj['Contraintes'] && (rowObj['Contraintes'] || '').toString().length > 1000) {
            errs.push({ row: rowIndex, column: 'Contraintes', code: 'TEXT_TOO_LONG', message: 'Texte trop long dans Contraintes (max 1000 caractères)' });
        }

        return errs;
    }

    // Validate a single subject row (returns array of errors)
    validateSubjectRow(rowObj, rowIndex) {
        const errs = [];
        const name = (rowObj['NomMatiere'] || rowObj['matiere'] || '').toString().trim();
        if (!name) errs.push({ row: rowIndex, column: 'NomMatiere', code: 'MISSING_SUBJECT', message: 'Nom de matière manquant' });

        ['SectionsCours', 'TDGroups', 'TPGroups', 'VolumeCoursHTP', 'VolumeTDHTP', 'VolumeTPHTP', 'NbEnseignantsTP'].forEach(col => {
            if (col in rowObj) {
                const parsed = this.parseNumberOrNull(rowObj[col]);
                if (Number.isNaN(parsed)) errs.push({ row: rowIndex, column: col, code: 'BAD_NUMBER', message: `Valeur numérique invalide dans ${col}` });
                else if (parsed !== null && parsed < 0) errs.push({ row: rowIndex, column: col, code: 'NEGATIVE_NUMBER', message: `Nombre négatif non autorisé dans ${col}` });
            }
        });

        return errs;
    }
    /**
     * Importe les souhaits des enseignants depuis Excel
     * @param {File} file - Le fichier Excel
     * @returns {Promise<Object>} { success: boolean, stats: Object }
     */
    async importWishesFromExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const result = this.parseWishesData(jsonData);

                    if (result.success) {
                        LogService.success(`✅ ${result.stats.imported} souhaits importés, ${result.stats.created} enseignants créés`);
                        NotificationManager.success(`${result.stats.imported} souhaits importés`, 5000);
                    }

                    resolve(result);
                } catch (error) {
                    LogService.error(`❌ Erreur lors de l'import: ${error.message}`);
                    NotificationManager.error('Erreur lors de l\'import');
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Parse les données de souhaits
     * @param {Array} data - Données du fichier
     * @returns {Object} { success: boolean, stats: Object }
     */
    parseWishesData(data) {
        const stats = {
            imported: 0,
            created: 0,
            skipped: 0,
            errors: 0
        };

        // Format attendu : [Enseignant, Choix1, C1, TD1, TP1, Choix2, C2, TD2, TP2, Choix3, C3, TD3, TP3, Contraintes]

        // Détecter s'il y a une ligne d'en-tête ; par défaut on commence à la première ligne (index 0)
        let startRow = 0;
        if (data.length > 0 && Array.isArray(data[0]) && data[0][0]) {
            const firstCell = String(data[0][0]).toLowerCase();
            if (firstCell.includes('enseignant') || firstCell.includes('nom') || firstCell.includes('name')) {
                startRow = 1; // Ignorer la ligne d'en-tête
                LogService.info('En-tête détecté, démarrage à la ligne 2');
            }
        }

        for (let i = startRow; i < data.length; i++) {
            const row = data[i];

            // Ignorer les lignes vides
            if (!row || row.length < 2 || !row[0]) {
                stats.skipped++;
                continue;
            }

            let enseignant = String(row[0]).trim();

            // Vérifier si l'enseignant existe (recherche insensible à la casse et aux espaces)
            let enseignantTrouve = StateManager.state.enseignants.find(e =>
                e.toLowerCase().trim() === enseignant.toLowerCase().trim()
            );

            // Si l'enseignant n'existe pas, proposer de le créer automatiquement
            if (!enseignantTrouve) {
                LogService.warning(`⚠️ Enseignant "${enseignant}" non trouvé, création automatique...`);

                // Créer l'enseignant automatiquement
                StateManager.state.enseignants.push(enseignant);
                StateManager.state.enseignants.sort();
                enseignantTrouve = enseignant;
                stats.created++;

                LogService.success(`✅ Enseignant "${enseignant}" créé automatiquement`);
            }

            // Utiliser le nom exacte trouvé dans la liste (pour respecter la casse)
            const nomFinal = enseignantTrouve;

            const souhaits = {
                choix1: row[1] ? String(row[1]).trim() : '',
                c1: this.parseNumericValue(row[2]),
                td1: this.parseNumericValue(row[3]),
                tp1: this.parseNumericValue(row[4]),
                choix2: row[5] ? String(row[5]).trim() : '',
                c2: this.parseNumericValue(row[6]),
                td2: this.parseNumericValue(row[7]),
                tp2: this.parseNumericValue(row[8]),
                choix3: row[9] ? String(row[9]).trim() : '',
                c3: this.parseNumericValue(row[10]),
                td3: this.parseNumericValue(row[11]),
                tp3: this.parseNumericValue(row[12]),
                contraintes: row[13] ? String(row[13]).trim() : 'Aucune remarque.'
            };

            StateManager.state.enseignantSouhaits[nomFinal] = souhaits;
            stats.imported++;

            LogService.info(`📝 Souhaits importés pour ${nomFinal}`);
        }

        StateManager.saveState();

        return {
            success: true,
            stats
        };
    }

    /**
     * Parse une valeur numérique depuis Excel
     * @param {*} value - La valeur à parser
     * @returns {number} La valeur numérique (0 par défaut)
     */
    parseNumericValue(value) {
        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Importe les matières depuis Excel
     * @param {File} file - Le fichier Excel
     * @returns {Promise<Object>} { success: boolean, stats: Object }
     */
    async importSubjectsFromExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const result = this.parseSubjectsData(jsonData);

                    if (result.success) {
                        LogService.success(`✅ ${result.stats.imported} matières importées, ${result.stats.updated} mises à jour`);
                        NotificationManager.success(`${result.stats.imported + result.stats.updated} matières traitées`, 5000);

                        // Si des matières ont été créées, lancer la génération automatique (sans enseignants/salles)
                        if (Array.isArray(result.createdSubjects) && result.createdSubjects.length > 0) {
                            for (const matiereNom of result.createdSubjects) {
                                try {
                                    const subject = StateManager.getSubjects().find(s => s.nom === matiereNom);
                                    if (subject) {
                                        await SchedulingService.autoGenerateSubjectSessions(subject, {
                                            assignTeachers: false,
                                            assignRooms: false,
                                            respectWishes: false,
                                            avoidConflicts: false
                                        });
                                    }
                                } catch (err) {
                                    LogService.warning(`Échec génération auto pour ${matiereNom}: ${err.message}`);
                                }
                            }
                            StateManager.saveState();
                        }
                    }

                    resolve(result);
                } catch (error) {
                    LogService.error(`❌ Erreur lors de l'import: ${error.message}`);
                    NotificationManager.error('Erreur lors de l\'import');
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Parse les données de matières
     * @param {Array} data - Données du fichier
     * @returns {Object} { success: boolean, stats: Object, createdSubjects: Array<string> }
     */
    parseSubjectsData(data) {
        const stats = {
            imported: 0,
            updated: 0,
            skipped: 0,
            createdSubjects: []
        };

        // Format attendu (nouveau template) : 
        // [Matière, Filière, Département, Sections, TD_Groups, TP_Groups, Vol_Cours, Vol_TD, Vol_TP, Nb_Ens_TP]
        //
        // Le parser est tolérant : s'il trouve une ligne d'en-têtes, il mappe les colonnes
        // par nom (insensible à la casse / accents). Si aucune en-tête n'est détectée,
        // il conserve le comportement rétro-compatible (ancien format sans colonne 'Département').
        let startRow = 0;
        let headers = [];
        if (data.length > 0 && Array.isArray(data[0])) {
            headers = data[0].map(h => (h || '').toString().trim().toLowerCase());
            const firstCell = headers[0] || '';
            if (firstCell.includes('mati') || firstCell.includes('subject') || firstCell.includes('nom')) {
                // Probablement une ligne d'en-tête
                startRow = 1;
                LogService.info('En-tête détecté dans le fichier matières, utilisation du mapping par colonnes');
            } else {
                // Pas d'en-tête : lecture à partir de la première ligne (index 0)
                startRow = 0;
                headers = []; // indiquer qu'il n'y a pas d'en-têtes
            }
        }

        // Helper pour trouver un index d'entête par jeu de clés (tolérance casse/accents)
        const findIdx = (candidates) => {
            if (!headers || headers.length === 0) return -1;
            const normalized = headers.map(h => h.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
            for (let i = 0; i < normalized.length; i++) {
                const h = normalized[i];
                if (candidates.some(c => h.includes(c))) return i;
            }
            return -1;
        };

        // Si on a des en-têtes, déterminer index des colonnes
        let idx = {};
        if (headers.length > 0) {
            idx.matiere = findIdx(['mati', 'subject', 'nom']);
            idx.filiere = findIdx(['filiere', 'filier', 'filière']);
            idx.departement = findIdx(['depart', 'départ', 'department']);
            idx.sections = findIdx(['section']);
            idx.tdGroups = findIdx(['td', 'td_group', 'td groups']);
            idx.tpGroups = findIdx(['tp', 'tp_group', 'tp groups']);
            idx.volCours = findIdx(['vol_cours', 'cours', 'volcours', 'vol cours']);
            idx.volTD = findIdx(['vol_td', 'vol td', 'voltd']);
            idx.volTP = findIdx(['vol_tp', 'vol tp', 'voltp']);
            idx.nbEnsTP = findIdx(['nb', 'nb_ens', 'nbens', 'nb_ens_tp', 'nbens_tp']);
            // nouvel index pour la colonne des exclusions (Exclusions, Exclure, Exclude...)
            idx.exclusions = findIdx(['exclude', 'exclusions', 'exclure', 'exclu', 'exclusion', 'excluded']);
        }

        for (let i = startRow; i < data.length; i++) {
            const row = data[i];

            if (!row || row.length < 1 || !row[0]) {
                stats.skipped++;
                continue;
            }

            // Lecture tolérante : si on a des headers, utiliser les index calculés,
            // sinon, utiliser l'ancien schéma d'indexes (legacy)
            let matiere, filiere, departement;
            let sections, tdGroups, tpGroups, volCours, volTD, volTP, nbEnsTP;

            if (headers.length > 0) {
                matiere = (idx.matiere >= 0 && row[idx.matiere] !== undefined) ? String(row[idx.matiere]).trim() : '';
                filiere = (idx.filiere >= 0 && row[idx.filiere] !== undefined) ? String(row[idx.filiere]).trim() : '';
                departement = (idx.departement >= 0 && row[idx.departement] !== undefined) ? String(row[idx.departement]).trim() : '';
                sections = (idx.sections >= 0 && row[idx.sections] !== undefined && String(row[idx.sections]).trim() !== '') ? parseInt(row[idx.sections]) : 1;
                tdGroups = (idx.tdGroups >= 0 && row[idx.tdGroups] !== undefined && String(row[idx.tdGroups]).trim() !== '') ? parseInt(row[idx.tdGroups]) : 0;
                tpGroups = (idx.tpGroups >= 0 && row[idx.tpGroups] !== undefined && String(row[idx.tpGroups]).trim() !== '') ? parseInt(row[idx.tpGroups]) : 0;
                volCours = (idx.volCours >= 0 && row[idx.volCours] !== undefined && String(row[idx.volCours]).trim() !== '') ? parseInt(row[idx.volCours]) : 0;
                volTD = (idx.volTD >= 0 && row[idx.volTD] !== undefined && String(row[idx.volTD]).trim() !== '') ? parseInt(row[idx.volTD]) : 0;
                volTP = (idx.volTP >= 0 && row[idx.volTP] !== undefined && String(row[idx.volTP]).trim() !== '') ? parseInt(row[idx.volTP]) : 0;
                nbEnsTP = (idx.nbEnsTP >= 0 && row[idx.nbEnsTP] !== undefined && String(row[idx.nbEnsTP]).trim() !== '') ? parseInt(row[idx.nbEnsTP]) : 1;
            } else {
                // Legacy format (no headers): assume old column order
                matiere = row[0] ? String(row[0]).trim() : '';
                filiere = row[1] ? String(row[1]).trim() : '';
                departement = ''; // not present in legacy format
                sections = (row[2] !== undefined && String(row[2]).trim() !== '') ? parseInt(row[2]) : 1;
                tdGroups = (row[3] !== undefined && String(row[3]).trim() !== '') ? parseInt(row[3]) : 0;
                tpGroups = (row[4] !== undefined && String(row[4]).trim() !== '') ? parseInt(row[4]) : 0;
                volCours = (row[5] !== undefined && String(row[5]).trim() !== '') ? parseInt(row[5]) : 0;
                volTD = (row[6] !== undefined && String(row[6]).trim() !== '') ? parseInt(row[6]) : 0;
                volTP = (row[7] !== undefined && String(row[7]).trim() !== '') ? parseInt(row[7]) : 0;
                nbEnsTP = (row[8] !== undefined && String(row[8]).trim() !== '') ? parseInt(row[8]) : 1;
            }

            // validation minimale
            if (!matiere) {
                stats.skipped++;
                continue;
            }

            const matiereData = {
                filiere,
                departement: departement || '',
                sections_cours: sections,
                td_groups: tdGroups,
                tp_groups: tpGroups,
                volumeHTP: {
                    Cours: volCours,
                    TD: volTD,
                    TP: volTP
                },
                nbEnseignantsTP: nbEnsTP
            };

            if (StateManager.state.matiereGroupes[matiere]) {
                // Mise à jour (préserver éventuellement les champs existants)
                StateManager.state.matiereGroupes[matiere] = {
                    ...StateManager.state.matiereGroupes[matiere],
                    ...matiereData
                };
                stats.updated++;
                LogService.info(`📝 Matière "${matiere}" mise à jour`);
            } else {
                // Création (utilise la normalisation de StateManager.addSubject)
                StateManager.addSubject(matiere, matiereData);
                stats.imported++;
                stats.createdSubjects.push(matiere);
                LogService.info(`✅ Matière "${matiere}" créée`);
            }
        }

        StateManager.saveState();

        return {
            success: true,
            stats,
            createdSubjects: stats.createdSubjects
        };
    }

    /**
     * Exporte un template Excel pour les souhaits
     * @returns {boolean} Succès de l'export
     */
    exportWishesTemplate() {
        try {
            const data = [
                ['Enseignant', 'Choix 1', 'C1', 'TD1', 'TP1', 'Choix 2', 'C2', 'TD2', 'TP2', 'Choix 3', 'C3', 'TD3', 'TP3', 'Contraintes']
            ];

            // Ajouter tous les enseignants existants
            const enseignants = StateManager.state.enseignants;
            if (enseignants.length > 0) {
                enseignants.forEach(ens => {
                    const souhaits = StateManager.state.enseignantSouhaits[ens] || {};
                    data.push([
                        ens,
                        souhaits.choix1 || '',
                        souhaits.c1 || '',
                        souhaits.td1 || '',
                        souhaits.tp1 || '',
                        souhaits.choix2 || '',
                        souhaits.c2 || '',
                        souhaits.td2 || '',
                        souhaits.tp2 || '',
                        souhaits.choix3 || '',
                        souhaits.c3 || '',
                        souhaits.td3 || '',
                        souhaits.tp3 || '',
                        souhaits.contraintes || 'Aucune remarque.'
                    ]);
                });
            } else {
                // Ajouter une ligne exemple si aucun enseignant
                data.push([
                    'Dr. Ahmed Bennani',
                    'Mécanique Quantique',
                    '1',
                    '2',
                    '0',
                    'Thermodynamique',
                    '0',
                    '1',
                    '1',
                    '',
                    '0',
                    '0',
                    '0',
                    'Disponible le matin'
                ]);
            }

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Souhaits');

            XLSX.writeFile(workbook, 'template_souhaits_enseignants.xlsx');

            LogService.success('✅ Template souhaits téléchargé');
            return true;
        } catch (error) {
            console.error('Erreur export template:', error);
            LogService.error(`❌ Erreur export template: ${error.message}`);
            return false;
        }
    }

    /**
     * Exporte un template Excel pour les matières
     * @returns {boolean} Succès de l'export
     */
    exportSubjectsTemplate() {
        try {
            const data = [
                // Nouveau template : ajout de la colonne "Département" après "Filière"
                ['Matière', 'Filière', 'Département', 'Sections', 'TD_Groups', 'TP_Groups', 'Vol_Cours', 'Vol_TD', 'Vol_TP', 'Nb_Ens_TP']
            ];

            // Ajouter toutes les matières existantes
            const matieres = Object.keys(StateManager.state.matiereGroupes);
            if (matieres.length > 0) {
                matieres.forEach(nom => {
                    const m = StateManager.state.matiereGroupes[nom];
                    data.push([
                        nom,
                        m.filiere || '',
                        m.departement || '',
                        m.sections_cours || 1,
                        m.td_groups || 0,
                        m.tp_groups || 0,
                        m.volumeHTP?.Cours || 0,
                        m.volumeHTP?.TD || 0,
                        m.volumeHTP?.TP || 0,
                        m.nbEnseignantsTP || 1
                    ]);
                });
            } else {
                // Ajouter une ligne exemple
                data.push(['Mécanique Quantique', 'S5 P', 'Département de Physique', '2', '4', '4', '48', '32', '36', '1']);
            }

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Matières');

            XLSX.writeFile(workbook, 'template_matieres.xlsx');

            LogService.success('✅ Template matières téléchargé');
            return true;
        } catch (error) {
            console.error('Erreur export template:', error);
            LogService.error(`❌ Erreur export template: ${error.message}`);
            return false;
        }
    }

    /**
    * Importe les filières depuis un fichier Excel.
    * Format attendu (par ligne) :
    *  - Filière (nom)
    *  - Session (ex: Automne | Printemps | autumn | spring)
    *  - Département
    *
    * Le résultat : ajoute/merge les objets dans StateManager.state.filieres (array d'objets { nom, session, departement })
    */
    async importFilieresFromExcel(file) {
        const self = this;
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('Aucun fichier fourni'));
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    const result = self.parseFilieresData(jsonData);

                    if (result.success) {
                        // merge into state
                        if (!Array.isArray(StateManager.state.filieres)) StateManager.state.filieres = [];
                        // Create map for existing filieres by name (case-insensitive)
                        const existingMap = {};
                        StateManager.state.filieres.forEach(f => { if (f && f.nom) existingMap[String(f.nom).toLowerCase()] = f; });

                        result.added = 0;
                        result.updated = 0;
                        result.rows.forEach(row => {
                            const key = String(row.nom || '').trim();
                            if (!key) return;
                            const keyLower = key.toLowerCase();
                            if (existingMap[keyLower]) {
                                // update fields
                                existingMap[keyLower].session = row.session || existingMap[keyLower].session || '';
                                existingMap[keyLower].departement = row.departement || existingMap[keyLower].departement || '';
                                result.updated++;
                            } else {
                                StateManager.state.filieres.push({
                                    nom: row.nom,
                                    session: row.session || '',
                                    departement: row.departement || ''
                                });
                                result.added++;
                            }
                        });

                        StateManager.saveState();
                        NotificationManager && typeof NotificationManager.success === 'function' && NotificationManager.success(`${result.added} filière(s) ajoutée(s), ${result.updated} mise(s) à jour`);
                    }

                    resolve(result);
                } catch (err) {
                    console.error('importFilieresFromExcel error', err);
                    NotificationManager && typeof NotificationManager.error === 'function' && NotificationManager.error('Erreur lors de l\'import des filières');
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsArrayBuffer(file);
        });
    }
    /**
     * Importe les filières depuis un fichier Excel (wrapper complet).
     * Utilise parseFilieresData pour extraire les lignes, puis merge les filières
     * et collecte la colonne "Exclusions" (ou 11ème colonne F11) pour générer
     * StateManager.state.filiereExclusions.
     *
     * @param {File} file - fichier Excel
     * @returns {Promise<Object>} résultat { success, added, updated, rowsProcessed, pairsImported }
     */
    async importFilieresFromExcel(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('Aucun fichier fourni'));
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // XLSX est chargé globalement dans index.html (lib/xlsx.full.min.js)
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    // parseFilieresData doit exister et retourner { success, rows }
                    const parsed = this.parseFilieresData(jsonData);
                    if (!parsed || !parsed.success) {
                        return resolve({ success: false, message: 'Échec du parsing des filières', rowsProcessed: parsed?.rows?.length || 0 });
                    }

                    const rows = parsed.rows || [];

                    // Préparer structure filieres dans l'état
                    if (!Array.isArray(StateManager.state.filieres)) StateManager.state.filieres = [];
                    const existingMap = {};
                    StateManager.state.filieres.forEach(f => { if (f && f.nom) existingMap[String(f.nom).toLowerCase()] = f; });

                    let added = 0;
                    let updated = 0;
                    rows.forEach(row => {
                        const key = String(row.nom || '').trim();
                        if (!key) return;
                        const keyLower = key.toLowerCase();
                        if (existingMap[keyLower]) {
                            existingMap[keyLower].session = row.session || existingMap[keyLower].session || '';
                            existingMap[keyLower].departement = row.departement || existingMap[keyLower].departement || '';
                            updated++;
                        } else {
                            StateManager.state.filieres.push({
                                nom: row.nom,
                                session: row.session || '',
                                departement: row.departement || ''
                            });
                            added++;
                        }
                    });

                    // --- Collecter paires d'exclusions depuis rows[*].exclusions (si présentes) ---
                    const collected = [];
                    rows.forEach(r => {
                        if (!r || !r.nom) return;
                        const base = String(r.nom).trim();
                        const ex = r.exclusions;
                        if (!ex) return;
                        if (Array.isArray(ex)) {
                            ex.forEach(v => { if (v && String(v).trim() && String(v).trim() !== base) collected.push([base, String(v).trim()]); });
                        } else if (typeof ex === 'string' && ex.trim()) {
                            ex.split(/[;,|:]/).map(x => x.trim()).filter(Boolean).forEach(v => { if (v && v !== base) collected.push([base, v]); });
                        }
                    });

                    let pairsImported = 0;
                    if (collected.length) {
                        if (!StateManager.state) StateManager.state = {};
                        const existingPairs = Array.isArray(StateManager.state.filiereExclusions) ? StateManager.state.filiereExclusions.slice() : [];
                        const seen = new Set();
                        const merged = [];
                        const addPair = (a, b) => {
                            const A = String(a || '').trim();
                            const B = String(b || '').trim();
                            if (!A || !B) return;
                            const key = (A < B) ? `${A}|${B}` : `${B}|${A}`;
                            if (seen.has(key)) return;
                            seen.add(key);
                            merged.push([A, B]);
                        };
                        existingPairs.forEach(p => { if (Array.isArray(p) && p.length >= 2) addPair(p[0], p[1]); });
                        collected.forEach(p => { if (Array.isArray(p) && p.length >= 2) addPair(p[0], p[1]); });
                        StateManager.state.filiereExclusions = merged;
                        pairsImported = merged.length;
                    }

                    // Save state
                    try { StateManager.saveState(); } catch (err) { /* ignore */ }

                    // Notifications / logs
                    NotificationManager?.success?.(`${added} filière(s) ajoutée(s), ${updated} mise(s) à jour`);
                    LogService?.info?.(`Import filieres: ${added} added, ${updated} updated, ${pairsImported} exclusions`);

                    resolve({ success: true, added, updated, rowsProcessed: rows.length, pairsImported });
                } catch (err) {
                    LogService?.error?.('importFilieresFromExcel error: ' + (err?.message || err));
                    NotificationManager?.error?.('Erreur lors de l\'import des filières');
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsArrayBuffer(file);
        });
    }
    /**
     * Parse les données brutes d'Excel pour les filières.
     * Tolérant : détecte en-tête si présent, accepte ordre [nom, session, departement] sinon legacy.
     */
    /**
 * Helpers et méthodes d'import/export pour les filières
 * - Normalisation automatique des noms de filière/exclusions
 * - parseFilieresData : lit une feuille au format array-of-arrays (sheet_to_json(..., {header:1}))
 * - exportFilieresTemplate : génère un template XLSX avec colonne "Exclusions"
 */

    // Normalise un nom de filière pour comparaison/stocker : supprime accents, espaces et signes, met en MAJUSCULE
    _normalizeFiliereName(name) {
        if (!name && name !== 0) return '';
        try {
            let s = String(name || '').trim();
            // enlever accents
            s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            // supprimer tous les caractères non alphanumériques (espaces, tirets, etc.)
            s = s.replace(/[^0-9A-Za-z]/g, '');
            return s.toUpperCase();
        } catch (e) {
            return String(name || '').replace(/[^0-9A-Za-z]/g, '').trim().toUpperCase();
        }
    }

    /**
     * Parse les données d'une feuille Excel (array-of-arrays) pour en extraire les filières.
     * Retourne { success: boolean, rows: Array<{ nom, session, departement, exclusions: Array<string> }> }
     *
     * Comportement :
     * - détecte automatiquement les colonnes Filière/Session/Département/Exclusions d'après l'en-tête (insensible aux accents/majuscules)
     * - normalise les noms de filières et les exclusions (stockées dans rows[*].exclusions comme tableau de noms normalisés)
     */
    parseFilieresData(sheetAOA) {
        try {
            if (!Array.isArray(sheetAOA) || sheetAOA.length === 0) {
                return { success: false, message: 'Données de feuille invalides', rows: [] };
            }

            const headerRow = sheetAOA[0].map(h => (h === undefined || h === null) ? '' : String(h));
            // fonction d'aide : normalize header cell for matching (remove accents, lower)
            const normalizeHeaderCell = (c) => {
                try {
                    return String(c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                } catch (e) {
                    return String(c || '').toLowerCase().trim();
                }
            };

            const headerMap = {};
            headerRow.forEach((cell, idx) => {
                const n = normalizeHeaderCell(cell);
                headerMap[idx] = n;
            });

            // trouver indices pour colonnes connues
            const findIndex = (candidates) => {
                for (const [idx, name] of Object.entries(headerMap)) {
                    for (const cand of candidates) {
                        if (name.includes(cand)) return Number(idx);
                    }
                }
                return -1;
            };

            const idxFiliere = findIndex(['filiere', 'filièr', 'filière', 'nom']); // support variations
            const idxSession = findIndex(['session']);
            const idxDepartement = findIndex(['departement', 'département', 'department']);
            const idxExclusions = findIndex(['exclusion', 'exclusions', 'exclude', 'excl']);

            const rows = [];

            // parcourir lignes de données
            for (let r = 1; r < sheetAOA.length; r++) {
                const row = sheetAOA[r];
                if (!row || row.length === 0) continue;
                const rawNom = (idxFiliere >= 0) ? (row[idxFiliere] || '') : (row[0] || '');
                const rawSession = (idxSession >= 0) ? (row[idxSession] || '') : '';
                const rawDepartement = (idxDepartement >= 0) ? (row[idxDepartement] || '') : '';
                const rawExclusionsCell = (idxExclusions >= 0) ? (row[idxExclusions] || '') : '';

                const nomTrim = String(rawNom || '').trim();
                if (!nomTrim) continue; // ignorer lignes vides

                // normaliser le nom de filière pour stockage/comparaison
                const nomNorm = this._normalizeFiliereName(nomTrim);

                // parse exclusions : accepter , ; | : comme séparateurs, ou tableau si déjà existant
                let exclusionsList = [];
                if (Array.isArray(rawExclusionsCell)) {
                    exclusionsList = rawExclusionsCell.map(x => String(x || '').trim()).filter(Boolean);
                } else if (typeof rawExclusionsCell === 'string' && rawExclusionsCell.trim()) {
                    exclusionsList = rawExclusionsCell.split(/[;,|:]/).map(x => x.trim()).filter(Boolean);
                } else if (rawExclusionsCell !== undefined && rawExclusionsCell !== null && String(rawExclusionsCell).trim()) {
                    exclusionsList = [String(rawExclusionsCell).trim()];
                }

                // normaliser chaque exclusion (pour la comparaison interne)
                const exclusionsNormalized = exclusionsList.map(x => this._normalizeFiliereName(x)).filter(Boolean);

                rows.push({
                    nom: nomTrim,             // valeur telle que dans Excel (raw display)
                    nomNorm,                  // nom normalisé (utilisé pour matching)
                    session: String(rawSession || '').trim(),
                    departement: String(rawDepartement || '').trim(),
                    exclusions: exclusionsNormalized, // liste de noms normalisés
                    rawExclusions: exclusionsList     // liste brute telle que dans Excel (utile pour logs)
                });
            }

            return { success: true, rows };
        } catch (err) {
            console.error('parseFilieresData error', err);
            return { success: false, message: err && err.message ? err.message : String(err), rows: [] };
        }
    }

    /**
     * Exporte un template Excel pour les filières incluant une colonne "Exclusions"
     * - Colonnes: Filière | Session | Département | Exclusions
     * - Pré-remplit depuis StateManager.state.filieres et StateManager.state.filiereExclusions si disponibles
     */
    exportFilieresTemplate() {
        try {
            const data = [
                ['Filière', 'Session', 'Département', 'Exclusions']
            ];

            // Construire map des exclusions à partir de l'état (on tente de garder valeurs lisibles)
            const exMap = {};
            try {
                const rawEx = Array.isArray(StateManager.state?.filiereExclusions) ? StateManager.state.filiereExclusions : [];
                rawEx.forEach(p => {
                    if (!Array.isArray(p) || p.length < 2) return;
                    const a = String(p[0] || '').trim();
                    const b = String(p[1] || '').trim();
                    if (!a || !b) return;
                    exMap[a] = exMap[a] || new Set();
                    exMap[a].add(b);
                    exMap[b] = exMap[b] || new Set();
                    exMap[b].add(a);
                });
            } catch (e) {
                // ignore mapping errors
            }

            const filieres = Array.isArray(StateManager.state?.filieres) ? StateManager.state.filieres : [];
            if (filieres.length > 0) {
                filieres.forEach(f => {
                    const nom = f?.nom || '';
                    const session = f?.session || '';
                    const departement = f?.departement || '';
                    const excludesSet = exMap[nom] || new Set();
                    const excludes = Array.from(excludesSet).join(', ');
                    data.push([nom, session, departement, excludes]);
                });
            } else {
                // exemple
                data.push(['S5P', 'Automne', 'Département de Physique', 'S4P, S2PC']);
            }

            const worksheet = XLSX.utils.aoa_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Filieres');
            XLSX.writeFile(workbook, 'template_filieres.xlsx');

            if (typeof LogService !== 'undefined' && LogService.success) {
                LogService.success('Template filières téléchargé');
            } else {
                console.log('Template filières téléchargé');
            }

            return true;
        } catch (error) {
            console.error('Erreur export filieres template:', error);
            if (typeof LogService !== 'undefined' && LogService.error) {
                LogService.error('Erreur export filieres template: ' + (error && error.message ? error.message : String(error)));
            }
            return false;
        }
    }
}

// Export d'une instance singleton
export default new ImportService();
