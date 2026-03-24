# Modulo IV — Inteligencia Artificial en Medicina

> Catedra Libre de Salud Digital, FMED UBA
> Fuentes: Clase 1 (Marina Rojo) + Clase 2 y 3 (Guido Giunti) + Recursos y Materiales IV (libro, 3 caps)

---

## 1. Que es la Inteligencia Artificial

**IA es un termino paraguas** que engloba muchas tecnicas diferentes. No hay consenso total sobre la definicion — para algunos incluye algoritmos basados en reglas, para otros solo Machine Learning. El concepto central: maquinas que a traves de la experiencia mejoran su capacidad de tomar decisiones.

> "No es que realmente piensen. Mejoran con la practica, por eso se las emparenta con la inteligencia humana." — Marina Rojo

### Tres niveles de IA (taxonomia del libro)

| Tipo | Descripcion | Estado actual |
|---|---|---|
| **IA estrecha (especifica)** | Disenada para tareas muy especificas (Siri, Alexa, recomendaciones de Netflix) | **Existe — es lo que tenemos hoy** |
| **IA general** | Capaz de realizar cualquier tarea que un humano pueda hacer | En desarrollo, no existe completa aun |
| **IA superinteligente** | Inteligencia muy superior a la humana | Hipotetica — idea futurista, no es real |

> La IA que usamos en salud hoy es TODA **IA estrecha**: hace cosas especificas muy bien pero no puede generalizar. Ningún algoritmo que detecta fracturas puede ademas escribir una evolucion clinica.

### Mapa de IA

```
Inteligencia Artificial (termino paraguas)
├── Machine Learning (aprendizaje automatico)
│   ├── Supervisado (datos etiquetados)
│   ├── No supervisado (datos sin etiquetar)
│   └── Reforzado (recompensas y castigos)
│       └── RLHF (ajuste fino de LLMs con feedback humano)
├── Deep Learning (redes neuronales profundas)
│   ├── Redes neuronales simples
│   └── Redes neuronales con capas ocultas
├── IA Generativa (LLMs, generacion de imagenes/video)
│   ├── Modelos de lenguaje (ChatGPT, Claude, Copilot)
│   └── Generacion de imagenes/video (deep fakes, estilos artisticos)
└── NLP — Procesamiento de Lenguaje Natural
    ├── Chatbots clasicos (basados en reglas)
    └── Chatbots modernos (basados en LLMs)
```

---

## 2. Contexto historico — Por que ahora

### 2.1 Ley de Moore

El poder de computo se **duplica aproximadamente cada ano**. Efecto acumulativo exponencial:

- La computadora de la Apolo 11 tenia 64 KB de memoria — menos de lo que pesa la foto de si misma
- En 50-60 anos se paso de eso a modelos que procesan billones de parametros

> Esto explica por que los saltos en IA son recientes: recien ahora hay suficiente poder de computo para entrenar estos modelos.

### 2.2 Velocidad de adopcion tecnologica

Ejemplo ilustrativo: las dos fotos de la Plaza de San Pedro (anuncio de Papa Benedicto 2005 vs Papa Francisco 2013). En 8 anos — lo que tarda en formarse un profesional de salud — la adopcion de smartphones fue masiva. Y esa foto ya tiene mas de 10 anos.

### 2.3 Ciclo de Gartner (Hype Cycle)

Toda tecnologia nueva pasa por un patron predecible de expectativas:

```
Expectativas
      |
      |         PICO DE EXPECTATIVAS
      |        /\   ← "esto va a resolver todo"
      |       /  \
      |      /    \  ABISMO DE DESILUSIÓN
      |     /      \_____
      |    /              \_________ MESETA DE PRODUCTIVIDAD
      |   /                          ← usos reales consolidados
      |  /
      | /  LANZAMIENTO
      |/_____________________________ Tiempo
```

**La IA generativa hoy esta en el PICO.** El abismo de desilusion es inevitable.

> Ejemplo: en 2015 Elon Musk pronostico autos autonomos en 5 anos. Geoffrey Hinton (premio Nobel) dijo que en 5 anos no habria radiologos. En 2025 los radiologos siguen trabajando y manejando sus propios autos.

---

## 3. Machine Learning — Los tres paradigmas de aprendizaje

