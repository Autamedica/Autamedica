#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
CDP_HOST="${CDP_HOST:-127.0.0.1}"
CDP_PORT="${CDP_PORT:-9222}"
CDP_URL="http://${CDP_HOST}:${CDP_PORT}"
PROFILE_DIR="${PROFILE_DIR:-/home/edu/.patchright-profile}"
START_URL="${START_URL:-https://dash.cloudflare.com}"
CHROME_BIN="${CHROME_BIN:-}"
BROWSER_MODE="${BROWSER_MODE:-headed}"
START_TIMEOUT_SECONDS="${START_TIMEOUT_SECONDS:-20}"
LOG_FILE="${LOG_FILE:-/tmp/autamedica-browser-cdp.log}"
PID_FILE="${PID_FILE:-/tmp/autamedica-browser-cdp.pid}"

usage() {
  cat <<EOF
Usage: $0 {start|stop|restart|status|tabs|ws}

Environment:
  CDP_HOST               Default: 127.0.0.1
  CDP_PORT               Default: 9222
  PROFILE_DIR            Default: /home/edu/.patchright-profile
  START_URL              Default: https://dash.cloudflare.com
  CHROME_BIN             Default: auto-detect google-chrome/chromium
  BROWSER_MODE           headed | headless | auto (default: headed)
  START_TIMEOUT_SECONDS  Default: 20
EOF
}

cdp_up() {
  curl -fsS --max-time 1 "${CDP_URL}/json/version" >/dev/null 2>&1
}

fetch_endpoint() {
  local endpoint="$1"
  curl -fsS --max-time 2 "${CDP_URL}${endpoint}"
}

json_field() {
  local field="$1"
  node -e 'let s=""; const field = process.argv[1]; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); const value = j[field]; if (value !== undefined && value !== null) console.log(value); });' "$field"
}

json_array_length() {
  node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(Array.isArray(j) ? j.length : 0); });'
}

display_available() {
  [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]
}

resolve_browser_mode() {
  case "${BROWSER_MODE}" in
    headed|headless)
      echo "${BROWSER_MODE}"
      ;;
    auto)
      if display_available; then
        echo "headed"
      else
        echo "headless"
      fi
      ;;
    *)
      echo "Unsupported BROWSER_MODE: ${BROWSER_MODE}" >&2
      return 1
      ;;
  esac
}

resolve_chrome_bin() {
  if [ -n "${CHROME_BIN}" ]; then
    if [ -x "${CHROME_BIN}" ] || command -v "${CHROME_BIN}" >/dev/null 2>&1; then
      echo "${CHROME_BIN}"
      return 0
    fi
    echo "Chrome binary not found: ${CHROME_BIN}" >&2
    return 1
  fi

  local candidate
  for candidate in google-chrome /opt/google/chrome/chrome chromium chromium-browser; do
    if [ -x "${candidate}" ] || command -v "${candidate}" >/dev/null 2>&1; then
      echo "${candidate}"
      return 0
    fi
  done

  echo "No supported Chrome/Chromium binary found" >&2
  return 1
}

pid_from_file() {
  if [ -f "${PID_FILE}" ]; then
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      echo "${pid}"
      return 0
    fi
  fi
  return 1
}

pid_from_port() {
  ss -ltnp "sport = :${CDP_PORT}" 2>/dev/null \
    | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
    | head -n 1
}

cleanup_pid_file() {
  if [ -f "${PID_FILE}" ] && ! pid_from_file >/dev/null 2>&1; then
    rm -f "${PID_FILE}"
  fi
}

print_status() {
  cleanup_pid_file

  if ! cdp_up; then
    echo "CDP_DOWN ${CDP_URL}"
    return 1
  fi

  local version_json
  version_json="$(fetch_endpoint '/json/version')"
  local tabs_json
  tabs_json="$(fetch_endpoint '/json/list')"
  local browser
  browser="$(echo "${version_json}" | json_field Browser)"
  local ws
  ws="$(echo "${version_json}" | json_field webSocketDebuggerUrl)"
  local tab_count
  tab_count="$(echo "${tabs_json}" | json_array_length)"
  local pid
  pid="$(pid_from_port || true)"

  echo "CDP_UP ${CDP_URL}"
  echo "BROWSER ${browser:-unknown}"
  echo "TABS ${tab_count}"
  echo "PID ${pid:-unknown}"
  echo "PROFILE ${PROFILE_DIR}"
  echo "WS ${ws}"
}

