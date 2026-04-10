# Flujo de Experiencia del Paciente (Patient UI Flow) — AutaMedica Psychiatry

Este documento describe la interfaz y el recorrido del paciente dentro del ecosistema de AutaMedica, desde el triage inicial hasta la obtención de su medicación.

---

## 1. Módulo: Captura de Relato Clínico (Intake)
La puerta de entrada para psiquiatría no es un formulario tabular, sino una experiencia narrativa.

### Pantalla 'Mi Relato de Salud'
*   **Interfaz Premium**: Fondo ivory con gradientes sky-blue sutiles. Tarjetas con efecto glassmorphism.
*   **Captura Multimodal (Gemini 3.1 Live)**:
    *   El paciente ve un botón flotante con una onda sonora animada.
    *   Puede optar por hablar directamente ("Relato por voz") o escribir.
    *   **Feedback en tiempo real**: Mientras el paciente habla/escribe, el sistema extrae entidades clínicas (ej: "Insomnio detectado", "Metilfenidato reconocido").
*   **Secciones Dinámicas**:
    *   **Motivo de Consulta**: Narración libre.
    *   **Historial Farmacológico**: Reconciliación visual. El sistema muestra los logos o presentaciones de lo que el paciente menciona para confirmación rápida.

---

## 2. Pantalla de Triage y Semáforo de Riesgo
Antes de confirmar su turno, el paciente recibe transparencia sobre su estado preliminar.

### Panel de Estado Clínico
*   **Visual**: Un indicador circular con el "Semáforo Clínico".
*   **Narrativa**: 
    *   Si es 🟢: "Tu perfil está listo para la sesión. Todo en orden."
    *   Si es 🟡: "Detectamos que necesitás un protocolo de transición (Puente). El médico lo revisará con vos."
    *   Si es 🔴: "Tu caso requiere atención especial inmediata. Estamos priorizando tu espacio con el especialista."

---

## Telemedicina y Conclusión de Tarea
Finalizado el intake, el paciente entra al consultorio virtual.

### Consultorio AutaMedica
*   **Video integrado**: Sin salir de la plataforma.
*   **Cierre Clínico**: Al finalizar, el paciente ve una tarjeta de "Conclusión de Tarea" donde el psiquiatra presenta el resumen de lo pactado y los pasos a seguir.

---

## 4. Mis Recetas y Órdenes de Dispensación
El punto de fricción tradicional desaparece aquí.

### Centro de Prescripción
*   **Visualización de Receta**: El paciente ve su PDF firmado digitalmente con CUIR (trazable ante ANMAT).
*   **Órdenes de Dispensación**: Debajo de la receta, aparece el panel de "Farmacia como Módulo".
    *   Tarjeta con el fármaco específico.
    *   Estado: `Aprobada para dispensar`.
    *   **Selector de Farmacia**: Un mapa interactivo muestra las farmacias aliadas que tienen stock o están habilitadas para ese tipo de receta (especialmente si es una sustancia controlada).

---

## 5. El Salto a la Farmacia
El paciente ya no "lleva un papel". El paciente "ejecuta una orden".

### Pantalla de Retiro
*   **QR de Validación**: El paciente presenta un QR único que contiene el `DispensationOrderId`.
*   **Confirmación inmediata**: Al ser dispensado por el farmacéutico, el paciente recibe una notificación push: "Tu Metilfenidato ha sido dispensado con éxito. Recordá seguir las indicaciones del Dr. [Nombre]."

---

## 6. Cierre de Circuito (Estado Final)
Una vez que el paciente retira su medicación, la interfaz cambia para reflejar el éxito del proceso clínico y operativo.

### Tarjeta de Seguimiento Completado
```text
┌──────────────────────────────────────┐
│ Seguimiento completado               │
│                                      │
│ ✅ Receta emitida                     │
│ ✅ Orden validada                     │
│ ✅ Medicación dispensada              │
│                                      │
│ Tu proceso actual quedó cerrado.     │
│                                      │
│ [ Ver historial ]                    │
│ [ Iniciar próxima actualización ]    │
└──────────────────────────────────────┘
```

---

## Diferenciadores de UX
1.  **Tabula Rasa Design**: Limpio, sin ruido visual, enfocado en el bienestar del paciente.
2.  **No hay Wizards**: Los flujos son lineales y fluidos, evitando la fricción de "paso a paso" mecánicos.
3.  **Transparencia Clínica**: El paciente entiende por qué su receta es "Amarilla" o "Verde", lo que reduce la ansiedad sobre el tratamiento.
