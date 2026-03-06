# Android Senior Backlog

- Fecha: 2026-03-06
- Owner: Codex
- TTL: 2026-04-06
- Base de referencia: `docs/ANDROID_PLATFORM_SENIOR_E2E_GUIDE_2026-03-06.md`
- Estado de este backlog: post-hardening inicial de privacidad offline y deep-link de videollamada

## Cambios Ya Aplicados En Esta Iteracion

1. La cache offline de appointments ahora queda aislada por `ownerUserId` y se limpia en logout.
2. Logout ahora limpia el token FCM remoto/local antes de cerrar sesion.
3. La ruta de videollamada ya no depende de `user_id/user_type/user_name` pasados por navegación; esa identidad sale de la sesion autenticada.
4. El entrypoint por notificaciones ahora procesa intents como eventos y soporta `deep_link` ademas de `appointment_id` y `chat_room_id`.
5. Se agrego cobertura unitaria del resolver de rutas de notificacion.

## Estado Recomendado De Ejecucion

- Wave 0: Validar en dispositivo lo que se endurecio en esta iteracion.
- Wave 1: Cerrar integridad clinica y contratos faltantes de telemedicina.
- Wave 2: Corregir wiring funcional visible y lifecycle de realtime.
- Wave 3: Subir cobertura Android a nivel de release candidate.

## Wave 0 - Verificacion Inmediata

### A0-1. Validar logout seguro en dispositivo real

- Prioridad: P0
- Objetivo: confirmar que el dispositivo deja de recibir pushes del usuario saliente.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/main/MainViewModel.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/data/repository/NotificationRepositoryImpl.kt`
- Acceptance criteria:
  - login usuario A -> push llega
  - logout usuario A
  - login usuario B
  - push de A no llega mas
  - push de B llega normalmente

### A0-2. Validar aislamiento de cache offline por usuario

- Prioridad: P0
- Objetivo: asegurar que no hay leakage de turnos entre sesiones.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/data/repository/AppointmentRepositoryImpl.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/data/local/room/dao/AppointmentDao.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/data/local/room/entity/AppointmentEntity.kt`
- Acceptance criteria:
  - usuario A carga turnos online
  - logout
  - usuario B entra y se fuerza modo offline
  - usuario B no ve datos de A

### A0-3. Validar push -> deep link -> videollamada

- Prioridad: P0
- Objetivo: probar cold start y app warm con notificaciones de chat y llamada.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/MainActivity.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/navigation/NotificationRouteResolver.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/service/NotificationHelper.kt`
- Acceptance criteria:
  - con app cerrada, push de chat abre conversacion correcta
  - con app abierta, push de chat vuelve a navegar correctamente
  - con app cerrada, push de llamada abre videollamada con sesion valida
  - con app abierta, push de llamada vuelve a navegar correctamente

## Wave 1 - Integridad Clinica Y Telemedicina

### A1-1. Agregar validacion obligatoria por seccion de anamnesis

- Prioridad: P0
- Objetivo: que `saveAndNext()` no marque secciones clinicamente vacias como completas.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/health/AnamnesisFormViewModel.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/health/AnamnesisFormScreen.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/data/repository/HealthRepositoryImpl.kt`
- Acceptance criteria:
  - cada seccion tiene campos minimos definidos
  - una seccion invalida no puede marcarse completa
  - el usuario ve error accionable en UI
  - submit final falla si hay datos obligatorios faltantes

### A1-2. Enforce de estados `draft/completed/submitted/approved/locked`

- Prioridad: P0
- Objetivo: que la UI respete estados clinicos finales y el backend sea la autoridad.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/health/HealthScreen.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/health/AnamnesisFormViewModel.kt`
  - backend Supabase asociado a `anamnesis` y `anamnesis_sections`
- Acceptance criteria:
  - `locked=true` bloquea edicion
  - `approved/completed` no permiten escritura accidental
  - la UI distingue claramente draft vs submitted vs approved

### A1-3. Usar sesion de telemedicina completa en runtime

- Prioridad: P1
- Objetivo: consumir `signalingUrl` e `iceServers` reales cuando el backend los entregue.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/data/repository/TelemedicineRepositoryImpl.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/videocall/VideoCallViewModel.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/di/WebRTCModule.kt`
- Acceptance criteria:
  - runtime no queda atado solo a `BuildConfig.SIGNALING_URL`
  - ICE/TURN puede variar por sesion o ambiente
  - logs distinguen config build-time vs config entregada por backend

