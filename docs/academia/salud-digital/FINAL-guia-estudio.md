# Guia de Estudio — Examen Final

> Catedra Libre de Salud Digital, FMED UBA
> 30 preguntas (multiple choice + V/F). Un solo intento.
> Cubre Modulos I a VI.

---

## Reglas del examen (observadas en parciales)

- Absolutos ("exclusivamente", "solo", "ningún", "siempre", "sin excepcion") → **FALSO**
- Afirmaciones moderadas y razonables → generalmente **VERDADERO**
- Preguntas de definicion → sale del libro (terminos tecnicos exactos)
- Preguntas de caso → vienen de las clases y entrevistas
- Si dos opciones son parecidas, elegir la MAS AMPLIA o la MAS PRECISA segun contexto

---

## MODULO I — Introduccion a la Salud Digital

### Definiciones clave

| Termino | Definicion para el examen |
|---|---|
| **Salud Digital** | Termino paraguas (OMS): toda tecnologia usada para mejorar la salud. El mas amplio |
| Informatica medica | 1950-60s. Gestion de datos clinicos hospitalarios. Primeros EHR |
| eSalud (eHealth) | 1990s. TIC para mejorar salud individual y comunitaria. Mas amplio que informatica medica |
| Telemedicina | Pre-digital. Servicios de salud a distancia usando telecomunicaciones |
| mSalud (mHealth) | 2000s. Dispositivos moviles (smartphones, wearables) para salud |
| Informatica en salud | Integra informatica medica + salud publica + investigacion biomedica |

> **Trampa comun:** mSalud y eSalud NO son sinonimos. mSalud es un **subconjunto** de eSalud.

### Sistema de Informacion

**No es solo software.** Son 4 pilares: **Hardware + Software + Procesos + Personas**.

### Historia Clinica Electronica (HCE)

- Documento **legal, obligatorio, cronologico, completo**
- **Funciones** (proposito): registrar acto medico, respaldo legal, comunicacion entre profesionales
- **Funcionalidades** (tecnicas): alertas, busquedas, integracion de datos, acceso simultaneo
- HCE **no es "el papel en digital"** — confundir funciones con funcionalidades es el error mas frecuente
- Ventajas: acceso simultaneo, centralizacion, portabilidad, explotacion de datos, informacion en tiempo real

### Determinantes de salud

- Exposoma personal: dieta, actividad fisica, ocupacion
- Exposoma externo: entorno geografico, condiciones ambientales, nivel socioeconomico
- "El codigo postal influye mas que el codigo genetico"

### Impacto etico y social

| Concepto | Clave |
|---|---|
| GDPR | Europa — proteccion de datos personales, derecho al olvido |
| HIPAA | EEUU — seguridad de informacion de salud protegida (PHI) |
| Brecha digital | Desigualdad de acceso tecnologico → profundiza desigualdad en salud |
| Sesgos en IA | Datos no representativos → algoritmos menos precisos en minorias |
| Responsabilidad IA | Problema abierto: quien responde por errores diagnosticos de IA |

### Casos de estudio

| Caso | Que es |
|---|---|
| Kaiser Permanente (KP HealthConnect) | HCE a gran escala en EEUU. Referencia de integracion |
| Hospital Garrahan | Telemedicina en Argentina desde 2010. Conecta especialistas con hospitales remotos |
| Apple Watch | Deteccion de fibrilacion auricular (AFib) con sensores + ML |
| BlueDot | Big data: detecto COVID en Wuhan antes que sistemas oficiales |
| OMS | Organizacion que promueve telemedicina y eSalud a nivel global |

---

## MODULO II — Telemedicina, mSalud y Atencion Remota

### Telemedicina

- **Anterior al COVID** — la pandemia fue catalizador, no origen
- Clasificacion: teleconsulta, teledermatologia, telepsiquiatria, **telestroke**, telepatologia, telerehabilitacion
- **Telestroke:** ACV requiere intervencion en minutos → conecta hospitales remotos con neurologos
- **NO es solo videollamada** — incluye monitoreo remoto, store-and-forward, asesoramiento entre profesionales

### Modalidades de comunicacion

