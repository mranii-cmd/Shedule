/**
 * Gestionnaire des fonctions de planification automatique
 * @author Ibrahim Mrani - UCD
 *
 * Modifications :
 * - Import de SessionController et ConflictService
 * - getOptimizationOptions() enrichie pour transmettre toutes les options utiles à l'optimiseur
 * - optimizeSchedule() : utilise désormais ScheduleOptimizerService.applyOptimizedSchedule pour appliquer le résultat (backup + save centralisés)
 * - optimizeSchedule() : génère un résumé de conflits plus précis en interrogeant ConflictService sur le jeu optimisé (prévisualisation)
 * - Suppression du code fragile de "recréation" manuelle des séances au profit d'un apply centralisé
 */

import SchedulingService from '../services/SchedulingService.js';
import StateManager from '../controllers/StateManager.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import SpinnerManager from '../ui/SpinnerManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import TableRenderer from '../ui/TableRenderer.js';
import ScheduleOptimizerService from '../services/ScheduleOptimizerService.js';
import TeacherConstraintParser from '../services/TeacherConstraintParser.js';
import SessionController from '../controllers/SessionController.js';
import ConflictService from '../services/ConflictService.js';

class SchedulingHandlers {
    /**
     * Lance la génération automatique de toutes les séances
     */
    async generateAllSessions() {
        const subjects = StateManager.getCurrentSessionSubjects();

        if (subjects.length === 0) {
            DialogManager.error('Aucune matière configurée pour la session actuelle.');
            return;
        }

        const options = this.getSchedulingOptions();

        DialogManager.confirm(
            'Génération Automatique',
            `Voulez-vous générer automatiquement toutes les séances manquantes ?<br><br>
            <strong>Options sélectionnées :</strong><br>
            - Attribuer enseignants : ${options.assignTeachers ? 'Oui' : 'Non'}<br>
            - Attribuer salles : ${options.assignRooms ? 'Oui' : 'Non'}<br>
            - Respecter souhaits : ${options.respectWishes ? 'Oui' : 'Non'}<br>
            - Éviter conflits : ${options.avoidConflicts ? 'Oui' : 'Non'}<br><br>
            <em>Cette opération peut prendre quelques secondes...</em>`,
            async () => {
                SpinnerManager.show();

                try {
                    const result = await SchedulingService.autoGenerateAllSessions(options);

                    SpinnerManager.hide();

                    if (result.success) {
                        const { created, failed, skipped, total } = result.stats;

                        DialogManager.success(
                            `✅ Génération terminée !<br><br>
                            <strong>Résultats :</strong><br>
                            - Séances créées : ${created}<br>
                            - Séances échouées : ${failed}<br>
                            - Séances existantes : ${skipped}<br>
                            - Total théorique : ${total}`
                        );

                        StateManager.saveState();
                        TableRenderer.render();
                        if (StateManager.state.header.session.toLowerCase().includes('automne')) {
                            StateManager.recomputeVolumesAutomne && StateManager.recomputeVolumesAutomne();
                        }
                    } else {
                        DialogManager.error('Erreur lors de la génération automatique.');
                    }
                } catch (error) {
                    SpinnerManager.hide();
                    LogService.error(`❌ Erreur : ${error.message}`);
                    DialogManager.error(`Erreur lors de la génération : ${error.message}`);
                }
            }
        );
    }

    /**
     * Génère les séances pour une matière spécifique
     * @param {string} matiereNom - Le nom de la matière
     */
    async generateSessionsForSubject(matiereNom) {
        const subject = StateManager.getSubjects().find(s => s.nom === matiereNom);

        if (!subject) {
            DialogManager.error('Matière introuvable.');
            return;
        }

        const options = this.getSchedulingOptions();

        DialogManager.confirm(
            'Génération Automatique',
            `Voulez-vous générer automatiquement les séances pour <strong>${matiereNom}</strong> ?`,
            async () => {
                SpinnerManager.show();

                try {
                    const result = await SchedulingService.autoGenerateSubjectSessions(subject, options);

                    SpinnerManager.hide();

                    const { created, failed, skipped, total } = result;

                    if (created > 0) {
                        NotificationManager.success(`${created} séance(s) créée(s) pour ${matiereNom}`);
                        StateManager.saveState();
                        TableRenderer.render();
                    } else if (skipped === total) {
                        NotificationManager.info('Toutes les séances existent déjà');
                    } else {
                        NotificationManager.warning(`${failed} séance(s) non créée(s)`);
                    }
                } catch (error) {
                    SpinnerManager.hide();
                    LogService.error(`❌ Erreur : ${error.message}`);
                    DialogManager.error(`Erreur : ${error.message}`);
                }
            }
        );
    }

