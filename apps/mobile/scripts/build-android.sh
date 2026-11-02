#!/usr/bin/env bash
#
# APK de release construit en local, sans EAS (decisions.md, 26/10/2026).
#
#   ANDROID_HOME=/chemin/du/sdk EXPO_PUBLIC_API_URL=https://api.exemple bash apps/mobile/scripts/build-android.sh
#
# Prerequis : JDK 17+, SDK Android (platform android-37.0, build-tools 37.0.0,
# NDK 27.1.12297006, cmake 3.22.1). Le projet android/ est regenere a chaque
# fois depuis app.json : il n'est pas commite.
#
# Sans keystore de production, l'APK est signe avec la cle de debug du projet
# genere : bon pour mesurer et essayer, pas pour distribuer (decisions.md,
# 02/11/2026).

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Budget de la roadmap (Phase 3.8), hors tuiles de carte.
MAX_APK_MB=60

: "${ANDROID_HOME:?ANDROID_HOME doit pointer vers le SDK Android}"
if [[ -z "${EXPO_PUBLIC_API_URL:-}" ]]; then
  echo "Attention : EXPO_PUBLIC_API_URL absente, l'APK visera http://10.0.2.2:3000 (emulateur)." >&2
fi

cd "${APP_DIR}"
# prebuild reecrit les scripts de package.json (run:android) : on le remet
# tel que commite, le projet natif genere ne doit rien changer au depot.
cp package.json "${TMPDIR:-/tmp}/sira-mobile-package.json"
trap 'cp "${TMPDIR:-/tmp}/sira-mobile-package.json" "${APP_DIR}/package.json"' EXIT
EXPO_NO_TELEMETRY=1 CI=1 npx expo prebuild --platform android --no-install --clean

cd android
# Deux architectures ARM seulement : x86 et x86_64 ne servent qu'aux
# emulateurs. Ressources inutilisees retirees ; GIF et WebP desactives, l'app
# n'en affiche pas.
# Reprises espacees : Maven Central repond 429 aux rafales de requetes d'un
# premier build, notamment derriere une adresse de sortie partagee.
./gradlew assembleRelease \
  -Dorg.gradle.internal.repository.max.retries=8 \
  -Dorg.gradle.internal.repository.initial.backoff=3000 \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=true \
  -Pexpo.gif.enabled=false \
  -Pexpo.webp.enabled=false

APK="${APP_DIR}/android/app/build/outputs/apk/release/app-release.apk"
size_bytes=$(stat -c %s "${APK}")
size_mb=$(( size_bytes / 1024 / 1024 ))
echo "APK : ${APK} (${size_mb} Mo)"
if (( size_bytes > MAX_APK_MB * 1024 * 1024 )); then
  echo "Erreur : l'APK depasse le budget de ${MAX_APK_MB} Mo." >&2
  exit 1
fi
