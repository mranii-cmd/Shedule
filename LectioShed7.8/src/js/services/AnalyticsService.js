/**
 * Service d'analyse et calcul de statistiques pour le dashboard
 * @author Ibrahim Mrani - UCD
 */

import StateManager from '../controllers/StateManager.js';
import VolumeService from './VolumeService.js';
import { LISTE_JOURS } from '../config/constants.js';
import { getSortedCreneauxKeys } from '../utils/helpers.js';

class AnalyticsService {
    /**
     * Calcule les KPIs globaux
     * @returns {Object} Les KPIs
     */
    calculateGlobalKPIs() {
        const seances = StateManager.getSeances();
        const enseignants = StateManager.state.enseignants;
        const salles = Object.keys(StateManager.state.sallesInfo);
        
        // Séances totales
        const totalSeances = seances.length;
        
        // Séances avec enseignant
        const seancesWithTeacher = seances.filter(s => s.hasTeacher()).length;
        const teacherAssignmentRate = totalSeances > 0 
            ? Math.round((seancesWithTeacher / totalSeances) * 100) 
            : 0;
        
        // Séances avec salle
        const seancesWithRoom = seances.filter(s => s.hasRoom()).length;
        const roomAssignmentRate = totalSeances > 0 
            ? Math.round((seancesWithRoom / totalSeances) * 100) 
            : 0;
        
        // Enseignants actifs
        const activeTeachers = new Set();
        seances.forEach(s => {
            if (s.enseignantsArray && s.enseignantsArray.length > 0) {
                s.enseignantsArray.forEach(ens => activeTeachers.add(ens));
            }
        });
        
        // Salles utilisées
        const usedRooms = new Set();
        seances.forEach(s => {
            if (s.salle) usedRooms.add(s.salle);
        });
        
        // Taux d'occupation global (créneaux utilisés / créneaux disponibles)
        const creneaux = getSortedCreneauxKeys();
        const totalSlots = LISTE_JOURS.length * creneaux.length;
        const usedSlots = new Set(seances.map(s => `${s.jour}-${s.creneau}`)).size;
        const globalOccupancyRate = Math.round((usedSlots / totalSlots) * 100);
        
        return {
            totalSeances,
            teacherAssignmentRate,
            roomAssignmentRate,
            activeTeachers: activeTeachers.size,
            totalTeachers: enseignants.length,
            usedRooms: usedRooms.size,
            totalRooms: salles.length,
            globalOccupancyRate
        };
    }

    /**
     * Calcule la charge de travail par enseignant
     * @returns {Array} Données pour graphique
     */
    calculateTeachersWorkload() {
        const seances = StateManager.getSeances();
        const enseignants = StateManager.state.enseignants;
        const volumesSupplementaires = StateManager.state.enseignantVolumesSupplementaires;
        const forfaits = StateManager.state.forfaits || [];
        
        const volumes = VolumeService.calculateAllVolumes(
            enseignants,
            seances,
            volumesSupplementaires,
            StateManager.state.header.session,
            StateManager.state.volumesAutomne
        );
        
        const data = enseignants.map(nom => {
            const volume = volumes[nom] || 0;
            
            // Déterminer la couleur selon le seuil
            let color;
            let status;
            if (volume < 250) {
                color = '#28a745'; // Vert
                status = 'normal';
            } else if (volume < 280) {
                color = '#ffc107'; // Orange
                status = 'elevated';
            } else {
                color = '#dc3545'; // Rouge
                status = 'overload';
            }
            
            return {
                nom,
                volume,
                color,
                status
            };
        });
        
        // Trier par volume décroissant
        return data.sort((a, b) => b.volume - a.volume);
    }

    /**
     * Calcule la distribution des séances par type
     * @returns {Object} Données pour camembert
     */
    calculateSessionsDistribution() {
        const seances = StateManager.getSeances();
        
        const cours = seances.filter(s => s.type === 'Cours').length;
        const td = seances.filter(s => s.type === 'TD').length;
        const tp = seances.filter(s => s.type === 'TP' && s.hTP_Affecte > 0).length;
        
        return {
            labels: ['Cours', 'TD', 'TP'],
            data: [cours, td, tp],
            colors: ['#dc3545', '#28a745', '#007bff'],
            total: cours + td + tp
        };
    }

