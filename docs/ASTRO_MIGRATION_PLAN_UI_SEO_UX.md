# Plan Maestro de Migracion a Astro (v2, ejecucion activa)

Fecha de actualizacion: 2026-02-22
Estado: vigente y en ejecucion (no obsoleto)

## 1) Resumen ejecutivo

- El plan original se mantiene valido en direccion tecnica.
- Se actualiza a `v2` porque ya hubo ejecucion real en `apps/web`.
- Enfoque actual: migracion incremental por rutas, con bridge temporal a portales legacy para no romper operacion.
- Avance global estimado del programa: `35%`.
- Documento base de auditoria inicial: `docs/ASTRO_MIGRATION_SCORECARD_PHASE0_2026-02-22.md`.

## 2) Estado real por fase (2026-02-22)

| Fase | Objetivo | Estado | Avance estimado | Evidencia principal |
| --- | --- | --- | ---: | --- |
| Fase 0 | Baseline y auditoria | En progreso avanzado | 80% | Scorecard inicial publicado |
| Fase 1 | Fundaciones UI/SEO/UX | En progreso avanzado | 75% | Tokens, layouts SEO, alertas auth, robots/sitemap |
| Fase 2 | Piloto `companies` + `web-app` | En progreso | 60% | Entradas Astro + bridge de convivencia |
| Fase 3 | Auth consolidada | En progreso | 45% | Mejoras UX/accessibility en forms auth |
| Fase 4 | Doctors | Slice inicial entregado | 30% | Ruta Astro `/doctors` |
| Fase 5 | Patients | Slice inicial entregado | 30% | Ruta Astro `/patients` |
| Fase 6 | Admin + cierre | Slice inicial entregado | 25% | `/admin` y `/admin/unauthorized` |

## 3) Entregables ya ejecutados

### SEO tecnico

- `site` definido en Astro.
- Canonical dinamico por ruta en layout principal.
- OG/Twitter unificados en layouts.
- `robots.txt` generado en Astro.
- `sitemap.xml` generado en Astro y actualizado con rutas nuevas.

### UI foundation

- Correccion de deuda de tokens globales (`hover`, `hover-border`, semanticos de estado).
- `focus-visible` y `selection` globales para accesibilidad y consistencia visual.

### UX auth

- Componente reutilizable de alertas (`error`, `success`, `info`) para auth.
- Formularios auth endurecidos con `aria-live`, `aria-invalid`, `autocomplete`, `minLength`.
- Se mantuvo comportamiento funcional (sin cambios de negocio).

### Migracion por rutas (Astro)

- Rutas slice: `/patients`, `/doctors`, `/companies`, `/platform`.
- Rutas internas: `/admin`, `/admin/unauthorized`.

### Convivencia sin corte (bridge)

- Middleware con redirects temporales para rutas legacy.
- Bridge autenticado para enviar subrutas legacy a dominios actuales (`patients`, `doctors`, `companies`, `admin`).
- Guardrail: `'/companies'` se mantiene como raiz Astro (no puenteada) para iterar UX/SEO.

## 4) Plan ajustado (v2) por olas

### Ola A (proximos 5-7 dias): cerrar piloto operativo

- Completar slices funcionales de `companies` y `web-app` en Astro.
- Convertir rutas placeholder de companies en vistas reales (`crisis`, `marketplace`, `reports`) con islands donde aplique.
- Consolidar `platform` como entrypoint unico para reemplazar aliases legacy.
- Validar CWV y Lighthouse por ruta.

Criterio de salida:
- Flujo empresarial de entrada y navegacion cubierto en Astro sin regresion.

### Ola B (dias 8-14): auth y contrato de enrutamiento

- Consolidar auth en Astro como fuente unica de entrada.
- Completar reglas de retorno por rol y retorno (`returnTo`) en rutas puenteadas.
- Agregar pruebas E2E de login por rol sobre rutas Astro.

