#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CRON_SCRIPT="${PROJECT_ROOT}/scripts/cloudflare/cloudflare-dns-cron.sh"
MARKER="AUTAMEDICA_CLOUDFLARE_DNS_AUDIT"
DEFAULT_SCHEDULE="17 * * * *"
ACTION="install"
SCHEDULE="${CRON_SCHEDULE:-${DEFAULT_SCHEDULE}}"

usage() {
  cat <<EOF
Usage: $0 [--install] [--uninstall] [--show] [--schedule "17 * * * *"]
EOF
}

strip_managed_block() {
  awk -v marker="${MARKER}" '
    $0 == "# " marker " BEGIN" { skip=1; next }
    $0 == "# " marker " END"   { skip=0; next }
    skip != 1 { print }
  '
}

current_crontab() {
  crontab -l 2>/dev/null || true
}

install_cron() {
  local existing cleaned tmpfile
  existing="$(current_crontab)"
  cleaned="$(printf '%s\n' "${existing}" | strip_managed_block)"
  tmpfile="$(mktemp)"

  {
    printf '%s\n' "${cleaned}" | sed '/^[[:space:]]*$/N;/^\n$/D'
    printf '%s\n' "# ${MARKER} BEGIN"
    printf '%s /usr/bin/bash %q\n' "${SCHEDULE}" "${CRON_SCRIPT}"
    printf '%s\n' "# ${MARKER} END"
  } > "${tmpfile}"

  crontab "${tmpfile}"
  rm -f "${tmpfile}"
  echo "Installed cron entry:"
  show_cron
}

uninstall_cron() {
  local existing cleaned tmpfile
  existing="$(current_crontab)"
  cleaned="$(printf '%s\n' "${existing}" | strip_managed_block)"
  tmpfile="$(mktemp)"
  printf '%s\n' "${cleaned}" > "${tmpfile}"
  crontab "${tmpfile}"
  rm -f "${tmpfile}"
  echo "Removed managed cron entry"
}

show_cron() {
  current_crontab | awk -v marker="${MARKER}" '
    $0 == "# " marker " BEGIN" { show=1 }
    show == 1 { print }
    $0 == "# " marker " END" { show=0 }
  '
}

while [ $# -gt 0 ]; do
  case "$1" in
    --install)
      ACTION="install"
      shift
      ;;
    --uninstall)
      ACTION="uninstall"
      shift
      ;;
    --show)
      ACTION="show"
      shift
      ;;
    --schedule)
      SCHEDULE="${2:-}"
      shift 2
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

case "${ACTION}" in
  install)
    install_cron
    ;;
  uninstall)
    uninstall_cron
    ;;
  show)
    show_cron
    ;;
  *)
    echo "Unsupported action: ${ACTION}" >&2
    exit 1
    ;;
esac
