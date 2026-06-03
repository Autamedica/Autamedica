#!/usr/bin/env python3
import os
import sys
import time
from playwright.sync_api import sync_playwright

# Configuración
HOST = os.environ.get("AUTAMEDICA_HOST", "https://autamedica.com")
USER_DATA_DIR = os.path.expanduser("~/.config/google-chrome-automation")
CHROME_PATH = "/usr/bin/google-chrome"

# Lista de 12 fármacos reales para la demostración coordinada
DRUGS = [
    {"name": "Ibuprofeno 400mg", "dosage": "400mg", "freq": "cada 8 horas", "dur": "5 días", "diag": "Inflamación articular"},
    {"name": "Paracetamol 500mg", "dosage": "500mg", "freq": "cada 6 horas", "dur": "3 días", "diag": "Fiebre leve"},
    {"name": "Amoxicilina 500mg", "dosage": "500mg", "freq": "cada 8 horas", "dur": "7 días", "diag": "Amigdalitis bacteriana"},
    {"name": "Loratadina 10mg", "dosage": "10mg", "freq": "cada 24 horas", "dur": "10 días", "diag": "Rinitis alérgica"},
    {"name": "Losartan 50mg", "dosage": "50mg", "freq": "cada 24 horas", "dur": "30 días", "diag": "Hipertensión esencial"},
    {"name": "Metformina 850mg", "dosage": "850mg", "freq": "cada 12 horas", "dur": "30 días", "diag": "Diabetes mellitus tipo 2"},
    {"name": "Omeprazol 20mg", "dosage": "20mg", "freq": "cada 24 horas", "dur": "14 días", "diag": "Reflujo gastroesofágico"},
    {"name": "Atorvastatina 20mg", "dosage": "20mg", "freq": "cada 24 horas", "dur": "30 días", "diag": "Dislipidemia mixta"},
    {"name": "Sertralina 50mg", "dosage": "50mg", "freq": "cada 24 horas", "dur": "30 días", "diag": "Trastorno de ansiedad generalizada"},
    {"name": "Enalapril 10mg", "dosage": "10mg", "freq": "cada 12 horas", "dur": "30 días", "diag": "Insuficiencia cardíaca leve"},
    {"name": "Clonazepam 0.5mg", "dosage": "0.5mg", "freq": "cada 24 horas", "dur": "15 días", "diag": "Trastorno de pánico"},
    {"name": "Albuterol Aerosol", "dosage": "100mcg", "freq": "cada 6 horas", "dur": "7 días", "diag": "Asma bronquial activa"}
]

