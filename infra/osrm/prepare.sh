#!/usr/bin/env bash
#
# Prepare les donnees de routage OSRM pour la Cote d'Ivoire (roadmap Phase 0.4).
#
#   bash infra/osrm/prepare.sh [--profile car|motorcycle|bicycle|foot] [--force]
#
# Pipeline MLD (osrm-extract / osrm-partition / osrm-customize) et non CH :
# seul MLD permet de reinjecter des vitesses par segment en Phase 5 avec un
# simple osrm-customize (quelques minutes) au lieu d'un retraitement complet.
#
# Duree : ~10 a 20 min la premiere fois selon la machine. Espace disque : ~2 Go.
# Prerequis : docker, curl (ou wget).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"

OSRM_IMAGE="${OSRM_IMAGE:-osrm/osrm-backend:v5.27.1}"
# Geofabrik nomme l'extrait 'ivory-coast' (et non 'cote-divoire').
OSM_EXTRACT_URL="${OSM_EXTRACT_URL:-https://download.geofabrik.de/africa/ivory-coast-latest.osm.pbf}"
PBF_NAME="$(basename "${OSM_EXTRACT_URL}")"
BASE_NAME="${PBF_NAME%.osm.pbf}"

PROFILE="car"
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:?--profile attend une valeur}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      sed -n '2,15p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Option inconnue : $1" >&2
      exit 2
      ;;
  esac
done

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker est requis (https://docs.docker.com/get-docker/)"

mkdir -p "${DATA_DIR}"

# --- 1. Telechargement de l'extrait ----------------------------------------
if [[ -f "${DATA_DIR}/${PBF_NAME}" && "${FORCE}" -eq 0 ]]; then
  log "Extrait deja present : ${DATA_DIR}/${PBF_NAME} (utiliser --force pour re-telecharger)"
else
  log "Telechargement de ${OSM_EXTRACT_URL} (~80 Mo)"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "${DATA_DIR}/${PBF_NAME}.part" "${OSM_EXTRACT_URL}"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "${DATA_DIR}/${PBF_NAME}.part" "${OSM_EXTRACT_URL}"
  else
    die "curl ou wget est requis"
  fi
  mv "${DATA_DIR}/${PBF_NAME}.part" "${DATA_DIR}/${PBF_NAME}"

  # Verification d'integrite si Geofabrik publie une somme MD5.
  if curl -fsL -o "${DATA_DIR}/${PBF_NAME}.md5" "${OSM_EXTRACT_URL}.md5" 2>/dev/null; then
    if command -v md5sum >/dev/null 2>&1; then
      (cd "${DATA_DIR}" && md5sum -c "${PBF_NAME}.md5") \
        || die "somme MD5 invalide — telechargement corrompu"
      log "Somme MD5 verifiee"
    fi
  fi
fi

# --- 2. Pipeline OSRM -------------------------------------------------------
if [[ -f "${DATA_DIR}/${BASE_NAME}.osrm.mldgr" && "${FORCE}" -eq 0 ]]; then
  log "Donnees OSRM deja preparees (utiliser --force pour refaire le pipeline)"
  log "Pret : docker compose -f infra/docker-compose.yml up -d osrm"
  exit 0
fi

osrm() {
  docker run --rm -t \
    -v "${DATA_DIR}:/data" \
    "${OSRM_IMAGE}" \
    "$@"
}

log "osrm-extract (profil ${PROFILE}) — etape la plus longue"
osrm osrm-extract -p "/opt/${PROFILE}.lua" "/data/${PBF_NAME}"

log "osrm-partition"
osrm osrm-partition "/data/${BASE_NAME}.osrm"

log "osrm-customize"
osrm osrm-customize "/data/${BASE_NAME}.osrm"

log "Termine. Fichiers dans ${DATA_DIR}"
du -sh "${DATA_DIR}" 2>/dev/null || true

cat <<INFO

Prochaine etape :
  docker compose -f infra/docker-compose.yml up -d osrm
  bash infra/smoke-test.sh

Rappel Phase 5 : la mise a jour des vitesses trafic se fera par
  osrm-customize --segment-speed-file /data/traffic.csv /data/${BASE_NAME}.osrm
puis redemarrage du conteneur osrm — sans refaire extract ni partition.
INFO
