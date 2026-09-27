# Sistema de Notificaciones AutaMedica — Spec Canónico

> Fuente de verdad para todas las notificaciones que llegan al celular del paciente y del médico.
> Cada notificación debe pasar el filtro: *"Si esto me llega a las 11 PM, ¿lo abro o lo borro?"*
>
> **Versión:** 1.0 — Septiembre 2026
> **Canal objetivo:** Android (FCM push + in-app portal_notifications)
> **Canales complementarios:** WhatsApp (OpenClaw), Email (Resend)

---

## 1. Principios Rectores

### 1.1 El Hook de YouTube, pero en tu bolsillo

Un short de YouTube tiene 0.3 segundos para que el pulgar pare de hacer scroll. Una notificación tiene el mismo window. La diferencia es que el short puede ser entretenido aunque sea útil; la notificación **solo tiene valor si resuelve algo ahora**.

**Regla del hook en notificación:**

```
TÍTULO = Qué cambió (en 5 palabras o menos)
CUERPO  = Por qué te importa + qué hacés ahora (1 línea)
```

Ejemplo malo:
```
Título: "Recordatorio AutaMedica"
Body:  "Tenés un turno próximo. Ingrese a la plataforma para más detalles."
```

Ejemplo bueno:
```
Título: "Turno con Dr. García mañana 10:00"
Body:  "¿Confirmás asistencia? Respondé CONFIRMO o CANCELO."
```

### 1.2 Anti-molestia: Las 5 Reglas de Oro

1. **Máximo 2 notificaciones push por día al paciente** (excluye llamadas entrantes).
2. **Máximo 4 notificaciones push por día al médico** (excluye llamadas).
3. **Quiet hours 21:00–08:00 local** — nada sale en esta ventana salvo llamadas entrantes (urgent).
4. **Dedupe por `dedupe_key`** — un evento idempotente nunca genera dos notificaciones.
5. **Primera vez = valor, seguimiento = recordatorio.** La primera notificación explica; la segunda pide acción.

### 1.3 Canales Android y prioridades

| Channel ID                  | Nombre en Android       | Uso                                  | Prioridad FCM | Sonido/Vibración         |
| --------------------------- | ----------------------- | ------------------------------------ | ------------- | ------------------------ |
| `autamedica_appointments`   | Turnos y consultas      | Agendados, recordatorios, cancelados | `high`        | Sonido predeterminado    |
| `autamedica_incoming_calls` | Llamadas entrantes      | Videollamada entrante                | `high`        | Ringtone + bypass DND    |
| `autamedica_calls`          | Videollamadas           | Paciente/dDoctor se conecta          | `high`        | Sonido predeterminado    |
| `autamedica_messages`       | Mensajes                | Chat doctor↔paciente                 | `default`     | Sin sonido especial      |
| `autamedica_prescriptions`  | Recetas                 | Receta emitida / disponible          | `default`     | Sin sonido especial      |
| `autamedica_health`         | Seguimiento de salud    | Adherencia, resultados, informes     | `default`     | Sin sonido especial      |
| `autamedica_general`        | General                 | Borrador / fallback                  | `min`         | Silencioso               |

> **Nota:** `autamedica_health` es un channel nuevo. Debe agregarse en `NotificationHelper.kt`.

---

## 2. Catálogo de Notificaciones — PACIENTE

### 2.1 Resumen ejecutivo

