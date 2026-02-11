/**
 * Renderer pour les listes de configuration (sécurisé & events attachés dynamiquement)
 */
import StateManager from '../controllers/StateManager.js';
import { safeText } from '../utils/sanitizers.js';
import LogService from '../services/LogService.js'; // pour messages de confirmation si besoin
import { filterSubjectNamesByDepartment } from '../utils/helpers.js';

class ConfigListRenderer {
    /**
     * Rend la liste des enseignants
     * @param {string} containerId
     */
    renderEnseignantsList(containerId = 'configEnseignantsListContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const enseignants = StateManager.state.enseignants || [];

        if (enseignants.length === 0) {
            container.innerHTML = '<div class="config-list-empty">Aucun enseignant enregistré</div>';
            return;
        }

        let html = '<div class="config-list">';
        enseignants.forEach(nom => {
            const seances = (typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : []).filter(s => s.hasTeacherAssigned && s.hasTeacherAssigned(nom));
            const dataName = encodeURIComponent(nom);
            html += `
                <div class="config-list-item">
                    <div class="config-item-content">
                        <div class="config-item-title">${safeText(nom)}</div>
                        <div class="config-item-meta">${seances.length} séance(s) assignée(s)</div>
                    </div>
                    <div class="config-item-actions">
                        <button class="btn-delete-config" data-action="delete-teacher" data-name="${dataName}">
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

        // Attacher listeners
        container.querySelectorAll('[data-action="delete-teacher"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');
                if (window.EDTApp && typeof window.EDTApp.deleteEnseignant === 'function') {
                    window.EDTApp.deleteEnseignant(name);
                } else {
                    const controller = window.EDTTeacherController;
                    if (controller && typeof controller.removeTeacher === 'function') {
                        controller.removeTeacher(name);
                    } else {
                        LogService.warning(`Suppression enseignant demandée pour "${name}" mais aucun contrôleur accessible`);
                    }
                }
            });
        });
    }

    /**
     * Rend la liste des matières
     */
    renderMatieresList(containerId = 'configMatieresListContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const departement = StateManager.state?.header?.departement || '';
        const allMatieres = Object.keys(StateManager.state.matiereGroupes || {});
        
        // Filtrer par département en utilisant la fonction helper
        const matieres = filterSubjectNamesByDepartment(allMatieres, departement, StateManager.state.matiereGroupes);

        if (matieres.length === 0) {
            const deptNote = departement && departement !== 'Administration' ? ` pour le département ${safeText(departement)}` : '';
            container.innerHTML = `<div class="config-list-empty">Aucune matière enregistrée${deptNote}</div>`;
            return;
        }

        let html = '<div class="config-list">';
        matieres.forEach(nom => {
            const config = StateManager.state.matiereGroupes[nom] || {};
            const seances = (typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : []).filter(s => s.matiere === nom);
            const dataName = encodeURIComponent(nom);
            html += `
                <div class="config-list-item">
                    <div class="config-item-content">
                        <div class="config-item-title">${safeText(nom)}</div>
                        <div class="config-item-meta">
                            ${safeText(config.filiere || '')} • 
                            ${config.sections_cours || 0} section(s) • 
                            ${seances.length} séance(s)
                        </div>
                    </div>
                    <div class="config-item-actions">
                        <button class="btn-edit-config" data-action="edit-subject" data-name="${dataName}" title="Éditer la matière">
                            ✏️ Éditer
                        </button>
                        <button class="btn-delete-config" data-action="delete-subject" data-name="${dataName}">
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

        // Listener: éditer matière
        container.querySelectorAll('[data-action="edit-subject"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');

                // 1) Ouvrir l'onglet Configuration puis sous-onglet Matières (si présents)
                const configTabBtn = document.querySelector('.tab-btn[data-tab="config"]');
                if (configTabBtn) configTabBtn.click();

                // small delay to ensure sub-tabs are present / active
                setTimeout(() => {
                    const subtabBtn = document.querySelector('.sub-tab-btn[data-subtab="matieres"]');
                    if (subtabBtn) subtabBtn.click();

                    // 2) Utiliser FormManager pour remplir le formulaire
                    if (window.EDTFormManager && typeof window.EDTFormManager.fillMatiereForm === 'function') {
                        try {
                            window.EDTFormManager.fillMatiereForm(name);
                        } catch (err) {
                            LogService.error('Erreur fillMatiereForm: ' + (err && err.message));
                            DialogManager && typeof DialogManager.error === 'function' && DialogManager.error('Impossible d\'ouvrir le formulaire d\'édition. Voir la console.');
                        }
                    } else if (window.EDTApp && typeof window.EDTApp.switchToConfigTab === 'function') {
                        // fallback minimal: switch to config tab and show notification to user
                        window.EDTApp.switchToConfigTab();
                        LogService.warning('FormManager non disponible pour pré-remplir la matière.');
                    } else {
                        LogService.warning(`Édition matière demandée pour "${name}", mais FormManager non accessible.`);
                    }
                }, 80);
            });
        });

        container.querySelectorAll('[data-action="delete-subject"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');
                if (window.EDTApp && typeof window.EDTApp.deleteMatiere === 'function') {
                    window.EDTApp.deleteMatiere(name);
                } else {
                    LogService.warning(`Suppression matière demandée pour "${name}" mais aucun EDTApp.deleteMatiere accessible`);
                }
            });
        });
    }

    /**
     * Rend la liste des salles
     */
    renderSallesList(containerId = 'configSallesListContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const salles = Object.keys(StateManager.state.sallesInfo || {});

        if (salles.length === 0) {
            container.innerHTML = '<div class="config-list-empty">Aucune salle enregistrée</div>';
            return;
        }

        let html = '<div class="config-list">';
        salles.forEach(nom => {
            const type = StateManager.state.sallesInfo[nom];
            const seances = (typeof StateManager.getSeances === 'function' ? StateManager.getSeances() : []).filter(s => s.salle === nom);
            const dataName = encodeURIComponent(nom);
            html += `
                <div class="config-list-item">
                    <div class="config-item-content">
                        <div class="config-item-title">${safeText(nom)}</div>
                        <div class="config-item-meta">
                            Type: ${safeText(type || '')} • 
                            ${seances.length} séance(s)
                        </div>
                    </div>
                    <div class="config-item-actions">
                        <button class="btn-delete-config" data-action="delete-room" data-name="${dataName}">
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('[data-action="delete-room"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');
                if (window.EDTApp && typeof window.EDTApp.deleteSalle === 'function') {
                    window.EDTApp.deleteSalle(name);
                } else {
                    LogService.warning(`Suppression salle demandée pour "${name}" mais aucun EDTApp.deleteSalle accessible`);
                }
            });
        });
    }

    /**
     * Rend la liste des filières
     */
    renderFilieresList(containerId = 'configFilieresListContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const filieres = StateManager.state.filieres || [];

        if (filieres.length === 0) {
            container.innerHTML = '<div class="config-list-empty">Aucune filière enregistrée</div>';
            return;
        }

        let html = '<div class="config-list">';
        filieres.forEach(f => {
            const matieres = Object.keys(StateManager.state.matiereGroupes || {}).filter(m =>
                (StateManager.state.matiereGroupes[m] || {}).filiere === f.nom
            );
            const dataName = encodeURIComponent(f.nom);
            html += `
                <div class="config-list-item">
                    <div class="config-item-content">
                        <div class="config-item-title">${safeText(f.nom)}</div>
                        <div class="config-item-meta">
                            Session: ${safeText(f.session || '')} • 
                            ${matieres.length} matière(s)
                        </div>
                    </div>
                    <div class="config-item-actions">
                        <button class="btn-delete-config" data-action="delete-filiere" data-name="${dataName}">
                            🗑️ Supprimer
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('[data-action="delete-filiere"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = decodeURIComponent(btn.getAttribute('data-name') || '');
                if (window.EDTApp && typeof window.EDTApp.deleteFiliere === 'function') {
                    window.EDTApp.deleteFiliere(name);
                } else {
                    LogService.warning(`Suppression filière demandée pour "${name}" mais aucun EDTApp.deleteFiliere accessible`);
                }
            });
        });
    }

    /**
     * Rend la table des forfaits (on laisse le rendu tabulaire mais on ajoute listeners dynamiques)
     */
    renderForfaitsList(containerId = 'forfaitsListContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        import('../controllers/ForfaitController.js').then(module => {
            const ForfaitController = module.default;
            const forfaits = ForfaitController.getAllForfaits();

            if (!Array.isArray(forfaits) || forfaits.length === 0) {
                container.innerHTML = '<div class="config-list-empty">Aucun forfait enregistré</div>';
                return;
            }

            const byTeacher = {};
            forfaits.forEach(f => {
                if (!byTeacher[f.enseignant]) byTeacher[f.enseignant] = [];
                byTeacher[f.enseignant].push(f);
            });

            let html = '<table class="forfaits-table"><thead><tr>';
            html += '<th>Enseignant</th><th>Nature</th><th>Volume (h)</th><th>Description</th><th>Actions</th>';
            html += '</tr></thead><tbody>';

            const sortedTeachers = Object.keys(byTeacher).sort();

            sortedTeachers.forEach(teacher => {
                const teacherForfaits = byTeacher[teacher];
                const totalVolume = teacherForfaits.reduce((sum, f) => sum + (f.volumeHoraire || 0), 0);

                teacherForfaits.forEach((forfait, index) => {
                    const id = encodeURIComponent(forfait.id);
                    const badgeClass = ForfaitController.getBadgeClass ? ForfaitController.getBadgeClass(forfait.nature) : '';
                    html += '<tr>';
                    if (index === 0) html += `<td rowspan="${teacherForfaits.length}"><strong>${safeText(teacher)}</strong></td>`;
                    html += `<td><span class="forfait-badge ${badgeClass}">${safeText(forfait.nature || '')}</span></td>`;
                    html += `<td>${forfait.volumeHoraire || 0}h</td>`;
                    html += `<td>${safeText(forfait.description || '-')}</td>`;
                    html += `<td><div class="forfait-actions">
                                <button class="btn-forfait-edit" data-id="${id}">✏️ Modifier</button>
                                <button class="btn-forfait-delete" data-id="${id}">🗑️</button>
                              </div></td>`;
                    html += '</tr>';
                });

                html += `<tr class="forfait-summary"><td colspan="2"><strong>Total ${safeText(teacher)}</strong></td><td><strong>${totalVolume}h</strong></td><td colspan="2"></td></tr>`;
            });

            html += '</tbody></table>';

            const totalGlobal = forfaits.reduce((sum, f) => sum + (f.volumeHoraire || 0), 0);
            const volumesByNature = ForfaitController.getVolumesByNature ? ForfaitController.getVolumesByNature() : {};

            html += '<div class="forfait-summary" style="margin-top:20px">';
            html += '<h4>📊 Résumé Global</h4>';
            html += `<p><strong>Total des forfaits :</strong> ${totalGlobal}h</p>`;
            html += '<p><strong>Par nature :</strong></p><ul>';
            Object.entries(volumesByNature || {}).forEach(([nature, volume]) => {
                const badgeClass = ForfaitController.getBadgeClass ? ForfaitController.getBadgeClass(nature) : '';
                html += `<li><span class="forfait-badge ${badgeClass}">${safeText(nature)}</span> : ${volume}h</li>`;
            });
            html += '</ul></div>';

            container.innerHTML = html;

            container.querySelectorAll('.btn-forfait-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = decodeURIComponent(btn.getAttribute('data-id') || '');
                    ForfaitController.editForfait && ForfaitController.editForfait(id);
                });
            });
            container.querySelectorAll('.btn-forfait-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = decodeURIComponent(btn.getAttribute('data-id') || '');
                    ForfaitController.deleteForfait && ForfaitController.deleteForfait(id);
                });
            });
        }).catch(err => {
            LogService.warning('Impossible de charger ForfaitController: ' + (err && err.message));
        });
    }

    /**
     * Rend les réglages Salles par filière
     */
    renderSallesParFiliere(containerId = 'configSallesParFiliereContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const filieres = (StateManager.state.filieres || []).slice().sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')));
        const salles = Object.keys(StateManager.state.sallesInfo || {}).sort();
        const settings = StateManager.state.autoSallesParFiliere || {};

        if (filieres.length === 0) {
            container.innerHTML = '<div class="config-list-empty">Aucune filière configurée</div>';
            return;
        }

        let html = '';
        filieres.forEach(filiere => {
            const nomFiliere = filiere.nom;
            const currentSettingsCours = settings[nomFiliere]?.Cours || [];
            const currentSettingsTD = settings[nomFiliere]?.TD || [];

            html += `<div class="config-list-item auto-salle-item">
                        <div class="config-item-title">${safeText(nomFiliere)}</div>
                        <div class="auto-salle-selects">
                            <div class="form-group-inline">
                                <label>Cours (Pool):</label>
                                <select class="auto-salle-select auto-salle-cours" data-filiere="${encodeURIComponent(nomFiliere)}" multiple size="5">`;
            salles.forEach(s => {
                html += `<option value="${encodeURIComponent(s)}"${currentSettingsCours.includes(s) ? ' selected' : ''}>${safeText(s)}</option>`;
            });
            html += `       </select>
                            </div>
                            <div class="form-group-inline">
                                <label>TD (Pool):</label>
                                <select class="auto-salle-select auto-salle-td" data-filiere="${encodeURIComponent(nomFiliere)}" multiple size="5">`;
            salles.forEach(s => {
                html += `<option value="${encodeURIComponent(s)}"${currentSettingsTD.includes(s) ? ' selected' : ''}>${safeText(s)}</option>`;
            });
            html += `       </select>
                            </div>
                        </div>
                    </div>`;
        });

        container.innerHTML = html;

        container.querySelectorAll('.auto-salle-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const fil = decodeURIComponent(sel.getAttribute('data-filiere') || '');
                const type = sel.classList.contains('auto-salle-cours') ? 'Cours' : 'TD';
                const selected = Array.from(sel.selectedOptions).map(opt => decodeURIComponent(opt.value));
                const controller = window.EDTRoomController;
                if (controller && typeof controller.updateSallesParFiliere === 'function') {
                    const fakeSelect = { options: Array.from(sel.options) };
                    controller.updateSallesParFiliere(fil, type, fakeSelect);
                } else {
                    LogService.info(`Mise à jour auto-salles pour ${fil} (${type}): ${selected.join(', ')}, mais aucun contrôleur exposé.`);
                    // fallback: write into StateManager and save
                    try {
                        if (!StateManager.state.autoSallesParFiliere) StateManager.state.autoSallesParFiliere = {};
                        if (!StateManager.state.autoSallesParFiliere[fil]) StateManager.state.autoSallesParFiliere[fil] = {};
                        StateManager.state.autoSallesParFiliere[fil][type] = selected;
                        StateManager.saveState();
                    } catch (e) {
                        LogService.error('Impossible de sauvegarder autoSallesParFiliere: ' + (e && e.message));
                    }
                }
            });
        });
    }

    /**
     * Rend les réglages généraux (nouveau) :
     * - champ pour modifier toleranceMaxWorkload (valeur par défaut 16)
     */
    renderGeneralSettings(containerId = 'configGeneralSettingsContainer') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const tolerance = Number(StateManager.state.toleranceMaxWorkload || 16);

        const html = `
            <div class="config-section">
                <h3>Paramètres Généraux</h3>
                <div class="form-group">
                    <label for="inputTolerance">Tolérance maxWorkload (h)</label>
                    <input id="inputTolerance" type="number" min="0" value="${tolerance}" style="width:120px; margin-right:8px;" />
                    <button id="btnSaveTolerance" class="btn btn-primary">Enregistrer</button>
                    <span id="toleranceSavedMsg" style="margin-left:10px; color:green; display:none;">✔️ Enregistré</span>
                </div>
                <p class="help-text">Paramètre utilisé dans le calcul du seuil maxWorkload. Par défaut = 16.</p>
            </div>
        `;

        container.innerHTML = html;

        const input = container.querySelector('#inputTolerance');
        const btn = container.querySelector('#btnSaveTolerance');
        const savedMsg = container.querySelector('#toleranceSavedMsg');

        if (!input || !btn) return;

        btn.addEventListener('click', () => {
            const val = Number(input.value);
            if (!Number.isFinite(val) || val < 0) {
                LogService.warning('Valeur de tolérance invalide (doit être un nombre >= 0)');
                return;
            }

            const scheduling = window.SchedulingService || window.EDTSchedulingService || null;
            if (scheduling && typeof scheduling.setTolerance === 'function') {
                const success = scheduling.setTolerance(Math.round(val));
                if (success) {
                    savedMsg.style.display = 'inline';
                    setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
                } else {
                    LogService.error('Impossible de sauvegarder la tolérance via SchedulingService');
                }
            } else {
                try {
                    if (!StateManager.state) StateManager.state = {};
                    StateManager.state.toleranceMaxWorkload = Math.round(val);
                    StateManager.saveState();
                    savedMsg.style.display = 'inline';
                    setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
                } catch (err) {
                    LogService.error('Impossible de sauvegarder la tolérance (fallback): ' + (err.message || err));
                }
            }
        });
    }

    /**
     * Rend toutes les listes
     */
    renderAll() {
        this.renderEnseignantsList();
        this.renderMatieresList();
        this.renderSallesList();
        this.renderFilieresList();
        this.renderForfaitsList();
        this.renderSallesParFiliere();
        this.renderGeneralSettings();
    }

    /**
     * Échappe les guillemets (util)
     */
    escapeQuotes(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
    }
}

export default new ConfigListRenderer();