    /**
     * Récupère les options de planification depuis l'interface
     * @returns {Object} Les options
     */
    getSchedulingOptions() {
        return {
            assignTeachers: document.getElementById('optionAssignTeachers')?.checked ?? true,
            assignRooms: document.getElementById('optionAssignRooms')?.checked ?? true,
            respectWishes: document.getElementById('optionRespectWishes')?.checked ?? true,
            avoidConflicts: document.getElementById('optionAvoidConflicts')?.checked ?? true,
            respectConstraints: document.getElementById('optRespectConstraints')?.checked ?? true
        };
    }

    async optimizeSchedule() {
        const seances = StateManager.getSeances();

        if (!seances || seances.length === 0) {
            DialogManager.error('Aucune séance à optimiser', 'Veuillez d\'abord créer des séances.');
            return;
        }

        // Afficher un message de chargement
        NotificationManager.info('Analyse de l\'emploi du temps en cours...');
        SpinnerManager.show();

         setTimeout(async () => {
            try {
                // Récupérer options depuis l'UI
                const opts = this.getOptimizationOptions();

                // Lancer l'optimisation (dry-run pour la prévisualisation)
                const previewOpts = Object.assign({}, opts, { dryRun: true, sallesInfo: StateManager.state?.sallesInfo || {} });
                // Call optimizer and await if it returns a Promise (some implementations return either sync object or a Promise)
                let maybePromise;
                try {
                    maybePromise = (ScheduleOptimizerService && typeof ScheduleOptimizerService.optimizeSchedule === 'function')
                        ? ScheduleOptimizerService.optimizeSchedule(previewOpts)
                        : null;
                } catch (callErr) {
                    SpinnerManager.hide();
                    console.error('[SchedulingHandlers] ScheduleOptimizerService.optimizeSchedule threw synchronously:', callErr);
                    DialogManager.error('Erreur d\'optimisation', callErr && (callErr.message || String(callErr)) || 'Erreur interne');
                    return;
                }

                let result;
                try {
                    result = (maybePromise && typeof maybePromise.then === 'function') ? await maybePromise : maybePromise;
                } catch (awaitErr) {
                    SpinnerManager.hide();
                    console.error('[SchedulingHandlers] ScheduleOptimizerService.optimizeSchedule rejected:', awaitErr);
                    const msg = awaitErr && (awaitErr.message || awaitErr.toString()) ? (awaitErr.message || String(awaitErr)) : 'Une erreur interne est survenue pendant l\'optimisation.';
                    DialogManager.error('Erreur d\'optimisation', msg);
                    return;
                }

                SpinnerManager.hide();

                 // Defensive handling: persist result for debugging and accept result as usable
                // when either result.success === true OR optimizedSeances is present.
                try {
                    // persist a JSON-safe shallow copy to help debugging from the console
                    try {
                        window.__lastOptimizationResult = JSON.parse(JSON.stringify(result, (k, v) => typeof v === 'function' ? '[Function]' : v));
                    } catch (e) {
                        // fallback: keep raw result reference (non-serializable)
                        window.__lastOptimizationResult = result;
                    }
                    window.__lastOptimizationResultAt = new Date().toISOString();
                } catch (e) { /* noop */ }

                if (!result) {
                    DialogManager.error('Erreur d\'optimisation', 'Aucun résultat reçu de l\'optimiseur.');
                    return;
                }

                const hasOptimized = Array.isArray(result.optimizedSeances) && result.optimizedSeances.length > 0;

                // Explicit failure returned by optimizer -> show error
                if (result.success === false) {
                    DialogManager.error('Erreur d\'optimisation', result.error || result.message || 'Une erreur est survenue');
                    return;
                }

               // DEBUG: log/record ambiguous result before deciding to show error
                try {
                    // keep a reference for quick inspection in the console (dev-only)
                    try {
                        window.__lastOptimizationResult = JSON.parse(JSON.stringify(result, (k, v) => typeof v === 'function' ? '[Function]' : v));
                    } catch (e) {
                        // if non-serializable, keep raw reference
                        window.__lastOptimizationResult = result;
                    }
                    window.__lastOptimizationResultAt = new Date().toISOString();

                    console.group('[SchedulingHandlers][DEBUG] ambiguous optimization result');
                    console.log('hasOptimized:', hasOptimized);
                    console.log('result (summary):', {
                        success: result && typeof result.success !== 'undefined' ? result.success : null,
                        optimizedSeancesLength: Array.isArray(result && result.optimizedSeances) ? result.optimizedSeances.length : null,
                        validation: result && result.validation ? result.validation : null,
                        error: result && (result.error || result.message) ? (result.error || result.message) : null
                    });
                    console.log('result (raw):', result);
                    console.trace();
                    console.groupEnd();
                } catch (e) {
                    console.warn('[SchedulingHandlers][DEBUG] failed to record ambiguous result', e);
                }

                // Now decide: explicit failure -> show error; ambiguous -> show error but with debug details
                if (result && result.success === false) {
                    DialogManager.error('Erreur d\'optimisation', result.error || result.message || 'Une erreur est survenue');
                    return;
                }

                if (!result || (!result.success && !hasOptimized)) {
                    // show debug-friendly message so we can see what's happening in prod/dev
                    const debugSummary = {
                        success: result && typeof result.success !== 'undefined' ? result.success : null,
                        optimizedSeancesLength: Array.isArray(result && result.optimizedSeances) ? result.optimizedSeances.length : null,
                        validation: result && result.validation ? result.validation : null,
                        error: result && (result.error || result.message) ? (result.error || result.message) : null,
                    };
                    console.error('[SchedulingHandlers] No usable optimization result (debug):', debugSummary, result);
                    DialogManager.error('Erreur d\'optimisation', `<div>Aucun résultat d'optimisation disponible</div><pre style="white-space:pre-wrap;">${JSON.stringify(debugSummary, null, 2)}</pre>`);
                    return;
                }

                // Construire le résumé HTML (avec détails de conflits plus précis)
                const summary = this._buildOptimizationSummary(result);

                // Ajout : collecter messages de conflits détaillés (ex. provenant de ConflictService) pour la prévisualisation
                const detailedConflicts = this._collectDetailedConflicts(result.optimizedSeances, previewOpts);
                const detailedHtml = detailedConflicts.length ? `<div style="margin-top:12px;"><strong>Conflits détectés (exemples) :</strong><ul style="margin-top:8px;">${detailedConflicts.slice(0,10).map(m => `<li style="color:#721c24;">${m}</li>`).join('')}</ul></div>` : '';

                // Afficher le dialogue de confirmation (prévisualisation)
                DialogManager.confirm(
                    'Optimisation de l\'emploi du temps',
                    summary + detailedHtml,
                    () => {
                        // Appliquer les changements en appelant l'API de l'optimizer (qui gère backup + save)
                        try {
                            SpinnerManager.show();

                            // appelle applyOptimizedSchedule qui remplace StateManager.state.seances et sauvegarde
                            const applied = ScheduleOptimizerService.applyOptimizedSchedule(result, { saveBackup: true });

                            SpinnerManager.hide();

                            if (applied) {
                                // Rafraîchir l'UI
                                TableRenderer.render();

                                const scoreImprovement = result.improvement.score;
                                const icon = scoreImprovement > 0 ? 'OK' : scoreImprovement < 0 ? 'WARN' : 'INFO';

                                NotificationManager.success(
                                    `${icon} Emploi du temps optimisé !  Score : ${result.optimizedStats.globalScore.toFixed(1)}/100 ` +
                                    `(${scoreImprovement > 0 ? '+' : ''}${scoreImprovement.toFixed(1)} points)`
                                );

                                LogService.info('Optimisation appliquée :');
                                LogService.info(`  - Score : ${result.currentStats.globalScore.toFixed(1)} -> ${result.optimizedStats.globalScore.toFixed(1)}`);
                                LogService.info(`  - Conflits résolus : ${result.improvement.conflicts}`);
                                LogService.info(`  - Trous supprimés : ${result.improvement.gaps}`);
                            } else {
                                DialogManager.error('Erreur', 'Impossible d\'appliquer l\'optimisation (voir logs).');
                            }
                        } catch (error) {
                            SpinnerManager.hide();
                            console.error('[SchedulingHandlers] Error applying optimization:', error);
                            DialogManager.error('Erreur', 'Impossible d\'appliquer l\'optimisation : ' + (error && error.message ? error.message : String(error)));
                        }
                    },
                    () => {
                        NotificationManager.info('Optimisation annulée');
                    }
                );

            } catch (error) {
                SpinnerManager.hide();
                LogService.error(`Erreur lors de l'optimisation : ${error.message}`);
                DialogManager.error('Erreur', `Impossible d'optimiser l'emploi du temps : ${error.message}`);
            }
        }, 300);
    }

