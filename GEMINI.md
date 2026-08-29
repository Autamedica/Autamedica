# GEMINI.md: AutaMedica Core Intelligence

> **Fuente de Verdad para el Agente Gemini en AutaMedica.**
> Este documento define el contexto, las reglas inquebrantables y los flujos de trabajo estándar.

## Regla de Higiene de Repo (NUNCA REGRESIVO)

**Invariantes**

- Root solo contiene runtime/config/docs core.
- Prohibido versionar `tmp-*`, logs, screenshots, `*.pid`, dumps y outputs locales de debugging.
- `dist/`, `.astro/`, `.next/`, `.open-next/` nunca se commitean.
- Todo reporte técnico debe tener fecha/owner/TTL; reportes stale se archivan.
- Si aparece un nuevo patrón de artefacto local, actualizar `.gitignore` en el mismo commit.

**Checklist obligatorio**

1. `git status --short` limpio de ruido.
2. `pnpm lint && pnpm typecheck` limpios.
3. `pnpm --filter @autamedica/web check` con 0 errors.
4. Validar rutas tras `git mv` con `grep -r`.

---

## 1. Reglas Operativas Inquebrantables (Core Protocol)

> Estas reglas tienen precedencia sobre cualquier otra instrucción. Son el "sistema operativo" del agente.

### REGLA #0: Cero Código sin Integración

- **Prohibido** generar código que no tenga consumidor real en el mismo PR/commit.
- Si al borrar ese código no se rompe nada, probablemente no debía existir.
- **Checklist:**
  - [ ] Hay al menos un consumidor real (página Astro, island React, API endpoint, package, Edge Function).
  - [ ] Flujo completo trazable: trigger → resultado visible al usuario.
  - [ ] El código nuevo no queda huérfano.

### REGLA #1: Packages Orquestan, Islands Ejecutan

- **Packages (`packages/*`):** tipos compartidos, lógica de negocio, auth, hooks — sin lógica de presentación.
- **Islands React (`.tsx` con `client:*`):** estado local e interactividad — sin lógica de negocio inline.
- **Páginas Astro (`.astro`):** markup estático + composición de islands.
- **Edge Functions:** lógica de backend, queries complejas, integraciones externas.
- **Prohibido** duplicar lógica entre packages y apps.

### REGLA #3: Validación Cross-Layer (UI ↔ DB)

- **Nunca asumir** que el código local coincide con producción.
- **Antes de codificar:** Verificar nombres reales de columnas (`information_schema`) y RPCs (`pg_proc`) en prod.
- **Durante:** Si Edge Function escribe `col_x`, el RPC que lee debe leer `col_x`.
- **Después:** Validar end-to-end (trigger real → DB state → UI update).
- **En apps/web (Astro):** Variables `PUBLIC_*`, `import.meta.env`, middleware con `defineMiddleware`.

### REGLA #4: Prohibido Stubs Destructivos

- **Mandato:**
  1. NUNCA usar `CREATE OR REPLACE` sobre funciones existentes sin leer su código actual.
  2. Migraciones `DROP/CREATE TABLE` deben preservar TODAS las columnas existentes.
  3. Verificar post-deploy que la lógica crítica (ej: RLS médica) sigue activa.

### REGLA #5: Tolerancia Cero a TODOs (Zero Debt Policy)

- **Prohibición Total:** Terminantemente prohibido dejar `// TODO`, `// FIXME`, o comentarios tipo "optimizar luego".
- **Filosofía:** Si una tarea es necesaria, se implementa AHORA. Si no es necesaria, no se menciona.
- **Excepciones Únicas** (formato obligatorio: `// TODO(tipo): [Contexto] Razón detallada`):

| Tipo      | Uso Permitido                                                             | Ejemplo                                                                               |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `blocked` | Bloqueo externo real (API de terceros caída o inexistente)                | `// TODO(blocked): [Certificación ANMAT] Esperando aprobación regulatoria Q3 2026`    |
| `risk`    | La solución correcta requiere migración masiva de datos médicos peligrosa | `// TODO(risk): [HistoriaClinica] Requiere migración de datos con HIPAA review antes` |
| `flag`    | Código detrás de Feature Flag explícito                                   | `// TODO(flag): [VideoConsulta] Habilitar cuando WebRTC cert HIPAA esté listo`        |

- **Cualquier otro TODO será considerado un error.**

### REGLA #6: Diagnósticos Transparentes (Prohibido Errores Genéricos)

- **Mandato:** Todo bloque `catch` o flujo de error crítico (ej: generación de PDFs, llamadas externas, integraciones de pago, actualizaciones de DB) debe **capturar y propagar detalles específicos del error**.
- **Prohibido:** Generar códigos de error opacos o mudos (ej: un simple `pdf_generation_failed`) sin adjuntar los detalles técnicos (`error.message`, stack trace, etc.). El error debe permitir identificar la causa exacta del fallo al primer vistazo en el cliente o los logs de red.
- **Patrón Recomendado:**
  ```typescript
  try {
    // Lógica sensible
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error("Error en proceso crítico", { error });
    return fail({ code: "pdf_generation_failed", details });
  }
  ```
  Y en el controlador o API endpoint, mapear y retornar `details` en el cuerpo del JSON de error `HTTP 500`.

---

## 2. Supabase & DB Hardening (Dos Planos)

### El Principio de los "Dos Planos"

Para cualquier feature o bug de datos, analizar y validar siempre en dos niveles:

1. **Plano UI/Client Gating:**
   - Middleware Astro, guards, filtros, estados disabled, overlays visuales.
   - _Objetivo:_ UX y feedback al usuario.

2. **Plano DB Enforcement:**
   - Enums, Constraints, Triggers, RLS Policies, RPC logic.
   - _Objetivo:_ Integridad de datos y seguridad real (especialmente crítico para datos médicos).

**Regla:** Las reglas de negocio críticas (ej: "No mostrar datos de paciente sin autenticación") se **enforcean en DB** y se **reflejan en UI**.

### Auth Context

- `auth.uid()` en Postgres/RLS solo funciona si se reenvía el JWT del usuario.
- En Edge Functions: usar `supabaseClient` con `Authorization` header del request original para operaciones user-scoped.

### Diagnóstico de Auth (No culpes al Token)

- **Anti-Patrón:** Ver un 401/403 y decir "El token expiró, logueate de nuevo".
- **Investigación correcta:**
  1. ¿El header `Authorization` llegó a la Edge Function? (Logs)
  2. ¿El usuario existe en `auth.users`? (DB)
  3. ¿El usuario tiene el rol correcto en `user_metadata`? (DB)
  4. ¿El RLS permite la operación? (Policy Audit)
  5. Solo después de descartar todo esto, sugerir refresh de token.

---

## 3. Insights Operativos (Gotchas)

- **Payload Trust (Seguridad Crítica):** En Edge Functions, **NUNCA** confiar en `req.body.user_id`. La única fuente de verdad para la identidad es `auth.getUser()` (JWT). Datos médicos con identidad incorrecta = violación de privacidad.

- **The "Hollow Backend" Risk:** Una función SQL que retorna `true` hardcodeado (Stub) no es una "tarea pendiente", es un **BUG CRÍTICO**. Crea una falsa sensación de progreso y puede exponer datos médicos a usuarios no autorizados.

- **`@autamedica/shared` requiere build previo:** Si aparece `Cannot find module '@autamedica/shared'` al correr `astro check`, ejecutar `pnpm build:packages:core` primero.

- **Cookies en Astro middleware:** `AstroCookies` no tiene `getAll()`. Parsear el Cookie header directamente: `request.headers.get('cookie').split('; ')`. `AstroCookies.set()` acepta `AstroCookieSetOptions` — castear con `as any` si Supabase SSR pasa `Partial<CookieSerializeOptions>`.

