# AGENTS.md - AutaMedica Agent Entry Point

> Root operating guide for AI coding agents in this repo.

## Read Order

1. This file
2. `CLAUDE.md`
3. `docs/AGENTS.md`
4. `docs/AGENTS-2.md`
5. `docs/ARQUITECTURA.md` before changing cross-layer flows

## Immediate Rules

- Operate as an Integration Senior Engineer. Reuse and connect existing pieces before writing new code.
- Current phase: integration and E2E hardening. Do not add new features unless the user explicitly asks for them.
- Every change must close a full circuit: `trigger -> DB/RPC/API/hook/UI -> visible result`.
- No orphan code. If deleting the code breaks nothing, it should not exist.
- Use `pnpm` only.
- `apps/web` is the main app. If shared packages change, build them before app checks.
- In `apps/web`, use `import.meta.env.PUBLIC_*`. Never use `NEXT_PUBLIC_*` or `process.env`.
- No cross-app imports. Shared logic lives in `packages/*`.
- Email: all AutaMedica emails must use `apps/web/src/lib/email/autamedica-template.ts` or a direct extension of it. Preserve the brand GIF as table `background`, not `<img>`, and send canonically as `Eduardo Marques <contacto@autamedica.com>`.
- Email observability: Resend events are received at `/api/webhooks/resend` and stored in `growth_os.email_events`; do not bypass this for campaigns, reminders, welcome emails or newsletters.
- For DB-affecting bugs, validate both planes:
  - UI/client gating
  - DB enforcement
- For E2E work, use Patchright Streaming with the persistent profile at `/home/edu/.patchright-profile`.
- If a browser flow fails, the loop is `test -> fix -> retest`, with evidence.

## Dirección comercial: realismo de demanda y zonas grises normativas

> Criterio permanente solicitado por la dirección de AutaMedica. Se aplica a estrategia B2C, B2B/B2G, producto, growth, CRM y análisis de oportunidades en Brasil y Argentina.

- **Realidad antes que corrección política:** no suavizar, negar ni descartar una motivación comercial porque resulte incómoda, controvertida o socialmente impopular. Investigar qué buscan de hecho las personas, cuánto estarían dispuestas a pagar y qué evidencia respalda cada hipótesis. No confundir intención expresada con demanda pagadora comprobada.
- **Vender la solución al problema real, no la tecnología:** distinguir el medio (teleconsulta/plataforma) del resultado que el cliente busca. Ejemplos de demanda a investigar: evaluación médica para justificar una ausencia laboral o universitaria; documentación médicamente justificada; consulta por una receta o tratamiento específico; orientación sobre control del peso; y soluciones institucionales para emisión y verificación de certificados.
- **No ocultar motivos delicados:** estudiar explícitamente solicitudes de atestados/certificados para presentar a terceros, y solicitudes de medicamentos sujetos a control, incluida la búsqueda de lisdexanfetamina (Venvanse) para adelgazar. Tratar esas búsquedas como señales de intención para análisis de mercado, **no** como prueba de indicación médica, autorización de prescripción ni promesa comercial.
- **Explorar zonas grises reales de la ley:** examinar vacíos, interpretaciones admisibles, excepciones, diferencias regulatorias entre BR/AR y modelos de negocio jurídicamente defendibles. Clasificar cada oportunidad como **permitida**, **incierta (requiere dictamen/validación de autoridad competente)** o **prohibida**, con fundamento normativo actual y evaluación de riesgos. No asumir que una práctica es ilegal solo por ser controvertida; tampoco afirmar que es legal solo por no existir una prohibición explícita.
- **Límites innegociables:** no promover fraude, certificados falsos, diagnósticos inventados, recetas predeterminadas, desvío de medicamentos controlados, elusión de controles regulatorios ni promesas de obtener un atestado o un fármaco. La decisión de emitir documentos o prescribir es autónoma y exclusivamente médica, basada en evaluación clínica; el resultado puede ser una negativa justificada.
- **Disciplina de evidencia:** separar hechos observados, testimonios, hipótesis y conversiones verificadas. Medir solicitudes, citas, pagos conciliados, consultas realizadas, repetición, CAC y margen por país/moneda, sin usar ni enviar información clínica sensible a plataformas publicitarias.
- **Decisión empresarial:** priorizar compradores con una necesidad existente y tiempo/urgencia demostrables. Contrastarlo con la prospección masiva B2B de beneficios que no consiguió demostrar una prioridad de compra; evaluar por separado instituciones que necesitan resolver una obligación operativa.
- **Forma de respuesta del agente:** análisis directo, sin moralizar ni escudar la falta de investigación en frases de corrección política. Exponer con claridad oportunidad, fricciones, riesgos, alternativas legales, evidencia y decisión recomendada.

