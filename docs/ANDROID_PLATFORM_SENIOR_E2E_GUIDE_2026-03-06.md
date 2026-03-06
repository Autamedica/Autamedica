# Android Platform Senior E2E Guide

- Fecha: 2026-03-06
- Owner: Codex
- TTL: 2026-04-06
- Alcance: `apps/android`
- Validacion ejecutada: `./gradlew testDebugUnitTest` -> `BUILD SUCCESSFUL` (33 tasks, 11 ejecutadas, 22 up-to-date)

## Resumen Ejecutivo

La base Android no esta en estado de prototipo. Tiene arquitectura real por capas, DI con Hilt, cifrado local, Supabase, cache Room, push notifications, chat realtime y dos runtimes de videollamada (`WebRTC` legado y `LiveKit`).

El problema no es falta de superficie funcional. El problema es cierre e2e. La app esta mas cerca de "muchos vertical slices montados" que de "canal movil listo para operar un flujo clinico completo".

Lectura senior:

- El modulo esta fuerte en estructura tecnica y amplitud funcional.
- El modulo esta debil en integridad e2e, privacidad offline, contratos de deep link/push, calidad de datos clinicos y cobertura de pruebas reales.
- No deberia considerarse canal Android production-ready hasta cerrar los P0 de este documento.

## Estado Actual Por Dominio

| Dominio | Estado | Lectura senior |
| --- | --- | --- |
| Auth | Parcialmente cerrado | Login email/password y Google existen, pero logout no cierra ciclo de notificaciones del dispositivo. |
| Navegacion principal | Parcialmente cerrado | La shell principal existe, pero hay errores de wiring entre acciones rapidas y tabs reales. |
| Appointments | Parcialmente cerrado | Hay fetch remoto + fallback offline, pero la cache actual no esta aislada por usuario. |
| Chat medico | Parcialmente cerrado | Realtime funcional, pero sin estrategia de unsubscribe por pantalla ni cobertura de error visible al usuario. |
| Videollamada | Parcialmente cerrada | La capa tecnica existe, pero el contrato de entrada desde push/deep link es fragil. |
| Salud / anamnesis | Parcialmente cerrada | Hay flujo completo de formulario, pero sin validacion clinica ni enforcement de bloqueo. |
| Perfil | Cerrado a nivel basico | Lectura/escritura minima funciona, pero sin avatar, telefono ni enriquecimiento. |
| Push notifications | Parcialmente cerrado | Recepcion y display existen; deep linking y logout seguro no estan cerrados. |
| Testing | Subdesarrollado | Solo hay 3 suites JVM; no hay instrumented tests ni e2e Android. |

## Fortalezas Reales Del Modulo

1. Arquitectura clara: `presentation -> domain -> data`, con Hilt y boundaries razonables.
2. Seguridad local correcta de base: `EncryptedSharedPreferences` en `SecurePreferences`.
3. Notificaciones bien encapsuladas: `PushNotificationService`, `NotificationHelper`, `CallNotificationService`.
4. Telemedicina con opcion de migracion progresiva: runtime legacy y runtime LiveKit convivientes.
5. Appointment cache ya tiene esqueleto offline en Room.
6. Los tests que existen estan enfocados en piezas criticas de interoperabilidad: auth UI state, scoring de calidad WebRTC y serializacion de signaling.

## P0 - Brechas Que No Deberian Shippearse

### P0-1. Riesgo de fuga de datos medicos por cache offline no aislada por usuario

**Evidencia**

