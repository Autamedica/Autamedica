#!/bin/bash

# Script para configurar URLs de redirección en Supabase
# Resuelve el error flow_state_not_found

echo "🔧 Configurando URLs de redirección en Supabase..."

# URLs de las aplicaciones desplegadas (pueden sobreescribirse vía variables de entorno)
WEB_APP="${WEB_APP_URL:-https://autamedica.com}"
DOCTORS="${DOCTORS_URL:-https://doctors.autamedica.com}"
PATIENTS="${PATIENTS_URL:-https://patients.autamedica.com}"
COMPANIES="${COMPANIES_URL:-https://companies.autamedica.com}"

# URLs de callback que necesitan estar configuradas en Supabase
REDIRECT_URLS=(
  "${WEB_APP}/auth/callback"
  "${DOCTORS}/auth/callback"
  "${PATIENTS}/auth/callback"
  "${COMPANIES}/auth/callback"
  "http://localhost:3000/auth/callback"
  "http://localhost:3001/auth/callback"
  "http://localhost:3002/auth/callback"
  "http://localhost:3003/auth/callback"
)

echo "🌐 URLs de redirección a configurar:"
for url in "${REDIRECT_URLS[@]}"; do
  echo "  - $url"
done

echo ""
echo "🔑 Para configurar en Supabase Dashboard:"
echo "1. Ir a https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew"
echo "2. Ir a Authentication > URL Configuration"
echo "3. En 'Redirect URLs', agregar todas las URLs listadas arriba"
echo "4. En 'Site URL', configurar: ${WEB_APP}"
echo ""
echo "🚨 IMPORTANTE: Sin estas URLs configuradas, se producirá el error 'flow_state_not_found'"
echo ""

echo "💡 Alternativa: Usar API de Supabase para configurar automáticamente"
echo "   (Requiere configuración adicional de API keys)"
