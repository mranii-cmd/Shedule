/**
 * Service d'analyse et de parsing des contraintes des enseignants
 * @author Ibrahim Mrani - UCD
 */

// Constants for scoring bonuses
const SCORE_BONUS_PREFERRED_DAY = 1.2;  // 20% bonus for preferred days
const SCORE_PENALTY_NON_PREFERRED_DAY = 0.9;  // 10% penalty for non-preferred days
const SCORE_BONUS_PREFERRED_TYPE = 1.15;  // 15% bonus for preferred session type
const SCORE_BONUS_PREFERRED_TIME = 1.1;  // 10% bonus for preferred time
const CONSTRAINT_TEXT_PREVIEW_LENGTH = 50;  // Max length for constraint text preview

class TeacherConstraintParser {
    /**
     * Parse les contraintes d'un enseignant depuis le texte libre
     * @param {string} teacherName - Nom de l'enseignant
     * @param {string} constraintsText - Texte des contraintes
     * @returns {Object} Contraintes parsées
     */
    parseConstraints(teacherName, constraintsText) {
        const text = (constraintsText || '').toLowerCase().trim();
        
        // Si pas de contraintes ou texte par défaut
        if (!text || text === 'aucune remarque.' || text === 'aucune remarque') {
            return this._createEmptyConstraints(teacherName, constraintsText);
        }

        const parsed = {
            timePreferences: {
                morning: null,      // null = pas de préférence, true = préféré, false = éviter
                afternoon: null,
                evening: null
            },
            unavailableDays: [],
            preferredDays: [],
            timeSlots: {
                earliest: null,
                latest: null
            },
            sessionTypePreferences: {
                Cours: null,
                TD: null,
                TP: null
            },
            maxHoursPerDay: null,
            other: []
        };

        // Détection des préférences horaires
        this._parseTimePreferences(text, parsed);
        
        // Détection des jours indisponibles
        this._parseUnavailableDays(text, parsed);
        
        // Détection des jours préférés
        this._parsePreferredDays(text, parsed);
        
        // Détection des créneaux horaires spécifiques
        this._parseTimeSlots(text, parsed);
        
        // Détection des préférences de types de séances
        this._parseSessionTypePreferences(text, parsed);
        
        // Détection du maximum d'heures par jour
        this._parseMaxHoursPerDay(text, parsed);

        return {
            teacherName: teacherName,
            rawText: constraintsText,
            parsed: parsed
        };
    }

    /**
     * Crée un objet de contraintes vide
     * @private
     */
    _createEmptyConstraints(teacherName, rawText) {
        return {
            teacherName: teacherName,
            rawText: rawText,
            parsed: {
                timePreferences: { morning: null, afternoon: null, evening: null },
                unavailableDays: [],
                preferredDays: [],
                timeSlots: { earliest: null, latest: null },
                sessionTypePreferences: { Cours: null, TD: null, TP: null },
                maxHoursPerDay: null,
                other: []
            }
        };
    }

