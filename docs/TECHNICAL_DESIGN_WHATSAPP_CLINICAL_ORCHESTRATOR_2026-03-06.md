# Technical Design: Orquestador Determinista para Audio Clinico via WhatsApp

Fecha: 2026-03-06  
Autor: Codex  
Etapa: Diseno tecnico, sin implementacion  
Estado: Propuesta senior para MVP y evolucion a produccion

## 1. Objetivo

Definir la arquitectura tecnica de un sistema que:

- recibe audio clinico desde WhatsApp,
- lo procesa de forma asincronica,
- extrae hallazgos clinicos de alto valor,
- y responde al medico con una salida corta y estructurada.

Salida objetivo:

- examenes complementarios: maximo 3,
- diagnosticos presuntivos con probabilidades: maximo 3,
- farmacos de eleccion con dosis: maximo 3.

## 2. Decisiones rectoras

### Decision 1

El flujo critico no usara un agente libre.

Patron aprobado:

`WhatsApp -> backend determinista -> STT -> normalizacion -> Gemini -> validacion -> delivery`

Patron descartado:

`WhatsApp -> agente libre -> respuesta clinica`

### Decision 2

`OpenClaw` puede existir, pero fuera del camino clinico critico.

Usos permitidos de OpenClaw:

- automatizacion operativa,
- observabilidad,
- seguimiento interno,
- control de calidad documental,
- agentes no clinicos.

Usos prohibidos en v1:

- decidir libremente el pipeline clinico,
- improvisar prompts,
- seleccionar herramientas en caliente para diagnostico,
- responder directamente con contenido clinico sin pasar por el validador.

### Decision 3

El pipeline de PHI se aísla en GCP, aunque el producto general hoy viva entre Cloudflare y Supabase.

Motivo:

- `Speech-to-Text v2`,
- `Vertex AI Gemini`,
- `Cloud Tasks`,
- `Cloud Run`,
- `Cloud Storage`,
- y controles empresariales utiles para cargas sensibles.

### Decision 4

El MVP puede usar WhatsApp como canal de entrega, pero no debe asumir que una sola nota de voz siempre alcanzara para sesiones de 60 a 80 minutos.

Esto depende de:

- codec,
- compresion,
- dispositivo,
- silencio,
- y limites del proveedor de canal.

Hallazgo operativo relevante:

- En la documentacion actual de Twilio para WhatsApp, una pieza de media por mensaje tiene un maximo de `16 MB`.

## 3. Arquitectura de alto nivel

## 3.1 Componentes

| Componente | Responsabilidad |
|---|---|
| `whatsapp-webhook-service` | Recibir mensajes entrantes, validar firma, crear sesion y encolar job |
| `media-fetcher-worker` | Descargar media del proveedor y persistir referencia canonica |
| `audio-prep-worker` | Normalizar audio, validar duracion, formato y calidad minima |
| `stt-submit-worker` | Enviar audio a Cloud STT v2 |
| `stt-finalize-worker` | Polling/recepcion de resultado STT y persistencia de transcript |
| `clinical-normalizer-worker` | Convertir transcript a estructura clinica estable |
| `llm-reasoning-worker` | Llamar a Gemini 2.5 Pro con schema estricto |
| `output-validator-worker` | Aplicar reglas clinicas y de seguridad |
| `whatsapp-delivery-worker` | Convertir salida a mensaje legible y enviarlo |
| `cleanup-worker` | Borrado seguro de artefactos temporales |
| `metadata-db` | Persistir estados, jobs, outputs, referencias y auditoria |
| `artifact-storage` | Audio crudo, audio normalizado, transcript y evidencia |

## 3.2 Servicios recomendados

| Capa | Servicio recomendado |
|---|---|
| Ingreso HTTP | Cloud Run |
| Cola de jobs | Cloud Tasks |
| Audio/transcripts | Cloud Storage |
| STT | Cloud Speech-to-Text v2 |
| Razonamiento | Vertex AI Gemini 2.5 Pro |
| Secretos | Secret Manager |
| Claves | Cloud KMS |
| Scheduler/cleanup | Cloud Scheduler + Cloud Run |
| Persistencia transaccional | Supabase Postgres o Cloud SQL PostgreSQL |

