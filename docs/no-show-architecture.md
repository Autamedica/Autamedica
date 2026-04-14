# Arquitectura Anti No-Show — AutaMedica

## Vista general del sistema

```mermaid
flowchart TB
    subgraph ENTRADA["1. ENTRADA — Cita creada"]
        A1[Paciente agenda turno] --> A2[appointments.usecase.ts<br/>create]
        A2 --> A3{scheduleReminders}
        A3 -->|OK| A4[appointment_reminders<br/>status=pending<br/>24h + 2h antes]
        A3 -->|FALLO| A3F[Cita existe SIN recordatorios]
    end

    subgraph PREDICCION["2. PREDICCION — No-show score"]
        P1[noshow-predictor.ts<br/>predictNoShowProbability] --> P2[Factor 1: historial paciente<br/>peso 0.5]
        P1 --> P3[Factor 2: tasa global doctor<br/>peso 0.2]
        P1 --> P4[Factor 3: patron dia/hora<br/>peso 0.3]
        P2 & P3 & P4 --> P5{probabilidad > 0.3?}
        P5 -->|SI| P6[Slot marcado<br/>overbook_eligible=true]
        P5 -->|NO| P7[Slot normal]
    end

    subgraph RECORDATORIO["3. RECORDATORIO — Dispatch"]
        R1[reminder-worker.ts<br/>processReminderCycle<br/>cada 60s] --> R2[getPendingReminders<br/>status=pending AND<br/>scheduled_for <= now]
        R2 --> R3[processOneReminder]
        R3 --> R4{hoursUntil > 6?}
        R4 -->|SI| R5[buildReminder24h]
        R4 -->|NO| R6[buildReminder2h]
        R5 & R6 --> R7[sendMessageWithFallback<br/>OpenClaw CLI]
        R7 -->|OK| R8[markReminderSent<br/>status=sent]
        R7 -->|FALLO| R9[markReminderFailed<br/>status=failed]
    end

    subgraph RESPUESTA["4. RESPUESTA — Paciente contesta"]
        W1[inbound-watcher.ts<br/>polling journalctl<br/>cada 3s] --> W2{parsePatientResponse}
        W2 -->|CONFIRMO| W3[processReminderResponse<br/>response=confirmed]
        W2 -->|CANCELO| W4[processReminderResponse<br/>response=cancelled]
        W2 -->|ACEPTO| W5[handleWaitlistAcceptance<br/>acceptWaitlistOffer]
        W2 -->|otro texto| W6[Ignorado]
    end

    subgraph CANCELACION["5. CANCELACION — Slot liberado"]
        C1[Paciente cancela<br/>o responde CANCELO] --> C2[cancelReminders]
        C1 --> C3[processWaitlist]
        C3 --> C4{hay candidato<br/>en waitlist?}
        C4 -->|SI| C5[Marca status=offered<br/>offered_at, expires_at]
        C4 -->|NO| C6[Slot queda libre]
    end

    subgraph WAITLIST["6. WAITLIST — Oferta al siguiente"]
        WL1[reminder-worker.ts<br/>processUnsentWaitlistOffers<br/>NUEVO] --> WL2[getUnsentOffers<br/>status=offered AND<br/>offer_sent_at IS NULL]
        WL2 --> WL3[buildWaitlistOffer]
        WL3 --> WL4[sendMessageWithFallback]
        WL4 -->|OK| WL5[markOfferSent<br/>offer_sent_at=now]
        WL4 -->|FALLO| WL6[Reintenta en<br/>siguiente ciclo]
    end

    subgraph ACEPTACION["7. ACEPTACION — Paciente acepta oferta"]
        AC1[Paciente responde ACEPTO] --> AC2[handleWaitlistAcceptance]
        AC2 --> AC3{oferta expirada?}
        AC3 -->|NO| AC4[acceptWaitlistOffer<br/>crea appointment<br/>status=scheduled]
        AC3 -->|SI| AC5[Error: oferta expirada]
        AC4 --> AC6[scheduleReminders<br/>para nueva cita]
    end

    subgraph EXPIRACION["8. EXPIRACION — Limpieza"]
        E1[processReminderCycle] --> E2[expireStaleOffers<br/>status=offered AND<br/>expires_at < now]
        E2 --> E3[status=expired]
    end

    %% Conexiones entre subgrafos
    A4 -.-> R2
    A3F -.->|PROBLEMA| PACIENTE_SIN_AVISO
    R8 -.-> W1
    W4 -.-> C1
    C5 -.-> WL2
    WL5 -.-> W1
    AC4 -.-> A4
    P6 -.->|permite doble booking| A2

    style A3F fill:#ff6b6b,color:#fff
    style R9 fill:#ff6b6b,color:#fff
    style WL6 fill:#ffd93d,color:#333
    style W6 fill:#999,color:#fff
    style PACIENTE_SIN_AVISO fill:#ff6b6b,color:#fff
```

