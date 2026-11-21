# AutaMedica — reglas operativas para agentes

## 1. Protección de Git y Kotlin

- Antes de cambiar de rama o ejecutar `pull`, `merge` o `rebase`, inspeccionar `git status --short --branch`, cambios staged/unstaged, archivos sin seguimiento y archivos `.kt`/`.kts` modificados.
- Preservar todos los cambios locales. Si el árbol está ocupado, trabajar en un `git worktree` aislado; nunca ocultar, descartar ni sobrescribir trabajo existente.
- Está prohibido ejecutar `git reset --hard`, `git checkout --`, `git clean -fd` o sobrescribir archivos locales/Kotlin sin orden explícita del fundador.
- En tareas de `web/`, `supabase/` o `infra/`, no modificar `android/` ni `apps/android/`, ni incrementar `versionCode` salvo pedido expreso.

## 2. QR y Farmacia Express

- El acceso de pacientes invitados sin login es diseño intencional: cero fricción. Nunca forzar registro ni login para iniciar o continuar ese flujo.
- Proteger cada solicitud con un token de sesión acotado a esa solicitud; no sustituir este diseño por autenticación obligatoria.

## 3. Gobernanza del fundador

- No agregar vetos comerciales ni bloqueos de producto hardcodeados.
- Los controles de riesgo deben ser configurables y estar gobernados por los roles `admin` / `platform_admin`.
- Respetar las decisiones explícitas del fundador sobre producto, prioridades y operación comercial.

## 4. Cero inventos y alcance mínimo

- Resolver sobre lo existente antes de crear componentes nuevos.
- No crear migraciones SQL, tablas, columnas ni módulos de gobernanza si el pedido puede resolverse sobre la estructura existente.
- No reportar `public.spatial_ref_sys` (PostGIS) como vulnerabilidad.
- No implementar Quality Gate 2.0, SBOMs, attestations, paneles propios, checklists OWASP ni nuevos workflows de CI salvo pedido expreso.

## 5. Identidad visual oficial

- Usar azul cielo: `#0EA5E9`, `#0284C7` y la escala `sky`.
- No usar Navy, Emerald ni Teal.

## 6. Entrega verificable

- Todo cambio debe cerrarse con tests reales, lint y typecheck en verde; reportar resultados reales y nunca declarar verde lo que no se ejecutó o falló.
- Antes de cerrar, comprobar el alcance del diff y confirmar que solo se modificaron los archivos pedidos.
- Reportar el SHA exacto publicado en `main`.
