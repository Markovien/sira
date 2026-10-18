#!/usr/bin/env bash
#
# Valide la chaine OSRM sans telecharger l'extrait reel de 2 Go.
#
#   bash infra/osrm/verify-pipeline.sh
#
# Rejoue le pipeline MLD complet sur smoke-synthetic.osm — cinq noeuds et deux
# routes autour d'Abidjan — puis interroge /route et /table. En deux minutes,
# cela controle ce qui casse en silence : le tag de l'image, le chemin du
# profil Lua, l'enchainement extract/partition/customize et les options de
# osrm-routed. C'est ainsi qu'a ete decouvert un tag d'image inexistant.
#
# Ne remplace pas infra/smoke-test.sh, qui valide les criteres d'acceptation
# de la Phase 0 sur les vraies donnees d'Abidjan.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OSRM_IMAGE="${OSRM_IMAGE:-osrm/osrm-backend:v5.25.0}"
# Port distinct de celui du compose, pour pouvoir tourner en parallele.
PORT="${VERIFY_OSRM_PORT:-5051}"
NAME="sira-osrm-verify"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker est requis"
docker info >/dev/null 2>&1 || die "le demon Docker ne repond pas"

workdir="$(mktemp -d)"
cleanup() {
  docker rm -f "${NAME}" >/dev/null 2>&1 || true
  rm -rf "${workdir}"
}
trap cleanup EXIT

cp "${SCRIPT_DIR}/smoke-synthetic.osm" "${workdir}/"

osrm() { docker run --rm -t -v "${workdir}:/data" "${OSRM_IMAGE}" "$@"; }

log "osrm-extract (profil car)"
osrm osrm-extract -p /opt/car.lua /data/smoke-synthetic.osm >/dev/null

log "osrm-partition"
osrm osrm-partition /data/smoke-synthetic.osrm >/dev/null

log "osrm-customize"
osrm osrm-customize /data/smoke-synthetic.osrm >/dev/null

[[ -f "${workdir}/smoke-synthetic.osrm.mldgr" ]] \
  || die "pipeline MLD incomplet — pas de fichier .osrm.mldgr"

log "osrm-routed (MLD) sur le port ${PORT}"
docker run -d --name "${NAME}" -p "${PORT}:5000" -v "${workdir}:/data:ro" \
  "${OSRM_IMAGE}" osrm-routed --algorithm mld --max-table-size 200 \
  /data/smoke-synthetic.osrm >/dev/null

base="http://localhost:${PORT}"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "${base}/route/v1/driving/-4.0212,5.3251;-3.9958,5.3457" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "${ready}" -eq 1 ]] || die "osrm-routed n a pas demarre"

route="$(curl -fsS --max-time 10 \
  "${base}/route/v1/driving/-4.0212,5.3251;-3.9958,5.3457?overview=false")"
[[ "${route}" == *'"code":"Ok"'* ]] || die "/route n a pas renvoye de route"

table="$(curl -fsS --max-time 10 \
  "${base}/table/v1/driving/-4.0212,5.3251;-4.0150,5.3300;-3.9958,5.3457")"
[[ "${table}" == *'"durations"'* ]] || die "/table n a pas renvoye de matrice"

printf '\n\033[1;32mChaine OSRM valide\033[0m — image %s, pipeline MLD, /route et /table.\n' \
  "${OSRM_IMAGE}"
