# Investigacion Senior: IA Clinica de Escucha Prolongada y Salida Estructurada

Fecha: 2026-03-06  
Etapa: Investigacion, analisis, arquitectura y factibilidad  
Estado: Documento de reflexion. No implementacion.

## 1. Idea base

La idea es correcta y hoy es tecnicamente viable:

- Un "copiloto invisible" escucha una consulta de 20, 40, 60 u 80 minutos.
- No interrumpe al medico.
- No conversa durante la consulta.
- Solo al final devuelve una salida corta, ordenada y clinicamente util.

Salida objetivo:

- Examenes complementarios: maximo 3.
- Diagnosticos presuntivos con probabilidades: maximo 3.
- Farmacos de eleccion con dosis: maximo 3.

La conclusion principal de esta investigacion es simple:

> El sistema no necesita "pensar" durante 80 minutos.  
> Lo que necesita durante la consulta es capturar evidencia de alta calidad.  
> El razonamiento fuerte puede y debe ocurrir al final, sobre audio, transcripcion y contexto clinico estructurado.

## 2. Resumen ejecutivo

### Veredicto

Si, se puede hacer.

### Pero no de la forma mas ingenua

La arquitectura mas simple seria grabar todo el audio y enviarlo directo a Gemini al final. Eso sirve para una demo o PoC rapida.

La arquitectura profesional para un producto clinico serio no deberia depender solo de "audio crudo -> LLM". Debe agregar:

- transcripcion confiable,
- separacion de hablantes,
- validacion de salida,
- reglas clinicas,
- evidencia trazable,
- y control estricto del formato.

### Recomendacion senior

Para AutaMedica, la mejor apuesta inicial es una arquitectura hibrida:

1. Captura continua de audio.
2. Transcripcion con diarizacion.
3. Archivo del audio original.
4. Analisis final con Gemini en Vertex AI.
5. Capa de determinismo y seguridad arriba del modelo.

### Decision de alto nivel

La recomendacion actual es:

- Base principal: `Google Cloud + Vertex AI Gemini + Cloud Speech-to-Text v2`.
- Modelo de razonamiento final: `Gemini 2.5 Pro` en Vertex AI.
- No construir sobre `MedLM`: Google ya lo marco como deprecado y sin disponibilidad despues del 29 de septiembre de 2025.
- No usar `Live API` como columna vertebral del producto v1.
- Si algun dia el foco fuera solo ingles de EE.UU., entonces si vale evaluar `AWS HealthScribe` o `Deepgram Nova-3 Medical` como alternativas especializadas.

## 3. Hallazgos concretos de la investigacion

## 3.1 Gemini ya puede procesar audio largo

En Vertex AI, los modelos Gemini que soportan audio aceptan aproximadamente:

- hasta 8.4 horas de audio por prompt,
- o hasta 1 millon de tokens de entrada de audio.

Gemini tokeniza audio a razon fija de 32 tokens por segundo. Eso implica:

| Duracion | Tokens aproximados |
|---|---:|
| 20 min | 38,400 |
| 40 min | 76,800 |
| 60 min | 115,200 |
| 80 min | 153,600 |

Conclusion:

- 80 minutos no solo es posible.
- Esta muy por debajo del limite tecnico del modelo.

## 3.2 La salida estructurada ya existe

Gemini soporta `structured output` con esquema JSON.

Esto permite forzar, por ejemplo:

- `maxItems: 3`,
- `minimum` y `maximum` para probabilidades,
- `enum` para categorias,
- `additionalProperties: false`,
- y tipos estrictos.

Eso resuelve una parte importante de la necesidad de "determinismo de formato".

## 3.3 Determinismo absoluto no existe

Google documenta dos puntos clave:

- `temperature=0` produce respuestas mayormente deterministicas, pero todavia puede existir una pequena variacion.
- `seed` hace un "best effort" de repetibilidad, pero no garantiza identidad perfecta.

