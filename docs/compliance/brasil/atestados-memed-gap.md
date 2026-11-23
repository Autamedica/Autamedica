# Brasil — atestados médicos e Memed: brecha de integración

## Estado verificado en `main`

- `apps/web/src/pages/api/doctors/certificates/index.ts` recibe la creación de certificados BR y los persiste expresamente con `status: "draft"`; el CUIR/QR generado se describe como referencia interna, no como registro nacional.
- `apps/web/src/components/doctors/medical/CertificateCreateModal.tsx` omite el proceso de revisión/emisión cuando `countryCode === 'BR'`. El texto de la propia pantalla identifica el resultado BR como borrador aún no firmado; solo permite visualizar el PDF privado con marca de agua.
- `apps/web/src/pages/api/doctors/certificates/[id]/pdf.ts` genera ese borrador mediante `generateMedicalCertificatePdf(..., 'draft')`. El generador interno deja el sello “BORRADOR - SIN FIRMA”; el pie QR de su modo electrónico aclara que el QR de AutaMedica no es firma digital certificada.
- El widget integrado en `apps/web/src/components/doctors/medical/MemedPrescriptionWidget.tsx` abre únicamente `plataforma.prescricao`. Su punto de montaje en `DoctorsPrescriptionsPage.tsx` pertenece al modo de recetas, no al modal/listado de atestados. Por lo tanto, no hay emisión de atestados BR vía Memed/ICP-Brasil en este flujo.
- `apps/web/src/lib/doctors/services/certificate-electronic-issuance.service.ts` y `apps/web/src/pages/api/doctors/certificates/[id]/firmar.ts` limitan el firmador local FirmAR/PFDR a Argentina. No existe sustitución de firma BR a través de ese servicio.

## Cambio mínimo pendiente para Brasil

No reutilizar `plataforma.prescricao` como si fuera un firmador de atestados. Antes de activar atestados BR, confirmar con Memed que su contrato/proveedor ofrece una operación de certificado/atestado con firma ICP-Brasil. Si Memed la ofrece:

1. Extender el widget y la sesión/token de Memed ya integrados para abrir exclusivamente la operación oficial de atestado, con identidad de médico y paciente ya validada por el backend.
2. Recibir desde Memed el identificador y el artefacto final firmado; verificar la evidencia criptográfica/ICP-Brasil y el hash según el contrato documentado del proveedor.
3. Persistir el identificador de proveedor, referencia del documento, estado de verificación, hash y enlace seguro del artefacto en el registro de certificado; la descarga del paciente debe entregar ese documento del proveedor.
4. Mantener el PDF interno como borrador/previa claramente rotulada, sin atribuirle firma ICP-Brasil. No construir firmador propio ni integración SNCR/ANVISA.

Si Memed no ofrece una operación de atestado, no hay un cambio de frontend que convierta una receta en un atestado firmado: la capacidad debe permanecer pendiente de una ruta de proveedor autorizada.

## Consentimiento de telemedicina en Pharmacy Express BR

La versión `br-pharmacy-express-telemedicine-v1` corresponde al texto afirmativo mostrado en el ingreso web BR: “Autorizo a realização desta teleconsulta por meios digitais e concordo com o tratamento dos meus dados pessoais e de saúde para este atendimento, conforme a LGPD.” El timestamp se genera en el servidor al crear la solicitud; el registro invitado conserva su patient row con `user_id = NULL`. La exigencia del backend es configurable mediante `BR_TELEMEDICINE_CONSENT_REQUIRED` (por defecto `true`; desactivar solo como rollback operativo auditado). Los clientes nativos heredados cuyo texto solo autoriza tratamiento de datos LGPD no reciben una marca de consentimiento de telemedicina inventada; su actualización queda fuera de este parche porque `apps/android/` está fuera de alcance.
