# Tests GestAd

Suite de tests complète pour l'application GestAd, utilisant Jest avec Babel pour le support ES6.

## Structure

```
test/
├── setup.js                          # Configuration globale (mocks localStorage, fetch, console)
├── helpers.js                        # Fonctions utilitaires de test
├── README.md                         # Ce fichier
├── unit/
│   ├── middleware/
│   │   ├── rateLimiter.test.js       # Tests des rate limiters Express
│   │   ├── validation.test.js        # Tests de validation Joi
│   │   └── errorHandler.test.js      # Tests de gestion des erreurs
│   └── frontend/
│       ├── EventBus.test.js          # Tests du système d'événements
│       └── StorageService.test.js    # Tests du service de stockage
└── integration/
    └── auth.test.js                  # Tests d'intégration des routes auth
```

## Prérequis

Node.js ≥ 18.x et npm.

## Installation

```bash
cd GestAd
npm install
```

## Commandes

### Lancer tous les tests
```bash
npm test
```

### Mode watch (relance à chaque modification)
```bash
npm run test:watch
```

### Avec couverture de code
```bash
npm run test:coverage
```

### Tests unitaires uniquement
```bash
npm run test:unit
```

### Tests d'intégration uniquement
```bash
npm run test:integration
```

### Mode CI (sans couleurs, avec couverture)
```bash
npm run test:ci
```

## Seuils de couverture

| Métrique   | Seuil |
|------------|-------|
| Branches   | 70%   |
| Functions  | 75%   |
| Lines      | 80%   |
| Statements | 80%   |

## Helpers disponibles (`test/helpers.js`)

### `createMockRequest(overrides?)`
Crée un objet `req` Express simulé.

```js
import { createMockRequest } from '../helpers.js';
const req = createMockRequest({ body: { username: 'test' } });
```

### `createMockResponse()`
Crée un objet `res` Express simulé avec toutes les méthodes mockées.

```js
import { createMockResponse } from '../helpers.js';
const res = createMockResponse();
// res.status, res.json, res.send, etc. sont des jest.fn()
```

### `createMockNext()`
Crée une fonction `next` Express simulée.

```js
import { createMockNext } from '../helpers.js';
const next = createMockNext();
```

### `createTestUser(overrides?)`
Crée un utilisateur de test.

```js
import { createTestUser } from '../helpers.js';
const user = createTestUser({ role: 'admin' });
```

### `createTestEvent(overrides?)`
Crée un événement de test.

```js
import { createTestEvent } from '../helpers.js';
const event = createTestEvent({ title: 'Mon événement' });
```

## Mocks globaux (`test/setup.js`)

Le fichier `setup.js` configure automatiquement avant chaque test :

- **`localStorage`** : mock complet (getItem, setItem, removeItem, clear)
- **`fetch`** : mock qui retourne une réponse vide 200 OK
- **`console.log/error/warn`** : supprimés pour réduire le bruit

Les mocks sont réinitialisés avant chaque test via `beforeEach`.

## Écrire un nouveau test

### Test unitaire de middleware

```js
import { myMiddleware } from '../../../src/middleware/myMiddleware.js';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers.js';

describe('myMiddleware', () => {
  it('should call next() on success', () => {
    const req = createMockRequest({ body: { field: 'value' } });
    const res = createMockResponse();
    const next = createMockNext();

    myMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
```

### Test d'intégration avec supertest

```js
import express from 'express';
import request from 'supertest';
import myRouter from '../../../src/routes/myRoute.js';

const app = express();
app.use(express.json());
app.use('/api/my', myRouter);

describe('GET /api/my', () => {
  it('should return 200', async () => {
    const res = await request(app).get('/api/my');
    expect(res.status).toBe(200);
  });
});
```

## Configuration Jest

La configuration Jest se trouve dans `jest.config.js` :

- **Transform** : babel-jest avec @babel/preset-env (cible Node actuel)
- **Environnement** : node
- **Timeout** : 10 secondes par test
- **Setup** : `test/setup.js` chargé après l'environnement Jest

## Dépendances de développement

| Package            | Usage                              |
|--------------------|------------------------------------|
| `jest`             | Framework de test                  |
| `babel-jest`       | Transformateur Babel pour Jest     |
| `@babel/core`      | Compilateur Babel                  |
| `@babel/preset-env`| Preset Babel pour ES6+             |
| `@jest/globals`    | Types globaux Jest                 |
| `supertest`        | Tests HTTP pour Express            |
