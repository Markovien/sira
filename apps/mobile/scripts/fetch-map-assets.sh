#!/usr/bin/env bash
#
# Recupere les glyphes et le sprite de la carte hors-ligne (decisions.md,
# 24/11/2026), embarques dans l'APK par plugins/with-map-glyphs.js.
#
#   bash apps/mobile/scripts/fetch-map-assets.sh
#
# Source : protomaps/basemaps-assets, le depot des ressources du style
# @protomaps/basemaps. Polices Noto Sans sous SIL OFL 1.1, sprite derive de
# tangrams/icons (MIT). Le resultat est commite : le build ne depend pas du
# reseau. A relancer seulement en changeant de version de @protomaps/basemaps.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${APP_DIR}/assets/map"
BASE="https://protomaps.github.io/basemaps-assets"

# Plages Unicode embarquees : les ecritures latines rencontrees dans l'extrait
# d'Abidjan (mesure du 24/11/2026) -- Latin-1 et accents francais, Latin
# etendu A et B, diacritiques combinants, Latin etendu additionnel, ponctuation
# generale. Toutes les autres plages recoivent au build un fichier vide
# (plugins/with-map-assets.js) : aucune requete de glyphe n'echoue, et les
# rares noms en ecriture non latine ne s'affichent simplement pas. Le jeu
# complet pese ~7 Mo par police.
RANGES=(0-255 256-511 512-767 768-1023 7680-7935 8192-8447)
# Nom distant -> nom local sans espace (voir GLYPHS_URL dans src/core/map-style.ts).
# L'italique est ramene au regulier (MAP_FONTS) : une police de moins.
FONTS=("Noto Sans Regular:NotoSansRegular" "Noto Sans Medium:NotoSansMedium")

rm -rf "${OUT}"
mkdir -p "${OUT}/glyphs" "${OUT}/sprites"

for entry in "${FONTS[@]}"; do
  remote="${entry%%:*}"
  local_name="${entry##*:}"
  mkdir -p "${OUT}/glyphs/${local_name}"
  for range in "${RANGES[@]}"; do
    curl -sSf --max-time 60 -o "${OUT}/glyphs/${local_name}/${range}.pbf" \
      "${BASE}/fonts/${remote// /%20}/${range}.pbf"
  done
done
curl -sSf --max-time 60 -o "${OUT}/glyphs/OFL.txt" "${BASE}/fonts/OFL.txt"

for f in light.json light.png light@2x.json light@2x.png; do
  curl -sSf --max-time 60 -o "${OUT}/sprites/${f}" "${BASE}/sprites/v4/${f}"
done

du -sh "${OUT}"