| Modalidad | Como funciona | Ejemplo |
|---|---|---|
| **Sincronica** | En vivo, tiempo real | Videollamada, teleconsulta |
| **Asincronica (store-and-forward)** | Paciente envia datos, medico revisa en diferido | Teledermatologia (fotos), telepatologia |

### Desafios de la telemedicina

- Remuneracion (cobertura por obras sociales/prepagas)
- Marco regulatorio (matriculas interprovinciales)
- Seguridad de datos
- Perdida de senales no verbales y examen fisico limitado

### mSalud — Apps y Wearables

| Categoria de app | Descripcion | Ejemplo |
|---|---|---|
| Bienestar | Fitness, meditacion, nutricion | MyFitnessPal, Calm |
| Monitoreo | Registro de parametros clinicos | MySugr (glucosa) |
| **Terapias digitales (DTx)** | Software validado clinicamente con aprobacion regulatoria | reSET, Deprexis |

> **Diferencia critica:** app de meditacion = bienestar. reSET = **terapia digital** (ensayos clinicos + aprobacion regulatoria FDA/CE).

| DTx | Indicacion |
|---|---|
| reSET | Abuso de sustancias (TCC digital) |
| Deprexis | Depresion (programa interactivo) |

### Wearables clave

| Dispositivo | Que mide |
|---|---|
| Apple Watch | ECG, AFib, SpO2 |
| CGM (sensor glucosa continuo) | Glucosa intersticial sin pinchazos |
| Oura | Sueno, temperatura, HRV |

### Otros conceptos

- **Interoperabilidad:** que los datos fluyan entre sistemas distintos (apps ↔ HCE ↔ wearables). Uno de los desafios mas grandes
- **e-waste:** residuos electronicos de dispositivos de salud digital. Impacto ambiental
- **Finlandia vs Argentina:** alta digitalizacion e HCE nacional unificada vs avances fragmentados y brecha digital

---

## MODULO III — Diseno de Soluciones de Salud Digital

### Que es el diseno

**No es estetica.** Es una forma de **resolver problemas y mejorar experiencias**. El buen diseno es invisible.

### Caso introductorio: Hospital SickKids, Toronto

- Enfermera programa 5 mg en vez de 0,5 mg de morfina (10x la dosis) en bomba de infusion
- Causa: botones `0`, `.` y `Enter` demasiado juntos
- Investigadores: **Katherine DeHarty y Conor McDonald** (~4000 errores de medicacion)
- Conclusion: **error de uso (use error)** — culpa del diseno, no de la enfermera

### Diseno Centrado en el Humano (DCH / Design Thinking)

5 fases iterativas:

| Fase | Que se hace |
|---|---|
| **1. Entender** | Investigacion etnografica: entrevistas, observacion en contexto, analisis de incidentes |
| **2. Definir** | Articular UN problema concreto y especifico |
| **3. Idear** | Generar la mayor cantidad de ideas posibles (cantidad > calidad) |
| **4. Prototipar** | Crear version basica (MVP — Minimum Viable Product) |
| **5. Probar y refinar** | Testear con usuarios reales en contexto real → ciclo iterativo |

> **El proceso es ITERATIVO:** despues de probar se vuelve a entender → definir → idear → prototipar → probar.

### Usabilidad y Accesibilidad

- **Usabilidad:** facil de usar, eficiente, entendible. Regulada por ISOs
- **Accesibilidad:** que TODAS las personas puedan usarla (discapacidades visuales → lectores de pantalla, auditivas → subtitulos, cognitivas → lenguaje claro)

### Tres ciclos interconectados (Giunti)

| Ciclo | Nucleo |
|---|---|
| Metodo cientifico | Hipotesis → experimento → datos → analisis → publicacion |
| Desarrollo de software (SDLC) | Requisitos → definicion → desarrollo → testeo → lanzamiento |
| Diseno de negocio | Necesidad → validar necesidad → idea → validar idea → modelo → plan |

> La solucion debe aportar valor a **3 niveles simultaneamente**: pacientes, profesionales y sistema de salud.

### Carga de evidencia

A mayor pretension clinica → mas evidencia y mas regulacion:
- Portal informativo (baja) → App monitoreo (media) → DTx/cambio conductual (alta)

### Waterfall vs Agile

