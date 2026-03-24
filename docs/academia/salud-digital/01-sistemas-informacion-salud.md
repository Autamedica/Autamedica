# Modulo I — Introduccion a la Salud Digital

> Catedra Libre de Salud Digital, FMED UBA
> Fuentes: Clase Dr. Guido Giunti (video) + Recursos y Materiales I (libro, 4 caps)

---

## 1. Salud Digital — Definicion y taxonomia

La OMS define salud digital como **cualquier tecnologia usada para mejorar la salud**. Es el termino mas amplio y el que adopta el curso.

### Evolucion historica de los terminos

| Termino | Epoca | Foco |
|---|---|---|
| Informatica medica | 1950-60s | Gestion de datos clinicos hospitalarios, primeros EHR |
| Telemedicina | Pre-digital, auge COVID | Servicios de salud a distancia |
| eSalud | 1990s | TIC para mejorar salud individual y comunitaria |
| Informatica en salud | Posterior | Integra informatica medica + salud publica + investigacion |
| mSalud | 2000s | Apps y dispositivos moviles |
| **Salud digital** | Ultimas 2 decadas | El mas amplio: IA, big data, wearables, apps, personalizacion |

---

## 2. Componentes del acto de cuidado

El cuidado no es un evento aislado. Intervienen:

| Actor / Factor | Rol |
|---|---|
| Profesional de salud | Ejecuta el acto clinico |
| Paciente | Receptor del cuidado |
| Lugar | Hospital publico/privado, consultorio, domicilio |
| Actores secundarios | RRHH, facturacion, logistica, farmacia |

### Determinantes de la salud

> *"El codigo postal influye mas que el codigo genetico."*

- **Exposoma personal:** dieta, actividad fisica, ocupacion.
- **Exposoma externo:** entorno geografico, condiciones ambientales, nivel socioeconomico.

---

## 3. Sistema de Informacion ≠ Software

Un sistema de informacion es la combinacion de **cuatro pilares**:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Hardware    │  │  Software   │  │  Procesos   │  │  Personas   │
│ servidores,  │  │ facturacion,│  │ secuencias  │  │ capacitadas │
│ tablets,     │  │ inventario, │  │ de trabajo  │  │ para usar   │
│ sensores     │  │ HCE         │  │ logicas     │  │ el sistema  │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

**Analogia del kiosco:** facturacion + inventario deben comunicarse, dentro de un proceso logico (no se factura antes de entregar), con hardware (postnet, caja) y personal capacitado. En salud, cada pilar se multiplica en complejidad.

**Modelos de informacion:** herramientas conceptuales (diagramas, esquemas) para representar como interactuan los componentes de un sistema de informacion. Permiten visualizar flujos de datos y dependencias antes de implementar.

---

## 4. Historia Clinica Electronica (HCE)

### 4.1 Marco legal

Documento **legal, obligatorio, cronologico y completo** que registra todos los actos de cuidado.

### 4.2 Funciones vs. Funcionalidades

| Funciones (proposito) | Funcionalidades (capacidades tecnicas) |
|---|---|
| Registrar el acto medico | Alertas automaticas |
| Respaldo legal | Busquedas y filtros |
| Comunicacion entre profesionales | Integracion de datos entre areas |
| Apoyo a investigacion y docencia | Acceso simultaneo multiusuario |

> La HCE **no es "el papel en digital"**. Confundir funciones con funcionalidades es el error mas frecuente.

### 4.3 Ventajas sobre el papel

1. **Acceso simultaneo** — Multiples profesionales consultan al mismo tiempo.
2. **Centralizacion** — Ginecologia accede a datos de cirugia sin duplicacion.
3. **Portabilidad** — La historia sigue al paciente entre instituciones.
4. **Explotacion de datos** — Analisis de tendencias automatico (ej: correlacionar glucosa con un farmaco en toda la poblacion).
5. **Informacion en tiempo real** — Datos pertinentes disponibles en el punto de cuidado.

### 4.4 Barreras de adopcion

- **Economicas:** alto costo de implementacion, ROI dificil de cuantificar.
- **Culturales:** resistencia al cambio, preferencia por el papel.
- **Capacitacion:** el personal necesita formacion continua.

---

## 5. Casos de estudio

| Dominio | Caso | Que demostro |
|---|---|---|
| HCE | Kaiser Permanente — *KP HealthConnect* (EEUU) | Mejora coordinacion, elimina duplicacion de estudios, acceso en tiempo real |
| Telemedicina | Hospital Garrahan (Argentina, desde 2010) | Conecta especialistas con hospitales remotos del pais, escalado en pandemia |
| mSalud | Apple Watch — deteccion fibrilacion auricular | Sensores + ML generan alertas tempranas que derivaron en diagnosticos reales |
| Big Data | *BlueDot* — deteccion COVID-19 | Detecto el brote en Wuhan antes que sistemas oficiales, analizando noticias, reportes y datos de vuelos |

---

## 6. Impacto social y etico

### Transformacion del rol medico

El medico pasa de decisiones basadas en experiencia individual a decisiones **basadas en datos y herramientas de IA**, requiriendo nuevas competencias digitales.

### Nueva relacion medico-paciente

- Pacientes mas empoderados con sus propios datos.
- Riesgo: malinterpretacion de informacion sin guia profesional.
- Telemedicina reduce barreras de acceso pero puede perder senales no verbales.

### Privacidad y seguridad

Los datos de salud son especialmente sensibles. Marcos regulatorios clave:

| Marco | Jurisdiccion | Enfoque |
|---|---|---|
| GDPR | Europa | Proteccion de datos personales, derecho al olvido |
| HIPAA | EEUU | Seguridad de informacion de salud protegida (PHI) |

### Brecha digital

No todos acceden igual a la tecnologia → riesgo de profundizar desigualdades en salud. Requiere politicas inclusivas, subsidios y apps que funcionen offline.

### Sesgos en IA

Algoritmos entrenados con datos no representativos pueden ser **menos precisos para poblaciones minoritarias**. Es un problema activo en investigacion.

### Responsabilidad

Si una IA comete un error diagnostico, quien responde: medico, desarrollador o institucion? No hay consenso. Se necesitan marcos claros de responsabilidad y transparencia (accountability).

---

## Sintesis rapida — conceptos para evaluacion

| Concepto | En una linea |
|---|---|
| Salud Digital (OMS) | Paraguas: toda tecnologia para mejorar salud |
| Sistema de Informacion | Hardware + Software + Procesos + Personas |
| Exposoma | Factores ambientales + biologicos que determinan la salud |
| Historia Clinica | Documento legal, obligatorio, cronologico, completo |
| HCE | HC con funcionalidades digitales (alertas, busquedas, integracion) |
| Funciones vs Funcionalidades | Proposito de la HC vs capacidades tecnicas de la HCE |
| Telemedicina | Servicios de salud a distancia (Garrahan como caso argentino) |
| mSalud | Dispositivos/apps moviles para salud (Apple Watch como caso) |
| GDPR / HIPAA | Marcos de proteccion de datos de salud (Europa / EEUU) |
| Brecha digital | Desigualdad de acceso tecnologico → desigualdad en salud |
| Sesgos IA | Datos no representativos → algoritmos menos precisos en minorias |
| Responsabilidad IA | Problema abierto: quien responde por errores diagnosticos de IA |
| BlueDot | Big data detecto COVID antes que sistemas oficiales |
| KP HealthConnect | HCE de Kaiser Permanente, caso referencia de integracion |
