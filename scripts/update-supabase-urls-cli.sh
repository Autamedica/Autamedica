#!/bin/bash

# Script para actualizar URLs de Supabase usando CLI y API directa
# Adaptado para deployments en Cloudflare Pages

echo "🔧 Actualizando URLs de Supabase para Cloudflare Pages..."
echo ""

PROJECT_REF="qxjjrpksmwwrmubhvjew"
ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"

# Dominios productivos y previews
PRIMARY_URL="${WEBAPP_URL:-https://autamedica.com}"
SECONDARY_URL="${WEBAPP_PREVIEW_URL:-https://autamedica-web-app.pages.dev}"

echo "📍 Proyecto: $PROJECT_REF"
echo "🔗 URL principal: $PRIMARY_URL"
echo "🔗 URL preview: $SECONDARY_URL"
echo ""

echo "🔄 Método 1: Actualizando Site URL via API REST..."
curl -s -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"SITE_URL\": \"$PRIMARY_URL\"}" || echo "❌ Método 1 falló"

echo ""
echo "🔄 Método 2: Configurando redirect URLs específicos..."

REDIRECT_URLS="[
  \"https://autamedica.com/auth/callback\",
  \"https://doctors.autamedica.com/auth/callback\",
  \"https://patients.autamedica.com/auth/callback\",
  \"https://companies.autamedica.com/auth/callback\",
  \"$PRIMARY_URL/auth/callback\",
  \"$SECONDARY_URL/auth/callback\",
  \"http://localhost:3000/auth/callback\",
  \"http://localhost:3001/auth/callback\"
]"

curl -s -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"SITE_URL\": \"$PRIMARY_URL\",
    \"URI_ALLOW_LIST\": \"$PRIMARY_URL/**,$SECONDARY_URL/**,https://autamedica.com/**,https://doctors.autamedica.com/**,https://patients.autamedica.com/**,https://companies.autamedica.com/**,http://localhost:3000/**,http://localhost:3001/**\"
  }" || echo "❌ Método 2 falló"

echo ""
echo "🔄 Método 3: Usando Management API..."

curl -s -X PUT \
  "https://api.supabase.com/v1/projects/$PROJECT_REF" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"auth_site_url\": \"$PRIMARY_URL\",
    \"auth_additional_redirect_urls\": [
      \"$PRIMARY_URL/auth/callback\",
      \"$SECONDARY_URL/auth/callback\",
      \"https://autamedica.com/auth/callback\",
      \"https://doctors.autamedica.com/auth/callback\",
      \"https://patients.autamedica.com/auth/callback\",
      \"https://companies.autamedica.com/auth/callback\"
    ]
  }" || echo "❌ Método 3 falló"

echo ""
echo "✅ Intentos de actualización completados."
echo ""
echo "🎯 URLs que se intentaron configurar:"
echo "   Site URL: $PRIMARY_URL"
echo "   Callbacks:"
echo "   - $PRIMARY_URL/auth/callback"
echo "   - $SECONDARY_URL/auth/callback"
echo "   - https://autamedica.com/auth/callback"
echo "   - https://doctors.autamedica.com/auth/callback"
echo "   - https://patients.autamedica.com/auth/callback"
echo "   - https://companies.autamedica.com/auth/callback"
echo ""
echo "⚠️  Si los métodos CLI fallaron, configura manualmente en:"
echo "   https://supabase.com/dashboard/project/$PROJECT_REF/auth/url-configuration"
echo ""
echo "🔍 Después de configurar, prueba el login en:"
echo "   $PRIMARY_URL"
echo "   $SECONDARY_URL"