- **`styled-jsx` es Next.js only:** Al migrar componentes a `apps/web` (Astro), reemplazar `<style jsx>` y `<style jsx global>` con `<style>` regular.

- **Imports con extensión `.tsx` en archivos `.astro`:** TypeScript en Astro rechaza `import Foo from './Foo.tsx'`. Omitir la extensión: `import Foo from './Foo'`.

- **`next/dynamic` → imports estáticos en Astro:** Las directivas `client:*` de Astro reemplazan `dynamic()`. Usar imports estáticos + `client:visible` para lazy load.

- **Variables de entorno Astro vs Next.js:** `PUBLIC_SUPABASE_URL` (Astro) ≠ `NEXT_PUBLIC_SUPABASE_URL` (Next.js). En `apps/web` siempre usar `PUBLIC_*` y `import.meta.env`.

- **PL/pgSQL lazy validation:** PostgreSQL NO valida nombres de columnas al crear funciones — solo al ejecutarlas. Una función que compila OK puede fallar en runtime si la columna real tiene otro nombre.

- **Supabase UPDATE sin WHERE:** Supabase bloquea `UPDATE tabla SET ...` sin `WHERE`. Agregar `WHERE true` si el UPDATE es intencional sobre toda la tabla.

- **Baseline desde prod (OBLIGATORIO):** NUNCA consolidar migraciones concatenando archivos SQL manualmente. Usar `pg_dump --schema-only` o Supabase Management API para obtener schema real de prod como baseline.

- **Limitación de RLS (Objeto OLD):** Las cláusulas `WITH CHECK` de políticas RLS para `UPDATE` NO tienen acceso a `OLD`. Solo Triggers tienen acceso a `OLD`. Para validar cambios de campos específicos (ej: evitar que un paciente cambie su `doctor_id`), usar Triggers procedurales.

- **Turbo cache invalidation:** Si Turbo usa cache obsoleta, usar `--force` o limpiar `.turbo/` local.

### Hexagonal Layered Architecture — Patrones Transversales

Sobre las 7 capas base (UI → Hook → Service → API Client → Controller → Service → Repository), se aplican 4 patrones adicionales:

- **Ports** (`packages/types/src/ports/`): Interfaces abstractas de repos (`IPatientRepository`, `IAnamnesisRepository`, `IAppointmentQueryRepository`). Cada repo tiene un `createXxxAdapter(supabase)` factory. Permite mock testing sin DB.
- **Domain Events** (`packages/shared/src/events/`): `domainEvents.emit('appointment.completed', payload)` / `domainEvents.on(...)`. Tipado con `DomainEvents` map. Complementa (no reemplaza) Supabase Realtime.
- **Use Cases** (`apps/web/src/lib/*/usecases/*.usecase.ts`): Flujos de negocio completos con inyección de dependencias. Ej: `completeAnamnesis(deps, input)`, `startTeleconsultation(deps, input)`.
- **CQRS Lite** (`apps/web/src/lib/*/queries/*.query.ts`): Read models de dashboard separados de services. Ej: `queryDashboardStats()`, `queryNotificationFeed()`.

Detalle: `docs/ARQUITECTURA.md` sección "Patrones Avanzados".

---

## 4. Contexto & Memorias Activas

### Perfil del Proyecto

- **Proyecto:** AutaMedica — plataforma de telemedicina (Argentina)
- **Ubicación:** `/home/edu/Autamedica`
- **Stack Tecnológico:**
  - **Frontend Web (landing):** Astro 5 + React 19 islands (MIGRACIÓN ACTIVA desde Next.js)
  - **Frontend Apps:** Next.js 15 — portales auth, doctors, patients, companies, admin
  - **Build:** Turborepo 2.x + pnpm workspaces
  - **Estilos:** Tailwind CSS (preset `@autamedica/tailwind-config`)
  - **Backend:** Supabase (PostgreSQL, Edge Functions, Auth, Storage)
  - **Deploy:** Cloudflare Pages (por app)
  - **Video:** WebRTC (signaling server propio)
- **Filosofía Actual:** "Excelencia Operacional + Migración Progresiva" (Next.js → Astro, app por app).
- **Regulatorio:** HIPAA, Ley 26.529 (Argentina — derecho del paciente), Ley 25.326 (datos personales).

### Estado Actual (Fase 1: Migración Landing & Integración CEEDS)

- **Astro Core & Landing (`apps/web`):** Totalmente migrado y en despliegue activo.
- **Sistema Clínico CEEDS v2.2:** Integrado y fusionado a `main` mediante el PR #465. Incluye el panel `/admin/clinical` con el `CEEDSDashboard` de React en Astro, endpoints API robustos, el outbox worker deduplicado con directivas de severidad por entorno (UTI/Guardia) y el ciclo de vida de equipamientos con bloqueo de seguridad y gates de calibración ANMAT.
- **Validación Completa:** Suite local de 433 unit tests y `astro check` en verde (0 errores). CI/CD remoto verificado y aprobado.
- `apps/web-app` (Next.js): legacy. Mantener estable, no invertir esfuerzo.
- `apps/auth`, `apps/doctors`, `apps/patients`, `apps/companies`, `apps/admin`: Next.js, en producción.
- **Regla de migración:** No migrar el siguiente app a Astro sin que el anterior esté deployado y verificado.

### Dominio Médico (AutaMedica)

- **Consultas:** Médico + Paciente se conectan por video/chat. El médico prescribe; el paciente recibe.
- **Flujo principal:** Registro → Selección de especialidad → Selección de médico → Consulta → Receta digital.
- **Portales:**
  - Pacientes (`/dashboard`): agendar consulta, ver historial, descargar recetas.
  - Médicos (`/doctor/dashboard`): ver agenda, consultas pendientes, prescribir.
  - Empresas (`/company/dashboard`): gestionar colaboradores, ver métricas de salud.
  - Admin (`/admin/dashboard`): gestión global, aprobación de médicos, reportes.

### Supabase Project

- **Project ID:** `qxjjrpksmwwrmubhvjew`
- **URL:** `https://qxjjrpksmwwrmubhvjew.supabase.co`

### Firebase Project (Android Push Notifications)

- **Cuenta Gmail:** `autamedica@gmail.com` ← DUEÑA del proyecto Firebase
- **Project ID:** `autamedica-e54fa`
- **Project Number (Sender ID):** `653971537811`
- **Android App ID:** `1:653971537811:android:08a5441d27cef1d7f37266`
- **Package Name:** `com.autamedica.android`
- **API Key (Android):** `AIzaSyAS-c0uUDU0hyUVJFIb5A8Xndq3FXHKRZs`
- **Plan:** Spark (gratuito)
- **Console:** `https://console.firebase.google.com/u/1/project/autamedica-e54fa`

### Cuentas y Servicios (Referencia Rápida)

| Servicio                 | Cuenta/Email             | Notas                           |
| ------------------------ | ------------------------ | ------------------------------- |
| **Firebase (FCM, Auth)** | `autamedica@gmail.com`   | Proyecto `autamedica-e54fa`     |
| **Supabase**             | (verificar en dashboard) | Proyecto `qxjjrpksmwwrmubhvjew` |
| **Google Cloud (GCP)**   | `autamedica@gmail.com`   | Mismo proyecto que Firebase     |
| **Cloudflare Pages**     | (verificar en dashboard) | Deploy de apps web              |
| **GitHub**               | (verificar en settings)  | Repo monorepo AutaMedica        |

> **REGLA:** Nunca asumir en qué cuenta está un servicio. Consultar esta tabla primero.

## 4a. YouTube / OBS Content Ops

Estas herramientas viven en `tools/obs/` y se usan para el pipeline local de contenido de
AutaMedica. Elegir el script correcto evita subir versiones equivocadas o romper metadata ya
publicada.

### Matriz de Scripts

