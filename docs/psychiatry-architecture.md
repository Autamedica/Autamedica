# Arquitectura Clínica del Módulo de Psiquiatría - AutaMedica

El módulo de Psiquiatría en AutaMedica no es un simple recolector de datos, sino un **motor de Triage y Reconciliación Farmacológica asincrónico** diseñado bajo altos estándares de farmacovigilancia y reducción de daños clínicos (basado en guidelines de la OMS, FDA y NICE).

---

## 1. Misión del Módulo

Transformar el habitual "volcado crudo de variables" de los formularios digitales en un **reporte narrativo pre-clínico** interpretado algorítmicamente. Su objetivo fundamental es proteger tanto al paciente como al facultativo, impidiendo renovaciones "a ciegas" de medicación psicoestimulante, advirtiendo sobre dosificaciones peligrosas o inconsistencias orgánicas antes del contacto médico (Telemedicina o presencial).

## 2. Flujo de Admisión (Intake) del Paciente

La anamnesis asincrónica es interactiva y captura dimensiones críticas a través de interfaces amables:

- **1. Evaluación General y Motivo:** Motivo de consulta, diagnóstico referido, antecedentes y medicación prescripta.
- **2. Sintomatología y Funcionalidad:** Percepción subjetiva del alivio de síntomas, impacto residual en el desarrollo académico/laboral diario, efectos sobre el apetito.
- **3. Seguridad Vital y Orgánica:** Pesquisa directa sobre arritmias, dolor torácico asociado, ideas pasivas o activas de autolesión, episodios compatibles con pánico, calidad de ciclo sueño-vigilia (Insomnio de conciliación/mantenimiento).

---

## 3. Arquitectura del PDF Clínico (Report Generator)

Ubicación: `apps/web/src/lib/patients/services/psychiatry-intake-pdf-report.service.ts`

El Core del generador de PDF fue reconstruido para separar drásticamente el modelo de base de datos de la capa de presentación médica.

### A. Saneamiento Técnico y Narrativo (Capas 1 y 2)

Evita el `camelCase` e interpola las variables directas del paciente en formatos narrativos estructurados:

1.  **Impresión Clínica Inicial:** Motivo de consulta, tratamientos en curso.
2.  **Impacto Funcional:** Combina impacto académico/laboral diario con la respuesta a los estímulos.
3.  **Evaluación de Riesgo Médico:** Traducción automática de cruces booleanos a un lenguaje asertivo frente a sospechas de alteraciones cardio-psiquiátricas ("El paciente negó dolor torácico...").

### B. Taxonomía de Incertidumbre (Capa 3)

La base de datos absorbe lo que el paciente tipea en crudo (Ej: _"No me acuerdo quién recetó"_ o _"Tomo 2 pastillas"_). El microservicio transfiere esto a dos taxonomías de seguridad estrictas:

- `prescriberStatus`: ¿Verificado? ¿Reportado sin evidencia? ¿Desconocido?
- `doseConfidence`: ¿Es una métrica exacta en MG o un término de riesgo ("pastilla", "blíster", "un poco")?

---

## 4. Semaforización Inteligente y Reglas de Negocio (Capa 4)

El corazón de la prevención médica de Autamedica. Intersecta los booleanos con las extracciones semánticas para aplicar "Gating Clínico" y generar el bloque impreso de **Alertas Rojas de Revisión Obrigatórias**.

### 🛠 Riesgo Cardio-Psq (Stop Obligatorio)

Si el paciente marcó activamente _Ideación Autolesiva_, _Pánico_ o _Dolor Torácico_:

> "Presencia de marcadores de alarma (Pánico, Dolor de pecho, Autolesión). Obligatorio posponer escalada de dosis empírica hasta interconsulta neurológica o cardiovascular."

### 💤 Divergencia Cronobiológica

Si declara 'Insomnio severo' pero en espacios de texto describe dormir más de lo rutinario (hipersomnia de rebote):

> "Evaluar reporte discordante sobre la calidad de horas de sueño. Evaluar hipótesis de efecto rebote o depresión comórbida."

### 💊 Límite Numérico: Dosis Extraordinarias

Posee un parser REGEX que extrae los números de la sintaxis del paciente y evalúa umbrales aprobados y seguros en adultos (~60-100mg para estimulantes).

> **Si MG >= 100:** "Dosis Extraordinaria Reportada. Fuera de los límites farmacológicos rutinarios aprobados. Tratar como dato a reconciliar urgente por riesgo de sobredosificación, mal uso o error de captura."

### 🌉 Puente Clínico de Contingencia (Hard Rule)

**La directiva operativa innegociable.** El sistema entiende que "Mucho proceso y ninguna decisión" perjudica directamente al paciente y al riesgo legal del médico. Ante un requerimiento de psicotrópicos controlados con incertidumbre de origen o dosaje extremo, el sistema prohíbe tanto el "abandono ciego" (withdrawal) como la "renovación a ciegas" (toxicidad/mala praxis).

**Fórmula de Decisión (Gating):**
`Si (fármaco incluye 'metilfenidato'|'tdah'|'estimulante') Y (prescriptor_status == "unknown") -> Disparar Puente Clínico Urgente`

_Mandato expuesto explícitamente en el PDF para el Psiquiatra:_

> "Evaluación Clínica URGENTE (Protocolo de Contingencia): Uso crónico referido de estimulantes con prescriptor desconocido. REGLA OPERATIVA: 1) Prohibido el abandono (alto riesgo de daño por interrupción/depresión). 2) Resolución obligatoria HOY. 3) Proveer continuidad transitoria supervisada (puente clínico), con dosis base segura a definir por el médico tratante." (Anexando prohibición expresa de renovación automática si la dosis reportada se encuadra como 'Extraordinaria').

---

## 5. Próximos horizontes recomendados

- **Flujo Documental de Reconciliación:** Implementar un paso de "Upload" dentro del flujo para aquellos categorizados en alerta amarilla, pidiendo subir una fotografía del último blíster o receta (Doble check farmacológico).
- **Dashboards Médicos:** Permitir a los especialistas de Admisión / Triage ordenar su fila de pacientes guiándose por el valor semafórico, interviniendo a los categorizados con "Dosis Extraordinaria" con prioridad alta.
- **Historial Longitudinal:** Trazabilidad de los cuestionarios en el tiempo. Contrastar las métricas de Impacto Funcional de la Evaluación N1 (hoy) con una nueva N2 (En 6 meses).
