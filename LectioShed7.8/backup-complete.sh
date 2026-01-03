#!/bin/bash
set -e

# Configuration
BACKUP_NAME="LectioShed-Backup-$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_NAME"

echo "📦 SAUVEGARDE COMPLÈTE DE LECTIOSHED"
echo "===================================="
echo "Dossier:  $BACKUP_DIR"
echo ""

# Créer le dossier de backup
mkdir -p "$BACKUP_DIR"

# =====================================
# 1. SAUVEGARDER LES IMAGES DOCKER
# =====================================
echo "1️⃣ SAUVEGARDE DES IMAGES DOCKER"
echo "--------------------------------"

echo "📦 Export de l'image API..."
docker save -o "$BACKUP_DIR/lectioshed-api.tar" lectioshed78-api
SIZE_API=$(du -h "$BACKUP_DIR/lectioshed-api.tar" | cut -f1)
echo "   ✅ lectioshed-api.tar ($SIZE_API)"

echo "📦 Export de MySQL..."
docker save -o "$BACKUP_DIR/mysql.tar" mysql:8.0
SIZE_MYSQL=$(du -h "$BACKUP_DIR/mysql.tar" | cut -f1)
echo "   ✅ mysql.tar ($SIZE_MYSQL)"

echo "📦 Export de Nginx..."
docker save -o "$BACKUP_DIR/nginx.tar" nginx:alpine
SIZE_NGINX=$(du -h "$BACKUP_DIR/nginx.tar" | cut -f1)
echo "   ✅ nginx.tar ($SIZE_NGINX)"

echo "📦 Export de Adminer..."
docker save -o "$BACKUP_DIR/adminer.tar" adminer:latest
SIZE_ADMINER=$(du -h "$BACKUP_DIR/adminer.tar" | cut -f1)
echo "   ✅ adminer. tar ($SIZE_ADMINER)"

echo ""

# =====================================
# 2. SAUVEGARDER LE VOLUME MYSQL
# =====================================
echo "2️⃣ SAUVEGARDE DU VOLUME MYSQL"
echo "-----------------------------"

VOLUME_NAME=$(docker volume ls | grep mysql | awk '{print $2}' | head -1)
if [ -z "$VOLUME_NAME" ]; then
    echo "   ⚠️ Volume MySQL introuvable, tentative avec nom par défaut..."
    VOLUME_NAME="lectioshed78_mysql_data"
fi

echo "   Volume: $VOLUME_NAME"

# Créer un conteneur temporaire pour accéder au volume
docker run --rm \
    -v "$VOLUME_NAME":/data \
    -v "$(pwd)/$BACKUP_DIR":/backup \
    alpine \
    tar czf /backup/mysql-volume.tar.gz -C /data .

SIZE_VOL=$(du -h "$BACKUP_DIR/mysql-volume.tar.gz" | cut -f1)
echo "   ✅ mysql-volume.tar.gz ($SIZE_VOL)"
echo ""

# =====================================
# 3. SAUVEGARDER LA BASE DE DONNÉES (SQL)
# =====================================
echo "3️⃣ DUMP DE LA BASE DE DONNÉES"
echo "------------------------------"

if docker ps | grep -q mysql-edt; then
    docker exec mysql-edt mysqldump -u root -pS@mya2598 \
        --all-databases \
        --routines \
        --triggers \
        --single-transaction \
        > "$BACKUP_DIR/database-dump.sql" 2>/dev/null
    
    SIZE_SQL=$(du -h "$BACKUP_DIR/database-dump.sql" | cut -f1)
    echo "   ✅ database-dump. sql ($SIZE_SQL)"
else
    echo "   ⚠️ MySQL non démarré, skip"
fi
echo ""

# =====================================
# 4. SAUVEGARDER LE CODE SOURCE
# =====================================
echo "4️⃣ SAUVEGARDE DU CODE SOURCE"
echo "----------------------------"

# Créer le dossier source
mkdir -p "$BACKUP_DIR/source"

# Liste EXPLICITE des fichiers et dossiers à sauvegarder
echo "   📂 Copie de docker-compose.yml..."
[ -f "docker-compose.yml" ] && cp docker-compose.yml "$BACKUP_DIR/source/" || echo "   ⚠️ docker-compose.yml introuvable"

echo "   📂 Copie de index.html..."
[ -f "index. html" ] && cp index.html "$BACKUP_DIR/source/" || echo "   ⚠️ index.html introuvable"

echo "   📂 Copie du dossier server/..."
[ -d "server" ] && cp -r server "$BACKUP_DIR/source/" || echo "   ⚠️ Dossier server/ introuvable"

echo "   📂 Copie du dossier src/..."
[ -d "src" ] && cp -r src "$BACKUP_DIR/source/" || echo "   ⚠️ Dossier src/ introuvable"

