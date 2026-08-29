#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# Configuration constants
BROADCASTER_ID = "1374917529"
BROADCASTER_LOGIN = "autamedica"

class TwitchClient:
    def __init__(self, client_id=None, client_secret=None):
        self.client_id = client_id or os.environ.get("TWITCH_CLIENT_ID")
        self.client_secret = client_secret or os.environ.get("TWITCH_CLIENT_SECRET")
        self.access_token = None
        
        # Try to load from local .env if variables are not in environment
        if not self.client_id or not self.client_secret:
            self._load_env()

    def _load_env(self):
        # Look for .env in the parent directories
        current_dir = os.path.dirname(os.path.abspath(__file__))
        for _ in range(4):  # search up to 4 levels up
            env_path = os.path.join(current_dir, ".env")
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            # Remove quotes if present
                            v = v.strip().strip("'").strip('"')
                            if k.strip() == "TWITCH_CLIENT_ID":
                                self.client_id = v
                            elif k.strip() == "TWITCH_CLIENT_SECRET":
                                self.client_secret = v
                break
            current_dir = os.path.dirname(current_dir)

    def get_app_access_token(self):
        """Obtiene un App Access Token usando Client Credentials Flow."""
        if not self.client_id or not self.client_secret:
            raise ValueError(
                "Error: TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET no configurados.\n"
                "Por favor agrégalos a tu archivo .env en la raíz del proyecto."
            )
            
        url = "https://id.twitch.tv/oauth2/token"
        data = urllib.parse.urlencode({
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials"
        }).encode("utf-8")
        
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        
        try:
            with urllib.request.urlopen(req) as response:
                res = json.loads(response.read().decode("utf-8"))
                self.access_token = res["access_token"]
                return self.access_token
        except Exception as e:
            print(f"❌ Error obteniendo token de acceso de Twitch: {e}")
            raise

    def _call_helix(self, endpoint, query_params=None):
        """Método helper para realizar peticiones autenticadas a la API Helix."""
        if not self.access_token:
            self.get_app_access_token()
            
        url = f"https://api.twitch.tv/helix/{endpoint}"
        if query_params:
            url += f"?{urllib.parse.urlencode(query_params)}"
            
        req = urllib.request.Request(url, method="GET")
        req.add_header("Client-ID", self.client_id)
        req.add_header("Authorization", f"Bearer {self.access_token}")
        req.add_header("User-Agent", "AutaMedica-Integration-Agent/1.0")
        
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            print(f"❌ Error consultando endpoint '{endpoint}': {e}")
            raise

    def check_stream_status(self, user_login=BROADCASTER_LOGIN):
        """
        Verifica si el canal está en vivo (Live).
        Retorna la información del stream si está activo, o None si está offline.
        """
        res = self._call_helix("streams", {"user_login": user_login})
        data = res.get("data", [])
        if data:
            return data[0] # Retorna detalles del stream (viewers, title, game, start_time)
        return None

    def get_channel_info(self, broadcaster_id=BROADCASTER_ID):
        """Obtiene la información general del canal (título, categoría actual, etc)."""
        res = self._call_helix("channels", {"broadcaster_id": broadcaster_id})
        data = res.get("data", [])
        if data:
            return data[0]
        return None

    def get_user_info(self, login_name=BROADCASTER_LOGIN):
        """Obtiene metadatos del usuario (avatar, descripción, etc)."""
        res = self._call_helix("users", {"login": login_name})
        data = res.get("data", [])
        if data:
            return data[0]
        return None

if __name__ == "__main__":
    # Script test execution
    print("🔍 Inicializando cliente de prueba para Twitch Helix API...")
    try:
        client = TwitchClient()
        
        print("\n🔑 Solicitando App Access Token...")
        token = client.get_app_access_token()
        print(f"✅ Token obtenido: Bearer {token[:5]}...{token[-5:]}")
        
        print(f"\n👤 Consultando información del canal de '{BROADCASTER_LOGIN}' (ID: {BROADCASTER_ID})...")
        channel = client.get_channel_info(BROADCASTER_ID)
        if channel:
            print(f"   - Título: {channel.get('title')}")
            print(f"   - Categoría: {channel.get('game_name')}")
            print(f"   - Idioma: {channel.get('broadcaster_language')}")
        
        print(f"\n📡 Verificando estado de transmisión en vivo...")
        stream = client.check_stream_status(BROADCASTER_LOGIN)
        if stream:
            print("🔴 ¡ESTADO: EN VIVO! 🔴")
            print(f"   - Título actual: {stream.get('title')}")
            print(f"   - Espectadores: {stream.get('viewer_count')}")
            print(f"   - Iniciado a las: {stream.get('started_at')}")
        else:
            print("⚪ Estado: Offline (Sin transmisión activa)")
            
    except ValueError as val_err:
        print(f"\n⚠️ Configuración requerida:\n{val_err}")
    except Exception as e:
        print(f"\n❌ Ocurrió un error general: {e}")
