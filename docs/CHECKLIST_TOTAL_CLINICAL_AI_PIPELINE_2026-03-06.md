# Checklist Total: Clinical AI Pipeline

Fecha: 2026-03-06  
Estado: Master checklist  
Objetivo: Tener una hoja unica de control para el proyecto `WhatsApp/PWA -> STT -> Gemini -> Validator -> Delivery`

## 1. Definicion de producto

- [x] Definir que el producto es un `copiloto invisible`.
- [x] Definir que la salida debe ser corta y estructurada.
- [x] Definir maximo `3` diagnosticos presuntivos.
- [x] Definir maximo `3` examenes complementarios.
- [x] Definir maximo `3` farmacos de eleccion con dosis.
- [x] Definir que la IA responde solo al final de la escucha.
- [x] Definir que no se usara un agente libre en el flujo clinico critico.
- [ ] Confirmar especialidad inicial del MVP.
- [ ] Confirmar idioma inicial del MVP.
- [ ] Confirmar mercado inicial: Argentina, Brasil o ambos.
- [ ] Confirmar si farmacos con dosis salen en v1 o en v1.1.

## 2. Investigacion y arquitectura

- [x] Documentar factibilidad de audio largo con Gemini.
- [x] Documentar limites y tradeoffs de Gemini, STT y WhatsApp.
- [x] Documentar por que `OpenClaw` no es el nucleo clinico.
- [x] Definir arquitectura hibrida recomendada.
- [x] Definir arquitectura determinista basada en workers y jobs.
- [x] Definir la separacion `canal externo -> pipeline interno`.
- [x] Definir que GCP es la mejor zona para el pipeline de PHI.
- [ ] Confirmar si el canal inicial sera `solo WhatsApp` o `WhatsApp + PWA`.

Documento fuente:

- [INVESTIGACION_IA_CLINICA_LONG_AUDIO_DETERMINISTA_2026-03-06.md](/home/edu/Autamedica/docs/INVESTIGACION_IA_CLINICA_LONG_AUDIO_DETERMINISTA_2026-03-06.md)
- [TECHNICAL_DESIGN_WHATSAPP_CLINICAL_ORCHESTRATOR_2026-03-06.md](/home/edu/Autamedica/docs/TECHNICAL_DESIGN_WHATSAPP_CLINICAL_ORCHESTRATOR_2026-03-06.md)

## 3. Modelo de datos

- [x] Definir namespace nuevo `clinical_ai_*`.
- [x] Definir uso de `doctors.id` y `patients.id` como IDs canonicos.
- [x] Definir `clinical_ai_sessions`.
- [x] Definir `clinical_ai_channel_bindings`.
- [x] Definir `clinical_ai_media_items`.
- [x] Definir `clinical_ai_jobs`.
- [x] Definir `clinical_ai_transcripts`.
- [x] Definir `clinical_ai_normalized_transcripts`.
- [x] Definir `clinical_ai_context_snapshots`.
- [x] Definir `clinical_ai_outputs`.
- [x] Definir `clinical_ai_delivery_events`.
- [x] Definir `clinical_ai_retention_events`.
- [x] Definir maquina de estados de sesion.
- [x] Definir maquina de estados de media item.
- [x] Definir maquina de estados de output.
- [x] Definir indices base.
- [x] Definir RLS inicial.
- [ ] Aplicar migracion sobre base local o linked.
- [ ] Verificar migracion en entorno real sin conflictos.
- [ ] Regenerar tipos TypeScript una vez aplicada la migracion.

Documento fuente:

- [DB_SCHEMA_CLINICAL_AI_PIPELINE_2026-03-06.md](/home/edu/Autamedica/docs/DB_SCHEMA_CLINICAL_AI_PIPELINE_2026-03-06.md)
- [20260306173000_create_clinical_ai_pipeline_core.sql](/home/edu/Autamedica/supabase/migrations/20260306173000_create_clinical_ai_pipeline_core.sql)

## 4. Contratos del sistema

