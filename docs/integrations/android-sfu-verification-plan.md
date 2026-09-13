# Plan de Verificación — Cloudflare Calls SFU en Android (PR2)

> Gate: compilar, instalar, llamada real Android ↔ web, validar con evidencias.
> Estado: iniciado el `2026-09-12`. Cada gate exige evidencia ejecutable en log de terminal; ningún gate se da por cerrado sin su comando verde.

## Contexto

- PR2 migra el plano de medios de Android de malla P2P (WebRTCEngine + SignalingWebSocket) a Cloudflare Calls SFU.
- Piezas nuevas: edge function `supabase/functions/cloudflare-calls` (verificada: 9/9 tests Deno) y port Kotlin en `apps/android/app/src/main/java/com/autamedica/android/presentation/videocall/webrtc/sfu/` (`SignalingModels.kt`, `CloudflareCallsApi.kt`, `SupabaseSignaling.kt`, `CloudflareCallsSession.kt`, `CloudflareCallsEngine.kt`) con swap en `VideoCallViewModel`.
- Contrato de interoperabilidad validado contra `packages/telemedicine/src/supabase-signaling.ts` y `cloudflare-calls/client.ts`:
  - Canal Realtime `signaling:{roomId}`, evento broadcast `signaling`, presence `key=userId` con payload `{userId, userType}`.
  - Envelope de señalización `{type, from, to?, data?}` con `from` siempre = id del remitente.
  - Cada peer anuncia su `sessionId` real vía mensaje `cf-session`; dedupe por sessionId; re-announce si cambia (reconexión).
  - Chat viajando como `data.message` (no data channel).

## Gates

### Gate 1 — Compilación

```bash
cd /home/edu/Autamedica/apps/android
./gradlew :app:compileDebugKotlin
# Exitoso: BUILD SUCCESSFUL sin errores del paquete sfu/
```

**Estado: PASADO el 2026-09-12** — `./gradlew :app:compileDebugKotlin` → `BUILD SUCCESSFUL in 13s` (18 acciones up-to-date). Errores corregidos en el ciclo: MediaType `MEDIA_TYPE_VIDEO/AUDIO`, `RtpSender.setTrack(track, false)` en vez de `replaceTrack`, sin guards `cont.isActive`, import `io.github.jan.supabase.realtime.channel` y member `presenceChangeFlow()`, `session?.sessionId` en vez de `getSessionId()`, `from` null-safe en `user-joined/user-left`.

Verificaciones accesorias si el entorno lo exige:

- `./gradlew :app:compileDebugJavaWithJavac` (si aplica).
- `./gradlew :app:lintDebug` (opcional, no bloqueante).

### Gate 2 — Tests unitarios del port (cuando existan)

```bash
./gradlew :app:testDebugUnitTest
# Exitoso: PASSED en los tests de sfu/ y de VideoCallViewModel si se agregan.
```

Nota: aún no hay tests Kotlin dedicados del port. Pendiente: portar casos de client/session TS (dedupe de `cf-session`, buffer de señalización, re-announce tras reconexión).

### Gate 3 — Instalación en device/emulador

```bash
export PATH="$HOME/Android/Sdk/platform-tools:$PATH"
adb devices                       # al menos una línea <serial> device
./gradlew :app:installDebug
# Exitoso: Installed on 1 device.
```

Si se usa emulador backend:

```bash
$HOME/Android/Sdk/emulator/emulator -list-avds && $HOME/Android/Sdk/emulator/emulator -avd <avd> &
```

### Gate 4 — E2E llamada real (Android ↔ web)

Precondiciones:

- Edge function `cloudflare-calls` deployada en el proyecto Supabase usado, con `CLOUDFLARE_CALLS_APP_ID` y `CLOUDFLARE_CALLS_APP_SECRET` en runtime (sin ellas, `resolveRuntime`/la edge responden 503).
- Sala real `room_XXXX` creada (vía web: agenda → iniciar llamada), no la preview de `VIDEO_PREVIEW_APPOINTMENT_ID`.
- Dos roles: doctor en un extremo, paciente en el otro (Android en un rol, web en el otro).

Flujo:

1. Doctor (o paciente) abre la llamada desde la agenda/notificación con `roomId` real.
2. Ambos extremities `connectionState == CONNECTED`.
3. El video remoto entra (`remoteVideoTrack` no nulo) en el extremo Android.
4. El chat cruza en ambas direcciones (mensaje visible en el extremo opuesto).

### Gate 5 — Evidencias en log (SFU sano)

En `adb logcat -s "[SFU]"` (timber tag) y con `adb logcat -v time`:

- `CF Session established` / `Supabase RTC connected` con sessionId setear.
- `Sesión remota anunciada (user=...)` y `Remote video track received (mid=..., user=...)` en Android.
- Sin `tracks/new` que devuelva 406 ni `no conectado aún` (ASTRO-B/C).
- `user-left` limpia estado remoto (`forgetRemotePeer`) sin leaks de `midOwner`.

Servidor:

```bash
# logs de la edge function (retroinspección post-llamada)
supabase functions logs cloudflare-calls
# registros esperados: sessions/new, tracks/new, renegotiate, tracks/close, sin 401/403/503.
```

### Gate 6 — Contraparte adversaria (Visual/Interop QC)

Antes de declarar el PR listo:

- Re-ejecutar flujos en contexto fresco con un verificador que busque refutaciones (estados atascados, video que no entra, chat que no llega).
- Cruzar contra el web: misma sala, cambio de red (WiFi→4G) en Android, validar que el peer re-anuncie `cf-session` nuevo y Android re-suscriba sin estado muerto.

## Salida esperada

| Gate | Verificación        | Evidencia requerida                                             |
| ---- | ------------------- | --------------------------------------------------------------- |
| 1    | Compila             | `BUILD SUCCESSFUL`                                              |
| 3    | Instala             | `Installed on 1 device` + `adb devices` con `device`            |
| 4    | Video + chat reales | videoTrack remoto no nulo y mensaje recibido en extremo opuesto |
| 5    | SFU sano            | sin 406 / 503 / 403 en logs; tracks/new y renegotiate OK        |
| 6    | QC adversarial      | reporte de refutaciones: cero bloqueantes                       |

## Notas de limpieza

- Purgar `WebRTCEngine.kt`, `SignalingClient`, `SignalingWebSocket` y `TurnManager` (si queda huérfano) en un PR aparte SOLO después de que el Gate 4 pase en device real.
- Frame provisional: no renombrar a "final/definitivo" nada de esto.
