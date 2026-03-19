#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/edu/Autamedica"
MCP_DIR="/home/edu/autorenta/tools/patchright-streaming-mcp"
NODE_BIN="/home/edu/.config/nvm/versions/node/v20.20.0/bin/node"
CDP_SCRIPT="${ROOT_DIR}/scripts/cloudflare/browser-cdp-session.sh"

export DISPLAY="${DISPLAY:-:0}"
export MONITOR_PORT="${MONITOR_PORT:-0}"
export BROWSER_PROFILE="${BROWSER_PROFILE:-/home/edu/.patchright-profile}"
export BROWSER_CDP_URL="${BROWSER_CDP_URL:-http://127.0.0.1:9222}"
export PATCHRIGHT_MCP_DEBUG_LOG="${PATCHRIGHT_MCP_DEBUG_LOG:-/tmp/patchright-mcp-debug.log}"

if ! curl -fsS --max-time 1 "${BROWSER_CDP_URL}/json/version" >/dev/null 2>&1; then
  BROWSER_MODE="${BROWSER_MODE:-auto}" "${CDP_SCRIPT}" start >/tmp/patchright-cdp-start.log 2>&1
fi

exec "${NODE_BIN}" "${MCP_DIR}/server.js"