| Aspecto | Waterfall | Agile/Scrum |
|---|---|---|
| Documentacion | Extensiva antes de empezar | Minima, incremental |
| Desarrollo | Largo, producto completo al final | Sprints cortos (~2 semanas) |
| Feedback | Solo al lanzar | En cada sprint |
| Riesgo | Alto | Bajo |

### More Stamina (caso de estudio)

- App **gamificada** para gestion de fatiga en **esclerosis multiple** (Giunti)
- Puntos de stamina (barra de vida tipo videojuego)
- ML combina fatiga subjetiva + sensores + cuestionarios → recomendaciones personalizadas
- **Pacientes contratados como miembros del equipo** (co-produccion, no solo sujetos de estudio)
- **HTA:** Health Technology Assessment — evaluacion regulatoria para implementar en sistema de salud

### Otros conceptos

- **Front-end:** lo que ve el usuario (interfaz, pantallas)
- **Back-end:** logica y datos detras (servidor, BD, algoritmos)
- **Doble usuario:** muchas soluciones tienen 2 usuarios simultaneos (profesional + paciente)
- **Alfabetizacion digital:** restriccion de diseno — debe funcionar para usuarios sin experiencia
- **DiGA (metodo finlandes/aleman):** evaluacion de tecnologias sanitarias

---

## MODULO IV — Inteligencia Artificial en Medicina

### Que es la IA

**Termino paraguas** para tecnicas que dan a maquinas capacidad de aprender y tomar decisiones.

### Tres niveles de IA

| Tipo | Estado |
|---|---|
| **IA estrecha (especifica)** | Lo unico que EXISTE hoy. Tareas puntuales (Siri, Netflix, algoritmos medicos) |
| IA general | No existe completa. En desarrollo |
| IA superinteligente | Hipotetica. No es real |

### Mapa de IA

```
IA (paraguas)
├── Machine Learning
│   ├── Supervisado (datos etiquetados)
│   ├── No supervisado (sin etiquetar)
│   └── Reforzado (recompensas/castigos → RLHF)
├── Deep Learning (redes neuronales profundas)
├── IA Generativa (LLMs, imagenes, video)
└── NLP (Procesamiento de Lenguaje Natural)
```

### Machine Learning — Tres paradigmas

| Paradigma | Datos | Ejemplo |
|---|---|---|
| **Supervisado** | Etiquetados (resultado conocido) | Fractura/no fractura en Rx. La mayoria de apps clinicas HOY |
| **No supervisado** | Sin etiquetar → descubre patrones solo | Clustering, sistemas de recomendacion (Spotify, Netflix) |
| **Reforzado** | Recompensas y castigos | RLHF para ajustar LLMs (ChatGPT, Claude) |

**Tareas supervisadas:**
- **Clasificacion:** categorias (fractura/no fractura, benigno/maligno)
- **Regresion:** valores continuos (probabilidad de supervivencia)

> **Salud prefiere supervisado** porque permite validacion cientifica y explicabilidad.

### Redes neuronales y Deep Learning

- **Perceptron:** unidad basica. Analogia: dendrita (input) → soma (proceso) → axon (output)
- **Deep Learning:** multiples capas ocultas. Mas precision pero **menor explicabilidad** ("un hechicero lo hizo")
- Las **capas ocultas** son la razon tecnica por la que un algoritmo puede acertar pero no explicar por que

### LLMs (Large Language Models)

| Concepto | Definicion |
|---|---|
| Embeddings | Representacion numerica de palabras. Palabras similares → cerca en espacio matematico |
| Mecanismo de atencion | Usa contexto de otras palabras para desambiguar ("banco" financiero vs rio) |
| "Attention is All You Need" | Paper Google 2017 que introdujo los **transformers**. Hizo posibles los LLMs |
| GPT | **G**enerative **P**re-trained **T**ransformer |
| Temperatura | Baja: predecible. Alta: creativo |
| LLM = "calculadora de palabras" | Procesa palabras y genera respuesta estadisticamente probable. No piensa |

### Limitaciones de los LLMs (MUY probable en examen)

1. **No tienen conocimiento real del mundo** — solo saben lo del entrenamiento
2. **No tienen emociones ni conciencia**
3. **Alucinaciones** — respuestas incorrectas con total confianza
4. **Dependen de la calidad de los datos**
5. **Privacidad** — informacion ingresada puede quedar almacenada