## 3.3 Integracion con el stack actual

Propuesta:

- Mantener `Cloudflare Pages` y `Supabase` para apps y portales existentes.
- Agregar un `Clinical AI Pipeline` aislado en GCP.
- Persistir metadata de negocio en la base actual si se quiere continuidad funcional.
- Mantener audio, transcript y artefactos temporales fuera de Cloudflare.

Inferencia de arquitectura:

> Para este caso, mezclar PHI de audio largo con una plataforma edge generalista es peor que separar dominios de procesamiento.

## 4. Contexto de sistema

```text
Doctor WhatsApp
    |
    v
Proveedor WhatsApp (Twilio o Meta BSP)
    |
    v
POST /webhooks/whatsapp/inbound
    |
    v
consultation_sessions + consultation_jobs
    |
    v
Cloud Tasks queues
    |
    +--> media-fetcher-worker
    +--> audio-prep-worker
    +--> stt-submit-worker
    +--> stt-finalize-worker
    +--> clinical-normalizer-worker
    +--> llm-reasoning-worker
    +--> output-validator-worker
    +--> whatsapp-delivery-worker
    +--> cleanup-worker
```

## 5. Flujo funcional

## 5.1 Flujo base

1. El medico envia una nota de voz o audio por WhatsApp.
2. El proveedor de canal invoca el webhook.
3. El sistema valida autenticidad e idempotencia.
4. Se crea una `consultation_session`.
5. Se crea un `consultation_job` en estado `RECEIVED`.
6. Se descarga la media.
7. Se normaliza el audio.
8. Se ejecuta STT.
9. Se normaliza el transcript a estructura clinica.
10. Gemini genera una salida JSON estricta.
11. El validador aplica reglas y puede recortar o rechazar.
12. Se envia la respuesta por WhatsApp.
13. Se programa limpieza de artefactos temporales.

## 5.2 Flujo con audio fragmentado

Si el audio llega en varias notas:

1. Todas las notas con la misma sesion se vinculan al mismo `consultation_session_id`.
2. Cada audio crea un `consultation_media_item`.
3. El sistema concatena logicamente por orden de recepcion o timestamps.
4. El medico puede cerrar la sesion con un comando como `/finalizar`.
5. Solo entonces se dispara el razonamiento final.

### Recomendacion de MVP

Soportar desde el inicio ambos modos:

- `single audio`,
- `multi-audio session`.

Esto baja el riesgo de que el MVP quede bloqueado por limites de peso o UX del canal.

## 6. Contratos de API

## 6.1 Webhook entrante

Endpoint:

`POST /api/v1/whatsapp/webhooks/inbound`

Responsabilidades:

- validar firma del proveedor,
- validar idempotencia,
- aceptar solo media soportada,
- responder rapido con `200`,
- y nunca procesar el audio en el request principal.

Motivo tecnico:

- `Cloud Run` admite hasta `60 minutos` de request timeout, pero el webhook no debe depender de procesamiento extenso ni de llamadas inestables a STT/LLM.

### Payload esperado si se usa Twilio

Twilio envia `application/x-www-form-urlencoded`. Campos utiles:

- `MessageSid`
- `AccountSid`
- `From`
- `To`
- `WaId`
- `ProfileName`
- `Body`
- `NumMedia`
- `MediaUrl0`
- `MediaContentType0`
- `MessageStatus`

### Reglas de ingest

- `NumMedia` debe ser `>= 1`.
- `MediaContentType0` debe pertenecer a lista permitida.
- Si `NumMedia > 1`, registrar todos pero procesar solo el primero en v1, o rechazar explicitamente.
- Si llega solo texto y es `/finalizar`, cerrar sesion abierta.
- Si llega texto libre sin media, responder con mensaje operativo, no clinico.

### Respuesta del webhook

El webhook responde siempre rapido:

- `200 OK`
- body vacio o mensaje tecnico minimo

No debe esperar:

- descarga de media,
- STT,
- Gemini,
- ni delivery final.

## 6.2 Endpoint interno de media fetch

`POST /internal/jobs/media-fetch`

Body:

```json
{
  "job_id": "uuid",
  "session_id": "uuid",
  "message_sid": "SMxxxxxxxx",
  "media_index": 0,
  "provider": "twilio"
}
```