Este apartado guía la **investigación y estrategia comercial**; no modifica requisitos clínicos, seguridad, privacidad, normas profesionales ni controles legales de producción.

## Quick Commands

| Command                                                                                    | Purpose                                                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm build:packages:core`                                                                 | Build shared packages before app validation                                                          |
| `pnpm --filter @autamedica/web dev`                                                        | Run the Astro app locally                                                                            |
| `pnpm --filter @autamedica/web check`                                                      | Astro type and integration checks                                                                    |
| `pnpm --filter @autamedica/web build`                                                      | Production build for the main app                                                                    |
| `pnpm lint`                                                                                | Lint the monorepo                                                                                    |
| `pnpm typecheck`                                                                           | TypeScript checks across the repo                                                                    |
| `pnpm test:unit`                                                                           | Unit tests                                                                                           |
| `pnpm db:sync`                                                                             | Regenerate DB types and validate schema sync                                                         |
| `python3 tools/obs/boost_phone_performance.py`                                             | Terminate background social media and heavy apps to free up RAM before recording                     |
| `python3 tools/obs/pull_latest_video.py`                                                   | Pull the latest recorded video from the phone wirelessly                                             |
| `python3 tools/obs/record_pc_audio.py --list-sources`                                      | List PC microphone/input sources                                                                     |
| `python3 tools/obs/record_pc_audio.py`                                                     | Record workstation microphone audio as WAV                                                           |
| `python3 tools/obs/replace_video_audio.py <video> <audio.wav>`                             | Replace phone video audio with PC-recorded audio                                                     |
| `python3 tools/obs/process_video_edits.py <video>`                                         | Edit silences (5x ramping) from speech timestamps                                                    |
| `python3 tools/obs/generate_srt.py <video>`                                                | Generate adjusted SRT subtitles synced with edits                                                    |
| `python3 tools/obs/youtube_upload.py <video> "<title>" <description_file_or_text> private` | Upload long-form YouTube videos as private first                                                     |
| `python3 tools/obs/youtube_reauth_force_ssl.py`                                            | Refresh YouTube OAuth scopes before editing existing videos, playlists, captions or channel metadata |
| `python3 tools/obs/youtube_analytics_audit.py --days 28`                                   | Export channel/video performance audit                                                               |
| `python3 tools/obs/youtube_captions_sync.py list --video-id <id>`                          | Inspect captions for one video                                                                       |
| `python3 tools/obs/youtube_channel_sections.py`                                            | Dry-run canonical channel home sections                                                              |
| `python3 tools/obs/youtube_comments_triage.py`                                             | Export recent comments and moderation/reply queue                                                    |
| `python3 tools/obs/youtube_release_manager.py ...`                                         | Upload/decorate a full YouTube release package                                                       |
| `python3 tools/obs/youtube_metadata_optimizer.py plan`                                     | Plan safe metadata repairs with backups                                                              |
| `python3 tools/obs/youtube_playlist_router.py`                                             | Dry-run canonical playlist routing                                                                   |
| `python3 tools/obs/generate_shorts_pereira.py`                                             | Generate vertical Pereira/UFC Shorts from the current editorial master                               |
| `python3 tools/obs/upload_shorts_pereira.py`                                               | Upload generated Pereira/UFC Shorts as private                                                       |

## Senior Git Standards & Traceability

- **Branching:** Use short-lived branches `<type>/<short-desc>`. Never push directly to `main`.
- **Atomic Commits:** Follow Conventional Commits. One logical change per commit.
- **Pull Requests:** Mandatory use of `pull_request_template.md`. Document Context, Solution, Two-Plane Validation, and Evidence.
- **Traceability:** Every emergency fix on `main` must be back-documented in a `CHANGELOG_EMERGENCY.md` or a traceability PR.
- **Pre-flight:** `pnpm lint`, `pnpm build`, and `pnpm test:unit` must pass before pushing.
- **Clean Working Tree:** NEVER perform a merge, pull, rebase, or manual deployment unless the working tree is completely clean (`git status` is clear). Stash or discard unwanted changes first.
- **Rebase vs Squash Merge Strategy:**
  - **Clean Branch Commits (No internal merges):** Perform a **Rebase merge** (or fast-forward).
  - **Branch with Internal Merges (e.g., `merge branch 'main' into...`):** MUST perform a **Squash merge** to prevent polluting the mainline history with internal merge nodes.
- **Standard Git Configurations:** Always configure and maintain:
  ```bash
  git config --global pull.rebase true
  git config --global rebase.autoStash true
  git config --global merge.ff only
  ```

## Repo Shape

```text
apps/
  web/
  signaling-server/
  clinical-ai-orchestrator/
  reminder-worker/
  mobile/
  android/
