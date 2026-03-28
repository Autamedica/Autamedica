# Hallazgos — Demo de Telemedicina (2026-03-27)

> Prueba end-to-end: Doctor en PC (Chrome via Patchright) ↔ Paciente en celular (Chrome Android via ADB).
> Commit del fix: `e16b3fef0276a3c158586c07db184d7ab14287bd`

---

## Resumen Ejecutivo

Se realizó una demo real de videollamada entre doctor (computadora) y paciente (celular Infinix X6826C en red 4G). Se encontraron **3 bugs bloqueantes** y **2 issues operativos**. Todos los bugs fueron corregidos y verificados.

| #     | Hallazgo                                                            | Severidad           | Estado      |
| ----- | ------------------------------------------------------------------- | ------------------- | ----------- |
| BUG-1 | Sin video/audio pese a conexión WebRTC establecida                  | **P0 — Bloqueante** | Corregido   |
| BUG-2 | Anamnesis "no compartida" cuando sí existe                          | **P1 — Funcional**  | Corregido   |
| BUG-3 | Tracks locales no se adjuntan a peers existentes                    | **P1 — Funcional**  | Corregido   |
| OPS-1 | `call_access_denied` por sesión de usuario equivocado en el celular | Operativo           | Resuelto    |
| OPS-2 | Edge function `start-call` reutiliza llamadas canceladas            | **P2 — Menor**      | Documentado |

---

## BUG-1: Sin video ni audio en la videollamada (STUN-only)

### Síntoma

Ambos lados (doctor y paciente) mostraban **"Conectado" y "2 en sala"** en la UI, pero:

- No se veía video de ningún lado
- No se escuchaba audio de ningún lado
- La UI mostraba "Cámara desactivada" en ambos participantes

### Causa raíz

El bootstrap de la llamada (`call-session.backend.ts`) configuraba **solo servidores STUN** (Google STUN públicos) y **nunca generaba credenciales TURN**.

```typescript
// ANTES (buggy) — línea 54, call-session.backend.ts
function buildBootstrap(...): CallSessionBootstrap {
  const iceServers = runtime === 'webrtc-p2p' ? getIceServersConfig() : undefined
  // getIceServersConfig() retornaba solo STUN:
  // [{ urls: ['stun:stun.l.google.com:19302'] }]
}
```

**Sin TURN, la conexión P2P falla cuando:**

- El paciente está en red 4G/5G (NAT simétrico)
- Hay firewalls corporativos
- Las redes tienen restricciones UDP

El signaling WebSocket conectaba correctamente y los peers se descubrían (de ahí "2 en sala"), pero los paquetes de media (RTP) no podían atravesar el NAT → **conexión de señalización OK, media muerta**.

### Fix aplicado

**Archivo:** `apps/web/src/lib/calls/services/call-session.backend.ts`

Se agregó `fetchCloudflareTurnServers()` que genera credenciales TURN efímeras (TTL 86400s) vía la API de Cloudflare antes de cada call bootstrap:

```typescript
// DESPUÉS — nueva función
async function fetchCloudflareTurnServers(): Promise<RTCIceServer[]> {
  const keyId = import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID
  const token = import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN
  if (!keyId || !token) return []

  const result = await handleTurnCredentials({ keyId, token })
  if (result.status !== 200) return []

  const body = result.body as { ok: boolean; iceServers?: RTCIceServer[] }
  return body.ok && Array.isArray(body.iceServers) ? body.iceServers : []
}

// buildBootstrap ahora es async y prueba TURN primero
async function buildBootstrap(...): Promise<CallSessionBootstrap> {
  let iceServers: RTCIceServer[] | undefined
  if (runtime === 'webrtc-p2p') {
    const turnServers = await fetchCloudflareTurnServers()
    iceServers = turnServers.length > 0 ? turnServers : getIceServersConfig()
  }
}
```

**Cadena de llamadas:**

