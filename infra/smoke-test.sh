#!/usr/bin/env bash
#
# Verifie les criteres d'acceptation de la Phase 0 (roadmap).
#
#   bash infra/smoke-test.sh
#
# 1. PostgreSQL repond et PostGIS est installe
# 2. OSRM renvoie une route entre deux points d'Abidjan
# 3. OSRM renvoie une matrice de durees N x N (base du TSP/VRP)
# 4. Photon geocode « Pharmacie Saint Jean Cocody »
#
# Sortie 0 si tout passe, 1 sinon. Concu pour tourner en < 30 s.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "${ROOT_DIR}/.env" ]] && set -a && . "${ROOT_DIR}/.env" && set +a

OSRM_URL="${OSRM_URL:-http://localhost:5000}"
PHOTON_URL="${PHOTON_URL:-http://localhost:2322}"
POSTGRES_USER="${POSTGRES_USER:-sira}"
POSTGRES_DB="${POSTGRES_DB:-sira}"

# Plateau (Avenue Chardy) et Cocody (Carrefour Saint Jean), en lon,lat pour OSRM.
PLATEAU='-4.0212,5.3251'
SAINT_JEAN='-3.9958,5.3457'
MARCORY='-3.9952,5.2957'

pass=0
fail=0

ok()   { printf '  \033[1;32mOK\033[0m    %s\n' "$*"; pass=$((pass + 1)); }
ko()   { printf '  \033[1;31mECHEC\033[0m %s\n' "$*"; fail=$((fail + 1)); }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

command -v curl >/dev/null 2>&1 || { echo "curl est requis" >&2; exit 2; }

# --- 1. PostgreSQL + PostGIS ------------------------------------------------
step '1. PostgreSQL + PostGIS'
if ! command -v docker >/dev/null 2>&1; then
  ko 'docker introuvable (https://docs.docker.com/get-docker/)'
elif ! docker info >/dev/null 2>&1; then
  ko 'le demon Docker ne repond pas (Docker Desktop demarre ?)'
else
  version="$(docker exec sira-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    -tAc 'SELECT postgis_version();' 2>/dev/null)"
  if [[ -n "${version}" ]]; then
    ok "PostGIS ${version}"
  else
    ko 'PostGIS injoignable (docker compose up -d postgres ?)'
  fi
fi

# --- 2. OSRM : route --------------------------------------------------------
step '2. OSRM — route Plateau -> Cocody Saint Jean'
route="$(curl -fsS --max-time 10 \
  "${OSRM_URL}/route/v1/driving/${PLATEAU};${SAINT_JEAN}?overview=false" 2>/dev/null)"
if [[ "${route}" == *'"code":"Ok"'* ]]; then
  distance="$(printf '%s' "${route}" | grep -o '"distance":[0-9.]*' | head -1 | cut -d: -f2)"
  duration="$(printf '%s' "${route}" | grep -o '"duration":[0-9.]*' | head -1 | cut -d: -f2)"
  ok "route trouvee — ${distance} m, ${duration} s"
  # Garde-fou : une route plausible fait 3 a 12 km ; au-dela, coordonnees inversees.
  meters="${distance%%.*}"
  if [[ -n "${meters}" ]] && ((meters > 2000 && meters < 15000)); then
    ok 'distance plausible (coordonnees dans le bon ordre lon,lat)'
  else
    ko "distance suspecte (${distance} m) — verifier l'ordre lon,lat"
  fi
else
  ko 'pas de route (donnees preparees ? bash infra/osrm/prepare.sh)'
fi

# --- 3. OSRM : matrice ------------------------------------------------------
step '3. OSRM — matrice de durees 3 x 3'
table="$(curl -fsS --max-time 10 \
  "${OSRM_URL}/table/v1/driving/${PLATEAU};${SAINT_JEAN};${MARCORY}" 2>/dev/null)"
if [[ "${table}" == *'"code":"Ok"'* && "${table}" == *'"durations"'* ]]; then
  ok 'matrice de durees renvoyee'
else
  ko 'matrice indisponible (--max-table-size trop bas ?)'
fi

# --- 4. Photon : geocodage --------------------------------------------------
step '4. Photon — geocodage « Pharmacie Saint Jean Cocody »'
geo="$(curl -fsS --max-time 15 -G \
  --data-urlencode 'q=Pharmacie Saint Jean Cocody' \
  --data-urlencode 'limit=5' \
  --data-urlencode 'lat=5.3457' \
  --data-urlencode 'lon=-3.9958' \
  "${PHOTON_URL}/api" 2>/dev/null)"
if [[ "${geo}" == *'"features"'* ]]; then
  count="$(printf '%s' "${geo}" | grep -o '"type":"Feature"' | wc -l | tr -d ' ')"
  if [[ "${count}" -gt 0 ]]; then
    ok "${count} resultat(s) — premier : $(printf '%s' "${geo}" | grep -o '"name":"[^"]*"' | head -1)"
  else
    ko 'aucun resultat (index du pays charge ?)'
  fi
else
  ko 'Photon injoignable (bash infra/photon/prepare.sh puis docker compose up -d photon)'
fi

# --- Bilan ------------------------------------------------------------------
printf '\n\033[1m%d verification(s) reussie(s), %d en echec\033[0m\n' "${pass}" "${fail}"
[[ "${fail}" -eq 0 ]] || exit 1
printf '\033[1;32mCriteres d acceptation de la Phase 0 : verts.\033[0m\n'