| Necesidad | Script / comando | Cuándo usarlo | Cuidado operativo |
| --- | --- | --- | --- |
| Editar silencios de un raw ya grabado | `python3 tools/obs/process_video_edits.py <video>` | Primer pase local de postproducción después de tener el video y/o JSON de Whisper | Lee `<video>.json`. El comportamiento actual acelera silencios a `5x` porque `SILENT_SPEED = 5.0`; revisar esa constante antes de esperar cortes secos. |
| Generar subtítulos sincronizados con edición de silencios | `python3 tools/obs/generate_srt.py <video>` | Después de editar silencios y antes de subir/importar a editor | Genera `_ai_silence.srt` y `_ai_speed.srt`. Si el MP4 final tuvo nuevos inserts, concat o reemplazos visuales, verificar sincronía contra el archivo final exacto. |
| Subir video largo/VOD a YouTube | `python3 tools/obs/youtube_upload.py <video> "<title>" <description_file_or_text> private` | Cuando el MP4 final, título y descripción están listos | Subir siempre como `private`. Este script no sube subtítulos ni asigna playlists; para eso usar llamadas YouTube API con `youtube.force-ssl`. |
| Reautorizar YouTube para editar videos existentes | `python3 tools/obs/youtube_reauth_force_ssl.py` | Antes de modificar metadata publicada, canal, playlists o captions | Necesario si aparece `insufficient authentication scopes`. Guarda `/home/edu/.youtube-credentials.json` con `youtube.upload`, `youtube.readonly` y `youtube.force-ssl`. Si `localhost` falla, usar el redirect de Supabase registrado. |
| Auditar performance del canal | `python3 tools/obs/youtube_analytics_audit.py --days 28` | Para decidir que temas repetir, que videos retitular y donde mejorar retención | Solo lectura. Exporta JSON/Markdown en `video_exports/youtube_developer_tools/`. Combina YouTube Data API y YouTube Analytics API. |
| Revisar/subir subtítulos | `python3 tools/obs/youtube_captions_sync.py list --video-id <id>` / `python3 tools/obs/youtube_captions_sync.py upload --video-id <id> --file <srt> --replace --apply` | Cuando un video publicado necesita captions sincronizados | El upload es dry-run si no se pasa `--apply`. `captions.insert` consume mucha cuota; no reintentar en bucle si falla por cuota. |
| Descargar/actualizar subtítulos | `python3 tools/obs/youtube_captions_sync.py download --caption-id <id> --output <file.srt>` / `python3 tools/obs/youtube_captions_sync.py update --caption-id <id> --video-id <id> --file <srt> --apply` | Antes de reemplazar captions existentes | Descargar backup antes de actualizar. |
| Ordenar secciones del canal | `python3 tools/obs/youtube_channel_sections.py` / `python3 tools/obs/youtube_channel_sections.py --apply` | Para exponer playlists canónicas en la home del canal | Dry-run por defecto. Crea secciones faltantes tipo `singlePlaylist` solo con `--apply`. |
| Triar comentarios | `python3 tools/obs/youtube_comments_triage.py --max-results 100` | Para encontrar preguntas clínicas, oportunidades de respuesta y posible spam | Solo lectura. No responde ni oculta comentarios; deja reportes JSON/Markdown. |
| Responder/moderar comentarios | `python3 tools/obs/youtube_comments_actions.py reply --comment-id <id> --text "<respuesta>" --apply` | Solo después de revisar triage manualmente | Dry-run si no se pasa `--apply`. No dar consejo médico personalizado en comentarios. |
| Release completo de YouTube | `python3 tools/obs/youtube_release_manager.py --video <mp4> --title "<titulo>" --description <txt> --thumbnail <jpg> --captions <srt> --playlist <key> --apply` | Cuando hay paquete final con video, miniatura, subtítulos y playlist | Puede subir video o decorar un `--video-id` existente. Mutaciones solo con `--apply`. |
| Optimizar metadata en lote | `python3 tools/obs/youtube_metadata_optimizer.py plan --limit 120` / `python3 tools/obs/youtube_metadata_optimizer.py apply --plan <json> --apply` | Para reparar descripciones finas y pocos tags | Conservador: no cambia privacidad ni borra videos. Revisar plan JSON antes de aplicar. |
| Enrutar videos a playlists | `python3 tools/obs/youtube_playlist_router.py --limit 120` / `python3 tools/obs/youtube_playlist_router.py --limit 120 --apply` | Para ubicar videos existentes en playlists canónicas | Agrega membresías faltantes; no remueve videos de playlists. |
| Generar Shorts del análisis Pereira/UFC | `python3 tools/obs/generate_shorts_pereira.py` | Para cortar los Shorts verticales del master `06_youtube_final_callouts_720p.mp4` | Hardcoded para ese master y timestamps. Cambiar constantes antes de reutilizar en otro video. |
| Subir Shorts Pereira/UFC | `python3 tools/obs/upload_shorts_pereira.py` | Después de generar los Shorts Pereira | Sube como `private`; títulos/descripciones están hardcoded para ese lote. |
| Scripts viejos de Shorts | `tools/obs/upload_shorts.py`, `scratch/generate_and_upload_shorts.py` | Solo si el input/config hardcoded coincide con el proyecto actual | Tratar como legacy. No usarlos para Pereira ni para el claim-safe master sin auditar rutas, timestamps y metadata. |

### Reglas para Operaciones de YouTube API

- Antes de cualquier cambio masivo de metadata, guardar backup JSON en
  `video_exports/youtube_channel_optimization/`.
- Para subir video largo, usar `youtube_upload.py`; para editar videos existentes o canal,
  usar `get_authenticated_service()` después de reauth con `youtube_reauth_force_ssl.py`.
- No cambiar privacidad ni borrar videos en lote sin una instrucción explícita del usuario.
- Cuando se actualizan títulos/descripciones/tags, generar primero un plan JSON, luego aplicar,
  y finalmente auditar con una nueva lectura de YouTube API.
- Si `captions().insert()` devuelve `quotaExceeded`, no insistir: esperar reset de cuota o cargar
  el `.srt` manualmente desde YouTube Studio.
- Los scripts nuevos de mantenimiento comparten autenticación en `tools/obs/youtube_api_utils.py`.
  Cualquier cambio público o potencialmente destructivo debe exigir `--apply`; las auditorías deben
  quedar en modo solo lectura por defecto.
- Orden semanal recomendado: `youtube_analytics_audit.py`, luego `youtube_comments_triage.py`,
  después captions en videos prioritarios y recién al final ajustes de secciones/metadata.
- Para nuevas publicaciones, preferir `youtube_release_manager.py` cuando ya existan miniatura,
  SRT y playlist objetivo. El script legacy `youtube_upload.py` queda para subidas simples.
- Para reparaciones masivas: correr auditoría, generar plan con `youtube_metadata_optimizer.py`,
  revisar JSON y recién aplicar. No cambiar privacidad ni borrar videos en estos flujos.
- Playlists canónicas creadas el 2026-07-05:
  `AutaMedica Shorts`, `Telemedicina y salud digital`,
  `UFC biomecánica y medicina deportiva`, `IA médica y automedicación`,
  `Tutoriales AutaMedica`, `Educación médica y prevención`.
- Logs útiles del último mantenimiento:
  `video_exports/youtube_channel_optimization/final_metadata_audit_2026-07-05.json` y
  `video_exports/youtube_channel_optimization/youtube_api_structuring_2026-07-05.json`.

### Posicionamiento de Contenido YouTube

- No tratar a AutaMedica como un canal genérico de telemedicina. La promesa más fuerte es:
  `medicina real explicada con casos reales`.
- Cuando se generen títulos, guiones, Shorts, miniaturas o descripciones, copiar la estrategia de
  canales médicos/ciencia fuertes, no su contenido:
  - Doctor Mike: medicina conectada a cultura, reacciones y situaciones virales conocidas.
  - La Hiperactina: biomedicina clara con personalidad y hooks simples.
  - ZDoggMD: autoridad médica + crítica del sistema + entretenimiento.
  - Mayo Clinic/Cleveland Clinic/Osmosis: orden clínico, confianza y explicación clara.