print_ws() {
  if ! cdp_up; then
    echo "CDP_DOWN ${CDP_URL}"
    return 1
  fi

  fetch_endpoint '/json/version' | json_field webSocketDebuggerUrl
}

start_browser() {
  cleanup_pid_file

  if cdp_up; then
    echo "CDP already available at ${CDP_URL}"
    print_status
    return 0
  fi

  local mode
  mode="$(resolve_browser_mode)"
  local chrome_bin
  chrome_bin="$(resolve_chrome_bin)"

  if [ "${mode}" = "headed" ] && ! display_available; then
    echo "No graphical session detected for headed mode." >&2
    echo "Set BROWSER_MODE=headless or BROWSER_MODE=auto for server environments." >&2
    return 1
  fi

  mkdir -p "${PROFILE_DIR}"

  local chrome_args=(
    --remote-debugging-address="${CDP_HOST}"
    --remote-debugging-port="${CDP_PORT}"
    --user-data-dir="${PROFILE_DIR}"
    --no-first-run
    --no-default-browser-check
  )

  if [ "${mode}" = "headless" ]; then
    chrome_args+=(
      --headless=new
      --disable-gpu
      --no-sandbox
    )
  fi

  if command -v setsid >/dev/null 2>&1; then
    nohup setsid "${chrome_bin}" \
      "${chrome_args[@]}" \
      "${START_URL}" \
      >"${LOG_FILE}" 2>&1 < /dev/null &
  else
    nohup "${chrome_bin}" \
      "${chrome_args[@]}" \
      "${START_URL}" \
      >"${LOG_FILE}" 2>&1 < /dev/null &
  fi

  local chrome_pid=$!
  echo "${chrome_pid}" > "${PID_FILE}"

  local checks=$(( START_TIMEOUT_SECONDS * 4 ))
  for _ in $(seq 1 "${checks}"); do
    if cdp_up; then
      sleep 1
      if cdp_up && kill -0 "${chrome_pid}" 2>/dev/null; then
        echo "Chrome CDP started (pid=${chrome_pid}, mode=${mode})"
        print_status
        return 0
      fi
      break
    fi

    if ! kill -0 "${chrome_pid}" 2>/dev/null; then
      break
    fi

    sleep 0.25
  done

  echo "Failed to start Chrome CDP at ${CDP_URL}. Check ${LOG_FILE}." >&2
  return 1
}

stop_pid() {
  local pid="$1"
  if [ -z "${pid}" ] || ! kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi

  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      return 0
    fi
    sleep 0.25
  done

  kill -9 "${pid}" 2>/dev/null || true
}

stop_browser() {
  cleanup_pid_file

  local file_pid=""
  local port_pid=""
  file_pid="$(pid_from_file || true)"
  port_pid="$(pid_from_port || true)"

  if [ -z "${file_pid}" ] && [ -z "${port_pid}" ] && ! cdp_up; then
    echo "CDP already down at ${CDP_URL}"
    return 0
  fi

  if [ -n "${file_pid}" ]; then
    stop_pid "${file_pid}"
  fi

  if [ -n "${port_pid}" ] && [ "${port_pid}" != "${file_pid}" ]; then
    stop_pid "${port_pid}"
  fi

  rm -f "${PID_FILE}"

  if cdp_up; then
    echo "Failed to stop Chrome CDP at ${CDP_URL}" >&2
    return 1
  fi

  echo "Chrome CDP stopped at ${CDP_URL}"
}

restart_browser() {
  stop_browser || true
  start_browser
}

list_tabs() {
  if ! cdp_up; then
    echo "CDP_DOWN ${CDP_URL}"
    return 1
  fi

  fetch_endpoint '/json/list' | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); j.forEach((t, i) => console.log(String(i).padStart(2, "0") + " | " + (t.type || "") + " | " + (t.title || "").slice(0, 80) + " | " + (t.url || ""))); });'
}

case "${ACTION}" in
  start)
    start_browser
    ;;
  stop)
    stop_browser
    ;;
  restart)
    restart_browser
    ;;
  status)
    print_status
    ;;
  tabs)
    list_tabs
    ;;
  ws)
    print_ws
    ;;
  *)
    usage
    exit 1
    ;;
esac
