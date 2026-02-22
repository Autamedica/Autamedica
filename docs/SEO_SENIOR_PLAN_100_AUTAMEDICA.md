# Plan Senior SEO 100/100 para AutaMedica

Fecha: 2026-02-22  
Objetivo: llevar AutaMedica a **100/100 en SEO (Lighthouse)** en rutas criticas y sostenerlo en CI sin bypass.

## 1) Meta exacta

- Score SEO Lighthouse: **100** en:
  - `/`
  - `/patients`
  - `/doctors`
  - `/companies`
  - `/platform`
- Resultado repetible:
  - 3 corridas consecutivas por ruta, promedio 100.
  - Sin advertencias de indexacion (robots/sitemap/canonical) en validacion interna.

## 2) Baseline actual

- Estado estimado actual: **67/100** (intermedio).
- Brechas principales:
  - `sitemap` vs `noindex` en `/companies`.
  - Riesgo de OG/Twitter assets inconsistentes.
  - `lastmod` dinamico no confiable.
  - Gate SEO en CI no bloqueante.

## 3) Plan por fases (para llegar a 100)

## Fase A (P0, 24-48h) - Coherencia total de indexacion

1. Eliminar contradicciones `sitemap`/`robots`/`noindex`.
2. Definir politica unica:
   - Rutas indexables: en sitemap + `index,follow`.
   - Rutas privadas: fuera de sitemap + `noindex,nofollow`.
3. Aplicar en:
   - `apps/web/src/pages/sitemap.xml.ts`
   - `apps/web/src/pages/robots.txt.ts`
   - `apps/web/src/pages/companies/index.astro`
   - layouts auth/admin privados.

Criterio de salida:

- 0 conflictos detectados por script de parity SEO.

## Fase B (P0, 48h) - Metadatos perfectos por ruta

1. Confirmar canonical absoluto y unico por ruta.
2. Verificar OG/Twitter:
   - `og:image` y `twitter:image` reales, accesibles y 1200x630 minimo.
3. Unificar title/description para evitar duplicados y truncamientos.
4. Alinear host canonico (`www`) en todas las capas (middleware, metadata, docs, redirects).

Criterio de salida:

- 100% de rutas criticas con canonical valido + assets sociales validos.

## Fase C (P1, 3-4 dias) - Structured Data de nivel senior

1. Validar JSON-LD por vertical:
   - Organization
   - WebSite
   - WebPage
   - MedicalBusiness/Breadcrumb segun ruta
2. Eliminar drift entre schemas globales y verticales.
3. Definir pruebas automáticas de schema:
   - campos obligatorios,
   - URLs absolutas,
   - ausencia de placeholders.

Criterio de salida:

- 0 errores de schema en rutas criticas.

## Fase D (P1, 3 dias) - CI bloqueante (sin excepciones)

1. Convertir Lighthouse SEO a gate duro:
   - quitar `|| echo` en workflow.
2. Añadir job `seo-parity` bloqueante:
   - valida robots/sitemap/canonical/robots-meta/hreflang.
3. Reglas de merge:
   - si cualquier ruta <100 SEO => PR bloqueado.

Archivos objetivo:

- `.github/workflows/autamedica-agentic.yml`
- nuevo script `scripts/seo/validate-parity.mjs`
- nuevo script `scripts/seo/validate-social-assets.mjs`

Criterio de salida:

- Ningun merge a `main` posible con score SEO <100 en rutas criticas.

## Fase E (P2, 1 semana) - Sostenibilidad de 100

1. Observabilidad semanal:
   - reporte SEO automatico por ruta (historial de score).
2. Alertas de regresion:
   - caida de score,
   - cambio de canonical,
   - rutas privadas accidentalmente indexables.
3. Checklist release SEO obligatorio.

Criterio de salida:

- 2 semanas consecutivas con 100/100 sostenido en CI.

## 4) Definition of Done (100 real)

Se considera cumplido solo si:

1. Lighthouse SEO = **100** en 5/5 rutas criticas.
2. CI bloquea cualquier PR con score <100.
3. No hay conflictos de indexacion.
4. JSON-LD sin errores ni warnings criticos.
5. Canonical y hreflang coherentes con dominio canonico.

## 5) Riesgos y mitigaciones

1. Fluctuacion de score por entorno CI.

- Mitigacion: 3 corridas y promedio; mismo runner/config.

2. Cambios de contenido que rompen metadatos.

- Mitigacion: tests de snapshot SEO por ruta.

3. Drift entre apps (Astro/Next portales).

- Mitigacion: contrato SEO comun reutilizable y validado en monorepo.

## 6) Acciones inmediatas (hoy)

1. Corregir conflicto `/companies` (sitemap vs noindex).
2. Hacer bloqueante el job de Lighthouse SEO.
3. Crear `seo-parity` validator y ejecutarlo en pre-push + CI.

---

Este plan no busca “mejorar un poco”; busca **garantizar 100/100** de manera repetible y auditable.