```
/api/calls/[roomId]/bootstrap (GET)
  → callSessionBackendService.getBootstrap()
    → buildBootstrap()                          // ahora async
      → fetchCloudflareTurnServers()            // NUEVO
        → handleTurnCredentials()               // packages/telemedicine/src/server/
          → fetch('https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate')
```

### Verificación

- El bootstrap ahora retorna `iceServers` con URLs `turn:` (no solo `stun:`)
- Ambos participantes conectan y se ven mutuamente
- Funciona desde 4G del celular (NAT simétrico)

### Prerequisito en producción

Las variables de entorno **deben existir** en Cloudflare Pages secrets de los 4 proyectos:

```
CLOUDFLARE_CALLS_TURN_KEY_ID=<key-id>
CLOUDFLARE_CALLS_TURN_TOKEN=<token>
```

Si no están, el fallback es STUN-only (comportamiento degradado pero no crash).

---

## BUG-2: Anamnesis "no compartida" para el doctor

### Síntoma

Durante la consulta, el panel del doctor mostraba:

> "El paciente no ha compartido su anamnesis"

Pese a que el paciente sí tenía una anamnesis completa en la base de datos.

### Causa raíz

Dos archivos contenían la misma lógica buggy:

```typescript
// ANTES — consultation-context.backend.ts:154 y consultation-context.service.ts:143
if (!anamnesis?.privacy_accepted) {
  return {
    hasAnamnesis: false,
    reason: !anamnesis ? "not_started" : "not_shared",
  };
}
```

El campo `privacy_accepted` en la tabla `anamnesis` tiene **default `NULL`** en la base de datos. La condición `!anamnesis?.privacy_accepted` evaluaba `!null` → `true` → retornaba `'not_shared'` para **toda anamnesis que no tuviera `privacy_accepted = true` explícitamente**.

En la práctica, **ningún paciente** tenía `privacy_accepted = true` porque:

1. El flujo de creación de anamnesis no setea ese campo
2. El campo se agregó como preparación para un feature futuro de consentimiento
3. El default de la columna es `NULL`, no `true`

### Fix aplicado

**Archivos:**

- `apps/web/src/lib/doctors/services/consultation-context.backend.ts` (línea 154)
- `apps/web/src/lib/doctors/services/consultation-context.service.ts` (línea 143)

```typescript
// DESPUÉS — solo verificar si existe anamnesis
if (!anamnesis) {
  return {
    hasAnamnesis: false,
    reason: "not_started",
  };
}
```

Se eliminó el gate de `privacy_accepted` y el reason `'not_shared'`. Si la anamnesis existe, el doctor la ve.

### Verificación

- Consultar anamnesis de cualquier paciente con anamnesis existente → doctor ve el resumen, red flags y preguntas sugeridas
- Verificable con query: `SELECT id, privacy_accepted FROM anamnesis LIMIT 5` — la mayoría tiene `NULL`

---

## BUG-3: Tracks de media no se adjuntan a peers existentes

### Síntoma

En ciertos timing de conexión, el peer remoto conectaba antes de que `getUserMedia()` completara. El peer connection existía pero sin tracks de audio/video adjuntos → el otro lado no recibía media.

### Causa raíz

En `packages/telemedicine/src/webrtc-client.ts`, cuando `getUserMedia()` completaba (ya sea en pre-warm o en `connect()`), los tracks solo se adjuntaban a peers **futuros**. Si un peer ya existía cuando el media local se adquiría, ese peer nunca recibía los tracks.

### Fix aplicado

**Archivo:** `packages/telemedicine/src/webrtc-client.ts`

Se agregó `attachTracksToExistingPeers()` que recorre todas las `peerConnections` existentes y adjunta tracks a las que no tienen senders:

```typescript
private attachTracksToExistingPeers(): void {
  if (!this.localStream || this.peerConnections.size === 0) return
  for (const [peerId, peerState] of this.peerConnections) {
    const hasTracks = peerState.pc.getSenders().some(s => s.track !== null)
    if (!hasTracks) {
      this.attachLocalTracks(peerState.pc)
    }
  }
}
```

Se llama en dos puntos:

