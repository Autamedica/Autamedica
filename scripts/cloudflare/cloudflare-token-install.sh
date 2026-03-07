#!/usr/bin/env bash
set -euo pipefail

VERIFY_URL="https://api.cloudflare.com/client/v4/user/tokens/verify"
TOKEN_FILE="${CLOUDFLARE_TOKEN_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/autamedica/cloudflare.env}"

mkdir -p "$(dirname "${TOKEN_FILE}")"

read -r -s -p "Cloudflare API token: " token
echo

if [ -z "${token}" ]; then
  echo "Missing Cloudflare API token" >&2
  exit 1
fi

verify_response="$(
  curl -fsS "${VERIFY_URL}" \
    --header "Authorization: Bearer ${token}"
)"

printf 'CLOUDFLARE_API_TOKEN="%s"\n' "${token}" > "${TOKEN_FILE}"
chmod 600 "${TOKEN_FILE}"

echo "Token verified and stored at ${TOKEN_FILE}"
echo "${verify_response}"