- `AppointmentRepositoryImpl` hace fallback a Room y, si no encuentra `cached_record_id`, devuelve `getAllAppointments()`.
- `AppointmentDao.clearAll()` y `clearOldCache()` existen pero no se usan.
- `AuthRepositoryImpl.logout()` limpia `SecurePreferences`, pero no limpia Room.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/data/repository/AppointmentRepositoryImpl.kt:69-84`
- `apps/android/app/src/main/java/com/autamedica/android/data/local/room/dao/AppointmentDao.kt:24-29`
- `apps/android/app/src/main/java/com/autamedica/android/data/repository/AuthRepositoryImpl.kt:73-80`

**Impacto e2e**

Si un usuario cierra sesion, otro usuario entra en el mismo dispositivo y la app cae a modo offline antes de refrescar cache remota, puede visualizar turnos cacheados de otra persona. En salud esto es fuga de PHI.

**Criterio de cierre**

- Cache por `user_id` o por `record_id` persistido en Room.
- Limpieza explicita de cache al logout.
- Eliminacion del fallback a `getAllAppointments()` para sesiones ambiguas.
- Test automatizado de cambio de usuario + modo offline.

### P0-2. Logout no cierra el ciclo de push del dispositivo

**Evidencia**

- Existe `NotificationRepository.clearFcmToken()`.
- `MainViewModel.logout()` solo ejecuta `chatRepository.cleanup()` y `authRepository.logout()`.
- `AuthRepositoryImpl.logout()` tampoco limpia el token remoto del dispositivo.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/data/repository/NotificationRepositoryImpl.kt:36-49`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/main/MainViewModel.kt:48-52`
- `apps/android/app/src/main/java/com/autamedica/android/data/repository/AuthRepositoryImpl.kt:73-80`

**Impacto e2e**

Un dispositivo que ya no deberia recibir notificaciones de un usuario puede seguir recibiendo recordatorios, mensajes o eventos clinicos. En un contexto medico esto es problema de privacidad, no solo de UX.

**Criterio de cierre**

- `logout()` debe limpiar token remoto y cache local antes de cerrar sesion.
- Debe existir flujo de rotacion de token y re-registro seguro post-login.
- Test manual y automatizado: login A -> logout -> login B -> verificar que B recibe pushes y A no.

### P0-3. Contrato push/deep-link de videollamada no esta cerrado

**Evidencia**

- `NotificationHelper` solo mete `appointment_id`, `chat_room_id`, `prescription_id` y `notification_type` en el `Intent`.
- `MainActivity` para abrir videollamada necesita `appointment_id`, `user_id`, `user_type` y `user_name`.
- `deepLink` existe en `PushPayload` pero no se usa para navegar.
- `prescription_id` tambien se recibe, pero `MainActivity` no lo resuelve.
- `MainActivity.onNewIntent()` solo hace `setIntent(intent)` y no puentea ese cambio a un estado Compose confiable; con la app abierta, el deep link puede no re-disparar navegacion de forma robusta.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/service/NotificationHelper.kt:124-138`
- `apps/android/app/src/main/java/com/autamedica/android/MainActivity.kt:43-65`
- `apps/android/app/src/main/java/com/autamedica/android/MainActivity.kt:85-87`
- `apps/android/app/src/main/java/com/autamedica/android/domain/model/Notification.kt:24-32`

**Impacto e2e**

Una notificacion puede abrir una videollamada con identidad incompleta (`userId` vacio y `userType` default a `patient`) o llevar a rutas que no tienen handler. El resultado es flujo roto justo en el entrypoint mas sensible: call/join desde push.

**Criterio de cierre**

- Definir contrato unico de deep link para Android.
- Resolver identidad del usuario desde sesion, no desde extras inseguros de notificacion.
- Soportar explicitamente `chat`, `appointment`, `prescription` y `deepLink` real.
- Agregar auth bootstrap antes de navegar a pantalla interna.

### P0-4. La anamnesis puede completarse y enviarse sin validacion clinica real

**Evidencia**

- `saveAndNext()` guarda lo que haya y luego llama a `completeSection()` sin validaciones de campos obligatorios.
- `submitAnamnesis()` depende de `allSectionsCompleted`, pero ese estado se puede alcanzar aunque los datos esten vacios.
- `HealthScreen` muestra estados como `Bloqueada`, `Completada` o `Aprobada`, pero `AnamnesisFormViewModel` no impide seguir editando.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/presentation/health/AnamnesisFormViewModel.kt:96-139`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/health/AnamnesisFormViewModel.kt:169-186`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/health/HealthScreen.kt:229-246`

**Impacto e2e**

La plataforma puede registrar una anamnesis formalmente "completa" con contenido incompleto o vacio, y ademas no protege bien estados clinicos finales. Para historia clinica esto es problema de integridad y auditoria.

**Criterio de cierre**

- Definir esquema de validacion por seccion.
- Separar `draft`, `completed`, `submitted`, `approved`, `locked` como maquina de estados real.
- Bloquear edicion cuando el backend indique `locked=true` o estado final.
- Test de formulario con datos minimos obligatorios + rechazo de submit invalido.

## P1 - Brechas Serias Pero No Bloqueantes Absolutas

### P1-1. Wiring incorrecto en la navegacion principal

**Evidencia**

- En experiencia paciente, las quick actions no apuntan a las tabs correctas.
  - `Mis Turnos` envia a `selectedTab = 1`, pero la tab 1 es `Mensajes`.
  - `Mi Salud` envia a `selectedTab = 2`, pero la tab 2 es `Appointments`.
  - `Mi Perfil` envia a `selectedTab = 3`, pero la tab 3 es `Health`.
- En experiencia doctor, `RecentPatientsSection.onViewAll` apunta a tab `1`, que es `Mensajes`, no `Pacientes`.
- La accion `Ayuda` existe visualmente pero no hace nada.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/presentation/main/MainScreen.kt:164-203`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DashboardScreen.kt:175-206`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DoctorDashboardScreen.kt:195-201`

