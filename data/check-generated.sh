#!/usr/bin/env bash
#
# Verifie que data/abidjan-stops.json est exactement la sortie du generateur.
#
#   bash data/check-generated.sh      (ou pnpm data:check)
#
# Le JSON est un artefact genere : toute retouche manuelle serait perdue a la
# prochaine regeneration et rendrait les benchmarks de la Phase 2 non
# reproductibles. Corriger la liste STOPS dans generate-abidjan-stops.py.

set -euo pipefail

DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="${DATA_DIR}/generate-abidjan-stops.py"
TARGET="${DATA_DIR}/abidjan-stops.json"

PYTHON="${PYTHON:-}"
if [[ -z "${PYTHON}" ]]; then
  for candidate in python3 python; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      PYTHON="${candidate}"
      break
    fi
  done
fi
[[ -n "${PYTHON}" ]] || { echo "python3 est requis" >&2; exit 2; }

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

cp "${TARGET}" "${workdir}/before.json"
"${PYTHON}" "${GENERATOR}" >/dev/null

if diff -u "${workdir}/before.json" "${TARGET}" > "${workdir}/diff.txt"; then
  echo "OK : abidjan-stops.json est conforme a la sortie du generateur."
  exit 0
fi

# Restaurer la version commitee : la verification ne doit rien modifier.
cp "${workdir}/before.json" "${TARGET}"

cat >&2 <<MSG
ECHEC : data/abidjan-stops.json differe de la sortie de
$(basename "${GENERATOR}"). Ne pas editer le JSON a la main — modifier le
generateur puis relancer :

  python data/generate-abidjan-stops.py

Ecart constate :
MSG
head -40 "${workdir}/diff.txt" >&2
exit 1
