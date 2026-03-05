#!/usr/bin/env bash
# tools/backup_project.sh
# Crée une archive complète du projet (code, docker-compose, images, volumes optionnels, dumps DB optionnels)
#
# Usage:
#   ./tools/backup_project.sh [--project-dir DIR] [--out DIR] [--volumes "vol1 vol2"] [--db-container name] [--db-type postgres|mysql|mongo]
#
# Exemples:
#   ./tools/backup_project.sh
#   ./tools/backup_project.sh --project-dir /srv/myproject --out ~/backups --volumes "data uploads" --db-container my_postgres --db-type postgres
#
set -euo pipefail

# Defaults
PROJECT_DIR="$(pwd)"
OUT_DIR="${PROJECT_DIR}/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d -t project-backup-XXXX)"
IMAGES_DIR="${WORK_DIR}/images"
VOLS_DIR="${WORK_DIR}/volumes"
DB_DIR="${WORK_DIR}/db"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"

DB_CONTAINER=""
DB_TYPE=""
VOLUMES=""

usage() {
  cat <<EOF
Usage: $0 [--project-dir DIR] [--out DIR] [--volumes "vol1 vol2"] [--db-container name] [--db-type postgres|mysql|mongo]
Creates: ${OUT_DIR}/backup_${TIMESTAMP}.tar.gz
EOF
  exit 1
}

# parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2;;
    --out) OUT_DIR="$2"; shift 2;;
    --volumes) VOLUMES="$2"; shift 2;;
    --db-container) DB_CONTAINER="$2"; shift 2;;
    --db-type) DB_TYPE="$2"; shift 2;;
    --help|-h) usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

mkdir -p "${OUT_DIR}" "${IMAGES_DIR}" "${VOLS_DIR}" "${DB_DIR}"

echo "Backup started: ${TIMESTAMP}"
echo "Project dir: ${PROJECT_DIR}"
echo "Output dir: ${OUT_DIR}"
echo "Work dir: ${WORK_DIR}"

# 1) Archive project files (exclude heavy / local things)
echo "Archiving project files..."
tar --exclude='./node_modules' \
    --exclude='./backups' \
    --exclude='./dist' \
    --exclude='./.git' \
    -C "${PROJECT_DIR}" -czf "${WORK_DIR}/project_files.tar.gz" .

# 2) Copy compose/env and resolved config
echo "Saving compose and env files..."
if [[ -f "${COMPOSE_FILE}" ]]; then
  cp "${COMPOSE_FILE}" "${WORK_DIR}/docker-compose.yml"
  if [[ -f "${PROJECT_DIR}/.env" ]]; then
    cp "${PROJECT_DIR}/.env" "${WORK_DIR}/.env"
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "${COMPOSE_FILE}" config > "${WORK_DIR}/compose.config.yml" 2>/dev/null || true
  fi
fi

# 3) Export images referenced in compose.config.yml (best-effort)
if [[ -f "${WORK_DIR}/compose.config.yml" && -n "$(command -v docker)" ]]; then
  echo "Exporting images referenced by compose (best-effort)..."
  IMAGES="$(awk '/image:/{print $2}' "${WORK_DIR}/compose.config.yml" | sort -u || true)"
  if [[ -n "${IMAGES}" ]]; then
    echo "${IMAGES}" | while read -r img; do
      [[ -z "${img}" ]] && continue
      safe_name="$(echo "${img}" | sed 's/[:\/]/_/g')"
      echo " - saving image ${img} -> images/${safe_name}.tar"
      if ! docker save -o "${IMAGES_DIR}/${safe_name}.tar" "${img}" 2>/dev/null; then
        echo "   warning: docker save failed for ${img} (image may not exist locally)."
      fi
    done
  fi
fi

# 4) Export user-specified volumes
if [[ -n "${VOLUMES}" ]]; then
  echo "Archiving volumes: ${VOLUMES}"
  for vol in ${VOLUMES}; do
    echo " - archiving volume ${vol}..."
    # use alpine to read the volume contents and create a tar.gz in WORK_DIR
    docker run --rm -v "${vol}":/data -v "${WORK_DIR}":/backup alpine \
      sh -c "tar czf /backup/vol_${vol}.tar.gz -C /data . || true"
    if [[ -f "${WORK_DIR}/vol_${vol}.tar.gz" ]]; then
      mv "${WORK_DIR}/vol_${vol}.tar.gz" "${VOLS_DIR}/"
    else
      echo "   warning: failed to archive volume ${vol}"
    fi
  done
fi

# 5) DB dump (optional)
if [[ -n "${DB_CONTAINER}" && -n "${DB_TYPE}" ]]; then
  echo "Attempting DB dump for container=${DB_CONTAINER} type=${DB_TYPE}..."
  case "${DB_TYPE}" in
    postgres)
      if docker exec "${DB_CONTAINER}" sh -c "command -v pg_dumpall" >/dev/null 2>&1; then
        docker exec "${DB_CONTAINER}" sh -c "pg_dumpall -c -U \${PGUSER:-postgres}" > "${DB_DIR}/pg_dumpall.sql" 2>/dev/null || echo "postgres dump failed"
      else
        echo "pg_dumpall not present in container ${DB_CONTAINER}"
      fi
      ;;
    mysql|mariadb)
      if docker exec "${DB_CONTAINER}" sh -c "command -v mysqldump" >/dev/null 2>&1; then
        docker exec "${DB_CONTAINER}" sh -c "mysqldump --all-databases -u\${MYSQL_USER:-root} \${MYSQL_PWD:+-p}\${MYSQL_PWD}" > "${DB_DIR}/mysqldump.sql" 2>/dev/null || echo "mysqldump failed"
      else
        echo "mysqldump not present in container ${DB_CONTAINER}"
      fi
      ;;
    mongo)
      if docker exec "${DB_CONTAINER}" sh -c "command -v mongodump" >/dev/null 2>&1; then
        docker exec "${DB_CONTAINER}" sh -c "mongodump --archive=/dump/archive.gz --gzip" >/dev/null 2>&1 || true
        docker cp "${DB_CONTAINER}:/dump/archive.gz" "${DB_DIR}/mongo_archive.gz" 2>/dev/null || true
      else
        echo "mongodump not present in container ${DB_CONTAINER}"
      fi
      ;;
    *)
      echo "Unsupported DB_TYPE: ${DB_TYPE}"
      ;;
  esac
fi

# 6) Build final tarball
OUT_TARBALL="${OUT_DIR}/backup_${TIMESTAMP}.tar.gz"
echo "Creating final backup tarball: ${OUT_TARBALL}"
tar -C "${WORK_DIR}" -czf "${OUT_TARBALL}" . || true

# 7) Clean
rm -rf "${WORK_DIR}"
echo "Backup complete: ${OUT_TARBALL}"
exit 0