---

## Estado por componente

```
 ESTADO    COMPONENTE                          RIESGO    NOTAS
 -------- ----------------------------------- --------- ------------------------------------------
 [OK]      Recordatorio 24h                    Bajo      Funcional, templates correctos
 [OK]      Recordatorio 2h                     Bajo      Funcional, templates correctos
 [OK]      Confirmacion via WhatsApp            Bajo      CONFIRMO/CANCELO parseado correctamente
 [OK]      Cancelacion libera slot              Bajo      Trigger DB + processWaitlist
 [OK]      Waitlist matching por preferencias   Bajo      Filtra fecha/hora/prioridad
 [OK]      Expiracion de ofertas vencidas       Bajo      Corre cada 60s en worker + edge function
 [OK]      Overbooking inteligente             Bajo      Funcional con threshold 0.3
 [NUEVO]   Waitlist offer auto-dispatch         Bajo      Recien implementado, cierra el circuito
 -------- ----------------------------------- --------- ------------------------------------------
 [RIESGO]  Creacion de reminders               ALTO      Falla silenciosa, cita sin recordatorio
 [RIESGO]  Inbound watcher persistencia        ALTO      Mensaje perdido si backend esta caido
 [RIESGO]  Marcado de no-show                  ALTO      No hay endpoint que marque no_show
 [RIESGO]  Retry de reminders fallidos         MEDIO     status=failed es terminal, no reintenta
 [RIESGO]  Webhook sin rate limiting           MEDIO     Vulnerable a replay/flood
 [RIESGO]  Predictor parsing metadata          MEDIO     new_start_time puede ser malformado
 -------- ----------------------------------- --------- ------------------------------------------
 [MEJORA]  Config por doctor                   MEDIO     Hoy es global, no personalizable
 [MEJORA]  Blog dice 24h+1h, config dice 24h+2h BAJO    Inconsistencia comunicacion vs producto
 [MEJORA]  Blog dice "aprende", es heuristica  BAJO      Comunicacion inflada
 [MEJORA]  Cancelacion por doctor              BAJO      Solo paciente puede cancelar via usecase
```

---

## Puntos de falla detallados

### 1. CRITICO: Cita creada sin recordatorios

```
appointments.usecase.ts:79-86

    const appointment = await deps.appointmentsRepo.create(data)
    try {
      await scheduleReminders(deps.dbClient, appointment.id, 'whatsapp')
    } catch (reminderErr) {
      logger.error(...)  // <-- solo loguea, no re-throw
    }
    return appointment  // <-- cita existe, reminders no
```

**Impacto**: El paciente tiene cita pero nunca recibe recordatorio. Probabilidad alta de no-show.

**Solucion**: Envolver create + scheduleReminders en una transaccion DB. Si reminders falla, rollback de la cita. O como minimo: retry con backoff, o cola de "reminders pendientes de crear".

---

### 2. CRITICO: Nadie marca no_show

