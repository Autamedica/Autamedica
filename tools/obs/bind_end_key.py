#!/usr/bin/env python3
import subprocess
import ast
import sys

def main():
    new_path = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom-vaca/'
    
    try:
        # 1. Obtener la lista actual de accesos directos
        cmd_get = ["gsettings", "get", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings"]
        res = subprocess.run(cmd_get, capture_output=True, text=True, check=True)
        current_str = res.stdout.strip()
        
        # Parsear a lista de Python
        if current_str == "@as []":
            bindings_list = []
        else:
            bindings_list = ast.literal_eval(current_str)
            
        # 2. Agregar la nueva ruta si no existe
        if new_path not in bindings_list:
            bindings_list.append(new_path)
            
        # Formatear la lista de vuelta a string de GVariant (usa comillas dobles)
        gvariant_str = str(bindings_list).replace("'", '"')
        
        # 3. Guardar la lista actualizada
        cmd_set_list = ["gsettings", "set", "org.gnome.settings-daemon.plugins.media-keys", "custom-keybindings", gvariant_str]
        subprocess.run(cmd_set_list, check=True)
        
        # 4. Configurar las propiedades del atajo
        schema_path = f"org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:{new_path}"
        
        subprocess.run(["gsettings", "set", schema_path, "name", "Vaca End"], check=True)
        subprocess.run(["gsettings", "set", schema_path, "command", "mpv --no-video /home/edu/Autamedica/tools/obs/assets/cow_moo.mp3"], check=True)
        subprocess.run(["gsettings", "set", schema_path, "binding", "End"], check=True)
        
        print("\n✅ Atajo de teclado GNOME configurado con éxito:")
        print("  - Nombre: Vaca End")
        print("  - Comando:", "mpv --no-video /home/edu/Autamedica/tools/obs/assets/cow_moo.mp3")
        print("  - Tecla asociada:", "End")
        print("\nYa puedes presionar la tecla [End] en cualquier momento para reproducir el sonido de vaca.")
        
    except Exception as e:
        print(f"❌ Error al configurar el atajo de gsettings: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
