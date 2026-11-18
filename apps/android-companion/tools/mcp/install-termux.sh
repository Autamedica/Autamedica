#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.local/share/autamedica-android"
CODEX_DIR="$HOME/.codex"
CONFIG="$CODEX_DIR/config.toml"
mkdir -p "$TARGET" "$CODEX_DIR"
chmod 700 "$TARGET" "$CODEX_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf 'Instalando Node.js y npm en Termux...\n'
  pkg install -y nodejs
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  printf 'Playwright Core requiere Node.js 22 o superior. Versión actual: %s\n' "$(node --version)" >&2
  printf 'Actualizá Node.js en Termux y volvé a ejecutar este instalador.\n' >&2
  exit 1
fi

cp "$SCRIPT_DIR/mcp-server.mjs" "$TARGET/mcp-server.mjs"
cp "$SCRIPT_DIR/package.json" "$TARGET/package.json"
chmod 600 "$TARGET/mcp-server.mjs" "$TARGET/package.json"

printf 'Instalando Playwright Core 1.65.1 (solo cliente CDP; Chromium lo aporta Android WebView)...\n'
npm install --prefix "$TARGET" --omit=optional --no-audit --no-fund
chmod -R go-rwx "$TARGET"

printf 'Pegá el token de 256 bits que muestra Autamedica Android Companion: '
IFS= read -r -s TOKEN
printf '\n'
if [ "\${#TOKEN}" -lt 64 ]; then
  printf 'Token inválido.\n' >&2
  exit 1
fi

python - "$CONFIG" "$TARGET/mcp-server.mjs" "$TOKEN" <<'PY'
import json, pathlib, re, sys
config = pathlib.Path(sys.argv[1])
script = sys.argv[2]
token = sys.argv[3]
old = config.read_text() if config.exists() else ""
pattern = re.compile(r"(?ms)^\[mcp_servers\.autamedica_android\]\s*.*?(?=^\[|\Z)")
old = pattern.sub("", old).rstrip()
block = (
    "\n\n[mcp_servers.autamedica_android]\n"
    "command = \"node\"\n"
    f"args = [{json.dumps(script)}]\n"
    f"env = {{ AUTAMEDICA_ANDROID_TOKEN = {json.dumps(token)}, AUTAMEDICA_ANDROID_URL = \"http://127.0.0.1:18765\", AUTAMEDICA_CDP_URL = \"http://127.0.0.1:18766\" }}\n"
)
config.write_text(old + block)
config.chmod(0o600)
PY

printf 'MCP + Playwright Core instalados y configurados en Codex.\n'
printf 'Verificá con: codex mcp list\n'
printf 'Abrí una página con browser_navigate; el perfil web permanece en el almacenamiento privado de Android.\n'