Por lo tanto, en un producto clinico no hay que prometer "determinismo matematico del LLM".  
Lo correcto es disenar "determinismo de sistema".

Eso significa:

- version fija de modelo,
- prompt fijo y versionado,
- esquema fijo,
- `candidateCount=1`,
- `temperature=0`,
- `seed` fijo,
- validadores posteriores,
- y reglas que rechacen salidas inseguras o incompletas.

## 3.4 La opcion "Gemini Live escuchando toda la consulta" no es la mejor base

Aunque Gemini Live API soporta sesiones extendibles, tiene varias caracteristicas que hacen que no sea la mejor eleccion para este producto v1:

- la conexion tiene limite corto y requiere reanudacion,
- la ventana de contexto debe comprimirse para sesiones largas,
- la autenticacion recomendada es server-to-server,
- y el producto esta pensado para interaccion en tiempo real, no para "escuchar en silencio y responder una sola vez al final".

Arquitectonicamente, es mejor separar:

- escucha/captura,
- transcripcion,
- analisis final.

## 3.5 Transcripcion larga y profesional tambien es viable

Cloud Speech-to-Text v2 soporta:

- streaming para audio en vivo,
- batch para audios largos,
- hasta 480 minutos en reconocimiento asincronico,
- diarizacion de hablantes,
- multicanal hasta 8 canales,
- y adaptacion del vocabulario con `PhraseSet` y `boost`.

Esto es clave porque, a diferencia de enviar el audio directo a Gemini:

- se gana mejor trazabilidad,
- se ganan timestamps por palabra,
- se puede ajustar el vocabulario medico,
- y se puede mejorar la separacion medico/paciente.

## 3.6 El audio directo a Gemini tiene una limitacion importante

Google documenta que Gemini combina los canales de audio en un solo canal.

Eso significa que si se envia solo el archivo final directo a Gemini:

- se pierde la ventaja de un audio multicanal,
- y la separacion exacta medico/paciente queda mas fragil.

Esto es una razon fuerte para preferir `STT + diarizacion` antes del analisis final.

## 3.7 El mercado especializado medico hoy esta sesgado a ingles de EE.UU.

Hallazgos importantes:

- `AWS HealthScribe` soporta lenguaje `en-US` y esta orientado a notas clinicas con transcript, speaker roles, entidades y resumen.
- `Amazon Transcribe Medical` tambien se orienta principalmente a `en-US`.
- `Deepgram nova-3-medical` hoy figura como ingles.

Implicancia para AutaMedica:

- Si el idioma prioritario es espanol de Latinoamerica o portugues, la ruta mas fuerte hoy no es un "vendor medico cerrado".
- La ruta mas fuerte es:
  - motor de voz bueno y adaptable,
  - mas Gemini para razonamiento,
  - mas reglas propias de negocio clinico.

## 4. Opciones de arquitectura

## Opcion A: Audio completo -> Gemini al final

### Flujo

1. La app graba toda la consulta.
2. Al finalizar, sube un solo archivo.
3. Gemini analiza audio crudo.
4. Devuelve JSON estructurado.

### Ventajas

- Menor complejidad.
- Menos servicios.
- PoC muy rapida.
- Aprovecha el contexto largo nativo del modelo.

### Desventajas

- Menor trazabilidad.
- Peor control sobre hablantes.
- Gemini mezcla canales.
- Menor auditabilidad clinica.
- Menor capacidad de explicar "por que dijo eso".

### Veredicto

Buena para una demo temprana. Insuficiente como arquitectura final de producto clinico serio.

## Opcion B: Transcripcion completa -> Gemini al final

### Flujo

1. La app graba.
2. El audio se transcribe en streaming o batch.
3. Se conserva el transcript con timestamps y speaker tags.
4. Gemini razona sobre el transcript y contexto clinico.
5. Un validador aplica reglas.

### Ventajas

