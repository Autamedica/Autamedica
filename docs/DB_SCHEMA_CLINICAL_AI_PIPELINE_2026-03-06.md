# DB Schema: Clinical AI Pipeline para WhatsApp y Audio Clinico

Fecha: 2026-03-06  
Autor: Codex  
Estado: Diseno de esquema y maquina de estados  
Alcance: Modelo de datos para el pipeline `WhatsApp -> STT -> Gemini -> Validator -> Delivery`

## 1. Objetivo

Definir el esquema de base de datos para el pipeline de audio clinico determinista sin mezclarlo con:

- tablas legacy de videollamada,
- tablas de historia clinica general,
- ni tablas operativas de otros dominios.

El diseno busca:

- trazabilidad total,
- idempotencia,
- seguridad por defecto,
- y soporte para artefactos grandes sin abusar de Postgres.

## 2. Decision de naming

Todas las tablas nuevas del pipeline usaran el prefijo:

- `clinical_ai_*`

Motivo:

- evitar colisiones con `telemedicine_sessions`,
- aislar el dominio,
- facilitar RLS, auditoria y limpieza,
- y dejar clara la frontera entre "consulta clinica" y "pipeline AI".

## 3. Decision de identificadores canonicos

El repo ya muestra una transicion importante:

- `telemedicine_sessions` tiene `doctor_profile_id` y `patient_profile_id`,
- y existe la vista `telemedicine_sessions_canonical`.

Por lo tanto, este pipeline no debe referenciar directamente IDs ambiguos de `auth.users` cuando hablamos de relacion clinica.

Regla recomendada:

- `doctor_profile_id -> public.doctors(id)`
- `patient_profile_id -> public.patients(id)`

Referencias opcionales:

- `appointment_id -> public.appointments(id)`
- `telemedicine_session_id -> public.telemedicine_sessions(id)`

## 4. Principios de schema

### Principio 1

Los blobs grandes no se guardan en Postgres.

Se guardan en object storage:

- audio crudo,
- audio normalizado,
- transcript crudo del proveedor,
- payload bruto del modelo.

Postgres guarda:

- metadata,
- hashes,
- URIs,
- estados,
- referencias,
- y versiones.

### Principio 2

Separar entidades por responsabilidad.

- sesion logica,
- items de media,
- jobs,
- transcripciones,
- transcript normalizado,
- outputs,
- delivery,
- y retencion.

### Principio 3

Los estados deben ser finitos y auditables.

Nada de estados libres tipo texto sin control.

### Principio 4

Todo registro sensible debe tener:

- `created_at`,
- `updated_at`,
- `deleted_at` si aplica,
- `retention_expires_at`,
- `created_by`,
- y `version` cuando exista mutacion significativa.

## 5. Tablas recomendadas

## 5.1 `clinical_ai_sessions`

Representa la sesion logica de procesamiento.

No es una videollamada.  
No es una historia clinica.  
Es el contenedor del pipeline.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `doctor_profile_id` | `uuid` | si | FK a `doctors(id)` |
| `patient_profile_id` | `uuid` | no | FK a `patients(id)` si ya se conoce |
| `appointment_id` | `uuid` | no | FK opcional |
| `telemedicine_session_id` | `uuid` | no | FK opcional |
| `channel` | `text` | si | `whatsapp`, `pwa`, `internal_upload` |
| `channel_thread_ref` | `text` | no | id conversacion o contacto externo |
| `provider_name` | `text` | si | `twilio`, `meta_bsp`, etc. |
| `status` | `text` | si | estado finito |
| `language_code` | `text` | no | ej. `es-AR` |
| `specialty_hint` | `text` | no | clinica, pediatria, etc. |
| `session_opened_at` | `timestamptz` | si | apertura logica |
| `session_sealed_at` | `timestamptz` | no | cuando ya no entran mas audios |
| `processing_started_at` | `timestamptz` | no | inicio de pipeline |
| `delivery_completed_at` | `timestamptz` | no | fin exitoso |
| `retention_expires_at` | `timestamptz` | si | purge operativo |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |
| `deleted_at` | `timestamptz` | no | soft delete |