### Ciclo de Gartner (Hype Cycle)

Lanzamiento → **Pico de expectativas** → **Abismo de desilusion** → Meseta de productividad

> La IA generativa HOY esta en el **pico**. El abismo es inevitable.

### Ley de Moore

Poder de computo se duplica aprox cada ano. Explica por que los saltos en IA son recientes.

### IA Tradicional vs IA Generativa

| | IA Tradicional | IA Generativa |
|---|---|---|
| Datos | Miles/millones (acotado) | Billones de tokens |
| Output | Clasificacion/prediccion (un valor) | Texto, imagen, video (secuencia) |
| Ejemplo en salud | Detectar fractura en Rx | Escribir evolucion de HC |

### Aplicaciones reales HOY

| Area | Detalle |
|---|---|
| **Imagenes medicas** | Mayor desarrollo real: Rx, TC, RMN, patologia. Apoyo (no reemplazo) |
| **Procesos administrativos** | Donde MAS se usa: facturacion, auditoria, gestion |
| **Documentacion clinica** | LLMs automatizan evolucion de HCE → libera ~50% tiempo administrativo |
| Woebot | Chatbot para salud mental (screening depresion + TCC) |
| Human-in-the-loop | Chatbot + humano segun necesidad. Sistema hibrido |
| Consensus | Herramienta que analiza si hay consenso en literatura cientifica |

### Criterios para incorporar IA clinica

| Criterio | Pregunta |
|---|---|
| Valor clinico real | Cambia lo que voy a hacer con el paciente? |
| Explicabilidad | Puedo entender por que llego a ese resultado? |
| Eficacia demostrada | Mejora resultados de salud? |
| Seguridad | Riesgos conocidos y manejables? |
| Equidad | Funciona igual en distintas poblaciones? |
| Integracion al flujo | Se diseno para el flujo real de trabajo? |

> "La tecnologia en si misma no es un valor. Implementar algo solo porque es tecnologico no es razon suficiente."

### Regulacion — DiGA (modelo aleman)

- Evaluacion de apps como medicamentos: validacion clinica, prescripcion medica, cobertura por sistema de salud
- ~50 apps aprobadas. Alemania y UK lideran. Argentina no tiene este debate

### Casos emergentes

- **Diabetes tipo 2 en placa de torax:** algoritmo no supervisado detecto DM2 sin que nadie lo indicara (grasa pericardica)
- **Fraccion de eyeccion en placa de torax:** detectaria insuficiencia cardiaca (hoy requiere ecocardiograma)

### Citas clave

> "La IA no va a reemplazar a los profesionales sanitarios, pero aquellos que utilicen IA van a reemplazar a los que no." — Giunti

> "Siempre leer el abstract original. Los titulares sobre IA distorsionan en ambas direcciones."

---

## MODULO V — Big Data y Analisis de Datos en Salud

### Analisis de datos NO es nuevo

- **John Snow** (~1854): mapa de colera en Londres → cerro bomba de agua de Broad Street. **Padre de la epidemiologia moderna**
- **Valentine Seaman** (1797): primer mapa epidemiologico (fiebre amarilla, Nueva York)
- Lo nuevo es la **cantidad de datos digitales**, no el concepto

### Ciencia de datos

Campo interdisciplinario: **estadistica + programacion + dominio (salud) + comunicacion**

### Big Data — 3 V

| V | Significado |
|---|---|
| **Volumen** | Cantidad masiva de datos |
| **Variedad** | Tipos diversos (estructurados, no estructurados, semi-estructurados) |
| **Velocidad** | Rapidez de generacion y procesamiento |

### Tipos de datos

| Tipo | Caracteristica | Ejemplo |
|---|---|---|
| Estructurados | Modelo predefinido, campos etiquetados | Peso, talla, diagnosticos codificados |
| No estructurados | Sin modelo | Texto libre, fotos, documentos |
| Semi-estructurados | Formato parcial + texto libre | Informes de lab, informes de imagenes |

### Tipos de analisis

| Tipo | Pregunta que responde | Ejemplo |
|---|---|---|
| **Descriptivo** | Que paso / que pasa | Dashboards, curvas epidemiologicas |
| **Diagnostico** | Por que paso | Relacion causal |
| **Predictivo** | Que va a pasar | Anticipacion, prevencion, ML |
| **Prescriptivo** | Que hacer | CDSS, soporte a decisiones. Requiere supervision humana |

