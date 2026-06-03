obs = obslua

-- Configuración por defecto
target_scene = "2. Presentacion Completa"
script_to_run = "/home/edu/Autamedica/scripts/demo_recetas.py"
host_url = "https://autamedica.com"

function script_description()
    return "<b>AutaMedica OBS Automator (Lua)</b><br/><br/>" ..
           "Ejecuta automáticamente el script de demostración de Playwright al cambiar a la escena configurada.<br/>" ..
           "<i>No requiere configuración de Python en OBS.</i>"
end

function script_update(settings)
    target_scene = obs.obs_data_get_string(settings, "target_scene")
    script_to_run = obs.obs_data_get_string(settings, "script_to_run")
    host_url = obs.obs_data_get_string(settings, "host_url")
end

function script_properties()
    local props = obs.obs_properties_create()
    
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
end

function script_defaults(settings)
    obs.obs_data_set_default_string(settings, "target_scene", target_scene)
    obs.obs_data_set_default_string(settings, "script_to_run", script_to_run)
    obs.obs_data_set_default_string(settings, "host_url", host_url)
end

function on_event(event)
    if event == obs.OBS_FRONTEND_EVENT_SCENE_CHANGED then
        local current_scene = obs.obs_frontend_get_current_scene()
        if current_scene ~= nil then
            local name = obs.obs_source_get_name(current_scene)
            obs.obs_source_release(current_scene)
            
            if name == target_scene then
                obs.blog(obs.LOG_INFO, "[AutaMedica] Escena cambiada a '" .. name .. "'. Lanzando script en segundo plano...")
                
                -- Se ejecuta en background usando '&' para no trabar el renderizado de OBS
                local cmd = "AUTAMEDICA_HOST='" .. host_url .. "' python3 '" .. script_to_run .. "' &"
                local success = os.execute(cmd)
                
                if success then
                    obs.blog(obs.LOG_INFO, "[AutaMedica] Proceso iniciado: " .. cmd)
                else
                    obs.blog(obs.LOG_WARNING, "[AutaMedica] Error al intentar iniciar el comando: " .. cmd)
                end
            end
        end
    end
end

function script_load(settings)
    obs.obs_frontend_add_event_callback(on_event)
end

function script_unload()
    obs.obs_frontend_remove_event_callback(on_event)
end
