#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname -- "$0")/../.." && pwd)"
WEB_PUBLIC="$ROOT_DIR/apps/web/public"
WEB_APP_PUBLIC="$ROOT_DIR/apps/web-app/public"
SEO_DIR="$WEB_PUBLIC/images/seo"
# Present in the web public tree; ImageMagick detects its actual file format.
LOGO_PATH="$WEB_PUBLIC/images/brand/logo_bioceramic.png"

FONT_BOLD="\${FONT_BOLD:-DejaVu-Sans-Bold}"
FONT_REG="\${FONT_REG:-DejaVu-Sans}"
MAGICK_BIN="$(command -v magick || command -v convert || true)"
IDENTIFY_BIN="$(command -v identify || true)"

mkdir -p "$SEO_DIR" "$WEB_APP_PUBLIC/images/seo"

if [[ -z "$MAGICK_BIN" || -z "$IDENTIFY_BIN" ]]; then
  echo "❌ ImageMagick (magick/convert + identify) no está instalado."
  exit 1
fi

if [[ ! -s "$LOGO_PATH" ]]; then
  echo "❌ No existe el logo base: $LOGO_PATH"
  exit 1
fi

generate_card() {
  local out="$1"
  local title="$2"
  local subtitle="$3"
  local accent="\${4:-#0EA5E9}"

  "$MAGICK_BIN" -size 1200x630 gradient:'#f8fcff-#e8f6fd' \
    \( -size 1200x630 radial-gradient:'#d8f1fc-#ffffff00' \) -compose over -composite \
    -fill '#ffffff' -draw 'roundrectangle 72,70 1128,560 34,34' \
    -stroke '#d5eaf5' -strokewidth 2 -fill none -draw 'roundrectangle 72,70 1128,560 34,34' \
    -stroke none -fill "$accent" -draw 'roundrectangle 72,70 92,560 10,10' \
    \( "$LOGO_PATH" -resize 120x120 \) -gravity northwest -geometry +125+112 -composite \
    -font "$FONT_BOLD" -pointsize 72 -fill '#0b2239' -gravity northwest -annotate +280+130 "$title" \
    -font "$FONT_REG" -pointsize 34 -fill '#416176' -gravity northwest -annotate +130+280 "$subtitle" \
    -stroke "$accent" -strokewidth 5 -draw 'line 130,420 570,420' \
    -font "$FONT_REG" -pointsize 27 -fill '#52758a' -gravity southwest -annotate +130+55 'www.autamedica.com' \
    "$out"
}

echo "🖼️ Generando imágenes SEO 1200x630..."
generate_card "$SEO_DIR/og-main.png" "AutaMedica" "Telemedicina y atención médica digital" '#0EA5E9'
generate_card "$SEO_DIR/twitter-main.png" "AutaMedica" "Consulta online, receta digital y seguimiento clínico" '#0284C7'
generate_card "$SEO_DIR/og-patients.png" "Portal de Pacientes" "Consultas online, continuidad e historial clínico" '#0EA5E9'
generate_card "$SEO_DIR/og-doctors.png" "Portal para Médicos" "Agenda, teleconsulta y gestión clínica" '#0284C7'
generate_card "$SEO_DIR/og-companies.png" "Portal de Empresas" "Salud para equipos y continuidad operativa" '#0EA5E9'
generate_card "$SEO_DIR/og-platform.png" "AutaMedica Platform" "Una experiencia conectada para pacientes y profesionales" '#0284C7'

cp "$SEO_DIR/og-main.png" "$WEB_PUBLIC/og-image.png"
cp "$SEO_DIR/twitter-main.png" "$WEB_PUBLIC/twitter-image.png"
cp "$SEO_DIR/og-main.png" "$WEB_APP_PUBLIC/og-image.png"
cp "$SEO_DIR/twitter-main.png" "$WEB_APP_PUBLIC/twitter-image.png"
cp "$SEO_DIR/og-main.png" "$WEB_APP_PUBLIC/images/seo/og-main.png"
cp "$SEO_DIR/twitter-main.png" "$WEB_APP_PUBLIC/images/seo/twitter-main.png"

for asset in \
  "$SEO_DIR/og-main.png" \
  "$SEO_DIR/twitter-main.png" \
  "$SEO_DIR/og-patients.png" \
  "$SEO_DIR/og-doctors.png" \
  "$SEO_DIR/og-companies.png" \
  "$SEO_DIR/og-platform.png" \
  "$WEB_PUBLIC/og-image.png" \
  "$WEB_PUBLIC/twitter-image.png"; do
  actual="$("$IDENTIFY_BIN" -format '%wx%h' "$asset")"
  if [[ "$actual" != "1200x630" ]]; then
    echo "❌ Dimensión incorrecta para $asset: $actual (esperado 1200x630)"
    exit 1
  fi
  echo "✅ $asset ($actual)"
done
