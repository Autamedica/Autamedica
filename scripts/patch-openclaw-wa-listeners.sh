#!/bin/bash
# Patch OpenClaw WhatsApp listener Map duplication bug.
# Replaces module-scoped `new Map()` with `globalThis.__oc_wa_listeners ??= new Map()`
# so every chunk of the duplicated bundle shares one listener registry.
# Re-run after every `npm update openclaw`.
set -euo pipefail

NPM_GLOBAL_ROOT="$(npm root -g 2>/dev/null || true)"
DIST="${OPENCLAW_DIST_OVERRIDE:-${NPM_GLOBAL_ROOT}/openclaw/dist}"

if [ ! -d "$DIST" ]; then
  echo "OpenClaw dist not found at $DIST" >&2
  echo "Set OPENCLAW_DIST_OVERRIDE or reinstall openclaw globally." >&2
  exit 1
fi

PATTERN='const listeners = /\* @__PURE__ \*/ new Map()'
REPLACEMENT='const listeners = globalThis.__oc_wa_listeners ??= new Map()'

mapfile -t TARGETS < <(grep -rl --fixed-strings "$PATTERN" "$DIST" 2>/dev/null || true)

if [ "${#TARGETS[@]}" -eq 0 ]; then
  ALREADY=$(grep -rl --fixed-strings 'globalThis.__oc_wa_listeners' "$DIST" 2>/dev/null | wc -l)
  echo "No unpatched files. Already-patched chunks: $ALREADY"
  exit 0
fi

echo "Patching ${#TARGETS[@]} file(s) under $DIST"

FAILED=0
for f in "${TARGETS[@]}"; do
  cp -p "$f" "${f}.bak"
  sed -i "s|${PATTERN}|${REPLACEMENT}|g" "$f"
  if grep -q --fixed-strings 'globalThis.__oc_wa_listeners' "$f"; then
    echo "  patched: $(basename "$f")"
    rm -f "${f}.bak"
  else
    echo "  FAILED: $(basename "$f") — restoring backup" >&2
    mv "${f}.bak" "$f"
    FAILED=$((FAILED + 1))
  fi
done

if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED file(s) failed to patch" >&2
  exit 1
fi

echo "Done. Restart gateway: openclaw gateway restart"
