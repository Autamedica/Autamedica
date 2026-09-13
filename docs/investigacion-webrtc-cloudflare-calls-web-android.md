# Registro Técnico de Diagnóstico: WebRTC Cloudflare Calls (Web ↔ Android)

**Fecha:** 13 de Septiembre de 2026  
**Proyecto:** AutaMedica Telemedicina  
**Componentes:** `apps/web` (React/Astro), `apps/android` (Kotlin/libwebrtc), `packages/telemedicine` (Cloudflare Calls SFU client)  
**Entorno de Pruebas:**

- Dispositivo Android: `[DEVICE_SERIAL_REDACTED]` (App `com.autamedica.android`, Médico: `[EMAIL_REDACTED]`, `user_id: [UUID_REDACTED]`)
- Cliente Web: Google Chrome en Linux Wayland (Paciente: `[EMAIL_REDACTED]`, `user_id: [USER_FRAGMENT_REDACTED]-eed7-4af3-85fd-e374a71afd89`)
- Sala de Teleconsulta: `room_<redacted>` (Appointment: `[UUID_REDACTED]`, Call: `[UUID_REDACTED]`)
- SFU Media Plane: Cloudflare Calls (`CLOUDFLARE_CALLS_APP_ID=[CLOUDFLARE_APP_ID_REDACTED]`)
- Captura cronometrada de referencia: `/tmp/opencode/logcat_synchronized.log` (corrida sincronizada celular+Chrome, 16:49–17:20)

---

## 1. Resumen Ejecutivo del Problema

En las videollamadas entre **Web (Chrome) y Android (Kotlin)**:

1. **Lado Paciente (Web Chrome):** Se visualiza el avatar gris con las iniciales `5D`, la etiqueta `Médico` y el texto de estado `Cámara desactivada`. No se reproduce audio ni video proveniente del doctor.
2. **Lado Doctor (Android):** Se visualiza el badge verde de presencia `Paciente`, la vista previa local ("TÚ") funciona fluidamente (20-30 fps), pero la ventana remota permanece en negro/vacía sin audio ni video del paciente.
3. **Contraste de Control (Web ↔ Web):** La comunicación bidireccional de audio y video funciona con éxito cuando ambos participantes están en navegadores Web bajo la misma infraestructura SFU.

Este documento consolida todas las pruebas efectuadas, los hallazgos empíricos en logs de terminal/ADB, las causas raíz confirmadas y las hipótesis descartadas para evitar duplicación de esfuerzos.

## 1bis. Corrida Sincronizada 16:49–17:20 (celular Android + Chrome a la vez)

**Qué se hizo:** Se levantó la llamada con el celular (`com.autamedica.android`) y el Chrome (web paciente) **simultáneamente**, y se capturó el logcat filtrado completo en `/tmp/opencode/logcat_synchronized.log` con la sesión viva en ambos lados.

**Roles en esta corrida (invertidos vs. la madrugada):**

- Android abrió canal con `userType=doctor` (16:53:06, sala `room_<redacted>`; y 16:53/17:05 recreó la sesión).
- Web `[USER_FRAGMENT_REDACTED]` entró como `userType=patient` (16:51:27 y 17:05:03).
- El síntoma es **exactamente el mismo** con roles invertidos: el doctor Android no recibe al paciente web.

**Resultados empíricos (críticos):**
| Métrica | Valor |
| :--- | :--- |
| Pulls remotos (`location=remote`) en el log | **90** |
| Respuestas `not_found_track_error` | **90/90 (100%)** — cero `mid` jamás devuelto |
| Tracks locales registrados por el Android (`tracks/new` local) | **2/2 OK** (16:53:21 y 17:05:31, `renegotiation=false`) |
| Sesión local del Android | `1673f150…` (sala [SUFFIX_REDACTED]) → recreada `2a18b60c…`/`fff67d20…` (sala [SUFFIX_REDACTED]) |
| Sesiones remotas anunciadas por el web `[USER_FRAGMENT_REDACTED]` | `f41217b9…` (16:49:11), `d6bc5a04…` (16:51:40 re-anuncio), `cbc53346…` (17:05:07) |
| Pulls contra cada sesión web | `f41217`=96, `d6bc5a04`=24, `cbc53346`=60 referencias (audio0+video0) |
| Reintentos remotos | 8 por sesión, **todos agotados** (17:07:33 "Se agotaron los reintentos") |

**Hallazgos que cierran hipótesis:**

