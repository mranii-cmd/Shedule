restore_project.sh#!/usr/bin/env bash
# tools/restore_project.sh
# Restaure l'archive produite par backup_project.sh sur une machine cible.
#
# Usage:
#   ./tools/restore_project.sh --archive /path/to/backup_YYYY...tar.gz --target-dir /srv/myproject [--keep-images] [--restore-volumes] [--db-container name] [--db-type postgres|mysql|mongo]
#
# Exemples:
#   ./tools/restore_project.sh --archive ~/backups/backup_20260104T140000Z.tar.gz --target-dir /srv/myproject --keep-images --restore-volumes --db-container my_postgres --db-type postgres
set -euo pipefail

ARCHIVE=""
TARGET_DIR="/srv/myproject"
KEEP_IMAGES=false
RESTORE_VOLUMES=false
DB_CONTAINER=""
DB_TYPE=""

usage() {
  cat <<EOF
Usage: $0 --archive /path/to/backup.tar.gz --target-dir /path/to/restore [--keep-images] [--restore-volumes] [--db-container name] [--db-type postgres|mysql|mongo]
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift 2;;
    --target-dir) TARGET_DIR="$2"; shift 2;;
    --keep-images) KEEP_IMAGES=true; shift 1;;
    --restore-volumes) RESTORE_VOLUMES=true; shift 1;;
    --db-container) DB_CONTAINER="$2"; shift 2;;
    --db-type) DB_TYPE="$2"; shift 2;;
    --help|-h) usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
  echo "Archive manquante ou invalide: ${ARCHIVE}"
  usage
fi

TMPDIR="$(mktemp -d -t project-restore-XXXX)"
echo "Extracting archive to ${TMPDIR}..."
tar -xzf "${ARCHIVE}" -C "${TMPDIR}"

cd "${TMPDIR}" || exit 1

# 1) Restore project files
if [[ -f project_files.tar.gz ]]; then
  echo "Restoring project files to ${TARGET_DIR}..."
  mkdir -p "${TARGET_DIR}"
  tar -xzf project_files.tar.gz -C "${TARGET_DIR}"
else
  echo "project_files.tar.gz missing in archive"
fi

# 2) Copy docker-compose.yml and .env if present
if [[ -f docker-compose.yml ]]; then
  echo "Copying docker-compose.yml to ${TARGET_DIR}"
  cp docker-compose.yml "${TARGET_DIR}/docker-compose.yml"
fi
if [[ -f .env ]]; then
  echo "Copying .env to ${TARGET_DIR}"
  cp .env "${TARGET_DIR}/.env"
fi

# 3) Load images
if [[ "${KEEP_IMAGES}" == "true" && -d images ]]; then
  echo "Loading docker images..."
  for f in images/*.tar; do
    [[ -f "${f}" ]] || continue
    echo " - loading ${f}..."
    docker load -i "${f}"
  done
fi

# 4) Restore volumes
if [[ "${RESTORE_VOLUMES}" == "true" && -d volumes ]]; then
  echo "Restoring Docker volumes..."
  for f in volumes/*.tar.gz; do
    [[ -f "${f}" ]] || continue
    base="$(basename "${f}")"
    # derive volume name from filename vol_<name>.tar.gz
    name="$(echo "${base}" | sed -n 's/^vol_\(.*\)\.tar\.gz$/\1/p')"
    if [[ -z "${name}" ]]; then
      echo " - skip unknown volume file ${base}"
      continue
    fi
    echo " - creating volume ${name} and extracting ${base}"
    docker volume create "${name}" || true
    docker run --rm -v "${name}":/data -v "$(pwd)":/backup alpine \
      sh -c "tar xzf /backup/vol_${name}.tar.gz -C /data" || echo "   warning: failed to extract ${base} into ${name}"
  done
fi

# 5) Restore DB (if requested)
if [[ -n "${DB_CONTAINER}" && -n "${DB_TYPE}" && -d db ]]; then
  echo "Restoring DB type=${DB_TYPE} into container ${DB_CONTAINER}..."
  case "${DB_TYPE}" in
    postgres)
      if [[ -f db/pg_dumpall.sql ]]; then
        echo "Copying pg_dumpall.sql into ${DB_CONTAINER}..."
        docker cp db/pg_dumpall.sql "${DB_CONTAINER}:/tmp/pg_dumpall.sql"
        echo "Restoring..."
        docker exec -it "${DB_CONTAINER}" psql -U "${PGUSER:-postgres}" -f /tmp/pg_dumpall.sql || echo "psql restore reported errors"
      else
        echo "No pg_dumpall.sql found in backup"
      fi
      ;;
    mysql|mariadb)
      if [[ -f db/mysqldump.sql ]]; then
        docker cp db/mysqldump.sql "${DB_CONTAINER}:/tmp/mysqldump.sql"
        docker exec -i "${DB_CONTAINER}" sh -c 'mysql -u"${MYSQL_USER:-root}" -p"${MYSQL_PWD:-}" < /tmp/mysqldump.sql' || echo "mysql restore reported errors"
      else
        echo "No mysqldump.sql found"
      fi
      ;;
    mongo)
      if [[ -f db/mongo_archive.gz ]]; then
        docker cp db/mongo_archive.gz "${DB_CONTAINER}:/tmp/mongo_archive.gz"
        docker exec -it "${DB_CONTAINER}" mongorestore --archive=/tmp/mongo_archive.gz --gzip || echo "mongorestore reported errors"
      else
        echo "No mongo_archive.gz found"
      fi
      ;;
    *)
      echo "Unsupported DB_TYPE: ${DB_TYPE}"
      ;;
  esac
fi

echo "Restore complete. Target project dir: ${TARGET_DIR}"
echo "You may now: cd ${TARGET_DIR} && docker-compose build --pull && docker-compose up -d"
rm -rf "${TMPDIR}"
exit 0