- Mucha mejor trazabilidad.
- Mejor control de speaker turns.
- Posibilidad de auditar evidencia.
- Posibilidad de indexar y reutilizar.
- Menor costo posterior para nuevas consultas sobre el mismo caso.

### Desventajas

- Mas moving parts.
- La calidad final depende de la transcripcion.
- Requiere estrategia de vocabulario medico.

### Veredicto

Mucho mejor que la opcion A para un producto real.

## Opcion C: Hibrida recomendada

### Flujo

1. Captura continua de audio.
2. Se guarda el audio original.
3. Se genera transcript progresivo con diarizacion.
4. Al finalizar, Gemini recibe:
   - transcript limpio,
   - segmentos relevantes,
   - metadata del paciente,
   - y, si hace falta, fragmentos de audio clave.
5. La salida pasa por un motor de reglas.
6. Se presenta una respuesta corta, auditada y trazable.

### Ventajas

- Mejor equilibrio entre calidad, control y factibilidad.
- Se conserva evidencia forense del caso.
- Permite un UI muy limpio para el medico.
- Da base para evolucionar a auditoria, detalle y resumen extendido.

### Desventajas

- Es la opcion mas madura, no la mas corta de construir.

### Veredicto

Esta es la arquitectura recomendada.

## Opcion D: Proveedor medico especializado externo

### Ejemplos

- AWS HealthScribe.
- Amazon Transcribe Medical.
- Deepgram Nova-3 Medical.

### Cuando tiene sentido

- Mercado casi exclusivamente `en-US`.
- Necesidad fuerte de features clinicos ya empaquetados.
- Equipo dispuesto a aceptar lock-in y limitaciones regionales/idioma.

### Veredicto

No parece la mejor apuesta base para AutaMedica hoy.

## Opcion E: OpenClaw como capa de agente/orquestacion

`OpenClaw` si merece aparecer en el mapa, pero no como el nucleo clinico del sistema.

### Donde encaja bien

OpenClaw encaja como:

- capa de orquestacion,
- agent shell multi-canal,
- enrutador de agentes especializados,
- skills reutilizables,
- y automatizacion de workflows alrededor del producto.

### Donde no resuelve el problema principal

OpenClaw no resuelve por si mismo:

- transcripcion clinica larga,
- diarizacion medico/paciente,
- razonamiento medico confiable,
- ni salida clinica estructurada y prudente.

En otras palabras:

- `OpenClaw` puede coordinar herramientas y agentes.
- Pero el corazon del problema sigue siendo `audio + STT + Gemini + reglas`.

### Mi lectura senior

Si se usa OpenClaw, yo lo pondria como capa lateral o superior, por ejemplo para:

- disparar el workflow al finalizar una consulta,
- decidir que pipeline ejecutar segun especialidad,
- verificar si faltan datos clinicos obligatorios,
- pedir una segunda pasada de consistencia,
- o generar tareas internas de seguimiento.

No lo pondria como agente con acceso amplio y directo al camino de PHI sin controles muy fuertes.

### Motivo

La documentacion oficial de OpenClaw enfatiza:

- multi-agent routing,
- sandboxing opcional,
- restricciones por agente,
- y control granular de herramientas.

Tambien aclara que el workspace por defecto no es un sandbox duro y que, si el sandbox esta apagado, las herramientas pueden correr sobre el host. Para un flujo clinico con datos sensibles, eso obliga a mucha prudencia.

### Veredicto

OpenClaw es util como `orchestrator` o `agent shell`.  
No es la respuesta principal al problema "escuchar 80 minutos y devolver 3 conclusiones clinicas deterministas".

## 5. Arquitectura recomendada para fase 0

## 5.1 Principio rector

La IA no debe improvisar.  
Debe:

- capturar,
- ordenar,
- reducir,
- justificar,
- y abstenerse cuando falte evidencia.

## 5.2 Capas recomendadas

### Capa 1: Captura

- App movil o web graba la consulta completa.
- Ideal: audio de buena calidad y, si es posible, dos canales separados.
- Si no hay dos canales, al menos microfono cercano al medico y control de ruido.

