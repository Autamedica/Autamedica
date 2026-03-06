# Android Wave 0 Device Validation - 2026-03-06

## Objetivo

Validar en dispositivo real los cambios P0 ya implementados en Android antes de seguir cerrando telemedicina y salud clinica.

## Estado de ejecucion

- Implementacion: lista en codigo
- Ejecucion manual en dispositivo real: pendiente
- Motivo: desde este entorno no es posible operar FCM real, intents del launcher y estados de proceso Android sobre hardware fisico

## Alcance Wave 0

- aislamiento de cache offline por usuario
- logout con limpieza de token push
- routing push -> deep link -> pantalla destino
- cold start y warm start con notificaciones
- resiliencia minima del contrato de videollamada por `appointmentId`

## Precondiciones

- build Android instalada en dispositivo fisico o emulador con Play Services
- usuario `patient` de prueba y usuario `doctor` de prueba
- al menos una cita de chat y una cita de videoconsulta con `appointmentId` valido
- backend/Supabase accesible
- FCM configurado para el package actual
- logs disponibles via `adb logcat`

## Matriz de validacion

### W0-1. Cache offline aislada por usuario

1. Iniciar sesion con Usuario A.
2. Abrir citas y forzar carga remota.
3. Cerrar sesion.
4. Iniciar sesion con Usuario B en el mismo dispositivo.
5. Abrir citas con red deshabilitada.

Resultado esperado:
- no aparecen citas cacheadas del Usuario A
- el listado offline de Usuario B sale vacio o solo con sus propios datos
- no hay fuga cruzada de PHI/PII entre sesiones

Logs a revisar:
- repositorio de appointments usando `ownerUserId`
- ausencia de lecturas globales de Room sin usuario

### W0-2. Logout limpia push del dispositivo

1. Iniciar sesion con Usuario A.
2. Confirmar registro de token FCM en backend.
3. Cerrar sesion.
4. Disparar una notificacion hacia Usuario A.

Resultado esperado:
- el dispositivo no debe seguir recibiendo push de Usuario A despues del logout
- si el backend conserva historico, el token debe quedar invalidado o desvinculado

Logs a revisar:
- llamada a `clearFcmToken()` en logout
- backend sin asociacion activa del token al usuario saliente

### W0-3. Push de chat con app cerrada

1. Forzar cierre de app.
2. Enviar push de chat con `chat_room_id` valido.
3. Tocar la notificacion.

Resultado esperado:
- la app abre login si no hay sesion
- tras login exitoso, navega a la conversacion correcta
- no queda en home sin consumir la ruta pendiente

### W0-4. Push de chat con app abierta

1. Dejar la app en foreground en cualquier pantalla.
2. Enviar push de chat con `chat_room_id` valido.
3. Tocar la notificacion del sistema.

Resultado esperado:
- la app navega a la conversacion correcta
- no duplica pantallas ni rompe el back stack

### W0-5. Push de videollamada con app cerrada

1. Forzar cierre de app.
2. Enviar push de videollamada con `appointment_id` valido.
3. Tocar la notificacion.
4. Si no hay sesion, autenticarse.

Resultado esperado:
- la app aterriza en la videollamada correcta usando `appointmentId`
- la identidad del participante sale de la sesion autenticada, no de extras del intent
- no es posible inyectar otro `participantId` via notificacion

### W0-6. Push de videollamada con app abierta

1. Dejar la app en foreground.
2. Enviar push de videollamada.
3. Tocar la notificacion.

Resultado esperado:
- navega a la videollamada correspondiente
- no duplica inicializacion del engine
- no duplica observers/realtime collectors

## Casos de regresion rapida

- abrir app sin notificaciones pendientes no debe navegar solo
- tap repetido sobre la misma notificacion no debe generar rutas inconsistentes
- logout desde videollamada o chat no debe dejar rutas pendientes reutilizables en la siguiente sesion
- cambio de sesion paciente -> medico en el mismo dispositivo no debe heredar cache ni rutas privadas

## Evidencia a capturar

- video corto o capturas de `W0-3` a `W0-6`
- `adb logcat` filtrado por package
- estado del token FCM antes y despues de logout
- evidencia de que Room no muestra datos cruzados entre usuarios

## Criterio de cierre

Wave 0 se considera cerrada solo si:

- no hay fuga de datos offline entre usuarios
- el dispositivo deja de recibir push del usuario deslogueado
- chat y videollamada enrutan correctamente con app cerrada y abierta
- la videollamada se abre con identidad derivada de sesion y no de extras inseguros

## Siguiente foco despues de Wave 0

- A1-1: validacion clinica por seccion de anamnesis
- A1-2: locking real de anamnesis en UI y backend
- A1-3: runtime telemedicina con `signalingUrl` e `iceServers` por sesion
