# Memed Brasil — prueba de emisión DEMO

Fecha: 05/11/2026.

La prueba se debe ejecutar exclusivamente con API y SDK de homologación de Memed. No habilitar `MEMED_RX_ENABLED` en producción para identidades ficticias.

Para acreditar el flujo se requiere: autenticación DEMO, paciente DEMO, evento real `prescricaoImpressa`, confirmación en API de homologación y documento resultante claramente identificado como de prueba. No confundir un test local simulado con emisión del proveedor.

## Evidencia de ejecución real — 05/11/2026

- Run `42111028132`: con `forceSign=false` **solo en homologación** apareció el botón «Gerar prescrição». Sin firma ni receta emitida.
- Run `42111423623`: el navegador pulsó «Gerar prescrição» y detectó «Continuar». Sin `prescricaoImpressa`.
- Run `42111754443`: se pulsó «Continuar», sin aparecer controles de emisión.
- Run `42112619813`: tras siete segundos continúa visible «Continuar»; el formulario Memed cuenta 15 inputs, cero nativos `:invalid`, cero `aria-invalid=true` y una casilla sin seleccionar. **No se sabe qué significa esa casilla**; no se ha marcado por seguridad.
- Todas las pruebas confirman `productionAccess=false`. Nunca se activó el flag productivo ni se enviaron mensajes a pacientes.

**Resultado:** SDK auténtico de homologación, médico y paciente DEMO, artículo ficticio, botón de generación y navegación parcial verificados; ninguna prescripción emitida ni PDF Memed verificados. La conclusión `success` de Actions significa que pasó el preflight, **no** que exista receta. Abrir consulta con suporte@memed.com.br sobre requisitos pendientes de la etapa Identificação → Emitir receita en homologación.
