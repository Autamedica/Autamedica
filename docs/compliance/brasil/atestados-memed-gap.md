# Brasil — atestados médicos e Memed: brecha de integración

## Estado verificado en `main`

- `apps/web/src/components/doctors/medical/MemedPrescriptionWidget.tsx` presenta el módulo como receituário digital y abre `plataforma.prescricao` a través de `openMemedPatient`. La integración existente es de prescripción; el código inspeccionado no implementa un módulo de atestados.
- `apps/web/src/pages/api/doctors/certificates/[id]/pdf.ts` genera la vista previa mediante `generateMedicalCertificatePdf(..., 'draft')` y obtiene los PDFs firmados desde el almacenamiento privado de AutaMedica.
- `apps/web/src/lib/doctors/services/pdf-medical-certificate.service.ts` genera el PDF internamente. Para el modo electrónico, el propio pie dice: “La verificación QR acredita el registro de emisión en AutaMedica. No es firma digital certificada.” Un QR de AutaMedica no debe presentarse como firma ICP-Brasil.
- `apps/web/src/lib/doctors/services/certificate-electronic-issuance.service.ts` restringe expresamente la emisión electrónica interna a `country_code === 'AR'`; `apps/web/src/pages/api/doctors/certificates/[id]/firmar.ts` también exige AR y corresponde a FirmAR/PFDR, no a Memed.

## Cambio mínimo pendiente para Brasil

No reutilizar `plataforma.prescricao` como si fuera un firmador de atestados. Antes de activar atestados BR, confirmar con Memed que su contrato/proveedor ofrece una operación de certificado/atestado con firma ICP-Brasil. Si Memed la ofrece:

1. Extender el widget y la sesión/token de Memed ya integrados para abrir exclusivamente la operación oficial de atestado, con identidad de médico y paciente ya validada por el backend.
2. Recibir desde Memed el identificador y el artefacto final firmado; verificar la evidencia criptográfica/ICP-Brasil y el hash según el contrato documentado del proveedor.
3. Persistir el identificador de proveedor, referencia del documento, estado de verificación, hash y enlace seguro del artefacto en el registro de certificado; la descarga del paciente debe entregar ese documento del proveedor.
4. Mantener el PDF interno como borrador/previa claramente rotulada, sin atribuirle firma ICP-Brasil. No construir firmador propio ni integración SNCR/ANVISA.

Si Memed no ofrece una operación de atestado, no hay un cambio de frontend que convierta una receta en un atestado firmado: la capacidad debe permanecer pendiente de una ruta de proveedor autorizada.

## Consentimiento de telemedicina en Pharmacy Express BR

La versión `br-pharmacy-express-telemedicine-v1` corresponde al texto afirmativo mostrado en el ingreso web BR. El timestamp se genera en el servidor al crear la solicitud; el registro invitado conserva su patient row con `user_id = NULL`. Los clientes nativos heredados que solo envían consentimiento LGPD no reciben una marca de consentimiento de telemedicina inventada; su actualización queda fuera de este parche porque `apps/android/` está fuera de alcance.
