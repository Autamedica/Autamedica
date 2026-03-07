# Android Telemedicine Demo Setup

## Objetivo

Dejar un medico y un paciente reales, con cuentas `auth.users` existentes, listos para probar telemedicina desde Android en dos dispositivos.

## Lo que Android necesita hoy

La app Android actual consume dos caminos en paralelo:

- Rol y shell de UI:
  - `auth.users.raw_user_meta_data.role`
  - `public.profiles.role`
- Identidad de negocio:
  - `public.doctors.user_id`
  - `public.patients.user_id`
- Agenda visible:
  - `public.appointments.doctor_id`
  - `public.appointments.patient_id`
- Acceso de medico a paciente:
  - `public.doctor_patient`
  - `public.patient_care_team`
- Telemedicina:
  - `public.telemedicine_sessions` para disponibilidad moderna/LiveKit
  - `public.calls` + `public.appointments.meeting_url` para el runtime legacy que sigue activo por default en Android

## Punto importante del build actual

En Android, `USE_LIVEKIT` sigue default `false` en [app/build.gradle.kts](/home/edu/Autamedica/apps/android/app/build.gradle.kts#L87). Eso implica:

- La app puede marcar un turno como "joinable" usando `telemedicine_sessions`.
- Pero el runtime efectivo que hoy abre la llamada todavía resuelve la sala con `appointments.meeting_url -> calls` en [TelemedicineRepositoryImpl.kt](/home/edu/Autamedica/apps/android/app/src/main/java/com/autamedica/android/data/repository/TelemedicineRepositoryImpl.kt#L144) y [VideoCallViewModel.kt](/home/edu/Autamedica/apps/android/app/src/main/java/com/autamedica/android/presentation/videocall/VideoCallViewModel.kt#L333).

Por eso el setup demo correcto, para la build instalada hoy, tiene que escribir ambos:

- `telemedicine_sessions`
- `calls` y `appointments.meeting_url`

## Script listo para usar

Usar [setup-demo-telemedicine.sql](/home/edu/Autamedica/scripts/setup-demo-telemedicine.sql).

Hace esto:

- Toma dos usuarios existentes de `auth.users` por email.
- Corrige `raw_user_meta_data.role` para que Android no siga entrando como `patient`.
- Upsertea `profiles`, `doctors`, `patients`.
- Vincula medico-paciente en `doctor_patient` y `patient_care_team`.
- Crea un `appointment` compartido.
- Crea un `call` activo para el runtime legacy.
- Crea una `telemedicine_session` activa para el path LiveKit/moderno.

## Como ejecutarlo

1. Abrir Supabase SQL Editor con permisos de admin/service role.
2. Editar al principio del archivo:
   - `v_doctor_email`
   - `v_patient_email`
   - nombres, licencia y especialidad si queres
3. Ejecutar el script completo.
4. Confirmar los `NOTICE` finales con IDs de doctor, paciente, turno, call y session.

## Como probar en Android

1. En el telefono del medico:
   - cerrar sesion si ya estaba abierta
   - volver a iniciar sesion con la cuenta doctor
2. En el telefono del paciente:
   - cerrar sesion si ya estaba abierta
   - volver a iniciar sesion con la cuenta patient
3. Verificar que el medico ya no entre como paciente.
4. Ir a agenda/dashboard en ambos.
5. Confirmar que ambos ven el mismo turno de telemedicina.
6. Entrar primero con el medico y luego con el paciente.

## Si el medico sigue entrando como paciente

Eso casi siempre significa una de estas dos cosas:

- no se actualizo `auth.users.raw_user_meta_data.role`
- el usuario seguia con una sesion vieja cacheada en Android

La app hidrata rol desde metadata y lo cachea localmente en [AuthRepositoryImpl.kt](/home/edu/Autamedica/apps/android/app/src/main/java/com/autamedica/android/data/repository/AuthRepositoryImpl.kt#L21), así que hace falta logout/login real después del cambio.

## Verificaciones utiles

El SQL ya deja consultas comentadas al final para verificar:

- `auth.users` con `auth_role`
- `profiles`
- `doctors`
- `patients`
- `appointments`
- `calls`
- `telemedicine_sessions`

## Criterio operativo

Para la build Android actual, el setup mínimo senior para demo real es:

- `profiles.role` correcto
- `auth.users.raw_user_meta_data.role` correcto
- fila en `doctors`
- fila en `patients`
- `doctor_patient`
- `patient_care_team`
- `appointments`
- `calls`
- `appointments.meeting_url`
- `telemedicine_sessions`

Si falta cualquiera de esos bloques, el flujo queda parcialmente roto:

- sin rol: entra como paciente
- sin `doctors` o `patients`: no carga agenda correcta
- sin `doctor_patient` o `patient_care_team`: el medico queda sin contexto/permiso
- sin `calls` o `meeting_url`: la llamada legacy no levanta
- sin `telemedicine_sessions`: el gate moderno no marca disponibilidad