## 6.3 Endpoint interno de STT submit

`POST /internal/jobs/stt-submit`

Body:

```json
{
  "job_id": "uuid",
  "session_id": "uuid",
  "artifact_id": "uuid",
  "gcs_uri": "gs://bucket/path/file.ogg"
}
```

## 6.4 Endpoint interno de reasoning

`POST /internal/jobs/reasoning`

Body:

```json
{
  "job_id": "uuid",
  "session_id": "uuid",
  "normalized_transcript_id": "uuid",
  "clinical_context_id": "uuid",
  "schema_version": "v1",
  "prompt_version": "v1"
}
```

## 6.5 Endpoint interno de delivery

`POST /internal/jobs/delivery`

Body:

```json
{
  "job_id": "uuid",
  "session_id": "uuid",
  "output_id": "uuid",
  "delivery_channel": "whatsapp"
}
```

## 7. Modelo de datos recomendado

## 7.1 Tablas principales

### `consultation_sessions`

Representa una sesion logica por medico, paciente y canal.

Campos minimos:

- `id`
- `doctor_user_id`
- `patient_external_ref`
- `channel`
- `channel_thread_ref`
- `status`
- `opened_at`
- `closed_at`
- `created_at`
- `updated_at`

### `consultation_media_items`

Representa cada audio recibido.

Campos minimos:

- `id`
- `session_id`
- `provider_message_id`
- `provider_media_url`
- `provider_content_type`
- `received_at`
- `size_bytes`
- `duration_seconds`
- `storage_uri_raw`
- `storage_uri_normalized`
- `status`

### `consultation_jobs`

Estado del pipeline.

Campos minimos:

- `id`
- `session_id`
- `stage`
- `status`
- `attempt`
- `error_code`
- `error_detail_redacted`
- `scheduled_at`
- `started_at`
- `completed_at`

### `consultation_transcripts`

Transcript bruto o semiestructurado.

Campos minimos:

- `id`
- `session_id`
- `source_media_item_id`
- `stt_provider`
- `language_code`
- `diarization_enabled`
- `multi_channel_enabled`
- `raw_transcript_json`
- `confidence_summary`

### `consultation_normalized_transcripts`

Transcript ya listo para downstream clinico.

Campos minimos:

- `id`
- `session_id`
- `normalizer_version`
- `segments_json`
- `clinical_entities_json`
- `discarded_noise_json`
- `transcript_hash`

### `consultation_outputs`

Salida estructurada final.

Campos minimos:

- `id`
- `session_id`
- `model_name`
- `model_version`
- `prompt_version`
- `schema_version`
- `temperature`
- `seed`
- `raw_model_output_json`
- `validated_output_json`
- `validator_version`
- `status`

### `consultation_delivery_events`

Historial de respuesta al canal.

Campos minimos:

- `id`
- `session_id`
- `output_id`
- `channel`
- `provider_message_id`
- `status`
- `sent_at`
- `delivered_at`
- `failed_at`

## 7.2 Estados de sesion

Valores recomendados:

- `OPEN`
- `WAITING_FOR_MORE_AUDIO`
- `PROCESSING`
- `READY_TO_REVIEW`
- `DELIVERED`
- `FAILED`
- `CLOSED`

## 7.3 Estados de job

