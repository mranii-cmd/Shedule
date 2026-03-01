# GestAd - Application de Gestion Administrative

## 📋 Description

GestAd est une application web de gestion administrative permettant de gérer des événements, des documents administratifs et de la législation pour une organisation. Elle fournit une interface intuitive pour centraliser les ressources administratives, gérer les accès via LDAP/Active Directory et assurer la traçabilité des documents.

## 🛠️ Stack Technique

- **Backend** : Node.js >= 18.x + Express
- **Base de données** : MySQL >= 8.0 / MariaDB
- **ORM** : Knex.js
- **Frontend** : HTML/CSS/JavaScript vanilla
- **Temps réel** : Socket.IO
- **Authentification** : JWT + LDAP/AD (optionnel)
- **Conteneurisation** : Docker + Docker Compose

## 📁 Structure du Projet

```
GestAd/
├── src/
│   ├── index.js              # Point d'entrée du serveur
│   ├── database.js           # Connexion MySQL
│   ├── auth/
│   │   └── jwt.js            # Gestion JWT
│   ├── db/
│   │   ├── knex.js           # Instance Knex
│   │   ├── knexfile.js       # Configuration Knex
│   │   ├── runMigrations.js  # Script de migration
│   │   ├── migrations/       # Migrations de base de données
│   │   └── seeds/            # Seeds de données
│   ├── middleware/
│   │   ├── errorHandler.js   # Gestion des erreurs
│   │   └── security.js       # CORS, headers de sécurité
│   ├── routes/
│   │   ├── auth.js           # Routes d'authentification
│   │   ├── documents.js      # Routes de gestion des documents
│   │   ├── events.js         # Routes de gestion des événements
│   │   └── legislation.js    # Routes de législation
│   ├── server/
│   │   └── socket.js         # Gestion Socket.IO
│   └── utils/
│       └── logger.js         # Logger applicatif
├── public/
│   ├── index.html            # Interface utilisateur principale
│   ├── css/                  # Feuilles de style
│   └── static/
│       ├── app.js            # Logique frontend principale
│       └── docs-upload.js    # Gestion des uploads
├── docs/                     # Documentation technique
│   ├── ARCHITECTURE.md       # Vue d'ensemble de l'architecture
│   ├── DEPLOYMENT.md         # Guide de déploiement
│   └── SECURITY.md           # Bonnes pratiques de sécurité
├── test/                     # Tests de santé
├── Dockerfile                # Image Docker
├── docker-compose.yml        # Orchestration des services
├── .env.example              # Template de configuration
└── README.md                 # Ce fichier
```

## 🚀 Installation

### Prérequis

- Node.js >= 18.x
- MySQL >= 8.0 ou MariaDB
- Docker et Docker Compose (recommandé)

### Installation locale

1. **Cloner le repository**

```bash
git clone <repository-url>
cd GestAd
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Configurer l'environnement**

```bash
cp .env.example .env
# Éditer le fichier .env avec vos paramètres
```

4. **Créer la base de données**

```bash
mysql -u root -p
CREATE DATABASE gestad;
```

5. **Exécuter les migrations**

```bash
node src/db/runMigrations.js
```

6. **Lancer l'application**

```bash
npm start
```

L'application sera accessible sur `http://localhost:3001`

### Installation avec Docker (recommandée)

1. **Configurer l'environnement**

```bash
cp .env.example .env
# Éditer le fichier .env avec vos paramètres
```

2. **Lancer avec Docker Compose**

```bash
docker-compose up -d
```

3. **Exécuter les migrations**

```bash
docker-compose exec app node src/db/runMigrations.js
```

## 🔧 Variables d'environnement

Copiez `.env.example` vers `.env` et renseignez les valeurs. Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) pour le détail.

| Variable | Description | Défaut |
|---|---|---|
| `MYSQL_HOST` | Hôte MySQL | `db` |
| `MYSQL_PORT` | Port MySQL | `3306` |
| `MYSQL_USER` | Utilisateur MySQL | `gestad` |
| `MYSQL_PASSWORD` | Mot de passe MySQL | — |
| `MYSQL_DATABASE` | Nom de la base | `gestad` |
| `JWT_SECRET` | Secret JWT (min. 32 chars) | — |
| `JWT_EXPIRES` | Durée de validité JWT | `7d` |
| `PORT` | Port du serveur | `3001` |
| `NODE_ENV` | Environnement | `development` |
| `CORS_ORIGIN` | Origine CORS autorisée | `http://localhost:3001` |
| `LOG_LEVEL` | Niveau de log | `info` |

Variables LDAP/AD optionnelles : voir `.env.example` et [docs/SECURITY.md](docs/SECURITY.md).

## 📖 Fonctionnalités principales

- **Gestion des événements** : Création, modification, suppression et visualisation calendrier
- **Gestion des documents** : Upload, classification par catégories/tags, recherche, téléchargement
- **Gestion de la législation** : Stockage et consultation de textes législatifs
- **Authentification** : JWT local ou LDAP/Active Directory
- **Notifications temps réel** : Via Socket.IO

## 🗂️ Base de données

### Tables principales

- `users` : Utilisateurs du système
- `events` : Événements administratifs
- `documents` : Documents stockés
- `legislation` : Textes législatifs
- `categories` : Catégories de classification
- `tags` : Tags pour l'organisation

## 🧪 Tests

```bash
# Test de santé de l'application
npm test
```

## 📝 Commandes utiles

```bash
# Développement
npm start                                                        # Démarrer le serveur

# Migrations
node src/db/runMigrations.js                                     # Exécuter les migrations
npx knex migrate:make <nom> --knexfile src/db/knexfile.js        # Créer une migration
npx knex migrate:rollback --knexfile src/db/knexfile.js          # Rollback

# Docker
docker-compose up -d          # Démarrer en arrière-plan
docker-compose logs -f app    # Suivre les logs
docker-compose down           # Arrêter les services
```

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md) - Vue d'ensemble de l'architecture
- [Déploiement](docs/DEPLOYMENT.md) - Guide de déploiement complet
- [Sécurité](docs/SECURITY.md) - Bonnes pratiques et configuration sécurisée

## 📄 Licence

Ce projet est sous licence privée.

## 📞 Support

Pour toute question ou problème, veuillez ouvrir une issue sur le repository.
