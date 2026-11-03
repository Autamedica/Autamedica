# Memed Brasil — primer piloto clínico controlado

Fecha de inspección: 2026-11-03. Entorno: Cloudflare Pages y Supabase PRODUCCIÓN. **No se ha realizado ninguna emisión clínica de prueba.**

## Evidencia read-only

- Cloudflare Pages `autamedica-web` y `autamedica-doctors`: `MEMED_API_KEY` y `MEMED_SECRET_KEY` configuradas como secretos; `MEMED_API_URL=https://api.memed.com.br/v1`; `MEMED_SCRIPT_URL=https://partners.memed.com.br/integration.js`.
- Ambos tienen `MEMED_RX_ENABLED=false`. **No cambiarlo sin preflight positivo y autorización de prueba supervisada**.
- `MEMED_PILOT_DOCTOR_ID` configurado y el registro médico existe en Supabase prod; médico activo CRM con licencia CFM activa y validada, con matrícula/UF coincidentes. No incluir ID/CPF en esta documentación.
- Hay 0 recetas `vendor_name=memed` registradas, 0 firmas Memed verificadas y 0 registros en `memed_doctor_identities` (la identidad podría provenir de `doctors` o `profiles`).
- Staging tiene 0 médicos y le faltan objetos de integración que están en producción. No puede utilizarse aún para un E2E clínico representativo.
- Segunda consulta agregada de producción: el piloto tiene perfil con nombre completo, pero **no** se dispone de CPF de 11 dígitos entre médico/perfil (la tabla privada de Memed sigue vacía); el médico debe proporcionarlo mediante el formulario autenticado de Memed, nunca por chat o en un commit.
- No existen actualmente pacientes BR con `active=true`, `lgpd_consent=true` y `care_country='BR'` (conteo: 0); el piloto no tiene citas ni vínculos activos con pacientes (0 y 0). El circuito normal rechazará la emisión hasta crear una relación clínica legítima con consentimiento.
- Estos bloqueos hacen que `readyForControlledPilot` deba permanecer en falso aunque las credenciales sean correctas. No activar `MEMED_RX_ENABLED` basándose solo en el CRM validado.
- Hay documentos con `signed_pdf_url` no nulo, pero una URL **no equivale a una firma criptográfica válida**.

## Preflight nuevo

`GET /api/admin/integrations/memed-health` (solo administrador) valida credenciales Memed sin emitir nada. Además comprueba que el piloto está activo, con CRM/UF validado y nombre y CPF correctos, devolviendo solo booleanos, sin CPF, nombre, token ni matrícula. `readyForControlledPilot` indica que se puede iniciar una prueba supervisada, **no** que ya exista receta firmada o entregada. `clinicalEndToEndVerified` permanece falso.

## Prueba que falta antes de `MEMED_RX_ENABLED=true`

1. Administrador autenticado ejecuta preflight productivo y conserva solo status, fecha y booleans.
2. Médico piloto accede con identidad propia; completa CPF/fecha de nacimiento si Memed los solicita. **No usar ni inventar identidades de demostración en producción**.
3. Médico verifica paciente brasileño con acceso clínico legítimo y consentimiento.
4. Sólo con autorización del médico para la consulta se habilita controladamente `MEMED_RX_ENABLED` para ese piloto. El endpoint de emisión ya limita el uso al médico configurado.
5. El médico crea una receta clínicamente justificada. Verificar en proveedor, comprobar firma ICP-Brasil cuando corresponda, el PDF final y la entrega segura al paciente. Registrar comprobantes y comportamiento en farmacia sin exponer información clínica.
6. Dejar `status=draft` mientras falte evidencia de firma o entrega. No modificar registros a `signed` simplemente porque Memed haya respondido `signed=true`.
7. Revertir `MEMED_RX_ENABLED=false` ante fallo; no habilitar masivamente a médicos hasta probar E2E.

## Trabajo paralelo

- Argentina Farmalink PR #655 en borrador. Esperar respuesta de homologación y credenciales productivas; no reenviar `altaReceta` sin reconciliación. El PDF de prueba no acredita firma ni CUIR oficial.
- Argentina certificados: integración FirmAR/PFDR requiere autorización institucional real y firma del profesional, no basta con el registro ReNaPDiS ni Farmalink.
- Brasil atestados: firma cualificada ICP-Brasil y verificación ITI/QR; política de CID basada en consentimiento. Verificar con un médico real y paciente debidamente identificado.

Este PR no modifica banderas de producción, datos clínicos, claves ni firmas.
