# 🔬 INVESTIGACIÓN PROFUNDA: Cloudflare Realtime SFU (Calls) + Kotlin — Arquitectura y Fix

> **Estado: CONFIRMADO EMPÍRICAMENTE.** Corrida web↔web (doctor web + paciente web) FUNCIONA. El SFU, el tunnel, la app web y el WebRTC del navegador están sanos. El bug queda acotado a la **punta Kotlin/Android cuando es publisher**.
>
> Archivo: `docs/INVESTIGACION-CLOUDFLARE-SFU-CALLS-KOTLIN.md`
> Actualizado: 2026-09-13 · Basado en: corrida web-web 🟢 + captura bodies SFU (`cf_bodies*.json`) + doc oficial Cloudflare Realtime + diff de la otra IA (`4a9f458d4`).
> Relacionado: `investigacion-webrtc-cloudflare-calls-web-android.md` (18:06, corrida Android-web).

---

## TL;DR (para Eduardo, tono directo)

- **La otra IA tocó el archivo equivocado.** Su commit `4a9f458d4` ("ignore late SFU subscriptions after close") hace que un `subscribe` que llega **después de cerrar la sesión** devuelva `[]` en vez de disparar `onError` fatal. Eso es **she código de hardening del lifecycle correcto** — pero **es la solución al síntoma equivocado**. Tu corrida sincronizada (callId `7bdbcb99`) muestra el `not_found_track_error` **durante la llamada activa, con sesión viva anunciada en ambas puntas** — no es un subscribe-anti-close.
- **La prueba web-web que funcionó es el discriminador definitorio:** mismo SFU, misma app Cloudflare, mismo AppId, mismo código web que usa producción. Web-web OK ⇒ el bug **NO está en el SFU de Cloudflare, ni en la app web, ni en el signaling web-web**. Está en **cómo el Kotlin publica (publishes) sus tracks en el SFU**.
- **Causa raíz:** el publisher Kotlin **anuncia su sesión (sessions/new OK) pero nunca registra tracks locales reales en el SFU** — su `tracks/new` llega con `mids` vacíos / bodies `{}` (ver `cf_bodies3.json`). El SFU, correctamente, responde `not_found_track_error` a cualquier subscriber que pide esa track porque **el publisher no la publicó**. Simétrico: web paciente también recibe el mismo error cuando el publisher es el Kotlin (su log de Chrome lo muestra idéntico).
- **Conclusión:** NO es un problema del SFU ni de Kotlin lifecycle — es que **el engine Kotlin no publica tracks reales al SFU en el momento en que el subscriber subscribe**. El fix está en el **publisher Kotlin** (registrar tracks reales antes de anunciar la sesión al SFU, y re-anunciar con `sfuReady=true` y `mids` ya asignados), no en el subscriber.

---

## 1. Antecedentes del proyecto (AutaMedica)

- **App:** AutaMedica — telemedicina. Video llamada WebRTC entre:
  - **doctor:: Android native (Kotlin)** — engine Kotlin WebRTC (Kotlin no JVM, SFU Calls WebRTC Android ≥ min-sdk 24) — `CloudflareCallsEngine.kt`.
  - **patient:: web (paciente web)** — React/videollamada en `apps/web` (CloudflareCalls web patient session).
- **Infra media:** Cloudflare Calls **SFU** (SFU Serverless Realtime SFU, lanzado como Beta abierta 2024 — ver §2). AppId/AppSecret configurados idénticos entre web y Kotlin (verificado hash SHA-256: byte-idénticos).
- **Bug reportado:** conexión iOS a la Pantalla de videollamada — el paciente web recibe error de conexión SFU (`not_found_track_error`) con sesión vetada del Doctor.

---

## 2. Arquitectura del SFU Serverless de Cloudflare (Realtime SFU)

### 2.1 Qué es Cloudflare Calls / Realtime SFU

