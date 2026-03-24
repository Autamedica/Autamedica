# Modulo V — Big Data y Analisis de Datos en Salud

> Catedra Libre de Salud Digital, FMED UBA
> Fuentes: Clase 1 (Marina Ridao) + Clase 2 (Ignacio Gamez) + Recursos y Materiales V (libro) + Entrevistas (Najun Dubos, Baum, Giussi, Pedernera)

---

## 1. El analisis de datos NO es nuevo en salud

El uso de datos para tomar decisiones en salud publica existe hace siglos. Lo que cambio es la **cantidad de datos digitales disponibles** — no el concepto en si.

### Analisis geoespacial: los origenes de la epidemiologia

| Quien | Ano | Donde | Enfermedad | Que hizo |
|---|---|---|---|---|
| **Valentine Seaman** | 1797 | Nueva York | Fiebre amarilla | Mapeo direcciones de muertos. Concluyo que la causa eran "efluvios putrefactos" (desagues, basura). Impulso medidas de higiene sin conocer la causa especifica |
| **Thomas Shapter** | 1832 | Inglaterra | Colera | Localizo muertes individuales en un mapa. Planteo hipotesis sobre causas a partir de la distribucion espacial |
| **Rothenburg** | 1832 | Hamburgo, Alemania | Colera | Uso color rojo coloreado a mano: mas intenso = mas casos. Relaciono la distribucion con desagues cloacales y red de agua potable |
| **John Snow** | ~1854 | Londres | Colera | Mapa de barritas negras apiladas por zona. Descubrio que los casos se concentraban cerca de la bomba de agua de Broad Street. Hospederia (otra fuente de agua) y cerveceria (no tomaban agua) tenian pocos casos. Convenció a las autoridades de cerrar la bomba — **sin conocer el Vibrio cholerae** |

> John Snow es considerado el padre de la epidemiologia moderna. Su metodo: analisis descriptivo geoespacial → hipotesis → intervencion basada en evidencia observacional.

### Antes vs ahora

| Aspecto | Siglo XIX | Actualidad |
|---|---|---|
| Dificultad principal | **Recolectar** datos (manual, entrevistas, registros de muerte) | **Procesar** datos (volumen masivo, variedad, velocidad) |
| Almacenamiento | No existia o papel | Digital (HCE, labs, dispositivos, apps) |
| Alcance | Local, laborioso | Global, en tiempo real |
| Herramientas | Mapas a mano, conteo manual | Software, algoritmos, dashboards |

---

## 2. Ciencia de datos — Definicion

Campo **interdisciplinario** que combina cuatro pilares:

```
         Estadistica
              |
Programacion --+-- Dominio de salud
              |
        Comunicacion
```

- **Estadistica**: tecnicas de analisis, modelos, inferencia
- **Programacion**: herramientas para procesar datos a escala
- **Dominio de salud**: conocimiento clinico/epidemiologico para interpretar correctamente
- **Comunicacion**: habilidad para presentar resultados de forma comprensible

> Sin comunicacion, el analisis queda en una computadora. Sin dominio de salud, las conclusiones pueden ser erroneas.

### Alfabetizacion en datos (Data Literacy)

Capacidad de **leer, entender, analizar y comunicar datos** de manera efectiva. Equivalente a la alfabetizacion convencional (lectura/escritura) pero para datos — indispensable en un mundo impulsado por informacion.

En medicina: interpretar datos clinicos, reconocer patrones, evaluar calidad de los datos, tomar decisiones basadas en evidencia cuantitativa en lugar de solo intuicion o experiencia.

#### Por que es importante en medicina (libro)

1. **Mejora en toma de decisiones clinicas** — interpretar biomarcadores, pruebas genomicas, estudios de imagenes para ajustar tratamiento individual
2. **Comprension de estudios cientificos** — evaluar validez y aplicabilidad de analisis avanzados en papers
3. **Integracion con herramientas tecnologicas** — HCE, wearables, IA generan y dependen de datos; saber como se procesan
4. **Colaboracion interdisciplinaria** — comunicarse con data scientists, ingenieros biomedicos, bioinformaticos
5. **Decisiones en salud publica** — la pandemia demostro que datos en tiempo real permiten respuesta mas eficiente

#### Componentes clave (libro)

| Componente | Que implica | Ejemplo medico |
|---|---|---|
| **Estadistica basica** | Promedio, mediana, desviacion estandar, correlacion, regresion | Evaluar si diferencias en resultados clinicos son significativas o aleatorias |
| **Interpretacion de visualizaciones** | Leer graficos, tablas, diagramas correctamente | Curvas ROC, graficos de Kaplan-Meier, diagramas de dispersion |
| **Sesgo y calidad de datos** | Reconocer datos sesgados o incompletos | Muestra pequena no representativa, errores de medicion en wearables |
| **Herramientas tecnologicas** | Uso basico de software para procesar datos | Excel, software estadistico, apps de analisis clinico |

> No se trata de saber programar, sino de tener **base suficiente para interpretar criticamente**.

#### Ejemplo de la pandemia (falta de alfabetizacion, clase)

- Curva de **casos acumulados** → mucha gente esperaba que "bajara", pero por definicion **nunca desciende** (es acumulativa)
- La que sube y baja es la curva de **incidencia** (casos nuevos diarios/semanales)
- Tasas de mortalidad entre provincias publicadas **sin ajustar por edad** → CABA parecia tener la tasa mas alta del pais, pero era por su estructura demografica (mas adultos mayores). Para comparar hay que **ajustar por edad**

---

## 3. Big Data — Definicion y las 3 V

Big Data = datos que nuestra sociedad crea y procesa digitalmente, caracterizados por:

| V | Significado | Ejemplo en salud |
|---|---|---|
| **Volumen** | Cantidad masiva de datos | Millones de registros de HCE de un sistema de salud |
| **Variedad** | Diferentes tipos y formatos | Labs + imagenes + texto libre + dispositivos wearables |
| **Velocidad** | Ritmo al que se generan | Monitoreo en tiempo real en terapia intensiva |

**Lo que distingue al Big Data:** no se puede procesar con herramientas convencionales (no entra en un Excel, las computadoras domesticas no alcanzan). Requiere tecnicas de procesamiento sofisticadas.

### Fuentes de datos digitales en salud

- Historia clinica electronica (HCE)
- Estudios de diagnostico (laboratorio, ecografias, Rx)
- Prescripcion y dispensa de medicamentos
- Dispositivos de cuidado domiciliario (wearables, apps, relojes)
- Registros administrativos (turnos, facturacion)

---

## 4. Tipos de datos

### Estructurados

Tienen un **modelo definido** o provienen de un campo determinado en un registro.

- Campo "problema" en la HCE con lista desplegable predefinida (dato etiquetado)
- Peso, talla, presion arterial → campos especificos con formato numerico
- Faciles de procesar y analizar

### No estructurados

**No tienen modelo predefinido** ni organizacion predeterminada.

- Texto libre en la evolucion de la HCE (el profesional escribe lo que quiere)
- Fotografias, documentos escaneados, notas de voz
- Imagenes medicas (resonancias, tomografias), videos de procedimientos
- **Desafio importante en salud**: extraer informacion util de campos no estructurados requiere tecnicas especializadas (NLP, reconocimiento de imagenes)

### Semi-estructurados (solo en libro)

A medio camino entre los dos anteriores: **siguen cierto formato pero contienen texto libre** que requiere interpretacion.

- Informes de laboratorio (tienen campos fijos + comentarios del bioquimico)
- Informes de imagenes (formato estandar + descripcion libre del radiologo)

> El libro agrega esta tercera categoria. La clase solo menciono estructurados y no estructurados.

---

## 5. Tipos de analisis de datos

| Tipo | Pregunta que responde | Ejemplo en salud |
|---|---|---|
| **Descriptivo** | Que paso / que esta pasando | Dashboard de casos COVID por region. Mapa de John Snow |
| **Diagnostico** | Por que paso | Analisis causal: por que aumentaron los casos en tal zona |
| **Predictivo** | Que va a pasar | Predecir zonas con mas accidentes de transito → optimizar ubicacion de ambulancias |
| **Prescriptivo** | Que deberiamos hacer | Sistema de soporte a decisiones clinicas que sugiere tratamiento basado en datos del paciente |

### Detalle importante

- **Descriptivo** → fuente de hipotesis. John Snow describio la distribucion de casos y a partir de ahi planteo: "sera el agua?"
- **Predictivo** → fundamental en salud porque el objetivo es **anticiparse** y prevenir
- **Prescriptivo** → aparece en **sistemas de soporte a toma de decisiones (CDSS)**. Siempre debe estar supervisado por un humano (human-in-the-loop)

---

## 6. Datos sensibles y anonimizacion

Los datos de salud son **datos sensibles** por definicion legal: datos personales que revelan condiciones de salud, origen etnico, afiliacion sindical, sexualidad, religion.

### Proteccion legal (Argentina)

- Ley de proteccion de datos personales
- Derechos de paciente → confidencialidad obligatoria

### Anonimizacion

Para proyectos de ciencia de datos, los datos deben ser **anonimizados**: no todas las personas del equipo deben poder asociar diagnosticos a personas. La informacion clinica vinculada a identidad es confidencial.

### Equipos multidisciplinarios

Los datos de salud requieren **conocimiento amplio del dominio** para su correcta interpretacion. Problema comun: equipos con gran capacidad en estadistica y programacion pero **escaso conocimiento en salud publica** → conclusiones erroneas.

> Regla: siempre configurar equipos multidisciplinarios (data scientists + profesionales de salud) para proyectos de ciencia de datos en salud.

---

## 7. Por que los medicos necesitan entender ciencia de datos (libro)

No se trata de convertirse en data scientist, sino de comprender lo suficiente para:

1. **Toma de decisiones informada** — Los medicos estaran cada vez mas expuestos a informes generados por algoritmos de IA. Entender como se generan permite interpretar mejor los resultados
2. **Comunicacion con otros profesionales** — Colaborar con ingenieros, data scientists y bioinformaticos en equipos multidisciplinarios requiere hablar un lenguaje comun
3. **Medicina basada en la evidencia** — La ciencia de datos permite analizar grandes volumenes de estudios clinicos en minutos, actualizando guias clinicas con el mejor conocimiento disponible

### Medicina impulsada por datos (Data-Driven Medicine)

Concepto del libro: estamos en una era donde **cada aspecto de la atencion medica se beneficia del analisis avanzado** — desde terapias personalizadas hasta prediccion de brotes. Pero esto trae desafios eticos y de privacidad al manejar informacion sensible a gran escala.

---

## 8. Aplicaciones de ciencia de datos en salud

### Areas principales

- **Genomica** — analisis de datos geneticos
- **Analisis de imagenes** — radiologia, patologia
- **Sistemas de soporte a decisiones (CDSS)** — recomendaciones clinicas
- **Descubrimiento de drogas** — farmacologia computacional
- **Analisis predictivo** — anticipar eventos clinicos y epidemiologicos
- **Gestion de servicios** — donde MAS se ha explotado: automatizacion de tareas administrativas, agendamiento, recordatorios, mantenimiento predictivo de equipos

### Ejemplos concretos

