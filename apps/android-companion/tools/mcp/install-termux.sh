#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.local/share/autamedica-android"
CODEX_DIR="$HOME/.codex"
CONFIG="$CODEX_DIR/config.toml"
mkdir -p "$TARGET" "$CODEX_DIR"
chmod 700 "$TARGET" "$CODEX_DIR"
cp "$SCRIPT_DIR/mcp-server.mjs" "$TARGET/mcp-server.mjs"
chmod 600 "$TARGET/mcp-server.mjs"

if ! command -v node >/dev/null 2>&1; then
  printf 'Instalando Node.js en Termux...\n'
  pkg install -y nodejs
fi

printf 'Pegá el token que muestra Autamedica Android Companion: '
IFS= read -r -s TOKEN
printf '\n'
if [ "${#TOKEN}" -lt 64 ]; then
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
    f"env = {{ AUTAMEDICA_ANDROID_TOKEN = {json.dumps(token)}, AUTAMEDICA_ANDROID_URL = \"http://127.0.0.1:18765\" }}\n"
)
config.write_text(old + block)
config.chmod(0o600)
PY

printf 'MCP instalado y configurado en Codex.\n'
printf 'Comprobá con: codex mcp list\n'