    /**
     * Construit le résumé HTML de l'optimisation
     * @private
     */
    _buildOptimizationSummary(result) {
        const currentStats = result.currentStats;
        const optimizedStats = result.optimizedStats;
        const improvement = result.improvement;

        const scoreChange = improvement.score > 0 ? '+' : '';
        const conflictsChange = improvement.conflicts !== 0 ? ` (${improvement.conflicts > 0 ? '' : '+'}${-improvement.conflicts})` : '';
        const gapsChange = improvement.gaps !== 0 ? ` (${improvement.gaps > 0 ? '' : '+'}${-improvement.gaps})` : '';
        const clusteringChange = improvement.clustering !== 0 ? ` (${improvement.clustering > 0 ? '+' : ''}${(improvement.clustering * 100).toFixed(0)}%)` : '';
        const varianceChange = improvement.variance !== 0 ? ` (${improvement.variance > 0 ? '' : '+'}${(-improvement.variance).toFixed(2)})` : '';

        let improvementsList = '';
        if (improvement.conflicts > 0) improvementsList += `<li>${improvement.conflicts} conflit(s) resolu(s)</li>`;
        if (improvement.gaps > 0) improvementsList += `<li>${improvement.gaps} trou(s) supprime(s)</li>`;
        if (improvement.clustering > 0.05) improvementsList += `<li>Meilleur regroupement des matieres</li>`;
        if (improvement.variance > 0.5) improvementsList += `<li>Charge journaliere mieux equilibree</li>`;
        if (improvement.score === 0) improvementsList += `<li>L'emploi du temps est deja bien optimise</li>`;

        const improvementMessage = improvement.score > 0 ? 'Emploi du temps ameliore !' : improvement.score < 0 ? 'Quelques ajustements possibles' : 'Emploi du temps deja optimal';

        return `
            <div style="font-family: system-ui, -apple-system, sans-serif;">
                <h3 style="margin: 0 0 20px 0; color: #495057; font-size: 1.3em; text-align: center;">
                    Resultats de l'analyse
                </h3>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border: 2px solid #e9ecef;">
                        <h4 style="margin: 0 0 15px 0; color: #6c757d; font-size: 1.1em; text-align: center;">Avant</h4>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            <li style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                                <span style="color: #6c757d;">Score global :</span>
                                <strong style="float: right; color: #495057;">${currentStats.globalScore.toFixed(1)}/100</strong>
                            </li>
                            <li style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                                <span style="color: #6c757d;">Conflits :</span>
                                <strong style="float: right;">${currentStats.conflicts.total}</strong>
                            </li>
                            <li style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                                <span style="color: #6c757d;">Trous :</span>
                                <strong style="float: right;">${currentStats.gaps.length}</strong>
                            </li>
                            <li style="padding: 8px 0;">
                                <span style="color: #6c757d;">Regroupement :</span>
                                <strong style="float: right;">${(currentStats.subjectClustering * 100).toFixed(0)}%</strong>
                            </li>
                        </ul>
                    </div>

                    <div style="background: #d4edda; padding: 20px; border-radius: 10px; border: 2px solid #28a745;">
                        <h4 style="margin: 0 0 15px 0; color: #155724; font-size: 1.1em; text-align: center;">Apres optimisation</h4>
                        <ul style="list-style: none; padding: 0; margin: 0;">
                            <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">
                                <span style="color: #155724;">Score global :</span>
                                <strong style="float: right; color: #155724; font-size: 1.1em;">${optimizedStats.globalScore.toFixed(1)}/100</strong>
                            </li>
                            <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">
                                <span style="color: #155724;">Conflits :</span>
                                <strong style="float: right;">${optimizedStats.conflicts.total}${conflictsChange}</strong>
                            </li>
                            <li style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.1);">
                                <span style="color: #155724;">Trous :</span>
                                <strong style="float: right;">${optimizedStats.gaps.length}${gapsChange}</strong>
                            </li>
                            <li style="padding: 8px 0;">
                                <span style="color: #155724;">Regroupement :</span>
                                <strong style="float: right;">${(optimizedStats.subjectClustering * 100).toFixed(0)}%${clusteringChange}</strong>
                            </li>
                        </ul>
                    </div>
                </div>

                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 5px;">Amelioration globale</div>
                    <div style="font-size: 2em; font-weight: bold;">
                        ${scoreChange}${improvement.score.toFixed(1)} points
                    </div>
                    <div style="font-size: 0.85em; opacity: 0.8; margin-top: 5px;">
                        ${improvementMessage}
                    </div>
                </div>

                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #17a2b8;">
                    <strong style="color: #17a2b8;">Details des ameliorations :</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #495057;">
                        ${improvementsList}
                    </ul>
                </div>

                <p style="margin-top: 20px; color: #6c757d; text-align: center; font-size: 0.95em;">
                    Voulez-vous appliquer ces optimisations ?
                </p>
            </div>
        `;
    }