Valores recomendados:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`
- `CANCELLED`

## 8. Diseno de colas

## 8.1 Queues recomendadas

| Queue | Worker | Observacion |
|---|---|---|
| `q-whatsapp-ingest` | webhook service | solo create session y dispatch |
| `q-media-fetch` | media-fetcher-worker | descarga desde proveedor |
| `q-audio-prep` | audio-prep-worker | ffmpeg y validaciones |
| `q-stt-submit` | stt-submit-worker | crea operacion batch |
| `q-stt-finalize` | stt-finalize-worker | polling o callback |
| `q-normalize` | clinical-normalizer-worker | transcript a estructura clinica |
| `q-reasoning` | llm-reasoning-worker | llamada a Vertex |
| `q-validate` | output-validator-worker | recorte, rechazo y seguridad |
| `q-delivery` | whatsapp-delivery-worker | respuesta final |
| `q-cleanup` | cleanup-worker | purge de temporales |

## 8.2 Principios de cola

- Cada task solo lleva referencias, nunca blobs.
- `Cloud Tasks` tiene limite de `1 MiB` por task; usar IDs y URIs, no contenido grande.
- Todos los handlers deben ser idempotentes.
- Cada queue define su propio `retry policy`.
- El sistema debe soportar re-ejecucion desde cualquier etapa.

## 8.3 Reintentos sugeridos

| Etapa | Reintentos | Tipo de error esperado |
|---|---:|---|
| media fetch | 5 | red, timeouts, proveedor |
| audio prep | 3 | corrupcion, codec raro |
| stt submit | 5 | quota, timeouts, API |
| stt finalize | 20 | latencia normal de operacion |
| reasoning | 4 | quota, transient, timeout |
| validation | 1 | no deberia fallar salvo bug |
| delivery | 8 | ventana de canal, errores provider |

## 9. Preparacion de audio

## 9.1 Formato canonico

Normalizar a un formato estable antes de STT:

- `wav` o `flac` cuando se prioriza calidad,
- sample rate estable,
- canales explicitados,
- metadatos limpios.

## 9.2 Validaciones

- audio decodificable,
- duracion conocida,
- peso razonable,
- sin silencio absoluto prolongado,
- sin corrupcion de archivo,
- y con SNR minimo configurable.

## 9.3 Politica frente a audio malo

Si el audio no cumple un umbral minimo:

- no ejecutar Gemini,
- marcar `FAILED_FINAL`,
- enviar un mensaje operativo no clinico:
  - "No pudimos procesar el audio con calidad suficiente. Envie un nuevo audio o cierre la sesion."

## 10. Speech-to-Text

## 10.1 Estrategia

Usar `Cloud Speech-to-Text v2`.

Preferencias:

- `batch recognize` para audios largos,
- diarizacion cuando haya una sola pista,
- `multi-channel recognition` cuando el hardware lo permita,
- adaptation con `PhraseSet`,
- salida con timestamps.

## 10.2 Vocabulario medico

Definir `PhraseSet` por:

- especialidad,
- lista de farmacos,
- nombres de estudios,
- siglas clinicas,
- nombres comerciales frecuentes,
- y terminos locales de Argentina/LatAm.

## 10.3 Resultado minimo esperado del STT

- texto completo,
- timestamps,
- speaker tags o channel tags,
- confidence global y por segmento,
- idioma detectado o configurado.

## 11. Normalizacion clinica

El transcript bruto no se entrega directo a Gemini.

Debe pasar por una capa que produzca:

- segmentos ordenados,
- hablante inferido,
- timestamps limpios,
- remocion de ruido conversacional,
- entidades clinicas iniciales,
- y contexto resumido.

## 11.1 Estructura de segmento

```json
{
  "speaker": "patient",
  "start_sec": 120.4,
  "end_sec": 128.9,
  "text": "me duele el pecho desde hace dos dias",
  "confidence": 0.93,
  "channel_tag": 1
}
```

## 11.2 Salida del normalizador

```json
{
  "specialty_hint": "clinica_medica",
  "segments": [],
  "possible_symptoms": [],
  "possible_drugs_mentioned": [],
  "noise_segments": [],
  "missing_critical_context": [
    "alergias",
    "embarazo"
  ]
}
```

## 12. Razonamiento con Gemini

## 12.1 Modelo

Modelo recomendado:

- `gemini-2.5-pro`

Motivo:

- audio y texto largo,
- structured output,
- razonamiento fuerte,
- GA,
- y controles empresariales en Vertex AI.

## 12.2 Parametros recomendados

```json
{
  "model": "gemini-2.5-pro",
  "temperature": 0,
  "candidateCount": 1,
  "topP": 0.95,
  "seed": 7,
  "responseMimeType": "application/json",
  "maxOutputTokens": 2500
}
```

### Nota importante

`temperature=0` y `seed` fijo mejoran repetibilidad, pero no garantizan identidad perfecta.  
La repetibilidad real se logra a nivel de sistema, no solo de sampling.

## 12.3 Thinking

Para esta ruta conviene controlar thinking de forma conservadora.

Principio:

- si el objetivo es extraccion y ranking estable, limitar thinking;
- si el objetivo fuera razonamiento diagnostico mas abierto, aumentar thinking con mas riesgo de variacion.

Recomendacion operativa:

- comenzar con budget bajo y versionado,
- medir latencia,
- no permitir cambios dinamicos de thinking desde UI.

## 12.4 Prompting

El prompt del sistema debe:

- prohibir lenguaje conversacional,
- prohibir explicaciones largas,
- prohibir inventar,
- ordenar por mayor evidencia,
- devolver menos items si la evidencia no alcanza,
- y abstenerse cuando falten condiciones de seguridad.

## 13. JSON Schema recomendado

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "estado",
    "diagnosticos_presuntivos",
    "farmacos_eleccion",
    "examenes_complementarios",
    "alertas"
  ],
  "properties": {
    "estado": {
      "type": "string",
      "enum": [
        "sugerencia_para_revision_medica",
        "informacion_insuficiente"
      ]
    },
    "diagnosticos_presuntivos": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["nombre", "probabilidad", "evidencia"],
        "properties": {
          "nombre": { "type": "string" },
          "probabilidad": { "type": "integer", "minimum": 0, "maximum": 100 },
          "evidencia": {
            "type": "array",
            "maxItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["speaker", "timestamp_inicio_seg", "timestamp_fin_seg", "texto"],
              "properties": {
                "speaker": {
                  "type": "string",
                  "enum": ["doctor", "patient", "unknown"]
                },
                "timestamp_inicio_seg": { "type": "number" },
                "timestamp_fin_seg": { "type": "number" },
                "texto": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "farmacos_eleccion": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["nombre", "dosis", "condiciones_seguridad", "evidencia"],
        "properties": {
          "nombre": { "type": "string" },
          "dosis": { "type": "string" },
          "condiciones_seguridad": {
            "type": "array",
            "maxItems": 5,
            "items": { "type": "string" }
          },
          "evidencia": {
            "type": "array",
            "maxItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["speaker", "timestamp_inicio_seg", "timestamp_fin_seg", "texto"],
              "properties": {
                "speaker": {
                  "type": "string",
                  "enum": ["doctor", "patient", "unknown"]
                },
                "timestamp_inicio_seg": { "type": "number" },
                "timestamp_fin_seg": { "type": "number" },
                "texto": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "examenes_complementarios": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["nombre", "motivo", "evidencia"],
        "properties": {
          "nombre": { "type": "string" },
          "motivo": { "type": "string" },
          "evidencia": {
            "type": "array",
            "maxItems": 3,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["speaker", "timestamp_inicio_seg", "timestamp_fin_seg", "texto"],
              "properties": {
                "speaker": {
                  "type": "string",
                  "enum": ["doctor", "patient", "unknown"]
                },
                "timestamp_inicio_seg": { "type": "number" },
                "timestamp_fin_seg": { "type": "number" },
                "texto": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "alertas": {
      "type": "array",
      "maxItems": 5,
      "items": { "type": "string" }
    }
  }
}
```

