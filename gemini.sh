#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$SCRIPT_DIR")"
SESSION_NAME="autamedica-gemini"
export PATH="$HOME/.local/bin:$PATH"
USE_TMUX=0

usage() {
  cat <<'USAGE'
AutaMedica Gemini CLI launcher

Usage:
  bash gemini.sh [--tmux] [Gemini CLI arguments...]

Options:
  --tmux   Open or attach the independent autamedica-gemini tmux session.
  -h       Show this help.

The launcher uses the current repository as Gemini's working directory.
The Android Companion MCP is configured separately by:
  bash apps/android-companion/tools/gemini/install-gemini-companion.sh
USAGE
}

ARGS=()
while (($#)); do
  case "$1" in
    --tmux)
      USE_TMUX=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      ARGS+=("$@")
      break
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if ! command -v gemini >/dev/null 2>&1; then
  printf 'Gemini CLI no está instalado. Ejecutá primero:\n' >&2
  printf '  bash apps/android-companion/tools/gemini/install-gemini-companion.sh\n' >&2
  exit 127
fi

if [[ ! -f "$HOME/.gemini/settings.json" ]]; then
  printf 'Gemini CLI no tiene configuración global. Ejecutá el instalador de Gemini Companion.\n' >&2
  exit 2
fi

cd "$REPO_ROOT"

if ((USE_TMUX)); then
  if ! command -v tmux >/dev/null 2>&1; then
    printf 'tmux no está instalado; ejecutando Gemini en esta terminal.\n' >&2
    exec gemini "${ARGS[@]}"
  fi

  exec tmux new-session -A -s "$SESSION_NAME" -c "$REPO_ROOT" gemini "${ARGS[@]}"
fi

exec gemini "${ARGS[@]}"
