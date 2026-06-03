import obspython as obs
import subprocess
import os

# Configuración por defecto
target_scene = "2. Presentacion Completa"
script_to_run = "/home/edu/Autamedica/scripts/demo_recetas.py"
host_url = "https://doctor.autamedica.com"

def script_description():
    return (
        "<b>AutaMedica OBS Automator</b><br/><br/>"
        "Ejecuta automáticamente el script de demostración (Playwright) cuando "
        "se cambia a una escena específica de OBS.<br/>"
        "Diseñado para presentaciones y demostraciones en vivo."
    )

def script_update(settings):
    global target_scene, script_to_run, host_url
    target_scene = obs.obs_data_get_string(settings, "target_scene")
    script_to_run = obs.obs_data_get_string(settings, "script_to_run")
    host_url = obs.obs_data_get_string(settings, "host_url")

def script_properties():
    props = obs.obs_properties_create()
    
    obs.obs_properties_add_text(
        props, "target_scene", "Escena disparadora:", obs.OBS_TEXT_DEFAULT
    )
    obs.obs_properties_add_text(
        props, "script_to_run", "Ruta al script Python:", obs.OBS_TEXT_DEFAULT
    )
    obs.obs_properties_add_text(
        props, "host_url", "URL de AutaMedica:", obs.OBS_TEXT_DEFAULT
    )
    
    return props

def script_defaults(settings):
    obs.obs_data_set_default_string(settings, "target_scene", target_scene)
    obs.obs_data_set_default_string(settings, "script_to_run", script_to_run)
    obs.obs_data_set_default_string(settings, "host_url", host_url)

def on_event(event):
    if event == obs.OBS_FRONTEND_EVENT_SCENE_CHANGED:
        current_scene = obs.obs_frontend_get_current_scene()
        if current_scene:
            name = obs.obs_source_get_name(current_scene)
            obs.obs_source_release(current_scene)
            
            if name == target_scene:
                obs.blog(obs.LOG_INFO, f"[AutaMedica] Escena cambiada a '{name}'. Disparando script de automatización...")
                
                # Ejecutar el script python en segundo plano (detached)
                if os.path.exists(script_to_run):
                    try:
                        env = os.environ.copy()
                        env["AUTAMEDICA_HOST"] = host_url
                        
                        # Ejecutamos con python3 en un proceso separado para no congelar la UI de OBS
                        subprocess.Popen(
                            ["python3", script_to_run],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            start_new_session=True,
                            env=env
                        )
                        obs.blog(obs.LOG_INFO, f"[AutaMedica] Proceso secundario iniciado con éxito para {script_to_run}")
                    except Exception as e:
                        obs.blog(obs.LOG_WARNING, f"[AutaMedica] Error al intentar iniciar el script: {e}")
                else:
                    obs.blog(obs.LOG_ERROR, f"[AutaMedica] El archivo del script no existe en la ruta: {script_to_run}")

def script_load(settings):
    obs.obs_frontend_add_event_callback(on_event)

def script_unload():
    obs.obs_frontend_remove_event_callback(on_event)