## 14. Matriz del validador

El `output-validator-worker` es el guardian clinico del sistema.

## 14.1 Reglas estructurales

- Si una seccion tiene mas de 3 items, truncar a 3 y registrar alerta.
- Si falta un campo requerido, rechazar salida.
- Si `additionalProperties` aparece, rechazar salida.
- Si `probabilidad` no esta entre 0 y 100, rechazar salida.
- Si timestamps son invalidos, rechazar evidencia puntual y mantener item solo si queda evidencia suficiente.

## 14.2 Reglas clinicas minimas

| Regla | Accion |
|---|---|
| Faltan alergias y el farmaco propuesto las requiere | remover farmaco y agregar alerta |
| Falta peso y la dosis depende de peso | remover farmaco y agregar alerta |
| Embarazo desconocido y existe riesgo potencial | remover farmaco y agregar alerta |
| Transcript con confianza global baja | degradar a `informacion_insuficiente` |
| No hay evidencia citada | remover item |
| Evidencia solo del medico, sin datos del paciente, para un diagnostico sintomatico | bajar prioridad o remover |
| Se detecta termino de urgencia mayor | agregar alerta de derivacion/urgencia |

## 14.3 Reglas de abstencion

El sistema debe abstenerse cuando:

- el audio es insuficiente,
- el transcript es pobre,
- faltan datos criticos,
- la evidencia es contradictoria,
- o la recomendacion farmacologica seria insegura.

