# Matriz maestra de auditoría E2E de Autamedica

- **Alcance:** 19 recorridos funcionales de extremo a extremo.
- **Clasificación:** 15 P0 (operación clínica, acceso, monetización principal y continuidad) + 4 P1 (ecosistema complementario).
- **Repositorio:** `Autamedica/Autamedica`.
- **Base de referencia al crear esta matriz:** `main` en `0e13d4db522e244027714786a2df7211cd7e03e0`.
- **Estado inicial de esta matriz:** inventario definido; las 19 ejecuciones E2E contra entornos integrados quedan **PENDIENTES**. La existencia de un spec, test unitario, contrato SQL o smoke test no equivale a aprobar un recorrido E2E.
- **Regla de aprobación:** solo PASS cuando el flujo completo se ejecuta con identidades de prueba reales del entorno, llega al estado final esperado y se verifica la persistencia y los efectos laterales. Un rebote a login, una pantalla visible, mocks que sustituyen el backend crítico o un test omitido no son PASS.

## 1. Resumen de cobertura

| Prioridad | Flujos | Objetivo |
|---|---:|---|
| P0 | 15 | Demostrar operación clínica y comercial esencial |
| P1 | 4 | Demostrar operación del ecosistema extendido |
| **Total** | **19** | **Cobertura E2E integral** |

**Estados permitidos:** PENDIENTE, PASS, FAIL, BLOCKED-EXTERNAL. BLOCKED-EXTERNAL exige evidencia concreta de la dependencia externa ausente y no se computa como PASS. Registrar SHA, entorno, fecha UTC, actor sintético, ejecución, trazas y artefactos por cada intento.

## 2. Matriz de los 19 recorridos

### P0 — operación esencial