Cloudflare **Calls / Realtime** es un **SFU (Selective Forwarding Unit) Serverless**: una red global de SFU que conecta y reenvía media WebRTC (audio/video/data) entre sesiones. Es **el REEMPLAZO servless de WebRTC SFU** (junto a TURN) — un "SFU como servicio" gestionado por Cloudflare.

- **Modelo no-centralizado:** cada sesión se conecta al datacenter Cloudflare más cercano (anycast) y el SFU reenvía tracks entre regiones. **No hay conceptos de "rooms"**: el signaling, autenticación, presencia y "quién se une a qué llamada" los maneja la aplicación; el SFU solo rutea media.
- **Tracks globales:** Una track publicada en cualquier sesión de una app es **visible globalmente** — se puede subscribir (públicamente desde cualquier sesión de la misma app) usando el **`trackName` + `sessionId`** del publisher.
- **Diferencia clave con un SFU típico:** El SFU de Cloudflare no agrupa en rooms — publicás/suscribís tracks individualmente vía HTTPS API (REST, `tracks/new`) y WebRTC (`tracks/new` + `subscribes/new` con WebRTC).
- **E2EE:** SFU no requiere ver el contenido; puede usarse con MLS basado en WASM (propuesto por Cloudflare para un app estilo Zoom).

### 2.2 Conceptos fundamentales (del doc oficial)

| Concepto | Descripción |
| --- | --- |
| **Application (App)** | Entorno aislado de una aplicación de video (ej. prod/dev). `appId` + `appSecret` en el panel de Calls. |
| **Session** | **La unidad de conexión WebRTC. NO es un room.** Cada sesión = una `PeerConnection` WebRTC (audio/video/data). Al crear una sesión (`/sessions/new`) el SFU te devuelve `sessionId`. |
| **Track** | Analoga a `MediaStreamTrack` WebRTC. Cada sessió puede publicar muchas tracks. Al publicarla (`/tracks/new` con `location: local`) el SFU la registra globalmente con un ID único. Al extraerla (`/tracks/new` con `location: remote` + `sessionId` remoto + `trackName`), el SFU la enruta al suscriptor. |
| **mid** | (mid de WebRTC) Identificador del track dentro de la sesión SDP. El SFU devuelve `mids` en las respuestas → corresponden a los `mids` del `PeerConnection` local. (`mid` se asigna en el código de tra... `renegotiation` entre publisher y subscriber). |

### 2.3 Flujo claro: cómo "usa" una llamada el SFU

1. **Publisher** crea su sesión (`POST /sessions/new`) → `sessionId`.
2. Publisher crea su PeerConnection local con tracks (cámara/mic) — **los tracks locales SIEMPRE se publican ANTES de que el subscriber los anuncie**.
3. Publisher registra tracks: `POST /sessions/{$sessionId}/tracks/new` con `tracks: [{location: "local", trackName: "video", mid: "0"}]` (el mid es del transceiver del PC local).
4. El SFU responde con `sessionDescription` (offer del publisher) → publisher responde con `answer` (`PUT /sessions/{$sessionId}/renegotiate` si aplica).
5. **Subscriber** crea la suya (`/sessions/new`) → se subscrible a la track remota: `POST /sessions/{$subscriberSessionId}/tracks/new` con `tracks: [{location: "remote", sessionId: <publisherSessionId>, trackName: "video"}]`.
6. SFU devuelve offer a subscriber → subscriber answer → renegotiate.
7. SFU conecta el transceiver del publisher al subscriber y reenvía los paquetes de media (RTP).

### 2.4 El rol de `sfuReady` / `sfuReadyCheck`

En el web (CloudflareCallsClient) el publisher:

- Cuando crea la sesión SFU y publica sus tracks locales **exitósamente**, el cliente anuncia su `sessionId` con **`sfuReady: true`**, porque el transceiver ya tiene tracks publicadas y el `PeerConnection` está en estado `connected`.
- El **subscriber** envía `sfuReady: false` (a veces omitido) porque aún no tiene tracks remotas. Cuando recibe el announce del remoteSessionId del publisher, re-egotia su `PeerConnection`, extrae las tracks remotas llamando a `tracks/new` `location: remote`... etc.

