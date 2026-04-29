# Branch protection y gates obligatorios

Este documento define el contrato operativo para que `main` sea una rama protegida y desplegable.

## Checks obligatorios para PR

- `CI / Build`: build de paquetes core, arquitectura, typecheck y build web.
- `CI / Lint`: ESLint completo y hardcode check.
- `CI / Tests`: unit tests del monorepo.
- `CI / CI`: agregador que falla si Build, Lint o Tests fallan.
- `Quality Gates / DB Type Drift`: obligatorio cuando cambian migraciones o tipos DB.
- `Quality Gates / Architecture v2`: obligatorio cuando cambian apps, packages, config, Supabase, scripts o docs relevantes.
- `Quality Gates / Edge Functions`: obligatorio cuando cambian `supabase/functions/**`.
- `Quality Gates / Policies`: policy y hardcode check.
- `Security / Audit`: dependency audit.
- `Security / Secrets`: TruffleHog y patrones sensibles en diffs.
- `E2E / Critical Paths`: rutas criticas web.
- `PR Validation / PR Quality`: WIP guard, tamano, secretos, binarios y calidad basica del PR.

## Checks no bloqueantes

- `CI / RLS`: queda no bloqueante si falta `SUPABASE_DB_URL`, pero debe revisarse en cambios de RLS.
- `Quality Gates / Clinical`: observabilidad clinica queda no bloqueante hasta que el schema faltante aterrice.
- `E2E / Production`: manual para verificacion post-deploy.
- `Runner Canary`: manual para diagnosticar el runner.

## Reglas de merge

- Requerir branch actualizado antes de merge.
- Requerir al menos una aprobacion humana.
- Bloquear merge con conversations unresolved.
- Bloquear force-push y deletion de `main`.
- Usar squash merge para PRs chicos y merge commit solo para stacks deliberados.

## Stacked PRs

Los PRs deben apuntar a `main` salvo que sean un stack explicito. Si hay stack, la base del PR debe ser el PR anterior y el titulo/body debe declararlo.

Cuando un PR del stack se mergea, rebasear los siguientes antes de pedir review. Esto evita que una falla en la base se replique como ruido en todos los PRs.

## Deploy production

- Web deploy corre automaticamente en `push` a `main`.
- DB/functions deploy es manual con `workflow_dispatch.deploy_database=true`.
- Un deploy de DB/functions requiere revisar migraciones, secrets de Supabase y funciones incluidas antes de ejecutar.
