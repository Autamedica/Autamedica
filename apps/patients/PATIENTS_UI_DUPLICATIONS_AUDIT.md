# Patients UI Duplications Audit

Fecha: 2026-03-19
Scope: `apps/patients`
Objetivo: inventariar duplicaciones visibles y estructurales en el portal de pacientes, separando lo activo de lo legacy.

## Resumen Ejecutivo

El portal tiene tres tipos de duplicación:

1. Duplicación activa de UI.
   Misma intención de producto expuesta en más de un lugar con distinto nivel de detalle o distinto estado de verdad.

2. Duplicación estructural.
   Layouts, sidebars y wrappers alternativos que resuelven el mismo problema con implementaciones distintas.

3. Duplicación de implementación o legacy.
   Componentes, hooks y páginas paralelas que mantienen versiones antiguas del mismo flujo.

Hallazgos principales:

- Hay dos sistemas de shell/layout coexistiendo.
- Hay páginas principales cuyo contenido se replica parcialmente en el `DynamicRightPanel`.
- Existen al menos dos experiencias de anamnesis y varias de telemedicina.
- Hay páginas standalone fuera de `/(dashboard)` que reimplementan sidebar y panel derecho manualmente.
- Persisten wrappers y hooks legacy explícitamente marcados como compatibilidad.

## Criterio

Se clasifica cada duplicación como:

- `Alta`: misma responsabilidad funcional resuelta por múltiples implementaciones activas.
- `Media`: misma información o CTA repetida en diferentes superficies activas.
- `Baja`: compatibilidad/legacy o alias que no genera hoy un conflicto fuerte, pero sí deuda.

## Hallazgos

### 1. Dos sistemas de shell/layout activos

Severidad: Alta

Hay dos familias distintas de navegación/layout:

- `DashboardLayout` en [`src/components/layout/DashboardLayout.tsx`](src/components/layout/DashboardLayout.tsx)
- `CollapsibleSidebar` + `CollapsibleRightPanel` en [`src/components/layout/CollapsibleSidebar.tsx`](src/components/layout/CollapsibleSidebar.tsx) y [`src/components/layout/CollapsibleRightPanel.tsx`](src/components/layout/CollapsibleRightPanel.tsx)

Evidencia:

- `/(dashboard)` usa [`src/app/(dashboard)/layout.tsx`](<src/app/(dashboard)/layout.tsx>), que monta `DashboardLayout`.
- Varias páginas fuera de `/(dashboard)` montan manualmente `CollapsibleSidebar` y `CollapsibleRightPanel`:
  - [`src/app/community/page.tsx`](src/app/community/page.tsx)
  - [`src/app/reproductive-health/page.tsx`](src/app/reproductive-health/page.tsx)
  - [`src/app/results/page.tsx`](src/app/results/page.tsx)
  - [`src/app/team/page.tsx`](src/app/team/page.tsx)
  - [`src/app/wallet/page.tsx`](src/app/wallet/page.tsx)
- Otras páginas usan `CompactSidebar` + `DynamicRightPanel`, que en realidad es otra capa sobre el mismo problema:
  - [`src/app/help/page.tsx`](src/app/help/page.tsx)
  - [`src/app/settings/page.tsx`](src/app/settings/page.tsx)
  - [`src/app/indicators/page.tsx`](src/app/indicators/page.tsx)

Riesgo:

- navegación inconsistente
- cambio visual duplicado en múltiples árboles
- costo de mantenimiento alto por cualquier ajuste de IA/sidebar/right panel

### 2. Wrapper duplicado de sidebar

Severidad: Baja

[`src/components/layout/CompactSidebar.tsx`](src/components/layout/CompactSidebar.tsx) es solo un pass-through a `CollapsibleSidebar`.

Esto no agrega comportamiento; solo mantiene un alias de compatibilidad.

Riesgo:

- más puntos de importación
- falsa sensación de dos componentes distintos

### 3. Dashboard home repite accesos ya cubiertos por navegación principal

Severidad: Media

La home del dashboard en [`src/app/(dashboard)/page.tsx`](<src/app/(dashboard)/page.tsx>) expone cards de acceso a:

- consultas
- anamnesis
- historial
- prevención
- comunidad

Esas mismas secciones ya están en navegación primaria:

- `DashboardLayout` [`src/components/layout/DashboardLayout.tsx`](src/components/layout/DashboardLayout.tsx)
- `CollapsibleSidebar` [`src/components/layout/CollapsibleSidebar.tsx`](src/components/layout/CollapsibleSidebar.tsx)

Nota:

- esto puede ser intencional como dashboard shortcut
- pero es duplicación de entry points, no de navegación base

Riesgo:

- mantener etiquetas, textos y prioridad de producto en varios lugares

### 4. Contenido de comunidad duplicado entre página principal y panel derecho

Severidad: Media

La comunidad vive como página completa en [`src/app/community/page.tsx`](src/app/community/page.tsx), pero también como panel resumido en `DynamicRightPanel`:

