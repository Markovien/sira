#!/usr/bin/env bash
#
# Enveloppe unique autour de docker compose pour la stack locale.
#
#   bash infra/compose.sh up -d      (ou pnpm infra:up)
#   bash infra/compose.sh logs -f
#   bash infra/compose.sh down
#
# Pourquoi ce script plutot qu'un appel direct : docker compose cherche le
# fichier .env a cote du docker-compose.yml, donc dans infra/. Or le .env du
# projet vit a la racine (c'est lui que lisent l'API et infra/smoke-test.sh).
# Sans --env-file explicite, les surcharges de la racine seraient ignorees en
# silence — et un port deja pris redeviendrait impossible a corriger.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

args=(-f "${ROOT_DIR}/infra/docker-compose.yml")

# Le .env est facultatif : toutes les variables ont un defaut dans le
# docker-compose.yml, la stack demarre donc sans configuration prealable.
if [[ -f "${ROOT_DIR}/.env" ]]; then
  args+=(--env-file "${ROOT_DIR}/.env")
fi

exec docker compose "${args[@]}" "$@"
