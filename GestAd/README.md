# GestAd - Application de Gestion Administrative

## 📋 Description
GestAd est une application web de gestion administrative permettant de gérer des événements, des documents administratifs et de la législation.

## 🛠️ Stack Technique
- **Backend** : Node.js + Express
- **Base de données** : MySQL
- **ORM** : Knex.js
- **Frontend** : HTML/CSS/JavaScript vanilla
- **Conteneurisation** : Docker

## 📁 Structure du Projet
```
GestAd/
├── src/
│   ├── index.js              # Point d'entrée du serveur
│   ├── db/
│   │   ├── knex.js           # Instance Knex
│   │   ├── knexfile.js       # Configuration Knex
│   │   ├── runMigrations.js  # Script de migration
│   │   ├── migrations/       # Migrations de base de données
│   │   └── seeds/            # Seeds de données
│   └── routes/
│       ├── auth.js           # Routes d'authentification
│       ├── documents.js      # Routes de gestion des documents
│       └── events.js         # Routes de gestion des événements
├── public/
│   ├── index.html            # Interface utilisateur principale
│   └── static/
│       ├── app.js            # Logique frontend principale
│       └── docs-upload.js    # Gestion des uploads
├── archive/                  # Fichiers archivés
├── Dockerfile                # Configuration Docker
└── README.md                 # Ce fichier
```

## 🚀 Installation

### Prérequis
- Node.js >= 18.x
- MySQL >= 8.0
- Docker (optionnel)

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

L'application sera accessible sur `http://localhost:3000`

### Installation avec Docker

1. **Lancer avec Docker Compose**
```bash
docker-compose up -d
```

2. **Exécuter les migrations**
```bash
docker-compose exec app node src/db/runMigrations.js
```

## 📖 Utilisation

### Fonctionnalités principales

#### Gestion des événements
- Création, modification et suppression d'événements
- Visualisation du calendrier
- Notifications et rappels

#### Gestion des documents
- Upload de documents administratifs
- Classification par catégories et tags
- Recherche full-text
- Téléchargement et prévisualisation

#### Gestion de la législation
- Stockage de textes législatifs
- Recherche et consultation
- Liens vers documents officiels

## 🔧 Configuration

### Variables d'environnement

```env
# Base de données
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=gestad

# Serveur
PORT=3000
NODE_ENV=development

# Session
SESSION_SECRET=your_secret_key
```

## 🗂️ Structure de la base de données

### Tables principales
- `users` : Utilisateurs du système
- `events` : Événements administratifs
- `documents` : Documents stockés
- `legislation` : Textes législatifs
- `categories` : Catégories de classification
- `tags` : Tags pour l'organisation

## 🧪 Tests

```bash
npm test
```

## 📝 Migrations

### Créer une nouvelle migration
```bash
npx knex migrate:make nom_de_la_migration --knexfile src/db/knexfile.js
```

### Exécuter les migrations
```bash
node src/db/runMigrations.js
```

### Rollback
```bash
npx knex migrate:rollback --knexfile src/db/knexfile.js
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence privée.

## 👥 Auteurs

- Équipe de développement GestAd

## 📞 Support

Pour toute question ou problème, veuillez ouvrir une issue sur le repository.
