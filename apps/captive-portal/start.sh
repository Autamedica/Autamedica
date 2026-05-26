#!/usr/bin/env bash
# ============================================================================
# AutaMedica Captive Portal — Start Script
# ============================================================================
# Levanta el portal HTTP + dnsmasq en un solo comando.
#
# Requisitos:
#   - dnsmasq instalado
#   - Puerto 53 libre en la interfaz wlp1s0
#   - Puerto 8888 libre
#   - systemd-resolved no bloqueando el puerto 53 en 192.168.0.2
#
# Uso:
#   sudo bash start.sh          # Iniciar
#   sudo bash start.sh stop     # Detener
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORTAL_PORT="${PORTAL_PORT:-8888}"
DNS_CONF="${SCRIPT_DIR}/dnsmasq-portal.conf"
PID_DIR="${SCRIPT_DIR}/.pids"
DNSMASQ_PID="${PID_DIR}/dnsmasq.pid"
PORTAL_PID="${PID_DIR}/portal.pid"

mkdir -p "${PID_DIR}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

stop_services() {
  echo -e "${YELLOW}🛑 Deteniendo servicios del Captive Portal...${NC}"
  
  if [ -f "$DNSMASQ_PID" ]; then
    kill "$(cat "$DNSMASQ_PID")" 2>/dev/null && echo "  ✅ dnsmasq detenido" || echo "  ⚠️  dnsmasq ya no estaba corriendo"
    rm -f "$DNSMASQ_PID"
  fi
  
  if [ -f "$PORTAL_PID" ]; then
    kill "$(cat "$PORTAL_PID")" 2>/dev/null && echo "  ✅ Portal HTTP detenido" || echo "  ⚠️  Portal ya no estaba corriendo"
    rm -f "$PORTAL_PID"
  fi

  # Re-enable systemd-resolved on this interface if it was disabled
  echo -e "${GREEN}✅ Captive Portal detenido.${NC}"
}

start_services() {
  echo -e "${GREEN}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  🏥 AutaMedica Captive Portal — Startup         ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"

  # Check if running as root (needed for port 53)
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Error: Este script necesita ejecutarse con sudo${NC}"
    echo "   Uso: sudo bash $0"
    exit 1
  fi

  # Stop any previous instance
  stop_services 2>/dev/null || true

  # --- Step 1: Free port 53 on 192.168.0.2 ---
  echo -e "\n${YELLOW}1/4 Liberando puerto DNS (53) en 192.168.0.2...${NC}"
  
  # systemd-resolved listens on 127.0.0.53:53 and 127.0.0.54:53, not on 192.168.0.2
  # So we should be fine. Let's verify:
  if ss -tlnp | grep -q '192.168.0.2:53'; then
    echo -e "${RED}  ⚠️  Puerto 53 ya en uso en 192.168.0.2. Intentando liberar...${NC}"
    # Kill whatever is on that port
    fuser -k 53/tcp 2>/dev/null || true
    fuser -k 53/udp 2>/dev/null || true
    sleep 1
  fi
  echo "  ✅ Puerto 53 disponible"

  # --- Step 2: Start dnsmasq ---
  echo -e "\n${YELLOW}2/4 Iniciando dnsmasq (interceptor DNS)...${NC}"
  dnsmasq -C "${DNS_CONF}" --pid-file="${DNSMASQ_PID}"
  echo "  ✅ dnsmasq corriendo (PID: $(cat "${DNSMASQ_PID}"))"

  # --- Step 3: Start Portal HTTP server ---
  echo -e "\n${YELLOW}3/4 Iniciando servidor del portal (puerto ${PORTAL_PORT})...${NC}"
  cd "${SCRIPT_DIR}"
  PORTAL_PORT="${PORTAL_PORT}" node server.mjs &
  PORTAL_NODE_PID=$!
  echo "${PORTAL_NODE_PID}" > "${PORTAL_PID}"
  echo "  ✅ Portal HTTP corriendo (PID: ${PORTAL_NODE_PID})"

  # --- Step 4: Configure iptables redirect ---
  echo -e "\n${YELLOW}4/4 Configurando redirección de tráfico HTTP...${NC}"
  
  # Redirect port 80 traffic (from WiFi clients) to our portal port
  # This catches HTTP requests that aren't DNS-intercepted
  iptables -t nat -D PREROUTING -i wlp1s0 -p tcp --dport 80 -j REDIRECT --to-port "${PORTAL_PORT}" 2>/dev/null || true
  iptables -t nat -A PREROUTING -i wlp1s0 -p tcp --dport 80 -j REDIRECT --to-port "${PORTAL_PORT}"
  echo "  ✅ Tráfico HTTP (puerto 80) redirigido a portal (puerto ${PORTAL_PORT})"

  echo -e "\n${GREEN}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  ✅ Captive Portal ACTIVO                       ║"
  echo "║                                                 ║"
  echo "║  📡 DNS: 192.168.0.2:53 (dnsmasq)              ║"
  echo "║  🌐 Portal: http://192.168.0.2:${PORTAL_PORT}/portal  ║"
  echo "║                                                 ║"
  echo "║  📋 PASO FINAL:                                 ║"
  echo "║  Configurá el DNS del router Sagemcom a:        ║"
  echo "║  → DNS Primario: 192.168.0.2                    ║"
  echo "║  → DNS Secundario: 1.1.1.1                     ║"
  echo "║                                                 ║"
  echo "║  🛑 Para detener: sudo bash start.sh stop       ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
  
  # Wait for the portal process
  wait "${PORTAL_NODE_PID}" 2>/dev/null || true
}

# Handle SIGINT/SIGTERM
trap stop_services EXIT INT TERM

# Main
case "${1:-start}" in
  start) start_services ;;
  stop)  stop_services ;;
  *)
    echo "Uso: sudo bash $0 [start|stop]"
    exit 1
    ;;
esac
