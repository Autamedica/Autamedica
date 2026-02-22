# Fase 0 - Scorecard inicial (ejecución inversa 6→0)

Fecha: 2026-02-22

## Inventario actual por app (base real)

| App | Stack actual | Páginas detectadas | Endpoints detectados | Complejidad de migración |
| --- | --- | ---: | ---: | --- |
| `apps/web` | Astro | 23 | 3 | Base activa |
| `apps/auth` | Next.js 15 | 10 | 2 | Media |
| `apps/patients` | Next.js 15 | 23 | 22 | Alta |
| `apps/doctors` | Next.js 15 | 7 | 1 | Media-baja |
| `apps/companies` | Next.js 15 | 1 | 1 | Baja |
| `apps/admin` | Next.js 15 | 2 | 0 | Baja |
| `apps/web-app` | Next.js 15 | 1 | 1 | Baja |

## Estado de ejecución (orden inverso)

### Fase 6 - Admin + cierre

- Entregado: rutas Astro internas `/admin` y `/admin/unauthorized`.
- Entregado: `robots.txt` bloquea `/admin/`.
- Política SEO: `noindex, nofollow, noarchive` en rutas admin.

### Fase 5 - Patients (slice inicial)

- Entregado: ruta pública Astro `/patients` con CTA real a registro/login de pacientes.
- Objetivo del slice: entrada de descubrimiento y onboarding; operaciones clínicas permanecen en portal dedicado.

### Fase 4 - Doctors

- Entregado: ruta pública Astro `/doctors` con CTA real a registro/login médico.
- Objetivo del slice: entrada profesional y funnel de adopción sin tocar todavía módulos clínicos complejos.

### Fase 3 - Auth + entrada a producto

- Entregado: consolidación de metadatos SEO de auth con componente reutilizable.
- Entregado: auth mantiene política `noindex` en layout dedicado.

### Fase 2 - Piloto de bajo riesgo (`companies` + `web-app`)

- Entregado: rutas Astro `/companies` y `/platform` como piloto público.
- Entregado: sitemap incluye rutas piloto y slices públicos.
- Objetivo: validar DX, SEO y estructura de rollout por ruta antes de tocar Patients completo.

### Fase 1 - Fundaciones

- Entregado: componente SEO central reutilizable `SeoMeta` aplicado en layouts base.
- Entregado: estandarización de UX en auth (alertas reutilizables, atributos de accesibilidad, feedback de carga).

### Fase 0 - Baseline y auditoría

- Entregado: este scorecard con inventario por app/ruta.
- Pendiente para cerrar Fase 0:
  - baseline Lighthouse por ruta crítica (`/`, `/patients`, `/doctors`, `/companies`, `/platform`)
  - baseline CWV en producción (LCP/CLS/INP p75)
  - baseline de indexación en Search Console

## Métrica compuesta de mejora (definida)

- `Score total = 35% Performance + 35% SEO + 30% UX`
- `% mejora = ((Score nuevo - Score base) / Score base) * 100`

## Quick wins priorizados (siguiente bloque)

1. Completado: JSON-LD especifico por vertical (`MedicalBusiness`, `Organization`, `Breadcrumb`) en `/patients`, `/doctors`, `/companies`.
2. Completado: Lighthouse CI actualizado para rutas Astro publicas en `www` (`/`, `/patients`, `/doctors`, `/companies`, `/platform`).
3. Completado: mapa 301 ampliado para rutas publicas legacy (`/app`, `/web-app`, `/webapp`, `/portal*`, `/portals*`, alias ES/EN de pacientes/medicos/empresas).
