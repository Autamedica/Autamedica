# Benchmark SEO Tecnico: AutoRenta vs AutaMedica

Fecha: 2026-02-22
Alcance: auditoria estatico-tecnica de implementacion SEO en codigo/config (no incluye Search Console ni medicion real de trafico/CTR).

## Resumen ejecutivo

- **AutoRenta**: nivel **Intermedio**.
- **AutaMedica**: nivel **Intermedio** (ligeramente superior en base tecnica, pero con inconsistencias criticas).
- Score global estimado:
  - AutoRenta: **62/100**
  - AutaMedica: **67/100**
- Diferencia relativa: AutaMedica esta **+8.1%** por encima de AutoRenta en madurez SEO tecnica total.

Nota importante:

- Aunque AutaMedica puntua mas alto global, tiene un gap de coherencia SEO de alto impacto: **ruta en sitemap y a la vez noindex** (`/companies`).

## Score comparativo por categoria

| Categoria                 | AutoRenta | AutaMedica | Mejor          |
| ------------------------- | --------: | ---------: | -------------- |
| Indexacion / Crawl        |        56 |         72 | AutaMedica     |
| On-page metadata          |        74 |         68 | AutoRenta      |
| Structured Data           |        72 |         74 | AutaMedica     |
| Canonical / Redirects     |        46 |         70 | AutaMedica     |
| Performance SEO-readiness |        78 |         62 | AutoRenta      |
| Governance / CI SEO       |        44 |         55 | AutaMedica     |
| **Total**                 |    **62** |     **67** | **AutaMedica** |

## Nivel de cada proyecto

### AutoRenta: Intermedio (62/100)

Fortalezas:

- Metadata, robots, sitemap y JSON-LD presentes.
- Headers de cache/seguridad implementados.

Debilidades:

- Coherencia robots vs sitemap mejorable.
- Canonicalizacion/redirects incompleta para host/casos legacy.
- CI SEO no bloqueante.

### AutaMedica: Intermedio (67/100)

Fortalezas:

- Base SEO moderna en Astro/Next: canonical, OG/Twitter, hreflang, JSON-LD, robots y sitemap.
- Canonicalizacion de host y redirects legacy mejor resueltos.
- `noindex` en zonas privadas.

Debilidades:

- Conflicto directo de indexacion en `/companies` (sitemap + noindex).
- Riesgo de assets OG/Twitter inexistentes.
- `lastmod` de sitemap generado con `new Date()` en cada request.
- Quality gate SEO de CI aun no es estrictamente bloqueante.

## Evidencia clave (referencias de codigo)

### AutoRenta

- Canonical runtime: `autorenta/apps/web/src/app/core/services/ui/meta.service.ts:50`
- Robots: `autorenta/apps/web/public/robots.txt:4`
- Sitemap estatico: `autorenta/apps/web/public/sitemap.xml:1`
- JSON-LD home: `autorenta/apps/web/src/index.html:83`
- Headers: `autorenta/apps/web/public/_headers:6`

### AutaMedica

- Canonical/OG/Twitter base: `Autamedica/apps/web/src/components/seo/SeoMeta.astro:43`
- Robots publico: `Autamedica/apps/web/src/pages/robots.txt.ts:8`
- Sitemap publico: `Autamedica/apps/web/src/pages/sitemap.xml.ts:3`
- Redirect host canonico: `Autamedica/apps/web/src/middleware.ts:173`
- `noindex` companies: `Autamedica/apps/web/src/pages/companies/index.astro:16`
- `/companies` en sitemap: `Autamedica/apps/web/src/pages/sitemap.xml.ts:7`
- Lighthouse en workflow con tolerancia de fallo: `Autamedica/.github/workflows/autamedica-agentic.yml:305`

## Que debe hacer AutaMedica para igualarse/superar referencia profesional

Objetivo recomendado: pasar de 67/100 a **80+ (nivel Avanzado/Profesional)**.

### P0 (critico, 24-48h)

1. Resolver contradiccion de indexacion de `/companies`:
   - O bien quitar `noindex` en `apps/web/src/pages/companies/index.astro`.
   - O bien remover `/companies` del sitemap en `apps/web/src/pages/sitemap.xml.ts`.
2. Verificar y corregir assets OG/Twitter en `apps/web` y `apps/web-app` (URLs reales, accesibles y consistentes).
3. Reemplazar `lastmod = new Date()` en sitemap por fecha real de contenido/deploy.

Impacto esperado: +6 a +8 puntos.

### P1 (alto, esta semana)

1. Unificar politica de noindex privada en todos los portales (no solo companies):
   - Estrategia unica por middleware/headers para `/auth`, `/admin`, dashboards internos.
2. Definir una sola fuente de verdad de canonical host (`www` vs apex) y alinear docs + middleware + redirects.
3. Revisar cobertura de sitemap para rutas publicas reales y excluir privadas en todos los engines.

Impacto esperado: +4 a +6 puntos.

### P2 (gobernanza/CI, esta semana)

1. Convertir Lighthouse SEO en gate bloqueante en CI (sin `|| echo`).
2. Agregar budget minimo por categoria:
   - SEO >= 0.90
   - Best Practices >= 0.90
   - Performance >= 0.85
3. Publicar checklist SEO de release (robots/sitemap/canonical/schema/headers) y hacerlo obligatorio en merge a `main`.

Impacto esperado: +3 a +5 puntos.

### P3 (mejora continua, 2-4 semanas)

1. Auditar JSON-LD por vertical (Patients/Doctors/Companies) para evitar drift semantico.
2. Revisar consistencia de titles/descriptions por rutas y evitar duplicaciones.
3. Integrar validacion automatica de links canonicos, OG assets y hreflang en pipeline.

Impacto esperado: +2 a +4 puntos.

## KPI de salida (DoD SEO)

- Sin contradicciones `sitemap` vs `robots`/`noindex`.
- 100% de rutas publicas con canonical valido y OG/Twitter con asset existente.
- Lighthouse SEO bloqueante en CI y estable >= 0.90.
- Regresiones SEO detectadas automaticamente en PR antes de merge.

---

Estado final recomendado:

- **AutoRenta hoy**: Intermedio.
- **AutaMedica hoy**: Intermedio alto.
- **AutaMedica objetivo**: Avanzado/Profesional (80+) corrigiendo coherencia de indexacion y endureciendo CI SEO.
