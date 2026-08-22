#!/usr/bin/env bash
#
# Prepare le geocodeur Photon pour la Cote d'Ivoire (roadmap Phase 0.3).
#
#   bash infra/photon/prepare.sh [--force]
#
# Deux telechargements :
#   1. le jar officiel Photon (komoot/photon, releases GitHub) ;
#   2. l'index pre-construit du pays, publie par GraphHopper — evite d'avoir a
#      installer et importer Nominatim en local (plusieurs heures et ~50 Go).
#
# Duree : ~5 min. Espace disque : ~1 Go pour la Cote d'Ivoire.
# Prerequis : curl (ou wget), bzip2 ou tar avec support bz2.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PHOTON_VERSION="${PHOTON_VERSION:-0.6.0}"
PHOTON_JAR_URL="${PHOTON_JAR_URL:-https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar}"
PHOTON_COUNTRY_CODE="${PHOTON_COUNTRY_CODE:-ci}"
PHOTON_INDEX_URL="${PHOTON_INDEX_URL:-https://download1.graphhopper.com/public/extracts/by-country-code/${PHOTON_COUNTRY_CODE}/photon-db-${PHOTON_COUNTRY_CODE}-latest.tar.bz2}"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

fetch() {
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "${out}" "${url}"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "${out}" "${url}"
  else
    die "curl ou wget est requis"
  fi
}

mkdir -p "${SCRIPT_DIR}"

# --- 1. Jar Photon ----------------------------------------------------------
if [[ -f "${SCRIPT_DIR}/photon.jar" && "${FORCE}" -eq 0 ]]; then
  log "photon.jar deja present (utiliser --force pour re-telecharger)"
else
  log "Telechargement de Photon ${PHOTON_VERSION}"
  fetch "${PHOTON_JAR_URL}" "${SCRIPT_DIR}/photon.jar.part" \
    || die "telechargement du jar impossible — verifier PHOTON_VERSION (${PHOTON_VERSION}) sur https://github.com/komoot/photon/releases"
  mv "${SCRIPT_DIR}/photon.jar.part" "${SCRIPT_DIR}/photon.jar"
fi

# --- 2. Index de geocodage du pays ------------------------------------------
if [[ -d "${SCRIPT_DIR}/photon_data" && "${FORCE}" -eq 0 ]]; then
  log "Index photon_data deja present (utiliser --force pour re-importer)"
else
  log "Telechargement de l'index ${PHOTON_COUNTRY_CODE^^} (~700 Mo compresse)"
  fetch "${PHOTON_INDEX_URL}" "${SCRIPT_DIR}/photon-db.tar.bz2" \
    || die "telechargement de l'index impossible — verifier ${PHOTON_INDEX_URL}"

  log "Decompression (peut prendre quelques minutes)"
  rm -rf "${SCRIPT_DIR}/photon_data"
  tar -xjf "${SCRIPT_DIR}/photon-db.tar.bz2" -C "${SCRIPT_DIR}"
  rm -f "${SCRIPT_DIR}/photon-db.tar.bz2"

  [[ -d "${SCRIPT_DIR}/photon_data" ]] \
    || die "l'archive n'a pas produit de repertoire photon_data — verifier la version de l'index"
fi

log "Termine. Contenu de ${SCRIPT_DIR} :"
du -sh "${SCRIPT_DIR}"/* 2>/dev/null || true

cat <<'INFO'

Prochaine etape :
  docker compose -f infra/docker-compose.yml up -d photon
  bash infra/smoke-test.sh

Note : l'index GraphHopper est un instantane OSM. La base d'adresses
proprietaire (table Address, Phase 1) prend le relais pour tout ce que Photon
ne trouve pas — c'est elle, et non Photon, qui constitue le moat du projet.
INFO