- [x] Definir endpoint externo del webhook.
- [x] Definir seguridad por firma del proveedor.
- [x] Definir payload Twilio inbound.
- [x] Definir `canonical inbound envelope`.
- [x] Definir sesionizacion.
- [x] Definir comandos operativos `/finalizar`, `/cancelar`, `/estado`.
- [x] Definir idempotencia inbound.
- [x] Definir idempotencia por etapa.
- [x] Definir payload de `q-media-fetch`.
- [x] Definir payload de `q-audio-prep`.
- [x] Definir payload de `q-stt-submit`.
- [x] Definir payload de `q-stt-finalize`.
- [x] Definir payload de `q-normalize`.
- [x] Definir payload de `q-reason`.
- [x] Definir payload de `q-validate`.
- [x] Definir payload de `q-deliver`.
- [x] Definir payload de `q-cleanup`.
- [ ] Implementar validador real de firma Twilio.
- [ ] Implementar parser real del form inbound.
- [ ] Implementar adapter `provider -> canonical envelope`.

Documento fuente:

- [WEBHOOK_AND_QUEUE_CONTRACT_CLINICAL_AI_2026-03-06.md](/home/edu/Autamedica/docs/WEBHOOK_AND_QUEUE_CONTRACT_CLINICAL_AI_2026-03-06.md)

## 5. Infraestructura GCP

- [x] Definir `Cloud Run` para ingreso HTTP.
- [x] Definir `Cloud Tasks` para colas.
- [x] Definir `Cloud Storage` para artefactos.
- [x] Definir `Speech-to-Text v2`.
- [x] Definir `Vertex AI Gemini 2.5 Pro`.
- [x] Definir `Secret Manager`.
- [x] Definir `Cloud Scheduler` para cleanup.
- [ ] Crear buckets separados para `raw`, `normalized`, `transcripts`, `outputs`.
- [ ] Crear queues reales en GCP.
- [ ] Definir service accounts por worker.
- [ ] Configurar IAM minimo privilegio.
- [ ] Configurar secretos del proveedor de WhatsApp.
- [ ] Configurar secretos de Vertex/STT.
- [ ] Definir politica de KMS/CMEK si aplica.

## 6. Audio y transcripcion

- [x] Definir que el audio se normaliza antes de STT.
- [x] Definir uso de `batch recognize` para audio largo.
- [x] Definir diarizacion como default cuando no hay multi-channel.
- [x] Definir uso de `PhraseSet`.
- [x] Definir politica de rechazo de audio malo.
- [ ] Elegir formato canonico exacto de audio para v1.
- [ ] Definir umbral minimo de calidad/SNR.
- [ ] Definir phrase sets por especialidad inicial.
- [ ] Probar audio real de consultorio.
- [ ] Medir latencia real de STT para 20, 40, 60 y 80 minutos.

## 7. Razonamiento con Gemini

- [x] Definir `gemini-2.5-pro` como modelo principal.
- [x] Definir structured output.
- [x] Definir `temperature=0`.
- [x] Definir `candidateCount=1`.
- [x] Definir `seed` fijo.
- [x] Definir esquema JSON base.
- [x] Definir principio de abstencion.
- [ ] Escribir prompt de sistema v1 final.
- [ ] Pinnear version exacta del modelo en Vertex.
- [ ] Definir `thinking budget` exacto de v1.
- [ ] Probar repetibilidad real sobre casos simulados.

## 8. Validador clinico

- [x] Definir que el validador es obligatorio.
- [x] Definir reglas estructurales.
- [x] Definir reglas minimas para alergias, peso y embarazo.
- [x] Definir salida `informacion_insuficiente`.
- [ ] Crear matriz de reglas versionada en tabla o config file.
- [ ] Definir lista de terminos de urgencia mayor.
- [ ] Definir politica exacta de abstencion farmacologica.
- [ ] Definir reglas por especialidad inicial.
- [ ] Definir si probabilidades se muestran como porcentaje o ranking relativo.

## 9. Seguridad y compliance

- [x] Definir que no se loggea transcript completo.
- [x] Definir que no se loggea output clinico completo.
- [x] Definir que el pipeline usa minimo privilegio.
- [x] Definir separacion de PHI y artefactos temporales.
- [x] Definir politica de retencion inicial.
- [ ] Verificar BAA/condiciones contractuales del proveedor WhatsApp para PHI real.
- [ ] Verificar politica legal exacta de retencion para jurisdiccion objetivo.
- [ ] Definir proceso de purge auditado.
- [ ] Definir runbook de incidentes PHI.

## 10. UX operativa

- [x] Definir que el medico no interactua con un chat libre.
- [x] Definir `WhatsApp` como canal inicial de entrega.
- [x] Definir comandos operativos explicitos.
- [ ] Definir mensaje exacto de ack al recibir audio.
- [ ] Definir mensaje exacto de procesamiento.
- [ ] Definir mensaje exacto de error de audio.
- [ ] Definir formato final del mensaje de salida en WhatsApp.
- [ ] Definir si el medico podra pedir `ver evidencia` por canal o en portal.