    /**
     * Collecte quelques messages de conflits détaillés via ConflictService pour la prévisualisation.
     * Renvoie un tableau de messages (strings).
     */
    _collectDetailedConflicts(optimizedSeances, opts = {}) {
        const msgs = [];
        try {
            const all = Array.isArray(optimizedSeances) ? optimizedSeances : (StateManager.state && StateManager.state.seances) || [];
            for (const s of all) {
                const confs = ConflictService.checkAllConflicts(s, all, [s.id], opts.sallesInfo || (StateManager.state && StateManager.state.sallesInfo) || {});
                if (Array.isArray(confs) && confs.length) {
                    // limiter la longueur des messages et en pousser un résumé
                    const preview = confs.slice(0, 3).join(' / ');
                    msgs.push(`${s.matiere} (${s.type}) - ${s.jour} ${s.heureDebut}-${s.heureFin}: ${preview}`);
                }
                if (msgs.length >= 30) break;
            }
        } catch (e) {
            this._log('debug', 'Error while collecting detailed conflicts', e);
        }
        return msgs;
    }

    /**
     * Détecte et résout automatiquement les conflits
     */
    async resolveConflicts() {
        const seances = StateManager.getSeances();

        if (!seances || seances.length === 0) {
            DialogManager.error('Aucune séance', 'Veuillez d\'abord créer des séances.');
            return;
        }

        NotificationManager.info('Detection des conflits en cours...');
        SpinnerManager.show();

         setTimeout(async () => {
            try {
                // Récupérer options depuis l'UI
                const opts = this.getOptimizationOptions();

                // Lancer l'optimisation (dry-run pour la prévisualisation)
                const previewOpts = Object.assign({}, opts, { dryRun: true, sallesInfo: StateManager.state?.sallesInfo || {} });

                let result;
                try {
                    // Await the optimizer (it returns a Promise)
                    result = await ScheduleOptimizerService.optimizeSchedule(previewOpts);
                } catch (err) {
                    SpinnerManager.hide();
                    console.error('[SchedulingHandlers] ScheduleOptimizerService.optimizeSchedule rejected:', err);
                    // Provide a more informative dialog if available
                    const msg = err && (err.message || err.toString()) ? (err.message || String(err)) : 'Une erreur interne est survenue pendant l\'optimisation.';
                    DialogManager.error('Erreur d\'optimisation', msg);
                    return;
                }

                SpinnerManager.hide();

                // Defensive: ensure we got an object result
               // Robust handling of optimization result:
                // - await the optimizer reliably,
                // - persist a JSON-safe debug copy on window,
                // - display validation errors clearly,
                // - force preview if we have optimizedSeances even when success flag is not truthy.
                //
                // This block replaces the previous fragile handling and centralizes error/preview logic.
                try {
                    // Persist JSON-safe debug copy
                    try {
                        window.__lastOptimizationResult = JSON.parse(JSON.stringify(result, (k, v) => typeof v === 'function' ? '[Function]' : v));
                    } catch (e) {
                        window.__lastOptimizationResult = {
                            success: !!(result && result.success),
                            error: result && (result.error || result.message),
                            validation: result && result.validation,
                            optimizedSeancesLength: Array.isArray(result && result.optimizedSeances) ? result.optimizedSeances.length : null
                        };
                    }
                    window.__lastOptimizationResultAt = new Date().toISOString();
                    console.group('[SchedulingHandlers] optimizeSchedule result summary');
                    console.log('success:', result && result.success);
                    console.log('validation:', result && result.validation);
                    console.log('optimizedSeances length:', Array.isArray(result && result.optimizedSeances) ? result.optimizedSeances.length : 'n/a');
                    console.groupEnd();
                } catch (e) {
                    console.error('[SchedulingHandlers] failed to persist/inspect optimization result', e);
                }

                // If there are validation errors, show them (but allow preview for debugging)
                try {
                    const valErrs = result && result.validation && Array.isArray(result.validation.errors) ? result.validation.errors : null;
                    if (valErrs && valErrs.length) {
                        const detailHtml = `<div style="text-align:left; max-height:220px; overflow:auto; margin-top:10px;"><strong>Erreurs de validation :</strong><pre style="white-space:pre-wrap;">${valErrs.slice(0,50).join('\n')}</pre></div>`;
                        // Show validation errors clearly
                        DialogManager.error('Erreurs de validation lors de l\'optimisation', detailHtml);
                        // still offer preview for debug if optimizedSeances exist
                        if (Array.isArray(result.optimizedSeances) && result.optimizedSeances.length) {
                            const svc = window.ScheduleOptimizerService;
                            const reportHtml = (svc && typeof svc.generateOptimizationReport === 'function')
                                ? svc.generateOptimizationReport(result)
                                : `<pre>${JSON.stringify({ success: result.success, validation: result.validation, improvement: result.improvement }, null, 2)}</pre>`;
                            DialogManager.confirm('Prévisualisation (avec erreurs)', reportHtml, () => {
                                try { svc && typeof svc.applyOptimizedSchedule === 'function' && svc.applyOptimizedSchedule(result, { saveBackup: true }); } catch (e) { DialogManager.error('Erreur', String(e)); }
                            }, () => {});
                        }
                        return;
                    }
                } catch (e) {
                    console.warn('[SchedulingHandlers] reading validation errors failed', e);
                }

                // If result is usable (success or optimizedSeances present) show preview
                if (result && (result.success || (Array.isArray(result.optimizedSeances) && result.optimizedSeances.length))) {
                    try {
                        const svc = window.ScheduleOptimizerService;
                        const reportHtml = (svc && typeof svc.generateOptimizationReport === 'function')
                            ? svc.generateOptimizationReport(result)
                            : `<pre>${JSON.stringify({ success: result.success, validation: result.validation, improvement: result.improvement }, null, 2)}</pre>`;

                        DialogManager.confirm('Prévisualisation : optimisation', reportHtml, async () => {
                            try {
                                if (svc && typeof svc.applyOptimizedSchedule === 'function') {
                                    const applied = await svc.applyOptimizedSchedule(result, { saveBackup: true });
                                    console.log('[SchedulingHandlers] applyOptimizedSchedule returned', applied);
                                } else {
                                    console.warn('[SchedulingHandlers] applyOptimizedSchedule not available on service');
                                }
                            } catch (e) {
                                console.error('[SchedulingHandlers] applyOptimizedSchedule failed', e);
                                DialogManager.error('Erreur', String(e && (e.message || e)));
                            }
                        }, () => {
                            console.info('Prévisualisation annulée');
                        });
                        return;
                    } catch (e) {
                        console.error('[SchedulingHandlers] failed to build/show preview', e);
                        DialogManager.error('Erreur d\'optimisation', 'Impossible d\'afficher la prévisualisation (voir la console).');
                        return;
                    }
                }

               // Fallback: no usable result — provide debug details (temporary, remove after fix)
                try {
                    const debugSummary = {
                        success: result && typeof result.success !== 'undefined' ? result.success : null,
                        optimizedSeancesLength: Array.isArray(result && result.optimizedSeances) ? result.optimizedSeances.length : null,
                        validation: result && result.validation ? result.validation : null,
                        error: result && (result.error || result.message) ? (result.error || result.message) : null,
                    };
                    console.error('[SchedulingHandlers] No usable optimization result (debug):', debugSummary, result);

                    const detailHtml = `<div style="text-align:left; max-height:320px; overflow:auto; margin-top:8px;"><strong>Détails (debug)</strong><pre style="white-space:pre-wrap;">${JSON.stringify(debugSummary, null, 2)}</pre><p style="font-size:0.9em;color:#666">Objet complet disponible dans la console (window.__lastOptimizationResult si présent).</p></div>`;
                    DialogManager.error('Erreur d\'optimisation', `<div>Aucun résultat d'optimisation disponible</div>${detailHtml}`);
                } catch (e) {
                    console.error('[SchedulingHandlers] fallback error while reporting optimization failure', e);
                }

                // Construire le résumé HTML (avec détails de conflits plus précis)
                const summary = this._buildOptimizationSummary(result);

                // Ajout : collecter messages de conflits détaillés (ex. provenant de ConflictService) pour la prévisualisation
                const detailedConflicts = this._collectDetailedConflicts(result.optimizedSeances, previewOpts);
                const detailedHtml = detailedConflicts.length ? `<div style="margin-top:12px;"><strong>Conflits détectés (exemples) :</strong><ul style="margin-top:8px;">${detailedConflicts.slice(0,10).map(m => `<li style="color:#721c24;">${m}</li>`).join('')}</ul></div>` : '';

                // Afficher le dialogue de confirmation (prévisualisation)
                DialogManager.confirm(
                    'Optimisation de l\'emploi du temps',
                    summary + detailedHtml,
                    async () => {
                        // Appliquer les changements en appelant l'API de l'optimizer (qui gère backup + save)
                        try {
                            SpinnerManager.show();

                            // applyOptimizedSchedule may be async; await it defensively
                            let applied = false;
                            try {
                                applied = await ScheduleOptimizerService.applyOptimizedSchedule(result, { saveBackup: true });
                            } catch (applyErr) {
                                SpinnerManager.hide();
                                console.error('[SchedulingHandlers] applyOptimizedSchedule failed:', applyErr);
                                DialogManager.error('Erreur', 'Impossible d\'appliquer l\'optimisation : ' + (applyErr && (applyErr.message || String(applyErr))));
                                return;
                            }

                            SpinnerManager.hide();

                            if (applied) {
                                // Rafraîchir l'UI
                                TableRenderer.render();

                                const scoreImprovement = result.improvement && typeof result.improvement.score === 'number' ? result.improvement.score : 0;
                                const icon = scoreImprovement > 0 ? 'OK' : scoreImprovement < 0 ? 'WARN' : 'INFO';

                                NotificationManager.success(
                                    `${icon} Emploi du temps optimisé !  Score : ${result.optimizedStats.globalScore.toFixed(1)}/100 ` +
                                    `(${scoreImprovement > 0 ? '+' : ''}${scoreImprovement.toFixed(1)} points)`
                                );

                                LogService.info('Optimisation appliquée :');
                                try {
                                    LogService.info(`  - Score : ${result.currentStats.globalScore.toFixed(1)} -> ${result.optimizedStats.globalScore.toFixed(1)}`);
                                    LogService.info(`  - Conflits résolus : ${result.improvement.conflicts}`);
                                    LogService.info(`  - Trous supprimés : ${result.improvement.gaps}`);
                                } catch (e) { /* ignore logging formatting errors */ }
                            } else {
                                DialogManager.error('Erreur', 'Impossible d\'appliquer l\'optimisation (voir logs).');
                            }
                        } catch (error) {
                            SpinnerManager.hide();
                            console.error('[SchedulingHandlers] Error applying optimization:', error);
                            DialogManager.error('Erreur', 'Impossible d\'appliquer l\'optimisation : ' + (error && error.message ? error.message : String(error)));
                        }
                    },
                    () => {
                        NotificationManager.info('Optimisation annulée');
                    }
                );

            } catch (error) {
                SpinnerManager.hide();
                LogService.error(`Erreur lors de l'optimisation : ${error && error.message ? error.message : String(error)}`);
                DialogManager.error('Erreur', `Impossible d'optimiser l'emploi du temps : ${error && error.message ? error.message : String(error)}`);
            }
        }, 300);
    }

