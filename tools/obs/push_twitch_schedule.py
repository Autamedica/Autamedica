#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.parse
import webbrowser
import http.server
import socketserver
import threading
from datetime import datetime

# Ensure we can load TwitchClient config
DIR_PATH = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR_PATH)

try:
    from twitch_client import TwitchClient, BROADCASTER_ID, BROADCASTER_LOGIN
except ImportError:
    print("❌ Error: No se pudo importar twitch_client.py.")
    sys.exit(1)

# Configuration
PORT = 3000
REDIRECT_URI = f"http://localhost:{PORT}"
SCOPES = "channel:manage:schedule"

# Token holder for the server
auth_token = None
server_should_stop = False

class AuthHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging to keep output clean
        return

    def do_GET(self):
        global auth_token, server_should_stop
        
        parsed_url = urllib.parse.urlparse(self.path)
        
        if parsed_url.path == "/token":
            # Extract access token from query params
            query = urllib.parse.parse_qs(parsed_url.query)
            token = query.get("access_token")
            if token:
                auth_token = token[0]
                server_should_stop = True
                
                # Respond success
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))
            return
            
        # Serve the HTML page that extracts hash and sends it via GET
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        
        html = """
        <!DOCTYPE html>
        <html>
        <head>
          <title>AutaMedica Twitch Auth</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0c10; color: #f5f5f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 3rem; border-radius: 16px; text-align: center; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(10px); }
            h1 { color: #a855f7; margin-bottom: 0.5rem; font-size: 1.8rem; letter-spacing: -0.02em; }
            p { color: #8e8e93; line-height: 1.6; font-size: 0.95rem; margin-bottom: 1.5rem; }
            .success-pulse { width: 12px; height: 12px; background-color: #22c55e; border-radius: 50%; display: inline-block; animation: pulse 1.5s infinite; }
            @keyframes pulse {
              0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
              70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
              100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>AutaMedica OBS Tools</h1>
            <p id="msg">Procesando autenticación con Twitch...</p>
          </div>
          <script>
            const hash = window.location.hash;
            if (hash) {
              const params = new URLSearchParams(hash.substring(1));
              const token = params.get('access_token');
              if (token) {
                document.getElementById('msg').innerHTML = '<span class="success-pulse"></span> ¡Autenticación exitosa! Podés cerrar esta ventana y volver a la consola.';
                fetch('/token?access_token=' + token)
                  .then(() => {
                    setTimeout(() => window.close(), 1500);
                  });
              } else {
                document.getElementById('msg').innerText = "❌ Error: No se encontró el token de acceso.";
              }
            } else {
              document.getElementById('msg').innerText = "Esperando respuesta de Twitch...";
            }
          </script>
        </body>
        </html>
        """
        self.wfile.write(html.encode("utf-8"))

def run_auth_server(client_id):
    global server_should_stop
    
    server_address = ("", PORT)
    with socketserver.TCPServer(server_address, AuthHandler) as httpd:
        auth_url = (
            "https://id.twitch.tv/oauth2/authorize"
            f"?client_id={client_id}"
            f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
            f"&response_type=token"
            f"&scope={urllib.parse.quote(SCOPES)}"
        )
        
        print("\n🔑 INSTRUCCIONES DE AUTENTICACIÓN:")
        print("1. Asegúrate de haber agregado 'http://localhost:3000' a las Redirect URIs en la Consola de Twitch.")
        print("2. El script intentará abrir tu navegador automáticamente.")
        print("3. Si no se abre, copiá y pegá este enlace en tu navegador:")
        print(f"\n👉 {auth_url}\n")
        
        # Open web browser
        threading.Timer(1.0, lambda: webbrowser.open(auth_url)).start()
        
        while not server_should_stop:
            httpd.handle_request()

def get_category_id(client_id, token, query):
    url = f"https://api.twitch.tv/helix/search/categories?query={urllib.parse.quote(query)}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Client-ID", client_id)
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            for item in res.get("data", []):
                if item.get("name").lower() == query.lower():
                    return item.get("id")
    except Exception as e:
        print(f"⚠️ Error buscando categoría '{query}': {e}")
    
    # Fallbacks
    fallbacks = {
        "just chatting": "509658",
        "science & technology": "509670",
        "software and game development": "1469308723"
    }
    return fallbacks.get(query.lower(), "509658")