### Estado recomendado

- `OPEN`
- `WAITING_FOR_MORE_AUDIO`
- `SEALED`
- `PROCESSING`
- `READY_TO_DELIVER`
- `DELIVERED`
- `FAILED`
- `PURGED`

### Reglas

- `SEALED` significa que ya no deben agregarse `media_items`.
- `DELIVERED` no implica historia clinica aprobada; solo entrega al canal.
- `PURGED` indica que artefactos temporales ya fueron eliminados.

## 5.2 `clinical_ai_channel_bindings`

Mapea la identidad del canal externo a un doctor interno.

Sin esta tabla, el webhook no puede abrir sesiones clinicas con seguridad.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `doctor_profile_id` | `uuid` | si | FK a `doctors(id)` |
| `channel` | `text` | si | `whatsapp`, `pwa`, `internal_upload` |
| `provider_name` | `text` | si | `twilio`, `meta_bsp`, etc. |
| `sender_channel_id` | `text` | si | ej. `whatsapp:+549...` |
| `sender_wa_id` | `text` | no | si aplica |
| `display_name` | `text` | no | nombre visible |
| `active` | `boolean` | si | default true |
| `verified_at` | `timestamptz` | no | canal verificado |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Constraint clave

Unique recomendado:

- `(provider_name, channel, sender_channel_id)`

## 5.3 `clinical_ai_media_items`

Representa cada audio individual recibido dentro de una sesion.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK a `clinical_ai_sessions(id)` |
| `provider_message_id` | `text` | si | id externo |
| `provider_media_index` | `int` | si | `0..n` |
| `provider_media_url` | `text` | no | URL temporal del proveedor |
| `content_type` | `text` | si | `audio/ogg`, etc. |
| `size_bytes` | `bigint` | no | peso bruto |
| `duration_seconds` | `int` | no | duracion real |
| `sha256` | `text` | no | dedup |
| `storage_uri_raw` | `text` | no | bucket raw |
| `storage_uri_normalized` | `text` | no | bucket normalized |
| `status` | `text` | si | estado finito |
| `received_at` | `timestamptz` | si | default now |
| `downloaded_at` | `timestamptz` | no | fetch completo |
| `normalized_at` | `timestamptz` | no | audio listo |
| `retention_expires_at` | `timestamptz` | si | purge |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Estado recomendado

- `RECEIVED`
- `FETCHED`
- `NORMALIZED`
- `REJECTED`
- `FAILED`
- `PURGED`

### Constraint clave

Unique recomendado:

- `(provider_message_id, provider_media_index)`

## 5.4 `clinical_ai_jobs`

Representa unidades de trabajo de cada etapa.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `media_item_id` | `uuid` | no | FK si aplica |
| `stage` | `text` | si | etapa finita |
| `status` | `text` | si | estado del job |
| `attempt` | `int` | si | default 1 |
| `idempotency_key` | `text` | si | dedup |
| `queue_name` | `text` | si | nombre de queue |
| `provider_operation_ref` | `text` | no | operation id STT u otro |
| `error_code` | `text` | no | codigo estable |
| `error_message_redacted` | `text` | no | sin PHI |
| `scheduled_at` | `timestamptz` | si | when queued |
| `started_at` | `timestamptz` | no | when run |
| `completed_at` | `timestamptz` | no | when done |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Stage recomendado

- `MEDIA_FETCH`
- `AUDIO_PREP`
- `STT_SUBMIT`
- `STT_FINALIZE`
- `NORMALIZE`
- `REASON`
- `VALIDATE`
- `DELIVER`
- `CLEANUP`