    /**
     * Construit le résumé des conflits détectés
     * @private
     */
    _buildConflictsSummary(conflictsFound) {
        const totalConflicts = conflictsFound.reduce((sum, c) => sum + c.conflicts.length, 0);

        let conflictsList = '';
        conflictsFound.slice(0, 10).forEach(({ seance, conflicts }) => {
            conflictsList += `
                <li style="margin-bottom: 10px; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <strong>${seance.matiere}</strong> (${seance.type || 'Seance'})
                    <br>
                    <span style="color: #856404; font-size: 0.9em;">
                        ${seance.jour} ${seance.heureDebut}-${seance.heureFin} - Groupe ${seance.groupe}
                    </span>
                    <ul style="margin: 5px 0 0 20px; font-size: 0.85em; color: #721c24;">
                        ${conflicts.map(c => `<li>${c}</li>`).join('')}
                    </ul>
                </li>
            `;
        });

        if (conflictsFound.length > 10) {
            conflictsList += `<li style="text-align: center; color: #6c757d;">...  et ${conflictsFound.length - 10} autres seances</li>`;
        }

        return `
            <div style="font-family: system-ui, -apple-system, sans-serif;">
                <div style="background: #dc3545; color: white; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 2em; font-weight: bold;">${totalConflicts}</div>
                    <div style="font-size: 1.1em;">Conflit(s) detecte(s)</div>
                    <div style="font-size: 0.85em; opacity: 0.9; margin-top: 5px;">
                        ${conflictsFound.length} seance(s) concernee(s)
                    </div>
                </div>

                <h4 style="margin: 20px 0 10px 0; color: #495057;">Details des conflits :</h4>
                <ul style="list-style: none; padding: 0; max-height: 400px; overflow-y: auto;">
                    ${conflictsList}
                </ul>

                <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border-left: 4px solid #17a2b8; margin-top: 20px;">
                    <strong style="color: #0c5460;">Resolution automatique</strong>
                    <p style="margin: 10px 0 0 0; color: #0c5460; font-size: 0.95em;">
                        Le systeme va tenter de resoudre ces conflits en deplacant les seances vers d'autres creneaux disponibles.
                    </p>
                </div>

                <p style="margin-top: 20px; color: #6c757d; text-align: center;">
                    Voulez-vous lancer la resolution automatique ?
                </p>
            </div>
        `;
    }