### 3.1 Aprendizaje Supervisado

Los datos de entrenamiento estan **previamente etiquetados** — el resultado esperado ya es conocido.

**Ejemplo (fractura en radiografia):**
1. Alimentar al algoritmo con imagenes etiquetadas: `fractura` / `no fractura`
2. El algoritmo aprende patrones asociados a cada etiqueta (sin que le digan QUE mirar)
3. Se evalua con un nuevo set de imagenes SIN etiquetas
4. Se mide precision (cuantas veces acierta)

```
Set etiquetado (entrenamiento) → Algoritmo aprende → Set sin etiquetar (prueba) → Evaluacion de precision
```

**Dos tipos de tareas supervisadas:**
- **Clasificacion:** asignar a categorias (fractura/no fractura, benigno/maligno)
- **Regresion:** predecir valores continuos (ej: probabilidad de supervivencia en UTI con parametros como saturacion de O2, TA, etc. → etiquetado: vivo/muerto)

> La mayoria de las aplicaciones clinicas que se usan HOY son de aprendizaje supervisado.

### 3.2 Aprendizaje No Supervisado

Los datos **no tienen etiquetas**. El algoritmo los agrupa segun patrones que el mismo descubre.

**Ejemplo:**
- Se dan miles de radiografias de torax sin decir "esto es fractura, esto no"
- El algoritmo las clasifica solo — puede llegar al resultado esperado O a algo completamente inesperado (ej: clasificar por edad, densidad osea, u otro patron que nadie buscaba)

**Tecnicas principales:**

| Tecnica | Para que sirve | Ejemplo |
|---|---|---|
| Clustering | Agrupar datos por similitud | Agrupar radiografias por patrones desconocidos |
| Reduccion de dimensiones | Simplificar datos complejos | Encontrar variables ocultas en datasets grandes |
| Sistemas de recomendacion | Recomendar en base a patrones de comportamiento | Spotify, Netflix |

> El aprendizaje no supervisado puede revelar patrones que los humanos **nunca buscaron**. Fascinante e inquietante a la vez.

### 3.3 Aprendizaje Reforzado

Se crea un **sistema de recompensas y castigos**:

- Algoritmo acierta → se lo premia
- Algoritmo se equivoca → se lo penaliza
- Ciclo iterativo: el modelo corrige su comportamiento

**Uso clave en IA moderna:** RLHF (Reinforcement Learning from Human Feedback) — la tecnica que se usa para ajustar LLMs como ChatGPT y Claude despues del pre-entrenamiento.

### 3.4 Por que la salud prefiere supervisado

En medicina seguimos el **metodo cientifico**: necesitamos entender POR QUE las cosas funcionan. Los algoritmos supervisados tienen un resultado esperado definido → se pueden validar estadisticamente, explicar parcialmente, y cumplir requisitos regulatorios.

---

## 4. Redes Neuronales y Deep Learning

### 4.1 El Perceptron

Unidad basica de una red neuronal. Analogia con la neurona biologica:

```
Neurona biologica:    Dendritas (inputs) → Soma (procesamiento) → Axon (output)
Perceptron:           Variables (inputs) → Formula matematica    → Salida
```

Muchos perceptrones interconectados → **red neuronal**.

### 4.2 Capas ocultas y Deep Learning

Una red neuronal simple tiene pocas capas. Deep Learning tiene **multiples capas** de procesamiento:

```
[Capa de entrada] → [Capa oculta 1] → [Capa oculta 2] → ... → [Capa de salida]
```

Cuando hay muchas capas y muchas neuronas, **ya no se puede rastrear individualmente** la contribucion de cada neurona. Por eso se llaman "ocultas": son opacas al analisis humano.

> **Conexion directa con la explicabilidad:** las capas ocultas son la razon tecnica por la cual un algoritmo puede darte un resultado correcto pero no poder explicar POR QUE. Giunti lo resume: "un hechicero lo hizo".

---

## 5. IA Tradicional vs IA Generativa

