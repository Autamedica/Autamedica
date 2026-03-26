# Telemedicine Production Roadmap

## Objetivo

Llevar la videollamada de `Autamedica` desde un estado funcional de prueba a un flujo
productivo 1:1, confiable, trazable y apto para uso clínico real:

1. medico inicia o programa la consulta
2. paciente entra a sala de espera o recibe llamada
3. ambos se conectan en tiempo real
4. la plataforma registra el ciclo de vida de la llamada
5. existe fallback operativo si falla video o red
6. la historia clinica y la trazabilidad quedan consistentes

---

## Estado Actual

### Referencia operativa actual

Para leer el estado real del flujo web segun las 7 capas del repo, usar:

- [`TELEMEDICINE_WEB_7_LAYER_MAP.md`](/home/edu/Autamedica/docs/TELEMEDICINE_WEB_7_LAYER_MAP.md)

### Lo que ya funciona

- Hay videollamada WebRTC simultanea entre medico y paciente en rutas de prueba usando
  [`UnifiedVideoCall`](/home/edu/Autamedica/packages/telemedicine/src/unified-video-call.tsx).
- Ya existe un estado canonico de llamada en `calls` / `call_events`.
- Ya existe sala de espera del medico en
  [`WaitingRoom.tsx`](/home/edu/Autamedica/apps/doctors/src/components/calls/WaitingRoom.tsx).
- Ya existe listener de llamada entrante del paciente en
  [`IncomingCallHandler.tsx`](/home/edu/Autamedica/apps/patients/src/components/calls/IncomingCallHandler.tsx).
- Ya existe instrumentacion de debug y timeline en
  [`debug.ts`](/home/edu/Autamedica/packages/telemedicine/src/debug.ts) y
  [`telemedicine-debug-panel.tsx`](/home/edu/Autamedica/packages/telemedicine/src/telemedicine-debug-panel.tsx).
- El bug de glare WebRTC ya fue corregido en
  [`webrtc-client.ts`](/home/edu/Autamedica/packages/telemedicine/src/webrtc-client.ts).

### Lo que hoy impide llamarlo “produccion real”

- Conviven dos arquitecturas:
  - `calls + UnifiedVideoCall`
  - `consultation + LiveKit`
- La capa de red sigue usando fallback TURN de demo si no hay configuracion real en
  [`ice-servers.ts`](/home/edu/Autamedica/packages/telemedicine/src/config/ice-servers.ts).
- La autenticacion de llamada en doctores sigue teniendo bypass de desarrollo en
  [`CallPageClient.tsx`](/home/edu/Autamedica/apps/doctors/src/app/call/[roomId]/CallPageClient.tsx).
- El test-call usa media sintetica del navegador, util para QA pero no valida experiencia real.
- Falta cierre operacional de fallback a audio/telefono y reintento controlado.
- Falta acoplar llamada con appointment/teleconsulta de negocio.
- Falta observabilidad productiva y alertas automáticas.
- Falta endurecimiento clinico y regulatorio para despliegue real.

---

## Decision Arquitectonica

### Decision obligatoria

Antes de seguir, la plataforma debe elegir **una sola arquitectura canónica**.

### Recomendacion

#### Corto plazo

Mantener `calls + UnifiedVideoCall + signaling + call_events` para sacar a produccion
el flujo 1:1 cuanto antes.

#### Mediano plazo

Reevaluar migracion a una arquitectura SFU administrada si se necesita:

- grabacion robusta
- reconexion mas estable
- calidad de red gestionada por servidor
- ampliacion a 3+ participantes
- supervisores, interpretes o acompañantes

### Razon

Hoy el mayor riesgo no es WebRTC puro en 1:1. El mayor riesgo es la duplicacion de stacks.
Primero hay que cerrar el flujo real. Recién despues conviene discutir migracion a SFU.

---

## Roadmap

## Fase 0. Freeze Arquitectonico

### Objetivo

Dejar una sola superficie de telemedicina.

### Trabajo

- Declarar `calls` como fuente canonica del estado de llamada.
- Congelar cualquier nuevo trabajo sobre la ruta legacy `consultation`.
- Dejar documentado que el flujo oficial es:
  - doctor inicia
  - paciente recibe/acepta
  - ambos entran por `/call/[roomId]`

### Cambios