### Status recomendado

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`
- `CANCELLED`

### Constraint clave

Unique recomendado:

- `(session_id, stage, attempt)`

Index importante:

- `(status, queue_name, scheduled_at)`

## 5.5 `clinical_ai_transcripts`

Representa el resultado bruto de STT por sesion o por media item.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `media_item_id` | `uuid` | no | FK si transcript por item |
| `stt_provider` | `text` | si | `google_stt_v2` |
| `language_code` | `text` | si | idioma final |
| `diarization_enabled` | `boolean` | si | flag |
| `multi_channel_enabled` | `boolean` | si | flag |
| `transcript_uri` | `text` | si | raw JSON en storage |
| `transcript_sha256` | `text` | si | integridad |
| `confidence_summary` | `jsonb` | no | resumen, no blob gigante |
| `word_count` | `int` | no | cardinalidad |
| `duration_seconds` | `int` | no | para analytics |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Regla

No guardar el payload completo del STT en `jsonb` dentro de Postgres si el transcript es largo.  
Guardar URI + hash + resumen pequeño.

## 5.6 `clinical_ai_normalized_transcripts`

Representa el transcript ya listo para razonamiento clinico.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `source_transcript_id` | `uuid` | si | FK |
| `normalizer_version` | `text` | si | versionado |
| `segments_json` | `jsonb` | si | estructura ya limpia |
| `clinical_entities_json` | `jsonb` | no | sintomas, medicamentos, etc. |
| `missing_context_json` | `jsonb` | no | alergias, peso, embarazo |
| `transcript_hash` | `text` | si | hash del contenido normalizado |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Regla

Aqui si conviene guardar `jsonb` porque ya es una estructura compacta y estable, no el raw provider blob.

## 5.7 `clinical_ai_outputs`

Representa tanto la salida del modelo como la salida validada.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `normalized_transcript_id` | `uuid` | si | FK |
| `context_snapshot_id` | `uuid` | no | FK opcional |
| `model_name` | `text` | si | ej. `gemini-2.5-pro` |
| `model_version` | `text` | si | version pinneada |
| `prompt_version` | `text` | si | versionado |
| `schema_version` | `text` | si | versionado |
| `temperature` | `numeric(3,2)` | si | normalmente 0 |
| `seed` | `int` | no | best effort |
| `raw_output_uri` | `text` | si | raw model json en storage |
| `validated_output_json` | `jsonb` | si | output pequeno listo |
| `validator_version` | `text` | si | versionado |
| `status` | `text` | si | `VALIDATED`, `REJECTED`, etc. |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Status recomendado

- `GENERATED`
- `VALIDATED`
- `REJECTED`
- `ABSTAINED`

## 5.8 `clinical_ai_context_snapshots`

Representa el contexto clinico estructurado disponible al momento del razonamiento.

No reemplaza historia clinica ni anamnesis.  
Es un snapshot operativo para el pipeline.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `source` | `text` | si | `merged`, `doctor_input`, `patient_record` |
| `context_version` | `text` | si | versionado |
| `structured_context_json` | `jsonb` | si | alergias, meds, peso, embarazo, etc. |
| `missing_critical_context_json` | `jsonb` | no | faltantes detectados |
| `completeness_score` | `smallint` | no | `0..100` |
| `created_at` | `timestamptz` | si | default now |
| `updated_at` | `timestamptz` | si | default now |

### Source recomendado

- `doctor_input`
- `patient_record`
- `merged`

## 5.9 `clinical_ai_delivery_events`

Representa los intentos y resultados de entrega al canal.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `output_id` | `uuid` | si | FK |
| `channel` | `text` | si | `whatsapp` |
| `provider_name` | `text` | si | `twilio`, etc. |
| `provider_message_id` | `text` | no | si retorna |
| `delivery_status` | `text` | si | finito |
| `payload_preview` | `text` | no | preview sin PHI excesiva |
| `attempt` | `int` | si | default 1 |
| `error_code` | `text` | no | estable |
| `sent_at` | `timestamptz` | no | momento envio |
| `delivered_at` | `timestamptz` | no | confirmacion |
| `failed_at` | `timestamptz` | no | fallo |
| `created_at` | `timestamptz` | si | default now |

### Delivery status recomendado

- `PENDING`
- `SENT`
- `DELIVERED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`

## 5.10 `clinical_ai_retention_events`

Tabla pequena para trazabilidad de purge.

### Columnas

| Columna | Tipo | Requerida | Notas |
|---|---|---|---|
| `id` | `uuid` | si | PK |
| `session_id` | `uuid` | si | FK |
| `artifact_type` | `text` | si | raw audio, normalized, transcript, output |
| `artifact_ref` | `text` | si | URI o id |
| `action` | `text` | si | `PURGED`, `SKIPPED`, `RETAINED` |
| `reason` | `text` | no | politica o bloqueo |
| `executed_at` | `timestamptz` | si | default now |

## 6. Campos comunes obligatorios

Todas las tablas mutables deberian heredar este patron:

- `created_at`
- `updated_at`
- trigger `update_updated_at_column()`

Tablas con ciclo de vida sensible deberian agregar:

- `deleted_at`
- `retention_expires_at`

## 7. Relaciones recomendadas

```text
doctors ───────┐
               ├── clinical_ai_channel_bindings
               └── clinical_ai_sessions ─── clinical_ai_media_items
