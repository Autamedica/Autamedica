#!/usr/bin/env bash

set -euo pipefail

PACKAGE_NAME="antigravity"
RUN_APT_UPDATE=1

for arg in "$@"; do
  case "$arg" in
    --no-update)
      RUN_APT_UPDATE=0
      ;;
    -h|--help)
      cat <<'EOF'
Uso:
  bash scripts/reinstall-antigravity.sh [--no-update]

Opciones:
  --no-update   Salta `apt-get update` antes de reinstalar el paquete.
EOF
      exit 0
      ;;
    *)
      echo "Argumento no soportado: $arg" >&2
      exit 1
      ;;
  esac
done

if ! command -v apt-get >/dev/null 2>&1; then
  echo "❌ Este script requiere apt-get (Debian/Ubuntu)." >&2
  exit 1
fi

if ! command -v dpkg-query >/dev/null 2>&1; then
  echo "❌ Este script requiere dpkg-query." >&2
  exit 1
fi

if [[ "${EUID}" -eq 0 ]]; then
  APT_PREFIX=()
else
  if ! command -v sudo >/dev/null 2>&1; then
    echo "❌ Necesitás ejecutar este script como root o tener sudo disponible." >&2
    exit 1
  fi
  APT_PREFIX=(sudo)
fi

is_installed() {
  local status
  status="$(dpkg-query -W -f='${Status}' "${PACKAGE_NAME}" 2>/dev/null || true)"
  [[ "${status}" == "install ok installed" ]]
}

echo "🔎 Verificando estado actual de ${PACKAGE_NAME}..."
if is_installed; then
  echo "📦 ${PACKAGE_NAME} está instalado. Ejecutando purge..."
  "${APT_PREFIX[@]}" apt-get remove --purge -y "${PACKAGE_NAME}"
  "${APT_PREFIX[@]}" apt-get autoremove -y
else
  echo "ℹ️ ${PACKAGE_NAME} no estaba instalado. Continúo con la instalación limpia."
fi

if [[ "${RUN_APT_UPDATE}" -eq 1 ]]; then
  echo "🔄 Actualizando índices de paquetes..."
  "${APT_PREFIX[@]}" apt-get update
fi

echo "⬇️ Instalando ${PACKAGE_NAME}..."
"${APT_PREFIX[@]}" apt-get install -y "${PACKAGE_NAME}"

echo "✅ Verificando reinstalación..."
if ! is_installed; then
  echo "❌ ${PACKAGE_NAME} no quedó instalado correctamente." >&2
  exit 1
fi

if ! command -v "${PACKAGE_NAME}" >/dev/null 2>&1; then
  echo "❌ El binario ${PACKAGE_NAME} no quedó disponible en PATH." >&2
  exit 1
fi

echo "🎉 ${PACKAGE_NAME} reinstalado correctamente."
echo "📍 Binario: $(command -v "${PACKAGE_NAME}")"
