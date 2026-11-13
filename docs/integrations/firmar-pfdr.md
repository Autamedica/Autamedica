# Integración FirmAR / PFDR — estado y requisitos

**Estado (26-10-2026):** cliente HTTP + pruebas incorporados en el PR #559.
**PROHIBIDO habilitar en producción antes de obtener aprobación institucional y verificar firma real.**

## Antecedentes verificados

- La integración SIU-Araí utiliza un usuario y secreto de API, OAuth 2
  `client_credentials`, `POST /firmador/api/signatures` y un callback
  de documentos firmados registrado en FirmAR:
  https://documentacion.siu.edu.ar/documentos/docs/1.8.1/firmar-implementacion/
- Cada médico debe gestionar su certificado remoto y autorizar la firma.
  La integración **no** elimina OTP/PIN ni permite firmar por un tercero.
- Una inscripción ReNaPDiS / una homologación Farmalink de recetas **no**
  habilita automáticamente el servicio FirmAR para atestados.

## Configuración requerida (valores SOLO en secretos del runtime)

- `FIRMAR_ENABLED=false` (valor por defecto; fail-closed).
- `FIRMAR_BASE_URL=https://tst.firmar.gob.ar` (homologación; producción sólo con confirmación oficial).
- `FIRMAR_API_USER` (entregado a la institución integradora).
- `FIRMAR_API_SECRET` (entregado a la institución integradora).
- `FIRMAR_CALLBACK_URL` (HTTPS, destino registrado ante FirmAR).
- `FIRMAR_RETURN_URL` (HTTPS, página de retorno autorizada).
- La plataforma administradora y el certificador deben confirmar el acceso
  al entorno, callback y formato definitivo de los endpoints.

**No incluir secretos** en GitHub, Supabase tablas públicas,
`PUBLIC_*`, logs, tickets ni documentación de pruebas.

## Flujo de emisión previsto

1. Médico autenticado abre un atestado para paciente con acceso confirmado.
2. Backend verifica matrícula/REFEPS según exigencias y carga datos clínicos
   de Supabase, no del payload del navegador.
3. Médico confirma de manera inequívoca el documento a firmar.
4. Generar PDF y hash de los bytes originales; crear una sesión con token
   aleatorio y único, médico/CUIL, certificado, hash, vencimiento y
   estado `awaiting_doctor_authorization`.
5. El backend usa `FirmarRemoteClient.createSigningSession` para enviar el
   documento a FirmAR, y devuelve una URL de autorización del dominio oficial.
6. Médico completa el flujo obligatorio de PIN/OTP de FirmAR.
7. El callback recibe el documento firmado. **No confiar en un callback por
   venir del servidor externo, ni sólo por metadata.token:** verificar el
   vínculo con una sesión vigente no consumida, y efectuar verificación
   criptográfica independiente del PDF (certificado, integridad, revocación,
   sello de tiempo y vinculación al CUIL/matrícula).
8. Almacenar PDF firmado en bucket privado, calcular SHA-256 final, registrar
   evidencia y auditoría, y actualizar `draft -> signed` en transacción
   idempotente.
9. Sólo después permitir descarga pública limitada y notificar al paciente.
10. Para callback inválido o firma rechazada: conservar `draft` / `failed`;
    jamás mostrar `signed` ni notificar como documento oficial.

## Controles de producción pendientes

- [ ] Cloudflare: revisar **únicamente nombres/estado** de secretos FirmAR,
      sin recuperar sus valores por chat.
- [ ] Autoridad FirmAR: confirmar entidad integradora elegible y trámite TAD.
- [ ] Obtener credenciales de homologación y documentación actual.
- [ ] Confirmar URLs / rutas y encabezados en entorno homologado.
- [ ] Diseñar tabla `medical_certificate_signing_sessions` con RLS cerrado,
      token derivado, TTL, idempotencia y controles anti-replay.
- [ ] Implementar callback autenticado y correlacionado; verificar PAdES
      criptográficamente en servicio confiable antes de pasar a `signed`.
- [ ] Probar identidad del médico, CUIL, revocación y PDF modificado.
- [ ] Cobertura CI + E2E y aprobación clínica/legal.
- [ ] Rollout gradual tras validación del entorno y del proveedor.

## Código

- `apps/web/src/lib/doctors/services/firmar-remote-client.ts`
- `apps/web/src/lib/doctors/services/firmar-remote-client.test.ts`
- `apps/web/src/lib/doctors/services/pdf-medical-certificate.service.ts`

Las pruebas de cliente son simuladas. **No constituyen certificación ni
homologación** con la infraestructura estatal.


## Callback registrado ante la PFDR (preflight seguro)

La solicitud TAD `EX-2026-104186995- -APN-DNFDEIT#JGM` declaró exactamente:

`https://www.autamedica.com/api/integrations/firmar/callback`

En este PR existe `apps/web/src/pages/api/integrations/firmar/callback.ts`:

- `GET` devuelve HTTP 200, `reachable: true` y **`acceptingSignatures: false`**.
- `HEAD` devuelve HTTP 200 sin contenido.
- `POST` devuelve **HTTP 503**: ninguna firma se acepta ni se marca como validada.

Estas respuestas sólo están disponibles públicamente **una vez desplegado el PR**. Verificar que Cloudflare no redirija la ruta ni cambie el método HTTP antes de solicitar pruebas técnicas oficiales. Un resultado `GET 200` no representa autorización administrativa ni recepción funcional de firmas.

### Validación separada del callback

`apps/web/src/lib/doctors/services/firmar/firmar-callback.ts` contiene funciones que rechazan tokens falsos o reutilizados, solicitudes vencidas y evidencia criptográfica incongruente. **No verifican PAdES por sí mismas.** Para habilitar recepción será imprescindible un verificador independiente, una transacción de consumo único, almacenamiento privado y auditoría.

El transporte de inicio que se mantiene como referencia única es `apps/web/src/lib/doctors/services/firmar-remote-client.ts`. Su contrato de prueba está simulado; los endpoints y modalidades definitivas deberán confirmarse con la autoridad.