def clear_existing_schedule(client_id, token):
    print("🧹 Obteniendo agenda actual en Twitch...")
    url = f"https://api.twitch.tv/helix/schedule?broadcaster_id={BROADCASTER_ID}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Client-ID", client_id)
    req.add_header("Authorization", f"Bearer {token}")
    
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            segments = res.get("data", {}).get("segments", [])
            
            if not segments:
                print("✨ El calendario ya está limpio.")
                return
                
            print(f"Encontrados {len(segments)} segmentos existentes. Eliminando...")
            for seg in segments:
                seg_id = seg.get("id")
                del_url = f"https://api.twitch.tv/helix/schedule/segment?broadcaster_id={BROADCASTER_ID}&id={seg_id}"
                del_req = urllib.request.Request(del_url, method="DELETE")
                del_req.add_header("Client-ID", client_id)
                del_req.add_header("Authorization", f"Bearer {token}")
                
                try:
                    with urllib.request.urlopen(del_req) as del_res:
                        # 204 No Content is standard for success
                        pass
                except Exception as del_err:
                    print(f"⚠️ Error eliminando segmento {seg_id}: {del_err}")
            print("✅ Limpieza completada.")
    except Exception as e:
        print(f"⚠️ Error limpiando agenda: {e}")

def create_schedule_segment(client_id, token, segment_data):
    url = f"https://api.twitch.tv/helix/schedule/segment?broadcaster_id={BROADCASTER_ID}"
    req = urllib.request.Request(url, method="POST")
    req.add_header("Client-ID", client_id)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    
    data = json.dumps(segment_data).encode("utf-8")
    
    try:
        with urllib.request.urlopen(req, data=data) as response:
            res = json.loads(response.read().decode("utf-8"))
            print(f"   - Creado con éxito: {segment_data.get('title')}")
            return res
    except Exception as e:
        print(f"❌ Error creando segmento '{segment_data.get('title')}': {e}")
        # Print response body if available
        if hasattr(e, 'read'):
            print(f"   Detalle API: {e.read().decode('utf-8')}")

def main():
    global auth_token
    print("🚀 Iniciando herramienta de subida de calendario a Twitch...")
    
    # Cargar variables del cliente
    client = TwitchClient()
    if not client.client_id or not client.client_secret:
        print("❌ Error: TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET no configurados en el archivo .env.")
        sys.exit(1)
        
    # 1. Iniciar servidor OAuth
    run_auth_server(client.client_id)
    
    if not auth_token:
        print("❌ Error: No se obtuvo el token de acceso del usuario.")
        sys.exit(1)
        
    print("✅ Autenticación de usuario recibida correctamente.")
    
    # 2. Buscar IDs de categorías
    print("\n🔍 Buscando identificadores de categorías en Twitch...")
    just_chatting_id = get_category_id(client.client_id, auth_token, "Just Chatting")
    science_tech_id = get_category_id(client.client_id, auth_token, "Science & Technology")
    software_dev_id = get_category_id(client.client_id, auth_token, "Software and Game Development")
    
    # 3. Limpiar calendario existente en Twitch
    clear_existing_schedule(client.client_id, auth_token)
    
    # 4. Crear los nuevos segmentos semanales en Twitch
    print("\n📤 Subiendo nuevos segmentos recurrentes a Twitch...")
    
    # Definir los segmentos (tiempos en UTC).
    # Martes (June 16), Jueves (June 18), Sábado (June 20)
    # Nota: 19:00 ARG = 22:00 UTC, 15:00 ARG = 18:00 UTC
    segments_to_create = [
        {
            "start_time": "2026-06-16T22:00:00Z",
            "timezone": "America/Buenos_Aires",
            "duration": "120", # 2 horas
            "is_recurring": True,
            "title": "Debate: Receta Digital 🏥",
            "category_id": science_tech_id
        },
        {
            "start_time": "2026-06-11T22:00:00Z",
            "timezone": "America/Buenos_Aires",
            "duration": "120",
            "is_recurring": True,
            "title": "Live Coding: Supabase ⚡",
            "category_id": software_dev_id
        },
        {
            "start_time": "2026-06-13T18:00:00Z",
            "timezone": "America/Buenos_Aires",
            "duration": "120",
            "is_recurring": True,
            "title": "Demo & Feedback Clínico 🍊",
            "category_id": just_chatting_id
        }
    ]
    
    for seg in segments_to_create:
        create_schedule_segment(client.client_id, auth_token, seg)
        
    print("\n🎉 Calendario subido a Twitch exitosamente. ¡Chequea tu canal en Twitch!")

if __name__ == "__main__":
    main()