Criterio de salida:
- Login/registro/recuperacion estables para pacientes, medicos y empresas.

### Ola C (dias 15-25): doctors y patients (slice funcional 2)

- Doctors: avanzar de landing a acciones clave (agenda, acceso consulta, panel inicial).
- Patients: avanzar de landing a flujo de descubrimiento + reserva inicial.
- Mantener policy: React islands solo en interaccion real.

Criterio de salida:
- Cada dominio con al menos 1 flujo funcional critico en Astro.

### Ola D (dias 26-35): hardening y decommission parcial

- Definir mapa de apagado de rutas Next publicas ya reemplazadas.
- Reducir puentes 307 a 301 en rutas estabilizadas.
- Publicar runbook de operacion y rollback por dominio.

Criterio de salida:
- Menor dependencia de apps Next para rutas publicas y de entrada.

## 5) Matriz de convivencia actual (Astro vs legacy)

| Ruta | Estado actual | Motor principal | Nota |
| --- | --- | --- | --- |
| `/` | Activa | Astro | Home publica |
| `/auth/*` | Activa | Astro | Login/registro/callback |
| `/patients` | Activa | Astro | Slice inicial |
| `/patients/*` | Bridge | Legacy patients | Redireccion temporal |
| `/doctors` | Activa | Astro | Slice inicial |
| `/doctors/*` | Bridge | Legacy doctors | Redireccion temporal |
| `/companies` | Activa | Astro | Entrada empresarial |
| `/companies/*` | Bridge | Legacy companies | Redireccion temporal |
| `/admin` | Activa | Astro | Slice interno inicial |
| `/admin/*` | Bridge parcial | Legacy admin | Segun subruta |
| `/web-app`, `/webapp`, `/app` | Redirect | Astro `/platform` | Alias legacy |
| `/platform` | Activa | Astro | Hub de acceso |

## 6) KPI y medicion de mejora

Objetivos se mantienen:

- LCP p75: `< 2.5s`
- CLS p75: `< 0.1`
- INP p75: `< 200ms`
- JS inicial en rutas publicas: `-40%` a `-70%`
- Lighthouse SEO: `+10` a `+20`

Formula oficial:

- `Score total = 35% Performance + 35% SEO + 30% UX`
- `% mejora = ((Score nuevo - Score base) / Score base) * 100`

Pendientes de medicion para cerrar Fase 0:

- Baseline Lighthouse por ruta critica (`/`, `/patients`, `/doctors`, `/companies`, `/platform`).
- Baseline CWV p75 en produccion.
- Baseline indexacion en Search Console.

## 7) Riesgos y mitigacion actualizada

1. Drift entre rutas Astro y legacy.
- Mitigacion: matriz de convivencia versionada y contrato de redirects en middleware.

2. Regresion auth por returnTo y roles.
- Mitigacion: E2E por rol y validacion de `portal`/`returnTo` en cada release.

3. SEO fragmentado por multiples entrypoints.
- Mitigacion: canonical estricto, sitemap unico y bloqueo de rutas privadas con `noindex`.

4. Duplicacion de componentes entre slices.
- Mitigacion: mover componentes comunes a capas reutilizables antes de ampliar dominios.

## 8) Definition of Done (v2)

1. Ruta en Astro funcional y medible.
2. Canonical/robots/OG/Twitter correctos.
3. Sin error critico en `lint` y `astro check`.
4. E2E minimo del flujo principal en verde.
5. Decision explicita: mantener bridge o apagar legacy para esa ruta.

## 9) Proximos pasos inmediatos

1. Ejecutar baseline real en produccion (Lighthouse + CWV + Search Console) y registrar `% mejora`.
2. Cerrar Ola B con E2E de auth por rol (`patient`, `doctor`, `company`) sobre rutas Astro.
3. Definir y validar plan de decommission parcial (promover redirects estables y apagar rutas legacy sin trafico).