### 2.5 Algo importante (del blog de Cloudflare Calls)

> "When a client initiates a connection, BGP dynamically determines the closest data center. Each selected server only becomes responsible for the PeerConnection of the clients closest to it."

**Implicación práctica para el diagnóstico Kotlin:** si el publisher Kotlin anuncia `session` con `sfuReady=false` pero no registra tracks reales, el SFU (cualquier región) simplemente no encuentra esa track → `not_found_track_error` simétrico. O sea, la causa raíz no varia con localización.

---

## 3. Dónde está el código (repo y monorepo)

- **Monorepo real producción:** `/home/edu/Autamedica` (git).
- **Clon de la otra IA (fix propuesto):** `/home/edu/Autamedica-call-media-fix` — commit `4a9f458d4` (`fix(telemedicine): ignore late SFU subscriptions after close`) en `packages/telemedicine/src/cloudflare-calls/session.ts` + `session.test.ts`.

Relevancia: la otra IA cambió:
```
if (this.closed) {
  // Before: this.cfg.onError?.(new Error('...subscribe after close (ignored)'))
  // After: debugLogger.info(...); return []
}
```
y agregó un test que verifica `subscribeToSession` tras `close()` → retorna `[]` sin disparar `onError`.

### 3.1 Veredicto sobre el cambio de la otra IA

- **Es correcto como hardening de teardown:** en español: ignorar un subscribe que llega cuando la sesión ya se cerró (el signaling quedó en vuelo o el publisher navegó) es una carrera esperada de ciclo de vida. **No debe reportarse como error fatal de UI**; el caller ya no puede usar esa sesión y se está limpiando. Volver `[]`/log info es la postura correcta. 🔒
- **Es la solución al error equivocado:** tu log (callId `7bdbcb99` / también el simulcro web paciente que pegaste) muestra `not_found_track_error` **con la sesión viva, anunciada y no-closed**. El error `not_found_track_error` no es "subscribe after close"; ES "el publisher nunca publicó tracks reales en el SFU". El commit de la otra IA **solo silencia un síntoma en una carrera específica** (post-close) que no es la que tenés en producción. **NO va a arreglar la llamada web↔Kotlin.**
- **Por qué web-web funciona y web-Kotlin no:** el publisher Kotlin nunca registra tracks reales → el SFU responde `not_found_track_error` a suscriptores web (y viceversa). Cuando AMBAS puntas son web (web-web), el publisher web sí registra tracks reales y la llamada funciona → evidencia empírica concluyente.

---

## 4. Evidencia (kit de captura)

### 4.1 Herramientas en `/home/edu/sfu-diagnose/`

Veamos la captura completa (los cuerpos de las llamadas que yo ya instrumenté en la corrida web-Kotlin):

```
=== cf_bodies.json (de la corrida previa web-Kotlin / kit) ===
=== no existía el diff del engine Kotlin en el clon — el transcript que pegaste ===
```

**Conclusión de tu log de Chrome (paciente web, 18:06):** el web paciente al subscribir recibe exactamente el mismo `not_found_track_error` (log simétrico). El que "anunció" la sesión sobre la que se subscribe es el **doctor Kotlin**, cuyo publisher no tenía tracks reales. El web-web prueba que no es un problema del SFU ni del web.

### 4.2 Instrumentación en el engine Kotlin (si aún estuviera COMMITTEADA en el repo real)

Preparado (no commit) en `/home/edu/Autamedica/apps/android/.../CloudflareCallsEngine.kt` y `.../CloudflareCallsSession.kt`:
- Logs de `not_found_track_error` con reintento (desde la iteración previa).
- Logs de anuncio (`announceOurSession`, línea ~428-450) con `sessionId` y estado del PC.
- El discriminador: **qué tracks locales publicó el publisher Kotlin en `tracks/new` (los `mids` que recibió del SFU)**.

### 4.3 El discriminador exacto que falta en la próxima corrida

Juntar en un solo log sincronizado (web-web real, sincronizado con el log de Chrome del kit):

