#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERIFY_URL="https://api.cloudflare.com/client/v4/user/tokens/verify"
TOKEN_PAGE_URL="https://dash.cloudflare.com/profile/api-tokens"
DEFAULT_TOKEN_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/autamedica/cloudflare.env"

ACTION="audit"
JSON_OUTPUT=true
OPEN_TOKEN_PAGE=false
USE_TMUX=false
TMUX_SESSION="cloudflare_token_flow"
PROJECTS=""
TOKEN_FILE="${CLOUDFLARE_TOKEN_FILE:-${DEFAULT_TOKEN_FILE}}"
PRINT_VERIFY_RESPONSE=true
EXTRA_ARGS=()

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --action audit|reconcile   Default: audit
  --project list             Comma-separated project filter
  --open-token-page          Open Cloudflare API tokens page in the desktop browser
  --tmux                     Run in a fresh tmux session and attach
  --session name             tmux session name (default: ${TMUX_SESSION})
  --token-file path          Local token file (default: ${TOKEN_FILE})
  --quiet-verify             Do not print token verification response
  --no-json                  Disable JSON output for audit
  --dry-run                  Pass through to reconcile script
  --help                     Show this help

Examples:
  $0 --tmux --open-token-page
  $0 --action reconcile --open-token-page
  $0 --project autamedica-doctors,autamedica-patients
EOF
}

open_token_page() {
  if command -v xdg-open >/dev/null 2>&1; then
    setsid xdg-open "${TOKEN_PAGE_URL}" >/dev/null 2>&1 < /dev/null &
    echo "Opened Cloudflare token page: ${TOKEN_PAGE_URL}"
  else
    echo "Open this URL in your browser: ${TOKEN_PAGE_URL}"
  fi
}

launch_tmux() {
  if ! command -v tmux >/dev/null 2>&1; then
    echo "tmux is not installed" >&2
    exit 1
  fi

  local escaped=()
  escaped+=("bash" "${BASH_SOURCE[0]}" "--no-json")

  if [ "${ACTION}" != "audit" ]; then
    escaped+=("--action" "${ACTION}")
  fi
  if [ -n "${PROJECTS}" ]; then
    escaped+=("--project" "${PROJECTS}")
  fi
  if [ "${OPEN_TOKEN_PAGE}" = true ]; then
    escaped+=("--open-token-page")
  fi
  for arg in "${EXTRA_ARGS[@]}"; do
    escaped+=("${arg}")
  done

  if tmux has-session -t "${TMUX_SESSION}" 2>/dev/null; then
    tmux kill-session -t "${TMUX_SESSION}"
  fi

  local quoted=""
  printf -v quoted '%q ' "${escaped[@]}"
  tmux new-session -d -s "${TMUX_SESSION}" "cd ${PROJECT_ROOT} && ${quoted}"
  exec tmux attach -t "${TMUX_SESSION}"
}

verify_token() {
  local token="$1"
  curl -fsS "${VERIFY_URL}" \
    --header "Authorization: Bearer ${token}"
}

load_token_from_file() {
  if [ ! -f "${TOKEN_FILE}" ]; then
    return 1
  fi

  local line
  line="$(grep -E '^CLOUDFLARE_API_TOKEN=' "${TOKEN_FILE}" | tail -n 1 || true)"
  if [ -z "${line}" ]; then
    return 1
  fi

  line="${line#CLOUDFLARE_API_TOKEN=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "${line}"
}

run_action() {
  local token="$1"
  local command=(node "${PROJECT_ROOT}/scripts/cloudflare/reconcile-pages-domains.mjs")

  case "${ACTION}" in
    audit)
      command+=("--audit")
      if [ "${JSON_OUTPUT}" = true ]; then
        command+=("--json")
      fi
      ;;
    reconcile)
      ;;
    *)
      echo "Unsupported action: ${ACTION}" >&2
      exit 1
      ;;
  esac

  if [ -n "${PROJECTS}" ]; then
    command+=("--project=${PROJECTS}")
  fi

  for arg in "${EXTRA_ARGS[@]}"; do
    command+=("${arg}")
  done

  CLOUDFLARE_API_TOKEN="${token}" "${command[@]}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --action)
      ACTION="${2:-}"
      shift 2
      ;;
    --project)
      PROJECTS="${2:-}"
      shift 2
      ;;
    --open-token-page)
      OPEN_TOKEN_PAGE=true
      shift
      ;;
    --tmux)
      USE_TMUX=true
      shift
      ;;
    --session)
      TMUX_SESSION="${2:-}"
      shift 2
      ;;
    --token-file)
      TOKEN_FILE="${2:-}"
      shift 2
      ;;
    --quiet-verify)
      PRINT_VERIFY_RESPONSE=false
      shift
      ;;
    --no-json)
      JSON_OUTPUT=false
      shift
      ;;
    --dry-run)
      EXTRA_ARGS+=("--dry-run")
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ "${USE_TMUX}" = true ] && [ -z "${TMUX:-}" ]; then
  launch_tmux
fi

if [ "${OPEN_TOKEN_PAGE}" = true ]; then
  open_token_page
fi

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  token="${CLOUDFLARE_API_TOKEN}"
elif token="$(load_token_from_file)"; then
  echo "Loaded Cloudflare token from ${TOKEN_FILE}"
else
  read -r -s -p "Cloudflare API token: " token
  echo
fi

if [ -z "${token}" ]; then
  echo "Missing Cloudflare API token" >&2
  exit 1
fi

verify_response="$(verify_token "${token}")"
if [ "${PRINT_VERIFY_RESPONSE}" = true ]; then
  echo "Token verification response:"
  echo "${verify_response}"
  echo
fi

echo "Running Cloudflare DNS ${ACTION}..."
run_action "${token}"