    /**
     * Parse les préférences horaires (matin, après-midi, soir)
     * @private
     */
    _parseTimePreferences(text, parsed) {
        // Matin préféré
        const morningKeywords = [
            'matin', 'morning', 'matinée', 'matinee', 'avant midi', 'avant-midi',
            '8h-12h', '8h à 12h', '8h 12h', 'uniquement le matin', 'seulement le matin',
            'disponible le matin', 'disponible matin'
        ];
        
        // Après-midi préféré
        const afternoonKeywords = [
            'après-midi', 'apres-midi', 'afternoon', 'aprem', 'après midi', 'apres midi',
            '14h-18h', '14h à 18h', '14h 18h', 'uniquement après-midi', 'seulement après-midi',
            'disponible après-midi', 'disponible apres-midi'
        ];
        
        // Soir
        const eveningKeywords = [
            'soir', 'evening', 'après 18h', 'apres 18h', 'après 17h', 'apres 17h',
            'fin de journée', 'fin de journee'
        ];

        // Vérifier "uniquement" ou "disponible uniquement"
        const uniquementMatin = morningKeywords.some(kw => 
            text.includes('uniquement ' + kw) || 
            text.includes('seulement ' + kw) ||
            text.includes('disponible uniquement ' + kw)
        );
        
        const uniquementApresMidi = afternoonKeywords.some(kw => 
            text.includes('uniquement ' + kw) || 
            text.includes('seulement ' + kw) ||
            text.includes('disponible uniquement ' + kw)
        );

        if (uniquementMatin || (morningKeywords.some(kw => text.includes(kw)) && !afternoonKeywords.some(kw => text.includes(kw)))) {
            parsed.timePreferences.morning = true;
            if (uniquementMatin) {
                parsed.timePreferences.afternoon = false;
                parsed.timePreferences.evening = false;
            }
        }

        if (uniquementApresMidi || (afternoonKeywords.some(kw => text.includes(kw)) && !morningKeywords.some(kw => text.includes(kw)))) {
            parsed.timePreferences.afternoon = true;
            if (uniquementApresMidi) {
                parsed.timePreferences.morning = false;
                parsed.timePreferences.evening = false;
            }
        }

        if (eveningKeywords.some(kw => text.includes(kw))) {
            parsed.timePreferences.evening = true;
        }

        // Détection de "pas après-midi", "pas le matin", etc.
        if (text.includes('pas après-midi') || text.includes('pas apres-midi') || text.includes('pas l\'après-midi')) {
            parsed.timePreferences.afternoon = false;
        }
        if (text.includes('pas le matin') || text.includes('pas matin')) {
            parsed.timePreferences.morning = false;
        }
        if (text.includes('pas le soir') || text.includes('pas soir')) {
            parsed.timePreferences.evening = false;
        }
    }

    /**
     * Parse les jours indisponibles
     * @private
     */
    _parseUnavailableDays(text, parsed) {
        const jours = [
            { fr: 'lundi', en: 'monday', display: 'Lundi' },
            { fr: 'mardi', en: 'tuesday', display: 'Mardi' },
            { fr: 'mercredi', en: 'wednesday', display: 'Mercredi' },
            { fr: 'jeudi', en: 'thursday', display: 'Jeudi' },
            { fr: 'vendredi', en: 'friday', display: 'Vendredi' },
            { fr: 'samedi', en: 'saturday', display: 'Samedi' }
        ];

        const unavailablePatterns = [
            'pas le ', 'pas ', 'not ', 'indisponible ', 'unavailable ',
            'pas disponible le ', 'pas disponible '
        ];

        jours.forEach(jour => {
            const patterns = [
                ...unavailablePatterns.map(p => p + jour.fr),
                ...unavailablePatterns.map(p => p + jour.en)
            ];
            
            if (patterns.some(pattern => text.includes(pattern))) {
                if (!parsed.unavailableDays.includes(jour.display)) {
                    parsed.unavailableDays.push(jour.display);
                }
            }
        });
    }