- Marcar legacy en:
  - [`apps/doctors/src/app/consultation/[id]/page.tsx`](/home/edu/Autamedica/apps/doctors/src/app/consultation/[id]/page.tsx)
  - [`apps/doctors/src/components/consultation/DoctorVideoConsultation.tsx`](/home/edu/Autamedica/apps/doctors/src/components/consultation/DoctorVideoConsultation.tsx)
- Publicar y referenciar ADR aceptado:
  - [`ADR-0001: Telemedicina Web + Mobile con arquitectura canonica de llamada`](/home/edu/Autamedica/docs/adr/ADR-0001-telemedicine-web-mobile-canonical-call-architecture.md)

### Done

- No hay dos flujos productivos compitiendo.
- El equipo sabe cual es la ruta oficial.

---

## Fase 1. Flujo Deterministico 1:1

### Objetivo

Cerrar de punta a punta el flujo real de teleconsulta.

### Trabajo

- Enforce de autenticacion real en ambos portales.
- Quitar identidades `dev-*` como fallback en rutas productivas.
- Garantizar transiciones validas de `call_status`:
  - `requested -> ringing -> accepted -> connecting -> connected -> ended`
  - `requested/ringing -> declined|canceled`
- Validar timeout, cancelacion del medico y rechazo del paciente.
- Hacer que la llamada nazca desde una teleconsulta/appointment real.

### Cambios concretos

- Endurecer:
  - [`apps/doctors/src/app/call/[roomId]/CallPageClient.tsx`](/home/edu/Autamedica/apps/doctors/src/app/call/[roomId]/CallPageClient.tsx)
  - [`apps/patients/src/app/call/[roomId]/CallPageClient.tsx`](/home/edu/Autamedica/apps/patients/src/app/call/[roomId]/CallPageClient.tsx)
- Endurecer RPC/Edge Function:
  - [`supabase/functions/create-call/index.ts`](/home/edu/Autamedica/supabase/functions/create-call/index.ts)
  - [`supabase/functions/update-call-status/index.ts`](/home/edu/Autamedica/supabase/functions/update-call-status/index.ts)
- Asegurar integridad de transiciones en DB.
- Ligar `call_id` a `appointment_id` o `telemedicine_session_id`.

### Done

- Un medico real solo puede llamar a su paciente real.
- Un paciente real solo puede aceptar la llamada dirigida a el.
- No hay estados imposibles.

---

## Fase 2. Red y Media para Produccion

### Objetivo

Eliminar dependencia de red “de suerte”.

### Trabajo

- Configurar TURN real.
- Medir conectividad real en redes hospitalarias, 4G y wifi domestico.
- Agregar fallback operativo:
  - retry WebRTC
  - audio-only
  - telefono externo/manual si la consulta es critica
- Separar claramente:
  - `test-call`
  - `call real`

### Cambios concretos

- Reemplazar fallback demo en:
  - [`ice-servers.ts`](/home/edu/Autamedica/packages/telemedicine/src/config/ice-servers.ts)
