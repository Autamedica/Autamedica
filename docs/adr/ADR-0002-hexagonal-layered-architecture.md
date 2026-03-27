# ADR-0002: Hexagonal Layered Architecture — 7 capas + 4 patrones transversales

## Estado

Aceptado

## Contexto

AutaMedica opera con una arquitectura de 7 capas (UI → Hook → Service FE → API Client → Controller → Service BE → Repository). Esta separación funciona bien para el desarrollo diario, pero presenta limitaciones:

1. **Testing:** Los repos hablan directo con Supabase. No hay forma de testear lógica de negocio sin una DB real.
2. **Acoplamiento:** Los services orquestan queries pesadas de dashboard mezcladas con lógica de negocio.
3. **Side-effects acoplados:** Cuando un turno se completa, el código que notifica al paciente vive inline en el mismo service que actualiza el estado.
4. **Flujos distribuidos:** Operaciones que cruzan múltiples repos (ej: completar anamnesis = ensure + upsert sections + update progress) no tienen un lugar claro de orquestación.

Se evaluaron las siguientes alternativas:

- **Clean Architecture completa** (4 anillos estrictos): Descartada por exceso de ceremonia para el tamaño actual del equipo (1-2 devs). Requiere mapeo excesivo entre capas.
- **Hexagonal pura** (Ports & Adapters con DI container): Descartada porque TypeScript no tiene un DI container estándar como Java/C#. Implementar uno agrega complejidad sin beneficio claro.
- **Mantener 7 capas sin cambios:** Insuficiente para los problemas de testing y acoplamiento identificados.

## Decisión

Se adopta **Hexagonal Layered Architecture**: las 7 capas existentes se mantienen intactas, y se agregan 4 patrones transversales que resuelven los problemas sin reescribir código existente.

### 1. Ports (Interfaces de Repositorio)

**Ubicación:** `packages/types/src/ports/`

Interfaces abstractas (`IPatientRepository`, `IAnamnesisRepository`, `IAppointmentQueryRepository`) que definen el contrato de acceso a datos sin exponer Supabase. Cada repo existente tiene un adapter factory (`createPatientRepositoryAdapter(client)`) que cierra sobre un SupabaseClient.

**Por qué no inyección de dependencias con container:** En el stack Astro + React islands, no hay un ciclo de vida de aplicación donde un container resuelva dependencias. Los use cases reciben deps como parámetro — es DI manual, simple y explícita.

### 2. Domain Events (Event Bus)

**Ubicación:** `packages/shared/src/events/`

Event bus tipado in-process. Los use cases emiten eventos (`appointment.completed`, `anamnesis.completed`); los handlers reaccionan sin acoplamiento.

**Por qué in-process y no distribuido:**

- AutaMedica es un monolito desplegado como una sola app Astro. No hay microservicios.
- Los side-effects (notificaciones, logging) son operaciones del mismo runtime.
- `Promise.allSettled` en el bus garantiza que un handler fallido no rompe el flujo principal.
- Si un handler falla, el logger lo registra. No hay inconsistencia de datos porque la operación principal (write a DB) ya completó.

**Por qué no Outbox Pattern:**

- Outbox resuelve consistencia entre servicios distribuidos. Aquí todo es in-process.
- Agregar una tabla outbox + worker de background para dispatching introduce complejidad sin beneficio en el modelo actual.
- Si AutaMedica migra a microservicios, Outbox se implementa en ese momento. Hoy es YAGNI.

### 3. Use Cases

**Ubicación:** `apps/web/src/lib/*/usecases/*.usecase.ts`

Funciones que orquestan flujos completos de negocio. Reciben dependencias como primer parámetro (ports + event bus). Testeable con mocks sin DB.

**Por qué no dentro de los services existentes:** Los services mezclan lógica de negocio puntual (transformar un dato) con orquestación (ejecutar N operaciones en secuencia con side-effects). Separar hace explícito qué es lógica pura y qué es flujo.

### 4. CQRS Lite (Read Models)

**Ubicación:** `apps/web/src/lib/*/queries/*.query.ts`

Queries de dashboard separadas de services. Son read-only, optimizadas con `Promise.all`, sin side-effects.

**Por qué Supabase directo para lecturas (sin ORM pesado):**

- El client de Supabase es un query builder HTTP liviano. No hace hydration de objetos como Prisma/Hibernate.
- Las queries de dashboard van directo de Supabase al DTO de UI sin pasar por el modelo de dominio. CQRS autoriza esto para lecturas.
- No hay beneficio en agregar un segundo ORM para lecturas cuando el client existente ya es ligero.

**Por qué no vistas materializadas (todavía):**

- Las queries actuales (~100-500ms con `Promise.all`) son aceptables para el tráfico actual.
- Se crearán vistas materializadas cuando el profiling muestre que son necesarias, no antes.

## Sobre el riesgo de "capas pasamanos"

Las 7 capas pueden parecer excesivas comparadas con los 3-4 anillos de Hexagonal pura. En la práctica:

- **Hook** maneja estado React (no delega sin más).
- **Service FE** transforma datos para la UI y centraliza lógica de presentación.
- **API Client** centraliza auth headers, credentials, error handling.
- **Controller** valida input, auth check, mapea discriminated unions a HTTP status.

Si una capa solo hace `return next.method(args)`, se debe eliminar o colapsar. La regla: si al borrar la capa nada se rompe ni se duplica, no debería existir.

## Consecuencias

### Positivas

- Repos testeables con mocks (vía ports).
- Side-effects desacoplados del flujo principal (vía events).
- Flujos complejos explícitos y trazables (vía use cases).
- Dashboards optimizados sin contaminar lógica de negocio (vía queries).
- Zero breaking changes: todo el código existente sigue funcionando.

### Negativas / Trade-offs

- Más archivos en el codebase (ports, adapters, events, usecases, queries).
- Los devs nuevos necesitan entender la convención de carpetas.
- Los adapter factories son boilerplate — aceptable porque son ~5 líneas cada uno.

### Deuda técnica consciente

- **Outbox:** No implementado. Se implementa si se migra a servicios distribuidos.
- **Vistas materializadas:** No implementadas. Se implementan según profiling.
- **Ports para todos los repos:** Solo 3 repos tienen ports hoy. Se agregan según necesidad, no proactivamente.

## Referencias

- `docs/ARQUITECTURA.md` — Mapa completo del sistema
- `packages/types/src/ports/` — Interfaces de repositorio
- `packages/shared/src/events/` — Event bus y tipos de eventos
- `apps/web/src/lib/*/usecases/` — Use cases
- `apps/web/src/lib/*/queries/` — Read models CQRS
