#!/bin/sh
set -eu
if [ "${CODESPACES:-}" = true ]; then
    printf 'VITE_API_BASE="https://%s-3001.%s/api"\n' "$CODESPACE_NAME" "$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" > frontend/.env
fi
