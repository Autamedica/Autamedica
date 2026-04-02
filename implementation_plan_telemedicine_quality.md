# Plan de Implementación: Calidad Clínica en Telemedicina

Este documento detalla el plan de acción quirúrgico para elevar la infraestructura de WebRTC de AutaMedica desde "videollamada estándar" a "instrumento de diagnóstico médico".

## Fase 1: Resiliencia de Audio y Modo Clínico (P0)
**Objetivo**: Asegurar que la voz no se corte bajo pérdida de paquetes y permitir la transmisión de sonidos de valor diagnóstico sin filtros artificiales.

- [x] **1.1 Tuning de Opus (SDP Munging)**
  - **Archivo**: `packages/telemedicine/src/webrtc-client.ts` (o utilidades de SDP).
  - **Acción**: Interceptar la oferta/respuesta SDP y modificar la línea `fmtp` de Opus para forzar: `useinbandfec=1; usedtx=0; maxaveragebitrate=32000`.
- [x] **1.2 Soporte para Codec RED (Redundant Audio)**
  - **Archivo**: `packages/telemedicine/src/media-manager.ts` (en `preferCodec`).
  - **Acción**: Extender el soporte para preferir `audio/red` si el navegador lo soporta, envolviendo Opus.
- [x] **1.3 Toggle de "Modo Clínico" (Audio sin filtros)**
  - **Archivo**: `packages/telemedicine/src/webrtc-client.ts` y `packages/telemedicine/src/media-manager.ts`.
  - **Acción**: Agregar método `setClinicalMode(enabled: boolean)` que obtenga un nuevo track de audio con `{ noiseSuppression: false, autoGainControl: false, echoCancellation: false }` y use `replaceTrack` en caliente.

## Fase 2: Simulcast y Codecs Modernos de Video (P1)
**Objetivo**: Mejorar la resolución de video y la adaptación dinámica sin sacrificar calidad en conexiones dispares.

- [ ] **2.1 Implementación de Simulcast**
  - **Archivo**: `packages/telemedicine/src/media-manager.ts`.
  - **Acción**: Modificar `attachLocalTracks` para configurar múltiples encodings (`low`, `mid`, `high`) usando `scaleResolutionDownBy` si el navegador lo soporta (`detectBrowser().supportsSimulcast`).
- [ ] **2.2 Priorización de Codec AV1**
  - **Archivo**: `packages/telemedicine/src/media-optimizations.ts`.
  - **Acción**: Añadir soporte para `video/AV1` en `getPreferredCodecs()`, priorizándolo sobre H.265 y VP9 para aprovechar mejor compresión y SVC.
- [ ] **2.3 Tuning de Jitter Buffer**
  - **Archivo**: `packages/telemedicine/src/peer-connection-factory.ts`
  - **Acción**: Ajustar `jitterBufferTarget` del `RTCRtpReceiver` durante el evento `ontrack` (menor latencia para clínico, mayor para conversacional).

## Fase 3: Visibilidad y Analítica Post-Consulta (P2)
**Objetivo**: Extraer métricas vitales (como `concealedSamples`) para un diagnóstico preciso de la infraestructura.

- [ ] **3.1 Rastrear `concealedSamples`**
  - **Archivo**: `packages/telemedicine/src/quality/stat-helpers.ts` (o equivalente de stats).
  - **Acción**: Parsear el campo `concealedSamples` o métricas de pérdida similares en audio inbound.
- [ ] **3.2 Persistencia de Calidad**
  - **Archivo**: Capa de aplicación (e.g., hooks / Supabase services).
  - **Acción**: Conectar el evento `call-quality-summary` para que envíe el log a la base de datos o un backend analítico al finalizar la llamada.
