# Telemedicina Web - Mapa Real de 7 Capas

> Ultima actualizacion: 2026-03-26
> Este documento describe el estado real del flujo web de telemedicina en `apps/web`.
> No describe la arquitectura ideal. Describe lo que hoy existe, lo que ya cerramos y lo que falta.

---

## Objetivo

Tener una lectura operativa y honesta del canal web:

- por donde entra hoy el doctor
- por donde entra hoy el paciente
- en que capa vive cada responsabilidad
- que partes ya estan cerradas
- que partes siguen transicionales o incompletas

---

## Donde nos equivocamos (visual)

### Flujo que queriamos

`Turno telemedicina`
-> `Agenda medico`
-> `StartCallButton(appointmentId)`
-> `POST /api/doctors/calls/start`
-> `create_call ligado al turno`
-> `Paciente recibe la llamada correcta`
-> `Paciente acepta`
-> `Doctor entra al room correcto`
-> `Peer media real`
-> `UI = Conectado`

### Flujo que realmente vimos en pruebas

`Turno telemedicina`
-> `Agenda medico`
-> `StartCallButton SIN appointmentId`
-> `start genérico por doctor/patient`
-> `quedan o se reciclan llamadas viejas`
-> `IncomingCallHandler elige el primer ringing que encuentra`
-> `Paciente puede atender una llamada huérfana`
-> `Doctor puede seguir en agenda o en otro room`
-> `runtime marca connected por sala/signaling`
-> `UI muestra Conectado aunque siga 1 en sala`

### Mapa del error por capa

```text
CAPA 1  UI
doctor agenda / paciente modal
  ERROR:
  el doctor iniciaba desde agenda sin appointmentId
  y el paciente podia atender un ringing viejo

CAPA 2  Hook / Controller
useStartCall / IncomingCallHandler
  ERROR:
  incoming-call elegia "el primer ringing"
  en lugar de la llamada vigente del turno

CAPA 3  Browser service
start-call.browser / respond-call.browser
  ESTADO:
  correctos como boundary
  pero dependian de input ya contaminado desde arriba

CAPA 4  API
/api/doctors/calls/start
/api/patients/calls/respond
  ERROR:
  la API era correcta, pero no siempre recibia appointmentId

CAPA 5  Backend service
start-call.service / persist-call-status.service
  ERROR:
  no cancelabamos pending calls viejas al iniciar una nueva
  y durante parte de las pruebas "connected" quedaba semantizado demasiado pronto

CAPA 6  Repo
call-start.repo / call-session.repo
  ERROR:
  el modo legacy y la compatibilidad con drift de schema
  nos obliga a tolerar mas estados ambiguos de los deseables

CAPA 7  Runtime / media truth
UnifiedVideoCall / webrtc-client
  ERROR:
  confundimos "estoy dentro del room" con
  "ya tengo peer real y media usable"
```

### Error mas grave de concepto

```text
ANTES
room connected = llamada conectada = UI "Conectado"

PERO EN REALIDAD
room connected != peer connected
peer connected != remote media usable

POR LO TANTO
UI "Conectado" solo puede aparecer cuando:
1. existe otro participante real
2. existe peer connection real
3. la llamada no esta resolviendo solo una presencia local en sala
```

### Estado despues de las correcciones de hoy

```text
CORREGIDO
- StartCallButton en agenda ya pasa appointmentId
- nuevas llamadas cancelan pending calls viejas del mismo doctor/patient
- CallTopBar ya no dice "Conectado" si todavia hay 1 en sala

TODAVIA ABIERTO
- IncomingCallHandler sigue siendo demasiado grueso
- el paciente sigue resolviendo llamadas activas por lista de calls y no por una sesion mas fuerte
- el runtime sigue mezclando lifecycle de negocio con lifecycle de media
```

### Donde nos equivocamos hoy fuera del mapa de 7 capas

Esto no fue un bug de negocio de telemedicina. Fue un bug de operacion/deploy.

