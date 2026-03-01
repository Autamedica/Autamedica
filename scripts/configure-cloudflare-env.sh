#!/bin/bash

# Script para configurar variables de entorno en Cloudflare Pages
# Uso: ./scripts/configure-cloudflare-env.sh

set -e

echo "🚀 Configurando variables de entorno para Cloudflare Pages..."
echo ""
echo "⚠️  IMPORTANTE: Este script muestra valores para carga manual en dashboard."
echo "   Si prefieres CLI, usa: ./scripts/configure-cloudflare-cli.sh"
echo ""

# Variables de entorno de AutaMedica
SUPABASE_URL="https://qxjjrpksmwwrmubhvjew.supabase.co"
SUPABASE_ANON_KEY="REPLACE_WITH_ROTATED_KEY.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA"
AUTH_HUB_URL="https://www.autamedica.com"

echo "📋 Variables a configurar en Cloudflare Pages Dashboard:"
echo "   👉 Ve a: https://dash.cloudflare.com > Pages > [tu-proyecto] > Settings > Environment variables"
echo ""

# Variables comunes para todas las apps
echo "🔧 Variables comunes para TODAS las aplicaciones:"
echo "   NEXT_PUBLIC_SUPABASE_URL = $SUPABASE_URL"
echo "   NEXT_PUBLIC_SUPABASE_ANON_KEY = $SUPABASE_ANON_KEY"
echo "   NEXT_PUBLIC_NODE_ENV = production"
echo "   SKIP_ENV_VALIDATION = true"
echo "   NEXT_PUBLIC_APP_URL = $AUTH_HUB_URL"
echo "   NEXT_PUBLIC_DOCTORS_URL = https://doctors.autamedica.com"
echo "   NEXT_PUBLIC_PATIENTS_URL = https://patients.autamedica.com"
echo "   NEXT_PUBLIC_COMPANIES_URL = https://companies.autamedica.com"
echo "   NEXT_PUBLIC_ADMIN_URL = https://admin.autamedica.com"
echo ""

# Variables específicas por app
echo "🌐 Variables específicas por aplicación:"
echo ""
echo "📱 Para autamedica-web:"
echo "   NEXT_PUBLIC_SITE_URL = https://www.autamedica.com"
echo ""
echo "👨‍⚕️ Para autamedica-doctors:"
echo "   NEXT_PUBLIC_SITE_URL = https://doctors.autamedica.com"
echo ""
echo "👤 Para autamedica-patients:"
echo "   NEXT_PUBLIC_SITE_URL = https://patients.autamedica.com"
echo ""
echo "🏢 Para autamedica-companies:"
echo "   NEXT_PUBLIC_SITE_URL = https://companies.autamedica.com"
echo ""

echo "🔄 Después de configurar las variables:"
echo "   1. Haz un nuevo deployment o redeploy desde el dashboard"
echo "   2. Verifica que las variables estén disponibles en producción"
echo ""

# Crear archivo .env para referencia local
echo "💾 Creando archivo .env.cloudflare para referencia:"

cat > .env.cloudflare << EOF
# Variables de entorno para Cloudflare Pages
# Configurar estas variables en el dashboard de Cloudflare Pages

# Variables comunes (todas las apps)
NEXT_PUBLIC_SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=REPLACE_WITH_ROTATED_KEY.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA
NEXT_PUBLIC_NODE_ENV=production
SKIP_ENV_VALIDATION=true
NEXT_PUBLIC_APP_URL=https://www.autamedica.com
NEXT_PUBLIC_DOCTORS_URL=https://doctors.autamedica.com
NEXT_PUBLIC_PATIENTS_URL=https://patients.autamedica.com
NEXT_PUBLIC_COMPANIES_URL=https://companies.autamedica.com
NEXT_PUBLIC_ADMIN_URL=https://admin.autamedica.com

# Variables específicas por app (configurar según corresponda)
# NEXT_PUBLIC_SITE_URL=https://www.autamedica.com         # web-app
# NEXT_PUBLIC_SITE_URL=https://doctors.autamedica.com     # doctors
# NEXT_PUBLIC_SITE_URL=https://patients.autamedica.com    # patients
# NEXT_PUBLIC_SITE_URL=https://companies.autamedica.com   # companies
EOF

echo "✅ Archivo .env.cloudflare creado con las variables de referencia"
echo ""
echo "🎉 Configuración completa!"
echo "   Recuerda configurar estas variables en el dashboard de Cloudflare Pages"