**Tablero COVID del MHSS (Argentina):**
- Evoluciono en el tiempo: empezo con monitoreo de casos por region
- Agrego mapas georreferenciados (estilo John Snow) y coropletas (prevalencia por zona)
- Incorporo datos de vacunacion
- Gran trabajo en **visualizacion**: categorias claras, escalas, colores semanticos (verde = mejora, rojo = empeora)

**Deteccion de brotes a partir de HCE:**
- Usando datos de vivienda, empleo y lengua materna de la HCE → identificar brotes potenciales en comunidades
- El estudio documento las dificultades: datos no correctamente geocodificados, supuestos que no siempre son ciertos

**Mapa de COVID de Corea del Sur:**
- Publico, georreferenciado
- Mostraba localizacion del diagnostico + tiempo desde diagnostico (escala de colores para progresion)

**Tablero de Hong Kong:**
- Inicialmente muy detallado: edad, sexo, fecha de hospitalizacion, georreferencia domiciliaria, estado (confirmado/descartado/fallecido/hospitalizado)
- Permitia abordaje territorial
- Problema: **confidencialidad** → fue modificado, actualmente solo geoposiciona casos sin informacion detallada

**Proyecto de laboratorio de innovacion (UBA):**
- Estudiantes de medicina + alumnos de posgrado en ciencia de datos
- Tablero de seguimiento de COVID en **trabajadores de la salud**
- Aprendieron Git/GitHub, visualizacion, trabajo colaborativo remoto

**Vigilancia epidemiologica de dengue:**
- Deteccion de clusters a partir de notificaciones
- Fundamental para **acciones de control local** y deteccion temprana de brotes

**Red canadiense de vigilancia centinela (CPCSSN):**
- Extrae datos anonimizados de HCE de atencion primaria de todo el pais
- Aplica algoritmos de limpieza, codificacion y estandarizacion
- Transforma datos crudos de HCE en informacion util para vigilancia de enfermedades cronicas e investigacion

### Gestion de servicios y analisis predictivo

- Prediccion de **ausentismo a turnos** (quien tiene mas probabilidad de faltar)
- **Deterioro temprano en terapia intensiva** (indicios a partir de datos de monitoreo)
- **Mantenimiento predictivo** de equipos de diagnostico
- Optimizacion de ubicacion de ambulancias basada en prediccion de accidentes

> Estado actual: mucha aplicacion en gestion/administrativo, en desarrollo para aplicaciones clinicas directas.

---

## 9. Machine Learning en salud (Clase 2, Gamez)

### Que es Machine Learning

Rama de la inteligencia artificial. Se entrena un algoritmo para que **aprenda patrones a partir de datos** usando modelos matematicos y estadisticos que ajustan sus parametros para minimizar errores de prediccion.

> "Machine learning no es nada mas que estadistica. No hay magia detras." — Gamez

**Diferencia clave con programacion tradicional:**
- Tradicional: le decis paso a paso que hacer ("si glucosa > X → diabetes")
- ML: le das muchos datos con resultados → el modelo **aprende solo** las reglas

**Por que ahora es posible:**
1. **Mas datos disponibles** — HCE, wearables, dispositivos, compras online
2. **Mas poder de computo** — lo que en 1980 tardaba horas, hoy tarda segundos
3. **Algoritmos mejorados y accesibles** — comunidad abierta, foros, herramientas

### Aprendizaje supervisado vs no supervisado

| Tipo | Como funciona | Ejemplo |
|---|---|---|
| **Supervisado** | Se le dan datos + variable objetivo (etiqueta). Aprende a predecir esa variable | Predecir si paciente tiene insuficiencia cardiaca (si/no) a partir de IMC, TA, colesterol |
| **No supervisado** | Se le dan datos SIN etiqueta. Busca similitudes y agrupa automaticamente | Agrupar pacientes con cierta enfermedad segun caracteristicas en comun → descubrir factores de riesgo |

### Regresion vs Clasificacion (dentro de supervisado)

| Tipo | Que predice | Ejemplo |
|---|---|---|
| **Regresion** | Un valor numerico continuo | VEF1 en litros, riesgo cardiovascular en %, dosis de farmaco en mg |
| **Clasificacion** | Una categoria | Tumor benigno/maligno, diabetico si/no, riesgo Alzheimer alto/medio/bajo |

### Flujo de entrenamiento paso a paso

```
Dataset (ej: 10,000 pacientes con sus caracteristicas + resultado)
    |
    ├── 70% → Conjunto de ENTRENAMIENTO
    |         Se le dan datos CON la variable objetivo
    |         El modelo aprende las relaciones
    |         → Modelo entrenado
    |
    └── 30% → Conjunto de VALIDACION
              Se le dan datos SIN la variable objetivo
              El modelo predice → se compara con el resultado real
              → Metricas de rendimiento
```

**Ejemplo concreto (VEF1):**
- Variable: anos fumando → predecir VEF1 (volumen espiratorio forzado en 1 segundo)
- Regresion lineal simple: una recta que pasa lo mejor posible por todos los puntos
- Con mas variables (edad, sexo, medicacion, ejercicio) → regresion lineal multiple → mejor prediccion
- Mientras mas variables relevantes, mejor predice el modelo

### Metricas de evaluacion

Para clasificacion:
- **Precision** — de los que dijo positivos, cuantos realmente lo eran
- **Sensibilidad** — de los que realmente eran positivos, cuantos detecto
- **Matriz de confusion** — tabla que compara predicciones vs resultados reales (verdaderos positivos, falsos positivos, verdaderos negativos, falsos negativos)

### Modelos de ML (no solo regresion lineal)