    /**
     * Calcule la heatmap d'occupation des créneaux
     * @returns {Object} Données pour heatmap
     */
    calculateTimeSlotsHeatmap() {
        const seances = StateManager.getSeances();
        const creneaux = getSortedCreneauxKeys();
        const heatmapData = {};
        
        // Initialiser la structure
        LISTE_JOURS.forEach(jour => {
            heatmapData[jour] = {};
            creneaux.forEach(creneau => {
                heatmapData[jour][creneau] = {
                    count: 0,
                    level: 'empty',
                    color: '#e9ecef'
                };
            });
        });
        
        // Compter les séances par créneau
        seances.forEach(s => {
            if (heatmapData[s.jour] && heatmapData[s.jour][s.creneau]) {
                heatmapData[s.jour][s.creneau].count++;
            }
        });
        
        // Déterminer les niveaux et couleurs
        Object.values(heatmapData).forEach(jourData => {
            Object.values(jourData).forEach(cell => {
                if (cell.count === 0) {
                    cell.level = 'empty';
                    cell.color = '#e9ecef';
                } else if (cell.count <= 2) {
                    cell.level = 'low';
                    cell.color = '#d1ecf1';
                } else if (cell.count <= 4) {
                    cell.level = 'medium';
                    cell.color = '#fff3cd';
                } else {
                    cell.level = 'high';
                    cell.color = '#f8d7da';
                }
            });
        });
        
        return {
            jours: LISTE_JOURS,
            creneaux,
            data: heatmapData
        };
    }

    /**
     * Calcule le taux d'occupation des salles
     * @returns {Array} Données pour graphique
     */
    calculateRoomsOccupancy() {
        const seances = StateManager.getSeances();
        const salles = Object.keys(StateManager.state.sallesInfo);
        const creneaux = getSortedCreneauxKeys();
        const totalSlots = LISTE_JOURS.length * creneaux.length;
        
        const data = salles.map(salle => {
            const salleSeances = seances.filter(s => s.salle === salle);
            const usedSlots = new Set(salleSeances.map(s => `${s.jour}-${s.creneau}`)).size;
            const occupancyRate = Math.round((usedSlots / totalSlots) * 100);
            
            // Couleur selon l'occupation
            let color;
            if (occupancyRate < 50) {
                color = '#28a745'; // Vert (sous-utilisée)
            } else if (occupancyRate < 80) {
                color = '#ffc107'; // Orange (bien utilisée)
            } else {
                color = '#dc3545'; // Rouge (très utilisée)
            }
            
            return {
                salle,
                occupancyRate,
                totalSeances: salleSeances.length,
                color
            };
        });
        
        return data.sort((a, b) => b.occupancyRate - a.occupancyRate);
    }

    /**
     * Calcule la timeline hebdomadaire (séances par jour)
     * @returns {Object} Données pour graphique ligne
     */
    calculateWeeklyTimeline() {
        const seances = StateManager.getSeances();
        
        const data = LISTE_JOURS.map(jour => {
            return seances.filter(s => s.jour === jour).length;
        });
        
        return {
            labels: LISTE_JOURS,
            data,
            total: data.reduce((sum, val) => sum + val, 0),
            average: Math.round(data.reduce((sum, val) => sum + val, 0) / LISTE_JOURS.length)
        };
    }

    /**
     * Détecte les anomalies et génère des alertes
     * @returns {Array} Liste des alertes
     */
    detectAnomalies() {
        const alerts = [];
        const seances = StateManager.getSeances();
        const enseignants = StateManager.state.enseignants;
        const salles = Object.keys(StateManager.state.sallesInfo);
        
        // 1. Enseignants en surcharge
        const workload = this.calculateTeachersWorkload();
        const overloadedTeachers = workload.filter(t => t.status === 'overload');
        if (overloadedTeachers.length > 0) {
            alerts.push({
                type: 'danger',
                icon: '⚠️',
                title: 'Enseignants en surcharge',
                message: `${overloadedTeachers.length} enseignant(s) dépasse(nt) 280h : ${overloadedTeachers.map(t => t.nom).join(', ')}`,
                action: 'Redistribuer les séances'
            });
        }
        
        // 2. Enseignants en sous-charge
        const underloadedTeachers = workload.filter(t => t.volume < 100 && t.volume > 0);
        if (underloadedTeachers.length > 0) {
            alerts.push({
                type: 'warning',
                icon: '📉',
                title: 'Enseignants en sous-charge',
                message: `${underloadedTeachers.length} enseignant(s) a/ont moins de 100h : ${underloadedTeachers.slice(0, 3).map(t => t.nom).join(', ')}`,
                action: 'Attribuer plus de séances'
            });
        }
        
        // 3. Salles sous-utilisées
        const roomsOccupancy = this.calculateRoomsOccupancy();
        const underusedRooms = roomsOccupancy.filter(r => r.occupancyRate < 20);
        if (underusedRooms.length > 0) {
            alerts.push({
                type: 'info',
                icon: '🏛️',
                title: 'Salles sous-utilisées',
                message: `${underusedRooms.length} salle(s) occupée(s) à moins de 20% : ${underusedRooms.slice(0, 3).map(r => r.salle).join(', ')}`,
                action: 'Optimiser l\'attribution des salles'
            });
        }
        
        // 4. Séances sans enseignant
        const seancesSansEns = seances.filter(s => !s.hasTeacher()).length;
        if (seancesSansEns > 0) {
            alerts.push({
                type: 'danger',
                icon: '❌',
                title: 'Séances non attribuées',
                message: `${seancesSansEns} séance(s) n'ont pas d'enseignant attribué`,
                action: 'Attribuer des enseignants'
            });
        }
        
        // 5. Séances sans salle (hors TP)
        const seancesSansSalle = seances.filter(s => !s.hasRoom() && s.type !== 'TP').length;
        if (seancesSansSalle > 0) {
            alerts.push({
                type: 'warning',
                icon: '🚪',
                title: 'Séances sans salle',
                message: `${seancesSansSalle} séance(s) (hors TP) n'ont pas de salle attribuée`,
                action: 'Attribuer des salles'
            });
        }
        
        // 6. Jours déséquilibrés
        const timeline = this.calculateWeeklyTimeline();
        const maxDay = Math.max(...timeline.data);
        const minDay = Math.min(...timeline.data);
        if (maxDay - minDay > 10) {
            alerts.push({
                type: 'info',
                icon: '📊',
                title: 'Déséquilibre hebdomadaire',
                message: `Écart de ${maxDay - minDay} séances entre le jour le plus et le moins chargé`,
                action: 'Rééquilibrer la semaine'
            });
        }
        
        return alerts;
    }

