#!/usr/bin/env bash
#
# Demarre l'API compilee et verifie qu'elle repond.
#
#   bash apps/api/scripts/smoke.sh
#
# Pourquoi sur le build et non sur les sources : Vitest passe par Vite, qui
# resout les paquets de l'atelier vers leurs sources TypeScript. Le binaire de
# production, lui, fait un require() sur la sortie compilee. Les deux chemins
# different, et seul le second a casse — @sira/shared n'exposait que du .ts,
# donc le typecheck passait et le demarrage echouait. Ce script couvre ce que
# les tests unitaires ne peuvent pas voir : l'injection NestJS, le client
# Prisma, les migrations et la resolution reelle des dependances.
#
# Prerequis : PostgreSQL demarre et migrations appliquees.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="${ROOT_DIR}/apps/api"
PORT="${API_SMOKE_PORT:-3100}"
BASE="http://localhost:${PORT}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "${API_DIR}/dist/main.js" ]] \
  || die "dist/main.js absent — lancer d abord : pnpm build"

# Garde-fou direct de la regression qui a motive ce script : les paquets de
# l'atelier doivent etre chargeables par require(), pas seulement typables.
log "Resolution de @sira/shared depuis le build CommonJS"
(cd "${API_DIR}" && node -e 'require("@sira/shared").haversineMeters') \
  || die "@sira/shared n est pas chargeable en CommonJS — sortie dist/cjs absente ?"

logfile="$(mktemp)"
pid=""
cleanup() {
  [[ -n "${pid}" ]] && kill "${pid}" 2>/dev/null || true
  rm -f "${logfile}"
}
trap cleanup EXIT

log "Demarrage de l API compilee sur le port ${PORT}"
(
  cd "${API_DIR}"
  API_PORT="${PORT}" node dist/main.js
) > "${logfile}" 2>&1 &
pid=$!

ready=0
for _ in $(seq 1 40); do
  if curl -fsS --max-time 2 "${BASE}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  # Inutile d'attendre la fin du delai si le processus est deja mort.
  kill -0 "${pid}" 2>/dev/null || break
  sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
  echo '--- journal de demarrage ---' >&2
  tail -30 "${logfile}" >&2
  die "l API n a pas demarre"
fi

log "GET /health"
health="$(curl -fsS --max-time 10 "${BASE}/health")"
echo "    ${health}"
[[ "${health}" == *'"database":"up"'* ]] \
  || die "la base n est pas joignable depuis l API"

log "GET /docs-json"
docs="$(curl -fsS --max-time 10 "${BASE}/docs-json")"
[[ "${docs}" == *'"/health"'* ]] \
  || die "la documentation OpenAPI ne reference pas /health"

printf '\n\033[1;32mAPI compilee operationnelle\033[0m — /health et /docs-json repondent.\n'