**Impacto e2e**

La shell parece completa, pero las rutas reales desorientan al usuario y degradan conversion de tareas clave.

### P1-2. La CTA de unirse a consulta no valida disponibilidad real de sesion

**Evidencia**

- `AppointmentCard` habilita join para `CONSULTATION` o `TELEMEDICINE` con status `scheduled`, `confirmed` o `in_progress`.
- No valida `meetingUrl`, existencia de `calls`, ventana horaria, ni readiness del backend.
- Luego `TelemedicineRepository` intenta resolver la sesion a partir de `calls` o `appointments.meeting_url`; si no existe, falla en runtime.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/components/AppointmentCard.kt:144-165`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/components/AppointmentCard.kt:212-215`
- `apps/android/app/src/main/java/com/autamedica/android/data/repository/TelemedicineRepositoryImpl.kt:26-81`

**Impacto e2e**

Desde la UI parece que la consulta esta lista para abrirse, pero el backend puede no tener aun una sesion resoluble.

### P1-3. Chat realtime no libera recursos por conversacion

**Evidencia**

- Cada `observeMessages(chatId)` crea/cacha un flow y suscribe un canal realtime por chat.
- La limpieza total ocurre solo en `cleanup()`, que hoy se usa en logout.
- `ChatConversationViewModel` no hace unsubscribe especifico al destruir la pantalla.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/data/repository/ChatRepositoryImpl.kt:69-73`
- `apps/android/app/src/main/java/com/autamedica/android/data/repository/ChatRepositoryImpl.kt:300-359`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatConversationViewModel.kt:38-80`

**Impacto e2e**

Abrir varias conversaciones en una sesion prolongada puede acumular canales, memoria y trabajo realtime innecesario.

### P1-4. `PatientDetail` pasa identidad incorrecta al iniciar videollamada

**Evidencia**

- `PatientDetailViewModel` guarda `userName` usando el nombre del paciente cargado.
- `PatientDetailScreen` reusa ese `userName` al navegar a videollamada como doctor.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/presentation/patients/PatientDetailViewModel.kt:63-68`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/patients/PatientDetailScreen.kt:203-214`

**Impacto e2e**

En signaling, chat embebido o metadata de call, el doctor puede terminar entrando con nombre de paciente. Es un bug de identidad contextual.

### P1-5. Deep links internos pueden saltarse bootstrap de sesion

**Evidencia**

- `MainActivity` puede abrir `Route.ChatConversation` directo o hacer `navigateTo = Route.VideoCall(...)` desde extras.
- Ese flujo ocurre antes de una verificacion explicita de sesion en la activity.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/MainActivity.kt:43-71`

**Impacto e2e**

La app intenta navegar a pantallas autenticadas sin un bootstrap centralizado de auth/session. Puede funcionar en escenarios felices y romperse en cold start, sesion expirada o notificacion tardia.

### P1-6. El contrato de sesion de telemedicina esta partido entre repositorio y runtime

**Evidencia**

- `TelemedicineRepositoryImpl.getSession()` devuelve `roomId`, `signalingUrl` e `iceServers`.
- `VideoCallViewModel.startCall()` usa `roomId`, pero no consume `signalingUrl` ni `iceServers` de la sesion resuelta.
- El `SignalingClient` real queda fijado por DI desde `BuildConfig.SIGNALING_URL`.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/data/repository/TelemedicineRepositoryImpl.kt:26-39`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/videocall/VideoCallViewModel.kt:97-111`
- `apps/android/app/src/main/java/com/autamedica/android/di/WebRTCModule.kt:18-26`

**Impacto e2e**

La app parece preparada para sesiones dinamicas, pero en la practica sigue atada a configuracion build-time para signaling/ICE. Eso debilita entornos multi-tenant, cambios de infraestructura y diagnostico de fallos de conectividad.

## P2 - Deuda De Producto / Plataforma Todavia Visible

### P2-1. El dominio Salud fuera de anamnesis sigue siendo shell

**Evidencia**

- `Historial Medico`, `Salud Preventiva` y `Vacunas` se renderizan como tarjetas informativas con badge `Pronto` y sin flujo real.

**Referencia**

- `apps/android/app/src/main/java/com/autamedica/android/presentation/health/HealthScreen.kt:67-89`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/health/HealthScreen.kt:159-217`