### Sesgos (IMPORTANTE — probable en examen)

| Sesgo | Que es |
|---|---|
| De seleccion | Muestra no representativa |
| De informacion | Datos inexactos o incompletos |
| De publicacion | Solo se publican resultados positivos |
| De confusion (confounding) | Variable externa no controlada afecta resultados |
| De supervivencia | Solo analiza los que completaron, no los que abandonaron |
| De observador | Investigador influye por expectativas (solucion: doble ciego) |
| De recuerdo | Participantes no recuerdan con precision (estudios retrospectivos) |
| **De automatizacion** | Medicos confian demasiado en IA sin cuestionar |

### ML en contexto de datos de salud

- **Conjunto de entrenamiento:** ~70% de datos → el modelo aprende
- **Conjunto de validacion:** ~30% de datos → se evalua precision
- **Matriz de confusion:** VP, FP, VN, FN
- **Datos desbalanceados:** si una categoria tiene muchos mas casos, el modelo falla en la minoritaria

### Graficos clave

| Grafico | Para que sirve |
|---|---|
| Curva ROC | Rendimiento de test diagnostico (sensibilidad vs especificidad) |
| Kaplan-Meier | Supervivencia: proporcion de pacientes vivos en el tiempo |
| Curva acumulada | **Nunca desciende** (es acumulativa). No confundir con incidencia |
| Curva de incidencia | Casos nuevos por periodo. Esta SI sube y baja |

### Otros conceptos

| Concepto | Clave |
|---|---|
| Anonimizacion | Desvincular datos de identidad. Obligatorio en ciencia de datos en salud |
| Datos sensibles | Datos personales de salud protegidos por ley |
| Alfabetizacion en datos (Data Literacy) | Explorar, interpretar y comunicar datos |
| CDSS | Clinical Decision Support System. Analisis prescriptivo supervisado |
| CPCSSN | Red canadiense de vigilancia centinela en atencion primaria |
| Ajuste por edad | Necesario para comparar mortalidad entre poblaciones con distinta demografia |
| Medicina personalizada | Tratamientos ajustados al perfil genetico. Imposible sin analisis de datos |

---

## MODULO VI — Contexto Historico, Aplicaciones y Etica (Repaso integrador)

> Este modulo es integrador — repasa conceptos de modulos anteriores con mayor profundidad en etica y aplicaciones.

### Conceptos que refuerza

- **Salud Digital** como termino paraguas mas amplio y facil de identificar
- **Evolucion historica:** informatica medica (1950s) → eSalud (1990s) → mSalud (2000s) → salud digital (actual)
- **Sistema de informacion ≠ software** (4 pilares)
- **HCE:** ventajas sobre papel (acceso simultaneo, centralizacion, portabilidad, explotacion de datos)

### Aplicaciones practicas (refuerzo de casos)

| Caso | Dominio | Aporte |
|---|---|---|
| Kaiser Permanente | HCE | Coordinacion, elimina duplicacion, acceso en tiempo real |
| Garrahan | Telemedicina | Conecta especialistas con hospitales remotos en Argentina |
| Apple Watch | mSalud | Deteccion AFib con sensores + ML → diagnosticos reales |
| BlueDot | Big Data | Detecto COVID analizando noticias, reportes, datos de vuelos |

### Impacto social y etico (profundizado)

**Transformacion del rol medico:**
- De decisiones basadas en experiencia → decisiones **basadas en datos y IA**
- Requiere nuevas competencias digitales

**Relacion medico-paciente:**
- Pacientes mas empoderados con sus propios datos (wearables, apps)
- Riesgo: malinterpretacion de informacion sin guia profesional
- Telemedicina: mejora acceso pero pierde senales no verbales y examen fisico

**Privacidad y seguridad:**
- GDPR (Europa), HIPAA (EEUU)
- Datos de salud = especialmente sensibles
- Encriptacion y sistemas de seguridad robustos son esenciales
- Riesgo de ciberataques a instituciones de salud

