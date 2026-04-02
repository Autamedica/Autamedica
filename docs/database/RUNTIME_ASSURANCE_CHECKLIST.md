# Runtime Assurance Checklist

Usar este checklist para todo cambio que llegue o pueda llegar a producción.

## Antes de aplicar

1. Confirmar el estado real del proyecto.
2. Confirmar el estado real de migraciones remotas.
3. Confirmar si el proyecto tiene limitaciones de plan relevantes.
4. Confirmar si el cambio depende de:
   - backups gestionados
   - PITR
   - features de Auth del plan
   - extensiones o runtime del proveedor

## Durante el cambio

1. No asumir que una migración en repo ya está aplicada.
2. No asumir que `db push` es la única fuente de verdad.
3. Si hay drift, registrarlo y corregirlo.
4. Si el cambio se aplica manualmente, dejar también migración reproducible.

## Después de aplicar

1. Verificar estado por API o dashboard.
2. Verificar Advisor relevante:
   - security
   - performance
3. Verificar `schema_migrations`.
4. Verificar índices/policies/funciones afectadas.
5. Verificar si el cambio introdujo warnings nuevos.

## Criterio de cierre

Un cambio no se considera realmente resuelto si:

1. solo existe en repo
2. depende de caché o interpretación visual
3. está bloqueado por el plan y no fue declarado como mitigado
4. no tiene runbook operativo

## Mitigaciones mínimas

Si no puede resolverse completamente, dejar explícito:

1. qué quedó mitigado
2. qué sigue abierto
3. qué depende del plan
4. cómo verificarlo más tarde
