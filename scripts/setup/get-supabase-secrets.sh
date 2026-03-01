#!/bin/bash
set -euo pipefail

PROJECT_ID="qxjjrpksmwwrmubhvjew"

echo "🔐 Obteniendo secretos de Supabase para proyecto: $PROJECT_ID"
echo "============================================================"
echo

# Get the Supabase access token from local config
SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase/config.json 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4 || echo "")

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ No se encontró token de acceso. Por favor ejecuta:"
    echo "   supabase login"
    exit 1
fi

echo "📋 Obteniendo configuración del proyecto..."
echo

# Use Supabase Management API to get project details
API_RESPONSE=$(curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$PROJECT_ID/api-keys")

if echo "$API_RESPONSE" | grep -q "error"; then
    echo "❌ Error obteniendo keys. Usando método alternativo..."
    echo
    echo "🌐 Abriendo dashboard de Supabase..."
    supabase dashboard
    echo
    echo "📝 En el dashboard:"
    echo "  1. Ve a Settings → API"
    echo "  2. Copia el JWT Secret"
    echo "  3. Rota el anon key si es necesario"
    exit 1
fi

# Parse the response
ANON_KEY=$(echo "$API_RESPONSE" | grep -o '"anon_key":"[^"]*' | cut -d'"' -f4 || echo "")
SERVICE_KEY=$(echo "$API_RESPONSE" | grep -o '"service_key":"[^"]*' | cut -d'"' -f4 || echo "")

echo "✅ Keys obtenidas del proyecto remoto:"
echo
echo "NEXT_PUBLIC_SUPABASE_URL=https://$PROJECT_ID.supabase.co"
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
echo

# For JWT secret, we need to decode it from the anon key
if [ -n "$ANON_KEY" ]; then
    echo "📝 Para obtener el JWT Secret:"
    echo "  1. El JWT secret se usa para firmar estos tokens"
    echo "  2. Necesitas obtenerlo del Dashboard → Settings → API → JWT Settings"
    echo "  3. O puedes usar este comando para abrir el dashboard:"
    echo
    echo "     supabase dashboard"
    echo
fi

echo "🔧 Para configurar en GitHub:"
echo
echo "gh secret set NEXT_PUBLIC_SUPABASE_URL --body \"https://$PROJECT_ID.supabase.co\""
echo "gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --body \"$ANON_KEY\""
echo "# JWT Secret debe obtenerse del dashboard"
echo "gh secret set SUPABASE_JWT_SECRET --body \"YOUR_JWT_SECRET_FROM_DASHBOARD\""