- Fórmula default para piezas AutaMedica:
  `caso viral -> conflicto médico -> evidencia visual -> explicación simple -> aprendizaje útil -> CTA suave a AutaMedica`.
- Preferir series reconocibles sobre temas sueltos:
  `Autopsia Biomecánica`, `El Cuerpo No Miente`, `IA Médica: Cuidado`,
  `Síntomas Que No Son Normales`.
- No empezar como clase. Empezar con contradicción, tensión o consecuencia.
  Ejemplo: `Pereira no perdió por el jab. Perdió porque su pierna ya no obedecía.`
- Para crecimiento, trabajar experimentos de 30 días con dos líneas principales:
  1. UFC/biomecánica/falla del cuerpo desde casos visuales.
  2. IA médica/errores de automedicación conectados a riesgo real del paciente.
- No sobreponderar contenido institucional de plataforma. AutaMedica debe entrar como el siguiente
  paso confiable después de la explicación, no como tema principal salvo que el video sea
  explícitamente de producto.
- Regla de decisión: repetir formatos que superen el baseline del canal, pausar temas que queden
  repetidamente por debajo y no decidir por un solo video. Usar `youtube_analytics_audit.py`
  antes de cambiar estrategia cuando haya cuota.

---

## 4b. Estrategia de Ramas (Senior Trunk-Based Development)

> **Contexto:** Solo Founder + Agentes. GitFlow (`develop`, `staging`) es burocracia innecesaria.
> **Estrategia:** GitHub Flow Senior (1 Rama Eterna + Ramas Efímeras + Trazabilidad).

### Las Reglas del Árbol

1. **`main` es Sagrada (Producción)**
   - Única rama de larga duración. Representa código desplegable.
   - **PROHIBIDO** commit directo. Todo cambio entra vía Pull Request o Merge.

2. **Ramas Efímeras (`<type>/<desc-breve>`)**
   - Vida corta (< 48h). Un solo objetivo.
   - Tipos: `feat/`, `fix/`, `refactor/`, `docs/`, `perf/`.
   - **Aislamiento Total:** Terminar una tarea, mergear, borrar rama.

### Protocolo de Commits y Trazabilidad (Senior Standards)

1. **Commits Atómicos:**
   - Unidad mínima de cambio estable.
   - **Conventional Commits:** `<type>(<scope>): <imperative description>`.
   - Ejemplo: `feat(blog): add humanized audio reader to cards`.
   - Si corriges un bug y refactorizas, son **dos commits diferentes**.

2. **Pull Requests (Bitácora Legal):**
   - Toda PR debe usar el `pull_request_template.md`.
   - **Contenido Obligatorio:** Contexto (Why), Solución (How), Validación en Dos Planos (UI vs DB) y Evidencia Técnica (Screenshots/Logs).
   - Sirve como registro histórico de decisiones técnicas.

3. **Protocolo de Push (0% Regresión):**
   - Sincronizar con `main` vía `rebase` antes de subir.
   - **Pre-flight:** `pnpm lint`, `pnpm build` y `pnpm test:unit` deben pasar localmente.
   - **CI Monitoring:** Si GitHub Actions falla, la rama es "radioactiva"; prohibido mergear.

4. **Higiene del Working Tree:**
   - **NUNCA** ejecutar `merge`, `pull`, `rebase` ni despliegues manuales si el working tree no está 100% limpio. Usar `git status` para comprobar, y limpiar/guardar en stash cambios no planeados.

5. **Estrategia de Merge en Main (Rebase vs Squash):**
   - **Ramas Limpias (Sin merges internos):** Aplicar **Rebase merge** (o fast-forward).
   - **Ramas con Merges Internos (e.g., `merge branch 'main' into...`):** Aplicar estrictamente **Squash merge** para evitar introducir merge nodes intermedios y mantener la historia de `main` limpia y legible.

6. **Configuración Estándar de Git:**
   - Todo agente o desarrollador debe mantener activa esta configuración local/global:
     ```bash
     git config --global pull.rebase true
     git config --global rebase.autoStash true
     git config --global merge.ff only
     ```

### Protocolo de Contexto del Agente (Anti-Mezcla)

**Reglas de Foco:**

1. **Una Rama = Un Objetivo.** Al inicio, definir: _"Estoy en `feat/x` y mi único objetivo es X"_.
2. **Definition of Done (DoD) por Rama:**
   - Código completo, probado y validado en dos planos.
   - `pnpm lint` 0 errores, `pnpm --filter @autamedica/web check` 0 errors.
   - PR abierta con documentación de trazabilidad.
   - Merge a `main` y **RAMA BORRADA LOCAL Y REMOTAMENTE.**
3. **No reciclar ramas.** Una vez mergeada, la rama muere.

---

## 5. Convenciones Técnicas

- **Gestión de Paquetes:** Uso exclusivo de `pnpm`.
- **TypeScript Estricto (ZERO TOLERANCE):**
  - **PROHIBIDO `any`:** Nunca usar `any` para silenciar errores.
  - **Usar `unknown`:** Para datos inciertos (errores, API responses), usar `unknown` + type guards.
  - **Interfaces Explícitas:** Tipar siempre respuestas de APIs y objetos externos.
  - **`null` vs `undefined`:**
    - `undefined` para valores opcionales o aún no cargados.
    - `null` para valores explícitamente vacíos (ej: `session = null` al logout).
- **Tailwind CSS:** Única fuente de estilos. No crear clases CSS personalizadas salvo UI Kit reutilizable.
- **Sintaxis:** ESM y APIs modernas (Astro islands, React hooks, Edge Functions Deno).

---

## 6. Arquitectura Frontend

### Apps (por portal)

```
apps/web/src/
├── pages/          # .astro pages + API endpoints
├── layouts/        # Layout.astro (SEO, estructura HTML)
├── components/
│   ├── experience/ # Islands React (HeroVertical, GSAP, etc.)
│   ├── landing/    # Islands React (Testimonials, Footer, etc.)
│   ├── seo/        # Componentes Astro estáticos (StructuredData)
│   └── ui/         # Components Astro simples (ScrollProgress, GlobalLoader)
├── lib/            # supabase.ts, env.ts
├── middleware.ts   # defineMiddleware — auth + routing
└── styles/         # globals.css
```

### Patrones Recomendados

| Patrón                          | Descripción                                           |
| ------------------------------- | ----------------------------------------------------- |
| **Static Astro / React Island** | Páginas en Astro, interactividad en islands React     |
| **Server-Side Auth**            | Middleware Astro verifica sesión con Supabase SSR     |
| **Package Facade**              | Hooks y lógica en `packages/*`, islands solo consumen |
| **Typed RPC Calls**             | Siempre tipar respuestas de `supabase.rpc<T>()`       |
| **Optimistic UI**               | Actualizar UI antes de confirmar con backend          |

### Anti-Patrones Prohibidos

| Anti-Patrón                           | Razón                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| `styled-jsx` en islands de `apps/web` | Next.js only, no funciona en Astro                       |
| `next/dynamic` en `apps/web`          | Reemplazado por directivas `client:*`                    |
| `process.env` en `apps/web`           | Usar `import.meta.env.PUBLIC_*`                          |
| `console.log` en prod                 | Usar `logger` de `@autamedica/shared`                    |
| Cross-app imports                     | `apps/doctors/src` desde `apps/patients/src` = PROHIBIDO |
| Lógica médica en frontend             | El backend es la autoridad                               |
| Términos técnicos en UI               | No mostrar "UUID", "RPC", "JWT", "API" al usuario        |

---

## 7. Supabase Guidelines

### RPC & Queries