Salida esperada en ese caso:

```json
{
  "estado": "informacion_insuficiente",
  "diagnosticos_presuntivos": [],
  "farmacos_eleccion": [],
  "examenes_complementarios": [],
  "alertas": [
    "No hay evidencia suficiente para generar sugerencias clinicas seguras."
  ]
}
```

## 15. Mensaje final de WhatsApp

El delivery no debe pegar el JSON crudo.

Formato sugerido:

```text
Resumen Clinico AutaMedica

Diagnosticos presuntivos
1. ...
2. ...
3. ...

Examenes complementarios
1. ...
2. ...
3. ...

Farmacos de eleccion
1. ...
2. ...
3. ...

Alertas
- ...

Sugerencia para revision medica. No reemplaza criterio profesional.
```

## 16. Idempotencia y consistencia

## 16.1 Inbound idempotency

Usar una clave compuesta:

- `provider`
- `provider_message_id`
- `media_index`

Si ya existe, no recrear job.

## 16.2 Worker idempotency

Cada worker debe:

- verificar estado previo,
- no duplicar artefactos,
- poder reentrar,
- y registrar `attempt`.

## 16.3 Exactly-once no es requisito

El sistema debe diseñarse para:

- `at-least-once delivery`,
- handlers idempotentes,
- y consistencia por estados.

## 17. Seguridad

## 17.1 Principios

- minimo privilegio,
- separacion de duties,
- cifrado en transito,
- cifrado en reposo,
- y logs sin PHI innecesaria.

## 17.2 Controles minimos

- verificar firma del webhook,
- usar OIDC entre Cloud Tasks y Cloud Run,
- usar Secret Manager para credenciales,
- usar buckets separados por tipo de artefacto,
- cifrado con CMEK si el programa lo exige,
- IAM separado por servicio,
- y redaccion de logs.

## 17.3 PHI

No registrar en logs:

- transcript completo,
- nombre del paciente,
- contenido del audio,
- ni salidas clinicas completas.

Logs permitidos:

- `job_id`,
- `session_id`,
- etapa,
- latencia,
- codigos de error,
- tamanos,
- duracion.

## 17.4 Compliance

Google Cloud documenta soporte para HIPAA bajo BAA y lista como cubiertos, entre otros:

- Cloud Run,
- Cloud Tasks,
- Cloud Storage,
- Speech-to-Text,
- Generative AI on Vertex AI,
- Pub/Sub,
- Cloud Healthcare API.

Twilio ofrece BAAs y productos elegibles HIPAA, pero la elegibilidad exacta del canal y del flujo de WhatsApp debe verificarse contractualmente antes de mover PHI real.

## 18. Politica de retencion

## 18.1 Principio

No todo lo que entra debe vivir para siempre.

Separar:

- artefactos temporales de pipeline,
- evidencia operativa,
- y registro clinico aprobado.

## 18.2 Politica propuesta

| Artefacto | Retencion propuesta | Nota |
|---|---|---|
| Audio crudo temporal | 7 dias | borrar antes si falla o se cancela |
| Audio normalizado | 7 dias | mismo tratamiento que raw |
| Transcript bruto | 7 a 30 dias | para debugging controlado |
| Transcript normalizado | 30 dias max como artefacto temporal | si no se incorpora a HC |
| Output validado no aprobado | 30 dias | luego purge |
| Output aprobado por medico | segun politica de historia clinica | ya no es temporal |
| Logs tecnicos sin PHI | 30 a 90 dias | segun observabilidad |

## 18.3 Regla importante

Si el medico aprueba e incorpora el resultado a una historia clinica, ese artefacto deja de ser temporal y pasa a las reglas de retencion del registro clinico formal aplicable al producto y a la jurisdiccion.

## 19. Observabilidad

Metricas minimas:

- tiempo desde inbound hasta delivery,
- tiempo por etapa,
- tasa de audio invalido,
- tasa de fallo STT,
- tasa de rechazo del validador,
- tasa de abstencion,
- tasa de reintentos,
- y tiempo promedio por duracion de audio.