**Brecha digital:**
- No todos acceden igual → profundiza desigualdades
- Soluciones: subsidios, apps offline, apps para telefonos antiguos, programas de educacion digital
- Politicas publicas deben promover interoperabilidad y acceso equitativo

**Sesgos en IA (refuerzo):**
- Algoritmos entrenados con datos de poblaciones blancas → menos precisos en otras etnias
- Uso de big data para predecir salud futura → puede afectar acceso a seguros

**Responsabilidad:**
- Si IA comete error diagnostico: medico, desarrollador o institucion?
- No hay consenso. Se necesitan marcos de responsabilidad y **transparencia**

---

## Cheat Sheet — V/F mas probables

| Afirmacion | Respuesta | Por que |
|---|---|---|
| Big data no plantea ningun desafio etico | **FALSO** | Absoluto ("ningun") + sesgos, privacidad, autonomia |
| La telemedicina solo es videollamada | **FALSO** | Absoluto ("solo") + incluye monitoreo remoto, store-and-forward |
| mSalud y eSalud son sinonimos | **FALSO** | mSalud es subconjunto de eSalud |
| Las apps de mSalud pueden enviar recordatorios de medicamentos | **VERDADERO** | Mencionado explicitamente en el libro |
| La brecha digital puede exacerbar desigualdades en salud | **VERDADERO** | Tema central de multiples modulos |
| La IA actual puede realizar cualquier tarea humana | **FALSO** | Solo existe IA estrecha. IA general no existe |
| Los LLMs tienen conocimiento real del mundo | **FALSO** | Solo saben lo del entrenamiento. No tienen experiencias |
| Los LLMs pueden cometer errores con total confianza | **VERDADERO** | Alucinaciones — predicen, no razonan |
| El DCH es un proceso de 5 fases lineales | **FALSO** | Es ITERATIVO, no lineal |
| Un error de uso es culpa del usuario | **FALSO** | Es culpa del diseno del dispositivo |
| La HCE es el papel en formato digital | **FALSO** | Tiene funcionalidades que el papel no tiene |
| La IA va a reemplazar a los medicos | **FALSO** | La IA es herramienta, no reemplazo |
| El aprendizaje supervisado usa datos etiquetados | **VERDADERO** | Definicion directa |
| El aprendizaje no supervisado puede descubrir patrones inesperados | **VERDADERO** | Ej: diabetes en placa de torax |
| Un sistema de informacion es solo software | **FALSO** | Hardware + Software + Procesos + Personas |
| La telemedicina es anterior al COVID | **VERDADERO** | Pre-digital, COVID fue catalizador |
| DTx requieren aprobacion regulatoria | **VERDADERO** | reSET (FDA), a diferencia de apps de bienestar |
| John Snow descubrio el Vibrio cholerae | **FALSO** | No conocia la bacteria. Uso analisis geoespacial |
| Los datos de salud son especialmente sensibles | **VERDADERO** | Requieren proteccion especial (GDPR, HIPAA) |
| La IA generativa es lo que se usa en diagnostico clinico hoy | **FALSO** | Se usa IA tradicional (ML supervisado) |

---

## Glosario express — Terminos que aparecen una sola vez pero pueden caer

| Termino | Que es |
|---|---|
| Store-and-forward | Asincronica: enviar datos para revision posterior |
| Telestroke | Teleconsulta critica en ACV |
| CGM | Sensor de glucosa continuo |
| MySugr | App monitoreo glucosa |
| reSET | DTx abuso de sustancias (FDA) |
| Deprexis | DTx depresion |
| SDLC | Software Development Life Cycle |
| MVP | Minimum Viable Product |
| HTA | Health Technology Assessment |
| Woebot | Chatbot salud mental (TCC) |
| Consensus | Herramienta: analiza consenso en literatura cientifica |
| RLHF | Reinforcement Learning from Human Feedback |
| Boti | Chatbot de CABA |
| CPCSSN | Red canadiense vigilancia centinela |
| VEF1 | Volumen espiratorio forzado en 1 segundo (EPOC) |
| Curva ROC | Sensibilidad vs especificidad |
| Kaplan-Meier | Grafico de supervivencia |
| SVM | Support Vector Machine |
| Perceptron | Unidad basica de red neuronal |
| Transformer | Arquitectura base de LLMs (paper "Attention is All You Need", 2017) |