patients ──────┘              │                    │
                              │                    └── clinical_ai_transcripts
                              │
                              ├── clinical_ai_jobs
                              ├── clinical_ai_normalized_transcripts
                              ├── clinical_ai_context_snapshots
                              ├── clinical_ai_outputs
                              ├── clinical_ai_delivery_events
                              └── clinical_ai_retention_events
```

## 8. Maquina de estados

## 8.1 Sesion

```text
OPEN
  -> WAITING_FOR_MORE_AUDIO
  -> SEALED
  -> FAILED

WAITING_FOR_MORE_AUDIO
  -> SEALED
  -> FAILED

SEALED
  -> PROCESSING
  -> FAILED

PROCESSING
  -> READY_TO_DELIVER
  -> FAILED

READY_TO_DELIVER
  -> DELIVERED
  -> FAILED

DELIVERED
  -> PURGED

FAILED
  -> PURGED
```

### Regla

Una sesion no debe pasar a `PROCESSING` si:

- no esta `SEALED`,
- no tiene al menos un `media_item` valido,
- o no tiene `doctor_profile_id`.

## 8.2 Media item

```text
RECEIVED
  -> FETCHED
  -> FAILED

FETCHED
  -> NORMALIZED
  -> REJECTED
  -> FAILED

NORMALIZED
  -> PURGED

REJECTED
  -> PURGED

FAILED
  -> PURGED
```

## 8.3 Output

```text
GENERATED
  -> VALIDATED
  -> REJECTED
  -> ABSTAINED
```

## 8.4 Delivery

```text
PENDING
  -> SENT
  -> FAILED_RETRYABLE
  -> FAILED_FINAL

SENT
  -> DELIVERED
  -> FAILED_RETRYABLE
  -> FAILED_FINAL