| ID | Recorrido y actores | Escenario E2E mínimo de aprobación | Fallos, recuperación e invariantes | Evidencia / estado |
|---|---|---|---|---|
| E2E-01 | **Identidad y acceso**. Paciente, médico, farmacia, operador/admin. | Alta o invitación → confirmación → login → bootstrap de sesión → portal según rol → refresh → logout → login posterior. Incluir email/password y OAuth cuando estén habilitados. | Rechazar credenciales inválidas, sesión expirada y rutas de rol ajeno; logout invalida sesión y limpia estado local; ningún redirect puede contar como autenticación aprobada. | Playwright/Patchright + API/Auth + DB/RLS. PENDIENTE |
| E2E-02 | **Onboarding del paciente**. Paciente. | Registro → perfil → país/documento correcto (CPF Brasil o DNI Argentina) → datos de contacto → consentimiento/aceptación de producto → anamnesis inicial → persistencia y reapertura. | Validar campos obligatorios y formato por país; evitar duplicados; retomar onboarding sin perder datos; aislamiento entre pacientes. | Browser + API + Supabase. PENDIENTE |
| E2E-03 | **Alta y habilitación del médico**. Médico y administración clínica. | Invitación/registro → perfil profesional → especialidad → documentación/credenciales → revisión administrativa → habilitación → disponibilidad/guardia visible para asignación. | Médico no habilitado no recibe asignaciones; cambios de disponibilidad se reflejan; rechazos y reintentos conservan trazabilidad. No simular habilitación como si fuera verificación real. | Browser + API + DB/RLS + proveedor de identidad profesional si aplica. PENDIENTE |
| E2E-04 | **Agenda y turnos**. Paciente y médico. | Paciente consulta profesionales y horarios → reserva → médico ve el turno → confirmación → reprogramación/cancelación → ambos ven el mismo estado. | Concurrencia sobre el último horario, zona horaria, doble reserva, cancelación repetida y turno vencido; consistencia de estados y notificaciones. | Browser + API + DB + notificaciones. PENDIENTE |
| E2E-05 | **Teleconsulta en vivo**. Paciente y médico en dos sesiones/dispositivos independientes. | Turno elegible → crear/resolver sesión → ambos se autentican → join → permisos de cámara/micrófono → audio/video bidireccional → finalizar → estado final persistido. | Médico ausente, paciente ausente, permiso denegado, red interrumpida, refresh/rejoin, ICE/SFU y cierre de sesión; verificar que no se crea una consulta fantasma. | Patchright/Playwright multi-contexto + Cloudflare Calls/SFU real de staging + logs. PENDIENTE |
| E2E-06 | **Atención e historia clínica**. Médico y paciente. | Médico abre paciente/turno autorizado → revisa antecedentes → registra anamnesis, signos, diagnóstico/notas y plan → guarda → cierra → vuelve a abrir y verifica datos y autoría. | RLS entre pacientes, edición concurrente, campos obligatorios, autosave/reintento y auditoría; respetar estados draft/submitted/approved/locked. | Browser + API + DB/RLS + auditoría. PENDIENTE |
| E2E-07 | **Receta médica**. Médico, paciente y farmacia. | Durante/tras atención, médico crea receta → valida datos y productos → emite → genera documento/QR/CUIR según país → paciente consulta/descarga → farmacia recupera y valida la misma receta. | No duplicar emisión; documento coincide con registro; permisos por rol; expiración, revocación y validación inválida. No afirmar firma/verificación oficial si no se conectó el validador real. | Browser + API + storage + DB + validador externo si aplica. PENDIENTE |
| E2E-08 | **Atestados e informes**. Médico y paciente. | Médico genera atestado/informe desde atención → guarda → paciente autorizado accede y descarga → documento y registro mantienen mismo identificador, fechas y autor. | Reintento sin duplicar, acceso cruzado denegado, documento corrupto/no disponible, corrección/versionado y trazabilidad. | Browser + API + storage + DB. PENDIENTE |
| E2E-09 | **Farmacia y dispensación**. Farmacia, paciente y médico. | Farmacia autenticada → recibe receta/solicitud → valida paciente y documento → registra disponibilidad/dispensación → paciente y sistema reflejan el resultado. | Solicitud duplicada, receta inválida/revocada, stock/estado concurrente, rechazo y reintento; impedir que una farmacia vea pacientes/recetas fuera de su autorización. | Browser + API + DB/RLS + storage. PENDIENTE |
| E2E-10 | **Seguimiento clínico**. Paciente y médico. | Paciente consulta historial longitudinal autorizado → revisa consultas, recetas, atestados y resultados disponibles → médico agrega seguimiento → paciente ve la actualización permitida. | Orden cronológico, consistencia entre módulos, paginación, estados bloqueados y acceso por rol; módulos anunciados como “Pronto” no deben reportarse como funcionales. | Browser + API + DB/RLS. PENDIENTE |
| E2E-11 | **Pago y ciclo financiero**. Paciente, PSP y backend. | Checkout → creación de orden → pago TEST → webhook firmado → verificación server-side → estado aprobado → habilitación del servicio → conciliación. Incluir rechazo, pending, timeout, webhook repetido y reembolso. | Idempotencia, firma/autenticidad del webhook, monto/moneda/beneficiario, no habilitar antes de aprobación, no reactivar tras reembolso; reconciliar orden, PSP y ledger. | Browser + API + PSP sandbox real + webhook + DB. PENDIENTE |
| E2E-12 | **Jordan Brasil**. Paciente invitado, médico, PSP y runtime SFU. | QR → landing/registro invitado → CPF y datos BR → cotización BRL → checkout TEST → pago aprobado por webhook → oferta/dispatch al médico elegible → aceptación → sesión SFU → llamada bidireccional → finalización y persistencia. | Pendiente/rechazado/reembolsado no habilita llamada; médico offline/timeout; reintento sin doble cobro ni doble despacho; aislar identidad/país y validar R$79/R$40 según contrato vigente. | Android/web + PSP TEST + Supabase + SFU real de staging + logs correlacionados. PENDIENTE |
| E2E-13 | **Android paciente y médico**. Aplicación instalada en dispositivos/emuladores autenticados. | Instalación/build → login → navegación → agenda → detalle → acción clínica/consulta → sincronización remota → cierre y reapertura → logout → segundo usuario. | Cambio de usuario y caché offline aislada; proceso muerto; permisos; deep links; no filtrar datos entre cuentas; no considerar tests JVM como E2E de dispositivo. | Android instrumentation/UI + dispositivo físico para release + backend staging. PENDIENTE |
| E2E-14 | **Notificaciones y deep links**. Paciente y médico. | Evento real (turno, mensaje o llamada) → push/email entregado → apertura con app fría y caliente → bootstrap de sesión → destino correcto → acción completada. | Token FCM rota y se elimina al logout; usuario A no recibe eventos de B; deep link no omite auth; manejar duplicados, expiración y payload incompleto. | FCM/email de prueba + Android instrumentation + browser + DB. PENDIENTE |
| E2E-15 | **Administración y controles operativos**. Admin y usuarios de roles restringidos. | Admin autenticado → gestiona usuario/médico/organización → cambia disponibilidad/interruptor operativo → cambio persiste y afecta el flujo real → auditoría registra actor y valor anterior/nuevo. | Usuario no admin no modifica; flags no divergen entre UI y backend; cambios concurrentes; rollback controlado; no exponer secretos ni PHI en logs. | Browser + API + DB/RLS + audit log. PENDIENTE |

