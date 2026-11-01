# Inteligencia comercial de AutaMedica — auditoría inicial

**Fecha:** 2026-11-01. **Estado:** consulta de solo lectura; no desplegar SQL como función, vista pública ni API.

## Fuentes / limitaciones
- Cloudflare Web Analytics (RUM): visitas y referencias agregadas; muestreo, automatizaciones e internos pueden mezclarse. [Panel](https://dash.cloudflare.com/).
- Google Analytics 4 web: propiedad 533956261, flujo 14408283790, medición G-YRN6QY3BTY. Tras el despliegue #626, la consulta de Windsor.ai devolvió conjunto vacío; no equivale a cero visitas.
- Firebase Android: propiedad GA4 527169188; atribución por sesión sin reconciliación con pagos.
- Supabase: proyecto productivo qxjjrpksmwwrmubhvjew, estados de tablas; pagos 'approved' no equivalen automáticamente a dinero liquidado.
- Brevo: campaña del 31/10: 100 enviados, 84 entregados, 16 rebotes. El resumen de clics y enlaces individuales no coincide; debe reconciliarse.
- Search Console y Sentry: fuentes no disponibles directamente en esta conexión.

## Hallazgos verificables
- 1.804 pacientes; 52 pacientes distintos vinculados a cita; 171 citas (101 no_show, 42 cancelled, 24 payment_pending, 4 completed). *No calcular conversión como cohortes sin depurar simulaciones, importados y fechas*.
- 28 filas de appointment_payments: 5 approved (ARS), 20 pending (ARS/BRL), 3 refunded (ARS). Solo 3 de 5 approved incluyen provider_payment_id; cuatro approved se asocian a no_show, una a completed.
- 3 de 4 citas completed carecen de fila en appointment_payments. No contabilizar como impago sin revisar crédito, contrato o procedimientos alternativos.
- 153 dispatch requests de farmacia; 54 status completed. El recorrido de farmacia NO debe mezclarse con appointments: entidades y condiciones distintas.
- CRM: 278 cuentas argentinas sector sanitario, 282 actividades internas import, 0 oportunidades y 0 cuentas con last_contacted_at. Actividad B2B brasileña fuera del CRM.
- Leads: 1.173 de 1.184 con origen de sincronización o importación. No son 1.173 clientes adquiridos por campañas.
- En octubre: 49 perfiles de pacientes nuevos en base, 0 citas creadas; comprobar rutas alternativas, pruebas y cohortes.
- En Cloudflare el principal tráfico de búsqueda llega a páginas informativas; GA4 web restringe la etiqueta a una allowlist pública que excluye blog. No ampliar a rutas sanitarias sensibles por defecto.
- RUM de Cloudflare expone trazas de rutas clínicas con IDs en `requestPath`; exigir una revisión de redacción/exclusiones de rutas y períodos de retención antes de ampliar la medición.
- En GA4 no hay embudo visitante -> pago confiable ni métricas de atribución por compra.

## Diccionario de métricas
| KPI | Definición operativa | Fuente | Estado |
| --- | --- | --- | --- |
| Visitantes web | Únicos, descontando QA/bots y distinguiendo consentimiento | GA4 + Cloudflare | NO MEDIBLE actualmente |
| Entradas web por canal | Entradas con referencia externa o sin ella; no usuarios | Cloudflare RUM | ESTIMADO |
| Registros | Altas verificadas / no importadas | Supabase auth/profiles | A RECONCILIAR |
| Citas | appointments excluyendo eliminadas | Supabase | MEDIDO, con posible QA |
| Pagos aprobados | Filas approved, no ingreso conciliado | Supabase | MEDIDO CON SALVEDAD |
| Cobros confirmados | Confirmación Mercado Pago + cuenta / idempotencia | PSP + Supabase | NO CONCILIADO |
| Consulta realizada | Completada con evidencia de entrega de servicio | clinical operations | A RECONCILIAR |
| Facturación B2C BRL/ARS | Cobros netos facturables separados por moneda y canal | Libro financiero | NO MEDIBLE |
| Facturación B2B BRL/ARS | Contratos/cobros separados por moneda | CRM + libro financiero | NO MEDIBLE |
| CAC | Gasto atribuible / pacientes nuevos efectivamente pagadores | Campañas + pagos | NO MEDIBLE |
| Margen de contribución | Precio cobrado - honorarios efectivamente devengados - pasarela - impuestos variables - otras variables | Contabilidad | NO MEDIBLE |
| Recompra | Clientes únicos con segundo servicio cobrado válido | Supabase reconciliado | NO MEDIBLE |
| Errores embudo | Errores instrumentados por paso sin clínica ni PII | Sentry / backend agregado | NO MEDIBLE |

## Arquitectura aprobable, no desplegada
1. Aislar el recorrido comercial de los datos clínicos. Contadores por etapa y país de operación, fecha UTC, moneda, canal consentido y tipo general de producto; sin paciente/doctor/receta/CID ni URLs con identificadores.
2. Dos canales de medición: (a) GA4 solo contenido corporativo no sensible con consentimiento; (b) contadores agregados propios del backend para etapas transaccionales.
3. Confirmar pago únicamente desde webhooks firmados idempotentes del proveedor y conciliar contra registro financiero; `appointment_created` no es `purchase`.
4. Separar tráfico de prueba/internal mediante reglas verificables; nunca etiquetar como ventas registros sintéticos.
5. Diseñar un dashboard de agregado con supresión de grupos pequeños para evitar reidentificación. No crear una vista pública de `growth_os` ni exponerla a `anon`.
6. Los cambios a datos, políticas RLS, tags o despliegues de producción requieren autorización y revisión de privacidad específica.

## Plan 30 días
- **Semana 1:** conciliar 5 approved (2 sin provider ID), 4 completed (3 sin fila de pago), clasificar no_shows y pruebas. Salida: baseline de transacciones válido, sin tocar datos clínicos.
- **Semana 2:** ensayar embudo B2C en staging BR/AR: registro, disponibilidad, checkout, webhook, consulta, doc. Corregir errores reales; GA4 solo rutas no clínicas.
- **Semana 3:** páginas de mayor interés -> CTA a servicio legítimo; etiquetado UTM genérico y seguridad, conversación comercial directa. No gastar en anuncios; observar conversiones.
- **Semana 4:** medir cohortes de pacientes pagadores y margen variable por país y canal, con reglas de continuar/detener; CRM B2B solo decisores y dolor demostrado.

## Criterio de producción
Ningún dato de salud o identificador de paciente hacia Google; no ejecutar DDL ni modificar pagos/citas. Auditoría de fuentes independiente antes de declarar ingresos y CAC.
