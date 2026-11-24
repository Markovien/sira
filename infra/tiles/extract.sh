#!/usr/bin/env bash
#
# Produit l'extrait de carte hors-ligne du Grand Abidjan et son manifeste
# (decisions.md, 24/11/2026).
#
#   bash infra/tiles/extract.sh                         # build epingle ci-dessous
#   PROTOMAPS_BUILD=20261224 bash infra/tiles/extract.sh  # nouveau build date
#
# Source : un build quotidien Protomaps (planet OSM en tuiles vectorielles,
# ODbL). `pmtiles extract` n'en lit, par requetes de plage, que l'emprise
# demandee : ~8 Mo transferes pour Abidjan, pas les 140 Go du planet.
# A relancer a la main, au plus une fois par mois : les builds quotidiens ne
# sont conserves que quelques jours chez Protomaps, et ne doivent jamais etre
# appeles par les telephones.
#
# Sortie (ignoree par git) :
#   infra/tiles/data/abidjan.pmtiles
#   infra/tiles/data/manifest.json   -> servi par l'API (GET /tiles/manifest)
#
# Prerequis : Go (pour compiler l'outil officiel pmtiles), curl, python3.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/infra/tiles/data"
TOOLS_DIR="${ROOT_DIR}/infra/tiles/.tools"

# Build date epingle : un extrait reproductible, dont la provenance est connue.
PROTOMAPS_BUILD="${PROTOMAPS_BUILD:-20261124}"
GO_PMTILES_VERSION="v1.31.2"
# Meme emprise que ABIDJAN_BBOX (packages/shared/src/geo.ts) :
# minLon,minLat,maxLon,maxLat.
BBOX="-4.35,5.15,-3.75,5.55"
# Zoom 14 : MapLibre sur-zoome les tuiles vectorielles, la rue reste nette.
# Le zoom 15 triplerait le poids pour un gain invisible au livreur.
MAX_ZOOM=14
NAME="abidjan"

BUILD_URL="https://build.protomaps.com/${PROTOMAPS_BUILD}.pmtiles"
BUILDS_INDEX="https://build-metadata.protomaps.dev/builds.json"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

command -v go >/dev/null || fail "Go est requis pour compiler pmtiles."

# --- 1. Outil officiel ------------------------------------------------------
# Compile depuis le proxy de modules Go : les releases GitHub ne sont pas
# toujours joignables, le code est le meme, version epinglee.
PMTILES="${TOOLS_DIR}/go-pmtiles"
if [[ ! -x "${PMTILES}" ]]; then
  info "Compilation de go-pmtiles ${GO_PMTILES_VERSION}"
  mkdir -p "${TOOLS_DIR}"
  GOBIN="${TOOLS_DIR}" go install "github.com/protomaps/go-pmtiles@${GO_PMTILES_VERSION}"
fi

# --- 2. Le build existe-t-il encore ? ---------------------------------------
info "Build Protomaps ${PROTOMAPS_BUILD}"
builds_json="$(curl -sSf --max-time 60 "${BUILDS_INDEX}")" \
  || fail "Index des builds Protomaps injoignable (${BUILDS_INDEX})."
build_b3sum="$(printf '%s' "${builds_json}" | python3 -c '
import json, sys
key = sys.argv[1] + ".pmtiles"
for b in json.load(sys.stdin):
    if b.get("key") == key:
        print(b.get("b3sum", ""))
        break
' "${PROTOMAPS_BUILD}")"
[[ -n "${build_b3sum}" ]] \
  || fail "Build ${PROTOMAPS_BUILD} absent de l'index : choisir un build recent (PROTOMAPS_BUILD=AAAAMMJJ)."

# --- 3. Extraction ----------------------------------------------------------
mkdir -p "${OUT_DIR}"
tmp="${OUT_DIR}/${NAME}.pmtiles.tmp"
rm -f "${tmp}"
info "Extraction de l'emprise ${BBOX}, zooms 0-${MAX_ZOOM}"
"${PMTILES}" extract "${BUILD_URL}" "${tmp}" --bbox="${BBOX}" --maxzoom="${MAX_ZOOM}"
"${PMTILES}" verify "${tmp}"

osm_time="$("${PMTILES}" show "${tmp}" | sed -n 's/^planetiler:osm:osmosisreplicationtime //p')"
mv "${tmp}" "${OUT_DIR}/${NAME}.pmtiles"

# --- 4. Manifeste -----------------------------------------------------------
# md5 : ce que le telephone sait calculer nativement, sans charger 7 Mo en
# memoire JavaScript. sha256 : pour la tracabilite cote serveur.
file="${OUT_DIR}/${NAME}.pmtiles"
python3 - "${file}" "${PROTOMAPS_BUILD}" "${build_b3sum}" "${osm_time}" "${BBOX}" "${MAX_ZOOM}" \
  > "${OUT_DIR}/manifest.json" <<'PY'
import hashlib, json, os, sys
path, build, b3sum, osm_time, bbox, max_zoom = sys.argv[1:]
md5, sha = hashlib.md5(), hashlib.sha256()
with open(path, "rb") as f:
    for chunk in iter(lambda: f.read(1 << 20), b""):
        md5.update(chunk)
        sha.update(chunk)
min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
json.dump(
    {
        "version": build,
        "file": os.path.basename(path),
        "bytes": os.path.getsize(path),
        "md5": md5.hexdigest(),
        "sha256": sha.hexdigest(),
        "maxZoom": int(max_zoom),
        "bbox": {"minLat": min_lat, "minLon": min_lon, "maxLat": max_lat, "maxLon": max_lon},
        "attribution": "\u00a9 OpenStreetMap",
        "source": {"protomapsBuild": build, "b3sum": b3sum, "osmReplicationTime": osm_time},
    },
    sys.stdout,
    ensure_ascii=False,
    indent=2,
)
sys.stdout.write("\n")
PY

size_mb="$(python3 -c "import os,sys;print(round(os.path.getsize(sys.argv[1])/1e6,1))" "${file}")"
printf '\033[1;32mExtrait pret\033[0m : %s (%s Mo)\n' "${file}" "${size_mb}"