### P1 — ecosistema extendido

| ID | Recorrido y actores | Escenario E2E mínimo de aprobación | Fallos, recuperación e invariantes | Evidencia / estado |
|---|---|---|---|---|
| E2E-16 | **Empresas y trabajadores CLT**. Admin empresa, trabajador y médico. | Crear organización → incorporar trabajador → verificar vínculo → trabajador accede → solicita consulta/atestado → médico atiende → trabajador descarga documento → empresa ve únicamente métricas/datos autorizados. | Empleado desvinculado, invitación vencida, límites por organización y aislamiento de datos clínicos frente al empleador. | Browser + API + DB/RLS. PENDIENTE |
| E2E-17 | **Farmacias asociadas y comisiones**. Farmacia, canal de referencia y administración. | Alta de partner → generar/atribuir QR → paciente inicia flujo → conversión confirmada → comisión calculada y liquidable → reversión por cancelación/reembolso. | Atribución duplicada, fraude/replay, comisión sobre pago no aprobado, reversión e idempotencia; conciliar importes. | Browser + API + PSP sandbox + DB/ledger. PENDIENTE |
| E2E-18 | **Comunidad y participación**. Usuario autenticado y moderador. | Crear publicación → listar → comentar/reaccionar/reseñar → editar/eliminar según permisos → moderación → persistencia y actualización para segundo usuario. | XSS, spam, contenido eliminado, permisos y privacidad; no filtrar datos clínicos a espacios comunitarios. | Browser + API + DB/RLS. PENDIENTE |
| E2E-19 | **Inteligencia operativa y reportes**. Admin/operaciones. | Generar actividad sintética conocida → abrir dashboard/reporte → comparar totales con consultas fuente → filtrar por período/país/organización → exportar y reconciliar. | Zona horaria, duplicados, datos tardíos, filtros, permisos y exportaciones; explicar diferencias entre eventos y operaciones confirmadas. | Browser + API/queries + DB + exportación. PENDIENTE |

## 3. Cobertura de pruebas existente localizada

Los siguientes artefactos son puntos de partida, no aprobaciones automáticas:

| Artefacto | Aporta evidencia para | Límite |
|---|---|---|
| `tests/e2e/role-routing.spec.ts` | E2E-01 | Enrutamiento no demuestra ciclo de identidad completo. |
| `tests/e2e/doctor-video-call-flow.spec.ts` | E2E-05 | Debe confirmarse ejecución con dos usuarios autenticados y SFU real. |
| `tests/e2e/auto-heal-reconnect.spec.ts` | E2E-05 | Recuperación técnica parcial, no consulta completa. |
| `tests/e2e/prescription-flow.spec.ts` | E2E-07, E2E-09 | Validar ejecución integrada, persistencia y permisos reales. |
| `tests/e2e/telemedicina-production.spec.ts` | E2E-05 | Smoke test no sustituye llamada bidireccional. |
| `supabase/tests/jordan_br_79_40_dispatch_isolated.sql` | E2E-12 | Contrato SQL aislado no prueba PSP + SFU. |
| `scripts/ci/jordan-release-contract.test.mjs` | E2E-12 | Contrato estático, no recorrido runtime. |
| `apps/web/src/pages/api/pharmacy/dispatch/request.test.ts` | E2E-12 | Test API aislado, no recorrido completo. |
| `docs/ANDROID_PLATFORM_SENIOR_E2E_GUIDE_2026-03-06.md` | E2E-13, E2E-14 | Guía documenta brechas; tests JVM no equivalen a E2E Android. |
| `docs/releases/JORDAN_RELEASE_EVIDENCE.md` | E2E-11, E2E-12 | Registra PSP TEST + SFU E2E como NO-GO/no ejecutado en esa evidencia. |

