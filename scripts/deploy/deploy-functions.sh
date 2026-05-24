#!/bin/bash

# ===================================================================
# AutaMedica Edge Functions Deployment Script
# ===================================================================
# Deploys all 4 edge functions to the active Supabase project.
#
# Prerequisites:
#   - Supabase CLI installed (brew install supabase/tap/supabase)
#   - SUPABASE_ACCESS_TOKEN env var set (Supabase Personal Access Token)
#     e.g. export SUPABASE_ACCESS_TOKEN=sbp_<token>
#
# Usage:
#   ./scripts/deploy/deploy-functions.sh
# ===================================================================

set -e

PROJECT_REF="qxjjrpksmwwrmubhvjew"
FUNCTIONS=(create-call update-call-status get-meeting-token ingest-patient-observation)

echo "AutaMedica Edge Functions Deployment"
echo "====================================="
echo ""

# Check Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI not found"
    echo "  Install: brew install supabase/tap/supabase"
    exit 1
fi
echo "Supabase CLI: $(supabase --version)"

# Check authentication
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo ""
    echo "Error: SUPABASE_ACCESS_TOKEN not set"
    echo ""
    echo "  IMPORTANT: Use a Supabase Personal Access Token (PAT)."
    echo "  Expected format: sbp_<token>"
    echo ""
    echo "  export SUPABASE_ACCESS_TOKEN=sbp_<token>"
    exit 1
fi
echo "Authentication: ready"

# Verify functions directory
if [ ! -d "supabase/functions" ]; then
    echo "Error: supabase/functions/ not found. Run from project root."
    exit 1
fi

# Verify all functions exist
for func in "${FUNCTIONS[@]}"; do
    if [ ! -d "supabase/functions/$func" ]; then
        echo "Error: supabase/functions/$func not found"
        exit 1
    fi
done
echo "Functions: all ${#FUNCTIONS[@]} found"

# Remove incompatible deno.lock (Supabase CLI doesn't support lockfile v5)
if [ -f "supabase/functions/deno.lock" ]; then
    echo "Removing incompatible deno.lock (v5 not supported by CLI)..."
    rm supabase/functions/deno.lock
fi

echo ""
echo "Deploying ${#FUNCTIONS[@]} Edge Functions..."
echo "-------------------------------------------"

DEPLOYED=0
for func in "${FUNCTIONS[@]}"; do
    echo ""
    echo "[$((DEPLOYED+1))/${#FUNCTIONS[@]}] Deploying $func..."
    if supabase functions deploy "$func" --project-ref "$PROJECT_REF" --no-verify-jwt; then
        echo "  $func: deployed"
        DEPLOYED=$((DEPLOYED+1))
    else
        echo "  $func: FAILED"
        exit 1
    fi
done

echo ""
echo "All $DEPLOYED functions deployed."
echo ""

# Verify deployment
echo "Verifying deployment..."
echo "---------------------"

ALL_OK=true
for func in "${FUNCTIONS[@]}"; do
    URL="https://$PROJECT_REF.supabase.co/functions/v1/$func"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$URL")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
        echo "  $func: OK (HTTP $HTTP_CODE)"
    else
        echo "  $func: WARN (HTTP $HTTP_CODE)"
        ALL_OK=false
    fi
done

echo ""
if $ALL_OK; then
    echo "All functions responding correctly."
else
    echo "Some functions may need time to start. Retry in 30s."
fi

echo ""
echo "Function URLs:"
for func in "${FUNCTIONS[@]}"; do
    echo "  https://$PROJECT_REF.supabase.co/functions/v1/$func"
done