### Capa 2: Almacenamiento seguro

- Guardar audio original cifrado.
- El audio es la fuente de verdad.
- El transcript es derivado.

### Capa 3: Speech-to-Text

Usar `Cloud Speech-to-Text v2` para:

- diarizacion,
- timestamps por palabra,
- phrase sets para medicamentos, especialidades, estudios, siglas,
- multicanal si el hardware lo permite.

### Capa 4: Normalizacion clinica

Antes de Gemini, convertir el transcript a una estructura estable:

- speaker: medico/paciente/desconocido,
- timestamp inicio-fin,
- texto limpio,
- entidades detectadas,
- resumen de sintomas y antecedentes mencionados,
- ruido/small talk marcado como prescindible.

### Capa 5: Contexto clinico estructurado

No mandar solo conversacion.  
Mandar tambien, si estan disponibles:

- edad,
- sexo,
- embarazo si aplica,
- peso,
- alergias,
- insuficiencia renal/hepatica,
- medicacion actual,
- signos vitales,
- comorbilidades,
- especialidad de la consulta.

Sin esto, la parte de farmacos con dosis es mucho mas riesgosa.

### Capa 6: Razonamiento final con Gemini

Usar `Gemini 2.5 Pro` en Vertex AI para la inferencia final por estas razones:

- es GA,
- soporta contexto largo,
- soporta structured output,
- tiene controles de seguridad empresariales,
- y ofrece mejores condiciones para un backend serio en salud.

Si el objetivo fuera bajar latencia/costo en algunas rutas, se puede evaluar `Gemini 2.0 Flash` o `Gemini 2.5 Flash`, pero el camino senior inicial para la salida final clinica es `2.5 Pro`.

### Capa 7: Determinismo de sistema

Aplicar en conjunto:

- modelo pinneado, no alias "latest",
- `temperature=0`,
- `seed` fijo,
- `candidateCount=1`,
- `thinkingBudget` fijo o `0` para extraccion estable,
- JSON schema estricto,
- vocabularios cerrados cuando aplique,
- ordenamiento descendente obligatorio,
- maximo 3 items por seccion,
- umbrales minimos de evidencia,
- y rechazo automatico de salidas incompletas.

### Capa 8: Motor de reglas clinicas

Esta capa es obligatoria si se quieren farmacos con dosis.

Reglas minimas:

- Si faltan alergias, no sugerir ciertos farmacos.
- Si falta peso y el farmaco depende de peso, no devolver dosis.
- Si el embarazo es desconocido y el farmaco tiene riesgo, devolver `informacion_insuficiente`.
- Si la evidencia es debil, devolver menos de 3 items.
- Nunca rellenar por obligacion para llegar a 3.

### Capa 9: Evidencia y trazabilidad

Cada salida deberia incluir:

- evidencia textual,
- timestamp,
- y speaker asociado.

El medico debe poder tocar "ver evidencia" y entender por que aparecio ese diagnostico o farmaco.

### Capa 10: Persistencia clinica

No es obligatorio en la primera prueba, pero la direccion correcta es almacenar lo aprobado por el medico en una capa interoperable, idealmente compatible con FHIR.

## 6. El punto mas delicado: probabilidades y dosis

## 6.1 Diagnosticos con probabilidades

Esto es posible de mostrar, pero hay una advertencia importante:

- El modelo puede rankear hipotesis.
- Eso no significa que sus porcentajes sean probabilidades clinicas calibradas.

Recomendacion:

- En fase temprana, tratar esos porcentajes como un ranking relativo controlado.
- Si el producto quiere mostrar "82%" o "64%" como probabilidades reales, eso exige calibracion posterior sobre dataset retrospectivo validado.

Inferencia de arquitectura:

> Mostrar porcentajes exactos sin calibracion puede crear una falsa sensacion de precision.

## 6.2 Farmacos con dosis

Es la seccion de mayor riesgo medico-legal.

