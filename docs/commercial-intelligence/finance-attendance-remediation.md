# Corrección de medición comercial: asistencia y dinero

## Incidente verificado (producción 2026-11-01)
- El reaper anterior cambiaba `scheduled` / `confirmed` a `no_show` por tiempo vencido sin prueba de inasistencia.
- De 171 citas, 101 figuran `no_show` y cuatro de esos registros tienen pago `approved`, situación **no conciliada**. No cambiar ningún historial automáticamente.
- Finance Hub sumaba BRL y ARS y etiquetaba los totales como ARS.
- Los cobros directos por PIX/transferencia fuera del checkout no aparecían como ventas reportadas.

## Solución propuesta
1. La RPC de reaper mantiene su interfaz y devuelve cero, evitando nuevos cambios de estado no probados. Los médicos siguen pudiendo marcar `no_show` manualmente por el flujo autorizado, cuando dispongan de evidencia.
2. La RPC de resumen de asistencia devuelve **solo agregados** para administradores, sin pacientes.
3. Finance Hub separa los importes de base de datos por ARS/BRL, muestra estados como **no conciliados** y exhibe conteos de casos que requieren revisión.
4. `commercial_manual_receipts`: libro separado para ventas individuales fuera del checkout, con país, moneda, canal, método, importe y referencia alfanumérica opcional. No guarda datos sanitarios o de identificación de pacientes. **Todos** los ingresos permanecen `reported` y están excluidos de cualquier facturación bancaria verificada. No hay endpoint que los confirme unilateralmente.
5. Solo roles `admin` y `platform_admin` acceden al ingreso manual mediante API con autenticación y comprobación de origen; la tabla tiene RLS habilitado y no tiene políticas abiertas.

## Validación y producción
- Replicar migraciones en base desechable; ejecutar typecheck, lint, pruebas unitarias, E2E y controles RLS.
- Antes de producir: verificar migraciones ya aplicadas, reconciliar versiones del ledger.
- Jamás marcar arbitrariamente un cobro `approved`, una consulta `completed` ni corregir retrospectivamente `no_show`.
- La venta comunicada de R$150 requiere que el administrador la registre en Finance Hub con el canal correcto; no se crea ninguna transacción ficticia ni se supone pago confirmado.
- No enviar CID, diagnósticos, recetas, nombres, correos, teléfono ni identificadores de pacientes a GA4 o a herramientas publicitarias.

## Límites
Este cambio hace **visible** la falta de conciliación y evita crear nuevos falsos no-show. No verifica pagos bancarios automáticamente, no recupera una sesión clínica real que no quedó registrada ni atribuye conversiones históricas de GA4 a una persona.