def run_demo():
    print("=" * 60)
    print("🚀 Iniciando automatización inteligente de AutaMedica")
    print(f"🔗 URL: {HOST}")
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
        page.wait_for_timeout(1500)

        # 2. Abrir menú de Acceso y seleccionar Profesional (médico)
        print("🖱️ Abriendo menú de Acceso...")
        try:
            acceso_btn = page.locator('button:has-text("Acceder"), button:has-text("Access"), button:has-text("Acceso")')
            if acceso_btn.count() > 0:
                acceso_btn.first.click()
                page.wait_for_timeout(800)
                
                print("👉 Seleccionando 'Profesional de la salud'...")
                prof_link = page.locator('a:has-text("Profesional de la salud"), a[href*="doctor"]')
                if prof_link.count() > 0:
                    prof_link.first.click()
                else:
                    page.goto(f"{HOST}/auth/login?role=doctor")
            else:
                page.goto(f"{HOST}/auth/login?role=doctor")
        except Exception as e:
            print(f"⚠️ Error al interactuar con el Navbar: {e}. Yendo directo al login...")
            page.goto(f"{HOST}/auth/login?role=doctor")

        # 3. Zoom en la tarjeta de login
        page.wait_for_load_state("load")
        print("🔍 ZOOM IN: Enfocando y agrandando la tarjeta de Login...")
        try:
            page.wait_for_selector('button:has-text("Google"), button:has-text("Continuar")', timeout=8000)
            page.evaluate("""() => {
                const card = document.querySelector('.bg-white.shadow-2xl') || document.querySelector('form') || document.querySelector('.relative.z-10');
                if (card) {
                    card.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                    card.style.transformOrigin = 'center center';
                    card.style.transform = 'scale(1.25)';
                }
            }""")
            page.wait_for_timeout(1500)
        except Exception as e:
            print(f"⚠️ No se pudo aplicar zoom a la tarjeta de login: {e}")

        # 4. Login con Google
        current_url = page.url
        if "/auth/" in current_url or "/login" in current_url:
            print("👤 Haciendo clic en login con Google...")
            try:
                google_button = page.locator('button:has-text("Google"), button:has-text("Continuar con Google")')
                if google_button.count() > 0:
                    google_button.first.click()
                    page.wait_for_timeout(3000)
                    
                    if "accounts.google.com" in page.url:
                        print("🔑 Esperando que completes el inicio de sesión con Google en el navegador (max 90 segundos)...")
                        for _ in range(90):
                            if HOST in page.url and "/auth/" not in page.url:
                                print("✅ Login exitoso detectado!")
                                break
                            time.sleep(1)
            except Exception as e:
                print(f"⚠️ Error durante el clic de login con Google: {e}")
        else:
            print("✅ Ya estabas logueado.")

        # 5. Navegar a /doctors/prescriptions (Portal de recetas del médico)
        print("📂 Navegando al portal de recetas...")
        page.goto(f"{HOST}/doctors/prescriptions")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        # 6. Deseleccionar cualquier paciente seleccionado para forzar carga manual con tu correo
        # (Esto garantiza que las recetas se envíen a tu email ingresado manualmente en el modal)
        print("🔍 Limpiando selección de paciente para ingreso manual de datos...")
        try:
            # Si hay un paciente seleccionado, su botón tiene fondo oscuro (neutral-900). 
            # Hacemos clic para deseleccionarlo.
            active_patient_btn = page.locator('button.bg-neutral-900')
            if active_patient_btn.count() > 0:
                active_patient_btn.first.click()
                page.wait_for_timeout(800)
        except Exception as e:
            print(f"⚠️ Error al deseleccionar paciente: {e}")

        # 7. Crear los 12 fármacos como BORRADORES secuencialmente
        print("\n=== FASE 1: Creación de 12 borradores ===")
        for idx, drug in enumerate(DRUGS):
            print(f"📝 [{idx + 1}/12] Creando borrador para: {drug['name']}...")
            try:
                # Clic en "Nueva receta"
                nueva_receta_btn = page.locator('button:has-text("Nueva receta"), button:has-text("Crear receta")')
                if nueva_receta_btn.count() > 0:
                    nueva_receta_btn.first.click()
                else:
                    page.locator('button:has(.lucide-plus)').first.click()
                
                # Esperar a que el modal esté visible
                page.wait_for_selector('input[placeholder*="Amoxicilina"]', timeout=8000)
                page.wait_for_timeout(400)

                # Completar datos del paciente (para que se envíen a contacto@autamedica.com)
                page.fill('input[placeholder="Ej: María González"]', "Eduardo Marques")
                page.fill('input[placeholder="DNI o CUIL"]', "30123456")
                page.fill('input[placeholder="Email o WhatsApp"]', "contacto@autamedica.com")
                page.fill('input[placeholder*="Corrientes"]', "Av. Corrientes 1234, CABA")

                # Completar los datos del fármaco
                page.fill('input[placeholder*="Amoxicilina"]', drug['name'])
                page.fill('input[placeholder="Ej: 500mg"]', drug['dosage'])
                page.fill('input[placeholder="Ej: cada 8 horas"]', drug['freq'])
                page.fill('input[placeholder="Ej: 7 días"]', drug['dur'])
                page.fill('input[placeholder*="TDAH"]', drug['diag'])
                page.fill('textarea[placeholder*="Tomar con alimentos"]', "Indicación automática en demostración de borrador.")

                page.wait_for_timeout(300)

                # Clic en "Guardar Borrador" (el nuevo botón que creamos)
                print("💾 Guardando como Borrador...")
                btn_borrador = page.locator('button:has-text("Guardar Borrador")')
                btn_borrador.first.click()

                # Esperar a que se guarde y cierre el modal
                page.wait_for_selector('input[placeholder*="Amoxicilina"]', state="hidden", timeout=10000)
                print(f"✅ [{idx + 1}/12] Borrador guardado exitosamente.")
                page.wait_for_timeout(800) # Pausa entre recetas
            except Exception as e:
                print(f"❌ Error al crear el borrador {idx + 1}: {e}")
                # Cerrar el modal por si quedó abierto tras error
                try:
                    close_btn = page.locator('button:has-text("Cancelar"), button:has(.lucide-x)')
                    if close_btn.count() > 0:
                        close_btn.first.click()
                except:
                    pass
                page.wait_for_timeout(1000)

        # 8. Emitir borradores secuencialmente para enviarlos por correo
        print("\n=== FASE 2: Emisión y envío a correo ===")
        # Cambiamos a la pestaña de "Borradores" para enfocar visualmente la acción
        try:
            print("🗂️ Seleccionando pestaña de 'Borradores'...")
            tab_borradores = page.locator('button:has-text("Borradores")')
            if tab_borradores.count() > 0:
                tab_borradores.first.click()
                page.wait_for_timeout(1000)
        except Exception as e:
            print(f"⚠️ No se pudo seleccionar la pestaña Borradores: {e}")

        # Bucle para emitir los borradores
        # Dado que al emitir un borrador este desaparece de la pestaña 'Borradores' y pasa a 'Activa' (y obtiene CUIR),
        # siempre cliqueamos el primer botón 'Emitir' visible.
        emitted_count = 0
        max_emits = 12
        
        while emitted_count < max_emits:
            btn_emitir = page.locator('button:has-text("Emitir")').first
            if btn_emitir.count() == 0:
                print("📋 No se encontraron más borradores con botón 'Emitir'.")
                break
            
            try:
                # Opcional: Obtener el nombre del medicamento para loguear
                card = page.locator('div.group:has(button:has-text("Emitir"))').first
                drug_title = card.locator('h3').inner_text()
                print(f"📨 [{emitted_count + 1}] Emitiendo y enviando por correo: {drug_title}...")
            except Exception:
                print(f"📨 [{emitted_count + 1}] Emitiendo receta...")

            try:
                btn_emitir.click()
                # Esperar a que se realice la firma, generación de PDF y envío de email
                page.wait_for_timeout(2500)
                emitted_count += 1
            except Exception as e:
                print(f"❌ Error al hacer clic en Emitir: {e}")
                page.wait_for_timeout(1000)

        # 9. Mantener abierto hasta que el usuario cierre el navegador/pestaña
        print("\n" + "=" * 60)
        print("🟢 DEMOSTRACIÓN FINALIZADA CON ÉXITO")
        print("📨 Se han creado 12 borradores y se han emitido uno a uno a tu correo.")
        print("⏳ El navegador se mantendrá abierto interactivo.")
        print("❌ CERRÁ LA PESTAÑA o la ventana del navegador cuando desees finalizar.")
        print("=" * 60 + "\n")

        try:
            while True:
                if page.is_closed():
                    break
                time.sleep(1)
        except Exception:
            pass

        print("🔌 Conexión cerrada. Script finalizado.")

if __name__ == "__main__":
    run_demo()
