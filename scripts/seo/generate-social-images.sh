#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname -- "$0")/../.." && pwd)"
WEB_PUBLIC="$ROOT_DIR/apps/web/public"
WEB_APP_PUBLIC="$ROOT_DIR/apps/web-app/public"
SEO_DIR="$WEB_PUBLIC/images/seo"
LOGO_PATH="$WEB_PUBLIC/autamedica-logo.png"

FONT_BOLD="${FONT_BOLD:-DejaVu-Sans-Bold}"
FONT_REG="${FONT_REG:-DejaVu-Sans}"

mkdir -p "$SEO_DIR"
mkdir -p "$WEB_APP_PUBLIC/images/seo"

if ! command -v magick >/dev/null 2>&1; then
  echo "❌ ImageMagick (magick) no esta instalado."
  exit 1
fi

if [[ ! -f "$LOGO_PATH" ]]; then
  echo "❌ No existe logo base: $LOGO_PATH"
  exit 1
fi

generate_card() {
  local out="$1"
  local title="$2"
  local subtitle="$3"
  local accent="$4"

  magick -size 1200x630 gradient:'#0f172a-#020617' \
    \( -size 1200x630 radial-gradient:'#33415566-#000000dd' \) -compose over -composite \
    -fill "${accent}26" -draw 'roundrectangle 72,70 1128,560 30,30' \
    -fill '#0b1220cc' -draw 'roundrectangle 86,84 1114,546 26,26' \
    \( "$LOGO_PATH" -resize 120x120 \) -gravity northwest -geometry +120+116 -composite \
    -font "$FONT_BOLD" -pointsize 78 -fill '#f8fafc' -gravity northwest -annotate +270+182 "$title" \
    -font "$FONT_REG" -pointsize 34 -fill '#cbd5e1' -gravity northwest -annotate +272+256 "$subtitle" \
    -stroke "$accent" -strokewidth 5 -draw 'line 270,314 980,314' \
    -font "$FONT_REG" -pointsize 26 -fill '#94a3b8' -gravity southwest -annotate +120+54 'www.autamedica.com' \
    "$out"
}

echo "🖼️  Generando imagenes SEO 1200x630..."

generate_card "$SEO_DIR/og-main.png" "AutaMedica" "Telemedicina sin fricciones" '#10b981'
generate_card "$SEO_DIR/twitter-main.png" "AutaMedica" "Agenda inmediata. Receta digital. Seguimiento continuo." '#22d3ee'
generate_card "$SEO_DIR/og-patients.png" "Portal de Pacientes" "Turnos, historial y prevencion en una sola experiencia." '#10b981'
generate_card "$SEO_DIR/og-doctors.png" "Portal para Medicos" "Agenda clinica y teleconsulta con foco operativo." '#3b82f6'
generate_card "$SEO_DIR/og-companies.png" "Portal de Empresas" "Salud ocupacional y continuidad para equipos corporativos." '#f59e0b'
generate_card "$SEO_DIR/og-platform.png" "AutaMedica Platform" "Entrada unificada para pacientes, medicos y empresas." '#14b8a6'

cp "$SEO_DIR/og-main.png" "$WEB_PUBLIC/og-image.png"
cp "$SEO_DIR/twitter-main.png" "$WEB_PUBLIC/twitter-image.png"
cp "$SEO_DIR/og-main.png" "$WEB_APP_PUBLIC/og-image.png"
cp "$SEO_DIR/twitter-main.png" "$WEB_APP_PUBLIC/twitter-image.png"
cp "$SEO_DIR/og-main.png" "$WEB_APP_PUBLIC/images/seo/og-main.png"
cp "$SEO_DIR/twitter-main.png" "$WEB_APP_PUBLIC/images/seo/twitter-main.png"

echo "✅ Imagenes generadas:"
identify \
  "$SEO_DIR/og-main.png" \
  "$SEO_DIR/twitter-main.png" \
  "$SEO_DIR/og-patients.png" \
  "$SEO_DIR/og-doctors.png" \
  "$SEO_DIR/og-companies.png" \
  "$SEO_DIR/og-platform.png" \
  "$WEB_PUBLIC/og-image.png" \
  "$WEB_PUBLIC/twitter-image.png" \
  "$WEB_APP_PUBLIC/og-image.png" \
  "$WEB_APP_PUBLIC/twitter-image.png"