    /**
     * Parse les jours préférés
     * @private
     */
    _parsePreferredDays(text, parsed) {
        const jours = [
            { fr: 'lundi', en: 'monday', display: 'Lundi' },
            { fr: 'mardi', en: 'tuesday', display: 'Mardi' },
            { fr: 'mercredi', en: 'wednesday', display: 'Mercredi' },
            { fr: 'jeudi', en: 'thursday', display: 'Jeudi' },
            { fr: 'vendredi', en: 'friday', display: 'Vendredi' },
            { fr: 'samedi', en: 'saturday', display: 'Samedi' }
        ];

        const preferredPatterns = [
            'de préférence le ', 'de preference le ', 'plutôt ', 'plutot ',
            'prefer ', 'préfère le ', 'prefere le '
        ];

        // Détection de "uniquement lundi et mardi" ou "lundi et mardi uniquement"
        // Updated regex to properly handle multiple days
        const uniquementPattern = /uniquement\s+([a-zéèêà]+)(?:\s+et\s+([a-zéèêà]+))*|([a-zéèêà]+)(?:\s+et\s+([a-zéèêà]+))*\s+uniquement/gi;
        const matches = [...text.matchAll(uniquementPattern)];
        
        if (matches.length > 0) {
            // Extract all days mentioned in the constraint
            const mentionedDayNames = new Set();
            matches.forEach(match => {
                // Get all captured groups and extract day names
                for (let i = 1; i < match.length; i++) {
                    if (match[i]) {
                        const words = match[i].toLowerCase().split(/\s+et\s+/);
                        words.forEach(word => {
                            const cleanWord = word.trim();
                            if (cleanWord && cleanWord !== 'uniquement') {
                                mentionedDayNames.add(cleanWord);
                            }
                        });
                    }
                }
            });
            
            jours.forEach(jour => {
                if (mentionedDayNames.has(jour.fr) || mentionedDayNames.has(jour.en)) {
                    if (!parsed.preferredDays.includes(jour.display)) {
                        parsed.preferredDays.push(jour.display);
                    }
                } else {
                    // Les autres jours sont indisponibles
                    if (!parsed.unavailableDays.includes(jour.display)) {
                        parsed.unavailableDays.push(jour.display);
                    }
                }
            });
        } else {
            // Recherche de préférences simples
            jours.forEach(jour => {
                const patterns = [
                    ...preferredPatterns.map(p => p + jour.fr),
                    ...preferredPatterns.map(p => p + jour.en)
                ];
                
                if (patterns.some(pattern => text.includes(pattern))) {
                    if (!parsed.preferredDays.includes(jour.display)) {
                        parsed.preferredDays.push(jour.display);
                    }
                }
            });
        }
    }

    /**
     * Parse les créneaux horaires spécifiques
     * @private
     */
    _parseTimeSlots(text, parsed) {
        // Patterns pour "avant Xh", "après Xh", "pas après Xh"
        const beforePattern = /avant\s+(\d{1,2})h/i;
        const afterPattern = /après\s+(\d{1,2})h|apres\s+(\d{1,2})h/i;
        const notAfterPattern = /pas\s+après\s+(\d{1,2})h|pas\s+apres\s+(\d{1,2})h/i;
        
        // Avant Xh
        const beforeMatch = text.match(beforePattern);
        if (beforeMatch) {
            const hour = parseInt(beforeMatch[1]);
            parsed.timeSlots.latest = this._formatHour(hour);
        }
        
        // Pas après Xh (prioritaire sur "après")
        const notAfterMatch = text.match(notAfterPattern);
        if (notAfterMatch) {
            const hour = parseInt(notAfterMatch[1] || notAfterMatch[2]);
            parsed.timeSlots.latest = this._formatHour(hour);
        }
        
        // Après Xh (si pas de "pas après")
        if (!notAfterMatch) {
            const afterMatch = text.match(afterPattern);
            if (afterMatch) {
                const hour = parseInt(afterMatch[1] || afterMatch[2]);
                parsed.timeSlots.earliest = this._formatHour(hour);
            }
        }

        // Pattern pour plages horaires "Xh-Yh"
        const rangePattern = /(\d{1,2})h\s*[-à]\s*(\d{1,2})h/g;
        const rangeMatches = [...text.matchAll(rangePattern)];
        
        if (rangeMatches.length > 0) {
            const firstRange = rangeMatches[0];
            const startHour = parseInt(firstRange[1]);
            const endHour = parseInt(firstRange[2]);
            
            parsed.timeSlots.earliest = this._formatHour(startHour);
            parsed.timeSlots.latest = this._formatHour(endHour);
        }
    }

    /**
     * Formate une heure en format HH:00
     * @private
     */
    _formatHour(hour) {
        return hour.toString().padStart(2, '0') + ':00';
    }

