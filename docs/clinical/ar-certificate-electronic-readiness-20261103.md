# Argentina — certificado médico electrónico: salida a prueba controlada

Estado auditado: 2026-11-03/04. FirmAR/PFDR institucional NO habilitado.

## Evidencia disponible

- PR #584 fusionado: médico confirma por documento, servidor valida identidad y jurisdicción AR, firma/sello privados, PDF con hash SHA-256, emisión RPC y QR sin datos sensibles.
- Producción: existe RPC `issue_electronic_medical_certificate` y tabla `medical_certificate_electronic_issuances`. Al verificar, 0 emisiones electrónicas verificadas y 3 certificados AR históricos `signed` con `signature_method IS NULL`: NO declararlos verificados.
- Staging `qqevyncgnanpmvauehys`: `medical_certificates` existe, pero faltan `medical_certificate_signature_requests`, `medical_certificate_electronic_issuances` y RPC de emisión electrónica. No ejecutar ensayos sobre pacientes reales ni usar producción como sustituto.

## Orden operativo

1. Completar staging con **migraciones existentes y sus dependencias, en orden** (incluida `20261027040000_firmar_restricted_sessions.sql` antes de `20261029223403_ar_certificate_electronic_issuance.sql`). Inspeccionar el historial aplicado y las dependencias de RLS y Storage; no copiar tablas clínicas ni secretos desde producción.
2. Crear **médico DEMO con identidad, matrícula AR, rol y validación de pruebas**, paciente DEMO y vínculo asistencial DEMO. Registrar firma y sello sintéticos exclusivos de pruebas, nunca reutilizar firmas reales.
3. Crear certificado AR `draft` exclusivamente con información ficticia, período coherente, diagnóstico interno y opción `hide_diagnosis` según proceda. Validar GET revisión y `snapshotHash`.
4. Confirmación expresa del médico DEMO vía POST `/api/doctors/certificates/{id}/issue` con `confirmed:true` y hash actual. Exigir actualización transaccional a `signed/electronic_verified` y una sola fila en `medical_certificate_electronic_issuances`.
5. Descargar el PDF como médico y paciente DEMO autorizados; comparar bytes con SHA-256 persistido, comprobar contenido, firma/sello y QR.
6. Verificar QR público: `valid:true`, modalidad `Firma electrónica confirmada por el profesional` y **sin DNI, diagnóstico, nombre paciente ni PDF**. Verificar borrador no verificable.
7. Ensayos negativos: sesión ajena, médico BR/CRM, médico no validado, falta firma o sello, paciente ajeno, SNAPSHOT alterado, concurrencia/reintento, fechas inválidas, hash PDF alterado, cambio de `signed` a `draft` rechazado.
8. Registrar pruebas y sus resultados reales (workflow, logs, fecha, hash y versión); revisión legal antes de habilitar emisión a pacientes reales.

## Separación de modalidades

- **`electronic_verified`**: firma electrónica con confirmación del médico y evidencia de la plataforma. **No** equivale a PAdES/FirmAR ni confiere presunción automática de firma digital certificada.
- **`ac_external`**: utilizar sólo después de recibir firma criptográfica auténtica y verificar independientemente el PDF firmado.
- No marcar como verificadas las 3 filas históricas `signed` sin evidencia, ni reemitirlas automáticamente.

## Criterio de cierre

No declarar el circuito argentino validado en producción hasta disponer de evidencia de prueba E2E con DEMO, evaluación jurídica de la modalidad y comprobación de seguridad. El bloqueo de autorización FirmAR NO impide ensayar el emisor de firma electrónica, pero sí impide afirmar homologación FirmAR.
