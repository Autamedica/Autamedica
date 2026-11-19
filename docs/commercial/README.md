# Registro comercial — prospección de farmacias (RS)

Origen: archivos locales y sesiones de Gemini CLI/Antigravity revisadas el 11-11-2026.
Repositorio: Autamedica/Autamedica (privado).
Periodo principal de campaña: 28-09-2026 a 05-10-2026.

## Inventario de bases
- data/farmacias_whatsapp_rs_oeste.csv: base maestra, 658 filas de registros y 658 números distintos en la extracción revisada.
- data/farmacias_leads_qualificados.csv: 365 filas de leads; base separada, puede solaparse con la maestra.
- data/farmacias_fronteira_oeste_rs.csv: 99 filas; base separada, puede solaparse con las otras.
- data/mensaje_outreach.txt: texto de WhatsApp usado en la campaña.

## Resultado registrado en la base maestra
- 658 registros en total.
- 172 con etiqueta Contatada - Entregue.
- 2 con etiqueta de respuesta.
- 17 con Sem WhatsApp.
- 467 sin estado de contacto.
- Farmácias São João: 240 registros; 69 con etiqueta Contatada - Entregue, 1 con respuesta de bot sin canal comercial, 5 Sem WhatsApp y 165 sin estado.
- Los 69 registros de São João etiquetados como envío se distribuyen en 28/09 (7), 01/10 (19), 02/10 (10), 03/10 (11) y 05/10 (22).

## Siete registros de São João en Sant'Ana do Livramento
- Filial João Belchior Goulart, 1750 — 555496990636
- Filial Centro Andradas — 555499286160
- Filial Rivadavia Corrêa — 555496122725
- Filial Tamandaré — 555496412385
- Filial Hydraulica — 555499541658
- Filial Carolina — 555497104373
- Filial João Pessoa — 555599823417

## Interpretación y límites de evidencia
La etiqueta Contatada - Entregue la escribe el script después de pulsar el botón de envío en WhatsApp. El script revisado no confirma doble tilde, lectura por una persona ni aceptación comercial. Por eso este repositorio registra envíos marcados por el proceso, no entregas verificadas ni rechazos de decisores.

En una conversación de Gemini del 08-10-2026, el usuario mencionó haber contactado 250 farmacias sin obtener aceptación. La auditoría de la base y logs disponibles respalda 174 registros marcados como contactados (172 envíos + 2 respuestas), pero no demuestra que 250 decisores humanos hayan rechazado la propuesta. Puede haber contactos manuales externos a estos archivos que no estén representados aquí.

Las tres bases CSV son inventarios distintos y pueden contener duplicados entre sí. No sumar sus filas como contactos únicos sin deduplicar por teléfono y revisar los registros.

## Mensaje de prospección
El texto exacto usado se conserva en data/mensaje_outreach.txt.

## Privacidad y manejo
Este directorio contiene teléfonos comerciales y enlaces de WhatsApp. Mantener el repositorio privado, limitar permisos y no copiar estos datos a repositorios públicos, issues, logs o documentación pública. No contiene datos de pacientes.