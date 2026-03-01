# Sécurité — GestAd

## Principes de base

1. **Ne jamais committer de secrets** dans le dépôt Git
2. **Utiliser `.env`** pour toutes les valeurs sensibles (non versionné)
3. **Régénérer les credentials** dès qu'un fichier sensible a été exposé
4. **Principe du moindre privilège** pour les accès base de données et LDAP

## Configuration sécurisée

### Variables d'environnement sensibles

| Variable | Exigences |
|---|---|
| `JWT_SECRET` | Minimum 32 caractères aléatoires, unique par environnement |
| `MYSQL_PASSWORD` | Mot de passe fort, différent entre dev et prod |
| `LDAP_BIND_PASSWORD` | Compte de service dédié avec droits minimaux |

**Générer un JWT_SECRET sécurisé :**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Procédure en cas d'exposition de credentials

Si des credentials ont été commités dans Git (même brièvement) :

1. **Considérer les credentials comme compromis**
2. Changer immédiatement les mots de passe MySQL concernés
3. Régénérer le `JWT_SECRET` (invalide toutes les sessions actives)
4. Changer le mot de passe du compte de service LDAP si exposé
5. Vérifier les logs d'accès pour détecter toute utilisation non autorisée
6. Révoquer et recréer les credentials dans les systèmes concernés

### Base de données

- Utiliser un compte MySQL dédié avec les droits minimaux nécessaires (pas `root`)
- Exemple de création d'un compte restreint :

```sql
CREATE USER 'gestad'@'%' IDENTIFIED BY 'mot_de_passe_fort';
GRANT SELECT, INSERT, UPDATE, DELETE ON gestad.* TO 'gestad'@'%';
FLUSH PRIVILEGES;
```

- En production, restreindre l'accès MySQL au réseau interne Docker uniquement

### LDAP / Active Directory

- Utiliser un compte de service (service account) dédié avec droits en lecture seule
- Activer SSL/TLS (`LDAP_USE_SSL=true`, protocole `ldaps://`)
- Ne jamais utiliser un compte administrateur AD pour les bindings applicatifs

### JWT

- Le `JWT_SECRET` doit être unique par environnement (dev ≠ staging ≠ prod)
- Durée de validité courte en production (ex : `JWT_EXPIRES=1h`)
- En cas de compromission, changer le secret pour invalider tous les tokens

### Headers HTTP de sécurité

Le middleware `src/middleware/security.js` applique les headers de sécurité recommandés via Helmet.js.

En production, vérifier que les headers suivants sont présents :
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HTTPS uniquement)
- `Content-Security-Policy`

### Upload de fichiers

- Valider le type MIME côté serveur
- Limiter la taille des fichiers (`MAX_FILE_SIZE`)
- Stocker les uploads hors du répertoire `public/` pour éviter l'accès direct
- Scanner les fichiers uploadés si possible

## .gitignore — règles importantes

Les patterns suivants doivent toujours être présents dans `.gitignore` :

```gitignore
.env
.env.local
.env.*.local
.envold
uploads/
backups/
```

## Checklist de sécurité avant mise en production

- [ ] `JWT_SECRET` est unique, aléatoire, >= 32 caractères
- [ ] `MYSQL_PASSWORD` est fort et différent des autres environnements
- [ ] `NODE_ENV=production` est défini
- [ ] L'application tourne derrière un reverse proxy (nginx/traefik) avec HTTPS
- [ ] Les ports MySQL/MariaDB ne sont pas exposés publiquement
- [ ] Les logs ne contiennent pas de données sensibles
- [ ] Le dossier `uploads/` n'est pas accessible directement via HTTP
- [ ] Les headers de sécurité HTTP sont actifs
- [ ] Les dépendances npm sont à jour (`npm audit`)
