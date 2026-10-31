#!/usr/bin/env bash
# Prepare or enable OpenClaw's bundled MCP Relay on the existing Gateway host.
# This script does not create, print, or transmit pairing codes or credentials.
set -Eeuo pipefail

usage() {
  cat <<'HELP'
Usage: bash scripts/setup-openclaw-chatgpt-relay.sh [--check | --enable]

  --check    Inspect local OpenClaw/Gateway/MCP Relay status (default).
  --enable   Enable the official outbound MCP Relay plugin and check its status.

Run this on the Oracle VM as the same OS user who owns the OpenClaw Gateway.
The CLI operates on local Gateway state; GitHub Actions cannot provision this
Gateway without a separately configured, approved secure remote-access channel.

Official documentation: https://docs.openclaw.ai/plugins/mcp-relay
ChatGPT MCP endpoint: https://mcp.openclaw.ai/mcp
HELP
}

mode="${1:---check}"
case "$mode" in
  --check|--enable) ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

if ! command -v openclaw >/dev/null 2>&1; then
  echo 'ERROR: openclaw CLI not found in PATH. Run on the actual Gateway host.' >&2
  exit 1
fi

printf '\n[1/3] OpenClaw version\n'
openclaw --version

printf '\n[2/3] Existing Gateway status\n'
# A stopped Gateway should not be started/restarted implicitly in production.
if ! openclaw gateway status; then
  echo 'WARNING: Gateway status check failed. Confirm the systemd/tmux service and host user before proceeding.' >&2
  if [[ "$mode" == '--enable' ]]; then
    echo 'Refusing to modify the plugin while the Gateway is unverified.' >&2
    exit 1
  fi
fi

if [[ "$mode" == '--enable' ]]; then
  printf '\n[3/3] Enabling bundled MCP Relay (outbound connection)\n'
  openclaw plugins enable mcp-relay
else
  printf '\n[3/3] Current MCP Relay status (read-only)\n'
fi

if ! openclaw mcp-relay status; then
  echo 'MCP Relay status failed. A current OpenClaw release may be required, or the Gateway may need an explicit reload/restart.' >&2
  exit 1
fi

cat <<'NEXT'

Next step (requires a ChatGPT plan/workspace that supports custom MCP plugins):
1. On ChatGPT web, add the HTTPS MCP server https://mcp.openclaw.ai/mcp.
2. Authorize using your Gateway Control UI > Connected apps > Pair with code.
3. Select read-only access first; do not paste codes/tokens in GitHub or chat.
4. Validate the connection from ChatGPT; grant write only after review.

ChatGPT Plus does not currently support custom MCP plugin creation.
This script does NOT complete pairing and does NOT expose port 18789 publicly.
The hosted relay can inspect data in transit (TLS, not end-to-end encrypted).
Do not grant access to clinical/patient information without a privacy review.
NEXT