```

## 9. Constraints y checks recomendados

## 9.1 Checks de texto finito

Usar `CHECK (...)` o enums controlados para:

- `clinical_ai_sessions.status`
- `clinical_ai_media_items.status`
- `clinical_ai_jobs.stage`
- `clinical_ai_jobs.status`
- `clinical_ai_outputs.status`
- `clinical_ai_delivery_events.delivery_status`

## 9.2 Checks de integridad temporal

- `session_sealed_at >= session_opened_at`
- `processing_started_at >= session_sealed_at`
- `delivery_completed_at >= processing_started_at`
- `duration_seconds >= 0`
- `size_bytes >= 0`

## 9.3 Checks de retencion

- `retention_expires_at >= created_at`

## 10. Indices recomendados

## 10.1 `clinical_ai_sessions`

- `(doctor_profile_id, session_opened_at desc)`
- `(status, updated_at desc)`
- `(channel, provider_name, session_opened_at desc)`
- partial index `WHERE deleted_at IS NULL`

## 10.2 `clinical_ai_media_items`

- `(session_id, received_at)`
- `(provider_message_id, provider_media_index)` unique
- `(status, updated_at desc)`

## 10.3 `clinical_ai_jobs`

- `(queue_name, status, scheduled_at)`
- `(session_id, stage, created_at desc)`
- `(provider_operation_ref)` si se usa para STT polling

## 10.4 `clinical_ai_outputs`

- `(session_id, created_at desc)`
- `(status, created_at desc)`

## 10.5 `clinical_ai_delivery_events`

- `(session_id, created_at desc)`
- `(delivery_status, created_at desc)`

## 11. RLS recomendado

## 11.1 Principio

En v1 este pipeline es doctor-facing.  
No abrir lectura completa a pacientes salvo decision explicita posterior.

## 11.2 Reglas sugeridas

### `clinical_ai_sessions`

- Doctor puede ver sesiones donde `doctor_profile_id = doctor.id` asociado a `auth.uid()`.
- Platform admin puede ver bajo politica separada y auditada.
- Service role puede gestionar todo.

### `clinical_ai_media_items`

- Doctor solo ve items de sus sesiones.
- Nunca exponer `provider_media_url` al cliente.

### `clinical_ai_transcripts`

- Doctor puede ver solo transcript normalizado o evidencia acotada si el producto lo habilita.
- Transcript bruto completo no deberia exponerse por defecto.

### `clinical_ai_outputs`

- Doctor puede ver `validated_output_json` de sus sesiones.
- `raw_output_uri` no se expone al cliente.

### `clinical_ai_jobs` y `clinical_ai_delivery_events`

- Solo backend, service role y admins operativos.

## 12. SQL skeleton recomendado

No es migracion final.  
Es un esqueleto para orientar la implementacion.

```sql
create table if not exists public.clinical_ai_sessions (
  id uuid primary key default uuid_generate_v4(),
  doctor_profile_id uuid not null references public.doctors(id) on delete restrict,
  patient_profile_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  telemedicine_session_id uuid references public.telemedicine_sessions(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'pwa', 'internal_upload')),
  channel_thread_ref text,
  provider_name text not null,
  status text not null check (status in (
    'OPEN', 'WAITING_FOR_MORE_AUDIO', 'SEALED', 'PROCESSING',
    'READY_TO_DELIVER', 'DELIVERED', 'FAILED', 'PURGED'
  )),
  language_code text,
  specialty_hint text,
  session_opened_at timestamptz not null default now(),
  session_sealed_at timestamptz,
  processing_started_at timestamptz,
  delivery_completed_at timestamptz,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

## 13. Reglas de evolucion

### Regla 1

No mutar tablas existentes de telemedicina para meter este pipeline.

### Regla 2

No guardar blobs gigantes en `jsonb`.

### Regla 3

No permitir estados libres fuera del set documentado.

### Regla 4

No usar `auth.users` como FK clinico principal si ya existe un `doctor_profile_id` o `patient_profile_id` canonico.

### Regla 5

El output aprobado por medico que pase a historia clinica debe copiarse o referenciarse desde la capa clinica formal, no vivir indefinidamente como artefacto temporal del pipeline.

## 14. Recomendacion final

La forma mas robusta de arrancar es:

- crear un namespace logico `clinical_ai_*`,
- referenciar `doctors.id` y `patients.id`,
- guardar blobs en storage,
- dejar Postgres para metadata y estados,
- y mantener RLS mas estricta que la del resto del producto.

## 15. Siguiente documento recomendado

Despues de este schema, el siguiente paso natural es uno de estos dos:

1. migracion SQL inicial v1 del pipeline,
2. especificacion del `webhook contract + idempotency + queue payloads`.
