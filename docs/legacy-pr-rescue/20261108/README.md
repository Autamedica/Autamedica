# Rescate auditado de PR históricos — 2026-11-08

Este directorio conserva **evidencia histórica**, no documentación operativa vigente. Ningún artefacto de este PR autoriza despliegues, cambios de configuración, recetas médicas, pagos o ejecución sobre producción.

## Proveniencia y uso

| PR original | Artefacto recuperado | Propósito | Restricción |
| --- | --- | --- | --- |
| [#617](https://github.com/ecucondorSA/Autamedica/pull/617) | `openclaw-mcp-relay-migration.md` | Historial de recuperación Oracle/OpenClaw y gate de actualización | Diagnóstico fechado 2026-10-31; **no ejecutar migraciones, reinicios, habilitación MCP o SSH** sin autorización explícita y backup verificado |
| [#628](https://github.com/ecucondorSA/Autamedica/pull/628) | `commercial-intelligence/README.md` | Hallazgos comerciales iniciales y diccionario KPI | Snapshot de 2026-11-01; no representa ingresos/cobros actuales |
| [#628](https://github.com/ecucondorSA/Autamedica/pull/628) | `commercial-intelligence/commercial-kpi-readonly.sql` | Plantillas SQL agregadas | **No ejecutadas ni validadas en esta copia**; revisar esquema, RLS y privacidad; nunca publicar como API |
| [#664](https://github.com/ecucondorSA/Autamedica/pull/664) | `scripts/memed-homologation-artifact-check.mjs` | Inspección manual GET-only de evidencia Memed DEMO | Homologación exclusivamente; no certifica receta emitida, firma, PDF legal ni aptitud para producción |

Los enlaces originales del archivo son permanentes en el historial GitHub. Este PR copia el contenido sin activar nuevos workflows.

## Más PR revisados

- [#490](https://github.com/ecucondorSA/Autamedica/pull/490): cerrado; el workflow WebRTC existe en `main`. **Revisar por separado** el cron diario y el valor manual predeterminado `production`; el cierre no desactiva el flujo.
- [#585](https://github.com/ecucondorSA/Autamedica/pull/585) y [#657](https://github.com/ecucondorSA/Autamedica/pull/657): cerrados, evidencia de diagnóstico Supabase conservada en sus conversaciones. No se deduce causa del CPU alto ni corrección del desajuste de memoria.
- [#549](https://github.com/ecucondorSA/Autamedica/pull/549): cerrado; los dos tests rescatables ya tienen el mismo blob SHA en `main`; #550 sigue independiente.
- [#580](https://github.com/ecucondorSA/Autamedica/pull/580): cerrado; propuesta superada por integración Memed más reciente; #581 y #704 siguen pendientes de validación.
- [#491](https://github.com/ecucondorSA/Autamedica/pull/491): cerrado; seis tests Android ya existen en `main`, cuatro con blob idéntico y dos en versiones posteriores más amplias; los 45 archivos OBS/Twitch de ese PR no se arrastran.
- [#523](https://github.com/ecucondorSA/Autamedica/pull/523): **NO CERRAR aún**. Ocho test files de la rama no figuran bajo el mismo path en `main`: `EmergencyDialInfoTest`, `DoctorSignatureViewModelTest`, `PrescriptionRegulatoryFormattingTest`, `VideoCallUiStateClinicalHierarchyTest`, `CountryContextTest`, `util/CpfValidatorTest`, `core/util/AdversarialCpfValidatorTest` y `core/util/CpfValidatorTest`. Verificar cobertura equivalente, dependencias y compilación Android actual antes de rescatar o descartar. No fusionar 116 archivos antiguos en bloque.

## Criterios de validación de este PR

- Inspeccionar diff: únicamente archivos documentales archivados y un verificador manual Memed existente en rama antigua.
- Confirmar que `scripts/memed-homologation-artifact-check.mjs` NO está referenciado por cron, workflows o despliegues automáticos.
- Validación estática únicamente; no ejecutar consultas SQL ni contactar APIs clínicas ni producción para aprobar este archivo.
- Mantener `#523` abierto hasta una verificación independiente. `#617/#628/#664` pueden cerrarse como *superseded* una vez cotejadas copias con blob SHA idéntico en el PR de rescate #737; **el rescate sigue pendiente de merge en `main`** y no debe confundirse con una funcionalidad desplegada.
