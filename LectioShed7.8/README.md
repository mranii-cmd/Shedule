# Gestion Emploi du Temps — EDT_LV3.1

## Aperçu
Cette application web (SPA) gère la planification des séances (cours, TD, TP) pour des filières universitaires. Le dossier EDT_LV3.1 contient l'interface front-end (index.html), les scripts modulaires (src/js), les styles (src/css/main.css), des bibliothèques tierces (lib/) et des templates Excel pour l'import des souhaits et des matières.

Cette README décrit l'architecture, les dépendances, la manière de lancer l'interface localement, et le format attendu des fichiers Excel.

---

## Architecture

- index.html
  - Point d'entrée de l'application. Contient le markup (onglets, formulaires, tableau EDT) et charge les ressources (lib/, src/js, src/css).
- src/
  - src/js/
    - main.js : orchestrateur principal (initialisation des modules, hooks DOM).
    - Sous-modules (répertoires) : config/, controllers/, handlers/, models/, services/, ui/, utils/ — chaque dossier contient des modules spécialisés (par ex. import/export, gestion planning, UI rendering, validation, etc.).
  - src/css/
    - main.css : styles centralisés (fusion du CSS inline et des règles spécifiques aux composants).
- lib/
  - Bibliothèques tierces nécessaires pour l'import/export et génération de PDF (jszip, xlsx, jspdf, jspdf.plugin.autotable). Ces fichiers sont référencés depuis index.html.
- templates & exemples
  - template_souhaits.xlsx — template Excel pour saisir les souhaits des enseignants.
  - template_matieres.xlsx — template Excel pour définir les matières et volumes.
  - Souhaits-SA-2025-26.xlsx, Souhaits-SA-2025-26SP.xlsx — exemples/exports fournis.

---

## Dépendances (lib/)
Les scripts suivants doivent être présents dans le répertoire lib/ et sont inclus par index.html :
- jszip.min.js (utilisé par xlsx si nécessaire)
- xlsx.full.min.js (lecture/écriture Excel côté client)
- jspdf.umd.min.js (génération PDF)
- jspdf.plugin.autotable.min.js (tableaux PDF)

Vérifier les versions et mettre à jour si nécessaire. Si vous préférez, vous pouvez remplacer les fichiers locaux par des CDN (penser à verrouiller les versions ou ajouter SRI).

---

## Lancer l'interface localement
L'application est front-end statique. Deux méthodes simples :

1) Ouvrir directement
- Ouvrez EDT_LV3.1/index.html dans un navigateur. Certaines fonctionnalités d'import/export (API fichiers) fonctionnent sans serveur, mais l'utilisation de modules ES ou certains appels peuvent nécessiter un serveur HTTP.

2) Servir via un serveur HTTP local (recommandé)
- Avec Python 3 (depuis le dossier EDT_LV3.1) :
  - python -m http.server 8000
  - puis ouvrir http://localhost:8000
- Avec Node.js (http-server) :
  - npx http-server -p 8000

Remarque : si main.js est chargé comme module (type="module"), servir via HTTP est nécessaire.

---

## Utilisation rapide
- Onglet "Planification" : génération automatique des séances, optimisation, filtrage, affichage du tableau EDT.
- Onglet "Configuration" : CRUD pour Séances, Matières, Enseignants, Salles, Filières, Forfaits.
- Onglet "Souhaits" : importer les souhaits des enseignants depuis Excel, visualiser et appliquer les contraintes.
- Onglet "Rapports & Export" : exporter l'EDT en PDF/Excel via les utilitaires intégrés.

Interface : les éléments critiques ont des id explicites (ex. #formAjouterSeance, #edtTable, #btnImportWishesMain) — utiles pour le code modulaire dans src/js.

---

## Format des templates Excel et mapping attendu

Important : le parser côté client attend des colonnes précises. Les templates fournis (template_souhaits.xlsx et template_matieres.xlsx) servent de référence. Voici le mapping attendu (colonnes principales) :

1) template_souhaits.xlsx (Souhaits des enseignants)
- Colonne A: Enseignant — nom complet tel qu'utilisé dans la configuration (string)
- Colonne B: Choix1 — nom de la matière / cours préférentiel (string)
- Colonne C: C1 — nombre de créneaux Cours souhaités pour Choix1 (nombre ou vide)
- Colonne D: TD1 — nombre de TD souhaités pour Choix1
- Colonne E: TP1 — nombre de TP souhaités pour Choix1
- Colonne F: Choix2 — deuxième matière (string)
- Colonne G: C2 — nombre de Cours pour Choix2
- Colonne H: TD2
- Colonne I: TP2
- Colonne J: Choix3
- Colonne K: C3
- Colonne L: TD3
- Colonne M: TP3
- Colonne N: Contraintes — texte libre (ex: "Pas le lundi matin; Pas le mercredi")

Règles :
- Valeur vide pour un nombre signifie flexible (aucune contrainte stricte), 0 signifie refus pour ce type.
- Les noms de matières/enseignants doivent correspondre exactement à ceux présents dans la configuration (sensible à la casse selon la logique du parser). Le code côté client fait une tentative d'assistance (trim) mais recommande des correspondances exactes.

2) template_matieres.xlsx (Définition des matières & volumes)
- Colonne A: NomMatiere — libellé unique de la matière
- Colonne B: Filiere — nom de la filière (ex: "S5 P")
- Colonne C: Departement — (optionnel) nom du département
- Colonne D: SectionsCours — nombre de sections de cours (int)
- Colonne E: TDGroups — nombre de groupes TD
- Colonne F: TPGroups — nombre de groupes TP
- Colonne G: VolumeCoursHTP — volume horaire total (heures) des Cours
- Colonne H: VolumeTDHTP — volume horaire total (heures) des TD
- Colonne I: VolumeTPHTP — volume horaire total (heures) des TP
- Colonne J: NbEnseignantsTP — nombre d'enseignants requis pour TP (si applicable)

Règles :
- Les volumes doivent être des nombres (heures). Les valeurs manquantes ou non numériques seront considérées comme 0 et doivent être validées après import.
- Les champs Filiere/Departement doivent correspondre aux éléments configurés dans l'onglet Filieres/Departements de l'application.

---

## Validation & erreurs courantes
- Vérifier l'absence de fichiers temporaires Office (~$...) dans le dossier; les supprimer et ajouter à .gitignore.
- Lors de l'import : le parser signale les lignes avec colonnes manquantes, types incorrects ou correspondances introuvables (enseignants/matières non trouvés).
- Si un import échoue, consulter la console du navigateur pour détails (main.js fournit des logs et messages utilisateurs dans la zone #edt-notification-area).

---

## Bonnes pratiques pour les développeurs
- Garder les règles globales (reset, body, .btn) en début de main.css et regrouper les styles par composant.
- Charger les bibliothèques non critiques avec defer/async si possible.
- Écrire des modules JS dans src/js/*, et éviter de tout mettre dans main.js (déléguer à controllers/services/ui etc.).
- Ajouter des tests d'intégration pour l'import Excel (fixtures) si vous automatisez la CI.

---

## Contact
Pour questions ou contributions : ouvrir une issue sur le dépôt ou contacter @mranii-cmd.

---

(README créé automatiquement par assistant. )