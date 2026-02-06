#!/usr/bin/env bash
# Usage:
#   Edit APP_SERVICE below or run:
#     APP_SERVICE=myapp ./deploy.sh
#
# What it does:
#  - docker compose down --remove-orphans
#  - docker compose build --no-cache <APP_SERVICE>
#  - docker compose up -d --no-deps --force-recreate <APP_SERVICE>
#  - try to run knex migrations inside the app container (if npx available)
#  - tail logs for the app service
set -euo pipefail

# Default application service name (change if your service is named differently)
APP_SERVICE="${APP_SERVICE:-app}"

# Detect docker compose command (prefer "docker compose", fallback to "docker-compose")
DC=""
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is available in PATH."
  exit 1
fi

echo "Using compose command: $DC"
echo "Application service: $APP_SERVICE"
echo

echo "1) Stopping and removing containers (no volumes)..."
eval "$DC down --remove-orphans"

echo
echo "2) Building service '$APP_SERVICE' without cache..."
eval "$DC build --no-cache $APP_SERVICE"

echo
echo "3) Starting service '$APP_SERVICE' (no deps, force recreate)..."
eval "$DC up -d --no-deps --force-recreate $APP_SERVICE"

# Give the container a few seconds to start before running migrations
echo
echo "Waiting for the service to initialize..."
sleep 3

# Try to run migrations if npx is available inside container; ignore if not present
echo "4) Attempting to run Knex migrations inside the container (if available)..."
set +e
# Check if container is running
CONTAINER_ID=$(eval "$DC ps -q $APP_SERVICE")
if [ -n "$CONTAINER_ID" ]; then
  # Check if npx exists inside
  eval "$DC exec $APP_SERVICE sh -c 'command -v npx >/dev/null 2>&1'"
  if [ $? -eq 0 ]; then
    echo "Running: npx knex migrate:latest --knexfile ./db/knexfile.js"
    eval "$DC exec $APP_SERVICE sh -c 'npx knex migrate:latest --knexfile ./db/knexfile.js' || echo \"Migrations returned non-zero exit code (continuing)\""
  else
    echo "npx not found inside $APP_SERVICE - skipping migrations."
  fi
else
  echo "Container for $APP_SERVICE not found/running - skipping migrations."
fi
set -e

echo
echo "5) Tailing logs for service '$APP_SERVICE' (Ctrl+C to exit)..."
eval "$DC logs -f $APP_SERVICE"