```text
LO QUE ASUMIMOS
doctor.autamedica.com
-> usa el mismo deploy que autamedica.com
-> hereda las mismas env vars
-> si hay 500 en /api/doctors/patients, entonces el problema esta en la API o en repos

LO QUE PASABA EN REALIDAD
doctor.autamedica.com
-> vive en Pages project distinto: autamedica-doctors
-> paciente.autamedica.com vive en autamedica-patients
-> el build publicado a doctor se habia generado sin PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
-> el worker SSR arrancaba sin Supabase
-> createSupabaseServerClient explotaba antes de llegar a la logica de negocio

CONSECUENCIA
vimos "Internal Server Error"
pero ese 500 no probaba un fallo en calls, patients repo o estado de llamada
probaba drift entre:
- subdominio
- proyecto Pages
- secrets runtime
- env de build
```

### Mapa visual del error de hoy

```text
REQUEST
doctor.autamedica.com/doctors/patients
    ->
Cloudflare Pages project: autamedica-doctors
    ->
Worker SSR
    ->
createSupabaseServerClient()
    ->
PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY vacios
    ->
500 antes de tocar patient.backend.ts o patientsRepo
```

### Lectura correcta despues del fix

```text
ANTES
500 en /api/doctors/patients
= probablemente bug del endpoint

AHORA SABEMOS
500 en /api/doctors/patients puede significar dos clases de falla:

A. falla dentro de las 7 capas
- auth
- controller
- service
- repo
- runtime call

B. falla fuera del mapa
- proyecto Pages equivocado
- secrets faltantes
- build generado sin PUBLIC_*
- drift entre subdominio y deploy

SI NO VALIDAMOS B PRIMERO
perdemos tiempo auditando la capa equivocada
```

---

## Circuito real hoy

### Inicio del doctor

`StartCallButton.tsx`
-> `useStartCall.ts`
-> `start-call.browser.ts`
-> `POST /api/doctors/calls/start`
-> `start-call.service.ts`
-> `call-start.repo.ts`
-> RPC `create_call` + RPC `update_call_status`
-> redirect a `/doctors/call/[roomId]?callId=...`

### Entrada del paciente desde turno

`AppointmentsPage.tsx` / `PatientsHomePage.tsx`
-> `useJoinTelemedicineAppointment.ts`
-> `POST /api/patients/appointments/[id]/join`
-> `call-start.repo.ts`
-> redirect a `/patients/call/[roomId]?callId=...`

### Llamada entrante del paciente

`IncomingCallHandler.tsx`
-> `respond-call.browser.ts`
-> `POST /api/patients/calls/respond`
-> `respond-call.service.ts`
-> `call-response.repo.ts`
-> redirect a `/patients/call/[roomId]?callId=...`

### Bootstrap de sala

`PatientCallPage.tsx` / `DoctorCallPage.tsx`
-> `useCallSession.ts`
-> `call-session.service.ts`
-> `GET /api/calls/[roomId]/bootstrap`
-> `call-session.backend.ts`
-> `call-session.repo.ts`
-> `UnifiedVideoCall`

### Persistencia de lifecycle

`UnifiedVideoCall`
-> `persist-call-status.browser.ts` inyectado desde la pagina
-> `POST /api/calls/[callId]/status`
-> `persist-call-status.service.ts`
-> `call-response.repo.ts`
-> RPC `update_call_status`

---

## Las 7 capas reales

> Nota critica:
> Las 7 capas explican el flujo de producto y codigo de telemedicina.
> No explican por si solas el borde de operacion/deploy.
> Desde hoy, cualquier incidente en subdominios debe verificarse primero en este orden:
> `subdominio -> Pages project -> secrets runtime -> env de build -> recien despues codigo`.

### 1. UI / View

Archivos principales:

- `apps/web/src/components/doctors/calls/StartCallButton.tsx`
- `apps/web/src/components/doctors/calls/DoctorCallPage.tsx`
- `apps/web/src/components/patients/AppointmentsPage.tsx`
- `apps/web/src/components/patients/appointments/AppointmentsTable.tsx`
- `apps/web/src/components/patients/calls/PatientCallPage.tsx`
- `apps/web/src/components/patients/calls/IncomingCallHandler.tsx`

Estado: PARCIAL

Ya resuelto:

- el paciente entra por un boton canonico de telemedicina desde el turno
- el doctor inicia llamada desde UI web real
- la agenda del medico ya pasa `appointmentId` al iniciar llamada
- las paginas de call no montan la videollamada "a ciegas"; primero hacen bootstrap
- una sala vieja o terminal ya no abre la llamada; devuelve estado de error claro

Falta:

- `IncomingCallHandler.tsx` sigue siendo una UI demasiado "gruesa": escucha realtime, decide estado, elige llamadas activas y redirige
- las UIs de entrada doctor/paciente todavia no comparten una capa visual de waiting room realmente unificada
- la experiencia post-error sigue siendo minima; no hay CTA de "volver al turno" o "reanudar consulta" mas contextual
- la agenda del medico sigue siendo una superficie sensible: cualquier drift de hidratacion o de lista rompe la entrada al room

### 2. Hook / Controller

Archivos principales:

- `apps/web/src/hooks/doctors/useStartCall.ts`
- `apps/web/src/hooks/calls/useCallSession.ts`
- `apps/web/src/hooks/patients/useJoinTelemedicineAppointment.ts`

Estado: OK / PARCIAL

Ya resuelto:

- el inicio doctor vive en hook dedicado
- la entrada del paciente desde appointment vive en hook dedicado
- el bootstrap de sesion vive en hook dedicado y ya normaliza errores de sala terminal

Falta:

- no existe un controller unico para "incoming call"
- no existe regla de seleccion fuerte de "la llamada vigente" del paciente
- no existe un controller de waiting room separado del runtime
- no existe un controller de reintento / recuperacion de sesion stale

### 3. Service (frontend / browser)

Archivos principales:

- `apps/web/src/lib/calls/services/start-call.browser.ts`
- `apps/web/src/lib/calls/services/respond-call.browser.ts`
- `apps/web/src/lib/calls/services/call-session.service.ts`
- `apps/web/src/lib/calls/services/persist-call-status.browser.ts`

Estado: OK

Ya resuelto:

- el browser ya no llama directo a Edge Functions para el flujo canonico web
- cada accion principal tiene un client service chico y explicito
- el frontend habla con APIs Astro autenticadas, no con SQL ni RPC directo

Falta:

- todavia estan fragmentados en cuatro services chicos; no existe una facade web unica de call session
- no hay browser service dedicado para cancelacion del doctor o timeout operacional

### 4. API Client / Controller boundary

