# Anamnesis — Arquitectura y Decisiones

> Documento vivo. Actualizar cuando cambie el modelo.

## Modelo de datos

- **Una anamnesis por paciente** (nunca por visita)
- Tabla `anamnesis`: status, progress, privacy, locked
- Tabla `anamnesis_sections`: JSONB flexible por seccion (upsert key: anamnesis_id + section)
- Tabla `anamnesis_versions`: snapshots inmutables con diff automatico

### 13 secciones actuales

| #   | Section ID              | Categoria               | Mutabilidad            |
| --- | ----------------------- | ----------------------- | ---------------------- |
| 1   | edad                    | filiacion               | carry_forward          |
| 2   | ocupacion               | filiacion               | confirm_on_revisit     |
| 3   | motivo_consulta         | motivo_consulta         | per_visit              |
| 4   | enfermedades_previas    | antecedentes_personales | carry_forward_additive |
| 5   | medicamentos            | antecedentes_personales | confirm_on_revisit     |
| 6   | alergias                | antecedentes_personales | carry_forward_additive |
| 7   | antecedentes_familiares | antecedentes_familiares | carry_forward          |
| 8   | habitos                 | antecedentes_personales | confirm_on_revisit     |
| 9   | cardiovascular          | revision_sistemas       | per_visit              |
| 10  | respiratorio            | revision_sistemas       | per_visit              |
| 11  | digestivo               | revision_sistemas       | per_visit              |
| 12  | genitourinario          | revision_sistemas       | per_visit              |
| 13  | resumen_final           | -                       | per_visit              |

### Mutabilidad (clasificacion por experiencia de llenado)

NO usamos "inmutable" — nada en medicina es inmutable. El padre muere, aparecen alergias nuevas, se corrige un typo en la fecha de nacimiento.

- **`carry_forward`**: Se usa el valor anterior sin preguntar. Paciente puede editar si quiere (boton "Editar datos anteriores"). Ejemplos: fecha nacimiento, antecedentes familiares.
- **`carry_forward_additive`**: Se muestra lo anterior + pregunta "hay algo nuevo?". Solo agrega, no borra. Ejemplos: enfermedades cronicas, alergias.
- **`confirm_on_revisit`**: Se muestra resumen de lo anterior + pregunta "cambio algo?". Si dice "No", se salta. Si dice "Si", abre edicion. Ejemplos: ocupacion, medicamentos, habitos.
- **`per_visit`**: Se pregunta siempre fresh. Ejemplos: motivo de consulta, sintomas actuales (cardiovascular, respiratorio, etc.), resumen final.

### Flujo segun historial del paciente

**Primera vez (sin secciones completadas):**

- Flujo completo: las ~40 preguntas del conversacional o 13 pasos del wizard.
- Checkpoints IA en paso 6 (partial) y al final (final).
- Al completar: status='completed', version v1 (trigger='initial').

**Revisita (secciones ya completadas):**

1. `carry_forward`: saltear silenciosamente. Datos se cargan del snapshot anterior.
2. `carry_forward_additive`: mostrar resumen + "Hay algo nuevo?" (boolean). Si si → textarea para agregar.
3. `confirm_on_revisit`: mostrar resumen compacto + "Cambio algo?" (boolean). Si si → abrir seccion.
4. `per_visit`: preguntar normalmente (conversacional o wizard).

**Resultado para revisita tipica:**

- Saltea: edad, antecedentes familiares (2 secciones)
- Pregunta rapido: enfermedades + alergias ("algo nuevo?") + medicamentos + habitos + ocupacion ("cambio algo?") (~5 preguntas boolean + condicionales)
- Pregunta completo: motivo consulta + 4 sistemas + resumen (~20 preguntas)
- Total: ~25 preguntas vs ~40 de la primera vez

### Errores anticipados y mitigaciones

| Error potencial                                     | Mitigacion                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `completion_percentage` baja si saltamos secciones  | Las secciones carry_forward mantienen `completed=true` del ciclo anterior. No se tocan.                             |
| AI extraction no sabe que es nuevo vs carryforward  | Pasar flag `isRevisit=true` + lista de secciones modificadas al endpoint extract                                    |
| Diff de version queda vacio si nada cambio          | No crear version nueva si `modified.length === 0`                                                                   |
| `resumen_final` confirma datos que no vio           | Mostrar resumen expandido con todas las secciones (incluyendo carryforward) antes de confirmar                      |
| Paciente quiere corregir dato carryforward          | Boton "Editar datos anteriores" abre seccion completa en modo edicion                                               |
| Padre muere entre visitas → dato "inmutable" cambio | `carry_forward` permite edicion manual. `confirm_on_revisit` para familiares podria ser mejor pero over-engineering |

### Implementacion (plan)

**Fase 1: Metadata de mutabilidad en anamnesis-steps.ts**

- Agregar campo `mutability` a cada step
- No cambia el modelo de datos — solo cambia la logica de presentacion

**Fase 2: Hook de revisita en useConversationalAnamnesis**

- Detectar si paciente tiene secciones completadas
- Filtrar questions segun mutabilidad
- Para `carry_forward_additive`: inyectar pregunta "hay algo nuevo?" antes de la seccion
- Para `confirm_on_revisit`: inyectar pregunta "cambio algo?" con resumen

**Fase 3: Wizard mode tambien respeta mutabilidad**

- Pasos carry_forward se muestran como readonly con boton editar
- Pasos confirm_on_revisit se muestran colapsados con preview

**Fase 4: AI extraction context**

- Pasar `modifiedSections[]` al endpoint
- Extraction focaliza en lo nuevo, no re-analiza lo viejo

## Modo conversacional (implementado 2026-03-30)

Renderer alternativo del mismo datasource. Una pregunta a la vez.

- Hook: `useConversationalAnamnesis` flattenea steps en cola de preguntas
- Evaluacion de `dependsOn` en tiempo real
- Batch save cada 5 respuestas
- Checkpoints IA en mismos puntos
- Default para pacientes nuevos (localStorage)
- Switch entre modos via header

## Modo wizard (original)

Formulario de 13 pasos con educational storytelling.

- Pausa cognitiva cada 4 pasos
- Video educativo en pasos 2, 3, 4, 8
- Guided tour en primera visita

## Bugs conocidos y fixes (2026-03-30)

- **Preguntas IA no aparecian en step 6**: partial checkpoint filtraba medium priority → `questions=[]`. Fix: remover filtro, sort natural. Tambien: `handleAnalysisContinue` usaba `analysisResult` (state local) pero `ClarificationStep` leia de `guidance` (hook state). Unificado a `guidance`.
- **`@ts-nocheck` en AnamnesisField.tsx**: pendiente de remover.
- **Zero validacion Zod en endpoints**: pendiente.
- **Doctor approval flow**: tipos definen `approved_by_doctor_id`, `locked`, status transitions. No hay endpoint ni UI.
