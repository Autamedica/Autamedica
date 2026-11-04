# Memed Brasil — contrato E2E DEMO

## Objetivo
Evaluar si un médico y un paciente con datos ficticios atraviesan los **mismos handlers de AutaMedica** que usarían con datos reales, y detectar qué requisitos bloquean una operación incorrecta.

## Alcance demostrado
- Test `apps/web/src/lib/prescriptions/brazil/memed-demo-e2e.test.ts`: importa los dos endpoints auténticos `memed-token` y `memed-event`, su `resolveMemedPatient` y `MemedService` sin modificarlos por versiones simuladas.
- Base Supabase **simulada en memoria**, con médico BR DEMO activo, CRM/UF y estado CFM **simulados**, un vínculo médico-paciente DEMO, CPF de prueba con checksum correcto y paciente BR con consentimiento de prueba.
- La llamada HTTP a `api.memed.com.br` es **interceptada antes de salir del proceso**. Los cuerpos de proveedor son simulados; no se usa Memed TEST/PROD, no se registran prescriptores o recetas externas.
- Se ensaya token DEMO de médico existente **y alta inicial DEMO con GET 404 -> POST de registro**, guardando CPF de prueba exclusivamente en una tabla privada simulada; también evento DEMO, comprobación de identidad profesional/paciente, persistencia local simulada, idempotencia, rechazo paciente AR, rechazo sin consentimiento/relación, suplantación y kill switch.
- Aun si el proveedor simulado dice `signed=1`, AutaMedica debe conservar `status=draft`, `signature_verified=false`, `delivery_verified=false`.

## Lo que **NO** queda demostrado
- Memed aceptó credenciales reales o una identidad DEMO en su ambiente de pruebas.
- Se emitió o firmó legalmente una receta brasileña, se validó ICP-Brasil o se entregó/dispensó en farmacia.
- Staging o Cloudflare fueron modificados, hubo usuario/paciente real o consentimiento jurídicamente válido.
- El flujo de prescripción **dentro del SDK JavaScript de Memed** fue probado con navegador o proveedor; el test reproduce la notificación posterior y la verificación de la receta, no una alta real.

## Promoción a producción
Se exige prueba de credenciales read-only, registro de médico y paciente reales con consentimiento, atención legítima, firma ICP-Brasil y entrega; no se permite habilitar `MEMED_RX_ENABLED` por el simple hecho de que DEMO pase.

**Todos los datos de identidad presentes en el test son sintéticos y no deben circular hacia el proveedor externo.**
