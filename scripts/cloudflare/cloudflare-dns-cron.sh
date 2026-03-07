#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/autamedica"
TOKEN_FILE="${CLOUDFLARE_TOKEN_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/autamedica/cloudflare.env}"
LOCK_FILE="${STATE_DIR}/cloudflare-dns-audit.lock"
LOG_FILE="${STATE_DIR}/cloudflare-dns-audit.log"
LATEST_FILE="${STATE_DIR}/cloudflare-dns-audit.latest.json"
TMP_FILE="${STATE_DIR}/cloudflare-dns-audit.$$.json"
PATH="/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

mkdir -p "${STATE_DIR}"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*" >> "${LOG_FILE}"
}

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "cloudflare dns audit skipped: lock busy"
  exit 0
fi

if [ ! -f "${TOKEN_FILE}" ]; then
  log "cloudflare dns audit failed: token file not found at ${TOKEN_FILE}"
  exit 1
fi

args=(--action audit --quiet-verify)
if [ -n "${CLOUDFLARE_CRON_PROJECTS:-}" ]; then
  args+=(--project "${CLOUDFLARE_CRON_PROJECTS}")
fi

log "cloudflare dns audit started"

if bash "${PROJECT_ROOT}/scripts/cloudflare/cloudflare-token-flow.sh" "${args[@]}" > "${TMP_FILE}" 2>> "${LOG_FILE}"; then
  mv "${TMP_FILE}" "${LATEST_FILE}"
  log "cloudflare dns audit succeeded"
  exit 0
fi

status=$?
if [ -f "${TMP_FILE}" ]; then
  cat "${TMP_FILE}" >> "${LOG_FILE}" || true
  rm -f "${TMP_FILE}"
fi
log "cloudflare dns audit failed with exit code ${status}"
exit "${status}"