### P2-2. Cobertura de testing muy por debajo del riesgo operativo

**Evidencia**

- Solo existen 3 archivos de tests JVM:
  - `LoginViewModelTest`
  - `QualityMonitorTest`
  - `SignalingMessagesTest`
- No hay tests en `src/androidTest`.

**Impacto e2e**

No hay red de seguridad para:

- login real + restauracion de sesion
- navegacion por tabs y deep links
- push notification routing
- cache offline por usuario
- videollamada con permisos y retorno desde PiP
- anamnesis multi-step

### P2-3. Experiencia de error de chat es pobre

**Evidencia**

- Si `observeChats()` u `observeMessages()` falla, el usuario solo sale del loading; no hay estado de error operativo ni CTA de reintento.
- Si `sendMessage()` falla, el error queda solo en logs.

**Referencias**

- `apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatListViewModel.kt:34-43`
- `apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatConversationViewModel.kt:66-74`

## Lectura De Madurez Tecnica

### Lo que ya esta bien encaminado

- El proyecto no necesita reescritura estructural.
- Hay suficiente modularidad para endurecerlo sin tirar la base.
- La convivencia `WebRTC` / `LiveKit` es una buena estrategia de transicion.
- La app ya tiene cimientos para observabilidad y control operativo.

### Lo que hoy le falta para ser un canal Android serio

- Cierre de identidad a traves de sesion, cache, push y videollamada.
- Integridad de datos clinicos, no solo formularios renderizados.
- Politica de almacenamiento offline con aislamiento fuerte por usuario.
- Navegacion consistente entre dashboard, notificaciones y tabs.
- Cobertura de pruebas de sistema, no solo de unidades aisladas.

## Orden Recomendado De Ejecucion

1. Cerrar privacidad e identidad.
   - FCM logout seguro.
   - Cache offline aislada por usuario.
   - Contrato unico de deep links.

2. Cerrar integridad clinica.
   - Validacion de anamnesis.
   - Locking real en estados finales.
   - Submit respaldado por reglas de negocio.

3. Corregir wiring funcional visible.
   - Tabs y quick actions.
   - Entry points desde dashboard y patient detail.

4. Endurecer telemedicina.
   - Gate de join por disponibilidad real de sesion.
   - Bootstrap auth antes de deep links.
   - Test de cold start desde push.

5. Agregar pruebas Android reales.
   - Instrumentation para login, tabs, push routing y anamnesis.
   - Smoke e2e con un fixture de paciente y otro de doctor.

## Checklist Senior De Cierre E2E

Antes de declarar Android listo para una fase piloto, deberian estar cumplidos estos puntos:

- [ ] Logout revoca token FCM y elimina cache medica local del usuario saliente.
- [ ] Ningun fallback offline puede mostrar datos de otro usuario.
- [ ] Push notifications abren exactamente la pantalla correcta con sesion valida.
- [ ] Join call solo aparece cuando existe sesion resoluble y autorizada.
- [ ] Anamnesis no puede marcarse completa con secciones vacias.
- [ ] Estados `completed`, `approved` y `locked` se respetan en UI y backend.
- [ ] Quick actions y tabs navegan al destino correcto.
- [ ] Hay tests instrumentados para los flujos doctor/paciente mas importantes.

## Decision Operativa

Conclusion senior: la plataforma Android es prometedora y ya tiene bastante inversion util, pero hoy esta en una etapa **feature-rich / e2e-incomplete**.

Si hubiera que etiquetarla con una sola frase:

> La app ya parece producto; todavia no opera como sistema clinico movil completamente cerrado.

Ese es exactamente el gap a cerrar en la siguiente fase.
