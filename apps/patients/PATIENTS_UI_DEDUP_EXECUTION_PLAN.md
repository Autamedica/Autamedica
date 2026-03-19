# Patients UI Dedup Execution Plan

Fecha: 2026-03-19
Scope: `apps/patients`
Base: [`PATIENTS_UI_DUPLICATIONS_AUDIT.md`](./PATIENTS_UI_DUPLICATIONS_AUDIT.md)

## Objetivo

Reducir duplicación activa y legacy del portal de pacientes sin mezclar dominios y sin romper flujos ya integrados con DB/API.

## Principios de ejecución

1. Un dominio por cambio.
2. Primero consolidar estructura compartida.
3. Después resolver canónicos de producto.
4. Recién al final eliminar legacy.
5. Cada fase debe dejar una superficie claramente canónica.

## Orden recomendado

### Fase 1. Unificar shell/layout y navegación

Estado: En curso
Prioridad: P0
Riesgo: Bajo a medio

Problema:

- conviven `DashboardLayout` y `CollapsibleSidebar` + `CollapsibleRightPanel`
- páginas standalone reimplementan navegación y panel lateral
- `CompactSidebar` agrega otra capa de alias

Objetivo:

- declarar una sola shell canónica para páginas autenticadas del portal

Canónico propuesto:

- mantener `DashboardLayout` como shell principal de `/(dashboard)`
- migrar páginas standalone relevantes a esa shell o convertirlas en rutas dentro de `/(dashboard)`
- reducir `CollapsibleSidebar`, `CollapsibleRightPanel` y `CompactSidebar` a compatibilidad temporal o eliminarlos

Write set esperado:

- `src/components/layout/DashboardLayout.tsx`
- `src/components/layout/CollapsibleSidebar.tsx`
- `src/components/layout/CollapsibleRightPanel.tsx`
- `src/components/layout/CompactSidebar.tsx`
- `src/app/community/page.tsx`
- `src/app/reproductive-health/page.tsx`
- `src/app/results/page.tsx`
- `src/app/team/page.tsx`
- `src/app/wallet/page.tsx`
- `src/app/help/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/indicators/page.tsx`

Criterio de salida:

- una sola familia visual de navegación
- ningún menú con entradas duplicadas al mismo destino
- pages fuera de `/(dashboard)` justificadas o migradas

Validación:

- `pnpm --filter @autamedica/patients type-check`
- eslint sobre layouts/páginas tocadas
- smoke test manual de navegación

### Fase 2. Reducir `DynamicRightPanel` a resumen y CTA

Estado: Pendiente
Prioridad: P1
Riesgo: Medio

Problema:

- el panel derecho compite con páginas principales
- contiene comunidad, acciones clínicas, indicadores y screenings en paralelo

Objetivo:

- convertirlo en panel contextual resumido
- sacar flujos completos y dejar solo preview + CTA

Canónico propuesto:

- comunidad completa en `/community`
- acciones clínicas completas en dashboard médico o páginas dedicadas
- indicadores completos en `/indicators` o en una página clínica consolidada

Write set esperado:

- `src/components/layout/DynamicRightPanel.tsx`
- `src/components/quick-actions/QuickActionModals.tsx`
- `src/components/medical/MedicalDashboard.tsx`
- posibles pages que hoy dependen del panel

Criterio de salida:

- el panel no funciona como mini-app
- cada dominio principal tiene una única superficie protagonista

### Fase 3. Resolver canónico de salud preventiva

Estado: Pendiente
Prioridad: P1
Riesgo: Medio

Problema:

- existen `/(dashboard)/preventive-health/page.tsx` y `PreventiveHealthHub.tsx`

Objetivo:

- elegir una experiencia única de salud preventiva

Canónico propuesto:

- mantener la page de `/(dashboard)` si es la integrada con perfil/session
- absorber o eliminar `PreventiveHealthHub` si no es la elegida

Write set esperado:

- `src/app/(dashboard)/preventive-health/page.tsx`
- `src/components/medical/PreventiveHealthHub.tsx`
- componentes preventivos vinculados

Criterio de salida:

- una sola taxonomía de tabs
- una sola narrativa de producto

### Fase 4. Resolver canónico de salud reproductiva

Estado: Pendiente
Prioridad: P1
Riesgo: Medio

Problema:

- dos rutas activas montan el mismo hub:
  - `/reproductive-health`
  - `/pregnancy-prevention`

Objetivo:

- una sola URL canónica
- la otra debe redirigir o quedar como alias explícito

Canónico propuesto:

- mantener la ruta dentro de `/(dashboard)` si el producto quiere navegación unificada
- o mantener `/reproductive-health` si el naming de producto ya está fijado así

Write set esperado:

- `src/app/reproductive-health/page.tsx`
- `src/app/(dashboard)/pregnancy-prevention/page.tsx`
- `src/components/layout/CollapsibleSidebar.tsx`
- `src/components/layout/DashboardLayout.tsx`

Criterio de salida:

- una sola experiencia visible
- sin shells distintas para el mismo contenido

### Fase 5. Consolidar anamnesis

Estado: Pendiente
Prioridad: P1
Riesgo: Medio

Problema:

- `AnamnesisForm.tsx` y `AnamnesisFormLegacy.tsx` están duplicados
- además existe la experiencia actual en `/(dashboard)/anamnesis`

Objetivo:

- declarar la experiencia canónica
- eliminar formularios legacy sin uso

Write set esperado:

- `src/components/medical-history/AnamnesisForm.tsx`
- `src/components/medical-history/AnamnesisFormLegacy.tsx`
- `src/components/medical-history/index.ts`
- `src/app/(dashboard)/anamnesis/page.tsx`

Criterio de salida:

- una sola implementación mantenida
- barrel sin exports ambiguos

### Fase 6. Consolidar telemedicina

Estado: Pendiente
Prioridad: P2
Riesgo: Alto

Problema:

- múltiples implementaciones de llamada/video
- pages de dev y product mezcladas en el árbol

Objetivo:

- una implementación productiva canónica
- aislar o eliminar dev/test UIs del producto

Write set esperado:

- `src/components/consultation/VideoConsultation.tsx`
- `src/components/telemedicine/EnhancedVideoCall.tsx`
- `src/components/telemedicine/RealVideoCall.tsx`
- `src/components/dev/SimplePatientVideoCall.tsx`
- `src/app/call/[roomId]/CallPageClient.tsx`
- `src/app/consultation/[id]/page.tsx`
- `src/app/dev-call/*`

Criterio de salida:

- una sola entrada productiva
- dev flows claramente aislados

### Fase 7. Limpiar alias y compatibilidad residual

Estado: Pendiente
Prioridad: P3
Riesgo: Bajo

Incluye:

- `src/app/dashboard/page.tsx`
- `src/components/layout/CompactSidebar.tsx`
- hooks legacy en `src/hooks/index.ts`

## Primer recorte ejecutable

### Sprint A

Objetivo:

- cerrar Fase 1 sin tocar aún dominios clínicos complejos

Tareas:

1. Inventariar qué páginas fuera de `/(dashboard)` deben migrarse y cuáles deben seguir standalone.
2. Elegir shell canónica.
3. Migrar una primera tanda de páginas pasivas:
   - `help`
   - `settings`
   - `indicators`
4. Eliminar wrappers duplicados obvios.
5. Dejar navegación consistente y sin entradas repetidas.

Definition of done:

- navegación consistente desktop/mobile
- sin `CompactSidebar` salvo compatibilidad estrictamente necesaria
- sin doble shell visible para páginas equivalentes

## Estado actual

Ya realizados:

- eliminado card duplicado de perfil en dashboard home
- eliminada entrada duplicada `Videollamada` del sidebar
- audit completo generado

Próximo cambio sugerido:

- migrar `help`, `settings` e `indicators` a la shell canónica y retirar `CompactSidebar`
