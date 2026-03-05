/**
 * Gestionnaire de rendu du tableau EDT
 * @author Ibrahim Mrani - UCD
 */
// import { LISTE_JOURS, BREAK_CRENEAU } from '../config/constants.js';
import { initCreneaux } from '../utils/helpers.js';
import { getSortedCreneauxKeys, getSeparatorColumnIndex } from '../utils/helpers.js';
import { safeText } from '../utils/sanitizers.js';
import StateManager from '../controllers/StateManager.js';
import DialogManager from './DialogManager.js';
import { LISTE_JOURS, BREAK_CRENEAU, CRENEAUX_COUPLES_SUIVANT } from '../config/constants.js';


class TableRenderer {
    constructor() {
        this.tableElement = null;
        this.currentFilter = 'global';
        this.searchFilters = {
            matiere: '',
            enseignant: '',
            salle: '',
            sectionGroupe: ''
        };

        // Mapping couleurs par type (modifiable)
        this.TYPE_COLORS = {
            cours: '#28a745', // vert
            td: '#007bff',    // bleu
            tp: '#fd7e14',    // orange
            default: '#6c757d' // gris
        };
        // Limit number of seances rendered per cell to avoid DOM explosion
        this.MAX_SEANCES_PER_CELL = 6;
    }
    // ---------- Helpers robustes pour compatibilité avec plain-objects ----------
    _seanceHasTeacherSafe(seance) {
        try {
            if (!seance) return false;
            if (typeof seance.hasTeacher === 'function') return !!seance.hasTeacher();
            // propriétés alternatives courantes
            if (Array.isArray(seance.enseignantsArray) && seance.enseignantsArray.length > 0) return true;
            if (Array.isArray(seance.enseignants) && seance.enseignants.length > 0) return true;
            if (seance.enseignant || seance.professeur) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    _seanceHasRoomSafe(seance) {
        try {
            if (!seance) return false;
            if (typeof seance.hasRoom === 'function') return !!seance.hasRoom();
            // fallback: presence de propriété salle non vide
            if (seance.salle && String(seance.salle).trim()) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    _seanceHasTeacherAssignedSafe(seance, teacher) {
        try {
            if (!seance) return false;
            if (typeof seance.hasTeacherAssigned === 'function') return !!seance.hasTeacherAssigned(teacher);
            // fallback: check enseignants / enseignant string contains teacher
            if (!teacher) return this._seanceHasTeacherSafe(seance);
            const t = ('' + teacher).toLowerCase().trim();
            if (seance.enseignant && ('' + seance.enseignant).toLowerCase().includes(t)) return true;
            if (Array.isArray(seance.enseignantsArray) && seance.enseignantsArray.some(x => ('' + x).toLowerCase().includes(t))) return true;
            if (Array.isArray(seance.enseignants) && seance.enseignants.some(x => ('' + x).toLowerCase().includes(t))) return true;
        } catch (e) { /* ignore */ }
        return false;
    }
    // ---------- end helpers ----------
    init(tableId = 'edtTable') {
        this.tableElement = document.getElementById(tableId);
        if (!this.tableElement) {
            console.warn(`Table #${tableId} not found`);
        }
        else {
            // Delegated listener for "Voir plus" buttons (+N)
            this.tableElement.addEventListener('click', (ev) => {
                const btn = ev.target.closest && ev.target.closest('.cell-more-btn');
                if (btn) {
                    ev.preventDefault();
                    const jour = btn.getAttribute('data-jour');
                    const creneau = btn.getAttribute('data-creneau');
                    this.showCellDetailsModal(jour, creneau);
                }
            });
        }
        // ✅ NOUVEAU : Écouteur sur le changement de département
        this.initDepartmentListener();
    }
    /**
     * Initialise l'écouteur sur le sélecteur de département
     */
    initDepartmentListener() {
        try {
            const selectDept = document.getElementById('selectDepartement');
            if (selectDept && !selectDept.dataset.tableRendererAttached) {
                selectDept.addEventListener('change', () => {
                    console.log('TableRenderer: Changement de département détecté');
                    this.render();
                });
                selectDept.dataset.tableRendererAttached = '1';
                console.log('✅ TableRenderer: Écouteur département attaché');
            }
        } catch (error) {
            console.error('TableRenderer. initDepartmentListener error:', error);
        }
    }
    setFilter(filter) {
        this.currentFilter = filter;
    }

    setSearchFilters(filters) {
        this.searchFilters = { ...this.searchFilters, ...filters };
    }

    getFilteredSeances() {
        let seances = StateManager.getSeances();

        // ✅ NOUVEAU : Filtrer par département EN PREMIER
        seances = this.filterByDepartment(seances);

        // Filtrer par filière (vue)
        if (this.currentFilter === 'enseignant_selectionne') {
            const teacher = this.getSelectedTeacher();
            if (teacher) {
                seances = seances.filter(s => this._seanceHasTeacherAssignedSafe(s, teacher));
            } else {
                seances = [];
            }
        } else if (this.currentFilter !== 'global') {
            seances = seances.filter(s => s.filiere === this.currentFilter);
        }

        // Filtres de recherche
        const { matiere, enseignant, salle, sectionGroupe } = this.searchFilters;

        if (matiere || enseignant || salle || sectionGroupe) {
            seances = seances.filter(s => {
                const matchesMatiere = !matiere || (s.matiere || '').toLowerCase().includes(matiere.toLowerCase());
                const matchesEnseignant = !enseignant || (s.enseignant || '').toLowerCase().includes(enseignant.toLowerCase());
                const matchesSalle = !salle || (s.salle || '').toLowerCase().includes(salle.toLowerCase());
                const matchesSectionGroupe = !sectionGroupe || (s.groupe || '').toLowerCase().includes(sectionGroupe.toLowerCase());

                return matchesMatiere && matchesEnseignant && matchesSalle && matchesSectionGroupe;
            });
        }

        return seances;
    }

    getSelectedTeacher() {
        const ens1 = document.getElementById('inputEnseignant1')?.value || '';
        const ens2 = document.getElementById('inputEnseignant2')?.value || '';
        return ens2 || ens1 || null;
    }

    /**
     * Filtre les séances selon le département sélectionné
     * Exception : "Administration" affiche tout
     * @param {Array} seances - Toutes les séances
     * @returns {Array} Séances filtrées
     */
    filterByDepartment(seances) {
        try {
            // Récupérer le département sélectionné dans l'en-tête
            const selectDept = document.getElementById('selectDepartement');
            if (!selectDept) {
                console.debug('TableRenderer:  selectDepartement introuvable');
                return seances;
            }

            const selectedDept = selectDept.value?.trim();

            // Si vide ou "Administration", afficher tout
            if (!selectedDept || selectedDept === '' || selectedDept.toLowerCase() === 'administration') {
                console.log('TableRenderer: Aucun filtre département (Administration ou vide)');
                return seances;
            }

            console.log('TableRenderer: Filtrage par département:', selectedDept);

            // Récupérer les matières depuis StateManager
            const matiereGroupes = StateManager?.state?.matiereGroupes || {};

            // Filtrer les séances
            const filtered = seances.filter(seance => {
                if (!seance || !seance.matiere) return false;

                const matiereConfig = matiereGroupes[seance.matiere];

                // Si la matière n'a pas de config, on l'affiche quand même
                if (!matiereConfig) {
                    console.debug(`TableRenderer: Matière sans config:  ${seance.matiere}`);
                    return true;
                }

                // Récupérer le département de la matière
                const matiereDept = matiereConfig.departement?.trim() || '';

                // Comparaison insensible à la casse
                const match = matiereDept.toLowerCase() === selectedDept.toLowerCase();

                //if (!match) {
                  //  console.debug(`TableRenderer: Séance filtrée: ${seance.matiere} (dept: ${matiereDept} ≠ ${selectedDept})`);
                //}

                return match;
            });

            console.log(`TableRenderer: ${seances.length} séances → ${filtered.length} après filtre département`);

            return filtered;

        } catch (error) {
            console.error('TableRenderer. filterByDepartment error:', error);
            // En cas d'erreur, retourner toutes les séances
            return seances;
        }
    }

    hasActiveSearch() {
        const { matiere, enseignant, salle, sectionGroupe } = this.searchFilters;
        return !!(matiere || enseignant || salle || sectionGroupe);
    }

    hexToRgba(hex, alpha = 0.12) {
        if (!hex) return `rgba(108,117,125,${alpha})`;
        const h = hex.replace('#', '');
        const bigint = parseInt(h, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    /**
      * Retourne une priorité numérique pour le type de séance.
      * Les valeurs plus faibles sont rendues en premier (en haut).
      * Nouveau comportement demandé : afficher d'abord les TP, puis les Cours, puis les TD.
      *   TP -> 1, Cours -> 2, TD -> 3, autres -> 4
      */
    getTypePriority(type) {
        const t = (type || '').toString().trim().toLowerCase();
        if (t.includes('tp')) return 1;
        if (t.includes('cours')) return 2;
        if (t.includes('td')) return 3;
        return 4;
    }
    /**
     * Trie stable des séances : Cours puis TD puis TP.
     * Optionnellement on tente de garder ensemble les paires TP si elles
     * sont présentes dans la même liste.
     *
     * Ici on opère au niveau d'une cellule (liste de séances) : on place
     * Cours/TD en tête et TP en bas, préservant l'ordre d'origine pour les
     * éléments de même priorité (stable sort).
     */
    prioritizeSessions(sessions = []) {
        if (!Array.isArray(sessions) || sessions.length <= 1) return sessions.slice();

        // stable sort: map to objects with original index
        const withIndex = sessions.map((s, i) => ({ s, i }));
        withIndex.sort((a, b) => {
            const pa = this.getTypePriority(a.s.type);
            const pb = this.getTypePriority(b.s.type);
            if (pa !== pb) return pa - pb;
            return a.i - b.i; // stable: keep original order
        });

        return withIndex.map(x => x.s);
    }
    render() {
        if (!this.tableElement) return;

        // <== PATCH: ensure LISTE_CRENEAUX up-to-date before rendering!
        try {
            if (StateManager && StateManager.state && StateManager.state.creneaux) {
                initCreneaux(StateManager.state.creneaux);
            }
        } catch (e) {
            console.debug('TableRenderer: initCreneaux failed', e);
        }

        const seances = this.getFilteredSeances();
        const hasActiveSearch = this.hasActiveSearch();
        this._lastRenderedSeances = seances;
        this.tableElement.innerHTML = this.generateTableHTML(seances, hasActiveSearch);
    }

    generateTableHTML(seances, hasActiveSearch = false) {
        const sortedCreneaux = getSortedCreneauxKeys();
        const creneauxData = StateManager.state.creneaux;

        let html = '<thead><tr><th>Jour/Heure</th>';

        sortedCreneaux.forEach(c => {
            html += `<th>${c} - ${creneauxData[c].fin}</th>`;
            if (c === BREAK_CRENEAU) {
                html += '<th class="separator-column"></th>';
            }
        });

        html += '</tr></thead><tbody>';

        LISTE_JOURS.forEach(jour => {
            html += `<tr><td class="jour-header">${jour}</td>`;

            sortedCreneaux.forEach(creneau => {
                let seancesCell = seances.filter(s => s.jour === jour && s.creneau === creneau);
                // Prioritize sessions in the cell so that Cours/TD are shown first and TP last.
                // This reserves the lower slots of the cell for TP which typically span two
                // half-créneaux and should appear aligned towards the bottom.
                try {
                    seancesCell = this.prioritizeSessions(seancesCell);
                } catch (e) {
                    console.debug('TableRenderer: prioritizeSessions failed', e);
                }

                // === CHANGEMENT APPLIQUÉ ===
                // Ne plus appliquer de fond coloré ou bordure colorée aux <td> des créneaux.
                // Seules les séances individuelles conservent leur badge coloré.
                const cellStyle = ''; // keep cell background white, no colored separation

                html += `<td data-jour="${jour}" data-creneau="${creneau}" ${cellStyle}
                    ondragover="EDTHandlers.handleDragOver(event)" 
                    ondragleave="EDTHandlers.handleDragLeave(event)" 
                    ondrop="EDTHandlers.handleDrop(event)">`;

                html += `<button class="add-seance-in-cell-btn" 
                    onclick="EDTHandlers.attribuerSeanceDirectement('${jour}', '${creneau}')" 
                    title="Attribuer la séance configurée ici">+</button>`;


                // Render up to MAX_SEANCES_PER_CELL, then a "+N" button if more exist
                const max = this.MAX_SEANCES_PER_CELL || 6;
                const toShow = seancesCell.slice(0, max);
                toShow.forEach(seance => {
                    html += this.generateSeanceHTML(seance, hasActiveSearch);
                });
                if (seancesCell.length > max) {
                    const remaining = seancesCell.length - max;
                    html += `<div class="cell-more">
                                <button class="cell-more-btn" data-jour="${jour}" data-creneau="${creneau}" data-count="${remaining}">
                                    +${remaining} autres
                                </button>
                             </div>`;
                }

                html += '</td>';

                if (creneau === BREAK_CRENEAU) {
                    html += '<td class="separator-column"></td>';
                }
            });

            html += '</tr>';
        });

        html += '</tbody>';

        return html;
    }
    /**
        * Affiche en modal la liste complète des séances pour une cellule jour/creneau
        * (chargement lazy — on reconstruit le HTML uniquement à la demande)
        */
    showCellDetailsModal(jour, creneau) {
        try {
            // Use the full dataset (ignore current visible filters) so the modal shows *all* séances
            // Prefer an explicit API if available, otherwise fallback to StateManager.getSeances or state.seances
            const allSeances = (typeof StateManager.getAllSeances === 'function')
                ? StateManager.getAllSeances()
                : ((typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : (StateManager.state && Array.isArray(StateManager.state.seances) ? StateManager.state.seances : []));
            const seancesCell = (allSeances || []).filter(s => s.jour === jour && s.creneau === creneau);

            if (!seancesCell || seancesCell.length === 0) {
                DialogManager.info(`Aucune séance trouvée pour ${safeText(jour)} - ${safeText(creneau)}`, `Aucune séance.`);
                return;
            }
            // include count in the header so user knows how many sessions exist for this cell
            // and make the list scrollable so all séances sont accessibles via un curseur
            let html = `<div class="cell-details-modal">
                            <h4>${safeText(jour)} — ${safeText(creneau)} (${seancesCell.length})</h4>
                            <div class="cell-details-list" style="max-height:60vh; overflow:auto; padding-right:8px;">`;
            seancesCell.forEach(s => {
                html += `<div class="cell-details-item" style="margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed #eee;">
                            <div><strong>${safeText(s.matiere || '')} (${safeText(s.type || '')})</strong></div>
                            <div>${safeText(s.filiere || '')} ${safeText(s.groupe || '')}</div>
                            <div>👨‍🏫 ${safeText(s.enseignant || (Array.isArray(s.enseignantsArray) ? s.enseignantsArray.join(', ') : ''))}</div>
                            <div>🏛️ ${safeText(s.salle || '')}</div>
                         </div>`;
            });
            html += `</div></div>`;

            // DialogManager will sanitize/escape depending on DOMPurify presence
            DialogManager.show({
                title: `Séances — ${safeText(jour)} ${safeText(creneau)}`,
                htmlMessage: html,
                allowHtml: true,
                onConfirm: null,
                onCancel: null
            });
        } catch (e) {
            console.error('showCellDetailsModal error', e);
            DialogManager.error('Erreur lors de l\'ouverture du détail de cellule');
        }
    }

    generateSeanceHTML(seance, highlight = false) {
        const highlightClass = highlight ? 'highlight-search' : '';

        const departement = StateManager.state.header?.departement || '';
        const isAdministration = departement === 'Administration';

        const nonAttribueeClass = (!this._seanceHasTeacherSafe(seance) && !isAdministration) ? 'seance-non-attribuee' : '';

        const isSansSalle = !this._seanceHasRoomSafe(seance) && (seance.type || '').toString().toUpperCase().indexOf('TP') === -1;
        const sansSalleClass = isSansSalle ? 'seance-sans-salle' : '';

        // Classe pour les séances verrouillées
        const lockedClass = seance.locked ? 'seance-locked' : '';

        const filiereDisplay = seance.filiere
            ? `<span class="filiere-section">${safeText(seance.filiere)}</span>`
            : '';

        const groupeDisplay = (seance.groupe && seance.groupe !== 'N/A')
            ? `<span class="groupe-section">${safeText(seance.groupe)}</span><br>`
            : '';

        const typeNorm = (seance.type || '').toString().trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
        const typeKey = typeNorm.includes('cours') ? 'cours' : typeNorm.includes('td') ? 'td' : typeNorm.includes('tp') ? 'tp' : 'default';

        const color = this.TYPE_COLORS[typeKey] || this.TYPE_COLORS.default;
        const bg = this.hexToRgba(color, 0.10);

        let enseignantsDisplay = '';
        if (seance.enseignant) {
            enseignantsDisplay = `<span class="enseignants">${safeText(seance.enseignant)}</span><br>`;
        } else if (Array.isArray(seance.enseignantsArray) && seance.enseignantsArray.length > 0) {
            enseignantsDisplay = `<span class="enseignants">${safeText(seance.enseignantsArray.join(', '))}</span><br>`;
        }

        const salleDisplay = isSansSalle
            ? `<small class="salle-missing">Sans salle</small>`
            : `<small>${safeText(seance.salle || '')}</small>`;

        const typeBadge = `<span class="seance-type-badge" style="background:${color}; color:#fff; padding:2px 6px; border-radius:12px; font-size:.75em; margin-left:6px;">${safeText(seance.type || '')}</span>`;

        return `
        <div class="seance ${typeKey} ${highlightClass} ${nonAttribueeClass} ${sansSalleClass}" data-id="${seance.id}"
             style="background:${bg}; border-left:4px solid ${color}; padding:6px 8px; margin:6px 0; border-radius:4px;">
             ${seance.locked ? '<span class="lock-indicator" title="Séance verrouillée">🔒</span>' : ''}
            
            <button class="lock-btn" onclick="EDTHandlers.toggleLockSeance(${seance.id})" title="${seance.locked ? 'Déverrouiller' : 'Verrouiller'}">
                ${seance.locked ? '🔓' : '🔒'}
            </button>
             <button class="delete-btn" onclick="EDTHandlers.supprimerSeance(${seance.id})">x</button>
            <div class="seance-data" draggable="${seance.locked ? 'false' : 'true'}" 
                ondragstart="EDTHandlers.handleDragStart(event, ${seance.id})" 
                ondragend="EDTHandlers.handleDragEnd(event)" 
                onclick="EDTHandlers.ouvrirFormulairePourModifier(${seance.id})">
                <strong style="display:inline-block; margin-right:6px;">${safeText(seance.matiere)} (${safeText(seance.type)})</strong>${typeBadge}<br>
                ${filiereDisplay}
                ${groupeDisplay}
                ${enseignantsDisplay}
                ${salleDisplay}
            </div>
        </div>
    `;
    }

    generatePDFData(seances) {
        const sortedCreneaux = getSortedCreneauxKeys();
        const creneauxData = StateManager.state.creneaux;

        const headContent = [];
        sortedCreneaux.forEach(c => {
            headContent.push(`${c}\n${creneauxData[c].fin}`);
            if (c === BREAK_CRENEAU) {
                headContent.push('');
            }
        });
        const head = [['Jour/Heure', ...headContent]];

        const body = [];
        LISTE_JOURS.forEach(jour => {
            const rowContent = [];
            sortedCreneaux.forEach(creneau => {
                const seancesCell = seances.filter(s => s.jour === jour && s.creneau === creneau);
                rowContent.push(seancesCell);
                if (creneau === BREAK_CRENEAU) {
                    rowContent.push('');
                }
            });
            body.push([jour, ...rowContent]);
        });

        return { head, body };
    }

    generateSimpleTableHTML(seances) {
        const sortedCreneaux = getSortedCreneauxKeys();
        const creneauxData = StateManager.state.creneaux;

        let html = '<table class="edt-print-table"><thead><tr><th>Jour/Heure</th>';

        sortedCreneaux.forEach(c => {
            html += `<th>${c} - ${creneauxData[c].fin}</th>`;
            if (c === BREAK_CRENEAU) {
                html += '<th class="separator-column"></th>';
            }
        });

        html += '</tr></thead><tbody>';

        LISTE_JOURS.forEach(jour => {
            html += `<tr><td class="jour-header">${jour}</td>`;

            sortedCreneaux.forEach(creneau => {
                const seancesCell = seances.filter(s => s.jour === jour && s.creneau === creneau);

                html += '<td>';

                seancesCell.forEach(seance => {
                    html += `<div class="seance-simple ${seance.type}">`;
                    html += `<strong>${safeText(seance.matiere)} (${safeText(seance.type)})</strong><br>`;
                    html += `${safeText(seance.filiere)} - ${safeText(seance.groupe)}<br>`;
                    html += `${safeText(seance.enseignant)}<br>`;
                    html += `<small>Salle: ${safeText(seance.salle)}</small>`;
                    html += '</div>';
                });

                html += '</td>';

                if (creneau === BREAK_CRENEAU) {
                    html += '<td class="separator-column"></td>';
                }
            });

            html += '</tr>';
        });

        html += '</tbody></table>';

        return html;
    }
    /**
 * Verrouille/Déverrouille une séance
 * @param {string} id - L'ID de la séance
 */
    toggleLockSeance(id) {
        try {
            const seance = StateManager.findSeanceById(id);

            if (!seance) {
                console.error('Séance introuvable:', id);
                return;
            }

            // Inverser l'état de verrouillage
            seance.locked = !seance.locked;

            // Sauvegarder
            StateManager.saveState();

            // Message
            const status = seance.locked ? 'verrouillée' : 'déverrouillée';
            const icon = seance.locked ? '🔒' : '🔓';

            if (typeof window.EDTNotification !== 'undefined' && window.EDTNotification) {
                window.EDTNotification.info(`${icon} Séance ${status}`, 2000);
            }

            // Rafraîchir l'affichage
            this.render();

            console.log(`[TableRenderer] Séance ${id} ${status}`);
        } catch (error) {
            console.error('[TableRenderer] Erreur toggleLockSeance:', error);
        }
    }

    /**
     * Vérifie si une séance est verrouillée avant de l'éditer
     * @param {string} id - L'ID de la séance
     * @returns {boolean} - true si l'édition est autorisée
     */
    checkSeanceLocked(id) {
        const seance = StateManager.findSeanceById(id);

        if (!seance) return false;

        if (seance.locked) {
            if (typeof window.EDTDialog !== 'undefined' && window.EDTDialog) {
                window.EDTDialog.confirm(
                    'Séance verrouillée',
                    'Cette séance est verrouillée. Voulez-vous la déverrouiller pour la modifier ? ',
                    () => {
                        this.toggleLockSeance(id);
                    }
                );
            } else {
                alert('Cette séance est verrouillée. Déverrouillez-la d\'abord.');
            }
            return false;
        }

        return true;
    }
}

export default new TableRenderer();