```typescript
// Correcto: schema explícito via Accept-Profile
const { data } = await supabase.schema("public").rpc("get_patient_consultations", { patient_id });

// OK: default schema = public
const { data } = await supabase.rpc("get_patient_consultations", { patient_id });

// INCORRECTO: se convierte en public.public.fn en PostgREST
const { data } = await supabase.rpc("public.get_patient_consultations", { patient_id });
```

### Edge Functions

1. **Seguridad:** Auth verificada ANTES de cualquier lógica (ver AGENTS-2.md §18).
2. **Error Handling:** Retornar códigos semánticos (400, 401, 403, 404, 409), no 500 genérico.
3. **Logging:** `console.error('[fn-name] context', error)` — NUNCA loguear datos médicos.
4. **Secrets:** `Deno.env.get('SECRET_NAME')`, nunca hardcodeados.

### Migraciones

- **Naming:** `YYYYMMDDHHMMSS_descriptive_name.sql`
- **Idempotencia:** `IF NOT EXISTS`, existence checks antes de `DROP`.
- **RLS:** Toda tabla nueva debe tener políticas RLS (ver AGENTS-2.md §19).

### Regla de Oro: Dos Planos (UI vs DB)

- **Plano UI/Client gating:** lo que el frontend permite, filtra, deshabilita u oculta.
- **Plano DB enforcement:** lo que la DB realmente permite (enum values, triggers, constraints, RLS policies).
- Si un bug parece "guardó pero no se ve" o "desapareció", asumir **RLS y filtros** primero.
- Las reglas críticas de negocio médico deben ser **enforced en DB** y reflejadas en UI.

### Regla Crítica: Auth Context (service_role vs user JWT)

- `auth.uid()` solo existe si la request trae un **JWT de usuario** (header `Authorization`).
- Si un RPC valida permisos con `auth.uid()`, llamarlo con **service role** usualmente falla.
- Patrón en Edge Functions: 2 clientes Supabase (ver AGENTS-2.md §18.1).

---

## 8. Manejo de Errores

### Jerarquía de Errores

```
AppError (base)
├── NetworkError      → Problemas de conexión
├── AuthError         → Sesión expirada, no autorizado
├── ValidationError   → Datos inválidos del usuario
├── MedicalError      → Reglas médicas o regulatorias violadas
└── SystemError       → Errores internos inesperados
```

### Patrón de Manejo (en hooks/services)

```typescript
try {
  await bookConsultation(data);
} catch (error) {
  if (error instanceof AuthError) {
    window.location.href = "/auth/login";
  } else if (error instanceof MedicalError) {
    showToast(error.userMessage); // Mensaje amigable para el paciente
  } else {
    logger.error("Consultation booking failed", error);
    showToast("Ocurrió un error. Por favor intentá nuevamente.");
  }
}
```

---

## 9. Testing & Calidad

- **Ejecución:**
  - TypeScript check (Astro): `pnpm --filter @autamedica/web check` (0 errors = obligatorio)
  - Unitarios: `pnpm test:unit` (Vitest)
  - Lint: `pnpm lint` (zero tolerance)
- **E2E interactivo (UI/UX + verificación visual):** usar Patchright Streaming (headed por defecto).
- **Proactividad:** Actualizar tests al cambiar comportamiento de lógica crítica.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).

---

## 10. Performance Checklist

- [ ] **Islands lazy:** `client:visible` para componentes below-the-fold.
- [ ] **Islands inmediatos:** `client:load` solo para above-the-fold crítico.
- [ ] **Imágenes:** `loading="lazy"`, formatos WebP/AVIF.
- [ ] **Debounce:** Inputs de búsqueda con debounce >= 300ms.
- [ ] **Paginación:** Datos médicos paginados, no cargar todo.

---

## 11. Security Checklist

- [ ] **RLS Policies:** Toda tabla tiene Row Level Security.
- [ ] **Input Sanitization:** Nunca confiar en input del usuario sin validar.
- [ ] **CORS:** Configurado correctamente en Edge Functions.
- [ ] **Secrets:** Nunca en código fuente. Variables de entorno siempre.
- [ ] **Auth Middleware:** Rutas protegidas con middleware Astro.
- [ ] **Rate Limiting:** Endpoints sensibles (consultas médicas) con límites en Edge Functions.
- [ ] **Datos médicos:** TLS 1.3 en tránsito, AES-256 en reposo.
- [ ] **Privacidad:** Logs nunca contienen datos médicos del paciente.

---

## 12. Comandos Frecuentes

| Comando                               | Descripción                       |
| ------------------------------------- | --------------------------------- |
| `pnpm build:packages:core`            | Compilar packages (ANTES de apps) |
| `pnpm --filter @autamedica/web dev`   | Dev server Astro (port 3000)      |
| `pnpm --filter @autamedica/web check` | TypeScript check Astro            |
| `pnpm --filter @autamedica/web build` | Build Astro → dist/               |
| `pnpm lint`                           | ESLint (zero tolerance)           |
| `pnpm lint:fix`                       | Auto-fix ESLint                   |
| `pnpm test:unit`                      | Tests unitarios (Vitest)          |
| `pnpm db:sync`                        | Regenerar tipos desde DB          |
| `pnpm deploy:web`                     | Build + deploy apps/web           |
| `supabase db push`                    | Aplicar migraciones en prod       |
| `supabase functions deploy`           | Deploy Edge Functions             |

### 🎥 Comandos de Producción y Edición de Video (OBS Pipeline)

| Comando | Descripción |
| ------- | ----------- |
| `python3 tools/obs/boost_phone_performance.py` | Libera memoria RAM en el teléfono cerrando apps pesadas en segundo plano antes de grabar. |
| `python3 tools/obs/pull_latest_video.py` | Descarga inalámbrica del último video grabado en el teléfono a la PC. |
| `python3 tools/obs/record_pc_audio.py --list-sources` | Lista las entradas de audio disponibles en la PC. |
| `python3 tools/obs/record_pc_audio.py` | Graba el micrófono/entrada de audio de la computadora como WAV limpio. |
| `python3 tools/obs/replace_video_audio.py "/ruta/video.mp4" "/ruta/audio.wav"` | Reemplaza el audio del video del teléfono por el audio grabado en la PC. |
| `python3 tools/obs/process_video_edits.py "/ruta/al/video.mkv"` | Edita silencios (aceleración 5x) basados en Whisper JSON. |
| `python3 tools/obs/generate_srt.py "/ruta/al/video.mkv"` | Genera subtítulos `.srt` sincronizados dinámicamente con los cortes. |

### CUIDADO: Comandos de Build en Monorepo

| Comando                               | Scope            | Cuándo Usar                 |
| ------------------------------------- | ---------------- | --------------------------- |
| `pnpm build:packages:core`            | Solo packages    | Siempre, antes de apps      |
| `pnpm --filter @autamedica/web build` | Solo apps/web    | Para verificar landing      |
| `pnpm build`                          | TODO el monorepo | Solo CI/CD o build completo |

---

## 13. Comportamiento del Agente (SENIOR PROFESSIONAL MODE)

### Mentalidad: "Deep Context & Zero Debt"

Tu objetivo no es "escribir código rápido", es **construir sistemas robustos para telemedicina**. Errores en datos médicos tienen consecuencias reales.

#### 0. RAZONAMIENTO PROFUNDO (Obligatorio en Tareas Críticas)

Cuando el usuario solicite implementaciones que toquen datos médicos (HIPAA/Argentina), migraciones destructivas de DB médica, integraciones financieras o interpretaciones regulatorias, el agente DEBE:

1. Activar su "Cadena de Pensamiento" interna (Self-Reflection).
2. Dudar de su primera respuesta inmediatamente.
3. Ejecutar sub-búsquedas en la web o en el código interno (`search_web`, `grep_search`) para validar regulaciones (Ley 26.529, HIPAA) e impactos técnicos.
4. Redactar una respuesta, criticarla internamente (foco en privacidad/seguridad) y solo imprimir al usuario la versión final validada y contrastada.