| ID                          | Disparador                              | Timing                          | Canal FCM         | WhatsApp | Frecuencia max/día |
| --------------------------- | --------------------------------------- | ------------------------------- | ----------------- | -------- | ------------------ |
| `APPOINTMENT_CONFIRMED`     | Doctor acepta turno                     | Inmediato                       | appointments/high | No       | 1                  |
| `APPOINTMENT_REMINDER_24H`  | Cron (process-reminders)                | 24h antes del turno              | appointments/high | Sí       | 1                  |
| `APPOINTMENT_REMINDER_1H`   | Cron (process-reminders)                | 1h antes del turno               | appointments/high | No       | 1                  |
| `APPOINTMENT_CANCELLED`     | Doctor o paciente cancela               | Inmediato                       | appointments/high | No       | 1                  |
| `WAITLIST_OFFER`            | Se libera cupo en waitlist              | Inmediato                       | appointments/high | Sí       | 1                  |
| `INCOMING_CALL`             | Doctor inicia videollamada              | Inmediato                       | incoming_calls    | No       | Sin límite*        |
| `PRESCRIPTION_READY`        | Doctor emite receta PDF                 | Inmediato (tras PDF generado)    | prescriptions     | No       | 1                  |
| `FOLLOWUP_48H`              | Cron 48h post-consulta                  | 48h después de la consulta      | health            | Sí       | 1                  |
| `MEDICATION_REMINDER`       | Cron adherence (medication_schedules)   | ±10 min de hora de toma         | health            | Sí       | 3 (frecuencia toma) |
| `REPORT_READY`              | Informe clínico generado                | Inmediato (tras generación)      | health            | No       | 1                  |
| `ANAMNESIS_REMINDER`        | Paciente no completó anamnesis          | 24h después de agendar turno     | health            | No       | 1                  |
| `WELCOME_PUSH`              | Registro + primer login                 | 5 min después del registro       | general           | No       | 1                  |

*\* Las llamadas entrantes no tienen cap porque son de alta prioridad clínica y el paciente debe atenderlas.*

### 2.2 Copy detallado por notificación

---

#### `APPOINTMENT_CONFIRMED`
**Disparador:** `domainEvents.emit('appointment.scheduled')` → edge function `send-push-notification`
**Timing:** Inmediato al agendar
**Por qué:** El paciente agendó un turno y necesita certeza de que quedó registrado. Reduce ansiedad y consultas al soporte.

```
Título:  Turno confirmado — {doctor_name}
Body:    {weekday} {day} de {month}, {time}hs. {modality}
Action:  /appointments/{id}
```

**Ejemplo (presencial):**
```
Título:  Turno confirmado — Dr. García
Body:    Miércoles 5 de marzo, 10:00hs. Presencial: Av. Corrientes 1234
```

**Ejemplo (teleconsulta):**
```
Título:  Turno confirmado — Dra. López
Body:    Jueves 6 de marzo, 15:30hs. Teleconsulta — ingresá desde la app
```

---

#### `APPOINTMENT_REMINDER_24H`
**Disparador:** Cron `process-reminders` (edge function) — ya activo
**Timing:** 24h antes del turno
**Por qué:** Dá tiempo real para reagendar o cancelar con anticipación, reduciendo no-shows. Evita sorpresas de último momento.

```
Título:  Turno mañana con {doctor_name}
Body:    {weekday} {day}, {time}hs. {location_or_telemedicine}. ¿Confirmás?
```

**Ejemplo:**
```
Título:  Turno mañana con Dr. García
Body:    Miércoles 5, 10:00hs. Av. Corrientes 1234. Respondé CONFIRMO o CANCELO.
```

---

#### `APPOINTMENT_REMINDER_1H`
**Disparador:** Cron `process-reminders` (edge function)
**Timing:** 1h antes del turno
**Por qué:** Recordatorio final de acción. El paciente necesita saber que la consulta está por empezar y dónde entrar.

```
Título:  Tu turno en 1 hora
Body:    Con {doctor_name} a las {time}hs. {location_or_ingresa_a_la_app}.
```

**Ejemplo:**
```
Título:  Tu turno en 1 hora
Body:    Con Dr. García a las 10:00hs. Ingresá a la app para la videollamada.
```

---

#### `APPOINTMENT_CANCELLED`
**Disparador:** `domainEvents.emit('appointment.cancelled')`
**Timing:** Inmediato
**Por qué:** El paciente necesita saber que su turno ya no existe para no presentarse. Si fue cancelación del doctor, puede reagendar rápido.

```
Título:  Turno cancelado
Body:    Tu consulta con {doctor_name} del {date} fue cancelada.{reason_suffix}
Action:  /appointments
```

**Ejemplo (doctor canceló):**
```
Título:  Turno cancelado
Body:    Tu consulta con Dr. García del miércoles 5 fue cancelada. Motivo: reprogramación médica.
```

**Ejemplo (sistema):**
```
Título:  Turno cancelado
Body:    Tu consulta con Dra. López del jueves 6 fue cancelada.
```

---

#### `WAITLIST_OFFER`
**Disparador:** Cron `process-reminders` → waitlist dispatch
**Timing:** Inmediato (cupo liberado)
**Por qué:** El paciente está en lista de espera y hay un cupo real con deadline. Debe decidir rápido.

