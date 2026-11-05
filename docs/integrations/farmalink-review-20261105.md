# Farmalink — devolución de homologación del 05/11/2026

**Estado: ajustes solicitados, homologación productiva NO aprobada.** El proveedor revisó los PDFs enviados el 03/11 y solicitó nuevos casos corregidos.

## Devolución del proveedor
1. Incorporar en cada PDF la leyenda de emisor inscripto y validado en ReNaPDiS. El legajo consignado en AutaMedica (`RL-2026-47574120-APN-SSVEIYES#MS`, plataforma `0268`) **requiere contraste con su constancia oficial y vigencia** antes de representar una habilitación como acreditada.
2. Eliminar el texto de debug visible `FARMALINK TEST / MODALIDAD GENERICO=S` y su variante `N`. La modalidad debe reflejarse en el medicamento prescrito, no en una etiqueta técnica destinada al usuario.
3. El número de afiliado/credencial debe coincidir exactamente con `altaRecetaElectRq.recElectronica.afiliado.credencial.pan`. El proveedor indicó `20123456786`, distinto del CUIL DEMO `27123456780`: **no sustituir ni confundir esos dos campos**.

## Datos TEST comunicados por el proveedor el 03/11
- `infoCabeceraRq.idOrganizacion=182`; **no incluir** `puntoEmisor`.
- `afiliado.credencial.codEntidad=7110`, `afiliado.credencial.pan=20123456786`, DNI `12345678`.
- Caso S, número ya aprobado en TEST `9600000421228`: denominación genérica, sin marca sugerida.
- Caso N, número ya aprobado en TEST `9600000421242`: marca comercial sugerida.
- Los números son referencias de pruebas existentes. **No crear ni repetir altas** para redibujar un PDF. Los intentos DEMO anteriores con timeout / 504 siguen sujetos a conciliación independiente (`SOL-3144`).

## Arreglo de aplicación propuesto en esta rama
- Capturar `credencial` directamente de la solicitud `altaReceta` que obtuvo respuesta favorable.
- Propagar `pan`, `codEntidad` y `plan` al generador PDF, separados del DNI y del CUIL del paciente.
- Imprimir `Nro. afiliado / Credencial` con esos valores; nunca inferir PAN de CUIL o de etiquetas locales de seguro.
- Mantener sin cambios el pipeline `BR -> Memed`, las banderas de despliegue y los secretos.

## Puertas de salida
- [ ] Test unitario de PDF/mapper aprobado para S y N.
- [ ] PDF TEST cotejado con request y respuesta confirmada de Farmalink para cada receta, no solo con un ejemplo manual.
- [ ] Legajo ReNaPDiS verificado contra documento emitido por el organismo y alcance vigente.
- [ ] Evidencia criptográfica de firma clínica real exigida antes de considerar la receta dispensable.
- [ ] Aprobación escrita del proveedor para producción y parámetros/credenciales productivos.
- [ ] Envío de nueva documentación solo tras autorización del titular.

No usar este documento para activar `FARMALINK_ENABLED`, ejecutar nuevas altas o declarar homologación completa.
