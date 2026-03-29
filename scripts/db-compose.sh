#!/usr/bin/env bash
# Use Docker Compose v2 ("docker compose") when available, else v1 ("docker-compose").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  elif [ -x /opt/homebrew/bin/docker-compose ]; then
    /opt/homebrew/bin/docker-compose "$@"
  elif [ -x /usr/local/bin/docker-compose ]; then
    /usr/local/bin/docker-compose "$@"
  else
    echo "Docker Compose not found." >&2
    echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop/" >&2
    echo "or run: brew install docker-compose   (and ensure Docker Engine is running, e.g. Docker Desktop or Colima)" >&2
    exit 1
  fi
}

cmd="${1:-}"
shift || true

case "$cmd" in
  up)
    run_compose up -d mongodb
    ;;
  down)
    run_compose down
    ;;
  setup)
    run_compose up -d mongodb
    until run_compose exec -T mongodb mongosh --quiet --eval "db.runCommand({ ping: 1 }).ok" >/dev/null 2>&1; do
      echo "Waiting for MongoDB..."
      sleep 1
    done
    export DATABASE_URL="${DATABASE_URL:-mongodb://localhost:27017/jobcopilot}"
    npm run prisma:migrate
    ;;
  *)
    echo "usage: $0 {up|down|setup}" >&2
    exit 1
    ;;
esac
