

## Pull Request Governance (AutaMedica)

- **Título obligatorio:** `tipo(área): resultado concreto`. Tipos: `security`, `fix`, `feat`, `refactor`, `test`, `docs`, `chore`, `release`. Áreas: `android`, `web`, `api`, `supabase`, `pharmacy`, `farmalink`, `memed`, `renaper`, `billing`, `infra`, `governance`.
- **Ramas:** `tipo/descripcion-corta`, por ejemplo `fix/android-realtime-guardia` o `security/pharmacy-isolation-ar-br`.
- **Prioridad:** asignar exactamente una etiqueta `priority:P0` (crítico/producción), `priority:P1` (bloquea operación), `priority:P2` (funcionalidad/mejora) o `priority:P3` (mantenimiento menor).
- **Destino:** abrir contra `main`, salvo que la estrategia de integración justifique y documente otra rama base.
- **Contenido:** completar `.github/pull_request_template.md` con objetivo único, impacto, pruebas reales y checklist.
- **Validación:** `.github/workflows/pr-governance.yml` verifica el título en cada apertura o actualización del PR y avisa si falta la etiqueta de prioridad.

La gobernanza exige CI y validaciones técnicas, pero no agrega una aprobación humana obligatoria ni elimina el bypass administrativo del propietario del repositorio.
