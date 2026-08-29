# 🍊 Guía de Configuración: Extensiones de Twitch para AutaMedica

Este documento detalla la instalación, configuración paso a paso e integración de las extensiones recomendadas de Twitch para el canal de **AutaMedica**. El objetivo es optimizar el stream para la adquisición de usuarios (médicos y pacientes) de forma interactiva y profesional.

---

## 🛠️ Resumen de Extensiones a Configurar

| Extensión                          | Tipo             | Propósito en AutaMedica                                               |
| :--------------------------------- | :--------------- | :-------------------------------------------------------------------- |
| **Barry's Super Simple Task List** | Panel/Overlay    | Lista de tareas en tiempo real (Roadmap de desarrollo/misión activa). |
| **Upcoming Streams**               | Panel            | Agenda y horarios de los próximos streams (debates de salud, demos).  |
| **Sound Alerts**                   | Componente/Panel | Interacción con bits/puntos (alertas sonoras y TTS para consultas).   |
| **Streamlabs / StreamElements**    | Panel/Chat Bot   | Encuestas sobre salud prepaga, recetas electrónicas y moderación.     |

---

## 1. 📋 Barry's Super Simple Task List (Live Coding)

Esta extensión permite a los espectadores ver en qué tarea estás trabajando (ej: _Integración SISA_, _Testing de Recetas_).

### Pasos de Configuración en Twitch:

1. Andá al **Panel de control del creador** > **Extensiones**.
2. Buscá `Barry's Super Simple Task List` e instalala.
3. Configurala como **Panel** o como **Overlay** (se recomienda Panel para no tapar el código).
4. En la configuración de la extensión, completá la lista con las tareas actuales de AutaMedica.

### Tareas Recomendadas para Mostrar:

- `[ ]` Testear validación automática de médicos con SISA / REFEPS.
- `[ ]` Pulir el flujo de pre-autorización de depósitos de garantía en MercadoPago.
- `[ ]` Optimizar el renderizado de PDFs de recetas en mobile.
- `[ ]` Revisar logs de Sentry para corregir warnings del interceptor HTTP.

---

## 2. 📅 Upcoming Streams (Agenda Semanal)

Esencial para que médicos y profesionales de la salud organicen su tiempo y asistan a tus transmisiones de debate o demostraciones de producto.

### Pasos de Configuración:

1. Buscá e instalá `Upcoming Streams` desde el gestor de extensiones.
2. Configurala como **Panel** en la sección de información de tu canal.
3. En la sección de configuración de la extensión:
   - Sincronizá con tu calendario o ingresá manualmente los días y horarios fijos.
   - Usá títulos atractivos para cada sesión.

### Cronograma Sugerido de Contenidos:

- **Martes 19:00 hs (ARG):** _¿Hacia dónde va la receta electrónica? Análisis de la Ley 27.553._
- **Jueves 19:00 hs (ARG):** _Live Coding & Arquitectura: Seguridad y RLS en Supabase._
- **Sábado 15:00 hs (ARG):** _Demo abierta de AutaMedica: Feedback sin filtro de médicos._

---

## 3. 🔊 Sound Alerts & TTS (Interacción con Audiencia)

Permite a la audiencia enviar alertas de audio o mensajes en voz alta (Text-To-Speech) mediante Puntos de Canal o Bits para debates dinámicos.

### Pasos de Configuración:

1. Buscá e instalá `Sound Alerts` en tu panel de control de Twitch.
2. Activala como **Componente** (para que aparezca flotando en el reproductor) o como **Panel**.
3. Andá a la consola web de [Sound Alerts](https://dashboard.soundalerts.com/) e iniciá sesión con Twitch.
4. **Configurar Alertas:**
   - Agregá sonidos clásicos para suscripciones y donaciones.
   - **Sección de Text-To-Speech (TTS):** Habilitá la lectura de texto por IA. Configurá que los mensajes que superen los 100 bits o cierta cantidad de Puntos de Canal se lean en voz alta. Esto permite responder consultas de salud o preguntas técnicas en vivo sin tener que mirar el chat constantemente.

---

## 4. 📊 Integración de Streamlabs / StreamElements (Chat Bot & Encuestas)

Estas herramientas gestionan las encuestas dinámicas en pantalla y proporcionan comandos automáticos del chatbot para redirigir tráfico a la web de AutaMedica.

### Pasos de Configuración:

1. Buscá e instalá la extensión de panel `Streamlabs` o `StreamElements` en Twitch para mostrar tablas de clasificación o encuestas de forma nativa.
2. Asegurate de que el bot correspondiente (`Streamlabs` o `StreamElements`) esté como **Moderador** en tu chat (`/mod streamlabs`).

### Comandos de Chat Recomendados (Copiar y Pegar):

Configurá estos comandos en el panel de control del bot para que respondan cuando un espectador use palabras clave:

#### Comando: `!autamedica`

- **Respuesta:**
  > 🏥 **AutaMedica** es la plataforma argentina de medicina digital y recetas electrónicas seguras. Hacé tu consulta o emití recetas oficiales bajo la Ley 27.553 en https://autamedica.com

#### Comando: `!estado`

- **Respuesta:**
  > 🚀 **Métricas Reales de AutaMedica (7 de Junio 2026):** 1.588 pacientes activos, 33 médicos registrados (14 validados en SISA) y USD 300k proyectados para ronda pre-seed. ¡El sistema de salud está cambiando!

#### Comando: `!receta`

- **Respuesta:**
  > 📝 ¿Necesitás emitir o recibir una receta electrónica válida? AutaMedica cumple con la homologación de Farmalink (IMED) y validación oficial. Registrate gratis en https://autamedica.com

#### Comando: `!sisa`

- **Respuesta:**
  > 🛡️ Validación en Tiempo Real: En AutaMedica consultamos el Registro Federal de Profesionales de la Salud (SISA/REFEPS WS020) para asegurar que cada receta sea emitida por un médico habilitado.

---

## 🎨 Consejos Visuales para OBS Studio

Para que el stream luzca premium e integrado visualmente con la estética "Dark Ivory" de AutaMedica:

1. **Overlay Web:** Creá una escena en OBS con una captura de ventana de tu editor o navegador y aplicale bordes redondeados usando filtros de máscara.
2. **Widgets de Chat:** Usá un overlay de chat con fondo transparente y tipografía sin serifa de alto contraste (como _Inter_ o _Outfit_), combinando con los colores de la marca.
3. **Task List Widget:** Podés agregar la URL de tu widget de Barry's Task List como una **fuente de navegador (Browser Source)** en OBS para incrustarla directamente arriba de tu editor de código o cámara.