    /**
     * Résout automatiquement les conflits
     * @private
     */
    _autoResolveConflicts(conflictsFound, seances) {
        SpinnerManager.show();
        NotificationManager.info('Resolution des conflits en cours.. .');

        setTimeout(() => {
            let resolved = 0;
            let failed = 0;

            const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const creneaux = ['08:00-10:00','10:00-12:00','14:00-16:00','16:00-18:00'];

            conflictsFound.forEach(({ seance }) => {
                let conflictResolved = false;

                for (let jour of jours) {
                    for (let creneau of creneaux) {
                        const [debut, fin] = creneau.split('-');

                        const tempSeance = Object.assign({}, seance, { jour: jour, heureDebut: debut, heureFin: fin });

                        const conflicts = ConflictService.checkAllConflicts(
                            tempSeance,
                            seances.filter(s => s.id !== seance.id),
                            [],
                            StateManager.state.sallesInfo
                        ) || [];

                        if (conflicts.length === 0) {
                            seance.jour = jour;
                            seance.heureDebut = debut;
                            seance.heureFin = fin;
                            seance.creneau = creneau;

                            resolved++;
                            conflictResolved = true;

                            LogService.info(`Conflit resolu : ${seance.matiere} deplace vers ${jour} ${creneau}`);
                            break;
                        }
                    }
                    if (conflictResolved) break;
                }

                if (!conflictResolved) {
                    failed++;
                    LogService.warning(`Impossible de resoudre : ${seance.matiere}`);
                }
            });

            SpinnerManager.hide();

            if (resolved > 0) {
                StateManager.saveState();
                TableRenderer.render();
            }

            if (resolved === conflictsFound.length) {
                NotificationManager.success(`Tous les conflits ont ete resolus !  (${resolved})`);
            } else if (resolved > 0) {
                NotificationManager.warning(`${resolved} conflit(s) resolu(s), ${failed} non resolu(s)`);
            } else {
                NotificationManager.error('Impossible de resoudre les conflits automatiquement');
            }

            LogService.info(`Resolution terminee : ${resolved} resolus, ${failed} non resolus`);
        }, 500);
    }