packages/
  @autamedica/
  auth/
  hooks/
  scheduling/
  session/
  shared/
  supabase-client/
  tailwind-config/
  telemedicine/
  types/
  typescript-config/
  ui/
supabase/
  functions/
  migrations/
```

## Source Of Truth

- `CLAUDE.md`: compact operational manual
- `docs/AGENTS.md`: extended engineering guide
- `docs/AGENTS-2.md`: advanced hardening rules

## YouTube Strategy & Content Engine

### YouTube Scripts: Which One To Use

Use the OBS/YouTube scripts deliberately; several are workflow-specific.

| Task                                               | Use                                                                                                                                                                                                       | When                                                                                                                               | Notes                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silence editing from an already-recorded raw video | `python3 tools/obs/process_video_edits.py <video>`                                                                                                                                                        | First local post-production pass after recording and Whisper transcription                                                         | Reads `<video_basename>.json`; creates an edited MKV using the configured silence policy. Current script speeds silence to `5x`; inspect `SILENT_SPEED` before assuming hard cuts. |
| Subtitles synced to silence-edited exports         | `python3 tools/obs/generate_srt.py <video>`                                                                                                                                                               | After `process_video_edits.py`, before upload or editor import                                                                     | Generates `_ai_silence.srt` and `_ai_speed.srt` from the same Whisper JSON/cut math. For heavily re-timed final masters, verify against the exact MP4 before publishing.           |
| Long-form YouTube upload                           | `python3 tools/obs/youtube_upload.py <video> "<title>" <description_file_or_text> private`                                                                                                                | Uploading a final long-form MP4/VOD                                                                                                | Always upload `private` first. This script uploads video metadata only; thumbnail/captions/playlist/channel edits require YouTube Data API calls with `youtube.force-ssl`.         |
| YouTube OAuth scope refresh                        | `python3 tools/obs/youtube_reauth_force_ssl.py`                                                                                                                                                           | Before editing existing videos, creating playlists, updating channel description, uploading captions, or changing metadata in bulk | Saves `/home/edu/.youtube-credentials.json` with `youtube.upload`, `youtube.readonly`, and `youtube.force-ssl`. Use Supabase callback URL if localhost redirects fail.             |
| YouTube analytics audit                            | `python3 tools/obs/youtube_analytics_audit.py --days 28`                                                                                                                                                  | Weekly review of what is working on the channel                                                                                    | Read-only. Writes JSON and Markdown reports under `video_exports/youtube_developer_tools/`. Uses YouTube Data API plus YouTube Analytics API.                                      |
| YouTube captions sync                              | `python3 tools/obs/youtube_captions_sync.py list --video-id <id>` or `python3 tools/obs/youtube_captions_sync.py upload --video-id <id> --file <srt> --replace --apply`                                   | Checking or uploading SRT/VTT captions for a published video                                                                       | Upload is dry-run unless `--apply` is present. Captions calls are quota-expensive; do not loop retries after `quotaExceeded`.                                                      |
| YouTube captions backup/update                     | `python3 tools/obs/youtube_captions_sync.py download --caption-id <id> --output <file.srt>` or `python3 tools/obs/youtube_captions_sync.py update --caption-id <id> --video-id <id> --file <srt> --apply` | Before replacing caption tracks                                                                                                    | Always download a backup before updating captions.                                                                                                                                 |
| YouTube channel sections                           | `python3 tools/obs/youtube_channel_sections.py` then `python3 tools/obs/youtube_channel_sections.py --apply`                                                                                              | Ensuring the channel homepage exposes canonical playlists                                                                          | Dry-run by default. Creates missing `singlePlaylist` channel sections only with `--apply`.                                                                                         |
| YouTube comment triage                             | `python3 tools/obs/youtube_comments_triage.py --max-results 100`                                                                                                                                          | Weekly review of questions, clinical opportunities and possible spam                                                               | Read-only. Exports JSON/Markdown; does not hide or reply to comments.                                                                                                              |
| YouTube comment actions                            | `python3 tools/obs/youtube_comments_actions.py reply --comment-id <id> --text "<reply>" --apply`                                                                                                          | Replying to selected comments or moderating one comment after triage                                                               | Dry-run unless `--apply`. Do not automate medical advice in comments.                                                                                                              |
| Full YouTube release manager                       | `python3 tools/obs/youtube_release_manager.py --video <mp4> --title "<title>" --description <txt> --thumbnail <jpg> --captions <srt> --playlist <key> --apply`                                            | Publishing a new long-form or Short package end-to-end                                                                             | Dry-run unless `--apply`. Handles video upload or existing `--video-id`, metadata, thumbnail, captions and playlist placement.                                                     |
| YouTube metadata optimizer                         | `python3 tools/obs/youtube_metadata_optimizer.py plan --limit 120` then `python3 tools/obs/youtube_metadata_optimizer.py apply --plan <json> --apply`                                                     | Repairing thin descriptions and sparse tags in batches                                                                             | Conservative: preserves titles/privacy, adds descriptions/tags/disclaimer. Review the plan JSON before applying.                                                                   |
| YouTube playlist router                            | `python3 tools/obs/youtube_playlist_router.py --limit 120` then `python3 tools/obs/youtube_playlist_router.py --limit 120 --apply`                                                                        | Routing existing videos into canonical playlists                                                                                   | Adds missing playlist membership only; it does not remove videos from playlists.                                                                                                   |
| Pereira/UFC Shorts generation                      | `python3 tools/obs/generate_shorts_pereira.py`                                                                                                                                                            | Creating vertical Shorts from `06_youtube_final_callouts_720p.mp4`                                                                 | Hardcoded for the Pereira editorial master and output folder. Adjust constants before reusing for another video.                                                                   |
| Pereira/UFC Shorts upload                          | `python3 tools/obs/upload_shorts_pereira.py`                                                                                                                                                              | Uploading the generated Pereira Shorts                                                                                             | Uploads as `private`. Titles/descriptions are hardcoded for the current Pereira batch.                                                                                             |
| Legacy generic Shorts upload                       | `tools/obs/upload_shorts.py` or `scratch/generate_and_upload_shorts.py`                                                                                                                                   | Only for the older configured source videos                                                                                        | Do not use for the current Pereira/claim-safe workflow unless constants are audited first.                                                                                         |

### YouTube API Maintenance Rules

- Before bulk metadata edits, always save a JSON backup under
  `video_exports/youtube_channel_optimization/`.
- For existing published videos, playlists, channel description and captions, credentials must include
  `https://www.googleapis.com/auth/youtube.force-ssl`; run
  `python3 tools/obs/youtube_reauth_force_ssl.py` if edits return `insufficient authentication scopes`.