Archivos principales:

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/pages/api/doctors/calls/start.ts`
- `apps/web/src/pages/api/patients/appointments/[id]/join.ts`
- `apps/web/src/pages/api/patients/calls/respond.ts`
- `apps/web/src/pages/api/calls/[roomId]/bootstrap.ts`
- `apps/web/src/pages/api/calls/[callId]/status.ts`

Estado: OK / PARCIAL

Ya resuelto:

- existe superficie HTTP explicita para start, join, respond, bootstrap y status
- el bootstrap ya bloquea calls terminales
- el status update ya pasa por servidor autenticado
- `start` ya recibe `appointmentId` desde la agenda del medico

Falta:

- no existe endpoint canonico de cancelacion del doctor
- no existe endpoint de timeout / no-answer
- no existe endpoint para cerrar sesion por ausencia del otro participante

### 5. Service (backend)

Archivos principales:

- `apps/web/src/lib/calls/services/start-call.service.ts`
- `apps/web/src/lib/calls/services/respond-call.service.ts`
- `apps/web/src/lib/calls/services/call-session.backend.ts`
- `apps/web/src/lib/calls/services/persist-call-status.service.ts`

Estado: PARCIAL

Ya resuelto:

- `startCall` valida doctor, paciente y appointment real
- `startCall` ya cancela pending calls viejas del mismo doctor/patient cuando nace una llamada ligada a turno
- `respondCall` endurece `accept` y `decline`
- `callSessionBackend` resuelve bootstrap y acceso por participante real
- `persistCallStatus` ya evita transiciones sobre calls terminales

Falta:

- `persist-call-status.service.ts` todavia es demasiado permisivo para `connecting` y `connected`
  hoy puede avanzar desde cualquier estado no terminal, cuando deberia exigir al menos `accepted`
- falta una maquina de estados explicita del lado backend para todas las transiciones validas
- falta separar mejor "joinable", "connectable" y "endable" como reglas de dominio reutilizables
- falta una nocion canonica de "call vigente" para el paciente cuando existen multiples filas activas o stale

### 6. Repository

Archivos principales:

- `apps/web/src/lib/calls/repos/call-start.repo.ts`
- `apps/web/src/lib/calls/repos/call-response.repo.ts`
- `apps/web/src/lib/calls/repos/call-session.repo.ts`

Estado: PARCIAL

Ya resuelto:

- el acceso a `calls` ya esta centralizado en repos dedicados
- los repos separan `start`, `response` y `session`
- el flujo appointment-backed ya existe a nivel de repositorio
- `call-start.repo.ts` ya puede listar pending calls por participantes para cancelar residuos operativos

Falta:

- los repos siguen cargando fallback legacy por drift de esquema:
  - columna `calls.appointment_id`
  - firma legacy de RPC `create_call`
- mientras exista ese fallback, seguimos en modo de compatibilidad y no en modo estable final

### 7. Repository -> DB contract efectivo

Archivos y contratos criticos:

- tabla `calls`
- RPC `create_call`
- RPC `update_call_status`
- tabla `appointments`

Estado: PARCIAL

Ya resuelto:

- el estado canonico de negocio sigue apoyado en `calls`
- el flujo web ya usa el contrato correcto `appointment -> call -> room`

Falta:

- verificar y estabilizar en produccion el contrato con `appointment_id`
- sacar compatibilidad legacy una vez que la DB activa quede alineada
- endurecer transiciones de estado en DB, no solo en service

---

## Transversales que hoy no entran limpio en las 7 capas

Estas piezas existen y son necesarias, pero no estan todavia acomodadas como modulos internos limpios:

- `packages/telemedicine/src/unified-video-call.tsx`
- `packages/telemedicine/src/calls/service.ts`
- `packages/telemedicine/src/webrtc-client.ts`
- `packages/telemedicine/src/cloudflare-calls.ts`

Lectura real:

- `UnifiedVideoCall` sigue siendo un runtime-orchestrator grande
- ahi conviven lifecycle, retry, warmup, chat, media, stats y parte de la observabilidad
- el runtime recien ahora empieza a separar "room connected" de "peer ready"
- eso explica por que la arquitectura de 7 capas ya esta mejor del lado web, pero todavia no esta completamente cerrada del lado runtime

Conclusion:

- las 7 capas web ya existen y hoy son usables
- la deuda principal ya no esta en los endpoints web
- la deuda principal esta en el runtime compartido, en la seleccion de llamada vigente y en la maquina de estados final

---

## Donde estamos hoy

Estamos en este punto:

- la entrada canonica del paciente desde el turno ya existe
- el inicio canonico del doctor ya existe
- el paciente acepta o rechaza por API propia
- la pagina de call hace bootstrap antes de montar runtime
- una sala terminal ya no se abre como si siguiera viva
- el lifecycle principal ya pasa por API web propia

Todavia no estamos en este punto:

- no hay state machine completa y estricta de `call_status`
- no hay cancelacion operacional completa del doctor
- no hay timeout / no-answer cerrado
- no se elimino la compatibilidad legacy de repos / RPC
- no se extrajo el `CallSessionOrchestrator` del runtime compartido

---

## Lo que falta, en orden correcto

### Paso 1. Endurecer transiciones

Objetivo:

- `connecting` solo desde `accepted` o `connecting`
- `connected` solo desde `connecting` o `connected`
- `ended` solo desde estados activos validos

Archivos:

- `apps/web/src/lib/calls/services/persist-call-status.service.ts`
- RPC / DB contract de `update_call_status`

### Paso 2. Cerrar cancelacion y no-answer

Objetivo:

- doctor puede cancelar antes de que el paciente entre
- si nadie entra en ventana valida, la call expira

Archivos esperables:

- nuevo endpoint `POST /api/doctors/calls/[callId]/cancel`
- nuevo service backend de cancelacion

### Paso 3. Limpiar compatibilidad legacy

Objetivo:

- dejar de depender de fallbacks por schema drift

Archivos:

- `call-start.repo.ts`
- `call-response.repo.ts`
- `call-session.repo.ts`

### Paso 4. Extraer runtime

Objetivo:

- sacar de `UnifiedVideoCall` la orquestacion de sesion

Modulo esperado:

- `CallSessionOrchestrator`
- `MediaDeviceAdapter`
- `CallTransport`

---

## Veredicto

La arquitectura de 7 capas para telemedicina web ya no es teorica.
Ya existe en el repo.

Lo que falta no es "agregar mas capas".
Lo que falta es:

1. endurecer la maquina de estados
2. cerrar cancelacion / timeout
3. eliminar compatibilidad legacy
4. bajar complejidad del runtime compartido