    /**
     * Initialise les handlers pour les options avancées
     */
    initAdvancedOptions() {
        const btnShow = document.getElementById('btnShowOptOptions');
        const btnClose = document.getElementById('btnCloseOptOptions');
        const btnReset = document.getElementById('btnResetOptOptions');
        const panel = document.getElementById('optimizationOptionsPanel');

        if (btnShow && panel) {
            btnShow.addEventListener('click', () => {
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'block';
                btnShow.textContent = isVisible ? '⚙️ Options avancées' : '⚙️ Masquer les options';
            });
        }

        if (btnClose && panel) {
            btnClose.addEventListener('click', () => {
                panel.style.display = 'none';
                if (btnShow) btnShow.textContent = '⚙️ Options avancées';
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this._resetOptimizationOptions();
                NotificationManager.info('Options réinitialisées');
            });
        }

        const optRespectConstraints = document.getElementById('optRespectConstraints');
        const constraintsSummary = document.getElementById('constraintsDetectionSummary');

        if (optRespectConstraints && constraintsSummary) {
            optRespectConstraints.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const souhaits = StateManager.state.enseignantSouhaits || {};
                    let summary = '<strong>Contraintes détectées :</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                    let count = 0;
                    for (const [teacher, wishes] of Object.entries(souhaits)) {
                        if (wishes.contraintes && wishes.contraintes !== 'Aucune remarque.' && wishes.contraintes !== 'Aucune remarque') {
                            const parsed = TeacherConstraintParser.parseConstraints(teacher, wishes.contraintes);
                            const constraintText = wishes.contraintes.length > 50 ? wishes.contraintes.substring(0, 50) + '...' : wishes.contraintes;
                            summary += `<li><strong>${teacher}</strong>: ${constraintText}</li>`;
                            count++;
                        }
                    }
                    summary += '</ul>';
                    if (count > 0) {
                        summary += `<div style="margin-top: 8px; padding: 6px; background: #e7f3ff; border-radius: 4px; font-size: 0.9em;">📊 ${count} enseignant(s) avec contraintes détectées</div>`;
                        document.getElementById('constraintsSummaryContent').innerHTML = summary;
                        constraintsSummary.style.display = 'block';
                    } else {
                        summary = '<em>Aucune contrainte détectée dans les souhaits des enseignants.</em>';
                        document.getElementById('constraintsSummaryContent').innerHTML = summary;
                        constraintsSummary.style.display = 'block';
                    }
                } else {
                    constraintsSummary.style.display = 'none';
                }
            });
        }
    }

    /**
     * Récupère les options d'optimisation depuis l'interface
     * @returns {Object}
     */
    getOptimizationOptions() {
        return {
            removeGaps: document.getElementById('optRemoveGaps')?.checked ?? true,
            balanceLoad: document.getElementById('optBalanceLoad')?.checked ?? true,
            groupSubjects: document.getElementById('optGroupSubjects')?.checked ?? true,
            preferredSlots: document.getElementById('optPreferredSlots')?.checked ?? true,
            loadTolerance: parseFloat(document.getElementById('optLoadTolerance')?.value) || 1.5,
            minBreak: parseInt(document.getElementById('optMinBreak')?.value) || 15,
            maxEndTime: parseInt(document.getElementById('optMaxEndTime')?.value) || 18,
            respectExisting: document.getElementById('optRespectExisting')?.checked ?? true,
            respectConstraints: document.getElementById('optRespectConstraints')?.checked ?? true,

            // Préférences de créneaux
            cmSlot: document.getElementById('optCMSlot')?.value || 'morning',
            tdSlot: document.getElementById('optTDSlot')?.value || 'afternoon',
            tpSlot: document.getElementById('optTPSlot')?.value || 'afternoon',

            // Stratégies avancées
            groupStrategy: document.getElementById('optGroupStrategy')?.value || 'same-day',
            noConcurrentTPPerSubject: document.getElementById('optNoConcurrentTP')?.checked ?? true,
            processByFiliere: document.getElementById('optProcessByFiliere')?.checked ?? false,
            filiereOrder: (document.getElementById('optFiliereOrder')?.value || '').split(',').map(s => s.trim()).filter(Boolean)
        };
    }

    /**
     * Réinitialise les options par défaut
     * @private
     */
    _resetOptimizationOptions() {
        const defaults = {
            optRemoveGaps: true,
            optBalanceLoad: true,
            optGroupSubjects: true,
            optPreferredSlots: true,
            optLoadTolerance: 1.5,
            optMinBreak: 15,
            optMaxEndTime: 18,
            optRespectExisting: true,
            optRespectConstraints: true
        };

        Object.keys(defaults).forEach(key => {
            const el = document.getElementById(key);
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = defaults[key];
                } else {
                    el.value = defaults[key];
                }
            }
        });
    }
}

// Export d'une instance singleton
export default new SchedulingHandlers();