| Aspecto | IA Tradicional (ML clasico) | IA Generativa (LLMs) |
|---|---|---|
| Datos necesarios | Set acotado (miles/millones) | Exponencialmente mas (billones de tokens) |
| Que busca | Relaciones entre numeros | Relaciones entre conceptos/palabras |
| Output | Clasificacion o prediccion (un valor) | Texto, imagen o video generado (secuencia) |
| Que produce | "Esto es fractura" / "probabilidad 78%" | Un parrafo, un informe, una imagen |
| Ejemplo | Detectar fractura en radiografia | Escribir la evolucion de una historia clinica |

**Modelo = algoritmo congelado.** Tanto en IA tradicional como generativa, el "modelo" es una foto del estado del algoritmo despues de entrenarse. Se congela y se distribuye como version (ej: GPT-4, Claude Sonnet).

---

## 6. Como funciona un LLM (Large Language Model)

### 6.1 De texto a numeros: embeddings

Los modelos matematicos trabajan con numeros. Cada palabra se convierte en un **vector de numeros** (embedding). Palabras con significados relacionados quedan cerca en el espacio matematico → **mapa semantico**.

> Ejemplo: "ingresos" y "costos" quedan cerca. "ciencia" queda lejos de ambas. Esto emerge del entrenamiento, no de reglas manuales.

### 6.2 El problema de la ambiguedad: "Attention is All You Need"

**Problema clasico:** "banco" puede ser financiero o del rio. ¿Como sabe el modelo?

**Solucion (mecanismo de atencion):** usar las demas palabras de la oracion como contexto. "Fui al banco a sacar dinero" → "sacar dinero" refuerza la interpretacion financiera.

> Este paper (2017, Google) introdujo los **transformers** y revoluciono el campo. Sin el, no existirian los LLMs modernos.

### 6.3 GPT — Que significa

**GPT = Generative Pre-trained Transformer**

- **Generative:** produce texto como salida
- **Pre-trained:** entrenado previamente con cantidades masivas de texto
- **Transformer:** usa el mecanismo de atencion

### 6.4 Temperatura

Parametro que controla el nivel de **aleatoriedad** en las respuestas:

| Temperatura baja | Temperatura alta |
|---|---|
| Respuestas predecibles y consistentes | Respuestas creativas e impredecibles |
| Tareas tecnicas precisas | Escritura creativa |

Si el modelo siempre contestara igual, se percibiria como mecanico. La temperatura lo hace sentir natural.

### 6.5 LLM como "calculadora de palabras"

Definicion pedagogica de Giunti:

> "Un modelo de lenguaje extenso es basicamente una **calculadora de palabras**. Procesa palabras y genera una respuesta estadisticamente probable."

Desmitifica la IA: no "piensa", no "entiende" — aplica estadistica sobre patrones de palabras a escala masiva.

### 6.6 Limitaciones de los LLMs (formalizadas en el libro)

| Limitacion | Detalle |
|---|---|
| **No tienen conocimiento real del mundo** | Solo saben lo que aprendieron del texto de entrenamiento. No tienen experiencias. No acceden a informacion en tiempo real |
| **No tienen emociones ni conciencia** | Pueden "parecer" que entienden, pero no sienten ni piensan |
| **Pueden cometer errores (alucinaciones)** | Predicen la respuesta mas probable, no razonan. Pueden dar respuestas incorrectas con total confianza |
| **Dependen de los datos** | Datos incorrectos o incompletos → respuestas incorrectas |
| **Privacidad** | La informacion que se ingresa puede quedar almacenada y surgir en conversaciones con otros |

> **Para el parcial:** las limitaciones de los LLMs son un tema de examen muy probable. La clave es: "no tienen conocimiento real" + "pueden cometer errores" + "dependen de los datos".

---

## 7. Chatbots y Sistemas Conversacionales

### 7.1 Definicion

Un chatbot es un **sistema disenado para emular conversacion con un ser humano**:

| Tipo | Como funciona | Ejemplo |
|---|---|---|
| **Interfaz de voz** | Hablas y escuchas | Siri, Alexa, Google Assistant |
| **Interfaz de texto** | Escribis y lees | ChatGPT, WhatsApp bots, Boti (CABA) |

**Diferencia clave con interfaces tradicionales:** en una PC hay multiples canales (pantalla + clicks + teclas + audio). Un chatbot reduce la interfaz a solo texto o solo voz, pero gana en **naturalidad** — se parece mas a hablar con una persona.