- `CommunityPanel` en [`src/components/layout/DynamicRightPanel.tsx`](src/components/layout/DynamicRightPanel.tsx)

Ambas superficies incluyen:

- feed de publicaciones
- CTA para crear publicación
- framing editorial de "conversaciones entre pacientes"

Riesgo:

- divergencia de estados y errores
- dos puntos para mantener el flujo de publicación
- el panel derecho puede competir con la página principal por el mismo rol de producto

### 5. Acciones clínicas duplicadas entre dashboard médico y quick actions

Severidad: Media

La misma intención funcional aparece en dos familias distintas:

- `MedicalDashboard` en [`src/components/medical/MedicalDashboard.tsx`](src/components/medical/MedicalDashboard.tsx)
- `ClinicalLogPanel` + `QuickActionModals` en [`src/components/layout/DynamicRightPanel.tsx`](src/components/layout/DynamicRightPanel.tsx) y [`src/components/quick-actions/QuickActionModals.tsx`](src/components/quick-actions/QuickActionModals.tsx)

Casos repetidos:

- registrar síntoma
- registrar medicamento
- registrar signos vitales / presión arterial
- publicar en comunidad

No siempre es la misma UI exacta, pero sí la misma capability expuesta por dos entry points activos.

Riesgo:

- competencia de CTA
- aprendizaje inconsistente del usuario
- mantenimiento duplicado del mismo flujo clínico

### 6. Salud preventiva tiene dos experiencias separadas

Severidad: Alta

Existen dos implementaciones distintas para salud preventiva:

- Página activa de `/(dashboard)` en [`src/app/(dashboard)/preventive-health/page.tsx`](<src/app/(dashboard)/preventive-health/page.tsx>)
- Hub alternativo en [`src/components/medical/PreventiveHealthHub.tsx`](src/components/medical/PreventiveHealthHub.tsx)

Diferencias:

- la página actual usa tabs `calculator`, `timeline`, `education`
- `PreventiveHealthHub` usa tabs `recommendations`, `my-screenings`, `reminders`, `cases`
- ambos presentan stats, recomendaciones y programación, pero con modelos de UI distintos

Riesgo:

- dos narrativas de producto para el mismo dominio
- deuda de decisión: no está claro cuál es la versión canónica

### 7. Salud reproductiva / prevención de embarazo tiene rutas y shells duplicados

Severidad: Media

Hay dos entradas distintas usando el mismo hub `ReproductiveHealthHub`:

- [`src/app/reproductive-health/page.tsx`](src/app/reproductive-health/page.tsx)
- [`src/app/(dashboard)/pregnancy-prevention/page.tsx`](<src/app/(dashboard)/pregnancy-prevention/page.tsx>)

Ambas montan:

- el mismo `ReproductiveHealthHub`
- el mismo callback `handleRequestConsultation`

Pero difieren en shell:

- una monta sidebar + right panel manualmente
- la otra vive dentro de `DashboardLayout`

Riesgo:

- dos URLs para una misma experiencia
- dos niveles de navegación para el mismo contenido

### 8. Anamnesis tiene dos implementaciones completas del formulario

Severidad: Alta

Hay dos componentes casi idénticos:

- [`src/components/medical-history/AnamnesisForm.tsx`](src/components/medical-history/AnamnesisForm.tsx)
- [`src/components/medical-history/AnamnesisFormLegacy.tsx`](src/components/medical-history/AnamnesisFormLegacy.tsx)

El contenido revisado es funcionalmente duplicado.

Además, la experiencia activa de anamnesis hoy vive en otra ruta/componente:

- [`src/app/(dashboard)/anamnesis/page.tsx`](<src/app/(dashboard)/anamnesis/page.tsx>)
- [`src/components/anamnesis/AnamnesisField.tsx`](src/components/anamnesis/AnamnesisField.tsx)

Conclusión:

- hay al menos dos generaciones del flujo de anamnesis conviviendo

Riesgo:

- confusión sobre cuál es la implementación canónica
- cambios de negocio replicados dos o tres veces

### 9. Telemedicina tiene múltiples experiencias paralelas

Severidad: Alta

Se identifican varias implementaciones y superficies para llamada/video:

- [`src/components/consultation/VideoConsultation.tsx`](src/components/consultation/VideoConsultation.tsx)
- [`src/components/telemedicine/EnhancedVideoCall.tsx`](src/components/telemedicine/EnhancedVideoCall.tsx)
- [`src/components/telemedicine/RealVideoCall.tsx`](src/components/telemedicine/RealVideoCall.tsx)
- [`src/components/dev/SimplePatientVideoCall.tsx`](src/components/dev/SimplePatientVideoCall.tsx)
- [`src/app/call/[roomId]/CallPageClient.tsx`](src/app/call/[roomId]/CallPageClient.tsx)
- [`src/app/consultation/[id]/page.tsx`](src/app/consultation/[id]/page.tsx)
- [`src/app/dev-call/page.tsx`](src/app/dev-call/page.tsx)
- [`src/app/dev-call/DevCallPageContent.tsx`](src/app/dev-call/DevCallPageContent.tsx)

