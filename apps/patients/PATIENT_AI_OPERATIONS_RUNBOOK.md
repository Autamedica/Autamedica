# Patient AI Operations Runbook

Runbook operativo para activar y operar la personalización IA del portal `patients`.

## Objetivo

Activar en este orden:

1. Alertas determinísticas persistidas
2. Insights IA persistidos
3. Dashboard consumiendo `summary + alerts + latestInsight`
4. Job backend periódico para recalcular pacientes por lote

## Estado del código

Piezas relevantes:

- Snapshot + alertas derivadas:
  - `apps/patients/src/server/patient-insights.ts`
- Integración IA y ciclo de sincronización:
  - `apps/patients/src/server/patient-ai-analysis.ts`
- Worker periódico:
  - `apps/patients/src/server/patient-ai-sync-worker.ts`
- Trigger interno seguro:
  - `apps/patients/src/app/api/internal/patient-ai-analysis/sync/route.ts`
- Dashboard consumiendo vista enriquecida:
  - `apps/patients/src/app/api/dashboard/summary/route.ts`
  - `apps/patients/src/hooks/useDashboardSummary.ts`

## Orden recomendado de activación

No agregue todavía ninguna API key de proveedor.

1. Aplicar migraciones
2. Configurar variables no sensibles y secretos internos
3. Ejecutar `dry run`
4. Verificar DB y dashboard
5. Recién entonces agregar la API key del proveedor elegido
6. Ejecutar análisis real con batch chico
7. Dejar worker supervisado

## 1. Aplicar migraciones

Migraciones requeridas:

- `supabase/migrations/20260319170000_create_patient_derived_alerts.sql`
- `supabase/migrations/20260319173000_create_patient_ai_insights.sql`

### Opción A: SQL Editor

Proyecto actual en este repo:

- `qxjjrpksmwwrmubhvjew`

Abrir:

- `https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew/sql/new`

Ejecutar ambas migraciones en orden.

### Opción B: CLI

Si el proyecto ya está linkeado correctamente:

```bash
cd /home/edu/Autamedica
supabase db push
```

Si no quiere empujar todo el backlog, use SQL Editor para estas dos migraciones puntuales.

## 2. Configurar variables de entorno

Base server-side ya requerida por `patients`:

```env
SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Nuevas variables de personalización IA:

```env
PATIENT_AI_JOB_SECRET=generate_a_long_random_secret
PATIENT_AI_PROVIDER=auto
PATIENT_AI_OPENAI_MODEL=gpt-5.4-2026-03-05
PATIENT_AI_GEMINI_MODEL=gemini-2.5-flash
PATIENT_AI_SYNC_INTERVAL_MS=900000
PATIENT_AI_SYNC_BATCH_SIZE=10
PATIENT_AI_SYNC_STALE_HOURS=24
PATIENT_AI_SYNC_FAILED_RETRY_MINUTES=60
PATIENT_AI_SYNC_DRY_RUN=true
```

Agregue al final solo la key del proveedor que vaya a usar:

```env
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

## 3. Verificación previa sin proveedor

Con `PATIENT_AI_SYNC_DRY_RUN=true` y sin `OPENAI_API_KEY`, el ciclo debe:

- construir snapshots reales
- sincronizar alertas determinísticas
- no intentar generar insights reales
- devolver `provider_not_configured` como motivo de skip

### Route interno

```bash
curl -X POST "http://localhost:3002/api/internal/patient-ai-analysis/sync" \
  -H "Authorization: Bearer $PATIENT_AI_JOB_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":3,"dryRun":true}'
```

Esperado:

- `success: true`
- `providerConfigured: false`
- `skipped > 0`

## 4. Verificación en base de datos

### Alertas derivadas

```sql
select
  patient_id,
  source_kind,
  status,
  severity,
  title,
  updated_at
from public.patient_derived_alerts
order by updated_at desc
limit 20;
```

### Insights IA

Antes de cargar la API key, esta tabla puede estar vacía o solo tener fallos previos.

```sql
select
  patient_id,
  provider_name,
  model_name,
  status,
  created_at,
  error_message
from public.patient_ai_insights
order by created_at desc
limit 20;
```

## 5. Agregar la API key del proveedor

Solo después de validar migraciones, route interno y alertas derivadas.

### Opción A: OpenAI

```env
PATIENT_AI_PROVIDER=openai
OPENAI_API_KEY=...
```

### Opción B: Gemini

```env
PATIENT_AI_PROVIDER=gemini
GEMINI_API_KEY=...
```

Si usa `PATIENT_AI_PROVIDER=auto`, el servidor prioriza `OPENAI_API_KEY` y cae a Gemini cuando OpenAI no está configurado.

Mantener todavía:

```env
PATIENT_AI_SYNC_DRY_RUN=false
PATIENT_AI_SYNC_BATCH_SIZE=3
```

## 6. Primer análisis real controlado

### Route interno

```bash
curl -X POST "http://localhost:3002/api/internal/patient-ai-analysis/sync" \
  -H "Authorization: Bearer $PATIENT_AI_JOB_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit":3,"dryRun":false,"force":true}'
```

Esperado:

- `generated > 0`
- filas nuevas en `patient_ai_insights`
- dashboard mostrando `latestInsight`

## 7. Arrancar worker supervisado

Script disponible:

```bash
cd /home/edu/Autamedica
pnpm -C apps/patients ai:sync-worker
```

Recomendación operativa:

- correrlo bajo `systemd`, PM2, Docker restart policy o supervisor equivalente
- no dejarlo como proceso manual en terminal

Configuración inicial recomendada:

```env
PATIENT_AI_SYNC_INTERVAL_MS=900000
PATIENT_AI_SYNC_BATCH_SIZE=10
PATIENT_AI_SYNC_STALE_HOURS=24
PATIENT_AI_SYNC_FAILED_RETRY_MINUTES=60
PATIENT_AI_SYNC_DRY_RUN=false
```

## 8. Checklist de verificación

- Migraciones aplicadas
- `patient_derived_alerts` recibe filas
- `patient_ai_insights` recibe filas `generated`
- el route interno responde `200`
- el worker no pisa ciclos en paralelo
- el dashboard muestra `latestInsight`
- los pacientes sin datos muestran faltantes, no contenido inventado

## 9. Rollout recomendado

### Fase 1

- `dryRun=true`
- `batchSize=3`
- sin `OPENAI_API_KEY`

### Fase 2

- `dryRun=false`
- `batchSize=3`
- `force=true` vía route interno una vez

### Fase 3

- worker continuo
- `batchSize=10`
- `staleHours=24`

### Fase 4

- subir batch si el costo, latencia y errores quedan estables

## 10. Qué monitorear

- porcentaje de `generated` vs `failed`
- tiempo por ciclo
- edad del último insight por paciente
- errores de autenticación o de schema
- volumen de pacientes saltados por `fresh_generated_insight`

## 11. Fallas esperables

### `401` en route interno

- `PATIENT_AI_JOB_SECRET` faltante o header incorrecto

### `503 OPENAI_API_KEY no está configurada`

- esperado antes del último paso

### `500` al persistir

- migraciones faltantes
- `SUPABASE_SERVICE_ROLE_KEY` incorrecta

### `failed` recurrente en insights

- problema de modelo, cuota o schema de respuesta
- revisar `error_message` en `patient_ai_insights`

## 12. Comandos mínimos

```bash
# 1. Build de tipos si cambia schema
cd /home/edu/Autamedica
pnpm --filter @autamedica/types build

# 2. Validación de patients
pnpm --filter @autamedica/patients type-check

# 3. Worker local
pnpm -C apps/patients ai:sync-worker
```