### 7.2 NLP — Procesamiento de Lenguaje Natural

La tecnologia detras de los chatbots. Las palabras se representan como **nodos en una red**; el sistema estima la probabilidad de que una palabra este al lado de otra y asi infiere significado.

**Evolucion:**
- NLP clasico: reglas y diccionarios → chatbots limitados y frustrantes
- NLP moderno (LLMs): aprende relaciones estadisticas de texto masivo → ChatGPT, Claude

### 7.3 Ventajas y limitaciones

| Ventajas | Limitaciones |
|---|---|
| Disponibilidad 24/7, sin fatiga | Usuarios detectan rapidamente cuando tocan el limite del bot |
| Consistencia (1er y ultimo paciente reciben igual atencion) | Campos de aplicacion todavia limitados |
| Escalabilidad (miles de usuarios simultaneamente) | No maneja alta complejidad sin intervencion humana |
| Reduce barrera de alfabetizacion digital | Puede generar respuestas incorrectas con confianza (alucinaciones) |

---

## 8. Aplicaciones reales de IA en salud — Que existe HOY

### 8.1 Imagenes medicas (mayor desarrollo real)

| Tipo de imagen | Aplicacion |
|---|---|
| Radiografias, tomografias, resonancias | Apoyo al informe de diagnostico por imagenes |
| Patologia (biopsia) | Clasificacion de imagenes de tejido |
| Placas de torax | Multiples algoritmos de screening |

> En muchos centros ya se usan algoritmos para **apoyar** (no reemplazar) el informe radiologico.

### 8.2 Procesos administrativos (donde mas se usa HOY)

La mayoria de las implementaciones estan en la parte administrativa, NO en el cuidado clinico directo:
- Facturacion automatizada de internaciones
- Auditoria de practicas medicas
- Gestion administrativa

> Razon: implementar IA en toma de decisiones clinicas requiere mucho mas cuidado, validacion y responsabilidad.

### 8.3 Documentacion clinica automatizada (HCE)

Las evoluciones de historia clinica tienen **estructura estandar y repetitiva** ("Paciente de X anos, antecedentes de Y, se presenta con Z..."). Los LLMs detectan esa estructura y automatizan la generacion del texto a partir de datos clave.

**Dato concreto:** si una consulta dura 15 minutos y la documentacion otros 15, automatizar la documentacion libera **50% del tiempo** administrativo del profesional.

### 8.4 Investigacion asistida por IA

Giunti muestra un caso real: generar una revision sistematica de apps para esclerosis multiple usando ChatGPT para escribir codigo Python que busca, clasifica y tabula automaticamente.

> "Uno no necesita saber programar. Le pido al chatbot que genere el codigo. No es el mas eficiente, pero nos ayuda para salir del paso."

### 8.5 Chatbots para salud mental — Woebot

App disponible que usa chatbot para:
- Screening de depresion
- Tecnicas de terapia cognitivo-conductual (TCC/CBT)
- Deteccion de signos de depresion durante la conversacion

Desarrollado por equipo multidisciplinario (psicologos, psiquiatras, lingüistas, expertos en cambio de comportamiento).

### 8.6 Triage automatizado con escalada humana (Human-in-the-loop)

Proyecto UK (ya discontinuado) para atencion primaria:

```
Paciente chatea con bot → Bot hace triage inicial
     ↓                          ↓
¿Detecta alarma?          NO → continua chatbot
     ↓ SI
Genera teleconsulta automatica con profesional humano
     ↓
Paciente llega a teleconsulta ya con contexto del triage
```

**Concepto clave: Human-in-the-loop** — no es "chatbot O humano" sino "chatbot Y humano segun necesidad". El sistema hibrido es mas realista que la automatizacion total.

### 8.7 Herramientas de investigacion — Consensus

Herramienta que analiza papers cientificos y responde si hay consenso en la literatura sobre una pregunta especifica.

### 8.8 Deep fakes (riesgo real)

Giunti muestra un video de si mismo generado por IA hablando idiomas que no habla. 100% generado, 100% convincente. La tecnologia ya esta disponible para cualquiera.

---

## 9. La evidencia real — Lectura critica

### 9.1 Pacientes prefieren respuestas de chatbots