#### 0.5 PROGRAMACIÓN ESTRUCTURAL DE ALTO RAZONAMIENTO

Antes de escribir o modificar código (Astro, Next.js, Edge Functions, React Islands o DB), el agente DEBE:

1. **Analizar el "Efecto Dominó"**: Prohibido escribir o modificar líneas aisladas sin entender el todo.
2. **Contexto Paralelo Obligatorio**: Usar masivamente `view_file` y `grep_search` para rastrear dependencias cruzadas, RLS policies entre pacientes/doctores, y la propagación de tipos compartidos (`@autamedica/types`).
3. **Auditoría Mental Médica**: Simular cómo el código reaccionaría: a) si el API falla, b) si un rol no autorizado intenta verlo, c) si hay datos nulos de historias clínicas.
4. Garantizar 0 deuda técnica y compatibilidad nativa con la arquitectura Turborepo antes de modificar cualquier archivo.

#### 1. PROHIBIDO SER PEREZOSO (Zero Laziness)

- **Lectura Profunda:** No leas solo el archivo que vas a editar. Lee sus importaciones, tipos, y los archivos que lo invocan.
- **Investigación Recursiva:** Si ves una llamada a una Edge Function, DEBES leer su código. No asumir qué hace.
- **Sin Excusas:** Nunca digas "asumo que la DB está bien". Verifica.

#### 2. INTEGRACIÓN OBLIGATORIA (End-to-End)

- Código huérfano = Basura.
- Cada cambio debe estar conectado de punta a punta:
  - ¿La isla React llama al hook correcto?
  - ¿El hook llama al endpoint Astro o Supabase correcto?
  - ¿La Edge Function tiene permisos RLS en la DB?
  - ¿La DB tiene la columna creada con tipos correctos?

#### 3. ANTI-PROCRASTINACIÓN (Do It Now)

- **Cero TODOs:** Prohibido dejar `// TODO: Implementar después`.
- Si falta una tabla, crear la migración AHORA.
- Si falta un tipo, generarlo AHORA.

#### 4. DEFINITION OF DONE (DoD)

Una tarea solo se considera terminada cuando:

1. El código está escrito y sigue los patrones.
2. La DB está migrada (si aplica) y sincronizada.
3. Los tipos TypeScript coinciden con la DB.
4. `pnpm --filter @autamedica/web check` pasa con 0 errors.
5. `pnpm lint` pasa con 0 errors/warnings.
6. Se verificó que no rompe dependencias.

#### 5. ARSENAL DE HERRAMIENTAS (ÚSALAS)

- **GitHub CLI (`gh`):** No adivines si el CI pasó. Ejecuta `gh run list`.
- **Patchright Streaming (Navegador Real):** Valida flujos críticos (login, selección de rol, consulta médica).
- **Bash + psql:** Verifica que las migraciones impactaron la DB real.

---

## 14. Protocolo Anti-Regresiones

### Reglas Inquebrantables

1. **UN DOMINIO A LA VEZ:** No tocar `auth/` mientras se arregla `telemedicina/`.
2. **COMMITS COMO CHECKPOINTS:**
   ```bash
   git add <archivos-específicos>
   git commit -m "fix: descripción concisa"
   ```
3. **LOOP DE VERIFICACIÓN:**
   ```
   Leer código → Escribir cambio mínimo → astro check → lint → Verificar visual → Commit → Repetir
   ```
4. **Invertir 60% del tiempo en VERIFICAR, no en generar código.**

### Señales de Alerta (PARAR y Preguntar)

- Mismo archivo modificado 3+ veces en una sesión
- `pnpm --filter @autamedica/web check` sigue fallando después de 2 intentos
- Cambio "simple" que toca más de 3 archivos
- Necesidad de "arreglar el arreglo"

### Protocolo de Escape

1. **STOP** — No seguir iterando
2. **STASH** — `git stash` para guardar cambios
3. **RESET** — Volver al último commit estable
4. **REPLANTEAR** — Bajar el nivel de abstracción del pedido

---

## 15. Estructura de Base de Datos

### Schemas

- **public**: Tablas principales de negocio médico
- **auth**: Gestión de usuarios (Supabase Auth)
- **storage**: Documentos médicos y evidencia

### Tablas Principales (AutaMedica)

| Tabla              | Propósito                                              |
| ------------------ | ------------------------------------------------------ |
| `profiles`         | Perfiles de usuario extendidos                         |
| `doctor_profiles`  | Datos específicos de médicos (matrícula, especialidad) |
| `company_profiles` | Datos de empresas clientes                             |
| `appointments`     | Consultas médicas y estados                            |
| `medical_records`  | Historia clínica (acceso restringido)                  |
| `prescriptions`    | Recetas digitales                                      |
| `reviews`          | Calificaciones de consultas                            |

### Convenciones de Migraciones

```sql
-- Naming: {timestamp}_{description}.sql
-- Ejemplo: 20260218050700_add_appointment_notes.sql

-- Siempre usar IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.appointments (...);

-- Siempre definir RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Políticas descriptivas
CREATE POLICY "Patients can view own appointments"
  ON public.appointments FOR SELECT
  USING (auth.uid() = patient_id);
```

---

## 16. Dominios de Servicio

Los packages `@autamedica/*` organizan la lógica por dominio:

| Dominio          | Package                    | Responsabilidad                            |
| ---------------- | -------------------------- | ------------------------------------------ |
| **auth**         | `@autamedica/auth`         | Autenticación, sesión, Supabase SSR        |
| **types**        | `@autamedica/types`        | 190+ tipos TypeScript de dominio médico    |
| **hooks**        | `@autamedica/hooks`        | React hooks para consultas y datos médicos |
| **shared**       | `@autamedica/shared`       | Utils, logger, env validation              |
| **ui**           | `@autamedica/ui`           | Componentes de UI compartidos              |
| **telemedicine** | `@autamedica/telemedicine` | WebRTC engine para video consultas         |

---

## 17. Deploy & CI/CD

### Orden Obligatorio de Deploy

```
1. pnpm build:packages:core
   ↓
2. supabase db push (si hay migraciones)
   ↓
3. supabase functions deploy (si hay Edge Functions)
   ↓
4. pnpm --filter @autamedica/web build
   ↓
5. wrangler pages deploy dist --project-name autamedica-web
```

**Razón:** El frontend puede depender de nuevas tablas/RPCs. Si se hace build primero, habrá errores hasta que el backend esté listo.

### Cloudflare Pages (por app)

| App            | Project Name           | Dominio                                 |
| -------------- | ---------------------- | --------------------------------------- |
| apps/web       | `autamedica-web`       | `autamedica.com` (objetivo)             |
| apps/web-app   | `autamedica-web-app`   | `autamedica-web-app.pages.dev` (legacy) |
| apps/doctors   | `autamedica-doctors`   | `autamedica-doctors.pages.dev`          |
| apps/patients  | `autamedica-patients`  | `autamedica-patients.pages.dev`         |
| apps/companies | `autamedica-companies` | `autamedica-companies.pages.dev`        |
| apps/admin     | `autamedica-admin`     | `autamedica-admin.pages.dev`            |

---

## 18. Referencias

- **Guía principal de agente:** `AGENTS.md`
- **Hardening avanzado:** `AGENTS-2.md`
- **Manual operativo:** `CLAUDE.md`
- **Tipos de proyecto:** `packages/types/src/`
- **Schema DB:** `packages/types/src/database.types.ts` (generado — no editar a mano)
- **Regenerar tipos:** `pnpm db:sync`
- **Migración Astro activa:** `apps/web/`

---

## 19. Reglas Importadas Desde AutoRenta (Framework-Agnostic)

Estas reglas se adoptan en AutaMedica independientemente del framework:

1. **AI Cross-Review:** todo cambio generado por IA requiere segunda auditoría antes de merge.
2. **Higiene reforzada:** si se tocan docs/reportes, correr `pnpm docs:ttl:check`; si hay rename/copy sospechoso (`C100`), validar historial con `git log --follow --name-status`.
3. **DB types con protocolo seguro:** generar a `/tmp`, revisar diff, validar enums críticos y luego reemplazar archivo canónico.
4. **Workflows resilientes:** usar `precheck + skip explícito` y evitar `continue-on-error` en pasos críticos.
5. **Post-Implementation Review (UI):** capturas before/after + validación en 375/768/1024/1440.
6. **Operaciones largas en `tmux`:** migraciones/builds/tests largos deben ejecutarse con sesiones persistentes.
7. **Regla SQL `atomic`:** no usar `atomic` en identificadores para evitar fallas del parser de Supabase CLI.
8. **Frozen Code policy:** paths críticos read-only por defecto; solo modificar con pedido explícito.

Ver detalle operativo en `AGENTS-2.md` sección 23.

---

## Nota Operativa

Si hay conflicto entre este documento y otros, prevalece:

1. `AGENTS.md` (reglas inmediatas de operación)
2. `AGENTS-2.md` (hardening técnico detallado)
3. `CLAUDE.md` (filosofía y contexto compacto)
4. Este `GEMINI.md` (contexto extendido y flujos)

---

## 20. Android Studio Playbook (Productivity & Performance 2025)

> **Mandato para agentes y desarrolladores operando en entornos nativos/Android Studio.**

### 1. Hardening de Rendimiento (Linux/Ubuntu)

- **Memoria RAM (VM Options):** Android Studio debe ejecutar con un mínimo de 4GB (`-Xmx4096m`) en `studio64.vmoptions`. NUNCA usar la configuración por defecto de 1.2GB.
- **Gradle Optimizado:** El archivo `~/.gradle/gradle.properties` DEBE incluir:
  ```properties
  org.gradle.daemon=true
  org.gradle.parallel=true
  org.gradle.caching=true
  org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8
  ```

### 2. Ecosistema de Plugins Requerido

No se permite programar "a ciegas". La suite mínima de productividad es:

- **Key Promoter X:** Entrenamiento obligatorio de atajos (Prohibido usar el mouse para acciones que tienen shortcut).
- **JSON To Kotlin Class:** Para parsear respuestas de APIs sin errores tipográficos.
- **CodeGlance Pro:** Minimapa lateral (estilo VS Code) para navegar archivos extensos de Compose o XML.
- **ADB Idea:** Para limpiar caché y desinstalar apps rápidamente.

### 3. Ajustes de Flujo de Trabajo (Settings)

- **Auto-Import:** Activar "Add unambiguous imports on the fly" y "Optimize imports on the fly" para no lidiar con `Alt + Enter` en cada clase.
- **Inlay Hints (Kotlin):** Obligatorio activar visualización de tipos de variables y retornos de lambdas para legibilidad.
- **Wireless Debugging:** En 2025 es mandatorio usar la conexión WiFi nativa del IDE ("Pair Devices Using Wi-Fi") sobre la conexión por cable para testeo en dispositivos físicos.

### 4. Integración Nativa con Gemini (Superpoderes)

Para aprovechar al máximo el ecosistema de Google dentro del IDE:

- **Asistente de Crash (Logcat):** Cuando la app explota, usar el botón "Ask Gemini" en el Logcat. Analiza el stacktrace y el código local para dar la solución exacta sin salir del IDE.
- **Generación de UI (Compose):** Usar el chat lateral para pedir componentes específicos de Material 3 ("Crea una Card con imagen circular a la izquierda...").
- **Explain This Code:** Seleccionar bloques complejos heredados, clic derecho -> "Gemini -> Explain this code" para ingeniería inversa rápida.
- **Generación de Tests:** Seleccionar lógica de negocio, clic derecho -> "Gemini -> Generate Unit Tests" para crear cobertura automática (JUnit/MockK).
- **Documentación KDoc:** Generar comentarios de funciones instantáneamente (clic derecho -> "Gemini -> Add documentation").
- _Nota:_ Asegurar que el "Context Sharing" esté activado en la ventana de chat del IDE para que Gemini lea el código local.

---

## 📈 AutaMedica Growth & Marketing Core

### A. Calificación y Enriquecimiento de Prospectos (CRM)
1. **Foco en Decisores:** Priorizar siempre directores médicos, dueños o directores de operaciones. No calificar a médicos generales o de staff como decisores de compra.
2. **Correos Válidos:** Evitar correos de turnos genéricos (`turnos@`) o correos de soporte (`info@`) para campañas directas. No incorporar correos académicos o de investigación de otros países (ej. CSIC de España) para clínicas locales.
3. **Respetar Datos Existentes:** NUNCA simplificar o pisar direcciones exactas preexistentes en el CRM con datos genéricos (ej. reemplazar calle exacta por "Buenos Aires, Argentina").

### B. Campañas de Emailing (Brevo)
1. **Evitar Filtros de Spam:** No usar emojis (como `🎥`) ni palabras típicamente comerciales ("Gratis", "Stream en Vivo") en el asunto de correos corporativos.
2. **Inbox vs. Promociones:** Si se busca caer en la bandeja principal de Gmail en lugar de la pestaña de "Promociones", enviar el mail en formato texto plano puro en lugar de HTML complejos con imágenes.
3. **Zafar del Límite de Envío:** Si hay cuotas diarias restrictivas (ej. 300/día), utilizar envíos automáticos por WhatsApp (OpenClaw) o redirigir a los usuarios interesados a una lista de difusión de WhatsApp para avisos en vivo.

### C. Estrategia de Videos Cortos (Shorts / TikTok)
1. **El Gancho Inicial (3s):** El video debe arrancar con una pregunta intrigante, un dilema o un dolor universal. Prohibido iniciar con introducciones lentas o mostrando el software estático.
2. **Títulos Curiosos:** Evitar títulos formales o explicativos (ej. "Emitiendo receta en AutaMedica"). Usar títulos que apelen al autocuidado o a la curiosidad (ej. "Cuida tu salud siempre primero", "El caso de libro siempre es bonito").
3. **Evitar Bloqueos del Algoritmo (0 vistas):**
   - **Espaciado obligatorio:** Dejar pasar mínimo 12-24 horas entre publicaciones. Subir videos en ráfaga hace que el algoritmo bloquee la distribución por sospecha de bot.
   - **Variación de metadatos:** Cambiar los títulos y no usar de forma sistemática la misma lista de hashtags.
  - **Protocolo de Resubida:** Si un video se clava en 0 vistas por más de 48 horas, borrarlo, modificar el título/hashtags y volver a subirlo tras un descanso de publicaciones.
   - **Desintoxicación de cuenta (Shadowban):** Si hay 4 o más videos seguidos en 0 vistas, pausar publicaciones por 72 horas completo e interactuar activamente (likes/comentarios) como usuario humano.

### D. Estrategia de Contenidos y Producción de Video (YouTube VOD & Shorts)

1. **Simplificar Títulos (El "Gancho"):**
   - Evitar el uso de términos médicos técnicos complejos en la primera parte del título. YouTube es entretenimiento e información general.
   - *Patrón:* Primero la curiosidad o el beneficio, después el término médico.
   - *Antes:* "Inhibición Artrogénica: El cerebro corta la corriente"
   - *Ahora:* "Por qué tus músculos 'se apagan' solos (y no puedes evitarlo)"

2. **Duplicar lo que Funciona (Medicina + Tendencia):**
   - Los videos de análisis de combate de la UFC (ej. Alex Pereira) tienen el CTR más alto. Aprovechar esta inercia.
   - Usar eventos deportivos de élite, accidentes o noticias actuales para explicar conceptos médicos complejos. Es el puente perfecto para captar audiencias generales.

