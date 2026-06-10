#!/usr/bin/env python3
import sys
import os

# Ensure tools/obs is in import path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from youtube_upload import get_authenticated_service, upload_video

SHORTS = [
    {
        "file": "short_1_ronda_1_paradoja_leche_cruda.mp4",
        "title": "La Paradoja de Ventas y Gripe Aviar | AutaMedica #Shorts",
        "desc": "El equipo de AutaMedica analiza la paradoja de ventas y el riesgo de gripe aviar H5N1 en leche cruda.\n\nCompleto en: https://autamedica.com"
    },
    {
        "file": "short_2_ronda_2_mitos_pasteurizacion.mp4",
        "title": "Mitos de la Pasteurización (¿Se pierden nutrientes?) #Shorts",
        "desc": "¿Se pierden nutrientes reales al pasteurizar la leche? El equipo médico de AutaMedica desmiente este mito.\n\nCompleto en: https://autamedica.com"
    },
    {
        "file": "short_3_ronda_3_mito_granja_limpia.mp4",
        "title": "El Mito de la Granja Limpia (Higiene vs Bacterias) #Shorts",
        "desc": "¿Basta con una granja limpia para evitar bacterias patógenas en la leche cruda? El equipo de AutaMedica responde.\n\nCompleto en: https://autamedica.com"
    },
    {
        "file": "short_4_ronda_4_gripe_aviar_ganado.mp4",
        "title": "Gripe Aviar H5N1 en Ganado y Leche de Supermercado #Shorts",
        "desc": "La presencia de Gripe Aviar H5N1 en el ganado lechero y la seguridad en la leche comercial de supermercado.\n\nCompleto en: https://autamedica.com"
    },
    {
        "file": "short_5_ronda_5_lactosa_digestion.mp4",
        "title": "Fisiología de la Lactosa e Intolerancia Láctea #Shorts",
        "desc": "Análisis científico de la fisiología de la lactosa, la digestión y por qué ocurre la intolerancia.\n\nCompleto en: https://autamedica.com"
    }
]

def main():
    shorts_dir = "/mnt/data/edu/storage/Downloads/shorts"
    print("Initiating upload of 5 Shorts...")
    
    try:
        youtube = get_authenticated_service()
    except Exception as e:
        sys.exit(f"❌ Failed to authenticate: {e}")
        
    for index, short in enumerate(SHORTS, start=1):
        video_path = os.path.join(shorts_dir, short["file"])
        if not os.path.exists(video_path):
            print(f"⚠️ Warning: File not found, skipping: {video_path}")
            continue
            
        print(f"\n[Short {index}/5] Uploading: {short['file']}")
        try:
            upload_video(
                youtube=youtube,
                video_path=video_path,
                title=short["title"],
                description=short["desc"],
                privacy_status="private" # Upload as private first so the user can verify
            )
        except Exception as e:
            print(f"❌ Failed to upload short {index}: {e}")
            
    print("\n🎉 All available Shorts uploaded successfully!")

if __name__ == "__main__":
    main()
