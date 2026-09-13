# ADR-0003: Cloudflare Calls SFU como plano de medios canonico (web + Android)

## Estado

Aceptado

## Contexto

La web ya implementa Cloudflare Calls SFU como plano de medios: `CloudflareCallsSession`
publica los tracks locales contra el SFU y se subscribe a los tracks remotos, y
`CloudflareCallsClient` coordina la sesion de llamada con señalizacion por Supabase Realtime
(channel `signaling:{roomId}`). El runtime se resuelve en `resolveRuntime()`
(`apps/web/src/lib/calls/services/call-session.backend.ts:26-44`):

- `cloudflare-calls` cuando existen `CLOUDFLARE_CALLS_APP_ID` + `CLOUDFLARE_CALLS_APP_SECRET` (produccion).
- `webrtc-p2p` solo con `PUBLIC_FORCE_WEBRTC_P2P=true` o como fallback de desarrollo sin credenciales.
- En produccion sin credenciales el bootstrap lanza error (no hay fallback silencioso).

Android, en cambio, todavia usa una malla P2P (`WebRTCEngine` con mapa `peers`) y un
`SignalingWebSocket` propio contra `signaling.autamedica.com`. Esa divergencia hacia que el
plano de medios de Android pareciera un sistema distinto del de la web.

Decision explicita del creador: el plano de medios de Android debe ser el mismo SFU de Cloudflare
Calls que usa la web, portado a Kotlin. Este ADR fija esa decision para no volver a generar
confusion entre runtimes.

Refina el punto 3 del ADR-0001: el runtime canonico real no es una capa generica "unified
signaling", sino concretamente el SFU de Cloudflare Calls en ambos clientes, con WebRTC mesh
solo como modo forzado de desarrollo/testing.

## Decisión

1. **Plano de medios canonico: Cloudflare Calls SFU** (WebRTC ↔ relay SFU), unico para web y Android.
   - Web: implementacion existente en `packages/telemedicine/src/cloudflare-calls/`.
   - Android: port Kotlin que reemplaza la malla P2P de `WebRTCEngine`:
     - `CloudflareCallsSession.kt`: port de `session.ts` (una PC contra el SFU, full ICE en SDP,
       guardas de negoc region, `tracks/close`).
     - `CloudflareCallsClient.kt`: port del coordinador `client.ts` (anunciar `cf-session`, drenar
       pendientes, reconnect, mid→userId, teardown ordenado).
     - `SupabaseRealtimeSignaling.kt`: port de `supabase-signaling.ts` (channel `signaling:{roomId}`,
       envelope `cf-session {sessionId, userType}`).
2. **API del SFU a traves de proxy por rol** (nunca secretos en cliente):
   - Web: `apps/web/src/lib/calls` ya expone los proxy por rol (`/api/doctors/cloudflare-calls`,
     `/api/patients/cloudflare-calls`, `/api/calls/guest/cloudflare-calls`).
   - Android: mismo contrato consumido via `supabaseClient.functions.invoke` (patron ya usado para
     `turn-credentials`), con edge function `cloudflare-calls` proxy que replica
     `server/cloudflare-calls-handler.ts` y agrega autorizacion por participante (JWT Supabase,
     scoping room/role).
3. **TURN queda como fallback:** Cloudflare Calls provee sus propios candidatos ICE dentro del SDP.
4. **Estado de llamada canonico:** la semantica de transiciones vive en la RPC
   `update_call_status` (setea `accepted_at`/`ended_at` y registra `call_events` de forma atomica).
   Ningun cliente escribe status directo sin su timestamp/evento correspondiente.
5. **`webrtc-p2p` y `SignalingWebSocket` quedan deprecados** como plano de medios productivo; solo
   se usan forzados para dev/testing y se eliminan cuando el port Kotlin pase QA E2E.

## Consecuencias

### Positivas

- Una sola lectura del plano de medios para `web + mobile`.
- Reuso del mismo contrato de sesion en futura implementacion iOS.
- La malla P2P desaparece: sin estado distribuido por peer, mejor manejo de NAT y escalabilidad SFU.
- Centraliza la semantica de estado en `update_call_status` y deja trazabilidad completa en `call_events`.
- Elimina la confusion del diagnostico: el video no iniciaba porque la UI nunca navegaba a
  VideoCall en llamadas directas (room_id sin appointment_id) y el estado quedaba corrupto
  (`accepted` sin `accepted_at`).

### Negativas

- Port Kotlin no trivial de `session.ts`/`client.ts`/`supabase-signaling.ts` (PR2).
- Android mantiene la UI (`VideoCallViewModel`) intacta pero reemplaza el engine de media:
  riesgo de regresion hasta validar E2E con SFU.
- Dependencia operativa del proxy Cloudflare Calls por rol; exige authz estricta para Android
  (JWT participante, room/role), no solo presencia de credencial.

## Compliance

### HIPAA

- El media atraviesa un SFU de terceros; la trazabilidad clinica queda en `calls`/`call_events`.
- El signaling no expone PHI: solo `sessionId` y SDP.
- El proxy de la API debe validar participante y room/role; logs sin PHI/PII y sin secrets.

### Médico

- El paciente solo entra a la sala dirigida a su turno/call.
- El medico solo acepta/inicia llamadas autorizadas por su agenda real.
- Continuidad asistencial: audio-only fallback contemplado. Ante bajo rendimiento de red se evalúa
  TURN/bandwidth, no se vuelve a malla P2P.

## Implementación (hoja de ruta)

1. **PR1 (hotfix, en curso):** navegacion de llamada directa por room_id
   (`NotificationRouteResolver`) + `updateCallStatus` RPC-first en Android
   (`TelemedicineRepositoryImpl`) + propagacion de `EXTRA_CALL_ID`/`EXTRA_IS_INCOMING_CALL`.
2. **PR2 (port SFU):** edge function `cloudflare-calls` proxy con authz +
   `CloudflareCallsSession.kt` + `SupabaseRealtimeSignaling.kt` + `CloudflareCallsClient.kt`,
   con tests porteados de `client.ts`/`session.ts`.
3. **E2E:** doctor web en `/doctors/call/{room_id}` + paciente Android acepta →
   verificar `accepted_at`, evento en `call_events` y track publicada/suscrita por SFU.

## Referencias

- ADR-0001: Telemedicina Web + Mobile con arquitectura canonica de llamada.
- `packages/telemedicine/src/cloudflare-calls/session.ts`, `client.ts`.
- `packages/telemedicine/src/supabase-signaling.ts`.
- `apps/web/src/lib/calls/services/call-session.backend.ts` (`resolveRuntime`).
- `packages/telemedicine/src/server/cloudflare-calls-handler.ts`.