echo "   📂 Copie du dossier css/..."
[ -d "css" ] && cp -r css "$BACKUP_DIR/source/" 2>/dev/null || echo "   ⚠️ Dossier css/ introuvable (optionnel)"

echo "   📂 Copie du dossier js/..."
[ -d "js" ] && cp -r js "$BACKUP_DIR/source/" 2>/dev/null || echo "   ⚠️ Dossier js/ introuvable (optionnel)"

echo "   📂 Copie du dossier lib/..."
[ -d "lib" ] && cp -r lib "$BACKUP_DIR/source/" 2>/dev/null || echo "   ⚠️ Dossier lib/ introuvable (optionnel)"

echo "   📂 Copie de . env (si présent)..."
[ -f "server/.env" ] && cp server/. env "$BACKUP_DIR/source/server/" 2>/dev/null || echo "   ⚠️ server/.env introuvable (normal si production)"

echo "   ✅ Code source copié"
echo ""

# Afficher ce qui a été copié
echo "   📊 Contenu de la sauvegarde source:"
du -sh "$BACKUP_DIR/source"/* 2>/dev/null | sed 's/^/      /'
echo ""

# =====================================
# 5. CRÉER LE MANIFESTE
# =====================================
echo "5️⃣ CRÉATION DU MANIFESTE"
echo "------------------------"

cat > "$BACKUP_DIR/MANIFEST.txt" << MANIFEST
═══════════════════════════════════════════════
  SAUVEGARDE LECTIOSHED
═══════════════════════════════════════════════

Date de création:  $(date '+%Y-%m-%d %H:%M:%S')
Version: 3.0
Créé par: $(whoami)@$(hostname)

═══════════════════════════════════════════════
  CONTENU
═══════════════════════════════════════════════

IMAGES DOCKER:
  - lectioshed-api. tar     ($SIZE_API)
  - mysql.tar              ($SIZE_MYSQL)
  - nginx.tar              ($SIZE_NGINX)
  - adminer.tar            ($SIZE_ADMINER)

DONNÉES: 
  - mysql-volume.tar.gz    ($SIZE_VOL)
  - database-dump.sql      (${SIZE_SQL:-N/A})

CODE SOURCE:
  - source/docker-compose.yml
  - source/index.html
  - source/server/
  - source/src/
  - source/css/ (si présent)
  - source/js/ (si présent)
  - source/lib/ (si présent)

═══════════════════════════════════════════════
  INFORMATIONS SYSTÈME
═══════════════════════════════════════════════

Docker version: $(docker --version)
Docker Compose version: $(docker-compose --version 2>/dev/null || echo "N/A")
OS: $(uname -s) $(uname -r)

Volume MySQL: $VOLUME_NAME

═══════════════════════════════════════════════
  FICHIERS SAUVEGARDÉS
═══════════════════════════════════════════════

$(ls -lh "$BACKUP_DIR/source" 2>/dev/null || echo "Erreur lors du listage")

═══════════════════════════════════════════════
  CONTENU DE LA BASE
═══════════════════════════════════════════════

$(docker exec mysql-edt mysql -u root -pS@mya2598 -e "
SELECT 
    TABLE_NAME, 
    TABLE_ROWS,
    ROUND(DATA_LENGTH/1024/1024, 2) as 'Size_MB'
FROM information_schema. TABLES 
WHERE TABLE_SCHEMA = 'edt_db';" 2>/dev/null || echo "MySQL non accessible")

═══════════════════════════════════════════════
MANIFEST

echo "   ✅ MANIFEST. txt créé"
echo ""

# =====================================
# 6. CRÉER LE SCRIPT DE RESTAURATION
# =====================================
echo "6️⃣ CRÉATION DU SCRIPT DE RESTAURATION"
echo "--------------------------------------"

cat > "$BACKUP_DIR/RESTORE.sh" << 'RESTORE'
#!/bin/bash
set -e

echo "🔄 RESTAURATION DE LECTIOSHED"
echo "=============================="
echo ""

# Vérifier que Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé !"
    echo "   Installez Docker:  https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose n'est pas installé !"
    echo "   Installez Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker et Docker Compose détectés"
echo ""

# Récupérer le nom du dossier de backup
BACKUP_DIR=$(basename "$(pwd)")

# =====================================
# 1. CHARGER LES IMAGES DOCKER
# =====================================
echo "1️⃣ CHARGEMENT DES IMAGES DOCKER"
echo "--------------------------------"

if [ -f "lectioshed-api.tar" ]; then
    echo "📦 Chargement de l'image API..."
    docker load -i lectioshed-api.tar
    echo "   ✅ API chargée"
else
    echo "   ❌ lectioshed-api.tar introuvable !"
    exit 1
fi

echo "📦 Chargement de MySQL..."
docker load -i mysql.tar
echo "   ✅ MySQL chargé"

echo "📦 Chargement de Nginx..."
docker load -i nginx.tar
echo "   ✅ Nginx chargé"

echo "📦 Chargement de Adminer..."
docker load -i adminer.tar
echo "   ✅ Adminer chargé"

echo ""

# =====================================
# 2. COPIER LE CODE SOURCE
# =====================================
echo "2️⃣ INSTALLATION DU CODE SOURCE"
echo "-------------------------------"

if [ -d "source" ]; then
    echo "📂 Copie des fichiers..."
    
    # Créer la structure
    mkdir -p ../lectioshed-restored
    cp -r source/* ../lectioshed-restored/
    
    cd ../lectioshed-restored
    echo "   ✅ Code installé dans:  $(pwd)"
else
    echo "   ❌ Dossier source/ introuvable !"
    exit 1
fi

echo ""

# =====================================
# 3. RESTAURER LE VOLUME MYSQL
# =====================================
echo "3️⃣ RESTAURATION DU VOLUME MYSQL"
echo "--------------------------------"

# Créer le volume
VOLUME_NAME="lectioshed78_mysql_data"
docker volume create "$VOLUME_NAME"
echo "   ✅ Volume créé:  $VOLUME_NAME"

# Restaurer les données
if [ -f "../$BACKUP_DIR/mysql-volume.tar.gz" ]; then
    echo "📦 Restauration des données MySQL..."
    docker run --rm \
        -v "$VOLUME_NAME":/data \
        -v "$(cd ..  && pwd)/$BACKUP_DIR":/backup \
        alpine \
        tar xzf /backup/mysql-volume.tar.gz -C /data
    echo "   ✅ Données MySQL restaurées"
else
    echo "   ⚠️ mysql-volume.tar.gz introuvable, utilisation du dump SQL..."
fi

echo ""

# =====================================
# 4. DÉMARRER LES CONTENEURS
# =====================================
echo "4️⃣ DÉMARRAGE DES CONTENEURS"
echo "----------------------------"

echo "🚀 Lancement de Docker Compose..."
docker-compose up -d

echo "⏳ Attente du démarrage de MySQL (30s)..."
sleep 30

echo ""

# =====================================
# 5. RESTAURER LE DUMP SQL (si volume échoue)
# =====================================
echo "5️⃣ RESTAURATION DU DUMP SQL"
echo "---------------------------"

if [ -f "../$BACKUP_DIR/database-dump.sql" ]; then
    echo "📊 Import du dump SQL..."
    docker exec -i mysql-edt mysql -u root -pS@mya2598 < "../$BACKUP_DIR/database-dump.sql" 2>/dev/null
    echo "   ✅ Base de données restaurée"
else
    echo "   ⚠️ Dump SQL introuvable"
fi

echo ""

# =====================================
# 6. VÉRIFICATION
# =====================================
echo "6️⃣ VÉRIFICATION"
echo "---------------"

echo "📊 État des conteneurs:"
docker-compose ps

echo ""
echo "🧪 Test de l'API:"
sleep 5
curl -s http://localhost:4000/api/health | jq .  2>/dev/null || curl -s http://localhost:4000/api/health

echo ""
echo ""
echo "✅ RESTAURATION TERMINÉE !"
echo "=========================="
echo ""
echo "🌐 ACCÈS À L'APPLICATION:"
echo "   Frontend:   http://localhost:8080"
echo "   API:        http://localhost:4000"
echo "   Adminer:   http://localhost:8081"
echo ""
echo "🔐 IDENTIFIANTS:"
echo "   Username: admin"
echo "   Password: verysecret"
echo ""
echo "📋 Vérifiez que tout fonctionne:"
echo "   1. Ouvrir http://localhost:8080"
echo "   2. Se connecter (si nécessaire)"
echo "   3. Vérifier que les données sont présentes"
echo ""
RESTORE

chmod +x "$BACKUP_DIR/RESTORE.sh"
echo "   ✅ RESTORE.sh créé"
echo ""

# =====================================
# 7. CRÉER LE README
# =====================================
echo "7️⃣ CRÉATION DU README"
echo "---------------------"

cat > "$BACKUP_DIR/README.md" << 'README'
# 📦 Sauvegarde LectioShed

## 🎯 Contenu

- **Images Docker** : API, MySQL, Nginx, Adminer
- **Volume MySQL** :  Données complètes de la base
- **Dump SQL** : Export des tables (backup supplémentaire)
- **Code source** : Application complète (fichiers essentiels uniquement)

## 🚀 Restauration sur une nouvelle machine

### Prérequis

1. **Docker** (version 20.10+)
2. **Docker Compose** (version 2.0+)

### Installation

```bash
# 1. Extraire l'archive
tar -xzf LectioShed-Backup-XXXXXXXX.tar.gz
cd LectioShed-Backup-XXXXXXXX/

# 2. Exécuter le script de restauration
chmod +x RESTORE.sh
./RESTORE.sh

# 3. Attendre la fin (environ 2-3 minutes)

# 4. Accéder à l'application
open http://localhost:8080