```
appointment_history trigger captura action='no_show' cuando
appointments.status cambia a 'no_show'.

PERO: No hay endpoint ni cron que setee status='no_show'.
```

**Impacto**: El predictor de no-show (`noshow-predictor.ts`) consulta `appointment_history` buscando `action='no_show'`. Si nunca se registra, el modelo siempre ve 0 no-shows y la probabilidad es siempre `BASE_RATE` (0.15). El overbooking inteligente nunca se activa porque ningun paciente supera el threshold de 0.3.

**Solucion**: Cron job o edge function que corra cada N minutos:

```sql
UPDATE appointments
SET status = 'no_show'
WHERE status IN ('scheduled', 'confirmed')
  AND start_time < now() - interval '30 minutes'
  AND end_time < now();
```

---

### 3. CRITICO: Inbound watcher pierde mensajes

```
inbound-watcher.ts:47-72

    const ok = await forwardToBackend(phone, text)
    if (!ok) {
      logger.error(...)  // <-- mensaje perdido para siempre
    }
```

**Impacto**: Si el backend esta caido cuando el paciente responde "CANCELO" o "ACEPTO", la respuesta se pierde. El paciente cree que cancelo, pero la cita sigue activa.

**Solucion**: Persistir mensajes inbound en tabla antes de forwardear:

```sql
CREATE TABLE inbound_messages (
  id uuid PRIMARY KEY,
  phone text NOT NULL,
  message text NOT NULL,
  processed boolean DEFAULT false,
  forwarded_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

### 4. MEDIO: Reminders fallidos no reintentan

```
reminder-worker.ts:69-75

    } catch (err) {
      result.failed++
      await markReminderFailed(supabase, reminder.id)  // terminal
    }
```

**Impacto**: Si OpenClaw tiene un timeout momentaneo, el reminder se marca como `failed` y nunca se reintenta. Paciente no recibe recordatorio.

**Solucion**: Agregar `retry_count` y `next_retry_at` a `appointment_reminders`. En vez de marcar `failed`, incrementar retry_count y setear next_retry_at con backoff exponencial. Solo marcar `failed` despues de 3 intentos.

---

### 5. MEDIO: Race condition en waitlist

```
waitlist.ts:84-94

    .update({ status: 'offered' })
    .eq('id', match.id)
    .eq('status', 'waiting')  // optimistic lock
```

El optimistic lock mitiga parcialmente, pero si dos workers corren simultaneamente:

- Worker A: busca candidatos, encuentra paciente X
- Worker B: busca candidatos, encuentra paciente X
- Worker A: UPDATE WHERE status='waiting' -> OK
- Worker B: UPDATE WHERE status='waiting' -> 0 rows (falla silenciosa)

**Impacto bajo** porque `processWaitlist` se llama sincricamente desde el request handler. Pero si se escala a multiples instancias del backend, puede haber duplicacion.

---

## Flujo completo: caso feliz vs caso de falla

### Caso feliz (funciona hoy)

```
Paciente agenda turno
  |
  v
Reminders creados (24h + 2h)
  |
  v
Worker envia reminder 24h antes por WhatsApp
  |
  v
Paciente responde "CONFIRMO"
  |
  v
Inbound watcher captura -> webhook -> processReminderResponse
  |
  v
Reminder marcado response=confirmed
  |
  v
Worker envia reminder 2h antes
  |
  v
Paciente asiste al turno
  |
  v
Doctor marca como completado  [*]
```

`[*]` No encontre endpoint de completado automatico tampoco.
Probablemente manual via UI del doctor.

### Caso: paciente cancela via WhatsApp

```
Paciente responde "CANCELO" al reminder
  |
  v
inbound-watcher -> webhook -> handleConfirmOrCancel
  |
  v
processReminderResponse(cancelled) + processWaitlist()
  |
  v
Waitlist: busca candidato que matchee fecha/hora
  |
  v
Candidato encontrado -> status=offered, offered_at=now, expires_at=+4h
  |
  v
