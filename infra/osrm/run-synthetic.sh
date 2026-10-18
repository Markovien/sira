#!/usr/bin/env bash
#
# Demarre un OSRM persistant sur l'extrait synthetique, pour le developpement
# et les tests de bout en bout.
#
#   bash infra/osrm/run-synthetic.sh          # demarre (idempotent)
#   bash infra/osrm/run-synthetic.sh --stop   # arrete et nettoie
#
# A ne pas confondre avec verify-pipeline.sh, qui valide la chaine puis se
# nettoie : celui-ci laisse le service debout.
#
# A ne pas confondre non plus avec l'OSRM de production (pnpm infra:up), qui
# sert l'extrait reel de la Cote d'Ivoire. Cinq noeuds autour d'Abidjan
# suffisent a exercer le code ; ils ne valident pas la qualite du routage.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OSRM_IMAGE="${OSRM_IMAGE:-osrm/osrm-backend:v5.25.0}"
NAME="sira-osrm-synthetic"
DATA_DIR="${SCRIPT_DIR}/.synthetic"

# 5000 par defaut. Eviter 5060 et 5061 : la specification fetch les bloque
# (ports SIP) et undici les refuse sans message clair.
PORT="${SYNTHETIC_OSRM_PORT:-5000}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--stop" ]]; then
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}"
  echo "OSRM synthetique arrete et nettoye."
  exit 0
fi

command -v docker >/dev/null 2>&1 || die "docker est requis"
docker info >/dev/null 2>&1 || die "le demon Docker ne repond pas"

if docker ps --format '{{.Names}}' | grep -qx "${NAME}"; then
  echo "Deja demarre sur le port ${PORT}."
  exit 0
fi
docker rm -f "${NAME}" >/dev/null 2>&1 || true

if [[ ! -f "${DATA_DIR}/smoke-synthetic.osrm.mldgr" ]]; then
  log "Preparation du graphe (quelques secondes)"
  mkdir -p "${DATA_DIR}"
  cp "${SCRIPT_DIR}/smoke-synthetic.osm" "${DATA_DIR}/"
  osrm() { docker run --rm -v "${DATA_DIR}:/data" "${OSRM_IMAGE}" "$@" >/dev/null; }
  osrm osrm-extract -p /opt/car.lua /data/smoke-synthetic.osm
  osrm osrm-partition /data/smoke-synthetic.osrm
  osrm osrm-customize /data/smoke-synthetic.osrm
fi

log "Demarrage sur le port ${PORT}"
docker run -d --name "${NAME}" -p "${PORT}:5000" -v "${DATA_DIR}:/data:ro" \
  "${OSRM_IMAGE}" osrm-routed --algorithm mld --max-table-size 200 \
  /data/smoke-synthetic.osrm >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 \
    "http://127.0.0.1:${PORT}/route/v1/driving/-4.0212,5.3251;-3.9958,5.3457" >/dev/null 2>&1
  then
    printf '\n\033[1;32mOSRM synthetique pret\033[0m sur http://127.0.0.1:%s\n' "${PORT}"
    printf '  export OSRM_URL="http://127.0.0.1:%s"\n\n' "${PORT}"
    exit 0
  fi
  sleep 1
done

docker logs "${NAME}" >&2
die "OSRM n a pas demarre"