           /**
     * Calcule les statistiques par matière
     * @returns {Array} Stats par matière
     */
    calculateSubjectStats() {
        const seances = StateManager.getSeances();
        const matieres = Object.keys(StateManager.state.matiereGroupes || {});

        // helper : normaliser la liste d'enseignants d'une séance en tableau de noms
        const normalizeTeachers = (s) => {
            let arr = [];
            if (Array.isArray(s.enseignantsArray) && s.enseignantsArray.length) {
                arr = s.enseignantsArray.slice();
            } else if (Array.isArray(s.enseignants) && s.enseignants.length) {
                arr = s.enseignants.slice();
            } else if (s.enseignant) {
                if (typeof s.enseignant === 'string') {
                    // split sur séparateurs courants ; protège contre "A / B" ou "A, B"
                    arr = s.enseignant.split(/[,;\/]+/).map(x => x && String(x).trim()).filter(Boolean);
                } else if (typeof s.enseignant === 'object') {
                    const name = s.enseignant.nom || s.enseignant.name || String(s.enseignant);
                    if (name) arr = [String(name).trim()];
                } else {
                    arr = [String(s.enseignant)];
                }
            }
            arr = arr.map(t => {
                if (!t) return '';
                if (typeof t === 'object') return String(t.nom || t.name || JSON.stringify(t));
                return String(t);
            }).map(x => x.trim()).filter(Boolean);
            return arr;
        };

        return matieres.map(nom => {
            const matiereSeances = seances.filter(s => s.matiere === nom);
            const config = StateManager.state.matiereGroupes[nom] || {};

            const cours = matiereSeances.filter(s => s.type === 'Cours').length;
            const td = matiereSeances.filter(s => s.type === 'TD').length;
            const tpSessions = matiereSeances.filter(s => s.type === 'TP');
            const tp = tpSessions.length;

            const expectedCours = config.sections_cours || 0;
            const expectedTD = (config.sections_cours || 0) * (config.td_groups || 0);

            const sections = Number(config.sections_cours || 0);
            const tpGroups = Number(config.tp_groups || 0);
            const nbEnsTP = Number(config.nbEnseignantsTP == null ? 1 : config.nbEnseignantsTP);
            const numberGroups = Math.max(0, sections * tpGroups);
            const expectedTPPosts = numberGroups * (nbEnsTP || 1);

            // map groupe logique -> max enseignants observés pour ce groupe
            const groupAssignedMap = new Map();
            tpSessions.forEach(s => {
                const rawKey = s.uniqueStudentEntity || s.groupe || s.section || `${s.jour || ''}_${s.creneau || ''}`;
                const groupKey = String(rawKey || '').trim() || `__session_${s.id || Math.random()}`;

                const teachers = normalizeTeachers(s);
                const assigned = teachers.length;
                const prev = groupAssignedMap.get(groupKey) || 0;
                if (assigned > prev) groupAssignedMap.set(groupKey, assigned);
            });

            // postes effectivement couverts = somme(min(nbEnsTP, observedPerGroup))
            let assignedTPPosts = 0;
            groupAssignedMap.forEach(val => {
                assignedTPPosts += Math.min(nbEnsTP || 1, Number(val || 0));
            });

            const completionCours = expectedCours > 0 ? Math.round((cours / expectedCours) * 100) : 100;
            const completionTD = expectedTD > 0 ? Math.round((td / expectedTD) * 100) : 100;
            const completionTP = expectedTPPosts > 0 ? Math.round((assignedTPPosts / expectedTPPosts) * 100) : 100;

            const globalCompletion = Math.round(
                (completionCours + completionTD + completionTP) / 3
            );

            return {
                nom,
                filiere: config.filiere,
                departement: config.departement,
                totalSeances: matiereSeances.length,
                cours,
                td,
                tp,
                expectedTPPosts,
                assignedTPPosts,
                missingTP: Math.max(0, (expectedTPPosts || 0) - (assignedTPPosts || 0)),
                completion: globalCompletion
            };
        });
    }
}

// Export d'une instance singleton
export default new AnalyticsService();