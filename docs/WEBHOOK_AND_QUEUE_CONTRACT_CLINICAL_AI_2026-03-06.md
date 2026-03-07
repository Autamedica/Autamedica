# Webhook y Queue Contract: Clinical AI Pipeline

Fecha: 2026-03-06  
Autor: Codex  
Estado: Contrato tecnico v1  
Alcance: Webhook entrante, idempotencia, sesionizacion y payloads internos del pipeline

## 1. Objetivo

Definir con precision:

- como entra un audio desde WhatsApp,
- como se valida,
- como se transforma en una sesion canonica,
- y que payloads viajan entre workers.

Este documento no define UI.  
Define contratos.

## 2. Principio rector

El proveedor externo no debe contaminar el pipeline interno.

Por eso se separan dos capas:

- `provider payload`
- `canonical inbound envelope`

Twilio es el primer adaptador.  
Meta BSP u otro proveedor futuro deben mapearse al mismo envelope canonico.

## 3. Endpoint externo

Endpoint publico:

`POST /api/v1/whatsapp/webhooks/inbound`

Formato esperado en v1:

- `application/x-www-form-urlencoded`

Proveedor inicial:

- `Twilio WhatsApp`

## 4. Seguridad del webhook

## 4.1 Reglas

- Solo aceptar `POST`.
- Rechazar requests sin firma del proveedor.
- Validar `X-Twilio-Signature` con la URL exacta y los form params recibidos.
- No confiar en `From`, `WaId` ni `MediaUrl0` sin validacion de firma.
- Responder rapido con `200`, nunca hacer STT o Gemini inline.

## 4.2 Headers relevantes

- `X-Twilio-Signature`
- `Content-Type`

## 4.3 Respuestas

| Caso | HTTP | Accion |
|---|---:|---|
| firma valida y payload aceptado | 200 | crear/enviar job |
| firma invalida o ausente | 403 | rechazar |
| metodo invalido | 405 | rechazar |
| payload malformado | 400 | rechazar |
| request duplicado | 200 | no reprocesar |

## 5. Payload provider: Twilio

Twilio envia un formulario con claves como:

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

Si hay mas de un media item:

- `MediaUrl1`
- `MediaContentType1`
- etc.

## 5.1 Ejemplo Twilio inbound

```text
MessageSid=SM1234567890abcdef
AccountSid=AC1234567890abcdef
From=whatsapp:+5491122334455
To=whatsapp:+14155238886
WaId=5491122334455
ProfileName=Dr Carlos
Body=
NumMedia=1
MediaUrl0=https://api.twilio.com/2010-04-01/Accounts/AC.../Messages/MM.../Media/ME...
MediaContentType0=audio/ogg
MessageStatus=received
```

## 5.2 MIME types permitidos

La allowlist debe ser configurable.  
Set inicial recomendado:

- `audio/ogg`
- `audio/ogg; codecs=opus`
- `audio/mpeg`
- `audio/mp4`
- `audio/amr`
- `audio/aac`

Todo lo demas se rechaza o se marca para adaptador futuro.

## 6. Envelope canonico interno

El webhook no entrega el provider payload a los workers.  
Lo transforma a un envelope estable.

## 6.1 Canonical inbound envelope

```json
{
  "provider": "twilio",
  "provider_message_id": "SM1234567890abcdef",
  "provider_account_id": "AC1234567890abcdef",
  "channel": "whatsapp",
  "sender_channel_id": "whatsapp:+5491122334455",
  "sender_wa_id": "5491122334455",
  "sender_profile_name": "Dr Carlos",
  "recipient_channel_id": "whatsapp:+14155238886",
  "message_status": "received",
  "message_text": "",
  "num_media": 1,
  "media_items": [
    {
      "provider_media_index": 0,
      "provider_media_url": "https://api.twilio.com/2010-04-01/Accounts/AC.../Messages/MM.../Media/ME...",
      "content_type": "audio/ogg"
    }
  ],
  "received_at": "2026-03-06T12:00:00Z"
}
```

## 6.2 Reglas del envelope

- `provider_message_id` es obligatorio.
- `channel` es obligatorio.
- `sender_channel_id` es obligatorio.
- `num_media` debe coincidir con la cantidad de items parseados.
- `message_text` puede venir vacio.
- Si el mensaje es solo comando, `media_items` puede ser vacio.

## 7. Sesionizacion

## 7.1 Regla principal

Una `clinical_ai_session` se reutiliza solo si:

- pertenece al mismo doctor,
- mismo `channel`,
- mismo `channel_thread_ref`,
- su estado esta en `OPEN` o `WAITING_FOR_MORE_AUDIO`,
- y no fue `SEALED`.

## 7.2 Algoritmo

### Caso A: llega audio y no hay sesion abierta

- crear `clinical_ai_session`
- crear `clinical_ai_media_item`
- dejar sesion en `WAITING_FOR_MORE_AUDIO`

### Caso B: llega audio y hay sesion abierta

- anexar `clinical_ai_media_item`
- mantener o refrescar `WAITING_FOR_MORE_AUDIO`

### Caso C: llega texto `/finalizar`

- buscar sesion abierta mas reciente del doctor para ese thread
- si existe, mover a `SEALED`
- encolar `STT_SUBMIT` o el siguiente paso necesario
- si no existe, responder mensaje operativo

### Caso D: llega texto `/cancelar`

- marcar sesion abierta como `FAILED`
- programar cleanup

### Caso E: llega texto libre sin media

- no crear pipeline clinico
- responder mensaje operativo

## 7.3 Comandos v1

Comandos soportados:

- `/finalizar`
- `/cancelar`
- `/estado`

No se usa lenguaje natural para control operativo en v1.  
Solo comandos explicitamente soportados.

## 8. Identidad e idempotencia

## 8.1 Mapeo de doctor

El webhook no debe asumir que `WaId` identifica internamente al doctor.

Se requiere una tabla o resolver aparte de onboarding que mapee:

- `channel = whatsapp`
- `provider_name = twilio`
- `sender_channel_id`
- `doctor_profile_id`

Tabla recomendada:

- `clinical_ai_channel_bindings`

Sin ese mapping, no se debe abrir sesion clinica.

## 8.2 Idempotencia inbound

Clave recomendada:

`twilio:{MessageSid}:{media_index}`

Ejemplo:

`twilio:SM1234567890abcdef:0`

## 8.3 Idempotencia por etapa

Claves recomendadas:

- `session:{session_id}:media:{media_item_id}:MEDIA_FETCH:v1`
- `session:{session_id}:media:{media_item_id}:AUDIO_PREP:v1`
- `session:{session_id}:STT_SUBMIT:v1`
- `session:{session_id}:STT_FINALIZE:v1`
- `session:{session_id}:NORMALIZE:v1`
- `session:{session_id}:REASON:v1`
- `session:{session_id}:VALIDATE:v1`
- `session:{session_id}:DELIVER:v1`
- `session:{session_id}:CLEANUP:v1`

## 9. Cola interna

Principio:

- cada task lleva ids y referencias,
- nunca blobs,
- nunca transcript completo,
- nunca audio inline.

## 9.1 `q-media-fetch`

Trigger:

- nuevo `clinical_ai_media_item` en `RECEIVED`

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "media_item_id": "uuid",
  "provider": "twilio",
  "provider_message_id": "SM1234567890abcdef",
  "provider_media_index": 0
}
```

Expected result:

- descarga media
- guarda `storage_uri_raw`
- actualiza `status=FETCHED`

## 9.2 `q-audio-prep`

Trigger:

- `clinical_ai_media_items.status = FETCHED`

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "media_item_id": "uuid",
  "storage_uri_raw": "gs://clinical-ai-raw/session-1/item-1.ogg"
}
```

Expected result:

- valida codec, peso y duracion
- normaliza audio
- guarda `storage_uri_normalized`
- actualiza `status=NORMALIZED`

## 9.3 `q-stt-submit`

Trigger:

- sesion `SEALED`
- todos los media items requeridos en estado `NORMALIZED`

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "doctor_profile_id": "uuid",
  "language_code": "es-AR",
  "media_items": [
    {
      "media_item_id": "uuid",
      "storage_uri_normalized": "gs://clinical-ai-normalized/session-1/item-1.wav"
    }
  ],
  "stt_config": {
    "provider": "google_stt_v2",
    "diarization_enabled": true,
    "multi_channel_enabled": false,
    "phrase_set_key": "general_medicine_es_ar_v1"
  }
}
```

Expected result:

- crea operacion STT
- persiste `provider_operation_ref`
- crea job `STT_FINALIZE`

## 9.4 `q-stt-finalize`

Trigger:

- existe `provider_operation_ref`

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "provider": "google_stt_v2",
  "provider_operation_ref": "operations/123"
}
```

Expected result:

- consulta estado de operacion
- si completa, guarda `clinical_ai_transcripts`
- si no, reprograma

## 9.5 `q-normalize`

Trigger:

- transcript disponible

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "transcript_id": "uuid",
  "normalizer_version": "v1"
}
```

Expected result:

- crea `clinical_ai_normalized_transcripts`
- opcionalmente crea `clinical_ai_context_snapshots`

## 9.6 `q-reason`

Trigger:

- normalized transcript listo

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "normalized_transcript_id": "uuid",
  "context_snapshot_id": "uuid",
  "prompt_version": "v1",
  "schema_name": "clinical_summary_v1",
  "model_name": "gemini-2.5-pro",
  "model_version": "pin_required"
}
```

Expected result:

- llama a Gemini
- guarda `raw_output_uri`
- crea `clinical_ai_outputs` con `status=GENERATED`

## 9.7 `q-validate`

Trigger:

- output generado

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "output_id": "uuid",
  "validator_version": "v1"
}
```

Expected result:

- valida schema
- aplica reglas clinicas
- deja output en `VALIDATED`, `REJECTED` o `ABSTAINED`

## 9.8 `q-deliver`

Trigger:

- output en `VALIDATED` o `ABSTAINED`

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "output_id": "uuid",
  "channel": "whatsapp",
  "provider": "twilio"
}
```

Expected result:

- renderiza mensaje
- envia respuesta por canal
- registra `clinical_ai_delivery_events`
- actualiza sesion a `DELIVERED`

## 9.9 `q-cleanup`

Trigger:

- sesion `DELIVERED`
- sesion `FAILED`
- sesion cancelada

Payload:

```json
{
  "schema_version": "v1",
  "job_id": "uuid",
  "session_id": "uuid",
  "reason": "retention_policy_or_cancel"
}
```

Expected result:

- purge de artefactos temporales
- registro en `clinical_ai_retention_events`
- actualiza sesion a `PURGED` cuando corresponda

## 10. Reglas de respuesta del webhook

## 10.1 Si llega audio valido

- responder `200`
- no enviar resumen clinico inmediato
- opcional: enviar ack operativo corto, por ejemplo:
  - "Audio recibido. Escriba /finalizar cuando termine."

## 10.2 Si llega `/finalizar`

- responder `200`
- opcional: ack operativo
  - "Sesion cerrada. Procesando resumen clinico."

## 10.3 Si falta mapping de doctor

- responder `200`
- no crear sesion
- opcional: enviar mensaje operativo
  - "Numero no habilitado para uso clinico."

## 10.4 Si el audio es invalido

- responder `200`
- crear evento operativo
- opcional: enviar
  - "No pudimos procesar el archivo de audio. Envie otro archivo."

## 11. Retry semantics

## 11.1 Inbound webhook

- nunca reintentar desde backend si el proveedor ya hara retry
- idempotencia obligatoria

## 11.2 Queues

- `MEDIA_FETCH`: retry alto
- `AUDIO_PREP`: retry medio
- `STT_FINALIZE`: polling/retry alto
- `REASON`: retry medio
- `VALIDATE`: retry minimo
- `DELIVER`: retry medio-alto

## 12. Redaction y logging

Nunca loggear:

- transcript completo
- `MediaUrl` completa en texto plano sin necesidad
- contenido del output clinico completo
- nombres de pacientes

Si se loggea referencia externa:

- truncar `MessageSid`
- truncar `MediaUrl`
- usar `session_id` y `job_id` como ids primarios de observabilidad

## 13. Compatibilidad futura

Este contrato ya deja abierta la evolucion a:

- `Meta Cloud API`
- `PWA capture`
- `internal_upload`
- `multi-channel hardware`

porque el pipeline interno no depende de Twilio; depende del `canonical inbound envelope`.

## 14. Recomendacion final

Para v1:

- usar Twilio solo como adapter de entrada/salida,
- mapear todo a un envelope canonico,
- usar comandos operativos explicitos,
- no permitir lenguaje natural para control del pipeline,
- y mantener idempotencia estricta por `MessageSid` y por etapa.

## 15. Fuentes oficiales

- Twilio WhatsApp media tutorial: https://www.twilio.com/docs/whatsapp/tutorial/send-and-receive-media-messages-whatsapp-nodejs
- Twilio request validation: https://www.twilio.com/docs/usage/security#validating-requests
- Twilio webhook request to your incoming phone number: https://www.twilio.com/docs/messaging/guides/webhook-request
- Twilio HIPAA: https://www.twilio.com/en-us/hipaa
- Cloud Tasks HTTP target tasks: https://cloud.google.com/tasks/docs/creating-http-target-tasks
- Cloud Tasks quotas: https://cloud.google.com/tasks/docs/quotas