Se tomaron preguntas reales de pacientes en un foro. Se generaron respuestas con ChatGPT y se compararon con las de profesionales. Evaluadores ciegos (otros profesionales) consideraron las respuestas del chatbot:
- Mas empaticas
- De mayor calidad informativa
- Las que ellos "hubieran querido dar"

**Por que no es sorprendente:** un LLM entrenado para maximizar empatia lo hace de forma consistente. Los humanos, despues de horas de guardia, bajan su calidad de respuesta por fatiga.

**Por que no implica reemplazo:** el estudio mide calidad de texto, no calidad de diagnostico ni continuidad de cuidado.

### 9.2 El sesgo mediatico

**Mismo paper, dos coberturas opuestas:**
- New York Times: "Chatbots derrotaron a medicos diagnosticando enfermedades"
- Washington Post: "ChatGPT fue de poca ayuda para medicos"

El paper real: medicos **con** ChatGPT > medicos con medios convencionales > profesional solo. Ambos titulares son tecnicamente defendibles pero distorsionan el mensaje.

> **Leccion:** siempre leer el abstract original. Los titulares sobre IA distorsionan en ambas direcciones.

### 9.3 Adopcion real: cifras

- 60% de jovenes europeos ha usado IA generativa (encuesta 2024)
- 1 de cada 5 medicos generalistas en UK usa herramientas de IA en tareas diarias (Guardian)

---

## 10. Regulacion de Aplicaciones Digitales en Salud

### 10.1 El problema: Play Store sin regulacion

Cualquier persona puede subir una app medica sin validacion cientifica. Las "estrellitas" no son evidencia de eficacia ni seguridad.

### 10.2 El modelo aleman — DiGA

**DiGA = Digitale Gesundheitsanwendungen** (Aplicaciones de Salud Digital)

Alemania creo un sistema de evaluacion similar al de los medicamentos:

| Elemento | Medicamento | App DiGA |
|---|---|---|
| Validacion | Ensayo clinico | Evidencia de eficacia y seguridad |
| Prescripcion | Medico | Medico (informado sobre indicaciones y poblacion) |
| Cobertura | Obra social/seguro | Sistema de salud reintegra el costo |
| Precio ejemplo | Variable | App para HTA: ~593 EUR (reintegrable) |

**Indicacion especifica:** "Esta app fue validada para el tratamiento de depresion en personas de 18 a 60 anos" — como una vacuna o un medicamento.

Catalogo actual: ~50 apps aprobadas. Alemania y UK lideran. Argentina todavia no tiene este debate.

---

## 11. Casos emergentes (en investigacion)

### 11.1 Diabetes tipo 2 en placas de torax

Algoritmo no supervisado entrenado con placas de torax descubrio que podia predecir diabetes tipo 2 — sin que nadie se lo indicara. Mecanismo probable: acumulacion de grasa pericardica visible en la placa.

**Potencial:** podria correrse como screening precoz en personas que ya se hacen placa por otra razon. Pero necesita explicabilidad y validacion antes de implementarse.

### 11.2 Fraccion de eyeccion en placas de torax

Similar: detectar indicadores de insuficiencia cardiaca en placa de torax (actualmente requiere ecocardiograma). Si se validara, permitiria screening masivo con algo que ya se hace de rutina.

---

## 12. Explicabilidad de los Algoritmos

El problema critico para la adopcion clinica:

**El dilema:**
- El algoritmo detecta diabetes en la placa de torax — ¿que esta mirando? ¿por que clasifica asi?
- Las **capas ocultas** de deep learning hacen imposible rastrear la logica individualmente
- La ciencia normalmente va: hipotesis → experimento → resultado
- Con IA no supervisada puede ir al reves: resultado → investigar retroactivamente que lo causo

**Por que importa:**
- Los medicos necesitan entender "que ve" la maquina para confiar
- Los pacientes tienen derecho a saber por que se tomo una decision sobre su salud
- Los reguladores lo exigen para aprobacion

---

## 13. Criterios para incorporar IA a la practica clinica