- Definir `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.
- Registrar en timeline:
  - selected candidate pair
  - uso de relay vs srflx
  - tiempo a primer video
  - tiempo a primer audio

### Done

- La llamada funciona detras de NAT estricta y redes corporativas.
- Ya no depende de `metered.ca demo`.

---

## Fase 3. UX Clinica Real

### Objetivo

Pasar de “video que conecta” a “consulta usable”.

### Trabajo

- Sala de espera del paciente con contexto:
  - medico
  - especialidad
  - hora
  - consentimiento breve
- Sala de espera del medico con:
  - anamnesis
  - motivo de consulta
  - alertas clinicas
  - checklist preconsulta
- Botones claros:
  - iniciar
  - aceptar
  - cancelar
  - reintentar
  - volver a agenda
- Estado postconsulta:
  - llamada finalizada
  - resumen
  - proximos pasos

### Cambios concretos

- Unificar diseño entre:
  - [`WaitingRoom.tsx`](/home/edu/Autamedica/apps/doctors/src/components/calls/WaitingRoom.tsx)
  - [`IncomingCallHandler.tsx`](/home/edu/Autamedica/apps/patients/src/components/calls/IncomingCallHandler.tsx)
  - [`UnifiedVideoCall`](/home/edu/Autamedica/packages/telemedicine/src/unified-video-call.tsx)
- Quitar de rutas reales cualquier elemento de `test-call`.
- Dejar `debug` solo bajo flag.

### Done

- El flujo es comprensible para medico y paciente sin asistencia tecnica.

---

## Fase 4. Observabilidad y Operacion

### Objetivo

Saber por que falla una llamada sin mirar el codigo.

### Trabajo

- Persistir eventos minimos obligatorios:
  - call_created
  - ringing
  - accepted
  - connecting
  - connected
  - media_timeout
  - reconnect_attempt
  - ended
- Definir metricas:
  - call setup success rate
  - acceptance rate
  - connected rate
  - median time to connect
  - % relay usage
  - % calls downgraded to audio-only
  - failure reason distribution
- Agregar dashboard interno.
- Alertas automáticas cuando se degrade:
  - failure rate
  - long connection time
  - no remote track

### Cambios concretos

- Extender:
  - [`call_events`](/home/edu/Autamedica/supabase/migrations/20260222000000_baseline_remote.sql)
  - [`debug.ts`](/home/edu/Autamedica/packages/telemedicine/src/debug.ts)
  - [`telemedicine-debug-panel.tsx`](/home/edu/Autamedica/packages/telemedicine/src/telemedicine-debug-panel.tsx)
- Enviar eventos tambien a backend/analytics, no solo `localStorage`.

### Done

- Cualquier incidente se puede clasificar en menos de 10 minutos.

---

## Fase 5. Seguridad y Cumplimiento

### Objetivo

Cerrar el frente medico-legal minimo para operar.

### Trabajo

- Consentimiento informado previo a teleconsulta.
- Registro cronologico de la consulta en historia clinica.
- Politica clara de grabacion:
  - no grabar por defecto
  - si se graba, consentimiento y retencion definidos
- Control de acceso estricto por rol y relacion medico-paciente.
- Cifrado, trazabilidad y auditoria.
- Runbook para caida de red o interrupcion de sesion.

### Consideraciones regulatorias minimas

- Historia clinica y consentimiento: Ley 26.529.
- Datos personales y seguridad: Ley 25.326.
- Si opera en Argentina, validar con asesor legal la implementacion final de teleconsulta,
  consentimiento y resguardo documental antes del go-live.

### Done

- Existe check legal/compliance firmado para salir a produccion.

---

## Fase 6. Escalabilidad y Evolucion

### Objetivo

Decidir si el stack actual sigue o si conviene migrar.

### Mantener P2P si

- consultas 1:1
- sin grabacion server-side obligatoria
- sin terceros en sala
- volumen moderado
- soporte operativo interno

### Migrar a SFU/LiveKit si

- necesitan grabacion robusta
- quieren multi-party real
- quieren reconexion administrada
- necesitan mejor calidad bajo redes diversas
- quieren webhooks y server orchestration mas fuerte

### Done

- Existe decision arquitectonica explicita y fechada.

---

## Priorizacion Ejecutiva

### P0

- congelar arquitectura en un stack
- autenticar flujo real sin bypass
- transiciones de estado de llamada en DB
- TURN real
- appointment -> call linkage

### P1

- waiting rooms clinicas
- fallback audio-only
- observabilidad persistida
- dashboard de incidentes

### P2

- consentimientos y runbooks
- grabacion opcional si aplica
- decision SFU vs P2P a mediano plazo

---

## Definicion de Done para Go-Live

- 95%+ de llamadas 1:1 llegan a `connected` en staging controlado.
- 90%+ conectan en menos de 15s.
- Funciona en:
  - wifi hogar
  - 4G
  - red corporativa/hospitalaria
- Existe TURN real configurado.
- No hay fallback dev en rutas productivas.
- Cada llamada queda ligada a una teleconsulta/appointment.
- Hay auditoria de eventos y visibilidad de fallos.
- Hay consentimiento e historia clinica consistentes.

---

## Recomendacion Final

No conviene intentar “grabar, escalar, sumar IA y sumar terceros” ahora.

La estrategia senior correcta es:

1. cerrar el flujo 1:1 real
2. endurecer red y observabilidad
3. cerrar cumplimiento
4. luego decidir si el stack actual alcanza o si migran a SFU

Hoy la plataforma ya paso la etapa “no conecta”.
El siguiente salto es convertirla en una teleconsulta confiable, trazable y operable.