No todas son productivas, pero sí representan múltiples versiones del mismo dominio.

Riesgo:

- enorme costo de mantenimiento
- difícil saber cuál flujo debe endurecerse o testearse
- dispersión de bugs de WebRTC/call UX

### 10. Rutas alias para dashboard

Severidad: Baja

[`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) redirige a `/`.

No es un problema grave, pero sí es una segunda entrada al dashboard.

Riesgo:

- alias innecesario si no existe razón de backward compatibility documentada

### 11. Right panel replica información que ya tiene página dedicada

Severidad: Media

`DynamicRightPanel` duplica o anticipa información de páginas principales:

- comunidad: `CommunityPanel`
- registro clínico: `ClinicalLogPanel`
- contexto clínico: `MedicalContextPanel`
- screenings/brief diario: `DailyBriefPanel`

Frentes duplicados contra páginas/hubs:

- comunidad vs [`src/app/community/page.tsx`](src/app/community/page.tsx)
- indicadores/contexto clínico vs [`src/app/indicators/page.tsx`](src/app/indicators/page.tsx)
- acciones clínicas vs dashboard médico y modales clínicos
- screenings vs [`src/app/(dashboard)/preventive-health/page.tsx`](<src/app/(dashboard)/preventive-health/page.tsx>)

Riesgo:

- panel derecho convertido en mini-app paralela
- difícil mantener consistencia de copy y estados

### 12. Página de indicadores solapa con contexto clínico del panel derecho

Severidad: Media

[`src/app/indicators/page.tsx`](src/app/indicators/page.tsx) presenta:

- presión arterial
- frecuencia cardíaca
- oxígeno
- temperatura

`MedicalContextPanel` en [`src/components/layout/DynamicRightPanel.tsx`](src/components/layout/DynamicRightPanel.tsx) también expone:

- presión arterial
- frecuencia cardíaca
- medicación del día
- alergias

No es idéntico, pero hay claro solapamiento funcional.

### 13. Hooks legacy aún exportados desde el barrel principal

Severidad: Baja

[`src/hooks/index.ts`](src/hooks/index.ts) exporta:

- `useActiveSession`
- `usePatientData`

Marcados explícitamente como deprecated.

Riesgo:

- nuevos imports pueden seguir consumiendo APIs falsas
- perpetúa compatibilidad innecesaria

## Duplicaciones ya corregidas en esta sesión

1. Card de "Perfil clínico" eliminada del dashboard principal.
   Antes duplicaba el acceso que ya existía en la navegación/sidebar.

2. Entrada de `Videollamada` eliminada del `CollapsibleSidebar`.
   Antes duplicaba `Citas` con el mismo `href` `/appointments`.

## Mapa de Canonicalización Recomendado

### Layout y navegación

- Dejar una sola familia canónica:
  - o `DashboardLayout`
  - o `CollapsibleSidebar` + `CollapsibleRightPanel`
- Eliminar `CompactSidebar` cuando ya no queden imports legacy.

### Comunidad

- Página canónica: [`src/app/community/page.tsx`](src/app/community/page.tsx)
- Panel derecho: solo preview o CTA, no feed completo ni flujo principal.

### Salud preventiva

- Elegir entre:
  - [`src/app/(dashboard)/preventive-health/page.tsx`](<src/app/(dashboard)/preventive-health/page.tsx>)
  - [`src/components/medical/PreventiveHealthHub.tsx`](src/components/medical/PreventiveHealthHub.tsx)

### Salud reproductiva

- Elegir una sola URL canónica:
  - `/reproductive-health`
  - o `/pregnancy-prevention`
- La otra debería redirigir.

### Anamnesis

- Mantener solo una implementación activa.
- Eliminar `AnamnesisFormLegacy` y revisar si `AnamnesisForm` sigue siendo usado o ya quedó superado por `/(dashboard)/anamnesis`.

### Telemedicina

- Declarar una implementación productiva canónica.
- Mantener las dev/test pages fuera del árbol de producto o claramente aisladas.

## Candidatos Prioritarios para Próxima Limpieza

1. Unificar layout shell (`DashboardLayout` vs `CollapsibleSidebar` stack).
2. Resolver canonical de salud preventiva.
3. Resolver canonical de salud reproductiva.
4. Eliminar `AnamnesisFormLegacy`.
5. Reducir `DynamicRightPanel` a resumen/CTA y no a feature surface paralela.
6. Consolidar telemedicina en una sola implementación productiva.

## Nota Final

Este documento diferencia entre:

- duplicación de acceso intencional
- duplicación de producto
- duplicación técnica/legacy

No toda repetición debe eliminarse, pero hoy el portal tiene varias áreas donde la frontera entre "atajo útil" y "segunda implementación del mismo feature" ya está cruzada.
