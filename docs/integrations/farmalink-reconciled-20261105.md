# Farmalink: conciliación entre PR #655 y PR #700 — 05/11/2026

## Evidencia oficial
- Farmalink confirmó `idOrganizacion=182`, omitir `puntoEmisor` y usar `codEntidad=7110` y `PAN=20123456786` para pruebas DEMO. Los dos casos TEST aceptados conservan `9600000421228` (S) y `9600000421242` (N).
- Comunicación desde `ravellaneda@msal.gov.ar` del **12/05/2026**, asunto **Notificación de plataforma aprobada - RL-2026-47574120-APN-SSVEIYES#MS**: AutaMedica aprobada como **recetario**, expediente `EX-2026-43326604-APN-SSVEIYES#MS`, ID `0268`, con exigencia de leyenda de inscripción ReNaPDiS y de códigos de barras para número de receta y CUIL.
- Respuesta de Farmalink del 05/11: leyenda ReNaPDiS faltante en los PDFs, retirar etiqueta técnica `FARMALINK TEST / MODALIDAD GENERICO=S` y asegurar que **número de afiliado** del PDF corresponde a `credencial.pan` del registro electrónico, no al CUIL.

## Estado de documentación
Se contestó a Farmalink el 05/11 en el hilo anterior con dos PDFs TEST corregidos, **sin nuevas altas** (correo ID `1a1ad5e3cbe1e861`). Se solicitó conformidad escrita y requisitos productivos.

## Cambios de esta rama (sobre PR #655 ya fusionado)
- Conserva `idOrganizacion=182`, omisión completa de `puntoEmisor`, mapping y resguardo anti-duplicados de #655.
- Exige CUIL de 11 dígitos **antes del claim persistente y de cualquier alta**; el emisor conserva CUIL y PAN a partir de la solicitud enviada y aprobada, propagándolos al PDF con entidad y plan.
- Los PDFs Farmalink dibujan dos códigos Code128 independientes: número de receta y CUIL (PAN no se utiliza en lugar del CUIL).
- Retira la etiqueta técnica de modalidad en documentos de homologación pero conserva la advertencia de documento TEST, sin firma clínica y no dispensable.
- Inserta la leyenda ministerial ReNaPDiS tanto en los PDFs clínicos existentes como en el PDF de homologación; **no simula firma ni CUIR**.
- Refuerza las pruebas Vitest con fixture DEMO completa, comprobación de la separación PAN/CUIL, doble barra y leyenda regulatoria.

## Puertas de salida
La fusión del código no acredita homologación de Farmalink ni autoriza actividad clínica. Mantener Farmalink desactivado en producción, sin nuevas altas automáticas ni cambio de Memed/Brasil. Para activar: confirmación documental del proveedor, credenciales productivas, firma válida, validación clínica y end-to-end real según circuitos AR.