```
Título:  Cupo disponible con {doctor_name}
Body:    {date} a las {time}hs. Tenés {deadline} para aceptar. Respondé ACEPTO.
```

**Ejemplo:**
```
Título:  Cupo disponible con Dr. García
Body:    Viernes 7 a las 14:00hs. Tenés 2 horas para aceptar. Respondé ACEPTO.
```

---

#### `INCOMING_CALL`
**Disparador:** `domainEvents.emit('call.started')` → edge function `send-push-notification`
**Timing:** Inmediato, ultra-alta prioridad
**Por qué:** Esta notificación es una llamada. El paciente debe atenderla ahora o se la pierde. Cada segundo cuenta.

```
Título:  {doctor_name} te está llamando
Body:    Videollamada para tu consulta — tocá para entrar
Action:  /videocall/{appointment_id}
Channel: incoming_calls (ringtone + bypass DND)
Priority: high + category CALL
```

---

#### `PRESCRIPTION_READY`
**Disparador:** Edge function `issue-prescription` genera PDF → trigger post-PDF
**Timing:** Inmediato tras generar el PDF
**Por qué:** El paciente necesita su receta para ir a la farmacia. Sin esto, tiene que llamar o escribir para pedirla.

```
Título:  Tu receta de {doctor_name} está lista
Body:    {drug_list_summary}. Descargala desde la app.
Action:  /prescriptions/{prescription_id}
```

**Ejemplo:**
```
Título:  Tu receta de Dra. López está lista
Body:    Amoxicilina 500mg x 7 días. Descargala desde la app.
```

---

#### `FOLLOWUP_48H`
**Disparador:** Cron `followupScheduleService.schedule48hFollowup` → OpenClaw WhatsApp (ya activo)
**Timing:** 48h después de la consulta
**Por qué:** Seguimiento clínico real. Detecta si el paciente mejoró, empeoró o sigue igual. Permite intervenir temprano.

```
Canal: WhatsApp (ya activo — ver buildFollowup48h)
Copy existente (ES): "Hola {name}, te contactamos de parte del Dr. {doctor} por AutaMedica. ¿Cómo te venís sintiendo tras iniciar el tratamiento? Respondé: 1 - Mejor | 2 - Igual | 3 - Peor"
Copy existente (PT-BR): "Olá {name}, aqui é a equipe médica do Dr. {doctor} pela AutaMedica. Passando para checar: como você está se sentindo hoje após o início do tratamento? Responda com: 1 - Melhor | 2 - Igual | 3 - Pior"
```

**Nueva variante — Push in-app (sin WhatsApp):**
```
Título:  ¿Cómo te sentís tras la consulta?
Body:    Llevás 48h del tratamiento. Respondé en la app: Mejor / Igual / Peor.
Action:  /continuity
Channel: health
```

---

#### `MEDICATION_REMINDER`
**Disparador:** Cron `adherence-reminder.ts` (reminder-worker) → WhatsApp (ya activo)
**Timing:** ±10 minutos de la hora de toma programada
**Por qué:** Adherencia al tratamiento. El paciente olvida la toma; el recordatorio lo mantiene en el camino.

```
Canal principal: WhatsApp (ya activo — ver adherence-reminder.ts)
Copy existente: "Recordatorio AutaMedica: tomá {drug_name} {dosage} a las {time}. Respondé "SI" cuando lo hagas, o "NO" si preferís saltearlo."
```

**Nueva variante — Push in-app (sin WhatsApp):**
```
Título:  Tomá {drug_name} {dosage}
Body:    Hora programada: {time}. Recordá que la adherencia mejora los resultados.
Action:  /prescriptions/{prescription_id}
Channel: health
```

---

#### `REPORT_READY`
**Disparador:** `domainEvents.emit('consultation.report_generated')` → edge function (ya parcialmente activo en portal_notifications)
**Timing:** Inmediato tras generación
**Por qué:** El paciente quiere ver qué dijo el informe. Este es el momento de mayor engagement: acaba de consultar y quiere el resultado.

```
Título:  Informe de tu consulta listo
Body:    Dr. {doctor_name} publicó el resumen de tu atención del {date}.
Action:  /reports/{consultation_id}
Channel: health
```

---

