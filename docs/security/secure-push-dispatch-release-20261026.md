# AutaMedica — despliegue seguro de Push de guardia (BR)

Estado: **preparado en PR #552; NO aplicado a producción**.

## Dependencias obligatorias

El código Edge ya no acepta `anon` ni un evento `pharmacy_dispatch_incoming` declarado por el cliente.
La base entrega Push mediante una función privada y **dos secretos por proyecto**:

| Ubicación | Nombre | Contenido |
|---|---|---|
| Edge Function secrets | `PUSH_DISPATCH_SECRET` | secreto aleatorio de 32+ caracteres |
| Supabase Vault | `autamedica_push_dispatch_secret` | mismo secreto privado |
| Supabase Vault | `autamedica_push_project_url` | URL del propio proyecto, p. ej. `https://<project-ref>.supabase.co` |

Nunca copiar la URL de producción a staging. No registrar secretos, tokens de pacientes ni las respuestas con datos clínicos en GitHub.

## Procedimiento por entorno

1. Obtener dos proyectos **separados** (staging y producción), cada uno con sus propios secretos; restaurar staging si no está disponible.
2. Crear un secreto largo y distinto por proyecto en un gestor seguro. Configurar `PUSH_DISPATCH_SECRET` en la Edge Function del **mismo** proyecto.
3. Desde el editor SQL restringido de ese proyecto, registrar en Vault mediante `vault.create_secret(<valor_del_secret>, 'autamedica_push_dispatch_secret')` y `vault.create_secret(<url_del_proyecto>, 'autamedica_push_project_url')`. Usar valores de un gestor de secretos; **nunca** pegarlos en una migration versionada.
4. Validar únicamente **nombres y presencia** de los dos registros de Vault, no los valores descifrados. Comprobar que la URL corresponda al propio proyecto.
5. Ejecutar migración SQL de PR #552 y luego desplegar la Edge Function `send-push-notification` de ese mismo commit. **Orden importa:** desplegar sólo la Edge Function primero dejaría las llamadas SQL heredadas sin token autorizado y podría interrumpir la guardia. Minimizar el intervalo entre los dos cambios.
6. Validar con identidades ficticias: petición anónima rechazada (401); token `anon` rechazado (401); llamada privada válida; móvil de médico autorizado recibe `userId` correcto; médico inactivo/PENDING no recibe oferta; expiración de 30 s y siguiente oferta; sin difusión a terceros.
7. Revisar los logs del servicio, errores `pg_net` y `net._http_response` sin copiar contenido clínico. Tener rollback planificado en una transacción/ventana controlada.

## Criterios de no despliegue

- Vault incompleto o credenciales de staging apuntando a producción.
- Falta de dispositivo de prueba y cuentas clínicas sintéticas.
- Fallos de replay SQL, CI general o tests de autorización.
- Falta de revisión oficial de matrículas o dependencia no probada de los RPC `match_dispatch_doctors` y `advance_expired_dispatch_offers`.

Los cambios no alteran Comunidad ni TDAH. El PR #551 contiene otras restricciones RPC que deben validarse conjuntamente antes de liberarse.
