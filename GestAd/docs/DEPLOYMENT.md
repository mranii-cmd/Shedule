# Déploiement — GestAd

## Prérequis

- Docker >= 20.x
- Docker Compose >= 2.x
- (Optionnel) Node.js >= 18.x pour le développement local

## Déploiement avec Docker Compose (recommandé)

### 1. Préparer l'environnement

```bash
cp .env.example .env
```

Editer `.env` avec les valeurs de production :

```env
MYSQL_HOST=db
MYSQL_PORT=3306
MYSQL_USER=gestad
MYSQL_PASSWORD=<mot_de_passe_fort>
MYSQL_DATABASE=gestad

JWT_SECRET=<secret_aléatoire_min_32_chars>
JWT_EXPIRES=1h

PORT=3001
NODE_ENV=production

CORS_ORIGIN=https://votre-domaine.example.com
```

### 2. Lancer les services

```bash
docker-compose up -d
```

### 3. Exécuter les migrations

```bash
docker-compose exec app node src/db/runMigrations.js
```

### 4. Vérifier le démarrage

```bash
docker-compose logs -f app
curl http://localhost:3001/health
```

## Variables d'environnement — référence complète

| Variable | Obligatoire | Description | Exemple |
|---|---|---|---|
| `MYSQL_HOST` | Oui | Hôte MySQL | `db` |
| `MYSQL_PORT` | Non | Port MySQL | `3306` |
| `MYSQL_USER` | Oui | Utilisateur MySQL | `gestad` |
| `MYSQL_PASSWORD` | Oui | Mot de passe MySQL | `<mot_de_passe>` |
| `MYSQL_DATABASE` | Oui | Base de données | `gestad` |
| `JWT_SECRET` | Oui | Secret JWT (>= 32 chars) | `<aléatoire>` |
| `JWT_EXPIRES` | Non | Durée JWT | `7d` |
| `PORT` | Non | Port du serveur | `3001` |
| `NODE_ENV` | Non | Environnement | `production` |
| `CORS_ORIGIN` | Non | Origine CORS | `https://app.example.com` |
| `LOG_LEVEL` | Non | Niveau de log | `info` |
| `MAX_FILE_SIZE` | Non | Taille max upload (bytes) | `10485760` |
| `UPLOAD_DIR` | Non | Dossier uploads | `./uploads` |
| `DOCUMENTS_STORAGE_PATH` | Non | Stockage documents | `./uploads` |
| `LDAP_URL` | Non | URL LDAP/AD | `ldaps://ad.example.local:636` |
| `LDAP_BIND_DN` | Non* | DN de bind LDAP | `CN=svc,OU=svc,DC=example,DC=local` |
| `LDAP_BIND_PASSWORD` | Non* | Mot de passe LDAP | `<mot_de_passe>` |
| `LDAP_USER_SEARCH_BASE` | Non* | Base de recherche | `OU=Users,DC=example,DC=local` |
| `LDAP_USE_SSL` | Non | Activer SSL LDAP | `true` |
| `LDAP_USERNAME_ATTRIBUTE` | Non | Attribut username | `sAMAccountName` |
| `LDAP_GROUP_ROLE_MAP` | Non | Mapping groupes/rôles | `DOCS_Admins=admin,DOCS_Editors=editor` |

*Obligatoire si LDAP activé

## Déploiement local (développement)

```bash
# Installer les dépendances
npm install

# Configurer l'environnement
cp .env.example .env
# Editer .env

# Démarrer MySQL (via Docker ou local)
docker run -d --name mysql-gestad \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=gestad \
  -e MYSQL_USER=gestad \
  -e MYSQL_PASSWORD=gestaddev \
  -p 3306:3306 mysql:8

# Exécuter les migrations
node src/db/runMigrations.js

# Démarrer le serveur
npm start
```

## Mise à jour

```bash
# Mettre à jour le code
git pull

# Reconstruire l'image Docker
docker-compose build app

# Redémarrer avec les nouvelles migrations
docker-compose up -d
docker-compose exec app node src/db/runMigrations.js
```

## Sauvegarde

### Base de données

```bash
# Exporter
docker-compose exec db mysqldump -u gestad -p gestad > backup-$(date +%Y%m%d).sql

# Restaurer
docker-compose exec -T db mysql -u gestad -p gestad < backup-20260101.sql
```

### Fichiers uploadés

```bash
# Depuis le conteneur
docker cp gestad_app_1:/app/uploads ./uploads-backup-$(date +%Y%m%d)
```

## Santé et monitoring

- **Health check** : `GET /health` — retourne `200 OK` si l'application est opérationnelle
- **Logs** : `docker-compose logs -f app`

## Reverse proxy (production)

En production, l'application doit être placée derrière un reverse proxy (nginx, Traefik) pour :
- Terminer le TLS/HTTPS
- Gérer les headers de sécurité
- Limiter le débit (rate limiting)

Exemple de configuration nginx minimale :

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate /etc/ssl/certs/app.crt;
    ssl_certificate_key /etc/ssl/private/app.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```
