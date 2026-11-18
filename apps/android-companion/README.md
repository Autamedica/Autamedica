# Autamedica Android Companion

Aplicación Android nativa para permitir que Codex CLI, ejecutándose en Termux, controle el dispositivo mediante un servicio de accesibilidad propio y un servidor HTTP limitado a loopback.

## Arquitectura

- Android AccessibilityService: lectura del árbol UI, acciones de accesibilidad, gestos y capturas de pantalla.
- Servidor HTTP embebido: 127.0.0.1:18765 exclusivamente.
- MCP STDIO para Codex: tools/mcp/mcp-server.mjs.
- No requiere ADB durante la ejecución normal.
- ADB puede utilizarse para transferir e instalar el APK y para depuración inicial.

## Seguridad

- Token aleatorio de 256 bits conservado en preferencias privadas de la app.
- Autenticación Bearer comparada en tiempo constante.
- El servidor solo se enlaza a 127.0.0.1; no escucha en Wi-Fi ni en interfaces públicas.
- Campos marcados como contraseña se excluyen del árbol UI.
- El servidor no registra contenido de pantalla, tokens ni textos introducidos.
- La accesibilidad debe habilitarse expresamente desde Ajustes Android.
- El servicio puede controlar otras apps; mantené el token privado y revocalo regenerándolo desde la aplicación.

## Compilación

Con Android SDK 35, JDK 17 y Gradle 8.9:

    gradle --no-daemon :app:assembleDebug

APK: app/build/outputs/apk/debug/app-debug.apk

GitHub Actions construye el mismo APK y publica el artefacto autamedica-android-companion-debug.

## Instalación

1. Instalá el APK debug (package com.autamedica.companion.debug).
2. Abrí Autamedica Android Companion.
3. Activá Autamedica Android control en Ajustes > Accesibilidad.
4. Volvé a la app y comprobá que el servicio figura activo.
5. Copiá el token privado.
6. En Termux, descargá el directorio tools/mcp y ejecutá install-termux.sh.
7. Reiniciá Codex y comprobá codex mcp list.

## Herramientas MCP

- android_status
- android_get_ui_tree
- android_screenshot
- android_open_app
- android_tap
- android_click_element
- android_type
- android_swipe
- android_back
- android_home
- android_open_url
- android_wait_for_text

## Limitaciones

La automatización respeta las restricciones de Android. No puede inspeccionar contenido que una app excluya del árbol de accesibilidad ni capturar pantallas protegidas por FLAG_SECURE. La captura requiere Android 11 o posterior. La disponibilidad permanente depende de que Android mantenga habilitado el servicio de accesibilidad y de las políticas de batería del fabricante.