#### `ANAMNESIS_REMINDER`
**Disparador:** Cron nuevo (ver sección 5.1)
**Timing:** 24h después de agendar turno sin anamnesis completa
**Por qué:** El doctor necesita la anamnesis antes de la consulta. Sin ella, la consulta arranca con desventaja y el paciente pierde tiempo.

```
Título:  Completá tu historia antes del turno
Body:    Tu consulta con {doctor_name} es mañana. Completá la anamnesis en 5 min para que todo salga fluido.
Action:  /anamnesis
Channel: health
```

---

#### `WELCOME_PUSH`
**Disparador:** Edge function post-registro / trigger de login首次
**Timing:** 5 min después del registro (no inmediato para evitar sensación de spam)
**Por qué:** Guiar al paciente recién registrado hacia su primera acción útil. Sin esto, muchos se pierden.

```
Título:  Bienvenido a AutaMedica
Body:    Tu primer paso: completá tu historial de salud para que tu médico te conozca mejor.
Action:  /anamnesis
Channel: general
```

---

## 3. Catálogo de Notificaciones — DOCTOR

### 3.1 Resumen ejecutivo

| ID                            | Disparador                          | Timing                          | Canal FCM        | Frecuencia max/día |
| ----------------------------- | ----------------------------------- | ------------------------------- | ---------------- | ------------------ |
| `APPOINTMENT_NEW`             | Paciente agenda turno               | Inmediato                       | appointments/high | 3                  |
| `APPOINTMENT_CANCELLED_DOC`   | Paciente cancela turno              | Inmediato                       | appointments/high | 3                  |
| `ANAMNESIS_COMPLETED`         | Paciente completa anamnesis         | Inmediato (sin push, solo in-app)| —                | —                  |
| `PATIENT_CONNECTED`           | Paciente ingresa a sala de espera   | Inmediato                       | calls/high       | Sin límite*        |
| `FOLLOWUP_RESPONSE_DOC`       | Paciente responde 48h followup      | Inmediato tras respuesta        | health           | 3                  |
| `ADHERENCE_ALERT_DOC`         | Paciente omite 3+ tomas seguidas    | Inmediato                       | health           | 1                  |
| `CLINICAL_SAFETY_OUTBOX`      | Regla de seguridad clínica se activa| Inmediato                       | health (high)    | Sin límite*        |
| `PRESCRIPTION_DISPENSATION`   | Farmacia procesa dispensación       | Inmediato                       | prescriptions    | 3                  |

*\* Llamadas y alertas clínicas son urgentes; no aplican cap.*

### 3.2 Copy detallado por notificación

---

#### `APPOINTMENT_NEW`
**Disparador:** `domainEvents.emit('appointment.scheduled')` → `notification-triggers.ts` (portal_notifications)
**Timing:** Inmediato
**Por qué:** El doctor necesita enterarse de que tiene un turno nuevo para prepararse y evitar show-up sin preparación.

```
Título:  Nuevo turno con {patient_name}
Body:    {weekday} {day} de {month}, {time}hs — {type}. Revisá la anamnesis antes de ingresar.
Action:  /doctors/agenda
```

**Ejemplo:**
```
Título:  Nuevo turno con María García
Body:    Miércoles 5 de marzo, 10:00hs — Teleconsulta. Revisá la anamnesis antes de ingresar.
```

---

#### `APPOINTMENT_CANCELLED_DOC`
**Disparador:** `domainEvents.emit('appointment.cancelled')` → `notification-triggers.ts`
**Timing:** Inmediato
**Por qué:** El doctor puede reasignar el slot liberado o ajustar su agenda.

```
Título:  {patient_name} canceló su turno
Body:    Era para el {date} a las {time}hs. El espacio quedó libre en tu agenda.
Action:  /doctors/agenda
```

**Ejemplo:**
```
Título:  María García canceló su turno
Body:    Era para el miércoles 5 a las 10:00hs. El espacio quedó libre en tu agenda.
```

---

#### `ANAMNESIS_COMPLETED`
**Disparador:** `domainEvents.emit('anamnesis.completed')` → portal_notifications (ya activo)
**Timing:** Inmediato
**Por qué:** El doctor ve que el paciente completó su historial. Puede revisar antes de la consulta.

