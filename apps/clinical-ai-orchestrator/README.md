# Clinical AI Orchestrator

Microservicio MVP para:

- recibir audio desde WhatsApp,
- validar firma de Twilio,
- transformar el payload a un envelope canonico,
- crear sesiones e items de media,
- ejecutar `media-fetch`, `audio-prep`, `stt-submit` y `stt-finalize`,
- persistir transcripts,
- y encolar el siguiente job interno del pipeline.

## Desarrollo local

```bash
pnpm --filter @autamedica/clinical-ai-orchestrator dev
```

## Variables utiles

```bash
PORT=8890
CORS_ORIGIN=http://localhost:3000
PUBLIC_BASE_URL=https://example.com
TWILIO_AUTH_TOKEN=secret
TWILIO_ACCOUNT_SID=AC...
SKIP_TWILIO_SIGNATURE_VALIDATION=true
INTERNAL_API_KEY=local-dev-key
LOCAL_ARTIFACT_ROOT=.local/clinical-ai-orchestrator
STT_PROVIDER_DEFAULT=mock
GOOGLE_CLOUD_PROJECT_ID=project-id
GOOGLE_CLOUD_LOCATION=global
GOOGLE_CLOUD_STORAGE_BUCKET=bucket-name
GOOGLE_SPEECH_RECOGNIZER=_
GOOGLE_SPEECH_MODEL=long
GOOGLE_SERVICE_ACCOUNT_JSON={"client_email":"...","private_key":"..."}
WHATSAPP_DOCTOR_BINDINGS_JSON=[{"doctorProfileId":"doctor-1","channel":"whatsapp","providerName":"twilio","senderChannelId":"whatsapp:+5491122334455","active":true}]
```