Para devolverla con seriedad, hay que imponer precondiciones:

- edad conocida,
- peso cuando corresponda,
- alergias conocidas,
- embarazo conocido si aplica,
- funcion renal/hepatica cuando sea clinicamente relevante,
- medicacion concomitante relevante.

Si esos datos faltan, el sistema deberia devolver:

- cero farmacos,
- o una salida marcada como `informacion_insuficiente`.

## 7. Contrato de salida recomendado

El formato de respuesta deberia ser estricto y pequeno.

```json
{
  "estado": "sugerencia_para_revision_medica",
  "diagnosticos_presuntivos": [
    {
      "nombre": "string",
      "probabilidad": 0,
      "evidencia": [
        {
          "speaker": "paciente",
          "timestamp_inicio_seg": 0,
          "timestamp_fin_seg": 0,
          "texto": "string"
        }
      ]
    }
  ],
  "farmacos_eleccion": [
    {
      "nombre": "string",
      "dosis": "string",
      "condiciones_seguridad": [
        "string"
      ],
      "evidencia": [
        {
          "speaker": "medico",
          "timestamp_inicio_seg": 0,
          "timestamp_fin_seg": 0,
          "texto": "string"
        }
      ]
    }
  ],
  "examenes_complementarios": [
    {
      "nombre": "string",
      "motivo": "string",
      "evidencia": [
        {
          "speaker": "medico",
          "timestamp_inicio_seg": 0,
          "timestamp_fin_seg": 0,
          "texto": "string"
        }
      ]
    }
  ],
  "alertas": [
    "string"
  ]
}
```

Reglas del esquema:

- `diagnosticos_presuntivos.maxItems = 3`
- `farmacos_eleccion.maxItems = 3`
- `examenes_complementarios.maxItems = 3`
- `additionalProperties = false`
- `probabilidad` entre `0` y `100`
- permitir arreglos vacios
- permitir `null` solo donde sea clinicamente necesario

## 8. UX recomendada para el medico

El UX correcto no es "chat medico".

El UX correcto es:

1. Un boton grande de grabacion.
2. La consulta ocurre sin friccion.
3. Al final aparece una vista limpia con solo:
   - 3 examenes,
   - 3 diagnosticos,
   - 3 farmacos.
4. Cada item tiene opcion "ver evidencia".
5. El medico acepta, corrige o ignora.

Esto mantiene el principio del "copiloto invisible".

## 9. Factibilidad real por componente

| Componente | Factibilidad actual | Comentario |
|---|---|---|
| Escuchar 80 minutos | Alta | Muy dentro de los limites tecnicos actuales |
| Transcribir consultas largas | Alta | Cloud STT v2 soporta batch largo y streaming |
| Separar hablantes | Media-Alta | Mucho mejor si hay dual-channel o microfono cercano |
| Responder en JSON estricto | Alta | Structured output ya lo soporta |
| Respuesta reproducible | Media-Alta | Muy buena a nivel sistema, no absoluta a nivel LLM |
| Probabilidades clinicas calibradas | Media-Baja | Requiere dataset y validacion posterior |
| Farmacos con dosis seguros | Media | Solo con contexto clinico obligatorio y motor de reglas |
| Trazabilidad medico-legal | Alta | Si se conserva transcript, timestamps y audio original |

## 10. Riesgos no negociables

- Mala calidad de audio destruye todo el pipeline.
- Conversaciones con mucha superposicion de voces afectan diarizacion.
- Las probabilidades del LLM no deben asumirse como calibradas.
- Sugerir farmacos sin contexto clinico estructurado es riesgoso.
- En cargas con PHI, conviene evitar features preview cuando exista opcion GA equivalente.
- No se debe exponer una recomendacion como orden medica automatica.

## 11. Recomendacion final

La mejor decision actual para este proyecto es:

- construir la primera arquitectura seria sobre `Google Cloud`,
- usar `Cloud Speech-to-Text v2` para transcripcion y diarizacion,
- usar `Gemini 2.5 Pro` en `Vertex AI` para el razonamiento final,
- y envolver todo con una capa propia de validacion, reglas, evidencia y seguridad.
- Si se desea una capa agentica, usar `OpenClaw` como orquestador lateral y no como nucleo clinico.

### Lo que haria ahora

- No construiria un agente conversacional en vivo como nucleo.
- No apostaria el producto a un servicio medico cerrado en ingles si el mercado es LatAm.
- No venderia "determinismo absoluto".
- Si venderia:
  - salida corta,
  - trazable,
  - reproducible,
  - y clinicamente prudente.

### Frase de arquitectura

> "Escuchar durante mucho tiempo, pensar solo al final, responder poco, justificar todo."

## 12. Proxima etapa sugerida

La siguiente etapa, todavia sin escribir producto final, deberia responder:

1. Idioma principal de lanzamiento: `es`, `pt-BR`, `en-US`, u otro.
2. Especialidad inicial: clinica medica, pediatria, guardia, salud mental, etc.
3. Hardware real de captura: celular, tablet, web, microfono externo, dual-channel.
4. Minimo contexto clinico obligatorio antes de permitir sugerencia de farmacos.
5. Politica exacta de abstencion: cuando el sistema debe devolver "insuficiente evidencia".
6. Nivel de explicabilidad visible para el medico.

## 13. Fuentes oficiales consultadas

- Google Vertex AI, audio understanding: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding
- Google Gemini API, audio understanding: https://ai.google.dev/gemini-api/docs/audio
- Google Vertex AI, structured output: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
- Google Gemini API, structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Google Vertex AI, content generation parameters: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/content-generation-parameters
- Google Vertex AI, Live API session management: https://cloud.google.com/vertex-ai/generative-ai/docs/live-api/start-manage-session
- Google Vertex AI, Gemini models and language support: https://cloud.google.com/vertex-ai/generative-ai/docs/models
- Google Cloud Speech-to-Text v2, batch recognize: https://cloud.google.com/speech-to-text/v2/docs/batch-recognize
- Google Cloud Speech-to-Text v2, streaming recognize: https://cloud.google.com/speech-to-text/v2/docs/streaming-recognize
- Google Cloud Speech-to-Text v2, speaker diarization: https://cloud.google.com/speech-to-text/v2/docs/multiple-voices
- Google Cloud Speech-to-Text v2, multichannel audio: https://cloud.google.com/speech-to-text/v2/docs/multi-channel
- Google Cloud Speech-to-Text, model adaptation: https://cloud.google.com/speech-to-text/v2/docs/adaptation-model
- Google Cloud, HIPAA compliance and covered products: https://cloud.google.com/security/compliance/hipaa
- Google Cloud Healthcare API, FHIR stores: https://cloud.google.com/healthcare-api/docs/how-tos/fhir
- Deepgram, models and languages overview: https://developers.deepgram.com/docs/models-languages-overview/
- Deepgram, diarization: https://developers.deepgram.com/docs/diarization/
- Deepgram, utterances: https://developers.deepgram.com/docs/utterances
- Deepgram, data privacy compliance: https://developers.deepgram.com/trust-security/data-privacy-compliance
- OpenClaw docs home: https://docs.openclaw.ai/
- OpenClaw multi-agent routing: https://docs.openclaw.ai/multi-agent
- OpenClaw skills: https://docs.openclaw.ai/skills
- OpenClaw sandboxing: https://docs.openclaw.ai/sandboxing
- OpenClaw agent workspace: https://docs.openclaw.ai/agent-workspace
- AWS HealthScribe: https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe.html
- AWS HealthScribe transcript structure: https://docs.aws.amazon.com/transcribe/latest/dg/health-scribe-transcript.html
- Amazon Transcribe Medical, streaming medical conversation: https://docs.aws.amazon.com/transcribe/latest/dg/streaming-medical-conversation.html
