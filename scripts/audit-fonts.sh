#!/bin/bash
# AutaMedica Font Audit Script
# Detecta fuentes hardcodeadas que deberían usar el sistema tipográfico de Tailwind.
#
# Sistema actual:
#   font-sans  = Plus Jakarta Sans (body, UI)
#   font-heading = Source Serif 4 (headlines)
#
# Uso: bash scripts/audit-fonts.sh

set +e

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${BOLD}${CYAN}AutaMedica — Font Audit${NC}"
echo "========================================"
echo ""

ERRORS=0
WARNINGS=0

# --- 1. Legacy @font-face declarations ---
echo -e "${BOLD}1. @font-face declarations (legacy fonts loaded)${NC}"
FACES=$(grep -rn "@font-face" apps/web/src/ --include="*.css" --include="*.astro" 2>/dev/null || true)
if [ -n "$FACES" ]; then
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    LINE=$(echo "$line" | cut -d: -f2)
    # Check if it's loading old fonts
    CONTEXT=$(sed -n "$((LINE)),$(( LINE + 5 ))p" "$FILE" 2>/dev/null || true)
    if echo "$CONTEXT" | grep -qi "Geist\|DM Sans"; then
      echo -e "  ${RED}REMOVE${NC} $FILE:$LINE — Legacy font-face (Geist/DM Sans)"
      ((ERRORS++))
    fi
  done <<< "$FACES"
else
  echo -e "  ${GREEN}OK${NC} — No legacy @font-face found"
fi
echo ""

# --- 2. CSS custom properties with old fonts ---
echo -e "${BOLD}2. CSS variables with hardcoded font stacks${NC}"
CSS_VARS=$(grep -rn "\-\-font-sans\|--font-heading\|--font-body" apps/web/src/ --include="*.css" 2>/dev/null || true)
if [ -n "$CSS_VARS" ]; then
  while IFS= read -r line; do
    if echo "$line" | grep -qi "Geist\|DM Sans"; then
      echo -e "  ${RED}UPDATE${NC} $line"
      ((ERRORS++))
    elif echo "$line" | grep -qi "Jakarta\|Source Serif"; then
      echo -e "  ${GREEN}OK${NC} $line"
    else
      echo -e "  ${YELLOW}CHECK${NC} $line"
      ((WARNINGS++))
    fi
  done <<< "$CSS_VARS"
else
  echo -e "  ${GREEN}OK${NC} — No CSS font vars found"
fi
echo ""

# --- 3. Inline font-family in components ---
echo -e "${BOLD}3. Inline fontFamily / font-family in components${NC}"
INLINE=$(grep -rn "fontFamily\|font-family" \
  apps/web/src/ packages/shared/src/ \
  --include="*.tsx" --include="*.ts" --include="*.astro" \
  2>/dev/null | grep -v node_modules | grep -v "tailwind-config" | grep -v font-demo | grep -v "\.d\.ts" || true)
if [ -n "$INLINE" ]; then
  while IFS= read -r line; do
    if echo "$line" | grep -qi "inherit\|var("; then
      echo -e "  ${GREEN}OK${NC} $(echo "$line" | cut -c1-120)"
    else
      echo -e "  ${RED}REPLACE${NC} $(echo "$line" | cut -c1-120)"
      ((ERRORS++))
    fi
  done <<< "$INLINE"
else
  echo -e "  ${GREEN}OK${NC} — No inline font-family found"
fi
echo ""

# --- 4. Font preload tags for old fonts ---
echo -e "${BOLD}4. Font preload/link tags${NC}"
PRELOADS=$(grep -rn "preload.*font\|fonts/Geist\|fonts/Inter\|fonts/DM" apps/web/src/ --include="*.astro" 2>/dev/null || true)
if [ -n "$PRELOADS" ]; then
  while IFS= read -r line; do
    echo -e "  ${RED}REMOVE${NC} $(echo "$line" | cut -c1-120)"
    ((ERRORS++))
  done <<< "$PRELOADS"
else
  echo -e "  ${GREEN}OK${NC} — No legacy font preloads"
fi
echo ""

# --- 5. packages/ui typography tokens ---
echo -e "${BOLD}5. packages/ui typography tokens${NC}"
UI_FONTS=$(grep -rn "Geist\|DM Sans" packages/ui/src/ --include="*.ts" 2>/dev/null || true)
if [ -n "$UI_FONTS" ]; then
  while IFS= read -r line; do
    echo -e "  ${RED}UPDATE${NC} $(echo "$line" | cut -c1-120)"
    ((ERRORS++))
  done <<< "$UI_FONTS"
else
  echo -e "  ${GREEN}OK${NC} — UI tokens use correct fonts"
fi
echo ""

# --- 6. Verify Google Fonts link exists ---
echo -e "${BOLD}6. Google Fonts link in Layout${NC}"
if grep -q "Plus+Jakarta+Sans" apps/web/src/layouts/Layout.astro 2>/dev/null; then
  echo -e "  ${GREEN}OK${NC} — Plus Jakarta Sans loaded"
else
  echo -e "  ${RED}MISSING${NC} — Plus Jakarta Sans not in Layout.astro <head>"
  ((ERRORS++))
fi
if grep -q "Source+Serif+4" apps/web/src/layouts/Layout.astro 2>/dev/null; then
  echo -e "  ${GREEN}OK${NC} — Source Serif 4 loaded"
else
  echo -e "  ${RED}MISSING${NC} — Source Serif 4 not in Layout.astro <head>"
  ((ERRORS++))
fi
echo ""

# --- 7. Tailwind config check ---
echo -e "${BOLD}7. Tailwind font config${NC}"
if grep -q "Plus Jakarta Sans" packages/tailwind-config/index.js 2>/dev/null; then
  echo -e "  ${GREEN}OK${NC} — font-sans = Plus Jakarta Sans"
else
  echo -e "  ${RED}MISSING${NC} — font-sans not set to Plus Jakarta Sans"
  ((ERRORS++))
fi
if grep -q "Source Serif 4" packages/tailwind-config/index.js 2>/dev/null; then
  echo -e "  ${GREEN}OK${NC} — font-heading = Source Serif 4"
else
  echo -e "  ${RED}MISSING${NC} — font-heading not set to Source Serif 4"
  ((ERRORS++))
fi
echo ""

# --- Summary ---
echo "========================================"
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}${BOLD}$ERRORS errors${NC}, ${YELLOW}$WARNINGS warnings${NC}"
  echo -e "Run the fixes above to complete the font migration."
  exit 1
else
  echo -e "${GREEN}${BOLD}All clean!${NC} ${YELLOW}$WARNINGS warnings${NC}"
  exit 0
fi
