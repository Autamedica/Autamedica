# OpenClaw + AutaMedica — Problemas resueltos (2026-03-28)

## 1. WhatsApp plugin no habilitado

- **Síntoma:** `openclaw channels list` no mostraba WhatsApp
- **Fix:** `openclaw plugins enable whatsapp` + restart gateway

## 2. WhatsApp session desvinculada tras restart

- **Síntoma:** Mensajes no se enviaban, session expirada
- **Fix:** `openclaw channels login --channel whatsapp --account autamedica` (escanear QR) + restart
- **Nota:** Cada restart del gateway puede requerir re-vincular si la session no persiste

## 3. Token duplicado en hooks config

- **Síntoma:** Gateway no arrancaba por token conflicto
- **Fix:** Unificar token en `openclaw.json` → un solo `hooks.token`

## 4. "No API provider registered for api google-genai"

- **Síntoma:** Agente autamedica no podía responder mensajes inbound
- **Causa:** `models.json` del agente tenía `"api": "google-genai"` que no es un provider registrado
- **Fix:** Cambiar a `"api": "openai-completions"` con `baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai"` en `models.json`

## 5. Modelo global apuntaba a ollama (glm-5:cloud) — lento/no disponible

- **Síntoma:** Respuestas lentas o fallaban
- **Fix:** Cambiar default model global a `google/gemini-2.5-flash` con fallbacks a groq/cerebras

## 6. Bug de listeners duplicados en WhatsApp (`globalThis.__oc_wa_listeners`)

- **Síntoma:** Mensajes se enviaban múltiples veces o no se enviaban
- **Fix:** Patch script `scripts/patch-openclaw-wa-listeners.sh` (documentado en memory)
- **Nota:** Re-aplicar después de cada `openclaw update`

## 7. Envío CLI directo (bypass LLM)

- **Método funcional:** `openclaw send --channel whatsapp --account autamedica --to 5491171293450@s.whatsapp.net --text "mensaje"`
- **Requiere:** Session activa + gateway corriendo

## Estado actual

- Gateway: systemd running en `ws://127.0.0.1:18789`
- WhatsApp: vinculado, cuenta `autamedica` (+5491137842406)
- Modelo: `google/gemini-2.5-flash` via OpenRouter-compatible endpoint
- Agente responde mensajes inbound correctamente
