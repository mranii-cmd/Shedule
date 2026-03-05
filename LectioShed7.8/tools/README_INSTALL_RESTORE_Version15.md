# README — Sauvegarde et restauration du projet (FR)

Ce document explique comment utiliser les scripts fournis pour sauvegarder l'application (code, images Docker, volumes, dumps DB) et comment restaurer cette sauvegarde sur une autre machine.

## Prérequis
- Docker installé et fonctionnel
- docker-compose (ou Docker Compose v2) installé
- Droits pour exécuter docker (ou sudo)
- Scripts fournis :
  - `tools/backup_project.sh`
  - `tools/restore_project.sh`

## 1) Sauvegarder (sur la machine source)

Exemple simple (dans la racine du projet) :
```bash
cd /chemin/vers/votre/projet
./tools/backup_project.sh
```
La sauvegarde sera créée par défaut dans `./backups/backup_<TIMESTAMP>.tar.gz`.

Exemple incluant volumes et dump PostgreSQL :
```bash
./tools/backup_project.sh --out ~/backups --volumes "data uploads" --db-container my_postgres --db-type postgres
```

Que contient l'archive ?
- `project_files.tar.gz` : code du projet (exclut node_modules, .git, backups)
- `docker-compose.yml`, `.env` (si présents)
- `compose.config.yml` (résolution docker-compose)
- `images/*.tar` (images Docker exportées, si présentes)
- `volumes/vol_<name>.tar.gz` (archives de volumes, si demandées)
- `db/` (dumps DB si demandés)

Notes :
- Le script ne tente pas de deviner tout automatiquement pour éviter des actions destructrices.
- Les dumps DB automatiques nécessitent que l'outil de dump soit présent dans le conteneur DB (pg_dumpall, mysqldump, mongodump).

## 2) Transférer l'archive
Transférez le fichier tar.gz vers la machine cible en utilisant scp/rsync ou autre méthode sécurisée :
```bash
scp backups/backup_20260104T140000Z.tar.gz user@target:/tmp/
```

## 3) Restaurer (sur la machine cible)

Exemple de restauration minimale :
```bash
# sur la machine cible
mkdir -p /tmp/project_restore
mv /tmp/backup_20260104T140000Z.tar.gz /tmp/project_restore/
cd /tmp/project_restore
tar -xzf backup_20260104T140000Z.tar.gz
```

Vous pouvez utiliser le script `tools/restore_project.sh` fourni pour automatiser les étapes :

Exemple automatique :
```bash
./tools/restore_project.sh --archive /tmp/backup_20260104T140000Z.tar.gz --target-dir /srv/myproject --keep-images --restore-volumes --db-container my_postgres --db-type postgres
```

Étapes que le script effectue :
1. Décompacte l'archive dans un répertoire temporaire.
2. Extrait `project_files.tar.gz` dans le `--target-dir` (créé si besoin).
3. Copie `docker-compose.yml` et `.env` dans le `--target-dir` si présents.
4. (Optionnel) Charge les images depuis `images/*.tar` dans Docker (`--keep-images`).
5. (Optionnel) Crée et restaure les volumes depuis `volumes/` (`--restore-volumes`).
6. (Optionnel) Copie et restaure le dump DB dans le conteneur spécifié (`--db-container/--db-type`).

Après la restauration, lancez l'application :
```bash
cd /srv/myproject
docker-compose build --pull
docker-compose up -d
docker-compose ps
docker-compose logs -f
```

## Remarques importantes
- Sauvegardes contenant `.env` ou dumps DB contiennent des données sensibles : protégez-les et transférez-les de façon sécurisée.
- `keepalive` (du navigateur) et autres mécanismes d'état applicatif n'affectent pas ces scripts ; ces scripts sauvent l'état persistant côté serveur/volumes/DB.
- Taille : images + volumes + DB peuvent être volumineux. Vérifiez l'espace disque et la bande passante.
- Si votre compose utilise des noms de volumes spécifiques, restaurez les volumes avec ces mêmes noms pour que les services retrouvent leurs données.

## Dépannage rapide
- Une image n'est pas chargée : vérifiez qu'elle était bien exportée (`images/` dans l'archive). Sinon reconstruisez avec `docker-compose build`.
- Une restauration DB échoue : vérifiez les permissions et les variables d'environnement (PGUSER, MYSQL_USER, MYSQL_PWD, etc.). Il est parfois plus simple d'importer le dump manuellement dans le conteneur de base de données.
- Volume non restauré correctement : vérifiez la taille et le contenu de l'archive `vol_<name>.tar.gz` et que le nom de volume cible correspond à celui attendu par docker-compose.

## Options avancées / personnalisations
- Vous pouvez modifier `backup_project.sh` pour filtrer/masquer des fichiers sensibles (.env) ou redacter certaines clés avant l'archivage.
- Pour des sauvegardes planifiées, exécutez le script via cron/systemd timer et transférez le tarball vers un stockage centralisé (S3, serveur de sauvegarde, etc.).

---

Si vous voulez, je peux :
- adapter `restore_project.sh` à votre fichier `docker-compose.yml` (insérer noms de volumes/containers exacts),
- ajouter une option automatique pour chiffrer le tarball (gpg/openssl) avant transfert,
- ou fournir un petit script systemd/cron pour sauvegardes régulières.

Dites-moi ce que vous préférez.