## 11. Implementacion backend

- [ ] Crear webhook skeleton.
- [ ] Crear resolver de `clinical_ai_channel_bindings`.
- [ ] Crear worker `media-fetch`.
- [ ] Crear worker `audio-prep`.
- [ ] Crear worker `stt-submit`.
- [ ] Crear worker `stt-finalize`.
- [ ] Crear worker `normalize`.
- [ ] Crear worker `reason`.
- [ ] Crear worker `validate`.
- [ ] Crear worker `deliver`.
- [ ] Crear worker `cleanup`.
- [ ] Crear libreria compartida de `idempotency keys`.
- [ ] Crear adapter `TwilioClient`.

## 12. Observabilidad

- [x] Definir que se observan jobs y sesiones.
- [x] Definir metrica de tiempo total de pipeline.
- [x] Definir metrica por etapa.
- [x] Definir metrica de audio invalido.
- [x] Definir metrica de abstencion.
- [ ] Implementar dashboard operativo.
- [ ] Implementar alertas de backlog.
- [ ] Implementar alertas de fallo STT.
- [ ] Implementar alertas de fallo delivery.
- [ ] Implementar alertas de aumento anomalo de `informacion_insuficiente`.

## 13. Pruebas

- [ ] Crear fixtures de webhook Twilio.
- [ ] Crear casos de audio corto.
- [ ] Crear casos de audio largo.
- [ ] Crear casos multi-audio por sesion.
- [ ] Crear casos con audio malo.
- [ ] Crear casos sin contexto clinico suficiente.
- [ ] Crear casos con comandos `/finalizar`.
- [ ] Crear pruebas de idempotencia.
- [ ] Crear pruebas de RLS.
- [ ] Crear pruebas de retencion/purge.

## 14. Go / No-Go para empezar a programar fuerte

- [x] Investigacion cerrada.
- [x] Arquitectura cerrada.
- [x] Schema inicial definido.
- [x] Contrato de webhook y colas definido.
- [ ] Elegir ruta de captura final: `solo WhatsApp` vs `WhatsApp + PWA`.
- [ ] Confirmar especialidad e idioma del MVP.
- [ ] Confirmar si farmacos con dosis salen en v1.
- [ ] Aprobar migracion SQL v1.
- [ ] Aprobar contrato webhook v1.

## 15. Orden recomendado de ejecucion

- [ ] Aplicar migracion SQL.
- [ ] Regenerar tipos DB.
- [ ] Implementar `clinical_ai_channel_bindings`.
- [ ] Implementar webhook inbound.
- [ ] Implementar `media-fetch` y `audio-prep`.
- [ ] Implementar `stt-submit` y `stt-finalize`.
- [ ] Implementar normalizador.
- [ ] Implementar prompt/schema Gemini.
- [ ] Implementar validador.
- [ ] Implementar delivery WhatsApp.
- [ ] Ejecutar pruebas end-to-end.

## 16. Documentos maestros

- [INVESTIGACION_IA_CLINICA_LONG_AUDIO_DETERMINISTA_2026-03-06.md](/home/edu/Autamedica/docs/INVESTIGACION_IA_CLINICA_LONG_AUDIO_DETERMINISTA_2026-03-06.md)
- [TECHNICAL_DESIGN_WHATSAPP_CLINICAL_ORCHESTRATOR_2026-03-06.md](/home/edu/Autamedica/docs/TECHNICAL_DESIGN_WHATSAPP_CLINICAL_ORCHESTRATOR_2026-03-06.md)
- [DB_SCHEMA_CLINICAL_AI_PIPELINE_2026-03-06.md](/home/edu/Autamedica/docs/DB_SCHEMA_CLINICAL_AI_PIPELINE_2026-03-06.md)
- [WEBHOOK_AND_QUEUE_CONTRACT_CLINICAL_AI_2026-03-06.md](/home/edu/Autamedica/docs/WEBHOOK_AND_QUEUE_CONTRACT_CLINICAL_AI_2026-03-06.md)
- [20260306173000_create_clinical_ai_pipeline_core.sql](/home/edu/Autamedica/supabase/migrations/20260306173000_create_clinical_ai_pipeline_core.sql)