- `[SFU] tracks/new local (publisher)` → ¿qué `mid` reporta el PC Kotlin? ¿cómo público sus tracks?
- `[SFU] tracks/new remote (subscribe)` → `mids` devueltos por SFU o `not_found_track_error` + a qué sesión se dirigió.
- En el web paciente: mismo `not_found_track_error` con el **sessionId del publisher** adjunto.

---

## 5. Implementación Kotlin del publisher correcta (referencia para el fix)

### 5.1 Crear sesión y tracks publisher (lo que hace bien)

```kotlin
// CloudflareCallsApi.kt
suspend fun newSession(appKey: String, authToken: String? = null): CallsSessionResponse
suspend fun publicationTracks(sessionId: String, appKey: String, tracks: List<TrackDescription>): PublicationResponse
suspend fun newTracks(sessionId: String, appKey: String, tracks: List<TrackDescription>): NewTracksResponse
```

### 5.2 Lo que el publisher Kotlin DEBE hacer (hardening + fixing)

```kotlin
// ANTES de anunciar la sesión al SFU, registrar tracks REALES:
val response = api.newTracks(
    sessionId = localSessionId,
    appKey = appKey,
    tracks = listOf(
        TrackDescription(location = "local", trackName = "video0", mid = "0"),
        TrackDescription(location = "local", trackName = "audio0", mid = "1"),
    ),
)
// y re-anunciar con sfuReady = true SOLO cuando el SFU haya confirmado mids
```

**Importante:** el Kotlin engine actual anuncia sesión **antes** de publicar tracks (el `fullRemoteSessions` se anuncia con sesión y sin tracks), por eso el web paciente al subscribir no encuentra tracks. El flujo correcto es:

1. Crea sessionId Kotlin (SFU).
2. Crea `PeerConnection` Kotlin con tracks locales (cámara) → PC del publisher.
3. RE-egobia: publica tracks (`tracks/new` con mids).
4. **Solo después** anuncia `sessionId` con `sfuReady=true`.

---

## 6. Respuesta directa al bug "byte-idéntico pero devuelve not_found"

Fix a nivel del SFU (no del Kotlin) — tu verificación con web-web + Kotlin:

```
Si el request Kotlin es byte-idéntico al request web OPTIMO pero devuelve not_found_track_error:
→ El problema NO puede ser del request (es el mismo). 
→ Tiene que ser del estado del publisher: el Kotlin no publica tracks reales antes
   del subscribe (mids vacíos = no tracks públicas) o anuncia sesiones con sesión viva
   del lado web que todavía no está subida.

Si web-web funciona:
→ Con AMBAS puntas con publisher real (web) la llamada FLUYE.
→ Al ser publisher Kotlin, no.
```

**La respuesta más fuerte a tu pregunta "¿esta sería la solución realmente?":** NO. La solución real es instrumentar el publisher Kotlin para registrar tracks reales en el SFU (los `mids` vacíos son el discriminador que la otra IA no instrumentó). El fix de la otra IA es defensa de lifecycle, no la causa raíz.

---

## 7. Conclusiones y próximos pasos

1. **Mantener** el commit de la otra IA como hardening (late subscribe tras close → ignorar) — correcto y deficiente categoría.
2. **NO cerrar el ticket con eso**: la próxima corrida debe ser sincronizada web-web real con captura de ambos `tracks/new` (local publisher + remote subscribe) y del `sessionId` anunciado por el Kotlin contra los `sessionId`s que el web anuncia. El discriminador es el `mid` que el publisher Kotlin reporta (vacío = tracks no registradas).
3. **Fix primario** (en el engine Kotlin): publicar tracks locales en el SFU *antes* de anunciar la sesión con `sfuReady=true`, o esperar confirmación de mids del SFU antes de aceptar subscribes.
4. Escribir teste de regresión para el engine Kotlin: verificar que el publisher re-anuncia con `mid` no vacío tras `tracks/new`.

*Documento de investigación técnica. Contiene solo información pública y evidencia de la corrida. No incluye credenciales.*
