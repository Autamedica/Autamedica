#!/usr/bin/env bash
set -euo pipefail

# Run this script INSIDE the Debian proot where Codex CLI runs.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.local/share/autamedica-android"
CODEX_DIR="$HOME/.codex"
CONFIG="$CODEX_DIR/config.toml"
mkdir -p "$TARGET" "$CODEX_DIR"
chmod 700 "$TARGET" "$CODEX_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    printf 'Node.js/npm no están disponibles y no se encontró apt-get para instalarlos.\n' >&2
    exit 1
  fi
  if [ "$(id -u)" -ne 0 ]; then
    printf 'Ejecutá el instalador como root dentro de Debian proot.\n' >&2
    exit 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl nodejs npm
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  printf 'Actualizando Node.js a la rama 22 LTS para Playwright Core...\n'
  npm install --global node@22
  NODE_BIN="$(npm root -g)/node_modules/node/bin"
  export PATH="$NODE_BIN:$PATH"
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  printf 'No se pudo preparar Node.js 22+. Versión: %s\n' "$(node --version)" >&2
  exit 1
fi

cp "$SCRIPT_DIR/mcp-server.mjs" "$TARGET/mcp-server.mjs"
cp "$SCRIPT_DIR/package.json" "$TARGET/package.json"
chmod 600 "$TARGET/mcp-server.mjs" "$TARGET/package.json"

printf 'Instalando Playwright Core 1.65.1 (cliente CDP; Chromium lo aporta Android WebView)...\n'
npm install --prefix "$TARGET" --omit=optional --no-audit --no-fund
chmod -R go-rwx "$TARGET"

printf 'Pegá el token de 256 bits que muestra Autamedica Companion: '
IFS= read -r -s TOKEN
printf '\n'
if [ "\${#TOKEN}" -lt 64 ]; then
  printf 'Token inválido.\n' >&2
  exit 1
fi

umask 077
printf '%s' "$TOKEN" > "$TARGET/bridge.token"
cat > "$TARGET/launch-mcp.sh" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
export AUTAMEDICA_ANDROID_TOKEN="$(cat "$BASE/bridge.token")"
export AUTAMEDICA_ANDROID_URL="http://127.0.0.1:18765"
export AUTAMEDICA_CDP_URL="http://127.0.0.1:18766"
exec node "$BASE/mcp-server.mjs"
LAUNCHER
chmod 700 "$TARGET/launch-mcp.sh" "$TARGET/bridge.token"

python3 - "$CONFIG" "$TARGET/launch-mcp.sh" <<'PY'
import json, pathlib, re, sys
config = pathlib.Path(sys.argv[1])
launcher = sys.argv[2]
old = config.read_text() if config.exists() else ""
pattern = re.compile(r"(?ms)^\[mcp_servers\.autamedica_android\]\s*.*?(?=^\[|\Z)")
old = pattern.sub("", old).rstrip()
block = (
    "\n\n[mcp_servers.autamedica_android]\n"
    f"command = {json.dumps(launcher)}\n"
    "args = []\n"
)
config.write_text(old + block)
config.chmod(0o600)
PY

printf 'MCP + Playwright Core instalados en Debian y configurados en Codex.\n'
printf 'Verificá con: codex mcp list\n'
printf 'El token sigue cifrado en Autamedica Companion y su copia local tiene permisos 600.\n'