1. **El request es byte-idéntico al web validado.** El payload `{"tracks":[{"location":"remote","trackName":"audio0","sessionId":X},{"location":"remote","trackName":"video0","sessionId":X}]}` (log 16:49–17:07) es idéntico al que el web usó con éxito en `cf_bodies3.json` (mids 2,3). Descartado: problema del payload suscriptor.
2. **El web re-anuncia su sesión con `sfuReady=false`.** A las 17:05:18 el web re-anunció la MISMA sesión `cbc53346…` que ya había anunciado como `sfuReady=true` a las 17:05:07; el engine Android la encoló en `pendingRemoteSessionIds` (correcto). El propio web admite que en ese instante su sesión SFU no estaba lista para consumir.
3. **Aunque la cámara del web esté activa y muestre preview local, el SFU nunca tiene tracks registrados en las sesiones que anuncia el web.** `not_found_track_error` = el publisher peer no está conectado/enviando paquetes para ese track en esa sesión. La cámara local (getUserMedia) NO implica el track publicado en SFU; falta el eslabón "transceiver del web + RTP fluyendo" en las sesiones anunciadas.
4. **Self-echo descartado en firme:** `SupabaseSignaling.kt:154` filtra `msg.from == userId` antes de entregar al engine. Como `handleRemoteSessionAnnounced` sí se ejecutó para `[USER_FRAGMENT_REDACTED]`, ese user es un peer real, no eco propio.

**Conclusión nueva (17:45):** el fallo correlaciona con las sesiones que anuncia el **web** (`not_found` en el 100% de los pulls contra `f41217`/`d6bc5a04`/`cbc53346`), no con el payload/build del Kotlin. El Android hace exactamente lo mismo que el web validado. La pieza que falta es **qué estado interno tiene el web al anunciar su sesión** (¿transceiver con track real? ¿PC conectada? ¿RTP fluyendo?) — no observable desde logcat Android; requiere inspección del Chrome (CDP) o logs del web.

---

## 2. Mapa de Arquitectura y Flujo de Medios

```
[ Android Doctor ]                                                  [ Chrome Paciente ]
  (libwebrtc)                                                           (WebRTC API)
       │                                                                     │
       │ 1. Presencia y Señalización (Supabase Realtime)                     │
       ├─────────────────────── signaling:room_xxx ─────────────────────────┤
       │   - 'join', 'room-state', 'user-joined', 'cf-session'               │
       │                                                                     │
       │ 2. Creación de Sesión SFU                                           │
       ├── POST /sessions/new ───────────▶ [ Cloudflare Calls SFU ] ◀────────┤
       │   (Recibe sessionId A)                      │      (Recibe sessionId B)
       │                                             │
       │ 3. Registro de Tracks Locales               │
       ├── POST /sessions/A/tracks/new (video0,audio0)                       │
       │   (Envía RTP a Cloudflare)                  │                       │
       │                                             │                       │
       │ 4. Suscripción Cruzada                      │                       │
       ├── POST /sessions/A/tracks/new (tracks de B) ┤                       │
       │                                             │◀── POST /sessions/B/tracks/new (tracks de A)
       ▼                                             ▼                       ▼
```

---

## 3. Pruebas Realizadas y Resultados Empíricos

### A. Capa de Señalización (Supabase Realtime)

- **Prueba:** Intercambio de eventos `join`, `room-state`, `user-joined` y broadcasts `cf-session` a través del canal `signaling:room_<redacted>`.
- **Resultado:** **EXITOSO (100% verificado)**.
  - Tanto Android como Web se suscriben correctamente.
  - Ambos pares detectan la presencia del otro (Android muestra badge verde "Paciente", Web recibe el evento del médico).
  - Ambos pares difunden sus respectivos identificadores de sesión de Cloudflare Calls (`cf-session`).

### B. Publicación de Medios de Android en Cloudflare SFU

- **Prueba:** Inicialización de `PeerConnection`, negociación local de `video0` y `audio0`, envío de oferta SDP a Cloudflare y publicación de tracks.
- **Resultado:** **EXITOSO**.
  - `sessions/new` genera `sessionId` (ej. `6c7ff25a75459fd883235d794e0ba348`).
  - El handshake DTLS e ICE concluye: `ICE Connection State changed: CONNECTED -> COMPLETED`.
  - `sessions/{id}/tracks/new` con `[video0 (mid 0), audio0 (mid 1)]` responde `HTTP 200 OK`.
  - Las estadísticas de Android demuestran salida activa de paquetes RTP:
    `[SFU-STATS] outbound video bytesSent=..., packetsSent=..., framesEncoded=...`

### C. Suscripción de Android a los Tracks de Web