Alertas minimas:

- backlog de colas,
- latencia excesiva en STT,
- ratio anomalo de `informacion_insuficiente`,
- fallos de delivery,
- y expiracion de credenciales.

## 20. Roadmap tecnico

## Fase A: MVP controlado

- un solo idioma,
- una especialidad,
- audio individual o multi-audio session,
- delivery por WhatsApp,
- sin UI rica,
- medico identificado previamente.

## Fase B: Robustez

- mejor diarizacion,
- phrase sets por especialidad,
- tabla de reglas farmacologicas,
- UI de evidencia,
- aprobacion explicita del medico,
- trazabilidad mejorada.

## Fase C: Producto enterprise

- PWA de captura dedicada,
- subida por chunks,
- integracion con historia clinica,
- FHIR,
- auditoria avanzada,
- analitica clinica.

## 21. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| audio demasiado pesado o largo para WhatsApp | alto | soportar sesion multi-audio y ruta PWA |
| diarizacion deficiente | alto | dual-channel cuando sea posible; normalizador conservador |
| dosis inseguras | critico | reglas de abstencion y contexto clinico minimo |
| salida variable del LLM | medio | schema fijo, seed, version pin, validador |
| timeouts | medio | pipeline asincronico con Tasks |
| fuga de PHI por logs | critico | redaction estricta e IAM |
| lock-in de canal | medio | abstraer provider adapter |

## 22. Decision recomendada

Para el MVP senior:

- usar `Twilio o BSP equivalente` solo como adaptador de canal,
- recibir el audio por webhook,
- procesarlo en `Cloud Run + Cloud Tasks`,
- almacenar artefactos temporales en `Cloud Storage`,
- transcribir con `Cloud Speech-to-Text v2`,
- razonar con `Gemini 2.5 Pro`,
- validar con reglas propias,
- y responder por WhatsApp con una salida corta.

Si el limite operativo del canal hace inviable sesiones largas de forma consistente, la captura debe migrar a `PWA/mini-app` y mantener WhatsApp solo como canal de entrega y notificación.

## 23. Preguntas abiertas

1. El primer mercado sera Argentina, Brasil o ambos.
2. El primer idioma sera `es-AR`, `pt-BR` o multi-idioma.
3. La primera especialidad sera clinica medica, pediatria, salud mental u otra.
4. Se permitira sugerencia de farmacos desde v1 o se liberara despues.
5. El medico podra aprobar y guardar el resumen como parte de historia clinica.
6. El flujo inicial sera solo WhatsApp o WhatsApp + PWA de captura.

## 24. Fuentes oficiales

- Gemini 2.5 Pro en Vertex AI: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro
- Vertex AI structured output: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
- Vertex AI content generation parameters: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/content-generation-parameters
- Vertex AI thinking: https://cloud.google.com/vertex-ai/generative-ai/docs/thinking
- Speech-to-Text v2 batch recognize: https://cloud.google.com/speech-to-text/v2/docs/batch-recognize
- Speech-to-Text v2 multi-channel: https://cloud.google.com/speech-to-text/v2/docs/multi-channel
- Speech-to-Text v2 quotas: https://cloud.google.com/speech-to-text/v2/quotas
- Cloud Tasks HTTP target tasks: https://cloud.google.com/tasks/docs/creating-http-target-tasks
- Cloud Tasks quotas: https://cloud.google.com/tasks/docs/quotas
- Cloud Run request timeout: https://docs.cloud.google.com/run/docs/configuring/request-timeout
- HIPAA on Google Cloud: https://cloud.google.com/security/compliance/hipaa
- Cloud Healthcare API FHIR stores: https://cloud.google.com/healthcare-api/docs/how-tos/fhir
- Twilio WhatsApp media tutorial: https://www.twilio.com/docs/whatsapp/tutorial/send-and-receive-media-messages-whatsapp-nodejs
- Twilio HIPAA: https://www.twilio.com/en-us/hipaa
- OpenClaw multi-agent routing: https://docs.openclaw.ai/multi-agent
- OpenClaw sandboxing: https://docs.openclaw.ai/sandboxing
