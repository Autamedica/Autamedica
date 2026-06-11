#!/usr/bin/env python3
"""TikTok Video Upload helper — sube un archivo local a TikTok usando la API oficial v2.

Uso:
  python3 scripts/tiktok-upload.py [ruta_al_video] [titulo]

Ejemplo:
  python3 scripts/tiktok-upload.py videos/guardia-2026/telefono-favaloro.mp4 "Favaloro, el héroe de la medicina argentina"
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib import error, request

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"


def load_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env


def main() -> int:
    env = load_env()
    access_token = env.get("TIKTOK_ACCESS_TOKEN")
    if not access_token:
        print("✗ Error: TIKTOK_ACCESS_TOKEN no esta configurado en .env", file=sys.stderr)
        return 1

    # Argumentos
    video_path_str = sys.argv[1] if len(sys.argv) > 1 else "videos/guardia-2026/telefono-favaloro.mp4"
    title = sys.argv[2] if len(sys.argv) > 2 else "Favaloro - Héroe de la Medicina"

    video_path = Path(video_path_str)
    if not video_path.is_absolute():
        video_path = ROOT / video_path

    if not video_path.exists():
        # Intentar ruta alternativa
        alt_path = Path("/home/edu/autamedica-growth-os/videos/guardia-2026/telefono-favaloro-1080.mp4")
        if alt_path.exists():
            video_path = alt_path
        else:
            print(f"✗ Error: El archivo de video '{video_path}' no existe.", file=sys.stderr)
            return 1

    print(f"Preparando subida de: {video_path}")
    print(f"Título: {title}")
    
    # 1. Obtener tamaño del video
    size_bytes = video_path.stat().st_size
    print(f"Tamaño: {size_bytes} bytes ({(size_bytes / (1024*1024)):.2f} MB)")

    # 2. Inicializar la subida en TikTok (Video Post API v2)
    init_url = "https://open.tiktokapis.com/v2/post/publish/video/init/"
    init_data = {
        "post_info": {
            "title": title,
            "privacy_level": "PUBLIC_TO_EVERYONE",
            "disable_duet": False,
            "disable_comment": False,
            "disable_stitch": False,
            "video_cover_timestamp_ms": 1000
        },
        "source_info": {
            "source": "FILE_UPLOAD",
            "video_size": size_bytes,
            "chunk_size": size_bytes,
            "total_chunk_count": 1
        }
    }
    
    req_body = json.dumps(init_data).encode("utf-8")
    req = request.Request(
        init_url,
        data=req_body,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8"
        },
        method="POST"
    )

    print("\nInicializando subida en TikTok API...")
    try:
        with request.urlopen(req, timeout=30) as r:
            res_json = json.load(r)
    except error.HTTPError as e:
        error_detail = e.read().decode()
        print(f"✗ Error en Inicialización (HTTP {e.code}): {error_detail}", file=sys.stderr)
        return 1

    data = res_json.get("data", {})
    upload_url = data.get("upload_url")
    publish_id = data.get("publish_id")

    if not upload_url:
        print(f"✗ Error: La API no retornó upload_url. Respuesta: {res_json}", file=sys.stderr)
        return 1

    print("✓ Inicialización Exitosa.")
    print(f"  Publish ID: {publish_id}")
    print(f"  Upload URL: {upload_url[:80]}...")

    # 3. Subir el archivo binario mediante PUT
    print("\nSubiendo archivo de video (PUT)...")
    video_bytes = video_path.read_bytes()
    
    put_req = request.Request(
        upload_url,
        data=video_bytes,
        headers={
            "Content-Type": "video/mp4",
            "Content-Length": str(size_bytes),
            "Content-Range": f"bytes 0-{size_bytes - 1}/{size_bytes}"
        },
        method="PUT"
    )

    try:
        with request.urlopen(put_req, timeout=120) as r:
            # Algunas respuestas de PUT pueden ser vacías si es 200/201 OK
            res_content = r.read().decode()
            print("✓ Subida de bytes completada con éxito.")
            if res_content:
                print(f"  Respuesta: {res_content}")
    except error.HTTPError as e:
        error_detail = e.read().decode()
        print(f"✗ Error al subir el video (HTTP {e.code}): {error_detail}", file=sys.stderr)
        return 1

    print("\n🎉 El video fue subido y enviado a TikTok exitosamente!")
    print(f"ID de publicación: {publish_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