- **Regresion lineal** (simple y multiple) — predecir valores continuos
- **Arboles de decision** — se ramifican como algoritmos clinicos (si tiene X → si/no → siguiente pregunta)
- **SVM (Support Vector Machine)** — linea que separa categorias (ej: diabetico vs no diabetico)
- Hay muchos mas. Ninguno es "el mejor" en general — se prueban varios y se elige el que mejor resultado da para cada caso

### Problemas y limitaciones

| Problema | Descripcion |
|---|---|
| **Calidad de datos** | Si los datos de entrada son malos (tensiómetros descalibrados, IMC mal registrado), el modelo predice cualquier cosa |
| **Sesgo poblacional** | Modelo entrenado con noruegos puede no funcionar en Argentina — genetica, dieta, estilo de vida diferentes |
| **Variables irrelevantes (ruido)** | Meter datos que no tienen relacion con la variable a predecir (ej: color de pelo para insuficiencia cardiaca) ensucia el modelo |
| **Datos desbalanceados** | Si hay 1 millon de "no" y solo 10 "si", el modelo detecta bien los "no" pero falla en los "si" |
| **Sesgo de automatizacion** | Medicos confian demasiado en la IA sin cuestionar. La IA puede equivocarse |
| **Explicabilidad (caja negra)** | A veces no sabemos como el modelo llego a su resultado — no se pueden explicar las relaciones internas |
| **Etica** | Privacidad de datos del paciente, consentimiento informado, responsabilidad si el algoritmo se equivoca |

### Mensaje central de Gamez

> "Los algoritmos no van a reemplazar a los profesionales de salud, pero si van a transformar la forma en que trabajamos. No podemos ser usuarios pasivos."

Tres acciones para profesionales de salud:
1. **Aprender lo basico** — no hace falta ser programador, pero si entender que estamos usando
2. **Preguntar siempre** — que datos alimentan el modelo, como fue entrenado, que sesgos tiene
3. **Participar** — la voz de los profesionales de salud debe estar presente cuando se disenan sistemas digitales

---

## 10. Tipos de sesgos en datos de salud (libro)

**Sesgo** = error sistematico que afecta la recoleccion, analisis o interpretacion de datos, llevando a conclusiones incorrectas. En medicina es particularmente peligroso porque impacta diagnosticos, tratamientos y calidad de atencion.

| Sesgo | Que es | Ejemplo medico |
|---|---|---|
| **Seleccion** | La muestra no es representativa de la poblacion objetivo | Estudio de un farmaco solo en hombres jovenes → no refleja eficacia en mujeres, ancianos o pacientes con comorbilidades |
| **Informacion (medicion)** | Datos recopilados son inexactos o incompletos | Equipo de laboratorio mal calibrado → diagnosticos erroneos de diabetes |
| **Publicacion** | Solo se publican estudios con resultados positivos/significativos; los negativos se ignoran | Farmaco parece mas eficaz de lo que es porque los estudios sin efecto no se publicaron |
| **Confusion (confounding)** | Variable externa no controlada afecta exposicion Y resultado | "Cafe reduce riesgo cardiaco" pero en realidad los bebedores de cafe fuman menos — la variable confusora es el tabaquismo |
| **Supervivencia** | Solo se analizan los que "sobrevivieron" al proceso, excluyendo los que abandonaron o fallecieron | Estudio de cancer solo con pacientes que completaron tratamiento → sobreestima eficacia (los que abandonaron por toxicidad no cuentan) |
| **Observador (expectativa)** | El investigador influye inconscientemente en los resultados por sus creencias | Ensayo no ciego: medico que sabe que es el farmaco nuevo interpreta resultados mas favorablemente |
| **Recuerdo** | Participantes no recuerdan eventos pasados con precision | Pacientes con cancer recuerdan mas ciertos alimentos que los sanos → distorsiona asociacion dieta-enfermedad |

### Impacto de los sesgos

- **Tratamientos inadecuados** — recetar farmacos basados en evidencia sesgada
- **Desigualdades en atencion** — ensayos solo en ciertos demograficos → tratamientos menos efectivos para mujeres, ancianos, minorias
- **Percepcion distorsionada del riesgo** — mala comprension de riesgo/beneficio afecta toma de decisiones

> Mitigar sesgos: estudios doble ciego, muestras representativas, registrar estudios negativos, controlar variables confusoras, analisis por intencion de tratar (ITT).

---

## 11. Perspectiva de industria — Lucas Najun Dubos (entrevista)

Medico UBA Austral (2006). Nunca hizo residencia ni ejercio asistencial. Carrera: industria farmaceutica 15 anos (I+D, asesoria cientifica, acceso al mercado, marketing, director medico en AbbVie) → Globant (lider practica de salud a nivel mundial). Vive en Madrid.

### Trayectoria no convencional

- En 2006 no existia formacion para medicos que quisieran hacer algo distinto a ver pacientes. "Iba contra la corriente"
- Rompio con la estructura mental de "primero necesitas ser especialista" como validacion externa
- La carrera de medicina no ensena finanzas, branding, marketing personal — habilidades necesarias para el mundo profesional real

### Tres areas de IA en salud (clasificacion por riesgo)

| Area | Madurez | Riesgo | Ejemplos |
|---|---|---|---|
| **Administrativa/operaciones** | Madura, casi commodity | Bajo (no afecta paciente directo) | Fraude en seguros, prediccion de no-show, gestion de quirofanos, procesamiento de reembolsos |
| **Para el paciente** | En desarrollo, frenos regulatorios | Medio (autodiagnostico, tratamiento) | Apps de habitos saludables, engagement digital, terapias digitales (DTx) con outcomes clinicos comprobados |
| **Para el medico (workflow clinico)** | Incipiente, casi nada en escala | Alto (irradian, medican, deciden cursos clinicos) | HCE inteligente que sugiera estudios, CDSS integrado en el flujo diario |

