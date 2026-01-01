/**
 * Contrôleur pour la gestion des salles
 * @author Ibrahim Mrani - UCD
 * @date 2025-11-06
 */

import StateManager from './StateManager.js';
import ConflictService from '../services/ConflictService.js';
import LogService from '../services/LogService.js';
import DialogManager from '../ui/DialogManager.js';
import NotificationManager from '../ui/NotificationManager.js';
import { getSortedCreneauxKeys } from '../utils/helpers.js';

class RoomController {
    /**
     * Obtient toutes les salles avec statistiques
     * @returns {Array} Liste des salles avec stats
     */
    getAllRoomsWithStats() {
        const sallesInfo = (StateManager && StateManager.state && StateManager.state.sallesInfo) ? StateManager.state.sallesInfo : {};
        const salles = Object.keys(sallesInfo);
        const seances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];
        const creneaux = getSortedCreneauxKeys() || [];
        const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

        return salles.map(nom => {
            const type = sallesInfo[nom];
            const salleSeances = seances.filter(s => s && s.salle === nom);

            // Créneaux occupés (uniques)
            const usedSlots = new Set(salleSeances.map(s => `${s.jour}-${s.creneau}`)).size;
            const totalSlots = jours.length * (creneaux.length || 0);
            const occupancyRate = totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0;

            return {
                nom,
                type,
                stats: {
                    totalSeances: salleSeances.length,
                    usedSlots,
                    totalSlots,
                    occupancy: {
                        rate: occupancyRate,
                        label: this.getOccupancyLabel(occupancyRate)
                    }
                }
            };
        }).sort((a, b) => a.nom.localeCompare(b.nom));
    }

    /**
     * Obtient le label d'occupation selon le taux
     * @param {number} rate - Le taux d'occupation (%)
     * @returns {string} Le label
     */
    getOccupancyLabel(rate) {
        if (rate >= 80) return 'Très occupée';
        if (rate >= 60) return 'Bien occupée';
        if (rate >= 40) return 'Moyennement occupée';
        if (rate >= 20) return 'Peu occupée';
        return 'Sous-utilisée';
    }

    /**
     * Obtient le statut des salles pour un créneau spécifique
     * @param {string} jour - Le jour
     * @param {string} creneau - Le créneau
     * @returns {Object} { libres: Array, occupees: Array }
     */
    getRoomsStatusForSlot(jour, creneau) {
        const sallesInfo = (StateManager && StateManager.state && StateManager.state.sallesInfo) ? StateManager.state.sallesInfo : {};
        const salles = Object.keys(sallesInfo);
        const seances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];

        const libres = [];
        const occupees = [];

        salles.forEach(salle => {
            const isOccupied = (ConflictService && typeof ConflictService.isRoomOccupied === 'function')
                ? ConflictService.isRoomOccupied(salle, jour, creneau, seances)
                : false;

            const type = sallesInfo[salle];

            const roomInfo = {
                nom: salle,
                type
            };

            if (isOccupied) {
                // Trouver la séance qui occupe la salle
                const seance = seances.find(s =>
                    s && s.salle === salle &&
                    s.jour === jour &&
                    s.creneau === creneau
                );

                occupees.push({
                    ...roomInfo,
                    seance: seance ? {
                        matiere: seance.matiere,
                        type: seance.type,
                        groupe: seance.groupe,
                        enseignant: Array.isArray(seance.enseignantsArray)
                            ? seance.enseignantsArray.join(', ')
                            : (seance.enseignants || seance.enseignant || 'Non attribué')
                    } : null
                });
            } else {
                libres.push(roomInfo);
            }
        });

        return {
            libres: libres.sort((a, b) => a.nom.localeCompare(b.nom)),
            occupees: occupees.sort((a, b) => a.nom.localeCompare(b.nom))
        };
    }

    /**
     * Obtient la grille complète d'occupation d'une salle
     * @param {string} salle - Le nom de la salle
     * @returns {Object} Grille d'occupation
     */
    getRoomOccupancyGrid(salle) {
        const seances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];
        const creneaux = getSortedCreneauxKeys() || [];
        const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

        const grid = {};

        jours.forEach(jour => {
            grid[jour] = {};
            creneaux.forEach(creneau => {
                const seance = seances.find(s =>
                    s && s.salle === salle &&
                    s.jour === jour &&
                    s.creneau === creneau
                );

                grid[jour][creneau] = seance ? {
                    occupied: true,
                    matiere: seance.matiere,
                    type: seance.type,
                    groupe: seance.groupe,
                    enseignant: Array.isArray(seance.enseignantsArray)
                        ? seance.enseignantsArray.join(', ')
                        : (seance.enseignants || seance.enseignant || 'Non attribué'),
                    seanceId: seance.id
                } : {
                    occupied: false
                };
            });
        });

        return {
            salle,
            type: (StateManager && StateManager.state && StateManager.state.sallesInfo) ? StateManager.state.sallesInfo[salle] : undefined,
            grid,
            jours,
            creneaux
        };
    }

    /**
     * Obtient les salles libres pour un type de séance et un créneau
     * @param {string} jour - Le jour
     * @param {string} creneau - Le créneau
     * @param {string} typeSeance - Le type de séance (Cours, TD, TP)
     * @returns {Array} Les salles libres compatibles
     */
    getAvailableRooms(jour, creneau, typeSeance) {
        if (ConflictService && typeof ConflictService.getFreeRooms === 'function') {
            return ConflictService.getFreeRooms(
                jour,
                creneau,
                typeSeance,
                (StateManager && StateManager.state && StateManager.state.sallesInfo) ? StateManager.state.sallesInfo : {},
                (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : []
            );
        }
        return [];
    }

    /**
     * Supprime une salle
     * @param {string} nom - Le nom de la salle
     */
    removeRoom(nom) {
        const seances = (typeof StateManager.getSeances === 'function') ? StateManager.getSeances() : [];
        const salleSeances = seances.filter(s => s && s.salle === nom);

        if (salleSeances.length > 0) {
            DialogManager.error(
                `Impossible de supprimer la salle <strong>${nom}</strong>.<br><br>` +
                `Elle est utilisée dans ${salleSeances.length} séance(s).<br><br>` +
                `Veuillez d'abord réattribuer ces séances à d'autres salles.`
            );
            return;
        }

        DialogManager.confirm(
            'Supprimer la Salle',
            `Voulez-vous vraiment supprimer la salle <strong>${nom}</strong> ?`,
            async () => {
                try {
                    const sallesInfo = (StateManager && StateManager.state && StateManager.state.sallesInfo) ? StateManager.state.sallesInfo : {};
                    if (sallesInfo && Object.prototype.hasOwnProperty.call(sallesInfo, nom)) {
                        delete StateManager.state.sallesInfo[nom];

                        if (typeof StateManager.saveState === 'function') {
                            const res = StateManager.saveState();
                            if (res && typeof res.then === 'function') {
                                await res;
                            }
                        }

                        LogService.success(`✅ Salle "${nom}" supprimée`);
                        NotificationManager.success('Salle supprimée');

                        if (typeof StateManager.notify === 'function') {
                            StateManager.notify('room:deleted', { nom });
                        }
                    } else {
                        DialogManager.error(`Salle "${nom}" introuvable dans l'état actuel.`);
                    }
                } catch (err) {
                    LogService.error('Erreur lors de la suppression de la salle', err);
                    NotificationManager.error('Erreur lors de la suppression de la salle');
                }
            }
        );
    }

    /**
     * Obtient les statistiques globales des salles
     * @returns {Object} Statistiques
     */
    getGlobalStats() {
        const salles = this.getAllRoomsWithStats();
        const totalSalles = salles.length;

        const parType = {};
        salles.forEach(s => {
            if (!parType[s.type]) {
                parType[s.type] = 0;
            }
            parType[s.type]++;
        });

        const totalSeances = salles.reduce((sum, s) => sum + (s.stats && s.stats.totalSeances ? s.stats.totalSeances : 0), 0);
        const avgOccupancy = totalSalles > 0
            ? Math.round(salles.reduce((sum, s) => sum + ((s.stats && s.stats.occupancy && s.stats.occupancy.rate) ? s.stats.occupancy.rate : 0), 0) / totalSalles)
            : 0;

        const sousUtilisees = salles.filter(s => (s.stats && s.stats.occupancy && s.stats.occupancy.rate < 20)).length;
        const surUtilisees = salles.filter(s => (s.stats && s.stats.occupancy && s.stats.occupancy.rate > 80)).length;

        return {
            totalSalles,
            parType,
            totalSeances,
            avgOccupancy,
            sousUtilisees,
            surUtilisees
        };
    }
    // Ajouter ces helpers dans la classe RoomController
    _schedulePoolSavedNotification(message, delay = 1000) {
        try {
            if (this._poolNotifTimer) clearTimeout(this._poolNotifTimer);
            this._lastPoolMessage = message;
            this._poolNotifTimer = setTimeout(() => {
                try {
                    NotificationManager.success(this._lastPoolMessage || 'Réglages du pool enregistrés');
                } catch (e) {
                    LogService.error('Erreur notification pool', e);
                } finally {
                    this._poolNotifTimer = null;
                    this._lastPoolMessage = null;
                }
            }, delay);
        } catch (e) {
            LogService.error('Erreur schedulePoolSavedNotification', e);
        }
    }

    _cancelPoolSavedNotification() {
        if (this._poolNotifTimer) {
            clearTimeout(this._poolNotifTimer);
            this._poolNotifTimer = null;
            this._lastPoolMessage = null;
        }
    }

    // Remplacer la méthode existante par celle-ci
    async updateSallesParFiliere(filiere, typeSeance, selectElement) {
        if (!filiere || !typeSeance) {
            LogService.warning('updateSallesParFiliere: filiere ou typeSeance manquant');
            return;
        }

        const filKey = String(filiere).trim();
        const typeKey = String(typeSeance).trim();

        const selected = [];

        // Décodage sécurisé d'une valeur potentiellement encodée en URI (ex: Amphi%20N)
        const safeDecode = (s) => {
            if (!s) return s;
            try {
                const fixed = String(s).replace(/\+/g, ' ');
                return decodeURIComponent(fixed);
            } catch (e) {
                return String(s);
            }
        };

        // Normalisations
        const normalizeKeepSpaces = (str) => {
            if (!str) return '';
            return String(str)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\u00A0/g, ' ')
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        };
        const normalizeNoSpace = (s) => normalizeKeepSpaces(s).replace(/\s+/g, '').replace(/[-_]/g, '');

        // Construire liste canonique depuis l'état (salles + sallesInfo keys)
        const buildCanonicalList = () => {
            const list = new Set();
            try {
                const stateSallesArr = (StateManager && StateManager.state && StateManager.state.salles) ? StateManager.state.salles : [];
                if (Array.isArray(stateSallesArr)) {
                    stateSallesArr.forEach(r => {
                        const name = (r && (r.salle || r.name || r.nom)) || '';
                        if (name && String(name).trim()) list.add(String(name).trim());
                    });
                }
                const sallesInfoKeys = (StateManager && StateManager.state && StateManager.state.sallesInfo && typeof StateManager.state.sallesInfo === 'object')
                    ? Object.keys(StateManager.state.sallesInfo)
                    : [];
                sallesInfoKeys.forEach(k => {
                    if (k && String(k).trim()) list.add(String(k).trim());
                });
            } catch (e) {
                LogService.error('buildCanonicalList erreur', e);
            }
            return Array.from(list);
        };

        const canonicalList = buildCanonicalList();

        // maps pour lookup rapide
        const buildMaps = (list) => {
            const mapKeep = new Map();
            const mapNoSpace = new Map();
            list.forEach(name => {
                const k1 = normalizeKeepSpaces(name);
                const k2 = normalizeNoSpace(name);
                if (k1 && !mapKeep.has(k1)) mapKeep.set(k1, name);
                if (k2 && !mapNoSpace.has(k2)) mapNoSpace.set(k2, name);
            });
            return { mapKeep, mapNoSpace };
        };

        const { mapKeep, mapNoSpace } = buildMaps(canonicalList);

        const findBestMatchInState = (label) => {
            if (!label) return label;
            const trimmed = String(label).trim();
            const exact = canonicalList.find(n => n === trimmed);
            if (exact) return exact;

            const n = normalizeKeepSpaces(trimmed);
            const ns = normalizeNoSpace(trimmed);

            if (n && mapKeep.has(n)) return mapKeep.get(n);
            if (ns && mapNoSpace.has(ns)) return mapNoSpace.get(ns);

            const stripped = trimmed.replace(/^\s*amphi[\s:-]*/i, '').trim();
            if (stripped && stripped !== trimmed) {
                const n2 = normalizeKeepSpaces(stripped);
                const ns2 = normalizeNoSpace(stripped);
                if (n2 && mapKeep.has(n2)) return mapKeep.get(n2);
                if (ns2 && mapNoSpace.has(ns2)) return mapNoSpace.get(ns2);
            }

            try {
                for (const name of canonicalList) {
                    const nameN = normalizeKeepSpaces(name);
                    const nameNs = normalizeNoSpace(name);
                    if (n && nameN.includes(n)) return name;
                    if (n && n.includes(nameN)) return name;
                    if (ns && nameNs.includes(ns)) return name;
                    if (ns && ns.includes(nameNs)) return name;
                }
            } catch (e) {
                LogService.error('findBestMatchInState contains check failed', e);
            }

            return trimmed;
        };

        // Extraction des valeurs depuis selectElement / tableau
        try {
            if (selectElement && selectElement.options) {
                const optsArray = Array.from(selectElement.options);

                const anyValue = optsArray.some(o => (o.value || '').toString().trim() !== '');
                if (!anyValue) {
                    optsArray.forEach(opt => {
                        let txt = String(opt.textContent || '').trim();
                        const m = txt.match(/^(.*?)\s*\(.*\)$/);
                        if (m) txt = m[1].trim();
                        txt = txt.replace(/^\s*amphi[\s:-]*/i, '').replace(/\s+/g, ' ').trim();
                        if (txt) opt.value = txt;
                    });
                }

                for (const opt of optsArray) {
                    if (!opt.selected) continue;

                    let raw = (opt.value || '').toString().trim();
                    if (!raw) {
                        raw = (opt.dataset && opt.dataset.salle) ? String(opt.dataset.salle).trim()
                            : (opt.getAttribute && opt.getAttribute('data-salle') ? String(opt.getAttribute('data-salle')).trim() : '');
                    }
                    if (!raw) {
                        raw = String(opt.textContent || '').trim();
                        const m2 = raw.match(/^(.*?)\s*\(.*\)$/);
                        if (m2) raw = m2[1].trim();
                        raw = raw.replace(/^\s*amphi[\s:-]*/i, '').replace(/\s+/g, ' ').trim();
                    }

                    if (raw) {
                        const val = safeDecode(raw).replace(/\s+/g, ' ').trim();
                        const canonical = findBestMatchInState(val);
                        selected.push(canonical);
                    } else {
                        LogService.debug('updateSallesParFiliere: option without value/text skipped', opt);
                    }
                }
            } else if (Array.isArray(selectElement)) {
                for (const v of selectElement) {
                    if (!v) continue;
                    const val = safeDecode(String(v)).trim();
                    selected.push(findBestMatchInState(val));
                }
            } else {
                LogService.debug('updateSallesParFiliere: selectElement non fourni ou non géré');
            }
        } catch (e) {
            LogService.error('updateSallesParFiliere: erreur lors de la lecture du select', e);
        }

        // Clean / dedupe + remove falsy
        const unique = Array.from(new Set(selected.map(s => String(s).trim()).filter(Boolean)));

        // Confirmation utilisateur
        const summary = unique.length > 0
            ? `Pool sélectionné : ${unique.join(', ')}`
            : 'Le pool sera réinitialisé (aucune salle sélectionnée).';
        const confirmMsg = `Confirmer l'enregistrement du pool de salles pour la filière <strong>${filKey}</strong> (${typeKey}) ?<br><br>${summary}`;

        const userConfirmed = await new Promise((resolve) => {
            try {
                DialogManager.confirm(
                    'Confirmer pool de salles',
                    confirmMsg,
                    () => resolve(true),
                    () => resolve(false)
                );
            } catch (err) {
                LogService.error('Dialog confirm failed', err);
                resolve(false);
            }
        });

        if (!userConfirmed) {
            NotificationManager.info('Enregistrement annulé', 2000);
            LogService.info(`Annulation enregistrement pool pour ${filKey} (${typeKey})`);
            return;
        }

        // Persist changes and schedule a single notification (debounced)
        try {
            if (!StateManager.state.autoSallesParFiliere || typeof StateManager.state.autoSallesParFiliere !== 'object') {
                StateManager.state.autoSallesParFiliere = {};
            }
            if (!StateManager.state.autoSallesParFiliere[filKey]) {
                StateManager.state.autoSallesParFiliere[filKey] = {};
            }

            if (unique.length === 0) {
                delete StateManager.state.autoSallesParFiliere[filKey][typeKey];
            } else {
                StateManager.state.autoSallesParFiliere[filKey][typeKey] = unique;
            }

            if (typeof StateManager.saveState === 'function') {
                const res = StateManager.saveState();
                if (res && typeof res.then === 'function') await res;
            }

            const message = unique.length > 0
                ? `Pool de salles auto pour ${filKey} (${typeKey}) réglé sur : [${unique.join(', ')}]`
                : `Pool de salles auto pour ${filKey} (${typeKey}) réinitialisé`;

            LogService.info(`🔧 ${message}`);

            // NE PAS afficher immédiatement : planifier la notification (une seule notification après la dernière sélection)
            this._schedulePoolSavedNotification('Réglages du pool enregistrés');

            try {
                if (typeof StateManager.notify === 'function') {
                    StateManager.notify('autoSallesParFiliere:updated', { filiere: filKey, type: typeKey, salles: unique });
                }
            } catch (e) {
                // noop
            }
        } catch (e) {
            LogService.error('updateSallesParFiliere: échec sauvegarde/applique', e);
            NotificationManager.error('Erreur lors de l\'enregistrement des réglages');
            return;
        }
    }
}

const instance = new RoomController();
export default instance;