3. **Optimizar Miniaturas (Tu Vidriera):**
   - Mantener el CTR alto reduciendo el ruido visual.
   - *Menos texto:* Máximo 3 o 4 palabras de gran tamaño y fuerte contraste.
   - *Más impacto:* Mostrar el momento exacto del impacto o una imagen anatómica/médica limpia y llamativa.
   - *Sin logos irrelevantes:* Solo incluir logos reconocibles del contexto inmediato (ej. UFC) si aportan claridad. No colocar marcas genéricas.

4. **Consistencia sobre Cantidad:**
   - Priorizar la calidad. Es preferible publicar un video de alta producción, bien estructurado y analizado a la semana, que múltiples videos mediocres.
   - En Shorts, asegurar que el primer segundo tenga una pregunta intrigante o una metáfora cruda para amarrar la retención desde el inicio.

5. **Llamados a la Acción (CTA) Claros:**
   - Traducir el conocimiento técnico médico al lenguaje de la curiosidad del espectador.
   - En la mitad de cada video, indicar explícitamente el valor de suscribirse: *"Suscribite para entender cómo funciona tu cuerpo en situaciones extremas"*.
   - Canalizar el tráfico del video mediante enlaces en la descripción dirigiendo a los usuarios a la plataforma de telemedicina `autamedica.com` para consultas médicas reales.

---

## 🎬 Historial de Videos Subidos (YouTube)

### 1. La física no perdonó: la autopsia a la rodilla de McGregor
* **Fecha:** 12 de Julio de 2026
* **Video ID:** `CN6mJtBdqkM`
* **URL:** https://youtu.be/CN6mJtBdqkM
* **Descripción del análisis:** En este video, Eduardo Marques realiza una "autopsia biomecánica" del colapso de la rodilla de Conor McGregor en su pelea contra Max Holloway. Eduardo desmiente la creencia de que la derrota de McGregor haya sido por simple inactividad o falta de ritmo, y desglosa frame a frame la biomecánica detrás del fallo de la base de sustentación, explicando los tres conceptos críticos: la absorción de torque, la carga axial y el valgo dinámico severo. Además, narra cómo Max Holloway detuvo el ataque de manera empática al darse cuenta de que la rodilla de su oponente había colapsado por completo.

### 2. Shorts Extraídos del Video de McGregor (Fecha: 12 de Julio de 2026):
* **Short 1:** La física no perdonó a Conor McGregor 🏎️
  * **Video ID:** `20xVHnT6TP8`
  * **URL:** https://youtu.be/20xVHnT6TP8
* **Short 2:** El colapso de rodilla de Conor McGregor 😱
  * **Video ID:** `LbAb9Jzuv1Y`
  * **URL:** https://youtu.be/LbAb9Jzuv1Y
* **Short 3:** La empatía de Max Holloway en el octágono 🤝
  * **Video ID:** `DcdK_Kuc86Q`
  * **URL:** https://youtu.be/DcdK_Kuc86Q

---

## 🎨 Estándar de Calidad Audiovisual (Matriz de Referencia)

Evaluación del grado de producción de AutaMedica frente a referentes de alto rendimiento de Instagram (Reels) a Julio de 2026:

| Dimensión | 🎥 Reel 1 (3D Médico) | 🎞️ Reel 2 (Real + Vectores) | 🩺 AutaMedica (McGregor v4) |
| :--- | :--- | :--- | :--- |
| **Estilo Visual** | Modelados 3D de esqueletos translúcidos y resonancias. | Combate real (UFC footage) reencuadrado. | Combate real + Facecam selectiva estilizada. |
| **Diseño de Layout** | 9:16 nativo pantalla completa. | Híbrido (9:16 nativo y 16:9 con blur wrap). | Híbrido (16:9 centrado con blur wrap). |
| **Grafismos / Señalética** | Ninguno. | Flechas vectoriales de color con sombra. | Subtítulos dinámicos (sin flechas/círculos en combate). |
| **Ritmo (Pacing)** | Medio (transiciones suaves a 60fps). | Rápido (cortes cada 2-3 segundos). | Ultra-rápido (ajustado por software sin silencios). |
| **Audio (SFX)** | Sonido clínico/quirúrgico (ticks, booms). | Sonido deportivo genérico + música. | Profesional (normalizado a -14 LUFS, limitador y SFX). |
| **Nivel / Grado** | **Grado 3: Premium Editorial / 3D** | **Grado 2: Divulgador Técnico Pro** | **Grado 2.5: Divulgador de Alta Producción** |

### 🔍 Diagnóstico & Hoja de Ruta de AutaMedica:
* **Estado Actual (Grado 2.5):** La calidad técnica del audio y el ritmo de edición automatizado por software son excelentes. El layout híbrido de video centrado con blur wrap superior/inferior se ve premium.
* **Foco de Mejora (Para llegar a Grado 3):**
  1. **Señalética en combate:** Congelar pantalla en el punto crítico e introducir flechas o círculos rojos con sombra para guiar la vista hacia la rodilla/articulación.
  2. **B-Roll Científico:** Intercalar tomas de 3 segundos de modelos 3D translúcidos (grabados desde *BioDigital Human* o stock) en fondo negro para ilustrar la mecánica interna de la lesión.

---

## 📊 Revelación de Analítica: La Regla de los 20 Segundos para Shorts

Análisis basado en la auditoría de datos del canal (`Hoja de cálculo sin título.xlsx` a Julio de 2026):

* **Shorts Super Cortos (≤ 20 segundos):** Promedio de **`386.5` vistas**. La retención del 100% o superior (repetición de bucle) dispara el algoritmo de distribución masiva de YouTube de forma inmediata.
* **Shorts Largos (20 a 60 segundos):** Promedio de **`64.5` vistas** (caída de 6 veces en la distribución). Es extremadamente difícil mantener al usuario pegado al celular más de 30 segundos, reduciendo la retención promedio y matando el alcance algorítmico del Short.
* **Videos Largos (> 60 segundos):** Promedio de **`56.0` vistas**. Poseen excelente CTR (ej: Pereira 9.09%), pero YouTube no regala impresiones de forma automática en este formato.

### 💡 Regla de Producción Corta:
Los Shorts deben ser **anzuelos rápidos de 10 a 15 segundos** enfocados únicamente en generar dudas, tensión o curiosidad extrema (Curiosity Gap). No deben intentar explicar la patología completa; deben forzar al usuario a hacer clic en el *Vídeo Relacionado* para ver la explicación en el video largo.

---

## 🚀 Blueprint de Producción y Distribución Definitivo

Basado en el cruce de datos históricos y comportamiento del algoritmo de YouTube:

### 1. Dos Formatos con Objetivos Diferentes:
* **Shorts de Captación (8 a 15 segundos):** Creados como piezas independientes para consumirse como Shorts, no como fragmentos de explicaciones largas.
  * **Estructura:** Impacto visual en el segundo 1 ➔ Planteo de duda/tensión ➔ Derivación al video relacionado.
  * **Titulaciones:** Estructura directa `[Atleta] + [Problema] + [Resultado]` (Ej: *"El cerebro apagó la rodilla de Pereira"* en lugar de *"Inhibición artrogénica"*).
  * **Optimización Idioma:** Español neutro en títulos y diagramas, pero manteniendo el acento argentino nativo en la narración.
* **Videos Largos (Fidelización y Autoridad):** Orientados a resolver la brecha de curiosidad.
  * **Optimización Crítica:** Resolver la retención del primer minuto (superar el 5% de retención inicial actual). La intro de los primeros 30 segundos debe ir directo a la biomecánica y el misterio sin rodeos teóricos.

### 2. Métricas de Control Realistas:
* **Shorts:** Descartar el CTR de impresiones. Evaluar únicamente **"Mostrado en el feed"** y **"Eligieron mirar frente a deslizaron"** (Target > 65%).
* **Videos Largos:** Evaluar CTR de impresiones tradicionales (>6%) y **Tiempo medio de visualización** (>2 minutos).




