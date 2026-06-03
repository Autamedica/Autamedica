#!/usr/bin/env python3
import os
import sys
import time
from playwright.sync_api import sync_playwright

# Configuración
HOST = os.environ.get("AUTAMEDICA_HOST", "https://doctor.autamedica.com")
USER_DATA_DIR = os.path.expanduser("~/.config/google-chrome-automation")
CHROME_PATH = "/usr/bin/google-chrome"

def run_demo():
    print("=" * 60)
    print("🚀 Iniciando automatización de demostración de AutaMedica")
    print(f"🔗 URL: {HOST}")
    print(f"📂 Perfil de Chrome: {USER_DATA_DIR}")
    print("=" * 60)

    # Asegurar que el directorio de datos existe
    os.makedirs(USER_DATA_DIR, exist_ok=True)

    with sync_playwright() as p:
        # Lanzar Chrome persistente
        print("🌐 Iniciando Google Chrome...")
        try:
            context = p.chromium.launch_persistent_context(
                user_data_dir=USER_DATA_DIR,
                executable_path=CHROME_PATH,
                headless=False,
                args=[
                    "--start-maximized",
                    "--disable-extensions",
                    "--no-first-run",
                ],
                no_viewport=True
            )
        except Exception as e:
            print(f"❌ Error al iniciar Chrome: {e}")
            print("💡 Asegúrate de que no haya otra instancia de automatización de Chrome abierta con el mismo perfil.")
            return

        page = context.pages[0] if context.pages else context.new_page()

        # 1. Navegar a la página de login
        print(f"🔍 Navegando a la página de inicio/login: {HOST}/auth/login")
        page.goto(f"{HOST}/auth/login")

        # Esperar a que la página se cargue
        page.wait_for_load_state("load")

        # 2. Control de Login
        current_url = page.url
        if "/auth/login" in current_url:
            print("👤 Detectada página de Login. Buscando botón de Google...")
            try:
                # Buscar el botón de Google
                google_button = page.locator('button:has-text("Google"), button:has-text("Continuar con Google"), button:has-text("Continuar com Google")')
                if google_button.count() > 0:
                    print("👉 Haciendo clic en 'Continuar con Google'...")
                    google_button.first.click()
                    
                    # Esperar navegación o interactividad
                    page.wait_for_timeout(3000)
                    
                    # Si redirige a Google, dar tiempo al usuario para autenticarse si es la primera vez
                    if "accounts.google.com" in page.url:
                        print("🔑 Redirigido a la página de Google.")
                        print("⚠️ POR FAVOR: Si es necesario, ingresa tus credenciales manualmente en la ventana del navegador.")
                        print("⏳ Esperando hasta 90 segundos a que finalice el inicio de sesión y redirija...")
                        
                        # Esperar a que la URL vuelva a ser del dominio de Autamedica y salga de login/google
                        for _ in range(90):
                            if HOST in page.url and "/auth/" not in page.url:
                                print("✅ Login exitoso detectado!")
                                break
                            time.sleep(1)
                        else:
                            print("⚠️ Tiempo de espera agotado. Continuando proceso por si ya estás logueado...")
            except Exception as e:
                print(f"⚠️ Nota sobre el click de login: {e}")
        else:
            print("✅ Ya se detectó una sesión activa (omitido paso de login).")

        # 3. Navegar a la sección de recetas
        recetas_url = f"{HOST}/doctors/prescriptions"
        print(f"📂 Navegando directamente a Recetas: {recetas_url}")
        page.goto(recetas_url)
        page.wait_for_load_state("networkidle")

        # 4. Esperar y hacer click sobre la primera receta
        print("⏳ Esperando que carguen las recetas...")
        try:
            # Esperar a que aparezcan los botones de Detalle
            page.wait_for_selector('button:has-text("Detalle")', timeout=15000)
            detalle_buttons = page.locator('button:has-text("Detalle")')
            
            if detalle_buttons.count() > 0:
                print(f"📦 Recetas encontradas: {detalle_buttons.count()}.")
                print("🖱️ Haciendo clic en 'Detalle' de la primera receta para abrir vista...")
                
                # Clic en el primer botón de Detalle
                detalle_buttons.first.click()
                
                # Esperar a que el modal del detalle se renderice
                page.wait_for_selector('.bg-white.shadow-2xl', timeout=5000)
                page.wait_for_timeout(1000) # Dejar que termine la animación inicial de Framer Motion

                # 5. Efecto de ZOOM en la receta
                print("🔍 Aplicando zoom suave del 1.5x en el modal de la receta...")
                page.evaluate("""() => {
                    const modal = document.querySelector('.bg-white.shadow-2xl');
                    if (modal) {
                        modal.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                        modal.style.transformOrigin = 'center center';
                        modal.style.transform = 'scale(1.5)';
                        
                        // Opcional: oscurecer más el fondo para resaltar la receta
                        const backdrop = modal.previousElementSibling;
                        if (backdrop) {
                            backdrop.style.transition = 'background-color 0.8s ease';
                            backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        }
                    } else {
                        // Si no encuentra el modal específico, hace zoom general a la página
                        document.body.style.transition = 'transform 0.8s ease';
                        document.body.style.transformOrigin = 'center top';
                        document.body.style.transform = 'scale(1.3)';
                    }
                }""")
                print("✨ Zoom completado con éxito.")
            else:
                print("❌ No se encontraron recetas en la lista para hacer clic.")
        except Exception as e:
            print(f"⚠️ Error al interactuar con las recetas: {e}")

        print("\n🟢 Demostración lista. Presiona ENTER en esta terminal para cerrar el navegador...")
        input()
        
        print("Closing browser...")
        context.close()

if __name__ == "__main__":
    run_demo()