| Criterio | Pregunta clave |
|---|---|
| **Valor clinico real** | ¿Cambia lo que voy a hacer con el paciente? |
| **Explicabilidad** | ¿Puedo entender por que el algoritmo llego a ese resultado? |
| **Eficacia demostrada** | ¿Mejora los resultados de salud de la poblacion? |
| **Seguridad** | ¿Tiene riesgos conocidos y manejables? |
| **Equidad** | ¿Funciona igual en distintas poblaciones? (sesgo de datos de entrenamiento) |
| **Integracion al flujo** | ¿Se diseno para el flujo real de trabajo? |

> "La tecnologia en si misma no es un valor. Implementar algo solo porque es tecnologico no es razon suficiente." — Marina Rojo

### El problema del "algoritmo fuera del flujo"

Un algoritmo que predice correctamente pero no cambia la decision clinica **no tiene valor**.

- **Antes:** cientifico de datos desarrolla algoritmo → intenta insertarlo en flujo existente (fracasa)
- **Ahora:** la IA se disena **dentro del flujo clinico desde el dia uno**, co-disenada con profesionales

> "Si ya se como le va a ir al paciente pero no puedo hacer nada distinto, ¿para que quiero la prediccion?"

---

## 14. Mensaje clave del modulo

> "La IA no va a reemplazar a los profesionales sanitarios, pero aquellos que utilicen la inteligencia artificial van a reemplazar a los que no."
> — Guido Giunti (repetido en Clases 2 y 3)

La IA es una **herramienta**, no un reemplazo. Entenderla permite verla como un socio en la practica clinica, no como una amenaza.

---

## Sintesis rapida — conceptos para evaluacion