```
Title:  Anamnesis completada
Body:   {patient_name} completó su historial. Revisalo antes de la consulta.
Action: /doctors/patients/{patient_id}
Channel: in-app (sin push — no es urgente, el doctor lo verá cuando entre)
```

---

#### `PATIENT_CONNECTED`
**Disparador:** `domainEvents.emit('call.started')` → `notification-triggers.ts` + FCM push
**Timing:** Inmediato
**Por qué:** El doctor debe saber que el paciente ya está en la sala de espera para iniciar la videollamada.

```
Título:  {patient_name} está en la sala de espera
Body:    La videollamada está lista — hacé clic para entrar.
Action:  /doctors/videocall/{appointment_id}
Channel: calls (high priority)
```

---

#### `FOLLOWUP_RESPONSE_DOC`
**Disparador:** Inbound watcher detecta respuesta del paciente al followup 48h
**Timing:** Inmediato tras procesar respuesta
**Por qué:** El doctor necesita saber si el paciente mejoró, igual o peor. Si respondió "3 - Peor", debe intervenir.

```
Título:  {patient_name} respondió tu seguimiento
Body:    {response_summary}. Consultá la evolución en el panel.
Action:  /doctors/patients/{patient_id}/continuity
Channel: health
```

**Ejemplos:**
```
Si respondió 1: Título: María García: "Mejor" — seguimiento post-consulta
Si respondió 3: Título: María García reportó "Peor" — revisá el caso
```

---

#### `ADHERENCE_ALERT_DOC`
**Disparador:** Cron que detecta 3+ omisiones de toma consecutivas en `medication_intake_events`
**Timing:** Inmediato tras detectar la omisión del 3er registro
**Por qué:** El doctor necesita saber que un paciente dejó de tomar su medicación. 3 omisiones consecutivas son una señal clínica seria.

```
Título:  {patient_name} omitió 3 tomas de {drug_name}
Body:    Última toma registrada: {last_take_date}. Es necesario revisar adherencia.
Action:  /doctors/patients/{patient_id}
Channel: health (high priority)
```

---

#### `CLINICAL_SAFETY_OUTBOX`
**Disparador:** Edge function `issue-prescription` evalúa `clinical_safety_rules` → outbox
**Timing:** Inmediato
**Por qué:** Una regla de seguridad clínica se activó (ej. interacción medicamentosa, dosis fuera de rango). Esto es de vida o muerte.

```
Título:  ⚠ Alerta clínica — {rule_name}
Body:    {patient_name}: {rule_description}. Revisá antes de emitir.
Action:  /doctors/patients/{patient_id}/safety
Channel: health (high priority, bypass quiet hours)
```

---

#### `PRESCRIPTION_DISPENSATION`
**Disparador:** Edge function `execute-dispensation` → post-procesamiento
**Timing:** Inmediato
**Por qué:** El doctor necesita saber que el paciente ya retiró o está procesando su receta. Completa el ciclo de atención.

```
Título:  {patient_name} está procesando su receta
Body:    Farmalink confirmó la dispensación de {drug_name}. El seguimiento continuó.
Action:  /doctors/patients/{patient_id}
Channel: prescriptions
```

---

## 4. Horarios y Reglas de Timing

### 4.1 Ventanas de envío

| Hora local           | Comportamiento                                             |
| -------------------- | ---------------------------------------------------------- |
| 08:00 – 21:00       | Todas las notificaciones se envían normalmente              |
| 21:00 – 08:00       | Solo llamadas entrantes y alertas clínicas (urgencia real)  |
| Feriados            | Sin cambios (los pacientes están en casa, es buen momento)  |

### 4.2 Calendario de envío por tipo

| Notificación              | Día exacto de envío                              | Hora aprox       |
| ------------------------- | ------------------------------------------------ | ---------------- |
| `APPOINTMENT_CONFIRMED`   | Día de agendamiento                              | Inmediato        |
| `APPOINTMENT_REMINDER_24H`| Día anterior al turno                            | 18:00            |
| `APPOINTMENT_REMINDER_1H` | Día del turno                                    | 1h antes exacto  |
| `FOLLOWUP_48H`            | 48h después de la consulta                       | 10:00            |
| `MEDICATION_REMINDER`     | Todos los días (mientras el schedule esté activo)| ±10 min de toma |
| `ANAMNESIS_REMINDER`      | 24h después de agendar (si incompleta)           | 10:00            |
| `WELCOME_PUSH`            | 5 min post-registro                              | Inmediato        |

