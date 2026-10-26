# Registro de hotfix SQL aplicado a producción — 26/10/2026

Proyecto Supabase: `qxjjrpksmwwrmubhvjew` (producción).
**Esto registra despliegues efectivamente ejecutados por el conector Supabase MCP,
NO una fusión de GitHub ni una publicación de APK.**

Todas las operaciones indicadas a continuación fueron `apply_migration` con respuesta `success:true`; después fueron contrastadas con el ledger productivo y comprobaciones SQL de privilegios, definiciones y totales. Se usaron únicamente cambios DDL/ACL; no se hicieron conversiones, eliminaciones o modificaciones en masa de datos.

| Ledger productivo | Nombre registrado | Alcance |
|---|---|---|
| `20261026064540` | `prod_privileged_rpc_acl_containment_20261026` | Revoca ejecución pública de 11 RPC internos; `claim_dispatch_offer` se mantiene para autenticados autorizados |
| `20261026064658` | `prod_restrict_doctor_weekly_availability_20261026` | Titularidad sobre modificación de horarios; doctor autenticado y servidor conservan acceso |
| `20261026065035` | `prod_harden_wallet_rpc_patient_ownership_20261026` | Protege saldo por identidad; créditos/débitos privilegiados solo por servicio |
| `20261026065203` | `prod_block_anonymous_kiosk_user_spoofing_20261026` | Impide `requested_by_user_id` suplantado en solicitudes kiosco y trigger |
| `20261026065259` | `prod_restrict_unverified_care_team_assignment_20261026` | Exige vinculación clínica válida para equipos médicos |
| `20261026065305` | `prod_protect_dispatch_immutable_clinical_fields_20261026` | Impide modificación directa no autorizada de campos de despacho |
| `20261026065424` | `prod_block_provisional_pharmacy_offer_acceptance_20261026` | Evita aceptación de ofertas por médico inactivo o con matrícula `PENDING` |

Las sentencias originales están disponibles en el histórico de esta intervención y corresponden a subconjuntos / archivos de PR #554: `20261026133000`, `20261026135000`, `20261026114500`, `20261026153000`, `20261026154000`, `20261026155000` y `20261026150000`. Las versiones generadas por `apply_migration` **no corresponden** a las versiones de esos archivos del repositorio.

## Comprobaciones posteriores

- Supabase reportó `ACTIVE_HEALTHY`.
- Permisos: `anon` rechazado en RPCs críticos, saldo y aceptación de ofertas; `service_role` conserva acceso.
- Autorización de agenda: una petición sin identidad fue rechazada antes de modificar filas (prueba en transacción con `ROLLBACK`).
- Billeteras: **68** registros; crédito disponible agregado **1.600.000 centavos**, sin cambios.
- Disponibilidad: **3.665** filas; vínculos asistenciales: **978**; solicitudes despacho: **153**; ofertas aceptadas: **17**; sin variaciones en los controles antes/después.
- El advisor de seguridad aún presenta advertencias; estos cambios NO implican auditoría completa del proyecto.

## No desplegado deliberadamente

1. Migraciones monetarias `20261026103000` y `20261026110000` y nuevas Edge Functions de Mercado Pago: **1.649** pacientes no tenían ni billetera ni documento, y el inicializador propuesto rechaza pacientes sin CPF/DNI. Debe diseñarse transición de jurisdicción que no interrumpa recargas/consultas. No interpretar los 68 monederos ARS históricos como BRL.
2. SQL/Edge Push `20261026144000`: requiere `PUSH_DISPATCH_SECRET` y secretos Vault `autamedica_push_dispatch_secret` y `autamedica_push_project_url` configurados juntos; no desplegar por separado. La vulnerabilidad Push es riesgo residual conocido.
3. Reglas generales de acreditación médica de PR #546: requieren auditoría documental de **26** registros de médicos activos con matrícula `PENDING` y evaluación de continuidad asistencial.
4. Publicación de Android (Play Console/MDM) y cambios web de PR #554: GitHub Actions verdes son una validación de integración, NO una publicación.
5. Supabase Staging NO se utilizará por instrucción del usuario. No se crearon ramas Supabase adicionales: el plan Free bloquea branching.

## Advertencia de conciliación de migraciones

Antes de un `supabase db push` o fusión de PR #554, comparar el ledger anterior con las migraciones versionadas del repositorio y evitar ejecuciones redundantes. **No marcar las migraciones restantes como aplicadas sin ejecutar/verificar.** Las migraciones de producción ejecutadas en este hotfix están registradas en Supabase y requieren reconciliación de versión antes de otro deploy masivo.

**Prohibido incluir datos clínicos, secretos o tokens en este registro.**
Comunidad y TDAH excluidos.

## Integración segura de GitHub `main`

Los ocho archivos SQL bajo sus versiones **registradas en el ledger de producción** fueron añadidos en el PR de reconciliación; incluyen el arreglo monetario previamente aplicado `20261026063251`. El archivo correspondiente a `20261026064540` mantiene los permisos aplicados en producción, pero tolera las RPC legacy ausentes en una reconstrucción limpia sin copiar datos clínicos. Este cambio no despliega nuevas funciones, pagos, Push ni actualizaciones APK. No ejecutar de nuevo estos ocho números de versión contra producción. Verificar su existencia en `supabase_migrations.schema_migrations` antes de cualquier `db push`.
