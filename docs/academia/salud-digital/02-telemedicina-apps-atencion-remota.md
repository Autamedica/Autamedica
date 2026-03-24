# Modulo II — Telemedicina, Aplicaciones Moviles y Atencion Remota

> Catedra Libre de Salud Digital, FMED UBA
> Fuentes: Clase 1 (Juan Ingelmo) + Clase 2 (Guido Giunti) + Recursos y Materiales II (libro, 3 caps)

---

## 1. Telemedicina — Fundamentos

La telemedicina es **anterior al COVID**, pero la pandemia fue el gran catalizador de adopcion masiva. Permite prestar servicios de salud a distancia usando TIC.

### Clasificacion por especialidad

| Modalidad | Aplicacion |
|---|---|
| Teleconsulta | Consulta medica general a distancia |
| Teledermatologia | Evaluacion de lesiones cutaneas con imagenes |
| Telepsiquiatria | Atencion de salud mental remota |
| Telestroke | Derivacion rapida en ACV (tiempo-critico) |
| Telepatologia | Analisis de muestras/imagenes patologicas a distancia |
| Telerehabilitacion | Seguimiento de rehabilitacion remota |

### Modalidades de comunicacion

```
Sincronica (en vivo)          Asincronica (store-and-forward)
─────────────────────         ──────────────────────────────
Videollamada en tiempo real   El paciente envia datos/imagenes
El medico responde al         El medico revisa y responde
momento                       en diferido
Ej: teleconsulta,             Ej: teledermatologia (fotos),
telepsiquiatria               telepatologia (laminas)
```

### Aplicaciones practicas destacadas

- **Telestroke:** El ACV requiere intervencion en minutos. Telestroke conecta hospitales remotos con neurologos especialistas para decidir derivacion/tratamiento rapido.
- **Demanda espontanea:** Consultas no programadas por sintomas agudos menores.
- **Monitoreo de cronicos:** Seguimiento continuo de pacientes con enfermedades cronicas (diabetes, hipertension, EPOC).

### Desafios de la telemedicina

- **Remuneracion:** Como se paga una teleconsulta vs. presencial. No siempre hay cobertura por obras sociales/prepagas.
- **Marco regulatorio:** Matriculas interprovinciales e internacionales — un medico de CABA no puede atender legalmente en Salta sin habilitacion.
- **Seguridad de datos:** Transmision de informacion medica sensible por internet.
- **Relacion medico-paciente:** Perdida de senales no verbales, examen fisico limitado.

---

## 2. Salud movil (mHealth)

mHealth = atencion sanitaria a traves de **dispositivos moviles** (smartphones, tablets, wearables).

### Tipos de apps de salud

| Categoria | Descripcion | Ejemplo |
|---|---|---|
| Bienestar | Fitness, meditacion, nutricion | MyFitnessPal, Calm |
| Monitoreo | Registro de parametros clinicos | MySugr (glucosa) |
| Terapias digitales (DTx) | Intervenciones validadas cientificamente | reSET, Deprexis |

### Terapias digitales (DTx) — concepto clave

Las DTx son **intervenciones de software validadas con evidencia clinica** (ensayos controlados), a diferencia de apps de bienestar genericas. Requieren aprobacion regulatoria (FDA, CE).

| DTx | Indicacion | Mecanismo |
|---|---|---|
| reSET | Abuso de sustancias | Terapia cognitivo-conductual digital |
| Deprexis | Depresion | Programa interactivo basado en evidencia |

> Diferencia critica: una app de meditacion es **bienestar**. reSET es una **terapia digital** porque paso por ensayos clinicos y tiene aprobacion regulatoria.

### Wearables

| Dispositivo | Que mide | Caso de uso clinico |
|---|---|---|
| Smartwatch (Apple Watch) | ECG, fibrilacion auricular, SpO2 | Deteccion temprana de arritmias |
| Anillo (Oura) | Sueno, temperatura, HRV | Monitoreo continuo pasivo |
| Bandas/pulseras (Fitbit) | Actividad, frecuencia cardiaca | Seguimiento de actividad en cronicos |
| Sensor de glucosa continuo (CGM) | Glucosa intersticial | Manejo de diabetes sin pinchazos |
| Lentes de realidad aumentada | Visualizacion de datos | Asistencia en cirugia (experimental) |

---

## 3. Comparacion internacional: Argentina vs. Finlandia

La clase de Giunti compara ambos paises para ilustrar distintos niveles de madurez digital en salud:

- **Finlandia:** Alta digitalizacion, sistemas integrados, HCE nacional unificada, alta adopcion de pacientes.
- **Argentina:** Avances fragmentados, telemedicina impulsada por pandemia, brecha digital significativa, sin HCE nacional unificada.

---

## 4. Urbanizacion, inequidades y sustentabilidad

### Brecha digital en salud

- No todos acceden igual a la tecnologia.
- Zonas rurales, poblaciones envejecidas y sectores de bajos recursos quedan excluidos.
- La digitalizacion puede **profundizar desigualdades** si no hay politicas de inclusion.

### Sustentabilidad

- **e-waste:** Los dispositivos (wearables, tablets, sensores) generan residuos electronicos.
- Ciclo de vida corto de hardware → impacto ambiental.
- Necesidad de politicas de reciclaje y diseno sustentable.

### Interoperabilidad

Uno de los desafios mas grandes: que los datos de una app, wearable o HCE puedan **compartirse entre sistemas distintos**. Sin interoperabilidad, los datos quedan en silos.

---

## 5. Desafios transversales

| Desafio | Descripcion |
|---|---|
| Interoperabilidad | Que los datos fluyan entre sistemas distintos (apps ↔ HCE ↔ wearables) |
| Financiamiento | Modelo de negocio sostenible para DTx y telemedicina |
| Regulacion | Aprobacion de DTx, matriculas interprovinciales, proteccion de datos |
| Brecha digital | Acceso desigual a tecnologia y conectividad |
| Sustentabilidad | e-waste, ciclo de vida corto de dispositivos |
| Relacion medico-paciente | Examen fisico limitado, perdida de comunicacion no verbal |

---

## Sintesis rapida — conceptos para evaluacion

| Concepto | En una linea |
|---|---|
| Telemedicina | Servicios de salud a distancia usando TIC (anterior al COVID) |
| Sincronica vs Asincronica | En vivo (videollamada) vs store-and-forward (imagenes/datos en diferido) |
| Telestroke | Teleconsulta critica en ACV para derivacion rapida |
| mHealth | Atencion sanitaria via dispositivos moviles |
| DTx (Terapias digitales) | Software validado clinicamente con aprobacion regulatoria (reSET, Deprexis) |
| reSET | DTx para abuso de sustancias (TCC digital, aprobada FDA) |
| Deprexis | DTx para depresion (programa interactivo basado en evidencia) |
| CGM | Sensor de glucosa continuo — monitoreo sin pinchazos |
| Interoperabilidad | Capacidad de compartir datos entre sistemas distintos |
| Brecha digital | Desigualdad de acceso tecnologico que profundiza inequidad en salud |
| e-waste | Residuos electronicos generados por dispositivos de salud digital |
| MySugr | App de monitoreo de glucosa (ejemplo de app de monitoreo) |
| Store-and-forward | Modalidad asincronica: enviar datos para revision posterior |
| Matriculas interprovinciales | Barrera legal: habilitacion profesional no es automaticamente valida en otra jurisdiccion |