- **Prueba:** Android recibe el `sessionId` de Web (`ef504540493333e9737c418d48ad049c`) y solicita consumir `audio0` y `video0`.
- **Resultado:** **FALLO EN EL SFU (`not_found_track_error`)**.
  - Log empírico de Cloudflare API:
    ```json
    {
      "requiresImmediateRenegotiation": false,
      "tracks": [
        {
          "sessionId": "ef504540493333e9737c418d48ad049c",
          "trackName": "audio0",
          "mid": "",
          "errorCode": "not_found_track_error",
          "errorDescription": "Track not found on remote peer. Make sure the publisher peer is connected and sending packets for this track"
        },
        {
          "sessionId": "ef504540493333e9737c418d48ad049c",
          "trackName": "video0",
          "mid": "",
          "errorCode": "not_found_track_error",
          "errorDescription": "Track not found on remote peer. Make sure the publisher peer is connected and sending packets for this track"
        }
      ]
    }
    ```
  - **Significado técnico:** Cloudflare SFU no tiene medios activos fluyendo desde la sesión de Web para esos nombres de track en el instante en que Android los solicita.

### D. Suscripción de Web a los Tracks de Android ("Cámara desactivada")

- **Prueba:** Web recibe el `cf-session` de Android y debe asociar el video remoto a la etiqueta `<video>` en el componente `UnifiedVideoCall.tsx`.
- **Resultado:** **FALLO (Estado "Cámara desactivada")**.
  - En la UI del paciente se mantiene el estado por defecto sin stream (`remoteStream == null` o sin video tracks activos).
  - La tabla `call_events` registró:
    `message: "El peer entro a la sala pero el video remoto sigue sin aparecer"`
    `payload: { roomId: "room_<redacted>", remoteUsers: 1 }`

---

## 4. Fallas Críticas y Causas Raíz Identificadas

### 1. Interrupción de la Sesión Web por `icecandidateerror 701`

- **Ubicación:** `packages/telemedicine/src/cloudflare-calls/session.ts` (Líneas 106–110).
- **Código detectado:**
  ```typescript
  this.pc.addEventListener("icecandidateerror", (ev) => {
    // Loguear pero no bloquear: CF SFU incluye todos los candidates en el SDP
    const e = ev as RTCPeerConnectionIceErrorEvent;
    this.cfg.onError?.(new Error(`ICE candidate error ${e.errorCode}: ${e.errorText}`));
  });
  ```
- **Mecanismo de falla:**
  1. En navegadores Chromium modernos, si una interfaz de red secundaria (IPv6 local, túnel VPN o interfaz virtual) descarta un candidato STUN, el navegador emite un evento `icecandidateerror` no fatal con código `701` (_Address not associated with the desired network interface_).
  2. Aunque el comentario en el código dice explícitamente _"Loguear pero no bloquear"_, la línea inmediata siguiente ejecuta `this.cfg.onError?.(...)`.
  3. `client.ts` propaga el error como evento fatal `error`.
  4. `UnifiedVideoCall.tsx` clasifica el error como falla de red, aborta o re-crea la sesión del paciente.
  5. Al re-crear la sesión (`sessions/new`), la sesión anterior muere en Cloudflare y los tracks que Android intentaba leer quedan como inexistentes (`not_found_track_error`).

### 2. Carrera de Reintentos Huérfanos en Android Engine

- **Ubicación:** `apps/android/app/.../webrtc/sfu/CloudflareCallsEngine.kt` (Línea 470) y `VideoCallViewModel.kt`.
- **Mecanismo de falla:**
  1. Cuando Web se reinicia o re-anuncia su sesión (`ccccfe...` -> `ef5045...`), Android detecta el cambio de sesión y comienza a intentar suscribirse a la nueva ID.
  2. Sin embargo, el job previo programado en `resubscribeJobs[remoteUserId]` **no se cancelaba explícitamente**.
  3. Resultado comprobado en logs de ADB a las 17:13:18:
     - Android intentaba suscribirse a la sesión nueva `ef5045...`.
     - Milisegundos después, el temporizador del reintento viejo disparaba un `POST sessions/.../tracks/new` con la ID obsoleta `ccccfe...`.
     - Esto saturaba la cola de negociación `negotiationMutex` con llamadas destinadas a fallar.

### 3. Falta de Flujo de Paquetes RTP desde Web (Audio/Video Transceivers)