### 4.3 Anti-duplicados

Cada notificación lleva una `dedupe_key` única. Ejemplos:

| Tipo                    | dedupe_key                                         |
| ----------------------- | -------------------------------------------------- |
| `APPOINTMENT_CONFIRMED` | `appt_confirmed:{appointment_id}`                 |
| `APPOINTMENT_REMINDER`  | `appt_reminder:{appointment_id}:{hours_before}`   |
| `PRESCRIPTION_READY`    | `rx_ready:{prescription_id}`                       |
| `FOLLOWUP_RESPONSE`     | `followup_resp:{call_id}:{response_date}`          |
| `ADHERENCE_ALERT`       | `adherence_alert:{patient_id}:{drug_name}:{date}`  |

---

## 5. Infraestructura Necesaria (Roadmap de Implementación)

### 5.1 Nuevos components a crear

| Componente                          | Responsabilidad                                               | Ubicación                              |
| ----------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `packages/notifications/catalog.ts` | Catálogo tipado de todas las notificaciones (source of truth) | `packages/notifications/src/`          |
| `packages/notifications/copy.ts`    | Copy por notificación (ES + PT-BR) — genera el título y body | `packages/notifications/src/`          |
| `packages/notifications/rules.ts`   | Reglas de timing, quiet hours, frequency caps                 | `packages/notifications/src/`          |
| `notification_scheduler` (worker)   | Cron que revisa los eventos pendientes y dispara FCM          | `apps/reminder-worker/src/` o nuevo    |
| DB migration                        | Tabla `notification_queue` (cola de push pendientes)          | `supabase/migrations/`                 |
| Android: `NotificationType` update  | Agregar `ANAMNESIS_REMINDER`, `ADHERENCE_ALERT`, etc.         | `apps/android/.../model/Notification.kt` |
| Android: channel `health`           | Nuevo channel de notificación                                 | `apps/android/.../service/NotificationHelper.kt` |

### 5.2 Flujo de envío

```
[Evento dominio / Cron]
        ↓
[catalog.ts: identifica tipo + audiencia]
        ↓
[copy.ts: genera título + body + dedupe_key]
        ↓
[rules.ts: verifica quiet hours, frequency cap, dedupe]
        ↓
[notification_queue: inserta si pasa filtros]
        ↓
[Cron cada 30s: drena cola → send-push-notification edge fn → FCM]
        ↓
[Android PushNotificationService recibe → NotificationHelper.show()]
```

### 5.3 Notificaciones que YA existen y NO deben re-crearse

| Tipo                    | Canal actual           | Estado   |
| ----------------------- | ---------------------- | -------- |
| Appointment reminders   | WhatsApp (OpenClaw)    | ✅ Activo |
| Medication adherence    | WhatsApp (OpenClaw)    | ✅ Activo |
| Followup 48h            | WhatsApp (OpenClaw)    | ✅ Activo |
| Portal notifications    | In-app + realtime      | ✅ Activo |
| FCM calls               | Push FCM               | ✅ Activo |

Lo que falta es la **capa de scheduling y copy unificada** para las notificaciones que hoy solo llegan por WhatsApp o solo por in-app (portal_notifications sin push).

---

## 6. Anti-patrones — Qué NUNCA notificar

| Patrón prohibido                                   | Ejemplo malo                                        | Por qué                                               |
| -------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Notificación genérica sin contexto                  | "Tienes una nueva notificación en AutaMedica"       | El usuario la borra sin leer                          |
| Notificación de marketing como si fuera clínica     | "¡Descubrí nuestros especialistas!"                | Rompe confianza                                       |
| Spam de records (mismo evento, 3 canales)           | Push + WhatsApp + email por el mismo turno          | Sensación de acoso                                    |
| Notificación sin acción posible                     | "Tu turno fue registrado" (sin link ni CTA)         | Ocupa espacio sin valor                               |
| Notificación a las 2 AM                             | Cualquier cosa que no sea llamada entrante           | Molesta y rompe el contrato de confianza              |
| Notificación al doctor sin nivel de urgencia claro  | "Recordá revisar tus pacientes"                     | No resuelve nada concreto ahora                       |
| Más de 2 notificaciones el mismo día al paciente    | 3 recordatorios distintos del mismo turno            | El usuario desactiva notificaciones permanentemente   |
| Título que dice "AutaMedica" en vez de la acción    | "AutaMedica: Nuevo mensaje"                          | Pierde el hook; el usuario necesita saber QUÉ pasó    |

