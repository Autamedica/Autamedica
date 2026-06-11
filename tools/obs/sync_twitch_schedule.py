#!/usr/bin/env python3
import os
import sys
import json
from datetime import datetime, timezone

# Ensure we can import TwitchClient from current directory
DIR_PATH = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR_PATH)

try:
    from twitch_client import TwitchClient, BROADCASTER_ID, BROADCASTER_LOGIN
except ImportError:
    print("❌ Error: No se pudo importar twitch_client.py. Asegúrate de ejecutar el script en su directorio.")
    sys.exit(1)

OUTPUT_FILE = os.path.join(DIR_PATH, "twitch_schedule.json")

# Fallback/Enrichment themes for schedule segments when Twitch has empty titles/descriptions
DAY_THEMES = {
    0: { # Monday / Lunes
        "title": "Debate: Live Coding Clínico 🏥",
        "description": "Acompañanos para debates de salud digital, prevención, e inteligencia artificial con criterio clínico.",
        "categories": ["Science & Technology", "Just Chatting"],
        "weekday_code": "MO"
    },
    1: { # Tuesday / Martes
        "title": "Debate: Receta Digital 🏥",
        "description": "¿Hacia dónde va la receta electrónica? Análisis de la Ley 27.553 y homologación oficial.",
        "categories": ["Science & Technology", "Just Chatting"],
        "weekday_code": "TU"
    },
    3: { # Thursday / Jueves
        "title": "Live Coding: Supabase ⚡",
        "description": "Desarrollo en vivo y discusión de arquitectura: Seguridad de datos médicos y RLS en Supabase.",
        "categories": ["Science & Technology", "Software and Game Development"],
        "weekday_code": "TH"
    },
    5: { # Saturday / Sábado
        "title": "Demo & Feedback Clínico 🍊",
        "description": "Presentación abierta de la plataforma y feedback sin filtros de médicos y profesionales de la salud.",
        "categories": ["Science & Technology", "Just Chatting"],
        "weekday_code": "SA"
    }
}

DEFAULT_THEME = {
    "title": "Debates y Live Coding de Salud",
    "description": "Acompañanos para debates de salud digital, prevención, e inteligencia artificial con criterio clínico.",
    "categories": ["Just Chatting"],
    "weekday_code": "DAILY"
}

def parse_iso_datetime(dt_str):
    """Parsea fecha ISO (ej: '2026-06-15T15:00:00Z') soportando formato UTC."""
    try:
        # Replace 'Z' with UTC offset for python compatibility
        if dt_str.endswith('Z'):
            dt_str = dt_str[:-1] + '+00:00'
        return datetime.fromisoformat(dt_str)
    except Exception:
        return None

def main():
    try:
        print("🔍 Inicializando sincronización de agenda vía Twitch API...")
        client = TwitchClient()
        
        # 1. Obtener Token
        client.get_app_access_token()
        
        # 2. Consultar Agenda
        print(f"📡 Solicitando schedule de Twitch para el canal '{BROADCASTER_LOGIN}'...")
        res = client._call_helix("schedule", {"broadcaster_id": BROADCASTER_ID})
        
        data = res.get("data", {})
        segments = data.get("segments", [])
        
        if not segments:
            print("⚠️ No se encontraron segmentos de calendario programados en Twitch.")
            print("Se mantendrá el archivo local intacto o podés crearlos en el panel de control de creadores de Twitch.")
            return

        print(f"✅ Se obtuvieron {len(segments)} segmentos de Twitch.")
        
        parsed_events = []
        
        for seg in segments:
            start_str = seg.get("start_time", "")
            end_str = seg.get("end_time", "")
            twitch_title = seg.get("title", "").strip()
            
            # Determinar día de la semana y temas locales
            dt_start = parse_iso_datetime(start_str)
            weekday = dt_start.weekday() if dt_start else -1 # 0:Lunes, 1:Martes, etc.
            
            # Seleccionar tema
            theme = DAY_THEMES.get(weekday, DEFAULT_THEME)
            
            # Usar título de Twitch si existe, sino enriquecer con local
            title = twitch_title if twitch_title else theme["title"]
            description = theme["description"]
            
            # Categorías
            category_obj = seg.get("category")
            categories = [category_obj.get("name")] if category_obj else theme["categories"]
            
            # Recurrencia
            is_recurring = seg.get("is_recurring", False)
            recurrence = f"FREQ=WEEKLY;BYDAY={theme['weekday_code']}" if is_recurring else "ONCE"
            
            parsed_events.append({
                "uid": seg.get("id", ""),
                "start": start_str,
                "end": end_str,
                "title": title,
                "description": description,
                "categories": categories,
                "recurrence": recurrence,
                "weekday": theme["weekday_code"]
            })
            
        # 3. Guardar en JSON
        output_data = {
            "broadcaster_id": BROADCASTER_ID,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "events": parsed_events
        }
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
            
        print(f"🎉 Sincronización finalizada con éxito. Guardado en: {OUTPUT_FILE}")
        
    except Exception as e:
        print(f"❌ Error durante la sincronización: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