> "Todavia no llegamos ni a lapices de ver IA en el workflow clinico diario en escala." — Najun Dubos

### Por que la IA clinica es tan dificil de implementar

- **Heterogeneidad de datos** — datos no estructurados, fuentes multiples, formatos diferentes
- **Riesgo real** — un error puede irradiar, medicar mal o decidir un curso clinico equivocado
- **Cambio organizacional** — no es solo tecnologia, es change management en instituciones enteras
- **Sesgo de automatizacion** — reportes muestran que medicos "descansan" en el algoritmo y abandonan su criterio
- **Responsabilidad legal** — si el algoritmo se equivoca, quien responde? El medico, el desarrollador, la institucion?
- **Regulatorio** — no hay marco claro para validar y aprobar IA clinica como dispositivo medico

### Terapias digitales (DTx) — concepto emergente

Herramientas digitales que ya logran **outcomes clinicos medibles** en ensayos clinicos: una app + un farmaco genera mejores resultados que el farmaco solo. Trabaja lo integral (cambio de habitos + tratamiento).

> Relevante para AutaMedica: esto es exactamente el modelo de "Clinical AI Pipeline" de la postulacion TRL 3-4.

### Recomendaciones de formacion

1. **IA** (tecnica o funcional) — "no vas a fallar, 40-60% de todo lo que hagas va a tener componente de IA"
2. **Ciencia de datos** — preparar datos, entender pipelines
3. **Diseno de producto / UX** — como se disenan soluciones digitales
4. **Metodologias de implementacion** — gestion de proyectos, change management
5. **Arquitectura de sistemas de informacion en salud** — como encajan las piezas
6. **Networking activo** — LinkedIn, contactar gente, no esperar que te busquen. "Nadie te va a ir a buscar si vos no levantas la mano"

### Proyectos destacados en Globant

- Hospital referente de LATAM: plataforma digital para **retener talento medico** (no solo patient-centric, tambien employee-centric)
- Operador de 188 hospitales en USA: mejora de **experiencia del paciente** via canales digitales
- Integracion de bases de datos para **vision integral del paciente** + datos predictivos para prevenir riesgos

### Observaciones relevantes para AutaMedica

- El area administrativa/operativa de IA ya esta comoditizada — la oportunidad de diferenciacion esta en el **workflow clinico** (donde casi nadie llego aun)
- Las terapias digitales (DTx) con evidencia clinica son el segmento de mayor crecimiento y valor
- El 95% de los pacientes inicia su consulta online — al paciente le importa rapidez, buen trato y resultado, no el nombre del hospital
- La combinacion medico + tecnologia + ciencia de datos es el perfil mas demandado y menos disponible en el mercado

---

## 12. Perspectiva de gestion publica — Analia Baum (entrevista)

Medica UBA. Residencia en sistemas de informacion en el Hospital Italiano (hace ~25 anos, cuando recien arrancaba la HCE). Carrera: Hospital Italiano (implementacion de HCE desde papel) → sector publico (red de hospitales de Buenos Aires, Direccion Nacional de Sistemas) → organismos internacionales (OPS, Banco Mundial, BID) → vuelta al Hospital Italiano.

### Trayectoria: del dato al impacto poblacional

- Primer contacto con datos en salud: programa de seguimiento de diabeticos. Laboratorio identificaba pacientes con HbA1c elevada via HCE → generaban reporte → convocaban pacientes a programa educativo. **Dato → politica sanitaria → impacto medible**
- Escalo de una institucion → red de hospitales → jurisdiccion → pais → organismos internacionales (OPS, Banco Mundial, BID asesoran ministerios de salud de LATAM y Caribe)
- En cada nivel la complejidad cambia: no es lo mismo un hospital que una red, una provincia que un pais Federal con 350 obras sociales

### Conceptos clave

**Tecnoestructura:** Los que trabajan en informacion/tecnologia en salud son "staff de apoyo" — estan detras del telon, no en el escenario con el paciente. Iluminan, visten, producen. El impacto no es individual sino macro/poblacional.

**"Colgar el estetoscopio":** Duelo que atraviesa el medico que deja lo asistencial. Hace 25 anos decir "soy medico y hago informatica" generaba rechazo social ("para que estudiaste medicina?").

**Desperdicio en salud (30-40%):** La fragmentacion del sistema argentino genera costos enormes: estudios repetidos porque no hay informacion compartida, medicamentos mas caros por desconocimiento de alternativas. Datos integrados reducen desperdicio.

**Tecnologia con proposito:** "Poner tecnologia por tecnologia solo agrega costos innecesarios. El rol nuestro es pensar que valor le aporta la tecnologia a determinado problema sanitario."

**Informacion presente Y ausente:** Con datos podes ver no solo quien esta enfermo sino **quien falta** — ej: ninos nacidos en el hospital que al ano no tienen vacunas obligatorias → salir a buscar esa poblacion para prevencion.

### Estado de la salud digital en Argentina

- **Argentina fue pionera** en formacion (residencia en sistemas de informacion, unica en la region) y marcos de interoperabilidad
- **Heterogeneidad enorme:** provincias avanzadas (Mendoza, Misiones, San Juan, Salta, Cordoba, CABA, Buenos Aires) vs provincias sin buena conectividad
- **Privado mas avanzado** en general, pero publico tiene experiencias muy valiosas
- **Falta una agencia nacional no gubernamental** de salud digital — que sobreviva cambios de gobierno y articule todos los actores (como existe en otros paises)
- Procesos de transformacion digital a nivel pais toman **10-15 anos**; a nivel institucional, **3-4 anos** para ver impacto

