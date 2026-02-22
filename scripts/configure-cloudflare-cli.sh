#!/bin/bash

# Configura variables de entorno en Cloudflare Pages usando Wrangler CLI.
# Regla clave: NEXT_PUBLIC_APP_URL siempre debe apuntar al Auth Hub central.
# Uso: ./scripts/configure-cloudflare-cli.sh

set -euo pipefail

echo "🚀 Configurando variables de entorno de Auth Hub en Cloudflare Pages..."

SUPABASE_URL="https://gtyvdircfhmdjiaelqkg.supabase.co"
SUPABASE_ANON_KEY="REPLACE_WITH_ROTATED_KEY.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA"
AUTH_HUB_URL="https://www.autamedica.com"

DOCTORS_URL="https://doctors.autamedica.com"
PATIENTS_URL="https://patients.autamedica.com"
COMPANIES_URL="https://companies.autamedica.com"
ADMIN_URL="https://admin.autamedica.com"

# Algunos entornos usan autamedica-web y otros autamedica-web-app.
PROJECTS_ORDER=(
  "autamedica-web"
  "autamedica-web-app"
  "autamedica-doctors"
  "autamedica-patients"
  "autamedica-companies"
  "autamedica-admin"
)

declare -A PROJECT_SITE_URLS=(
  [autamedica-web]="https://www.autamedica.com"
  [autamedica-web-app]="https://www.autamedica.com"
  [autamedica-doctors]="$DOCTORS_URL"
  [autamedica-patients]="$PATIENTS_URL"
  [autamedica-companies]="$COMPANIES_URL"
  [autamedica-admin]="$ADMIN_URL"
)

list_projects() {
  npx wrangler pages project list 2>/dev/null | awk -F'│' '
    /^│/ {
      gsub(/^ +| +$/, "", $2);
      if ($2 != "" && $2 != "Project Name") print $2;
    }
  '
}

EXISTING_PROJECTS="$(list_projects)"

project_exists() {
  local project_name="$1"
  grep -qx "$project_name" <<< "$EXISTING_PROJECTS"
}

put_secret() {
  local project_name="$1"
  local key="$2"
  local value="$3"
  npx wrangler pages secret put "$key" --project-name="$project_name" <<< "$value"
}

configure_project() {
  local project_name="$1"
  local site_url="$2"

  echo "📱 Configurando proyecto: $project_name"
  echo "  🔧 Variables comunes..."
  put_secret "$project_name" "NEXT_PUBLIC_SUPABASE_URL" "$SUPABASE_URL"
  put_secret "$project_name" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY"
  put_secret "$project_name" "NEXT_PUBLIC_NODE_ENV" "production"
  put_secret "$project_name" "SKIP_ENV_VALIDATION" "true"

  echo "  🔐 Auth Hub y URLs canónicas..."
  put_secret "$project_name" "NEXT_PUBLIC_APP_URL" "$AUTH_HUB_URL"
  put_secret "$project_name" "NEXT_PUBLIC_SITE_URL" "$site_url"
  put_secret "$project_name" "NEXT_PUBLIC_DOCTORS_URL" "$DOCTORS_URL"
  put_secret "$project_name" "NEXT_PUBLIC_PATIENTS_URL" "$PATIENTS_URL"
  put_secret "$project_name" "NEXT_PUBLIC_COMPANIES_URL" "$COMPANIES_URL"
  put_secret "$project_name" "NEXT_PUBLIC_ADMIN_URL" "$ADMIN_URL"

  echo "  ✅ $project_name configurado"
  echo ""
}

configured_count=0
skipped_count=0

for project_name in "${PROJECTS_ORDER[@]}"; do
  if project_exists "$project_name"; then
    configure_project "$project_name" "${PROJECT_SITE_URLS[$project_name]}"
    configured_count=$((configured_count + 1))
  else
    echo "⚠️  Proyecto no encontrado (omitido): $project_name"
    skipped_count=$((skipped_count + 1))
  fi
done

echo "🎉 Configuración finalizada"
echo "   Proyectos configurados: $configured_count"
echo "   Proyectos omitidos: $skipped_count"
echo ""
echo "🔄 Próximos pasos:"
echo "   1. Redeploy de cada proyecto configurado."
echo "   2. Verificar secretos: npx wrangler pages secret list --project-name=<project>"
echo "   3. Confirmar DNS: doctors/patients/companies/admin CNAME -> <project>.pages.dev"
