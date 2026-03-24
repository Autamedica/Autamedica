# Modulo III — Diseno de Soluciones de Salud Digital

> Catedra Libre de Salud Digital, FMED UBA
> Fuentes: Clase 1 (Lucila Gamen) + Clase 2 (Guido Giunti) + Recursos y Materiales III (libro, 4 caps)

---

## 1. El diseno como problema de seguridad — caso introductorio

**Caso real: Hospital SickKids, Toronto, Canada.**

Una enfermera debe suministrar 0,5 mg de morfina a una paciente de 8 anos a las 2 AM. Programa la bomba de infusion con **5 mg** (10x la dosis). Pasan 15 minutos hasta que otra enfermera detecta el error y resetea la bomba. La paciente se salva.

Investigadores **Katherine DeHarty y Conor McDonald** estudiaron ~4000 casos de errores de medicacion en ese hospital y concluyeron que la causa no fue "descuido humano" sino un **problema de diseno del dispositivo**:

- Los botones `0`, punto decimal y `Enter` estaban demasiado juntos.
- El tamano de los botones no permitia presionar uno solo a la vez.
- Es facil presionar `0` en vez de `.` → 0,5 se convierte en 5.

> Conclusion: el error no fue de la enfermera. Fue del diseno de la bomba de infusion. Esto se denomina **error de uso** (use error).

---

## 2. Que es el diseno

**No es estetica.** El diseno es una forma de **resolver problemas y mejorar experiencias**. El buen diseno es invisible: resuelve problemas de manera tan fluida que no nos damos cuenta de que existia un problema.

### El diseno esta en todo

| Dominio | Ejemplo | Disciplina |
|---|---|---|
| Senaletica urbana | Sistema de senales de Buenos Aires (Ronald Shakespeare) | Diseno grafico/urbano |
| Dispositivos | Celular, electrodomesticos | Diseno industrial |
| Aplicaciones | Instagram, WhatsApp, Spotify | Diseno digital / de servicios |
| Transporte | Autos, bicicletas | Diseno de movilidad |
| Experiencias | Parque de diversiones (filas, recorridos, restaurantes) | Diseno de experiencia |

Cada interaccion cotidiana (el tamano de un boton, el sonido de las teclas, la ubicacion de un restaurante en un parque) fue **pensada por un disenador** con una intencion.

---

## 3. Diseno en el contexto medico

En salud, el diseno no es estetico sino **critico para la seguridad**. Un buen diseno puede ser la diferencia entre un diagnostico correcto y un error peligroso.

### Areas de diseno en salud

| Area | Ejemplo | Impacto |
|---|---|---|
| Arquitectura hospitalaria | Sala de emergencias cerca de la entrada | Eficiencia operativa |
| Dispositivos medicos (industrial) | Bomba de infusion, aguja de insulina, monitor de glucosa | Seguridad del paciente |
| Interfaces digitales | Pantalla del CGM, app del monitor cardiaco | Interpretacion correcta de datos |
| Equipamiento complejo | Resonancia magnetica | Ergonomia del operador |
| Informacion clinica | HCE bien disenada | Reduccion de errores, ahorro de tiempo |
| Telemedicina | Plataformas de seguimiento remoto (ej: iWatch + app cardiaca) | Continuidad del cuidado |

> Una HCE bien disenada permite encontrar informacion tan rapido como usar Google. Una mal disenada causa frustracion, olvidos y errores.

---

## 4. Diseno Centrado en el Humano (DCH)

Tambien conocido como **Design Thinking**. Metodologia que usan los disenadores para **entender las necesidades, contexto y comportamientos** de los usuarios finales. Es un proceso de **5 fases iterativas**:

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ 1.       │    │ 2.       │    │ 3.       │    │ 4.       │    │ 5.       │
  │ ENTENDER │ → │ DEFINIR  │ → │ IDEAR    │ → │PROTOTIPAR│ → │ PROBAR   │
  │          │    │          │    │          │    │          │    │ Y REFINAR│
  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └─────┬────┘
       ↑                                                               │
       └───────────────────── ciclo iterativo ─────────────────────────┘