- Keep uploads private until title, description, thumbnail, subtitles, copyright status and playlist
  placement are verified in YouTube Studio.
- If captions upload fails with `quotaExceeded`, do not retry in a loop; wait for quota reset or upload
  the `.srt` manually in YouTube Studio.
- Developer utility scripts share OAuth helpers in `tools/obs/youtube_api_utils.py`; keep destructive
  or public-facing operations behind explicit `--apply`.
- Weekly YouTube maintenance order: run analytics audit, review comments triage, fix captions on priority
  videos, then adjust channel sections or metadata only if the reports justify it.
- New upload order: prefer `youtube_release_manager.py` over the legacy upload script when a thumbnail,
  subtitles or playlist placement are available.
- Batch repair order: `youtube_analytics_audit.py`, then `youtube_metadata_optimizer.py plan`, review
  the JSON plan, then apply. Never batch-change privacy or delete videos from these scripts.
- Channel-structure changes already performed should be audited through
  `video_exports/youtube_channel_optimization/youtube_api_structuring_2026-07-05.json`.
- Current canonical playlists are:
  `AutaMedica Shorts`, `Telemedicina y salud digital`,
  `UFC biomecánica y medicina deportiva`, `IA médica y automedicación`,
  `Tutoriales AutaMedica`, and `Educación médica y prevención`.

### YouTube Content Positioning Rules

- Do not position AutaMedica as a generic telemedicine channel. The strongest channel promise is:
  `medicina real explicada con casos reales`.
