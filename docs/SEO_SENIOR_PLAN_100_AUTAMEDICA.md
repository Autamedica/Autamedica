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


## 7) Estado de ejecución y cierre — 2026-11-24

### Correcciones preparadas en la rama de cierre SEO

- Hreflang: se eliminan las declaraciones implícitas que asignaban la misma URL a español, portugués y `x-default`. Solo se emiten alternativas explícitas, absolutas y alojadas en el dominio canónico. No se declaran equivalencias lingüísticas mientras no existan URLs equivalentes reales.
- Imágenes sociales: el generador usa el logo existente, produce PNG de 1200×630 con la paleta azul de AutaMedica y verifica sus dimensiones. Las referencias heredadas `.webp` se normalizan a los PNG generados.
- Metadatos y datos estructurados: se eliminan ratings agregados y ofertas gratuitas sin respaldo verificable. Las páginas verticales se describen como `Organization`, `Service` y `WebPage`, no como establecimientos médicos. Se conserva el schema `Physician` de los perfiles profesionales.
- Sitemap: se incorpora la guía existente sobre la Ley 27.553 y se reconcilia el backlog de palabras clave con las páginas ya implementadas.
- CI: se añade un gate SEO obligatorio que genera los assets y valida sitemap/paridad, robots, dimensiones de imágenes, JSON-LD y hreflang. El estado del gate forma parte del resultado agregado de CI.
- Publicación: los workflows de producción y contenido generan y validan los assets antes del build Astro.

### Evidencia que todavía falta para declarar el 100/100

1. Ejecutar el CI de la rama y corregir cualquier fallo real de build, lint o validación.
2. Medir Lighthouse SEO en `/`, `/patients`, `/doctors`, `/companies` y `/platform`: tres ejecuciones por ruta, cada una con score 100.
3. Confirmar en producción que las imágenes sociales servidas responden correctamente y mantienen 1200×630.
4. Registrar el baseline de indexación en Google Search Console y los Core Web Vitals reales.
5. Mantener dos semanas consecutivas sin regresiones SEO antes de cerrar la sostenibilidad.

**Estado:** el contrato de validación está incorporado en la rama; el objetivo Lighthouse 100/100, la indexación real y las dos semanas de estabilidad siguen abiertos hasta que exista evidencia de ejecución y producción.