### IA como transformacion de la proxima decada

- IA va a transformar formacion Y practica profesional
- Prepararse en terminos legales, eticos y cientificos
- No engancharse con dispositivos especificos (Google Glass tuvo auge y cayo) sino con el **concepto**: automatizar procesos para facilitar toma de decisiones
- Adopcion actual: muy nicho (imagenes en algunos lugares), falta mucho para adopcion generalizada

### Habilidades de supervivencia (no "blandas")

Baum rechaza el termino "soft skills" porque le baja importancia. Propone **"habilidades de supervivencia"**:
- Trabajo en equipo interdisciplinario
- Escucha activa, agilidad, no frustrarse
- Entender que la transformacion es un proceso iterativo y largo
- Liderazgo compasivo
- Gestion del cambio (change management)
- Metodologias agiles (ciclos cortos, no planificacion estrategica a 5 anos)

### Observaciones relevantes para AutaMedica

- El modelo de **dato → politica sanitaria → impacto medible** es exactamente lo que el Clinical AI Pipeline debe demostrar para TRL 3-4
- El **30-40% de desperdicio** en salud por falta de integracion de datos es un argumento cuantificable para la narrativa tecnica de la postulacion
- La ausencia de una **agencia nacional de salud digital** en Argentina = oportunidad de mercado para plataformas privadas que llenen ese vacio de integracion
- Los **3-4 anos para ver impacto institucional** es el timeline que deberia reflejarse en el plan de trabajo de la postulacion
- El enfoque de "tecnologia con proposito" (no tecnologia por tecnologia) es exactamente lo que la Agencia I+D+i evalua en "relevancia del problema" (35 pts en la matriz TRL 3-4)

---

## 13. Perspectiva de implementacion — Maria Victoria Giussi (entrevista)

Medica de familia. Residencia en informatica en salud (Hospital Italiano, post-basica). Carrera: asistencial → Hospital Italiano → informatizacion del sistema publico de Buenos Aires (100+ efectores) → actualmente **lider de telemedicina en Sancor Salud** (prepaga) + asesora del Ministerio de Salud de CABA.

### De la asistencia a la gestion

- Estando en consultorio vio que el sistema era deficiente: "podemos tener los mejores sanitaristas de la region pero si los que toman decisiones no tienen informacion correcta, oportuna y estandarizada, como gestionan?"
- Ejemplo que le hizo click: como sabemos cuantos hipertensos hay que en 10-20 anos van a necesitar dialisis si no tenemos datos integrados para programar recursos?
- Se formo en informatica en salud pensando que el sector publico tardaria 10 anos en digitalizarse. Tardo 2.

### Proyecto destacado: autogestion de turnos en el sistema publico de CABA

**Problema:** +100 efectores publicos (hospitales + centros de atencion primaria). Turnos solo via call center (pocos disponibles) o presencial (filas desde las 3 AM, lluvia o sol). Inequidad total vs sector privado.

**Solucion:** Chatbot conversacional para autogestion de turnos (sacar, cancelar, confirmar asistencia, encuesta post-turno). La tecnologia existia — el gobierno de CABA ya tenia chatbot para otros tramites.

**Lo dificil NO fue la tecnologia** sino:
- Reorganizar TODO el sistema de turnos de +100 efectores
- Redistribuir horas profesionales (internacion vs consultorio)
- Parametrizar agendas de toda la cartilla
- Reformar salas de espera, implementar llamadores
- Ganar credibilidad (proyectos anteriores habian fracasado)
- **Implementacion siempre in situ** — el equipo ponia el cuerpo en cada efector

**Resultado:** Eliminacion de las filas de madrugada. Mayor equidad y accesibilidad. El sistema publico ofreciendo calidad comparable al privado en gestion de turnos.

**Factor clave:** Ser medica hizo la diferencia — "hablas como par, no como alguien que trae la solucion magica". Baja resistencia, ansiedad e incertidumbre del personal.

### Caso: piloto de IA en mamografias

- IA etiquetaba imagenes mamograficas: sospechosas vs normales
- Generaba lista de trabajo priorizada para los profesionales
- **Sin cambio de proceso:** el informe salia igual en 1 mes (IA solo ayudaba al radiologo, pero el circuito administrativo-paciente seguia igual)
- **Con cambio de proceso completo:** el tiempo bajo de **1 mes a 2 dias**
- Leccion: la IA sola no aporta valor; insertada en un rediseno de proceso completo, transforma

> "La tecnologia sola por si misma, sin tener en cuenta la implementacion dentro de algo mas grande, no aporta gran valor."

### La tecnologia como "buena excusa"

Giussi describe un patron: a veces la tecnologia funciona como **disparador para cambiar procesos** que nadie cuestionaba. No importa si fue la alarma o el camion de basura lo que te desperto — lo importante es que te despertaste y llegaste a donde tenias que llegar.

### Observaciones relevantes para AutaMedica

- Giussi **lidera telemedicina en Sancor Salud** — es exactamente el perfil de potencial cliente/partner de AutaMedica en el segmento de prepagas
- El caso de mamografias (IA + rediseno de proceso = 1 mes → 2 dias) es un **caso de estudio perfecto** para la narrativa tecnica: demuestra que IA clinica sin integracion de proceso no sirve, que es exactamente lo que el Clinical AI Pipeline de AutaMedica busca resolver
- La autogestion de turnos via chatbot en 100+ efectores publicos es un **antecedente directo** del sistema de agendamiento de AutaMedica
- Su experiencia confirma: el diferencial no es la tecnologia (existia) sino la **implementacion con conocimiento clinico** — esto justifica por que AutaMedica (fundada por perfil medico+tech) tiene ventaja sobre competidores puramente tech