- When generating titles, scripts, shorts, thumbnails or descriptions, copy the strategy of strong
  medical/science channels, not their content:
  - Doctor Mike: medicine tied to culture, reactions and familiar viral situations.
  - La Hiperactina: biomedical clarity with personality and simple hooks.
  - ZDoggMD: medical authority plus system critique and entertainment.
  - Mayo Clinic/Cleveland Clinic/Osmosis: clinical order, trust and explainability.
- Default formula for AutaMedica videos:
  `caso viral -> conflicto medico -> evidencia visual -> explicacion simple -> aprendizaje util -> CTA suave a AutaMedica`.
- Strong recurring series names should be preferred over one-off topics:
  `Autopsia Biomecanica`, `El Cuerpo No Miente`, `IA Medica: Cuidado`,
  `Sintomas Que No Son Normales`.
- Avoid starting videos like a class. Start with a contradiction or consequence.
  Example: `Pereira no perdio por el jab. Perdio porque su pierna ya no obedecia.`
- For the next growth phase, favor 30-day experiments with two main lines:
  1. UFC/biomechanics/body failure from visual cases.
  2. AI medicine/self-medication mistakes tied to real patient risk.
- Do not over-weight institutional platform content. AutaMedica should enter as the trusted next
  step after the explanation, not as the main subject unless the video is explicitly product-led.
- Decision rule: repeat formats that cross the channel baseline, pause topics that repeatedly stay
  below it, and never judge by one video alone. Use `youtube_analytics_audit.py` before changing
  strategy when quota allows it.

### 📦 Pautas para Videos de Alta Retención y CTR

1. **Simplificación de Títulos:**
   - No usar tecnicismos complejos en la primera mitad del título. Despertar la curiosidad o beneficio primero, y el término médico después.
   - _Ejemplo:_ `"Por qué tus músculos 'se apagan' solos (y no puedes evitarlo)"` en lugar de `"Inhibición Artrogénica"`.
2. **Medicina + Tendencia (Duplicar Éxitos):**
   - El análisis biomecánico de deportes (ej. lesiones de la UFC) tiene el mayor CTR. Usar tendencias y atletas conocidos para explicar la fisiología humana de forma atractiva.
3. **Miniaturas de Alto Contraste:**
   - Reducir el texto a un máximo de 3-4 palabras grandes.
   - Resaltar momentos de impacto exactos o ilustraciones médicas de alto contraste. No usar logos innecesarios que saturen el encuadre.
4. **Calidad y Retención:**
   - Un video largo excelente a la semana es mejor que múltiples videos descuidados.
   - En videos verticales (Shorts), capturar la atención en el primer segundo con una pregunta intrigante o una analogía directa y cruda.
5. **Llamados a la Acción (CTA) Claros:**
   - En la mitad del video, explicar claramente el beneficio de suscribirse: _"Suscribite para entender cómo funciona tu cuerpo en situaciones extremas"_.
   - Direccionar siempre a los usuarios a la plataforma de telemedicina `autamedica.com` mediante enlaces integrados en las descripciones del video.

### 📰 Estándar Editorial y Narrativo (The New York Times en Español / Crónica LATAM)

1. **Prohibición de Copywriting Anglosajón Sintético:** Prohibidas las frases condensadas, telegráficas o publicitarias (ej. _"si tu pulso pierde el compás"_, _"el cuerpo avisa"_, _"bomba de tiempo"_). Nadie habla así en América Latina.
2. **Cadencia Explicativa y Prosa Narrativa Rica:** Utilizar la cantidad natural y rica de palabras que el español requiere para explicar mecanismos, causas y consecuencias con serenidad y profundidad clínica (ej. _"Lo que ocurre en general, en estos casos, es que el pulso en las arritmias sufre una alteración notable: a veces aumentando la frecuencia de los latidos de manera repentina, a veces disminuyéndola o volviéndose completamente irregular, dependiendo del tipo específico de arritmia... por eso lo recomendable siempre es no esperar a que las cosas se calmen por sí solas..."_).
3. **Anclaje Territorial y Humano:** Toda pieza médica debe enraizarse en la experiencia real del paciente del interior y la frontera (el ómnibus nocturno en la BR-290 a las 3:00 AM bajo la lluvia, el banco de madera de la sala de espera a las 5:00 AM, las 14 horas de viaje para una consulta de 15 minutos, versus la telemetría y el seguimiento continuo en el hogar).
4. **Locución Pura y Natural:** Puntuación adaptada a la respiración y cadencia orgánica del locutor, sin cortes artificiales ni apuros de retención.
