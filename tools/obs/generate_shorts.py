#!/usr/bin/env python3
import os
import subprocess
import sys

INPUT_VIDEO = "/mnt/data/edu/storage/Downloads/2793098263-1374917529-10c2af93-063b-4da5-92e3-9144e2c1d950.mp4"
OUTPUT_DIR = "/mnt/data/edu/storage/Downloads/shorts"

# Define the rounds with start and end times in seconds
SHORTS_CONFIG = [
    {
        "id": 1,
        "title": "ronda_1_paradoja_leche_cruda",
        "start": 15,
        "end": 70,
        "label": "Ronda 1: La Paradoja de la Leche Cruda"
    },
    {
        "id": 2,
        "title": "ronda_2_mitos_pasteurizacion",
        "start": 285,
        "end": 340,
        "label": "Ronda 2: Mitos de la Pasteurización"
    },
    {
        "id": 3,
        "title": "ronda_3_mito_granja_limpia",
        "start": 1200,
        "end": 1256,
        "label": "Ronda 3: El Mito de la Granja Limpia"
    },
    {
        "id": 4,
        "title": "ronda_4_gripe_aviar_ganado",
        "start": 1545,
        "end": 1602,
        "label": "Ronda 4: Gripe Aviar H5N1 en Leche"
    },
    {
        "id": 5,
        "title": "ronda_5_lactosa_digestion",
        "start": 1765,
        "end": 1823,
        "label": "Ronda 5: Leche Cruda e Intolerancia"
    }
]

def main():
    if not os.path.exists(INPUT_VIDEO):
        print(f"❌ Error: El video de origen no existe en: {INPUT_VIDEO}")
        return 1
        
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"🚀 Iniciando generación de Shorts en: {OUTPUT_DIR}\n")

    for s in SHORTS_CONFIG:
        out_filename = f"short_{s['id']}_{s['title']}.mp4"
        out_path = os.path.join(OUTPUT_DIR, out_filename)
        duration = s["end"] - s["start"]
        
        print(f"🎬 Creando Short #{s['id']}: '{s['label']}'")
        print(f"  - Tiempo: {s['start']}s a {s['end']}s (Duración: {duration}s)")
        print(f"  - Destino: {out_path}")
        
        # ffmpeg filter chain (OPTIMIZED FOR SPEED):
        # 1. Scale background down to 72x128 (100x fewer pixels), crop, apply small blur
        # 2. Scale background back up to 720x1280 (bilinear upscale naturally softens it further)
        # 3. Scale foreground widescreen video to fit 720 wide (retaining aspect ratio 16:9 -> 720x406)
        # 4. Overlay foreground in the center of background
        filter_complex = (
            "[0:v]scale=72:128:force_original_aspect_ratio=increase,crop=72:128,boxblur=2:1[bg_small];"
            "[bg_small]scale=720:1280[bg];"
            "[0:v]scale=720:406[fg];"
            "[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]"
        )
        
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(s["start"]),
            "-to", str(s["end"]),
            "-i", INPUT_VIDEO,
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "0:a",      # Keep original audio
            "-c:v", "libx264",  # H.264 video codec
            "-preset", "faster",# Faster compression for quick execution
            "-crf", "22",       # High quality constant rate factor
            "-c:a", "aac",      # AAC audio codec
            "-b:a", "128k",     # Audio bitrate
            out_path
        ]
        
        try:
            # Run conversion and capture stderr to debug if fails
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode == 0:
                print(f"  ✅ Completado con éxito: {out_filename}\n")
            else:
                print(f"  ❌ Error al compilar el video:")
                print(res.stderr)
        except Exception as e:
            print(f"  ❌ Excepción: {e}\n")
            
    print(f"🎉 ¡Proceso finalizado! Los 5 Shorts verticales de YouTube están listos en: {OUTPUT_DIR}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