| Concepto | En una linea |
|---|---|
| Inteligencia artificial | Termino paraguas para tecnicas que dan a maquinas capacidad de aprender y tomar decisiones |
| Machine Learning (ML) | Subcampo de IA — aprendizaje automatico de patrones en datos |
| IA generativa | Produce texto, imagenes, video (ChatGPT, etc.) — NO es lo que se usa en diagnostico clinico hoy |
| Aprendizaje supervisado | Datos etiquetados previamente → algoritmo aprende el resultado esperado |
| Aprendizaje no supervisado | Datos sin etiquetar → algoritmo descubre patrones y clasificaciones por si solo |
| Aprendizaje reforzado | Sistema de recompensas y castigos — el modelo aprende corrigiendo errores penalizados |
| RLHF | Reinforcement Learning from Human Feedback — tecnica de ajuste fino de LLMs |
| Etiquetado | Anotar datos de entrenamiento con el resultado correcto (ej: "fractura" / "no fractura") |
| Fase de entrenamiento | El algoritmo aprende con datos etiquetados (o sin etiquetar, segun paradigma) |
| Fase de evaluacion | Se prueba el algoritmo con datos nuevos y se mide su precision |
| Clasificacion | Tarea supervisada — asignar a categorias (fractura/no fractura, benigno/maligno) |
| Regresion | Tarea supervisada — predecir valores continuos (ej: probabilidad de supervivencia) |
| Clustering | Tecnica no supervisada — agrupar datos por similitud sin etiquetas previas |
| Sistemas de recomendacion | Algoritmo no supervisado — Spotify, Netflix (patrones de comportamiento) |
| Por que salud prefiere supervisado | Requiere validacion cientifica y explicabilidad para uso clinico |
| Ley de Moore | El poder de computo se duplica cada ano — explica por que la IA avanza ahora |
| Ciclo de Gartner (hype cycle) | Lanzamiento → pico de expectativas → abismo de desilusión → meseta de productividad |
| IA en el pico del hype | La IA generativa hoy esta en el pico — el abismo de desilusión es inevitable |
| Perceptron | Unidad basica de red neuronal — analogia matematica de neurona biologica |
| Red neuronal | Perceptrones interconectados en capas — analogia con sistema nervioso |
| Deep Learning | Redes neuronales con muchas capas — mas precision pero menor explicabilidad |
| Capas ocultas | Capas intermedias no rastreables individualmente — base del problema de explicabilidad |
| Embeddings | Representacion numerica de palabras para procesamiento por algoritmos matematicos |
| Mapa semantico | Espacio donde palabras con significados relacionados quedan geometricamente cerca |
| "Attention is All You Need" | Paper de Google (2017) que introdujo los transformers — hizo posibles los LLMs |
| Mecanismo de atencion | Usar contexto de otras palabras para desambiguar significado ("banco") |
| Transformer | Arquitectura de red neuronal basada en atencion — base de todos los LLMs modernos |
| GPT | Generative Pre-trained Transformer — genera texto usando transformers preentrenados |
| LLM | Large Language Model — modelo de lenguaje grande entrenado con texto masivo |
| LLM "calculadora de palabras" | Definicion pedagogica: procesa palabras y genera respuesta estadisticamente probable |
| Temperatura | Parametro que controla aleatoriedad — baja: predecible, alta: creativo |
| Modelo (en IA) | Version congelada de un algoritmo despues de entrenarse — como una foto del aprendizaje |
| Chatbot / sistema conversacional | Sistema que emula conversacion humana — por voz o texto |
| NLP / PLN | Natural Language Processing — tecnologia que permite interpretar y generar lenguaje humano |
| Imagenes medicas en IA | Area con mayor desarrollo real: radiografias, TC, RMN, patologia |
| IA en procesos administrativos | Donde mas se usa hoy: facturacion, auditoria, gestion — mas que en clinica directa |
| Automatizacion de HCE | LLMs generan texto de evolucion clinica — libera ~50% del tiempo administrativo |
| "Algoritmo fuera del flujo" | Algoritmo correcto que no cambia la decision clinica no tiene valor practico |
| Diseno integrado al flujo | Tendencia actual: IA co-disenada con profesionales dentro del flujo clinico desde el dia uno |
| DiGA | Sistema aleman de evaluacion y cobertura de apps medicas — como medicamentos |
| Regulacion tipo medicamento | Apps validadas para indicacion especifica, prescribibles, cubiertas por sistema de salud |
| Explicabilidad | Capacidad de entender POR QUE el algoritmo llego a un resultado — necesaria para adopcion clinica |
| Diabetes en placa de torax | Algoritmo no supervisado detecto diabetes tipo 2 en Rx torax — resultado inesperado |
| Fraccion de eyeccion en placa | Algoritmo que detectaria insuficiencia cardiaca en Rx torax (hoy requiere ecocardiograma) |
| Valor clinico real | Criterio central: el algoritmo debe cambiar la decision o resultado clinico |
| Sesgo de datos | Problema si datos de entrenamiento no representan todas las poblaciones |
| Pacientes prefieren chatbots | Estudio: prefieren respuestas de IA por empatia y calidad — refleja sobrecarga del sistema |
| Sesgo mediatico en IA | Mismo paper cubierto opuestamente por NYT y WaPo — siempre leer abstract original |
| Consensus | Herramienta de IA que analiza literatura y responde si hay consenso cientifico |
| Woebot | App chatbot para salud mental — screening de depresion + TCC/CBT |
| Human-in-the-loop | Chatbot maneja casos simples, escala a humano cuando detecta alarma |
| Deep fakes | Video/audio generado por IA — riesgo real, tecnologia disponible hoy |
| Boti | Chatbot de CABA para turnos y servicios publicos |
| Interfaces conversacionales | Reducen barrera de alfabetizacion digital — mas accesibles que interfaces tradicionales |
| Mensaje clave Giunti | "La IA no reemplaza sanitarios, pero los que la usen reemplazaran a los que no" |
| IA estrecha (especifica) | Disenada para tareas puntuales — Siri, Netflix, algoritmos medicos. Es lo unico que existe hoy |
| IA general | Capaz de cualquier tarea humana — no existe completa, en desarrollo |
| IA superinteligente | Inteligencia superior a la humana — hipotetica, no es real |
| No tienen conocimiento real | Los LLMs solo saben lo que aprendieron del texto — no tienen experiencias ni acceso a informacion en tiempo real |
| Alucinaciones | LLMs pueden dar respuestas incorrectas con total confianza — predicen, no razonan |
| Privacidad en chatbots | Informacion ingresada puede quedar almacenada y surgir en otras conversaciones |
| Verificar siempre la informacion | ChatGPT no reemplaza libros ni articulos cientificos — siempre verificar con fuentes academicas |
| Marina Rojo | Docente Clase 1, FMED UBA |
| Guido Giunti | Director catedra IA/salud digital FMED UBA, profesor adjunto Trinity College Dublin y U. de Olu |