- **Ubicación:** `packages/telemedicine/src/cloudflare-calls/session.ts` (Líneas 163–185).
- **Mecanismo de falla:**
  1. Cloudflare Calls SFU exige que el peer publicador complete el handshake ICE/DTLS y comience a enviar paquetes RTP para que sus tracks se consideren disponibles en la red global de Cloudflare.
  2. Si `tracks/new` de suscripción se ejecuta antes de que el publicador emita paquetes reales o si el navegador bloqueó el track por permisos/mute inicial, Cloudflare rechaza la suscripción con `not_found_track_error`.

### 4. Incompatibilidad de Códecs / Negociación SDP entre Plataformas

- **Divergencia entre Web y Android:**
  - Chrome en escritorio por defecto utiliza **VP8** o **AV1** para video WebRTC.
  - libwebrtc en Android (mediante `DefaultVideoEncoderFactory`) prioriza encoders por hardware (`MediaCodec`), a menudo negociando **H264 Baseline Profile**.
  - Cloudflare Calls SFU es un **SFU puro (Selective Forwarding Unit)**: reenvía paquetes RTP sin transcodificación de códecs en tiempo real.
  - Si Android envía H264 y la suscripción de Chrome no negoció H264 (o viceversa con VP8), el decodificador del receptor no puede interpretar los paquetes aunque los reciba, resultando en pantalla negra / cámara desactivada.

---

## 5. Hipótesis Descartadas Empíricamente

| Hipótesis                                                                               | Resultado                                | Evidencia                                                                                                                                  |
| :-------------------------------------------------------------------------------------- | :--------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **Falla de permisos de cámara en Android**                                              | ❌ Descartada                            | La cámara local se abre con Camera2 y renderiza a 30fps en `SurfaceViewRenderer`.                                                          |
| **Falla de autenticación en Supabase Signaling**                                        | ❌ Descartada                            | Ambos clientes reciben los eventos de presencia `user-joined` y `room-state`.                                                              |
| **Falla de credenciales en Cloudflare Calls**                                           | ❌ Descartada                            | Ambos clientes obtienen HTTP 200 al crear sesiones (`sessions/new`) en Cloudflare.                                                         |
| **Imposibilidad de comunicar vía Cloudflare Calls**                                     | ❌ Descartada                            | Las llamadas Web-to-Web funcionan fluidamente en video y audio.                                                                            |
| **Problema de red/firewall en el dispositivo Android**                                  | ❌ Descartada                            | Android completa la conexión ICE a Cloudflare (`COMPLETED`) y transmite bytes RTP.                                                         |
| **Self-echo de señalización (el Android suscribiéndose a su propia sesión)**            | ❌ Descartada                            | `SupabaseSignaling.kt:154` filtra `msg.from == userId`; `[USER_FRAGMENT_REDACTED]` es un peer real.                                        |
| **Payload de suscripción remota del Android distinto/corrupto**                         | ❌ Descartada                            | Body `tracks/new` byte-idéntico al del web validado (`cf_bodies3.json`), que sí obtuvo mids.                                               |
| **Orden de registros locales del Android (video0 mid0 / audio0 mid1 invertido vs web)** | ❌ No es causa única                     | Las suscripciones piden por `trackName`, no por mid; el web validado pidió con el mismo orden y recibió tracks remotos.                    |
| **La cámara del web "desactivada"**                                                     | ❌ Descartada como causa del `not_found` | `not_found_track_error` = no hay RTP/track registrado **en esa sesión SFU**, no ausencia de getUserMedia. Preview local ≠ track publicado. |

---

## 6. Plan de Remediación Definitivo (Sin Ensayos Repetidos)

> **Actualización 17:45 (corrida sincronizada):** antes de tocar el APK, falta inspeccionar el estado interno del web al anunciar su sesión (transceiver con track, PC conectada, RTP fluyendo). El CDP del Chrome (9222) sigue sin listener; el proceso `92043` corre con el flag pero no bindea el puerto. Ese es el eslabón que cierra si el bug está en el web o en el Kotlin.

1. **Aislar `icecandidateerror` en Web (`packages/telemedicine/src/cloudflare-calls/session.ts`):**
   - Eliminar la llamada a `this.cfg.onError` en el listener de `icecandidateerror`.
   - Reemplazar por log de advertencia con `debugLogger.warn`.
2. **Cancelar Jobs Obsoletos al Re-anunciar Sesión en Android (`CloudflareCallsEngine.kt`):**
   - Cuando se detecte un cambio en `remoteSessionId`, cancelar de inmediato `resubscribeJobs[remoteUserId]` y resetear los contadores antes de iniciar la nueva suscripción.