---

## 7. Métricas de Control

| Métrica                        | Objetivo                               | Alerta si                        |
| ------------------------------ | -------------------------------------- | -------------------------------- |
| Tap rate por notificación      | > 15%                                  | < 5% → revisar copy o timing     |
| Opt-out rate semanal           | < 2%                                   | > 5% → reducir frecuencia        |
| No-show post-recordatorio 24h  | Bajar 20% vs baseline sin recordatorio | Si no baja → cambiar copy        |
| Followup response rate 48h     | > 60% responde (1/2/3)                | < 40% → el mensaje no engancha   |
| Adherence confirmation rate    | > 70% responde SI/NO                  | < 50% → recordatorio en mal horario|
| Pacientes con notif desactivada| < 3% de base activa                   | > 8% → hay spam activo           |

---

## 8. Decisión de Diseño: Push vs WhatsApp vs Ambos

| Notificación              | Push Android   | WhatsApp         | Email   | Justificación                                              |
| ------------------------- | -------------- | ---------------- | ------- | ---------------------------------------------------------- |
| Turno confirmado          | ✅             | ❌                | ❌      | Confirmación inmediata; WhatsApp es excesivo para esto      |
| Recordatorio turno 24h    | ✅ + WhatsApp  | ✅                | ❌      | WhatsApp =高 engagement; push = backup si cierra WhatsApp   |
| Recordatorio turno 1h     | ✅             | ❌                | ❌      | Push basta; 1h antes el paciente está en movimiento         |
| Cancelación               | ✅             | ❌                | ❌      | Solo necesita enterarse; no requiere respuesta              |
| Llamada entrante          | ✅ (urgente)   | ❌                | ❌      | Solo push con bypass DND; WhatsApp no es llamada            |
| Receta lista              | ✅             | ❌                | ✅      | Push para ir a la farmacia; email como backup del PDF       |
| Seguimiento 48h           | ✅             | ✅ (principal)    | ❌      | WhatsApp tiene mejor tasa de respuesta; push es respaldo    |
| Adherencia medicación     | ✅             | ✅ (principal)    | ❌      | WhatsApp interactivo (SI/NO); push recordatorio silencioso  |
| Informe disponible        | ✅             | ❌                | ✅      | Push para aviso; email como archivo permanente              |
| Alerta clínica al doctor  | ✅ (urgente)   | ❌                | ❌      | Push con bypass DND; es una alerta clínica, no un aviso     |
| Welcome                   | ✅             | ❌                | ❌      | Primer contacto; sin WhatsApp registrado aún               |

---

## 9. Notas de Implementación

### 9.1 En `notification-triggers.ts` (web)

El archivo actual solo inserta `portal_notifications`. Debe extenderse para llamar a `send-push-notification` edge function para los tipos críticos:

```typescript
// Después de insertPortalNotification(), agregar:
if (priority === 'high' || priority === 'urgent') {
  await sendFcmPush(userId, { type, title, body, data: { ... } })
}
```

### 9.2 En `NotificationType.kt` (Android)

Agregar los nuevos tipos:

```kotlin
ANAMNESIS_REMINDER("autamedica_health"),
ADHERENCE_ALERT("autamedica_health"),
CLINICAL_SAFETY("autamedica_health"),
```

### 9.3 En `NotificationHelper.kt` (Android)

Agregar el nuevo channel:

```kotlin
ChannelDef(
  id = "autamedica_health",
  name = "Seguimiento de salud",
  description = "Recordatorios de adherencia, resultados, informes y seguimiento clínico",
  importance = NotificationManager.IMPORTANCE_DEFAULT,
)
```

---

## 10. Changelog

| Versión | Fecha       | Cambio                                                    |
| ------- | ----------- | --------------------------------------------------------- |
| 1.0     | Sep 2026    | Spec inicial: 11 notificaciones paciente + 7 doctor       |

---

*Este documento es la fuente de verdad. Cada notificación que se agregue al sistema debe agregar aquí su definición completa antes de implementarse.*
