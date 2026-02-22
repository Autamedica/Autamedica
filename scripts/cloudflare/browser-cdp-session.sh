#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
CDP_HOST="${CDP_HOST:-127.0.0.1}"
CDP_PORT="${CDP_PORT:-9222}"
CDP_URL="http://${CDP_HOST}:${CDP_PORT}"
PROFILE_DIR="${PROFILE_DIR:-/home/edu/.patchright-profile}"
START_URL="${START_URL:-https://dash.cloudflare.com}"
CHROME_BIN="${CHROME_BIN:-google-chrome}"
LOG_FILE="${LOG_FILE:-/tmp/autamedica-browser-cdp.log}"
PID_FILE="${PID_FILE:-/tmp/autamedica-browser-cdp.pid}"

cdp_up() {
  curl -fsS --max-time 1 "${CDP_URL}/json/version" >/dev/null 2>&1
}

print_status() {
  if ! cdp_up; then
    echo "CDP_DOWN ${CDP_URL}"
    return 1
  fi

  local version_json
  version_json="$(curl -fsS --max-time 2 "${CDP_URL}/json/version")"
  local tabs_json
  tabs_json="$(curl -fsS --max-time 2 "${CDP_URL}/json/list")"

  local browser
  browser="$(echo "$version_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.Browser||'unknown')})")"
  local ws
  ws="$(echo "$version_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(j.webSocketDebuggerUrl||'')})")"
  local tab_count
  tab_count="$(echo "$tabs_json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);console.log(Array.isArray(j)?j.length:0)})")"

  echo "CDP_UP ${CDP_URL}"
  echo "BROWSER ${browser}"
  echo "TABS ${tab_count}"
  echo "WS ${ws}"
}

start_browser() {
  if cdp_up; then
    echo "CDP already available at ${CDP_URL}"
    print_status
    return 0
  fi

  mkdir -p "${PROFILE_DIR}"

  nohup "${CHROME_BIN}" \
    --remote-debugging-address="${CDP_HOST}" \
    --remote-debugging-port="${CDP_PORT}" \
    --user-data-dir="${PROFILE_DIR}" \
    --no-first-run \
    --no-default-browser-check \
    "${START_URL}" \
    >"${LOG_FILE}" 2>&1 &

  local chrome_pid=$!
  echo "${chrome_pid}" > "${PID_FILE}"

  for _ in $(seq 1 80); do
    if cdp_up; then
      echo "Chrome CDP started (pid=${chrome_pid})"
      print_status
      return 0
    fi
    sleep 0.25
  done

  echo "Failed to start Chrome CDP at ${CDP_URL}. Check ${LOG_FILE}."
  return 1
}

list_tabs() {
  if ! cdp_up; then
    echo "CDP_DOWN ${CDP_URL}"
    return 1
  fi

  curl -fsS --max-time 2 "${CDP_URL}/json/list" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);j.forEach((t,i)=>console.log(String(i).padStart(2,'0')+' | '+(t.type||'')+' | '+(t.title||'').slice(0,80)+' | '+(t.url||'')))})"
}

case "${ACTION}" in
  start)
    start_browser
    ;;
  status)
    print_status
    ;;
  tabs)
    list_tabs
    ;;
  *)
    echo "Usage: $0 {start|status|tabs}"
    exit 1
    ;;
esac