    /**
     * Parse les préférences de types de séances
     * @private
     */
    _parseSessionTypePreferences(text, parsed) {
        // Patterns pour "pas de TP", "no TP", etc.
        const noTPPatterns = ['pas de tp', 'no tp', 'pas tp'];
        const noTDPatterns = ['pas de td', 'no td', 'pas td'];
        const noCoursPatterns = ['pas de cours', 'no lecture', 'pas cours', 'no cm'];
        
        // Patterns pour "uniquement cours", "only lectures", etc.
        const onlyCoursPatterns = ['uniquement cours', 'seulement cours', 'only lecture', 'only cm'];
        const onlyTDPatterns = ['uniquement td', 'seulement td', 'only td'];
        const onlyTPPatterns = ['uniquement tp', 'seulement tp', 'only tp'];
        
        // Patterns pour "préfère TD", "prefer TD", etc.
        const preferTDPatterns = ['préfère td', 'prefere td', 'prefer td', 'plutôt td', 'plutot td'];
        const preferTPPatterns = ['préfère tp', 'prefere tp', 'prefer tp', 'plutôt tp', 'plutot tp'];
        const preferCoursPatterns = ['préfère cours', 'prefere cours', 'prefer lecture', 'plutôt cours', 'plutot cours'];

        // Détection des refus
        if (noTPPatterns.some(p => text.includes(p))) {
            parsed.sessionTypePreferences.TP = -1;
        }
        if (noTDPatterns.some(p => text.includes(p))) {
            parsed.sessionTypePreferences.TD = -1;
        }
        if (noCoursPatterns.some(p => text.includes(p))) {
            parsed.sessionTypePreferences.Cours = -1;
        }

        // Détection des "uniquement"
        if (onlyCoursPatterns.some(p => text.includes(p))) {
            parsed.sessionTypePreferences.Cours = 1;
            parsed.sessionTypePreferences.TD = -1;
            parsed.sessionTypePreferences.TP = -1;
        }
        if (onlyTDPatterns.some(p => text.includes(p))) {
            parsed.sessionTypePreferences.TD = 1;
            parsed.sessionTypePreferences.Cours = -1;
            parsed.sessionTypePreferences.TP = -1;
        }
        if (onlyTPPatterns.some(p => text.includes(p))) {
            parsed.sessionTypePreferences.TP = 1;
            parsed.sessionTypePreferences.Cours = -1;
            parsed.sessionTypePreferences.TD = -1;
        }

        // Détection des préférences (sans exclure les autres)
        if (preferTDPatterns.some(p => text.includes(p)) && parsed.sessionTypePreferences.TD !== -1) {
            parsed.sessionTypePreferences.TD = 1;
        }
        if (preferTPPatterns.some(p => text.includes(p)) && parsed.sessionTypePreferences.TP !== -1) {
            parsed.sessionTypePreferences.TP = 1;
        }
        if (preferCoursPatterns.some(p => text.includes(p)) && parsed.sessionTypePreferences.Cours !== -1) {
            parsed.sessionTypePreferences.Cours = 1;
        }
    }

    /**
     * Parse le maximum d'heures par jour
     * @private
     */
    _parseMaxHoursPerDay(text, parsed) {
        const maxHoursPattern = /maximum\s+(\d+)\s*h(?:eures?)?\s+par\s+jour|max\s+(\d+)\s*h(?:eures?)?\s+(?:par\s+jour|\/\s*jour)/i;
        const match = text.match(maxHoursPattern);
        
        if (match) {
            const hours = parseInt(match[1] || match[2]);
            parsed.maxHoursPerDay = hours;
        }
    }

