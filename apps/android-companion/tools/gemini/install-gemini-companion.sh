#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/../../.." && pwd)"
GEMINI_HOME="$HOME/.gemini"
SETTINGS="$GEMINI_HOME/settings.json"
BRIDGE="$HOME/.local/share/autamedica-android"
MCP_LAUNCHER="$BRIDGE/launch-mcp.sh"
TOKEN_FILE="$BRIDGE/bridge.token"

say() { printf '[AutaMedica Gemini] %s\n' "$*"; }
fail() { printf '[AutaMedica Gemini] ERROR: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js no está instalado."
command -v npm >/dev/null 2>&1 || fail "npm no está instalado."
command -v python3 >/dev/null 2>&1 || fail "Python 3 es necesario para actualizar settings.json sin perder otras configuraciones."

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 20 )) || fail "Gemini CLI requiere Node.js 20+. Versión detectada: $(node --version)."

if ! command -v gemini >/dev/null 2>&1; then
  say "Instalando Gemini CLI estable desde npm..."
  if npm install --global @google/gemini-cli; then
    :
  else
    say "El prefijo global no permite escritura; instalando en el prefijo privado del usuario."
    mkdir -p "$HOME/.local"
    npm install --global --prefix "$HOME/.local" @google/gemini-cli
    export PATH="$HOME/.local/bin:$PATH"
    PROFILE="$HOME/.profile"
    touch "$PROFILE"
    if ! grep -Fq '# AutaMedica Gemini CLI PATH' "$PROFILE"; then
      cat >> "$PROFILE" <<'PROFILE_BLOCK'

# AutaMedica Gemini CLI PATH
export PATH="$HOME/.local/bin:$PATH"
PROFILE_BLOCK
    fi
  fi
  hash -r
fi

command -v gemini >/dev/null 2>&1 || {
  export PATH="$(npm prefix -g)/bin:$HOME/.local/bin:$PATH"
  hash -r
}
command -v gemini >/dev/null 2>&1 || fail "Gemini CLI se instaló pero su ejecutable no está en PATH."

if [[ ! -x "$MCP_LAUNCHER" || ! -s "$TOKEN_FILE" ]]; then
  cat >&2 <<'MESSAGE'
El servidor AutaMedica Android Companion no está instalado en esta sesión Debian/Termux.

Instalá primero el puente oficial desde el repositorio:
  bash apps/android-companion/tools/mcp/install-termux.sh

Ese instalador solicita el token directamente en la terminal local. No pegues el token en el chat.
Luego volvé a ejecutar este instalador de Gemini.
MESSAGE
  exit 3
fi

mkdir -p "$GEMINI_HOME"
chmod 700 "$GEMINI_HOME"

python3 - "$SETTINGS" "$MCP_LAUNCHER" "$BRIDGE" <<'PY'
# -*- coding: utf-8 -*-
import json
import os
import pathlib
import shutil
import sys
from datetime import datetime, timezone

settings_path = pathlib.Path(sys.argv[1])
launcher = str(pathlib.Path(sys.argv[2]).resolve())
bridge_dir = str(pathlib.Path(sys.argv[3]).resolve())

settings_path.parent.mkdir(parents=True, exist_ok=True)
settings = {}
if settings_path.exists():
    try:
        loaded = json.loads(settings_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"No se pudo leer {settings_path}: {exc}. No se modificó el archivo.")
    if not isinstance(loaded, dict):
        raise SystemExit(f"{settings_path} debe contener un objeto JSON. No se modificó.")
    settings = loaded
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = settings_path.with_name(f"settings.json.bak-{stamp}")
    shutil.copy2(settings_path, backup)

servers = settings.setdefault("mcpServers", {})
if not isinstance(servers, dict):
    raise SystemExit("mcpServers existe pero no es un objeto JSON. No se modificó settings.json.")

# Reuse the exact Companion launcher and token already installed for Codex.
# trust=false keeps Gemini's tool-confirmation flow enabled.
servers["autamedica_android"] = {
    "command": launcher,
    "args": [],
    "cwd": bridge_dir,
    "timeout": 120000,
    "trust": False
}

global_mcp = settings.setdefault("mcp", {})
if not isinstance(global_mcp, dict):
    raise SystemExit("mcp existe pero no es un objeto JSON. No se modificó settings.json.")
allowed = global_mcp.get("allowed")
if isinstance(allowed, list) and "autamedica_android" not in allowed:
    allowed.append("autamedica_android")
excluded = global_mcp.get("excluded")
if isinstance(excluded, list) and "autamedica_android" in excluded:
    global_mcp["excluded"] = [item for item in excluded if item != "autamedica_android"]

tmp = settings_path.with_suffix(".json.tmp")
tmp.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
os.chmod(tmp, 0o600)
tmp.replace(settings_path)
os.chmod(settings_path, 0o600)
print("Gemini settings actualizado; configuración anterior preservada.")
PY

say "Gemini CLI: $(gemini --version)"
say "Companion MCP registrado como autamedica_android (STDIO)."
say "La configuración conserva otros servidores MCP y mantiene trust=false."
say "Comprobá la conexión con: gemini mcp list"
say "En el primer inicio, aprobá la confianza del directorio AutaMedica para habilitar la configuración MCP del proyecto."
say "Launcher: bash gemini.sh"
say "Sesión tmux independiente: bash gemini.sh --tmux"
