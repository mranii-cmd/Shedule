#!/bin/bash
# backup-gestad-complete.sh
# Sauvegarde complète du projet GestAd

set -e  # Arrêter en cas d'erreur

echo "=========================================="
echo "📦 Sauvegarde Complète GestAd"
echo "=========================================="
echo ""

# Configuration
PROJECT_DIR="."
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="gestad-backup-${BACKUP_DATE}"
BACKUP_DIR="${BACKUP_NAME}"

# Créer le dossier de sauvegarde
mkdir -p "${BACKUP_DIR}"

# ==========================================
# 1. FICHIERS RACINE
# ==========================================
echo "📄 Copie des fichiers racine..."

cp -v .dockerignore "${BACKUP_DIR}/"
cp -v .env.example "${BACKUP_DIR}/"
cp -v .eslintrc.json "${BACKUP_DIR}/"
cp -v .gitignore "${BACKUP_DIR}/"
cp -v .prettierrc.json "${BACKUP_DIR}/"
cp -v Dockerfile "${BACKUP_DIR}/"
cp -v README.md "${BACKUP_DIR}/"
cp -v docker-compose.yml "${BACKUP_DIR}/"
cp -v package.json "${BACKUP_DIR}/"
cp -v package-lock.json "${BACKUP_DIR}/"

# NE PAS copier .env (contient des secrets)
echo "⚠️  .env ignoré (contient des secrets, utilisez .env.example)"

# ==========================================
# 2. DOSSIERS PRINCIPAUX
# ==========================================
echo "📁 Copie des dossiers principaux..."

# Source code (backend)
echo "  → src/"
cp -r src/ "${BACKUP_DIR}/src/"

# Frontend
echo "  → public/"
cp -r public/ "${BACKUP_DIR}/public/"

# Tests
echo "  → test/"
cp -r test/ "${BACKUP_DIR}/test/"

# Static files
echo "  → static/"
cp -r static/ "${BACKUP_DIR}/static/"

# Archives (si nécessaire)
if [ -d "archive" ] && [ "$(ls -A archive)" ]; then
  echo "  → archive/"
  cp -r archive/ "${BACKUP_DIR}/archive/"
fi

# ==========================================
# 3. UPLOADS (depuis le conteneur Docker)
# ==========================================
echo "📁 Export des uploads depuis le conteneur..."

if docker ps | grep -q gestad-app; then
  docker cp gestad-app:/usr/src/app/uploads "${BACKUP_DIR}/uploads-docker" 2>/dev/null && \
    echo "✅ Uploads exportés depuis le conteneur" || \
    echo "⚠️  Pas de uploads dans le conteneur"
else
  echo "⚠️  Conteneur gestad-app non démarré"
fi

# Uploads locaux (si présents)
if [ -d "uploads" ] && [ "$(ls -A uploads)" ]; then
  echo "  → uploads/ (local)"
  cp -r uploads/ "${BACKUP_DIR}/uploads-local/"
fi

# ==========================================
# 4. BASE DE DONNÉES
# ==========================================
echo "💾 Export de la base de données..."

if docker ps | grep -q gestad-db; then
  docker-compose exec -T db mysqldump -u root -proot_password gestad_db > "${BACKUP_DIR}/gestad-db-${BACKUP_DATE}.sql" 2>/dev/null && \
    echo "✅ Base de données exportée" || \
    echo "⚠️  Erreur export base de données"
else
  echo "⚠️  Conteneur gestad-db non démarré"
fi

# ==========================================
# 5. LOGS (optionnel)
# ==========================================
if [ -d "logs" ] && [ "$(ls -A logs)" ]; then
  echo "📋 Copie des logs..."
  cp -r logs/ "${BACKUP_DIR}/logs/"
fi

# ==========================================
# 6. BACKUPS EXISTANTS (optionnel)
# ==========================================
echo "⚠️  Dossier backups/ ignoré (éviter la récursion)"

# ==========================================
# 7. CRÉER L'INVENTAIRE
# ==========================================
echo "📋 Création de l'inventaire..."

cat > "${BACKUP_DIR}/INVENTORY.txt" << 'EOF'
# Inventaire de la Sauvegarde GestAd
# Date: $(date)

## Structure du Projet
EOF

find "${BACKUP_DIR}" -type f | sed "s|${BACKUP_DIR}/||" | sort >> "${BACKUP_DIR}/INVENTORY.txt"

echo "" >> "${BACKUP_DIR}/INVENTORY.txt"
echo "## Statistiques" >> "${BACKUP_DIR}/INVENTORY.txt"
echo "Nombre de fichiers: $(find ${BACKUP_DIR} -type f | wc -l)" >> "${BACKUP_DIR}/INVENTORY.txt"
echo "Taille totale: $(du -sh ${BACKUP_DIR} | cut -f1)" >> "${BACKUP_DIR}/INVENTORY.txt"

# ==========================================
# 8. INSTRUCTIONS DE RESTAURATION
# ==========================================
echo "📖 Création des instructions..."

cat > "${BACKUP_DIR}/RESTORE_WINDOWS.md" << 'EOF'
# 🪟 Restauration GestAd sur Windows

## Prérequis
- Docker Desktop pour Windows (https://www.docker.com/products/docker-desktop)
- PowerShell ou Git Bash
- 4 GB RAM minimum
- Ports 3001 et 3306 disponibles

## Installation Complète

### Étape 1 : Extraire l'archive
```powershell
# Avec tar natif Windows 10/11
tar -xzf gestad-backup-XXXXXXXX.tar.gz
cd gestad-backup-XXXXXXXX

# OU avec 7-Zip (si installé)
7z x gestad-backup-XXXXXXXX.tar.gz
7z x gestad-backup-XXXXXXXX.tar
cd gestad-backup-XXXXXXXX