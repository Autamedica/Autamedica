# AutaMedica — rescate de PR históricos (2026-11-08)

Este directorio es un **archivo selectivo de material útil**, NO código aprobado para integración. Está alojado **solo en la rama `archive/pr-rescue-20261108-audit10`**, separado de `main`. Ningún workflow, prueba Kotlin, SQL o integración se ejecuta automáticamente por conservar estas copias.

## Origen e inventario (16 copias exactas, SHA de blob contrastado)

- **#617 — OpenClaw / Oracle:** `openclaw-mcp-relay-migration.md`. Diagnóstico histórico, recuperación de disco y condiciones de backup previas a actualizaciones; no copiar los 8 workflows temporales de GitHub Actions.
- **#628 — inteligencia comercial:** `commercial-intelligence/README.md` y `commercial-intelligence/commercial-kpi-readonly.sql`. Snapshot fechado 2026-11-01, con datos históricos y SQL de lectura que requiere un rol autorizado, revisión de esquema y privacidad. No ejecutar ni instalar en producción.
- **#664 — Memed:** `memed-homologation-20261103.md` y `memed-homologation-artifact-check.mjs`. Verificador histórico exclusivamente para sandbox; NO ejecutar automáticamente ni interpretar PDF como firma clínica. No se confirmó emisión de recetas ni homologación completa.
- **#523 — Android:** nueve pruebas Kotlin históricas en `android-tests/pr523/`: `EmergencyDialInfoTest`, `DoctorSignatureViewModelTest`, `PrescriptionRegulatoryFormattingTest`, `VideoCallUiStateClinicalHierarchyTest`, `CountryContextTest`, dos `CpfValidatorTest` (paquetes distintos), `AdversarialCpfValidatorTest` y antigua `AutoDegradeServiceTest`. Antes de portar, contrastar con APIs Kotlin 1.2.22, permisos y CI, porque las dependencias pueden haber cambiado. No se trasladan los 116 archivos originales en bloque.
- **#491 — Android:** versiones históricas `NavigationFlowTest` y `TelemedicineRepositoryImplTest` en `android-tests/pr491/`. Las versiones actuales en `main` son diferentes; las demás pruebas relevantes analizadas ya estaban presentes en `main`. No trasladar material OBS/Twitch (45 archivos) ni el workflow GitHub Actions antiguo.

## Límites

1. El archivo **no es una aprobación de merge** y no demuestra que las pruebas Kotlin compilen ni pasen hoy.
2. No modificar `main`, Supabase, Cloudflare, Google Play ni pagos para realizar el rescate.
3. Los 16 archivos fueron copiados de sus ramas originales **sin modificar contenidos**; sus hashes blob fueron comprobados por comparación en GitHub.
4. Los PR originales y sus commits conservan el contexto histórico y el código no seleccionado. Si alguna función vuelve a ser necesaria, crear un PR específico y actualizado sobre `main` con tests y revisión clínica/seguridad.
5. No conectar el script Memed a producción, ni ejecutar el SQL fuera de un contexto de auditoría autorizado.