[NUEVO] reminder-worker detecta offer_sent_at IS NULL
  |
  v
[NUEVO] buildWaitlistOffer -> sendMessageWithFallback -> WhatsApp
  |
  v
[NUEVO] markOfferSent(offer_sent_at=now)
  |
  v
Paciente en espera responde "ACEPTO"
  |
  v
inbound-watcher -> webhook -> handleWaitlistAcceptance
  |
  v
acceptWaitlistOffer -> crea nueva cita + scheduleReminders
  |
  v
Slot reasignado exitosamente
```

### Caso de falla: backend caido

```
Paciente responde "CANCELO"
  |
  v
inbound-watcher captura mensaje
  |
  v
forwardToBackend() -> HTTP 503 (backend caido)
  |
  v
logger.error(...)   <-- MENSAJE PERDIDO
  |
  v
Paciente cree que cancelo, pero cita sigue activa
  |
  v
No se procesa waitlist
  |
  v
Slot queda ocupado con paciente que no va a venir
  |
  v
NO-SHOW (sin registro porque nadie marca no_show)
```

### Caso de falla: reminders no creados

```
Paciente agenda turno
  |
  v
appointments.create() -> OK (cita en DB)
  |
  v
scheduleReminders() -> ERROR (ej: tabla bloqueada, timeout)
  |
  v
catch -> logger.error()   <-- NO re-throw
  |
  v
return appointment  <-- paciente recibe confirmacion
  |
  v
Worker no encuentra reminders para esta cita
  |
  v
Paciente nunca recibe WhatsApp
  |
  v
Probable NO-SHOW
```

---

## Mapa de archivos del sistema

```
packages/scheduling/src/
  |-- slots.ts              Generacion de slots + overbooking
  |-- noshow-predictor.ts   Prediccion heuristica de no-show
  |-- reminders.ts          CRUD de appointment_reminders
  |-- waitlist.ts           Gestion de lista de espera
  |-- openclaw.ts           Templates de mensajes + envio CLI
  |-- reminder-worker.ts    Ciclo principal del worker
  |-- index.ts              Re-exports publicos
  |
apps/reminder-worker/src/
  |-- index.ts              Entry point del worker (long-running)
  |-- inbound-watcher.ts    Polling de respuestas WhatsApp
  |
apps/web/src/
  |-- lib/patients/usecases/
  |     |-- appointments.usecase.ts   Create/cancel/update citas
  |
  |-- lib/webhooks/
  |     |-- services/openclaw.service.ts   Logica de negocio webhook
  |     |-- repos/openclaw.repo.ts         Queries DB para webhooks
  |
  |-- pages/api/webhooks/
  |     |-- openclaw.ts     Endpoint POST /api/webhooks/openclaw
  |
supabase/
  |-- migrations/
  |     |-- 20260318100000_mediagenda_foundation.sql   Tablas base
  |     |-- 20260413100000_waitlist_offer_sent_tracking.sql  NUEVO
  |
  |-- functions/
        |-- process-reminders/index.ts   Edge function (redundancia)
```

---

## Prioridades de mejora sugeridas

```
 PRI   PROBLEMA                                    ESFUERZO   IMPACTO
 ----- ------------------------------------------ ---------- ---------
 P0    Cron/trigger que marque no_show automatico   2h         CRITICO
       (sin esto, el predictor no tiene datos)
 P0    Persistir inbound messages antes de forward  3h         CRITICO
       (sin esto, se pierden respuestas)
 P1    Transaccion atomica create + reminders       2h         ALTO
 P1    Retry con backoff para reminders fallidos    3h         ALTO
 P2    Config por doctor (reminder timing)          4h         MEDIO
 P2    Rate limiting en webhook openclaw            1h         MEDIO
 P2    Validacion de metadata en predictor          1h         MEDIO
 P3    Alinear blog (24h+1h vs 24h+2h)             0.5h       BAJO
 P3    Cancelacion por doctor via usecase           2h         BAJO
```