    /**
     * Vérifie si une séance respecte les contraintes d'un enseignant
     * @param {Object} parsedConstraints - Contraintes parsées
     * @param {Object} session - La séance ({ jour, heureDebut, heureFin, type, creneau })
     * @returns {Object} { valid: boolean, violations: Array<string> }
     */
    validateSession(parsedConstraints, session) {
        const violations = [];
        const parsed = parsedConstraints.parsed;

        if (!parsed) {
            return { valid: true, violations: [] };
        }

        // Vérifier les jours indisponibles
        if (parsed.unavailableDays.includes(session.jour)) {
            violations.push(`Jour indisponible: ${session.jour}`);
        }

        // Vérifier les préférences de type de séance (refus strict)
        if (parsed.sessionTypePreferences[session.type] === -1) {
            violations.push(`Refuse les séances de type: ${session.type}`);
        }

        // Vérifier les créneaux horaires
        if (session.heureDebut && session.heureFin) {
            const startMinutes = this._timeToMinutes(session.heureDebut);
            const endMinutes = this._timeToMinutes(session.heureFin);

            if (parsed.timeSlots.earliest) {
                const earliestMinutes = this._timeToMinutes(parsed.timeSlots.earliest);
                if (startMinutes < earliestMinutes) {
                    violations.push(`Créneau trop tôt (avant ${parsed.timeSlots.earliest})`);
                }
            }

            if (parsed.timeSlots.latest) {
                const latestMinutes = this._timeToMinutes(parsed.timeSlots.latest);
                if (endMinutes > latestMinutes) {
                    violations.push(`Créneau trop tard (après ${parsed.timeSlots.latest})`);
                }
            }

            // Vérifier les préférences horaires strictes
            const sessionHour = parseInt(session.heureDebut.split(':')[0]);
            
            if (parsed.timePreferences.morning === false && sessionHour < 12) {
                violations.push('Évite les créneaux du matin');
            }
            if (parsed.timePreferences.afternoon === false && sessionHour >= 14 && sessionHour < 18) {
                violations.push('Évite les créneaux de l\'après-midi');
            }
            if (parsed.timePreferences.evening === false && sessionHour >= 18) {
                violations.push('Évite les créneaux du soir');
            }
        }

        return {
            valid: violations.length === 0,
            violations: violations
        };
    }

    /**
     * Calcule un score de compatibilité entre 0 et 1
     * @param {Object} parsedConstraints - Contraintes parsées
     * @param {Object} session - La séance
     * @returns {number} Score de 0 (incompatible) à 1 (parfait)
     */
    calculateCompatibilityScore(parsedConstraints, session) {
        const validation = this.validateSession(parsedConstraints, session);
        
        // Si violations strictes, score = 0
        if (!validation.valid) {
            return 0;
        }

        const parsed = parsedConstraints.parsed;
        let score = 1.0;

        // Bonus pour jours préférés
        if (parsed.preferredDays.length > 0) {
            if (parsed.preferredDays.includes(session.jour)) {
                score *= SCORE_BONUS_PREFERRED_DAY;
            } else {
                score *= SCORE_PENALTY_NON_PREFERRED_DAY;
            }
        }

        // Bonus pour type de séance préféré
        if (parsed.sessionTypePreferences[session.type] === 1) {
            score *= SCORE_BONUS_PREFERRED_TYPE;
        }

        // Bonus pour préférences horaires
        if (session.heureDebut) {
            const sessionHour = parseInt(session.heureDebut.split(':')[0]);
            
            if (parsed.timePreferences.morning === true && sessionHour < 12) {
                score *= SCORE_BONUS_PREFERRED_TIME;
            }
            if (parsed.timePreferences.afternoon === true && sessionHour >= 14 && sessionHour < 18) {
                score *= SCORE_BONUS_PREFERRED_TIME;
            }
        }

        // Limiter le score à 1.0
        return Math.min(score, 1.0);
    }

    /**
     * Convertit une heure en minutes
     * @private
     */
    _timeToMinutes(time) {
        if (!time) return 0;
        const parts = time.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
    }
}

// Export singleton
export default new TeacherConstraintParser();
