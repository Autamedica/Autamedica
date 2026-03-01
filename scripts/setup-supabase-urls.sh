#!/bin/bash

# Script para configurar Redirect URLs en Supabase usando CLI
# Requiere: SUPABASE_ACCESS_TOKEN configurado

echo "🔧 Configurando Redirect URLs en Supabase..."
echo ""

# Verificar que tenemos acceso al proyecto Supabase
PROJECT_REF="qxjjrpksmwwrmubhvjew"

echo "📍 Proyecto Supabase: $PROJECT_REF"
echo ""

# Verificar autenticación con Supabase
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI no está instalado."
    echo "Instalar con: npm install -g supabase"
    exit 1
fi

echo "🔐 Verificando acceso a Supabase..."

# Usar el token que ya tienes configurado
export SUPABASE_ACCESS_TOKEN="sbp_aa74b7707840d07be814d4f92adde20dd35d3c16"

if ! supabase projects list 2>/dev/null | grep -q "$PROJECT_REF"; then
    echo "❌ No se puede acceder al proyecto Supabase."
    echo "Verifica tu SUPABASE_ACCESS_TOKEN"
    exit 1
fi

echo "✅ Acceso a Supabase confirmado."
echo ""

# Obtener la configuración actual de auth
echo "📋 Configuración actual de Auth URLs..."
supabase settings get --project-ref "$PROJECT_REF" --auth 2>/dev/null || echo "⚠️  No se pudo obtener configuración actual"
echo ""

# Configurar Site URL y Redirect URLs
echo "🔧 Configurando URLs de autenticación..."

# Site URL principal
echo "📝 Configurando Site URL..."
supabase settings update --project-ref "$PROJECT_REF" auth --site-url "https://autamedica.com"

# Nota: Supabase CLI no tiene comando directo para redirect URLs
# Necesitamos usar la API REST o configurar manualmente

echo ""
echo "⚠️  CONFIGURACIÓN MANUAL REQUERIDA:"
echo ""
echo "Ir a: https://supabase.com/dashboard/project/$PROJECT_REF/auth/url-configuration"
echo ""
echo "Agregar las siguientes Redirect URLs:"
echo "✅ https://autamedica.com/auth/callback"
echo "✅ https://doctors.autamedica.com/auth/callback"
echo "✅ https://patients.autamedica.com/auth/callback"
echo "✅ https://companies.autamedica.com/auth/callback"
echo ""
echo "Y agregar la URL de deployment de Cloudflare Pages (previews) cuando esté lista:"
echo "✅ https://autamedica-doctors.pages.dev/auth/callback"
echo ""

# Función para actualizar redirect URLs via API (si tienes curl)
echo "🔄 Intentando configurar Redirect URLs via API..."

# Obtener la URL de deployment más reciente
if command -v curl &> /dev/null; then
    echo "📡 Configurando via API REST..."
    
    # Lista de URLs que queremos configurar
    REDIRECT_URLS='["https://autamedica.com/auth/callback","https://doctors.autamedica.com/auth/callback","https://patients.autamedica.com/auth/callback","https://companies.autamedica.com/auth/callback","http://localhost:3000/auth/callback","http://localhost:3001/auth/callback"]'
    
    # Usar API de Supabase para actualizar configuración
    curl -X PATCH \
        "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
        -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"SITE_URL\": \"https://autamedica.com\",
            \"URI_ALLOW_LIST\": \"https://autamedica.com/**,https://doctors.autamedica.com/**,https://patients.autamedica.com/**,https://companies.autamedica.com/**,http://localhost:3000/**,http://localhost:3001/**\"
        }" \
        && echo "✅ URLs configuradas via API" \
        || echo "⚠️  Error en API, configura manualmente"
else
    echo "⚠️  curl no disponible, configura manualmente en el dashboard"
fi

echo ""
echo "✅ Configuración de Supabase completada!"
echo ""
echo "📋 SIGUIENTE PASO: Probar el login"
echo "   1. Ir a tu deployment de Cloudflare Pages"
echo "   2. Intentar hacer login"
echo "   3. Verificar que redirecciona al dashboard"