---

## 14. Perspectiva de emprendimiento — Federico Pedernera (entrevista)

Medico UBA. Residencia en informatica medica (Hospital Italiano). Carrera: Hospital Italiano → jefe de sistemas en Sanatorio Mater Dei → maestria en sistemas de salud y seguridad social → emprendedor serial en salud digital. Se define como "inconformista" con vision macro (gestion sanitaria, acceso, equidad).

### De la vision macro al emprendimiento digital

- Entro a informatica medica no por la programacion sino por la necesidad de **gestionar salud a escala**: mejorar acceso y equidad requiere sistemas de informacion
- En el Hospital Italiano: primer proyecto fue un "tirador de dados" en PHP para randomizacion en ensayos a doble ciego — reemplazo cajas de sobres de te con un portal intranet
- Luego en Sanatorio Mater Dei: lidero reestructuracion funcional completa como jefe de sistemas

### Epicrisis — HCE inspirada en Gmail + Facebook

Creo una historia clinica electronica para consultorios llamada **Epicrisis** (~2007-2008), con tres conceptos innovadores:

| Inspiracion | Concepto | Aplicacion en HCE |
|---|---|---|
| **Gmail** (encadenamiento de correos por subject) | Atar interacciones a un caso clinico | El paciente es el "subject" — todas las evoluciones se encadenan cronologicamente. Si se desencadena, nace un caso nuevo |
| **Facebook** (muro) | Multiples autores escriben sobre un mismo destinatario | Varios profesionales evolucionan sobre el mismo paciente — como amigos escribiendo en tu muro |
| **E-commerce** (chat popup) | Input sin cambiar de contexto | Evolucion emerge como popup sobre el muro — no se pierde lo que se estaba leyendo |

**Resultado comercial:** fue financiada, presentada en concursos, genero nombre y carrera. Pero **llego demasiado temprano al mercado** — los medicos que usaban Facebook todavia no tenian consultorio propio, no habia demanda real percibida.

### Lecciones de emprendimiento en salud

**Creatividad vs Innovacion (Eduardo Kastika):**
- Creatividad = generar algo nuevo
- **Innovacion = cuando muchas personas lo adoptan** porque lo valoran (estan dispuestas a pagar)
- Una idea creativa NO es innovacion hasta que tiene adopcion masiva

**Time to market:** estar en el momento justo, lugar justo, con propuesta de valor accesible. Pedernera llego ~10 anos antes de que el mercado estuviera listo. Ejemplo: la teleconsulta existia tecnologicamente hace 15 anos, pero no habia codigo de facturacion ni marco legal — recien la pandemia forzo la adopcion.

**Wicked problems (problemas perversos):** la salud es un sistema complejo multidimensional que no tiene solucion unica. No se resuelve desde una sola disciplina — requiere abordaje multidimensional.

**Equipos complementarios vs suplementarios:**
- **Complementarios** → llegan al 100% (cubren lo que al otro le falta)
- **Suplementarios** → superan el 100% (efecto exponencial, multiplican capacidades)
- Para Epicrisis: medico con ideas + medico que sabia programar + programador. Tres cocreadores con roles distintos

**Marketing en salud:** construir marca Y resultado eficaz. No alcanza con marketing — hay compromiso etico ineludible porque atras hay pacientes. Si vos pones tu nombre como medico, no podes discontinuar un servicio el dia que no te convenga economicamente.

### Vision de futuro: agentes de IA (proximos 3 anos)

**Problema central:** crisis de costos en salud + deficit de profesionales dispuestos a estar donde se los necesita. Cada vez mas enfermos, cada vez menos profesionales.

**Apuesta concreta:** asistentes y **agentes de IA** para profesionales y pacientes:
- Agentes que reproducen secuencias de eventos adecuadas a cada persona y situacion
- Eliminar tareas monotanas y repetitivas → liberar al profesional para la **parte humana** (relacion medico-paciente)
- La IA no deshumaniza — al contrario, **recupera la humanizacion** si se usa bien
- Ya esta explorando con Alexa de Amazon como asistente de salud

> "Si surge la IA es para poder recuperar la humanizacion de la salud." — Pedernera

**Terapias digitales (DTx):** la tecnologia ya existe, pero falta el mecanismo de facturacion — el sistema no esta preparado para "recetar una app". Mismo problema de time to market.

### Consejos para estudiantes

1. **No perder la vocacion de servicio** — independientemente de frustraciones y expectativas no cumplidas
2. **Mantener plasticidad** — "como un velero esquivando tormentas, corrigiendo el rumbo pero sin perder el norte"
3. **Seguir deslumbrados (wonderers)** — no subestimar lo que viene de afuera de la salud, traerlo adentro
4. **Lo digital como vehiculo de escala** — no para ser Bill Gates, sino para que lo que hagas llegue a mas gente

### Observaciones relevantes para AutaMedica

- El caso Epicrisis es un **antecedente directo** de lo que AutaMedica construye: HCE digital con vision de acceso y equidad. La diferencia es que AutaMedica llega en el momento correcto (post-pandemia, mercado maduro, facturacion de teleconsulta resuelta)
- La distincion **creatividad vs innovacion** es clave para la postulacion I+D+i: hay que demostrar no solo que es creativo sino que tiene **demanda real y potencial de adopcion masiva**
- Los **agentes de IA** como proxima revolucion en 3 anos valida directamente el Clinical AI Pipeline de AutaMedica — exactamente lo que se propone desarrollar
- El concepto de **equipos suplementarios** (efecto exponencial) es un argumento para la narrativa del equipo en la postulacion: perfil medico + perfil tech = suplementario, no solo complementario
- Su experiencia de time to market fallido en 2007 → refuerza el argumento de que **2026 es el momento correcto** para AutaMedica: pandemia resolvio adopcion de telemedicina, marcos legales avanzaron, IA generativa madura

