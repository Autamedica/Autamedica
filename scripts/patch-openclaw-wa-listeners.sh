#!/bin/bash
# Patch OpenClaw WhatsApp listener Map duplication bug
# Issues: #14406, #34741, #52781
# Re-run after every `npm update openclaw`
set -e

DIST="/mnt/data/.npm-global/lib/node_modules/openclaw/dist"

if [ ! -d "$DIST" ]; then
  echo "OpenClaw dist not found at $DIST"
  exit 1
fi

COUNT=$(grep -rl 'const listeners = /\* @__PURE__ \*/ new Map()' "$DIST" 2>/dev/null | wc -l)
echo "Found $COUNT files with module-scoped listener Map"

if [ "$COUNT" -eq 0 ]; then
  echo "Already patched or pattern changed. Checking globalThis..."
  grep -rl 'globalThis.__oc_wa_listeners' "$DIST" 2>/dev/null | wc -l
  exit 0
fi

for f in $(grep -rl 'const listeners = /\* @__PURE__ \*/ new Map()' "$DIST" 2>/dev/null); do
  sed -i 's|const listeners = /\* @__PURE__ \*/ new Map()|const listeners = globalThis.__oc_wa_listeners ??= new Map()|g' "$f"
  echo "Patched: $(basename $f)"
done

echo "Done. Restart gateway: openclaw gateway restart"