```

### Fase 1 — Entender (investigacion)

El disenador se convierte en **investigador etnografico**. Busca comprender en profundidad al usuario, su contexto, necesidades y problemas.

Metodos:
- Entrevistas con usuarios (ej: enfermeras de distintos turnos)
- Observacion en contexto real (ej: 24h en UCI)
- Analisis de informes de incidentes
- Revision de estudios cientificos

### Fase 2 — Definir (articular el problema)

De todos los problemas identificados, se selecciona **uno concreto** para resolver.

> Ejemplo: "Las enfermeras necesitan una manera de programar dosis que sea rapida, precisa y a prueba de errores, incluso en situaciones de alto estres y cansancio."

### Fase 3 — Idear (generar soluciones)

Se generan la mayor cantidad de ideas posibles. **No existen malas ideas** en esta fase — se busca cantidad, no calidad.

Ejemplos para la bomba de infusion:
- Interfaz simplificada con menos pasos
- Escaneo de codigo de barras que verifique la dosis automaticamente
- Alerta de voz que confirme la dosis programada

### Fase 4 — Prototipar (MVP)

Se crea una **version basica** (MVP — Minimum Viable Product) de las mejores ideas para poder probarlas.

Formas de prototipado:
- Maquetas en papel de la nueva interfaz
- Prototipo digital interactivo (sin codigo final)
- Maqueta fisica con nuevos botones propuestos

### Fase 5 — Probar y Refinar

Se pone el prototipo a prueba con **usuarios reales en su contexto real**.

- Sesiones de prueba con enfermeras en entorno simulado del hospital
- Observar interacciones, detectar errores de uso
- Recoger feedback → refinar → volver a probar (ciclo iterativo)

> El proceso es **iterativo**: despues de probar se vuelve a entender, definir, idear, prototipar y probar. Cada ciclo mejora la solucion.

---

## 5. Usabilidad y Accesibilidad

Dos aspectos cruciales del diseno en salud, regulados por **estandares ISO** y certificaciones.

### Usabilidad

Que algo sea **facil de usar, eficiente y entendible**. En salud, buena usabilidad = diagnostico rapido y preciso. Mala usabilidad = errores peligrosos.

> Ejemplo: una HCE debe permitir ingresar y encontrar informacion tan facilmente como usar un motor de busqueda.

### Accesibilidad

Asegurar que **todas las personas** puedan usar la solucion de forma segura y eficaz, incluyendo personas con discapacidades.

| Discapacidad | Solucion de accesibilidad |
|---|---|
| Auditiva | Subtitulos en plataformas de telemedicina |
| Cognitiva | Lenguaje claro y simple |
| Visual | Compatibilidad con lectores de pantalla |

---

## 6. Aplicaciones del diseno en salud digital

| Aplicacion | Que hace |
|---|---|
| Deteccion cardiaca por camara | App que detecta enfermedades cardiacas usando la camara del celular |
| Soporte clinico para heridas | Ayuda a enfermeras domiciliarias a diagnosticar tipo de herida y elegir vendaje correcto |
| Companero virtual oncologico | Ayuda a pacientes con cancer avanzado a manejar efectos adversos de medicamentos toxicos en tiempo real, sin esperar a contactar enfermera |

---

---

## 7. Carga de la evidencia y carga regulatoria

Cuanto mas ambiciosas las pretensiones de una solucion de salud digital, **mas evidencia y mas regulacion se necesitan**:

```
Portal informativo          App de monitoreo          DTx / cambio conductual
(baja carga)                (media)                   (alta carga)
────────────────────────────────────────────────────────────────────────→
                    Mayor evidencia clinica requerida
                    Mayor carga regulatoria
```

---

## 8. Tres ciclos interconectados

Giunti propone que el desarrollo de soluciones de salud digital requiere integrar **tres ciclos** que normalmente operan por separado:

### 8.1 Metodo cientifico (aplicado a salud digital)

```
Fenomeno → Pregunta → Contexto/literatura → Hipotesis → Prediccion
    → [Financiacion] → Recoleccion de datos → Analisis → Manuscrito
```

**Ejemplo con diabetes tipo 2:**
1. Fenomeno: existe la diabetes tipo 2
2. Pregunta: como puede la tecnologia ayudar?
3. Contexto: revision de literatura sobre innovaciones existentes
4. Hipotesis: una app de seguimiento mejorara la progresion
5. Prediccion: rastreo de sintomas mejorara la autogestion
6. *Financiacion* (paso oculto pero necesario)
7. Datos: estudio clinico — grupo con app vs grupo control (papel/tradicional)
8. Analisis: comparar resultados entre grupos
9. Manuscrito: divulgacion

### 8.2 Ciclo de desarrollo de software (SDLC)

El **SDLC** (Software Development Life Cycle) es el nombre formal del ciclo:

```
Idea → [Financiacion] → Recoleccion de requisitos → Definicion
    → Desarrollo → Testeo → Lanzamiento → (nuevas ideas → ciclo)