### A1-4. Gate real de `join call`

- Prioridad: P1
- Objetivo: solo mostrar CTA cuando la sesion exista y este autorizada.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/components/AppointmentCard.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/data/repository/TelemedicineRepositoryImpl.kt`
- Acceptance criteria:
  - CTA depende de status + disponibilidad de sesion
  - error backend no se descubre solo despues del tap

## Wave 2 - UX Operativa Y Lifecycle

### A2-1. Corregir quick actions y tabs mal cableadas

- Prioridad: P1
- Objetivo: que dashboard y main shell no envien al usuario a tabs equivocadas.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/main/MainScreen.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DashboardScreen.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DoctorDashboardScreen.kt`
- Acceptance criteria:
  - `Mis Turnos` abre turnos
  - `Mi Salud` abre salud
  - `Mi Perfil` abre perfil
  - `Ver todos pacientes` abre pacientes

### A2-2. Liberar canales realtime por conversacion

- Prioridad: P1
- Objetivo: evitar acumulacion de channels y flows al abrir multiples chats.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/data/repository/ChatRepositoryImpl.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatConversationViewModel.kt`
- Acceptance criteria:
  - existe unsubscribe por chat o lifecycle owner equivalente
  - abrir/cerrar conversaciones no deja channels huerfanos

### A2-3. Mejorar errores visibles de chat y dashboards

- Prioridad: P2
- Objetivo: exponer errores operativos con retry explicito.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatListViewModel.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/chat/ChatConversationViewModel.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DashboardScreen.kt`
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/dashboard/DoctorDashboardScreen.kt`
- Acceptance criteria:
  - el usuario ve estado de error
  - hay CTA de retry
  - enviar mensaje fallido deja feedback en pantalla

### A2-4. Cerrar features shell visibles

- Prioridad: P2
- Objetivo: decidir si `Health` extra features se implementan o se ocultan hasta estar listas.
- Archivos foco:
  - `apps/android/app/src/main/java/com/autamedica/android/presentation/health/HealthScreen.kt`
- Acceptance criteria:
  - no quedan tarjetas visibles sin decision de producto
  - si algo no existe, se comunica claramente o se retira de navegación

## Wave 3 - Testing De Release Candidate

### A3-1. Instrumentation tests para auth, push y shell principal

- Prioridad: P1
- Objetivo: subir cobertura Android real.
- Casos minimos:
  - login con sesion restaurada
  - logout seguro
  - quick actions correctas
  - deep link de chat
  - deep link de videollamada

### A3-2. Test de cambio de usuario + offline cache

- Prioridad: P0
- Objetivo: congelar el fix de privacidad para que no regrese.
- Casos minimos:
  - A online -> cache
  - logout
  - B offline
  - sin datos de A

### A3-3. Test de anamnesis multi-step

- Prioridad: P0
- Objetivo: validar integridad del formulario.
- Casos minimos:
  - no permite completar seccion invalida
  - permite draft parcial
  - submit final solo con criterios completos
  - estado locked bloquea edicion

## Orden Recomendado De Ejecucion En El Proximo Sprint

1. Ejecutar Wave 0 completa en dispositivo.
2. Implementar A1-1 y A1-2 antes de ampliar cualquier feature clinica.
3. Implementar A2-1 en paralelo porque es bajo riesgo y alto impacto visible.
4. Abrir Wave 3 apenas Wave 0 confirme que los fixes nuevos son correctos.

## Definicion De Done Del Canal Android

El canal Android puede considerarse serio para piloto controlado solo si:

- no existe leakage offline entre usuarios
- logout corta push de forma verificable
- push/deep-link abre rutas correctas con sesion valida
- anamnesis tiene validacion y locking real
- join call solo aparece cuando la sesion existe
- hay coverage instrumentada de los flujos mas riesgosos