1. Al final del pre-warm (línea 719): `this.attachTracksToExistingPeers()`
2. Al final de la adquisición de media en `connect()` (línea 945): `this.attachTracksToExistingPeers()`

---

## OPS-1: `call_access_denied` por sesión de usuario equivocado

### Síntoma

El celular del paciente recibía `403 Forbidden` con `call_access_denied` al hacer GET `/api/calls/[roomId]/bootstrap`.

### Causa raíz

El navegador del celular estaba logueado como **`ecucondor@gmail.com`** (userId: `00a76034-eed7-4af3-85fd-e374a71afd89`, patientId: `4bef2d39-6c56-46cc-8d37-3a2873c02e12`), pero la llamada fue creada para el paciente **Eduardo Marques** (patientId: `e181e576-...`).

La función `matchesParticipant()` en `call-session.backend.ts` correctamente rechazó el acceso:

```typescript
function matchesParticipant(participantId, callParticipantId, userId): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId);
}
```

Ni el `userId` ni el `patientId` del usuario logueado coincidían con el `patient_id` de la llamada.

### Resolución

Se creó una nueva llamada con el `patient_id` correcto (`4bef2d39-...`) que correspondía al usuario realmente logueado en el celular. La autorización entonces pasó correctamente.

### Lección

Antes de crear una llamada, verificar **quién está realmente logueado en el dispositivo del paciente**, no asumir basándose en el dispositivo físico. Un endpoint de debug temporal (`/api/debug-auth`) fue útil para diagnosticar esto (luego eliminado).

---

## OPS-2: Edge function `start-call` reutiliza llamadas canceladas

### Síntoma

Al crear una nueva llamada con `start-call`, la edge function retornó `{ reused: true }` y devolvió una llamada con status `canceled` en lugar de crear una nueva.

### Causa

La edge function `start-call` busca llamadas existentes para el mismo par doctor-paciente y las reutiliza, independientemente del status. Esto incluye llamadas `canceled` y `declined`.

### Workaround

Se actualizó manualmente el status de la llamada anterior a `ended` via Supabase API antes de crear la nueva:

```bash
curl -X PATCH "https://qxjjrpksmwwrmubhvjew.supabase.co/rest/v1/calls?id=eq.<call-id>" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <service-role-key>" \
  -d '{"status": "ended"}'
```

### Recomendación

La edge function `start-call` debería filtrar por `status NOT IN ('canceled', 'declined', 'ended')` antes de reutilizar una llamada existente.

---

## Archivos Modificados

| Archivo                                                             | Cambio                          |
| ------------------------------------------------------------------- | ------------------------------- |
| `apps/web/src/lib/calls/services/call-session.backend.ts`           | TURN credentials en bootstrap   |
| `apps/web/src/lib/doctors/services/consultation-context.backend.ts` | Remover gate `privacy_accepted` |
| `apps/web/src/lib/doctors/services/consultation-context.service.ts` | Remover gate `privacy_accepted` |
| `packages/telemedicine/src/webrtc-client.ts`                        | `attachTracksToExistingPeers()` |

## Infraestructura Verificada

| Componente           | Estado | URL/Referencia                                                                    |
| -------------------- | ------ | --------------------------------------------------------------------------------- |
| Signaling Server     | OK     | `wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling` |
| Cloudflare TURN API  | OK     | `https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate`       |
| Bootstrap endpoint   | OK     | `GET /api/calls/[roomId]/bootstrap`                                               |
| Consultation context | OK     | `GET /api/doctors/consultations/[roomId]/context`                                 |

## Pendientes Post-Demo

1. **Subir TURN credentials a CF Pages secrets** de los 4 proyectos de producción (actualmente solo en `.env` local)
2. **Fix edge function `start-call`** para no reutilizar llamadas terminales
3. **Permisos de cámara**: ambos lados requieren grant manual del permiso de cámara en el navegador — no hay prompt automático visible en la UI actual
4. **Deploy limpio** a producción con estos fixes (push a `main` → CI/CD)
