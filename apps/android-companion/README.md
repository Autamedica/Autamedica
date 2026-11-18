# Autamedica Android Companion

Companion Android nativo para Codex CLI dentro de Debian/Termux. Combina Android AccessibilityService, Chromium WebView del sistema, CDP autenticado y Playwright Core mediante MCP STDIO.

## Arquitectura

- Android AccessibilityService: árbol de accesibilidad, acciones, gestos y capturas.
- Chromium Android WebView: navegador con acceso normal a Internet mediante Wi-Fi o datos móviles.
- CDP de Chromium: socket abstracto nativo de WebView, conectado a través de un proxy TCP autenticado en `127.0.0.1:18766`.
- Control Android: servidor autenticado en `127.0.0.1:18765`.
- MCP STDIO: ejecutado por Codex en Debian proot.
- Playwright Core 1.65.1: se conecta a CDP y ofrece API Page/Locator además de comandos CDP directos.
- ADB solo se usa para instalación, actualización y depuración inicial. No se necesita durante la operación normal.

## Navegador e Internet

El navegador usa el motor Chromium WebView instalado/actualizado por Android System WebView. Tiene permiso INTERNET y carga sitios HTTP y HTTPS usando la conexión de red del Xiaomi.

MCP ofrece navegación, selectores Playwright, click, fill, evaluación JavaScript, screenshots, espera de selectores, pestañas, eventos de red y envío directo de cualquier método CDP implementado por el WebView. La API CDP depende de las funciones expuestas por la versión del proveedor Android System WebView; Playwright documenta que connectOverCDP tiene menor fidelidad que su protocolo nativo de conexión.

## Persistencia de sesiones y claves

- Cookies: perfil privado de Android WebView y CookieManager.flush().
- localStorage, IndexedDB y almacenamiento web: perfil privado persistente del WebView.
- Última URL: guardada cifrada para restaurar el navegador.
- Secretos/API keys: bóveda AES-256-GCM con clave no exportable generada por Android Keystore.
- Token MCP/CDP: cifrado en Android Keystore; la copia de trabajo en Debian queda en un archivo con permisos 600, leído por el launcher MCP.
- La app no escribe cookies ni secretos de página en logs.
- La desinstalación de la app borra su perfil y su bóveda: exportá los secretos que debas conservar antes de desinstalar.

## Modo de pantalla apagada

El usuario inicia explícitamente una sesión mediante “Mantener navegador activo con pantalla apagada”. Esto inicia un foreground service Android con notificación persistente y un `PARTIAL_WAKE_LOCK`. El bloqueo mantiene la CPU despierta sin encender la pantalla. La sesión se detiene desde la notificación o desde la app.

Para reducir los cierres agresivos de Xiaomi:
1. En Ajustes > Aplicaciones > Autamedica Companion > Batería, seleccioná “Sin restricciones”.
2. Habilitá Inicio automático para Autamedica Companion en los ajustes de MIUI/HyperOS, si tu versión lo ofrece.
3. Permití las notificaciones del servicio de sesión.

El modo pantalla apagada no utiliza un SCREEN_DIM_WAKE_LOCK ni mantiene encendida la pantalla. El bloqueo parcial mantiene la CPU activa, pero Android Doze, MIUI y el propio sitio web pueden diferir o suspender tráfico/JavaScript. Para trabajos prolongados con red, la exclusión de ahorro de batería del dispositivo mejora la continuidad; no existe API que garantice que el sistema nunca mate un proceso.

## Seguridad

- Los servidores HTTP/CDP escuchan exclusivamente en loopback IPv4 `127.0.0.1`, no en Wi-Fi.
- Autenticación Bearer de 256 bits y comparación en tiempo constante.
- El proxy CDP exige el token antes de abrir el socket abstracto Chromium.
- No abrir el puerto CDP en el router ni publicar el token.
- `WebView.setWebContentsDebuggingEnabled(true)` se habilita intencionalmente para CDP. Android documenta que la depuración WebView permite inspeccionar y modificar contenido y que supone una consideración de seguridad; este uso está delimitado al proxy local autenticado.
- No se ocultan límites impuestos por sitios web, WebView, sistema Android, certificados, DRM o controles de seguridad del sitio.

## Construcción

GitHub Actions construye el APK debug con Android SDK 35, JDK 17 y Gradle 8.9. El artefacto se publica con el nombre `autamedica-android-companion-debug`.

## Instalación del APK

Package debug: `com.autamedica.companion.debug`.

ADB puede usarse para transferir e instalar el APK. También se puede descargar e instalar el archivo APK desde Android.

Después de instalar:
1. Abrí Autamedica Companion.
2. Activá “Autamedica Android control” en Ajustes > Accesibilidad.
3. Copiá el token privado en la app.
4. Activá la sesión de navegador en segundo plano para permitir trabajo con la pantalla apagada.
5. Configurá la batería de Xiaomi como “Sin restricciones”.

## Integración MCP (dentro de Debian proot)

El MCP debe instalarse **en el mismo Debian/Termux donde corre Codex**, no en otra terminal o en Windows. Desde la raíz del repositorio:

```bash
cd apps/android-companion
bash tools/mcp/install-termux.sh
```

El instalador garantiza Node.js 22+, instala Playwright Core 1.65.1 sin descargar otro navegador, solicita el token privado mostrado por Autamedica Companion, lo guarda en un archivo con permisos `600` y registra el servidor `autamedica_android` en `~/.codex/config.toml`.

En Android, habilitá **Autamedica Android control** en Ajustes > Accesibilidad y abrí/iniciá la sesión en Autamedica Companion. Para automatización web, iniciá también la sesión de navegador dentro de la app.

Verificar desde la misma instalación Debian:

```bash
codex mcp list
```

Reiniciá Codex y ejecutá `/mcp`. Debe aparecer `autamedica_android`. La primera llamada de diagnóstico es `android_status`; para verificar WebView/CDP, usá `browser_status`.

**Shizuku no forma parte del flujo normal del Companion.** El control nativo se realiza mediante Android AccessibilityService y el MCP local autenticado. ADB queda reservado a instalación, actualización y depuración inicial.

## Herramientas MCP

Android:
- `android_status`
- `android_get_ui_tree`
- `android_screenshot`
- `android_open_app`
- `android_tap`
- `android_click_element`
- `android_type`
- `android_swipe`
- `android_back`
- `android_home`
- `android_open_url`
- `android_wait_for_text`

Playwright/CDP:
- `browser_status`
- `browser_navigate`
- `browser_click`
- `browser_fill`
- `browser_get_text`
- `browser_get_url`
- `browser_evaluate`
- `browser_screenshot`
- `browser_wait_for_selector`
- `browser_list_tabs`
- `browser_network_log`
- `browser_reload`
- `browser_cdp_send` (métodos CDP directos sin lista blanca)

Bóveda:
- `vault_list_keys`
- `vault_store_secret`
- `vault_read_secret`
- `vault_delete_secret`

## Limitaciones reales

WebView comparte el motor Chromium pero no equivale a una instalación desktop de Chrome. Algunas funciones avanzadas de CDP pueden no estar implementadas por el proveedor Android WebView. Playwright `connectOverCDP` es una conexión de fidelidad menor que el protocolo nativo de Playwright. WebAuthn, passkeys, selectores de archivos, permisos de cámara/micrófono, contenido DRM, páginas FLAG_SECURE y algunas APIs del sistema dependen del soporte Android/WebView y de la autorización del usuario.
