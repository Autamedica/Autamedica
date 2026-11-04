# AutaMedica — Estado verificado hacia Nivel 4

**Corte de evidencia:** 2026-11-04 (America/Sao_Paulo).  
**Entornos:** GitHub `ecucondorSA/Autamedica` y Supabase producción `qxjjrpksmwwrmubhvjew`.  
**Clasificación:** evidencia factual, limitaciones y criterios de aceptación.  
**Resultado general:** **NIVEL 4 NO ACREDITADO**. No sustituir pruebas con usuarios reales por CI o por estado `ACTIVE_HEALTHY`.

Este documento es una fotografía operativa fechada, **no** una certificación de cumplimiento ni de seguridad clínica. No contiene identificadores de pacientes, claves, tokens, documentos ni credenciales. Revalidar toda cifra en una nueva revisión.

## 1. Hechos comprobados

### 1.1 Respaldo cifrado y custodia externa

- GitHub Actions generó el respaldo retenido #38: [run 41734833692](https://github.com/ecucondorSA/Autamedica/actions/runs/41734833692), artefacto `encrypted-recovery-41734833692-1`. La copia temporal de GitHub está sujeta a vencimiento (registrado 2026-12-03); **no** se considera custodia permanente.
- Una restauración **offline** del respaldo retenido, ejecutada en un Codespace controlado, verificó **228 tablas, 106.832 filas y 318 claves foráneas** de la base recuperada, más **359 objetos** por SHA-256. Evidencia del ensayo local reportada por su operador; el reporte distingue restauración DB/bytes de recuperación completa del servicio Storage. No se utilizó conexión al origen.
- Se ejecutó el replay del **ciphertext real** por una Storage API Supabase local y aislada: **359/359 archivos**, SHA-256 íntegro, rechazo anónimo y rechazo de segundo usuario según **políticas sintéticas** del replay. El ensayo no preservó IDs, versiones, propietarios, metadatos ni RLS clínico original. Referencias [PR #666](https://github.com/ecucondorSA/Autamedica/pull/666) y [procedimiento de prueba](RETAINED_STORAGE_API_REPLAY.md).
- Se completó la transferencia GitHub → **Cloudflare R2 privado** del fichero exclusivamente cifrado (`recovery.tar.gz.gpg`), dividido en cuatro partes, al bucket `autamedica-recovery-offsite-2026`. El [workflow #41766930658, intento 3](https://github.com/ecucondorSA/Autamedica/actions/runs/41766930658) terminó con `success` y `OFFSITE_CIPHERTEXT_CUSTODY_VERIFIED=true`. El archivo original verificó SHA-256; se descargaron las cuatro partes desde R2 y el SHA-256 reconstruido coincidió.
- Consulta directa posterior en Cloudflare R2: cuatro fragmentos de ciphertext de 134.217.728, 134.217.728, 134.217.728 y 130.784.190 bytes (**533.437.374 bytes**), más `SHA256SUMS`, `PARTS.sha256` y `MANIFEST.txt` (y el archivo inocuo `preflight.txt`). URL pública R2 deshabilitada y **cero dominios públicos personalizados**.
- La clave GPG privada y su passphrase **no se transfirieron a R2 ni a CI**. La recuperación de esas credenciales desde un custodio independiente aún **no está acreditada**. No borrar la copia de Codespaces ni el escrow original sin verificar antes custodia separada.

**Límites explícitos:** `retained_database_restore_verified=true`, `retained_storage_bytes_verified=true`, `retained_api_bytes_verified=true` en las pruebas correspondientes. **`storage_service_restore_verified=false`**, `retained_original_metadata_exact=false`, `retained_original_rls_verified=false` y `production_recovery_accredited=false`.

### 1.2 Estado actual de infraestructura y metadatos

- Consulta directa a Supabase producción: proyecto `ACTIVE_HEALTHY` al corte. Esto verifica salud declarada del proyecto, **no** el flujo clínico ni cada integración.
- Consulta SQL de solo lectura a producción (2026-11-04):
  - `storage.buckets`: **5**; de ellos **2** tienen `public=true`.
  - `storage.objects`: **359** registros.
  - `storage.objects`: RLS habilitado; **14** políticas registradas en `pg_policies`.
- El número 359 de objetos actuales coincide con el inventario del respaldo, pero **la igualdad del conteo no demuestra identidad de contenido, recuperación de metadatos, consistencia temporal ni autorizaciones clínicas**.
- Los dos buckets públicos requieren inspección funcional por finalidad, reglas, enlaces firmados y acceso cruzado; **no** se infiere exposición indebida solo por el indicador `public`.
- [Production Deploy #41763404924](https://github.com/ecucondorSA/Autamedica/actions/runs/41763404924) terminó `success` para el commit `5322bf3`. Otros commits posteriores únicamente de documentación/workflows no acreditan por sí solos un nuevo despliegue aplicativo.

### 1.3 Estado de código clínico / farmacéutico

Los siguientes cambios continúan **abiertos y no fusionados** al corte; por lo tanto, su existencia no demuestra que funcionen en producción:

| Área | Referencia | Estado al corte |
| --- | --- | --- |
| Android: emisión de documentos durante videollamada farmacia AR/BR | [PR #670](https://github.com/ecucondorSA/Autamedica/pull/670) | Draft, abierto |
| Ingreso farmacia: identidad invitado y país AR/BR explícito | [PR #672](https://github.com/ecucondorSA/Autamedica/pull/672) | Draft, abierto |
| Certificados AR: protección contra reversión / DEMO reversible | [PR #667](https://github.com/ecucondorSA/Autamedica/pull/667), [#668](https://github.com/ecucondorSA/Autamedica/pull/668) | Drafts, abiertos |
| Recetas AR Farmalink / BR Memed: validación de país clínico | [PR #653](https://github.com/ecucondorSA/Autamedica/pull/653) | Draft, abierto |
| Homologación Farmalink organización 182 / sin puntoEmisor | [PR #655](https://github.com/ecucondorSA/Autamedica/pull/655) | Draft, abierto |
| FirmAR: preflight de firma y callback no activado | [PR #650](https://github.com/ecucondorSA/Autamedica/pull/650) | Draft, abierto |

**No está acreditado** un circuito de emisión real completo desde una consulta en farmacia en Android/web, con médico autorizado, documento clínico válido y recuperación por el paciente, tanto en Argentina como en Brasil. Ni una prueba DEMO ni un PDF local equivalen automáticamente a aprobación formal de proveedor o validez profesional/regulatoria.

## 2. Matriz de puertas de Nivel 4

| Puerta | Situación factual | Para aprobar |
| --- | --- | --- |
| **A — Copia retenida y recuperación independiente** | **Avance sustancial, parcial**: backup cifrado fuera de GitHub, DB offline y 359 bytes por API probados | Escrow independiente y recuperación real de clave; versión/config/Vault y Storage metadata + backend original; prueba completa con origen indisponible y SHA-256 |
| **B — Integridad, segregación y acceso** | **Parcial**: RLS habilitado y 14 policies; ensayos de acceso sobre reglas sintéticas | Controles positivos y negativos de políticas **originales**, paciente/médico, organización y **AR↔BR**, bucket público/privado y URL firmada; revisión clínica documental histórica |
| **C — Flujo clínico verificable** | **Pendiente**: PRs Android y AR/BR no fusionados | Usuario autorizado en Android y web, ingreso farmacia → consulta/videollamada → médico → registro → receta/atestado/certificado válido según país → descarga; evidencia no identificable, supervisión médica |
| **D — Operación y alertas** | **Pendiente acreditación**: salud de Supabase y CI no prueban alertamiento real | Fallo controlado, alerta efectivamente entregada, triage, restauración y manejo de error de proveedor; métricas operativas verdaderas |
| **E — Estabilidad** | **NO iniciada** | Identificar versión final posterior a A–D y observar **72 horas** de disponibilidad/errores/incidentes/flujos con cero P0/P1 abiertos; un cambio crítico reinicia la ventana afectada |

Definición de las puertas y criterio de observación coherentes con [BACKUP_RUNBOOK.md](BACKUP_RUNBOOK.md) y [RUNTIME_ASSURANCE_CHECKLIST.md](RUNTIME_ASSURANCE_CHECKLIST.md).

## 3. Próximas decisiones y entregables

| Orden | Responsable funcional | Acción verificable | Evidencia de cierre |
| --- | --- | --- | --- |
| P0 | Ingeniería + custodio de seguridad | Custodiar GPG privada y passphrase **fuera de R2 y GitHub**, con acceso restringido y recuperación de prueba; mantener separado de ciphertext | Acta de custodia sin secretos y prueba de descifrado local con hash concordante |
| P0 | Ingeniería Supabase + seguridad | Recuperar metadata real, versiones/owner/buckets y objeto backend en stack totalmente aislado; confirmar reglas clínicas reales, incluida separación BR/AR | `storage_service_restore_verified=true` sustentado en ensayo independiente, no cambiado por declaración |
| P0 | Ingeniería + dirección clínica | Revisar y cerrar PRs de Android/ingreso y documentos AR/BR; integrar homologaciones externas antes de declarar emisión válida | E2E clínico aprobado por país con usuarios autorizados y pruebas negativas, sin PHI en CI/logs |
| P1 | Ingeniería + operaciones | Probar fallo simulado, alerta entregada y recuperación; definir RPO/RTO medidos y revisar retención de R2 e inmutabilidad | Evidencia de incidente, recepción de alerta, métrica y restauración cronometrada |
| P1 | Operaciones + dirección | Publicar release identificado y observar 72 h **solo después** de cerrar puertas precedentes | Reporte de observación, incidentes y firma de aceptación |

## 4. Riesgos que siguen abiertos

1. **Pérdida de capacidad de descifrado:** existencia de ciphertext en R2 sin escrow independiente recuperable.
2. **Reproducción incompleta del servicio:** archivos válidos sin recuperar exactamente metadata/versiones y RLS clínica real.
3. **Cruce AR/BR:** cuentas/roles/países deben probarse contra reglas de producción en un entorno controlado y no mediante una política sintética.
4. **Homologación y validez documental:** no atribuir acreditación a Memed, Farmalink o FirmAR sin evidencia formal y pruebas clínicas reales.
5. **Continuidad:** no hay aún verificación de renovación periódica del offsite, retención/inmutabilidad, observabilidad y 72 h de estabilidad.

## 5. Reglas de actualización de este registro

- Mantener separadas cuatro fuentes: **prueba de restore local**, **GitHub Actions**, **Cloudflare R2** y **Supabase producción**. Una prueba en una no acredita automáticamente a las demás.
- Cada puerta solo cambia a «acreditada» con URL de ejecución o informe técnico **verificable**, fecha, versión SHA, responsable y límites.
- Una cifra proveniente de una captura histórica debe etiquetarse como tal y revalidarse antes de aprobar una fase.
- Nunca escribir secretos, credenciales, enlaces firmados, datos de pacientes ni contenidos clínicos identificables en GitHub.
- Cerrar Nivel 4 únicamente tras aprobar **A, B, C, D y E**, no por porcentaje subjetivo ni por cumplir un plazo estimado.