```

**Ejemplo con tatetí:**
- Recoleccion de requisitos: documentacion tecnica, especificaciones, diagramas
- Definicion: reglas de juego, 2 jugadores, turnos, tablero, tipografia
- Desarrollo: equipo multidisciplinario
- Testeo: funciona en todos los dispositivos? Los botones responden? Se cuelga?
- Lanzamiento: al mercado
- Ciclo: nueva funcionalidad (juego online) → nuevos requisitos → desarrollar → testear → relanzar

### 8.3 Ciclo de diseno de negocio

```
Necesidad → Validar necesidad → Idea → Validar idea
    → Modelar negocio → Planificar negocio
```

A diferencia de los otros dos ciclos, la financiacion **no es un paso oculto** sino que esta presente en cada fase.

Preguntas clave:
- Alguien pagaria por resolver esta necesidad?
- Hay competidores? Que nos hace unicos?
- Cuales son los costos? Como generamos ingresos?
- Deberiamos asociarnos con asociaciones de pacientes, prepagas?

### 8.4 Como se interconectan

| Conexion | Ejemplo |
|---|---|
| Investigacion → Requisitos de software | El analisis de problemas de una enfermedad genera los requisitos del software |
| Testeo de software → Recoleccion de datos | El testeo de la app es simultaneamente la recoleccion de datos del estudio clinico |
| Financiacion de investigacion → Negocio | Una industria o crowdfunding financia la investigacion como objetivo de negocio |
| Preguntas de investigacion → Validacion de ideas | Las preguntas de investigacion identifican y validan las necesidades del negocio |

> Clave: la solucion debe aportar valor a **tres niveles simultaneamente**: pacientes, profesionales de salud y sistema de salud. Y debe ser sustentable.

---

## 9. Waterfall vs Agile

Dos metodologias de desarrollo de software:

| Aspecto | Waterfall (cascada) | Agile (agil / Scrum) |
|---|---|---|
| Documentacion | Extensiva antes de empezar | Minima, incremental |
| Desarrollo | Largo, producto completo al final | Sprints cortos (2 semanas), entregas parciales |
| Feedback | Solo al lanzar | En cada sprint |
| Riesgo | Alto (mercado puede cambiar) | Bajo (se adapta rapido) |
| Incertidumbre del equipo | Baja (todo definido) | Mayor (se define sobre la marcha) |
| Mejor para | Proyectos previsibles, larga escala | Mercados dinamicos, corto plazo |

> No hay una mejor que otra. Son para contextos distintos.

**Analogia:** Waterfall es como construir una casa con planos completos antes de poner un ladrillo. Agile es como construir habitacion por habitacion, habitando cada una mientras se construye la siguiente.

### Front-end vs Back-end

En el desarrollo de software, dos capas complementarias:

| Capa | Que es | Ejemplo en salud |
|---|---|---|
| **Front-end** | Lo que ve y toca el usuario (interfaz, botones, pantallas) | La pantalla de la app de monitoreo de glucosa |
| **Back-end** | La logica y datos detras de la interfaz (servidor, base de datos, algoritmos) | El servidor que almacena los registros de glucosa y ejecuta el ML |

---

## 10. Diseno multidisciplinario y doble usuario

El diseno de soluciones de salud digital requiere combinar **cuatro areas de conocimiento**: medicina, diseno centrado en el humano, tecnologia y gestion.

Un principio clave: muchas soluciones tienen **dos tipos de usuario simultaneos** con necesidades opuestas.

**Ejemplo: plataforma de telemedicina**

| Usuario | Necesita |
|---|---|
| Profesional de salud | Interfaz para revisar HCE, hacer diagnosticos, gestionar citas |
| Paciente | Experiencia sin fricciones, conexion rapida, **independiente de su nivel de alfabetizacion digital** |

> La alfabetizacion digital del paciente es una restriccion de diseno: la solucion debe funcionar para alguien que nunca uso una app medica.

---

## 11. Roles en el desarrollo de soluciones de salud digital

### Equipo de desarrollo

| Rol | Funcion |
|---|---|
| Disenador UX/UI | Disena la experiencia y la interfaz del usuario |
| Desarrollador | Construye el software (front-end y/o back-end) |
| Gestor de proyecto | Coordina al equipo, gestiona tiempos y recursos |

### Roles del profesional de salud en salud digital

El medico no es solo usuario final. Puede ser:

| Rol | Funcion |
|---|---|
| Cientifico de datos | Analizar datos clinicos generados por soluciones digitales |
| Consultor | Asesorar en requisitos clinicos y validacion medica |
| Emprendedor | Crear o co-crear soluciones de salud digital |
| Investigador | Generar evidencia sobre la eficacia de soluciones digitales |

---

## 12. Caso de estudio: More Stamina (esclerosis multiple)

Caso real desarrollado por Giunti que ejemplifica la integracion de los tres ciclos.

### Contexto de la enfermedad

- **Esclerosis multiple (EM):** enfermedad neurologica progresiva autoinmune. El sistema inmune ataca las celulas de mielina que recubren las neuronas → afecta conduccion nerviosa.
- Sintoma mas comun: **fatiga** (las senales nerviosas no llegan eficientemente → cansancio extremo).
- Prevalencia: ~20.000 en Argentina, ~500.000 en UE, ~2,3 millones mundial.
- Costo: la UE gasta ~15.000 millones EUR/ano en tratamiento de EM.

### Que es More Stamina

App **gamificada** para gestion de fatiga en EM:

1. El paciente inicia el dia con **puntos de stamina** (barra de vida tipo videojuego)
2. Planifica actividades y estima cuanta energia costara cada una
3. Al completar la actividad, reporta si costo mas o menos de lo estimado
4. Cuestionarios medicos estandarizados integrados
5. **Machine learning** combina: fatiga subjetiva + sensores del movil + cuestionarios
6. Genera **recomendaciones personalizadas** (ej: "normalmente andar en bici te cansa mas de lo que estimas, reprograma tu dia")

### Proceso de desarrollo (evidencia en cada paso)

| Fase | Que hicieron | Metodo |
|---|---|---|
| 1. Entender | Focus groups y entrevistas con pacientes de EM y otras enfermedades cronicas | Investigacion cualitativa |
| 2. Descubrimiento | Pacientes: "necesito visualizar mi energia". Profesionales: "necesito predecir la fatiga para planificar rehabilitacion" | Validacion de necesidad |
| 3. Revision del mercado | Revision sistematica: de miles de apps, solo 25 eran especificas para EM, mayoria educativas, ninguna abordaba fatiga | Evidencia de que no existia solucion |
| 4. Diseno participativo | Talleres con pacientes + profesionales + desarrolladores + familiares | Co-diseno |
| 5. Tecnicas de cambio conductual | Combinaron conceptos del co-diseno con tecnicas de cambio de comportamiento | Diseño basado en evidencia |
| 6. Financiacion | Obtuvieron subsidios de investigacion y desarrollo | Sustentabilidad |
| 7. Prototipo | Desarrollaron la app | Desarrollo de software |
| 8. Validacion profesional | Pruebas en centros de Suiza, Espana y Finlandia — profesionales la consideraron herramienta estrategica | Evidencia de valor clinico |
| 9. HTA | Evaluacion de tecnologia sanitaria (Health Technology Assessment) con metodo DiGA finlandes | Evaluacion regulatoria |
| 10. Inclusion de familiares | Pacientes querian compartir niveles de fatiga con familia para recibir ayuda proactiva | Diseno participativo ampliado |
| 11. Pacientes como equipo | Pacientes contratados como miembros del equipo de desarrollo (no solo participantes de estudio) | Co-produccion |
| 12. Piloto | Estudio piloto 2023 en Finlandia: pacientes usaron la app 2 meses | Evidencia del mundo real |
| 13. Siguiente paso | Ensayo clinico randomizado para medir impacto en salud y calidad de vida | Evidencia clinica de alto nivel |

> Cada fase genero una publicacion cientifica. La evidencia de una fase guia la siguiente.

### Enfoque participativo — detalle

Los pacientes no eran solo sujetos de estudio sino **miembros contratados del equipo**:
- Aportaban como asesores y como co-disenadores
- Ejemplo practico: un paciente con EM sugirio descansos de 5-10 minutos cada 20 minutos en talleres de 2 horas (por la fatiga)
- Participaban igualitariamente en investigacion, desarrollo y modelo de negocio

---

## 13. Evaluacion de Tecnologias Sanitarias (HTA)

Para que una solucion de salud digital se implemente institucionalmente en un sistema de salud, necesita pasar por una **evaluacion de tecnologia sanitaria** (Health Technology Assessment). Los mecanismos varian por pais (en el caso de More Stamina, usaron el metodo DiGA de Finlandia).

---

## Sintesis rapida — conceptos para evaluacion

| Concepto | En una linea |
|---|---|
| Diseno | Resolver problemas y mejorar experiencias (no solo estetica) |
| Error de uso (use error) | Error causado por mal diseno del dispositivo, no por descuido del usuario |
| DCH (Diseno Centrado en el Humano) | Metodologia de 5 fases iterativas: entender → definir → idear → prototipar → probar |
| Fase Entender | Investigacion etnografica: entrevistas, observacion, analisis de incidentes |
| Fase Definir | Articular un problema concreto y especifico a resolver |
| Fase Idear | Generar la mayor cantidad de ideas (cantidad > calidad) |
| Fase Prototipar | Crear version basica (MVP) para probar con usuarios |
| Fase Probar | Testear con usuarios reales en contexto real, recoger feedback |
| Iterativo | El proceso se repite ciclicamente: probar → entender → definir → mejorar |
| Usabilidad | Facil de usar, eficiente y entendible (regulado por ISOs) |
| Accesibilidad | Que todas las personas puedan usar la solucion (discapacidades visuales, auditivas, cognitivas) |
| MVP | Minimum Viable Product — version minima funcional para probar una idea |
| Caso Toronto (SickKids) | Bomba de infusion mal disenada → error de dosis 10x (botones demasiado juntos) |
| DeHarty y McDonald | Investigadores que estudiaron ~4000 errores de medicacion en Toronto |
| Carga de evidencia | A mayor pretension clinica de la solucion, mas evidencia y regulacion necesaria |
| Tres ciclos | Metodo cientifico + desarrollo de software + diseno de negocio → deben integrarse |
| Waterfall | Desarrollo con documentacion extensa previa, lanzamiento unico al final, alto riesgo |
| Agile / Scrum | Sprints cortos de 2 semanas, entregas incrementales, menor riesgo, mayor adaptabilidad |
| More Stamina | App gamificada para gestion de fatiga en esclerosis multiple (Giunti) |
| Gamificacion en salud | Usar mecanicas de videojuegos (puntos, barras de vida) para motivar conductas de salud |
| Diseno participativo | Involucrar pacientes, profesionales, familiares y desarrolladores como co-disenadores |
| Pacientes como equipo | No solo sujetos de estudio: contratados como miembros del equipo de desarrollo |
| HTA | Health Technology Assessment — evaluacion regulatoria para implementar solucion en sistema de salud |
| DiGA | Metodo finlandes de evaluacion de tecnologias sanitarias |
| Esclerosis multiple | Enfermedad neurologica autoinmune, ~2,3M mundial, sintoma principal: fatiga |
| Design Thinking | Sinonimo de DCH: empatia → definicion → ideacion → prototipado → prueba |
| SDLC | Software Development Life Cycle — ciclo formal de desarrollo de software |
| Front-end | Lo que ve el usuario (interfaz, pantallas, botones) |
| Back-end | Logica y datos detras de la interfaz (servidor, BD, algoritmos) |
| UX/UI designer | Disena experiencia e interfaz del usuario |
| Gestor de proyecto | Coordina equipo, tiempos y recursos |
| Medico como emprendedor | Profesional de salud que co-crea soluciones de salud digital |
| Medico como cientifico de datos | Profesional de salud que analiza datos clinicos de soluciones digitales |
| Doble usuario | Muchas soluciones tienen dos usuarios simultaneos (profesional + paciente) con necesidades distintas |
| Alfabetizacion digital | Restriccion de diseno: la solucion debe funcionar para usuarios sin experiencia tecnologica |
| Enfoque multidisciplinario | Medicina + diseno centrado en el humano + tecnologia + gestion |
