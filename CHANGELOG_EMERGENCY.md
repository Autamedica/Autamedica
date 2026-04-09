# Registro de Trazabilidad: Restauración de Blog y Hotfixes (08/04/2026)

## Evento: Recuperación Crítica de Producción

Durante la jornada de hoy se detectaron múltiples incidentes que afectaron la visibilidad del contenido y la estabilidad del despliegue. Este documento sirve como registro oficial de las intervenciones realizadas.

### 1. Restauración de Índice del Blog

- **Problema:** El archivo `apps/web/src/pages/blog/index.astro` fue truncado accidentalmente, perdiendo más de 45 publicaciones activas.
- **Acción:** Recuperación quirúrgica del historial (`git checkout`) de la lista de artículos, restaurando la biblioteca completa de 50+ publicaciones sin revertir los nuevos estilos de diseño.

### 2. Publicación Hospital Italiano (Caso Zalazar)

- **Estado Inicial:** El artículo existía como archivo huérfano pero no era visible en la web. Título desactualizado y assets incorrectos.
- **Mejoras:**
  - Título actualizado a: **"Desglosando qué pasó con el doctor del Hospital Italiano: Propofol, Fentanilo y la Perversidad del Sistema"**.
  - Imagen de cabecera cambiada de una licencia de conducir (placeholder) a `ia-clinica.png` (recurso profesional).
  - Metadatos SEO optimizados para reflejar el análisis profundo solicitado.
  - Integración prioritaria en la primera posición del índice del blog.

### 3. Sistema de Audio Humanizado (TTS)

- **Innovación Técnica:** Implementación de `CardAudioButton.tsx` en las tarjetas del blog.
- **Capacidad:** Realiza un `fetch` en segundo plano del contenido completo del artículo, permitiendo al usuario escuchar el post entero sin salir del índice.
- **Humanización:** Configuración de síntesis de voz (`SpeechSynthesis`) utilizando voces premium de Google en español, con ajustes de cadencia (0.92) y tono (1.05) para una lectura natural y profesional.
- **UI:** Botón minimalista (icono gris) ubicado junto al tiempo de lectura, eliminando elementos de UI redundantes según feedback del usuario.

### 4. Estabilidad del Build y Deuda Técnica

- **Hotfix de Tipos:** Restauración de `database.types.ts` que se encontraba vacío (0 bytes), bloqueando la compilación.
- **Refactorización Neuro-Estabilidad:** Corrección de errores de tipos en `scoring.engine.ts` y `evaluate-stability.usecase.ts` donde se accedía a propiedades en tipos `unknown`.
- **Higiene de Código:** Eliminación de múltiples `any` explícitos y resolución de advertencias de ESLint para cumplir con los estándares de producción.
- **Fix de Tests:** Corrección de mocks en `anamnesis.service.test.ts` para incluir `domainEvents`.

## Estado Final

- **Rama:** `main`
- **Despliegue:** Exitoso (GitHub Actions Production Deploy ✓)
- **Trazabilidad:** Este registro documenta la secuencia de cambios manuales realizados sobre la rama principal.