## 4. Protocolo obligatorio de ejecución

### Entornos y datos
1. Ejecutar primero en staging/homologación con cuentas sintéticas independientes para paciente, médico, farmacia, empresa y admin.
2. Para Brasil, usar datos sintéticos válidos en formato CPF; para Argentina, DNI sintético. Nunca reutilizar datos reales de pacientes.
3. PSP: sandbox/test mode con webhooks firmados y eventos reproducibles. No realizar cobros reales como prueba.
4. Video: dos contextos de navegador/dispositivos independientes, con cámara y micrófono habilitados y SFU desplegado.
5. Android: build identificable por SHA, instrumentation tests y al menos una validación en dispositivo físico antes de declarar listo el canal.
6. Registrar secretos como nombres/estado de presencia; nunca copiar valores a reportes, screenshots o logs.

### Evidencia mínima por ejecución
- ID del flujo y escenario.
- SHA exacto del frontend, backend, migraciones y app móvil.
- Entorno y timestamp UTC.
- Identificadores sintéticos de actores y operaciones.
- Resultado de cada paso y estado final.
- Correlation/request IDs, logs redactados y trazas.
- Capturas/video sin PHI y respuestas verificables de DB/API.
- Resultado: PASS, FAIL o BLOCKED-EXTERNAL, con issue enlazado si falla.

### Criterios globales de PASS
- El actor correcto completa el flujo desde el entrypoint real hasta el resultado final.
- El backend confirma el estado; la UI no es la única fuente de verdad.
- Los datos persisten y sobreviven refresh/relogin cuando corresponde.
- Las políticas RLS y los límites entre roles/usuarios se verifican con intentos positivos y negativos.
- Reintentos y webhooks duplicados no generan dobles operaciones.
- Los errores recuperables permiten continuar sin corromper el estado.
- No hay errores críticos en consola, red, logs de backend o servicios integrados.
- La prueba se ejecutó; no está skipped, mocked en el límite crítico ni redirigida al login.

## 5. Orden de ejecución sugerido

1. **Bloque identidad y datos:** E2E-01, E2E-02, E2E-03, E2E-15.
2. **Bloque de acceso clínico:** E2E-04, E2E-06, E2E-10.
3. **Bloque consulta y documentos:** E2E-05, E2E-07, E2E-08, E2E-09.
4. **Bloque comercial y canales:** E2E-11, E2E-12, E2E-13, E2E-14.
5. **Bloque de expansión:** E2E-16, E2E-17, E2E-18, E2E-19.

Los flujos con dependencias compartidas deben reutilizar los mismos fixtures sintéticos y correlation IDs cuando formen parte de una misma cadena de negocio, pero conservar casos independientes para poder localizar regresiones.

## 6. Tablero de resultados

| Estado | P0 (15) | P1 (4) | Total (19) |
|---|---:|---:|---:|
| PASS | 0 | 0 | 0 |
| FAIL | 0 | 0 | 0 |
| BLOCKED-EXTERNAL | 0 | 0 | 0 |
| PENDIENTE | 15 | 4 | 19 |

> Este tablero es el estado inicial del plan, no una afirmación de que se hayan ejecutado o aprobado pruebas. Actualizarlo únicamente con evidencia de ejecución asociada al SHA correspondiente.

## 7. Referencias internas

- [Arquitectura v2](../ARQUITECTURA_V2.md)
- [Evidencia de release Jordan](../releases/JORDAN_RELEASE_EVIDENCE.md)
- [Guía E2E Android](../ANDROID_PLATFORM_SENIOR_E2E_GUIDE_2026-03-06.md)
- [Spec de llamada médico-paciente](../../tests/e2e/doctor-video-call-flow.spec.ts)
- [Spec de recetas y farmacia](../../tests/e2e/prescription-flow.spec.ts)
- [Spec de recuperación de llamada](../../tests/e2e/auto-heal-reconnect.spec.ts)
- [Spec de routing por roles](../../tests/e2e/role-routing.spec.ts)