---

## Sintesis rapida (para parcial)

| Concepto | Definicion clave |
|---|---|
| Ciencia de datos | Campo interdisciplinario: estadistica + programacion + dominio + comunicacion |
| Big Data | Datos con volumen, variedad y velocidad que exceden herramientas convencionales |
| 3 V del Big Data | Volumen, Variedad, Velocidad |
| Datos estructurados | Modelo predefinido, campos etiquetados (peso, talla, diagnosticos codificados) |
| Datos no estructurados | Sin modelo: texto libre, fotos, documentos. Desafio en salud |
| Analisis descriptivo | Que paso / que pasa. Fuente de hipotesis |
| Analisis diagnostico | Por que paso. Relacion causal |
| Analisis predictivo | Que va a pasar. Anticipacion y prevencion |
| Analisis prescriptivo | Que hacer. Soporte a decisiones. Requiere supervision humana |
| Datos sensibles | Datos personales de salud protegidos por ley. Requieren confidencialidad |
| Anonimizacion | Proceso de desvincular datos de la identidad. Obligatorio en proyectos de ciencia de datos en salud |
| Alfabetizacion en datos | Capacidad de explorar, interpretar y comunicar datos efectivamente |
| Data Literacy | = Alfabetizacion en datos (termino en ingles) |
| John Snow | Padre de la epidemiologia moderna. Mapa de colera en Londres. Cerro la bomba de agua |
| Valentine Seaman | 1797, fiebre amarilla en Nueva York. Primer mapa epidemiologico conocido |
| CPCSSN | Red canadiense de vigilancia centinela de atencion primaria |
| Curva de casos acumulados | Nunca desciende (es acumulativa). No confundir con incidencia |
| Incidencia | Casos nuevos por periodo. Esta curva si sube y baja |
| Ajuste por edad | Necesario para comparar tasas de mortalidad entre poblaciones con distinta estructura demografica |
| Equipos multidisciplinarios | Obligatorios en ciencia de datos en salud: data scientists + profesionales de salud |
| CDSS | Clinical Decision Support System. Analisis prescriptivo supervisado por humano |
| Tableros / Dashboards | Herramienta de visualizacion. Clave: categorias claras, colores semanticos, diseno comprensible |
| HCE como fuente de datos | Historia clinica electronica: fuente valiosa pero con desafios (datos no estructurados, geocodificacion incompleta) |
| Datos semi-estructurados | Formato parcial + texto libre (informes de lab, informes de imagenes). Solo en libro |
| Medicina impulsada por datos | Era donde cada aspecto de la atencion medica se beneficia del analisis avanzado |
| Sesgo en datos | Datos sesgados o incompletos → conclusiones erroneas. Muestra chica, errores de medicion |
| Curva ROC | Visualizacion de rendimiento de un test diagnostico (sensibilidad vs especificidad) |
| Kaplan-Meier | Grafico de supervivencia — estima proporcion de pacientes vivos a lo largo del tiempo |
| Medicina personalizada | Tratamientos ajustados al perfil genetico del paciente. Imposible sin analisis de datos |
| Sesgo | Error sistematico en recoleccion/analisis/interpretacion de datos → conclusiones incorrectas |
| Sesgo de seleccion | Muestra no representativa de la poblacion (ej: solo hombres jovenes) |
| Sesgo de informacion | Datos inexactos o incompletos (ej: equipo mal calibrado) |
| Sesgo de publicacion | Solo se publican resultados positivos, los negativos se ignoran |
| Sesgo de confusion | Variable externa no controlada afecta exposicion y resultado (confounding) |
| Sesgo de supervivencia | Solo analiza los que completaron el proceso, no los que abandonaron |
| Sesgo de observador | Investigador influye en resultados por sus expectativas (solucion: doble ciego) |
| Sesgo de recuerdo | Participantes no recuerdan eventos pasados con precision (estudios retrospectivos) |
| Machine Learning | Rama de IA: algoritmo aprende patrones de datos para hacer predicciones. Es estadistica pura |
| Aprendizaje supervisado | Se dan datos + variable objetivo (etiqueta). El modelo aprende a predecir esa variable |
| Aprendizaje no supervisado | Datos sin etiqueta. El modelo busca similitudes y agrupa automaticamente |
| Regresion (ML) | Predice valor numerico continuo (ej: VEF1, riesgo cardiovascular en %) |
| Clasificacion (ML) | Predice una categoria (ej: tumor benigno/maligno, diabetico si/no) |
| Conjunto de entrenamiento | ~70% de los datos, usado para que el modelo aprenda |
| Conjunto de validacion | ~30% de los datos, usado para evaluar que tan bien predice el modelo |
| Matriz de confusion | Tabla que compara predicciones vs resultados reales (VP, FP, VN, FN) |
| Regresion lineal | Modelo basico de ML: recta que mejor pasa por los puntos de datos |
| Arboles de decision | Modelo ML que se ramifica como algoritmo clinico (si/no en cada nodo) |
| SVM | Support Vector Machine: linea/plano que separa categorias |
| Datos desbalanceados | Si una categoria tiene muchos mas casos que otra, el modelo falla en la minoritaria |
| Sesgo de automatizacion | Medicos confian demasiado en IA sin cuestionar. La IA puede equivocarse |
| Explicabilidad (caja negra) | A veces no se puede saber como el modelo llego a su resultado |
| VEF1 | Volumen espiratorio forzado en 1 segundo. Indicador clave de funcion pulmonar (EPOC) |
