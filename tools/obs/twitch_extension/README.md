# 🎮 Extensión de Panel de Twitch — AutaMedica

Esta carpeta contiene los archivos estáticos necesarios para crear tu **Extensión de Panel Interactiva de Twitch**. 

A diferencia del panel tradicional de Markdown estático, esta extensión renderiza la tabla de posiciones histórica en **tiempo real absoluto**, consultando directamente a Supabase cada vez que un espectador abre tu perfil o cuando cambia la puntuación en vivo.

---

## 📂 Archivos en esta carpeta:
*   `panel.html` — Punto de entrada del panel.
*   `panel.css` — Estilos premium Obsidian + Cyan Neón.
*   `panel.js` — Lógica interactiva que consulta a Supabase.

---

## 🚀 Guía paso a paso para subir la Extensión a Twitch:

### Paso 1: Comprimir los archivos
1. Ve a la carpeta física de la extensión en tu terminal o explorador:
   📁 `/home/edu/Autamedica/tools/obs/twitch_extension/`
2. Selecciona los 3 archivos (`panel.html`, `panel.css`, `panel.js`) y comprímelos en un archivo **ZIP** (llámalo `autamedica-leaderboard.zip`).
   *Nota: No comprimas la carpeta en sí, sino los 3 archivos directamente en la raíz del ZIP.*

### Paso 2: Crear la Extensión en la Consola de Twitch
1. Inicia sesión en la **Consola de Desarrolladores de Twitch**: [dev.twitch.tv](https://dev.twitch.tv) con tu cuenta de Twitch (`autamedica`).
2. Haz clic en **"Your Console"** (Tu consola) arriba a la derecha.
3. Haz clic en **"Extensions"** (Extensiones) en la barra lateral izquierda y presiona **"Create Extension"** (Crear extensión).
4. Configura los detalles básicos:
   *   **Name:** `AutaMedica Leaderboard`
   *   **Type:** Selecciona únicamente **"Panel"** (Panel).
   *   **Email:** `contacto@autamedica.com`
5. Presiona **"Create Extension"**.

### Paso 3: Configurar la Versión de la Extensión
1. En la pestaña **"Status"**, haz clic en el número de versión (ej: `0.0.1`).
2. Configura los campos requeridos:
   *   **Author name:** `AutaMedica`
   *   **Viewer Path:** Escribe `panel.html`.
3. Presiona **"Save Relationships"**.

### Paso 4: Subir el archivo ZIP
1. Ve a la pestaña **"Files"** (Archivos) en la consola de Twitch.
2. Arrastra y suelta tu archivo `autamedica-leaderboard.zip` que creaste en el **Paso 1**.
3. Twitch procesará el archivo y te dirá que está listo para testeo.

### Paso 5: Activar y Probar
1. Ve a tu canal de Twitch en el navegador: `twitch.tv/autamedica`.
2. Haz clic en **"Editar paneles"**.
3. Selecciona **"Administrar extensiones"** en tu panel de control de Twitch, busca `AutaMedica Leaderboard`, instálala y actívala en el **Panel 1**.
4. ¡Listo! La tabla de posiciones ahora se mostrará en vivo y en tiempo real para todos tus espectadores.
