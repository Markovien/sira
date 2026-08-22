#!/usr/bin/env bash
#
# Verifie que .env.example documente toutes les variables de configuration de
# l'infrastructure locale, et que docker-compose.yml reste demarrable sans .env.
#
#   bash infra/check-env-example.sh
#
# La regle « .env.example tenu a jour » (CLAUDE.md §5) n'a de valeur que si
# quelque chose la controle : sans cela, une variable ajoutee au compose reste
# invisible et le prochain contributeur la decouvre au demarrage.
#
# Le critere retenu est la forme ${NOM:-defaut} : c'est exactement la surface
# configurable, par opposition aux variables internes des scripts.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/infra/docker-compose.yml"
SMOKE_FILE="${ROOT_DIR}/infra/smoke-test.sh"
EXAMPLE_FILE="${ROOT_DIR}/.env.example"

for f in "${COMPOSE_FILE}" "${SMOKE_FILE}" "${EXAMPLE_FILE}"; do
  [[ -f "${f}" ]] || { echo "Fichier introuvable : ${f}" >&2; exit 2; }
done

status=0

# --- 1. Toute variable surchargeable est-elle documentee ? -------------------
referenced="$( { grep -ohE '\$\{[A-Z][A-Z0-9_]*:-' "${COMPOSE_FILE}" "${SMOKE_FILE}" || true; } \
  | sed -E 's/^\$\{//; s/:-$//' | sort -u)"

documented="$(grep -oE '^[A-Z][A-Z0-9_]*=' "${EXAMPLE_FILE}" | tr -d '=' | sort -u)"

missing="$(comm -23 <(printf '%s\n' "${referenced}") <(printf '%s\n' "${documented}"))"

if [[ -n "${missing}" ]]; then
  {
    echo "ECHEC : variables de l infra absentes de .env.example :"
    printf '  - %s\n' ${missing}
    echo "Ajouter chacune a .env.example, avec un commentaire et une valeur d exemple."
  } >&2
  status=1
fi

# --- 2. Le compose demarre-t-il sans .env ? ---------------------------------
# Une variable sans valeur par defaut ferait echouer `pnpm infra:up` sur une
# machine neuve — ce que la Phase 0 s'engage precisement a eviter.
undefaulted="$( { grep -oE '\$\{[A-Z][A-Z0-9_]*\}' "${COMPOSE_FILE}" || true; } \
  | sed -E 's/^\$\{//; s/\}$//' | sort -u)"

if [[ -n "${undefaulted}" ]]; then
  {
    echo "ECHEC : variables sans valeur par defaut dans docker-compose.yml :"
    printf '  - %s\n' ${undefaulted}
    echo "Ecrire \${NOM:-valeur} : l environnement doit demarrer sans .env."
  } >&2
  status=1
fi

if [[ "${status}" -eq 0 ]]; then
  count="$(printf '%s\n' "${referenced}" | grep -c . || true)"
  echo "OK : les ${count} variables de l infra sont documentees et ont un defaut."
fi

exit "${status}"