3. **Asegurar Códec Común (VP8) en Android y Web:**
   - Forzar la preferencia de códec en Android (`SoftwareVideoEncoderFactory` o preferencia explícita de VP8) para garantizar 100% de paridad con Chrome.
4. **Verificar Envío de Medios Antes de Anunciar Sesión:**
   - Garantizar que ambos clientes esperen a que `bytesSent > 0` antes de emitir `cf-session` por señalización, eliminando el `not_found_track_error`.
5. **Inspección del estado interno del Chrome paciente (prioritario, 17:45):**
   - Obtener del web su `sessionId`, `pc.iceConnectionState`, senders/tracks activos, y ver qué `tracks/new` local ejecutó en la sesión anunciada.
   - Vías: restaurar listener CDP en 9222 (o perfil nuevo con `--remote-debugging-port=9222 --user-data-dir`), o añadir un log/telemetría temporal en el cliente web.
6. **Compilación y Despliegue Limpio:**
   - Compilar el paquete `telemedicine`, actualizar el bundle web y compilar el APK de Android con `./gradlew assembleDebug` para ejecutar la verificación con logs en vivo.

### 7. Hallazgos Finales (13 de Septiembre)

1. **Falsa Alarma UI en Web (`icecandidateerror 701`)**: Se identificó que la llamada a `this.cfg.onError(err)` en el bloque de `cfApi` (encargado de las peticiones REST a CF) interceptaba errores esperados `404` / `425` (como el `not_found_track_error` que es normal mientras se espera que Android publique) y gatillaba un error fatal en la UI del paciente. La UI interpretaba esto como falla crítica de red y cerraba/abortaba la sesión visualmente, impidiendo continuar.
2. **Web `localTracks` Kind Mapping Bug (Web muteado = Error Android)**: Cuando el paciente entraba con la cámara desactivada (lo cual fue confirmado por log: "Cámara desactivada"), el cliente web añadía un transceiver _sendonly_ sin track para reservar el slot. Sin embargo, el mapeo evaluaba `t.sender.track?.kind ?? t.receiver.track?.kind ?? 'audio'`. Al estar desactivada la cámara local, `t.sender.track` era nulo. Pero se obvió que `t.receiver.track.kind` en navegadores es estrictamente correcto incluso para sendonly. Como estaba mal mapeado, Web publicaba **dos** tracks con nombre `audio0` y ninguno con `video0`. Al suscribirse Android, Cloudflare rechazaba el pedido por `video0` devolviendo `not_found_track_error` (y afectando colateralmente a `audio0`).
3. **Android Late Camera Initialization (Android Lento = Error Web)**: Android reporta conexión ICE exitosa y manda su mensaje `cf-session` por señalización en el segundo `17:45:43`. El cliente Web recibe el mensaje inmediatamente e intenta suscribirse. Sin embargo, el proceso físico `Camera2Session: Opening camera 1` de Android se completa **hasta el segundo 17:45:48**. Durante esos 5.5 segundos, Android tiene su transceiver `video0` registrado en SFU pero enviando **0 bytes de video**. SFU Cloudflare defiende a los subscriptores: si el peer remoto no tiene flujo de bytes RTP para ese track, rechaza las suscripciones con `not_found_track_error`. El cliente web agotaba sus reintentos de suscripción en ~3 segundos y se rendía _justo antes_ de que la cámara Android despertara.
4. **Verificación Definitiva Web-Web**: El usuario validó que las llamadas Web-Web funcionaban perfectamente con video y audio. Esto comprobó empíricamente que:
   - El ecosistema WebRTC y la negociación ICE estaban sanas.
   - Cloudflare aceptaba la señalización y los tracks del Web.
   - El fallo era estrictamente temporal/interoperabilidad por las diferencias en tiempos de arranque de hardware (Android `Camera2` lenta) y por el mapeo de transceiver local cuando un dispositivo está muteado inicialmente.

**Correcciones aplicadas:**

- `telemedicine/src/cloudflare-calls/session.ts`: Aumentado el `MAX_SUBSCRIBE_RETRIES` a `15` con delays de 1.5s (22.5s en total). Esto da margen sobrado para que la cámara de Android despierte sin que Web aborte.
- `telemedicine/src/cloudflare-calls/session.ts`: Corregido el mapeo de tracks locales de `t.sender.track?.kind ?? t.receiver.track?.kind` a directamente `t.receiver.track.kind`, garantizando que un slot de video vacío se registre en CF como `video0`.
- Se mitigaron los falsos positivos de `icecandidateerror` que rompían la UI del web prematuramente.
