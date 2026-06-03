#!/usr/bin/env python3
import os
import sys
import time
from playwright.sync_api import sync_playwright

# Configuración
HOST = os.environ.get("AUTAMEDICA_HOST", "https://autamedica.com")
USER_DATA_DIR = os.path.expanduser("~/.config/google-chrome-automation")
CHROME_PATH = "/usr/bin/google-chrome"

def run_demo():
    print("=" * 60)
    print("🚀 Iniciando demostración interactiva de AutaMedica")
    print(f"🔗 URL Inicial: {HOST}")
    print(f"📂 Perfil de Chrome: {USER_DATA_DIR}")
    print("=" * 60)

    # Asegurar que el directorio de datos existe
    os.makedirs(USER_DATA_DIR, exist_ok=True)

    with sync_playwright() as p:
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

        # 1. Comenzar en la página inicial autamedica.com
        print(f"🔍 Navegando a la página inicial: {HOST}")
        page.goto(HOST)
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)

        # 2. Hacer click en "Acceder" en el Navbar para abrir el menú dropdown
        print("🖱️ Haciendo clic en 'Acceder' en el Navbar...")
        try:
            acceso_btn = page.locator('button:has-text("Acceder"), button:has-text("Access"), button:has-text("Acceso")')
            if acceso_btn.count() > 0:
                acceso_btn.first.click()
                page.wait_for_timeout(1000)
                
                # Clic en "Paciente" o "Ingresar como Paciente"
                print("👉 Seleccionando 'Paciente' en el menú...")
                paciente_link = page.locator('a:has-text("Paciente"), a:has-text("Ingresar como Paciente"), a[href*="patient"]')
                if paciente_link.count() > 0:
                    paciente_link.first.click()
                else:
                    # Fallback si no encuentra el link del menú, va directo
                    page.goto(f"{HOST}/auth/login?role=patient")
            else:
                # Fallback directo al login si no encuentra el botón en el navbar
                page.goto(f"{HOST}/auth/login?role=patient")
        except Exception as e:
            print(f"⚠️ Error al interactuar con el Navbar: {e}. Navegando directo al login...")
            page.goto(f"{HOST}/auth/login?role=patient")

        # 3. Esperar a la página de login y hacer ZOOM IN en la tarjeta de login
        page.wait_for_load_state("load")
        print("🔍 ZOOM IN: Enfocando y agrandando la tarjeta de Login...")
        try:
            page.wait_for_selector('button:has-text("Google"), button:has-text("Continuar")', timeout=8000)
            
            # Inyectamos el zoom en la tarjeta de login
            page.evaluate("""() => {
                const card = document.querySelector('.bg-white.shadow-2xl') || document.querySelector('form') || document.querySelector('.relative.z-10');
                if (card) {
                    card.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                    card.style.transformOrigin = 'center center';
                    card.style.transform = 'scale(1.25)';
                }
            }""")
            page.wait_for_timeout(2000)
        except Exception as e:
            print(f"⚠️ No se pudo aplicar zoom a la tarjeta de login: {e}")

        # 4. Login con Google
        current_url = page.url
        if "/auth/" in current_url or "/login" in current_url:
            print("👤 Haciendo clic en el botón de login con Google...")
            try:
                google_button = page.locator('button:has-text("Google"), button:has-text("Continuar con Google")')
                if google_button.count() > 0:
                    google_button.first.click()
                    page.wait_for_timeout(3000)
                    
                    if "accounts.google.com" in page.url:
                        print("🔑 Esperando que completes el inicio de sesión con Google de forma manual en el navegador (max 90 segundos)...")
                        for _ in range(90):
                            if HOST in page.url and "/auth/" not in page.url:
                                print("✅ Login exitoso detectado!")
                                break
                            time.sleep(1)
            except Exception as e:
                print(f"⚠️ Error durante el clic de login con Google: {e}")
        else:
            print("✅ Ya estabas logueado.")

        # 5. Navegar a /patients/appointments
        print("📂 Navegando a la sección de Citas...")
        page.goto(f"{HOST}/patients/appointments")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)

        # 6. Click en "Nueva cita" o "Nueva videoconsulta"
        print("🖱️ Haciendo clic en 'Nueva cita'...")
        try:
            nueva_cita_btn = page.locator('button:has-text("Nueva cita"), button:has-text("Nueva videoconsulta"), button:has-text("Agendar")')
            if nueva_cita_btn.count() > 0:
                nueva_cita_btn.first.click()
                # Esperar que abra el modal
                page.wait_for_selector('button[type="button"]:has-text("Dr."), button[type="button"]:has-text("Dra.")', timeout=8000)
                page.wait_for_timeout(1000)
                
                # 7. Seleccionar médicos y hacer ZOOM IN sobre la tarjeta del médico
                print("👉 Seleccionando al primer médico disponible en la lista...")
                medico_buttons = page.locator('button[type="button"]:has-text("Dr."), button[type="button"]:has-text("Dra.")')
                if medico_buttons.count() > 0:
                    first_medico = medico_buttons.first
                    first_medico.click()
                    print("🔍 ZOOM IN: Resaltando y agrandando la tarjeta del médico seleccionado...")
                    page.wait_for_timeout(800)
                    
                    # Inyectar zoom en el médico seleccionado
                    page.evaluate("""() => {
                        // Buscar el botón que tiene el borde de seleccionado (border-stone-900)
                        const activeDoc = document.querySelector('button.border-stone-900.bg-stone-50') || document.querySelector('button[type="button"]');
                        if (activeDoc) {
                            activeDoc.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
                            activeDoc.style.transformOrigin = 'center center';
                            activeDoc.style.transform = 'scale(1.15)';
                            activeDoc.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
                        }
                    }""")
                    page.wait_for_timeout(2000)
                else:
                    print("❌ No se encontraron botones de médicos en el modal.")
            else:
                print("❌ No se encontró el botón para agendar 'Nueva cita'.")
        except Exception as e:
            print(f"⚠️ Error en el flujo de selección de médicos: {e}")

        print("\n🟢 Demostración completada. Presioná ENTER en la terminal del script para cerrar...")
        input()
        context.close()

if __name__ == "__main__":
    run_demo()
