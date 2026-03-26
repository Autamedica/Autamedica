# ADR-0001: Telemedicina Web + Mobile con arquitectura canonica de llamada

## Estado

Aceptado

## Contexto

AutaMedica ya tiene una base funcional de videollamada, pero hoy conviven varias superficies y
varios runtimes:

- `calls + UnifiedVideoCall + signaling`
- `consultation + LiveKit`
- `WebRTCClient`, `CloudflareCallsClient`, `HttpWebRTCClient`
- `packages/telemedicine` y `packages/@autamedica/telemedicine` con responsabilidades que se
  pisan parcialmente

El repo tambien tiene una tension de lectura sobre mobile:

- `apps/web` es la superficie funcional mas madura
- `apps/android` es la implementacion movil real hoy
- `apps/mobile` existe como espacio de convergencia futura

El riesgo principal ya no es "falta de una capa mas". El riesgo principal es:

1. duplicacion de stacks
2. estado de llamada repartido entre UI, runtime y backend
3. decisiones separadas por plataforma cuando el producto necesita un canal unico `web + mobile`

## Decisión

Se adopta la siguiente arquitectura canonica para telemedicina 1:1:

### 1. Canal unico de producto

La videollamada se diseña como capacidad **web + mobile**.

- `apps/web` define el flujo funcional canonico
- `apps/android` valida el runtime movil actual
- iOS futuro debe implementar el mismo contrato de sesion y media
- `apps/mobile` queda reservado para convergencia futura y no debe leerse como frente paralelo

### 2. Fuente canonica del estado de llamada

La fuente canonica del estado de negocio de la llamada es:

- `calls`
- `call_events`

`telemedicine_sessions` puede seguir existiendo como soporte de disponibilidad o compatibilidad,
pero no reemplaza a `calls` como timeline principal de la consulta en tiempo real.

### 3. Runtime canonico de corto plazo

Para sacar a produccion el flujo 1:1 se congela como runtime canonico:

- `calls + UnifiedVideoCall + signaling`

Se congela cualquier crecimiento productivo de rutas legacy basadas en `consultation + LiveKit`
hasta cerrar el flujo real de punta a punta.

LiveKit, Cloudflare Calls u otros SFU pueden existir como adaptadores o migraciones futuras, pero
no deben competir como segundo flujo productivo.

### 4. Las 7 capas macro del repo se mantienen

No se agregan mas capas top-level. Se mantiene la arquitectura obligatoria del proyecto:

- Frontend: `UI -> Hook/Controller -> Service -> API Client`
- Backend: `Controller -> Service -> Repository`

El trabajo debe concentrarse en ordenar los modulos internos de telemedicina dentro de esas 7
capas.

### 5. Contrato canonico de sesion

Se define un contrato unico de bootstrap de llamada para `web + mobile`:

```ts
type CallSessionBootstrap = {
  callId: string;
  roomId: string;
  appointmentId: string;
  runtime: "webrtc-p2p" | "cloudflare-calls" | "livekit";
  user: {
    id: string;
    role: "doctor" | "patient" | "nurse";
    displayName?: string;
  };
  permissions: {
    canJoin: boolean;
    canPublishAudio: boolean;
    canPublishVideo: boolean;
    canUseChat: boolean;
    canRecord: boolean;
  };
  mediaPolicy: {
    requireCamera: boolean;
    requireMicrophone: boolean;
    allowAudioOnlyFallback: boolean;
  };
  transport: {
    signalingUrl?: string;
    iceServers?: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
    cloudflareCallsApiUrl?: string | null;
  };
  waitingRoom: {
    enabled: boolean;
    message?: string;
  };
};
```

Este contrato debe ser el mismo para web y mobile. Las diferencias de plataforma quedan limitadas
a permisos, device APIs y audio routing.

### 6. Modulos internos canonicos

Dentro de las 7 capas, telemedicina debe ordenarse en estos modulos:

1. `CallSessionOrchestrator`
   - lifecycle de la llamada
   - waiting room
   - retry/reconnect
   - binding `appointment -> call -> room`

2. `MediaDeviceAdapter`
   - camara
   - microfono
   - speaker/audio route
   - permisos
   - device switching

3. `CallTransport`
   - interfaz comun para runtimes de media
   - `connect`, `disconnect`, `publish`, `toggleAudio`, `toggleVideo`, `sendChat`

4. `CallTimelineService`
   - persistencia de estados y eventos
   - sincronizacion con backend

### 7. Regla de implementacion

Antes de sumar funcionalidades como recording, transcription o files sharing, se debe cerrar:

1. auth real
2. bootstrap canonico
3. transiciones validas de `call_status`
4. waiting room
5. retry + audio-only fallback
6. trazabilidad de `call_events`

## Consecuencias

### Positivas

- Una sola lectura del sistema para `web + mobile`
- Menos deriva entre web, Android y futura implementacion iOS
- Menor acoplamiento entre UI y runtime de media
- El backend puede validar permisos y elegibilidad antes de tocar camara/microfono
- Facilita migrar de P2P a SFU en el futuro sin reescribir la experiencia completa

### Negativas

- Obliga a congelar trabajo nuevo en superficies legacy aunque ya existan piezas funcionales
- Requiere refactor de orquestadores actuales amplios como `UnifiedVideoCall` y `VideoCallViewModel`
- La coexistencia temporal de adapters va a seguir existiendo durante la migracion
- Hay que decidir explicitamente que partes de `packages/@autamedica/telemedicine` se absorben,
  se deprecán o quedan como modulos auxiliares

## Compliance

### HIPAA

- `calls` y `call_events` deben preservar trazabilidad de inicio, aceptacion, conexion, reconexion
  y cierre
- La autorizacion de acceso a la llamada no puede depender solo de la UI
- Los logs de errores no deben exponer PHI/PII ni contenido clinico sensible

### Médico

- El flujo debe nacer desde un turno o consulta real
- El paciente solo entra a la sala dirigida a su turno
- El medico solo puede iniciar o aceptar llamadas autorizadas por su agenda real
- El fallback audio-only debe estar contemplado para continuidad asistencial

## Migracion aprobada

### Fase A. Freeze

- Congelar `consultation + LiveKit` como flujo no canonico
- Mantener `calls + UnifiedVideoCall + signaling` como camino oficial

### Fase B. Contrato

- Crear endpoint de bootstrap de sesion para doctor y paciente
- Hacer que web y mobile consuman el mismo contrato

### Fase C. Orquestacion

- Extraer `CallSessionOrchestrator`
- Separar `MediaDeviceAdapter` de `CallTransport`

### Fase D. Endurecimiento

- cerrar transiciones de estado
- ligar `appointment_id`
- observabilidad productiva
- audio-only fallback
