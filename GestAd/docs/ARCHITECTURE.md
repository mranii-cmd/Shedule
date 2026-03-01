# Architecture de GestAd

## Vue d'ensemble

GestAd est une application web monolithique Node.js/Express avec une base de données MySQL, déployée via Docker Compose.

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│           (navigateur — HTML/CSS/JS vanilla)            │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────▼────────────────────────────────┐
│                   Serveur Node.js                       │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │
│  │  Express │  │ Socket.IO│  │    Middleware           │ │
│  │  Routes  │  │ (notifs) │  │ (auth, CORS, erreurs)  │ │
│  └────┬─────┘  └──────────┘  └───────────────────────┘ │
│       │                                                 │
│  ┌────▼─────────────────────────────────────────────┐   │
│  │                    Knex.js ORM                   │   │
│  └────────────────────────┬─────────────────────────┘   │
└───────────────────────────│─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                   MySQL / MariaDB                        │
└─────────────────────────────────────────────────────────┘
```

## Composants principaux

### Backend (`src/`)

| Fichier | Rôle |
|---|---|
| `index.js` | Point d'entrée — initialisation du serveur HTTP |
| `database.js` | Connexion directe MySQL (pool) |
| `auth/jwt.js` | Génération et vérification des tokens JWT |
| `db/knexfile.js` | Configuration Knex par environnement |
| `db/migrations/` | Migrations de schéma de base de données |
| `db/seeds/` | Données initiales (dev/test) |
| `middleware/security.js` | CORS, helmet, rate-limiting |
| `middleware/errorHandler.js` | Gestion centralisée des erreurs |
| `routes/auth.js` | Authentification (local + LDAP) |
| `routes/documents.js` | CRUD documents, upload fichiers |
| `routes/events.js` | CRUD événements |
| `routes/legislation.js` | CRUD textes législatifs |
| `server/socket.js` | Notifications temps réel via Socket.IO |
| `utils/logger.js` | Logger Winston |

### Frontend (`public/`)

Le frontend est servi statiquement par Express. Il utilise JavaScript vanilla sans framework.

| Fichier | Rôle |
|---|---|
| `index.html` | Page principale (SPA-like) |
| `static/app.js` | Logique applicative principale |
| `static/docs-upload.js` | Gestion des uploads de documents |
| `css/` | Feuilles de style |

### Infrastructure

```
Docker Compose
├── app          — Conteneur Node.js (port 3001)
└── db           — Conteneur MySQL/MariaDB (port 3306)
```

## Flux d'authentification

```
Client → POST /api/auth/login
       → Vérification credentials (local DB ou LDAP)
       → Génération JWT
       → Retour token au client
Client → Requêtes API avec header Authorization: Bearer <token>
       → Middleware JWT vérifie et décode le token
```

## Modèle de données simplifié

```
users ──────────────────────────────────────────┐
  id, username, password_hash, role, ldap_dn    │
                                                 │
documents ─────────────────────────────────────┐│
  id, title, filename, category_id, tag_ids,   ││
  uploaded_by (→ users.id), created_at         ││
                                                ││
events ─────────────────────────────────────────┤│
  id, title, description, start_at, end_at,    ││
  created_by (→ users.id)                      ││
                                                ││
legislation ─────────────────────────────────── ┘│
  id, title, reference, content, created_by       │
  (→ users.id)                                    │
                                                  │
categories ─────────────────────────────────────  │
  id, name, parent_id                             │
                                                  │
tags ─────────────────────────────────────────── ─┘
  id, name
```

## Décisions d'architecture

- **Pas de framework frontend** : Choix volontaire pour limiter les dépendances
- **Knex.js** : ORM léger qui permet des requêtes SQL explicites tout en gérant les migrations
- **JWT stateless** : Pas de session serveur, simplifie le déploiement multi-instances
- **Socket.IO** : Notifications en temps réel pour les mises à jour de documents/événements
