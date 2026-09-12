#!/usr/bin/env python3
"""
Upload AutaMedica AAB to Google Play Store — Internal track
Uses Google Play Developer API v3 with service account credentials.
"""

import json
import sys
import time
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

# ── Config ────────────────────────────────────────────────────────────────────

SERVICE_ACCOUNT_FILE = Path("/home/edu/.android-secrets/autamedica-play-store-service-account.json")
AAB_PATH = Path("/mnt/data/Autamedica/apps/android/app/build/outputs/bundle/release/app-release.aab")
PACKAGE_NAME = "com.autamedica.android"
TRACK = "internal"  # internal → alpha → beta → production
VERSION_NAME = "1.2.8"

RELEASE_NOTES = {
    "es-419": (
        "v1.2.8 — Evolución SOAP en Consulta, Cierre Clínico y Estabilidad RLS\n\n"
        "• Evolución clínica SOAP interactiva integrada en videollamada con selector CIE-10\n"
        "• Vinculación atómica en equipo de atención médica y resolución de permisos RLS\n"
        "• Cierre automatizado de sala y sincronización de estado de consulta en base de datos\n"
        "• Hoja de notas y registro clínico en tiempo real sin salir de la videollamada\n"
        "• Optimizaciones críticas de rendimiento WebRTC y compatibilidad del sistema"
    ),
    "en-US": (
        "v1.2.8 — In-Call SOAP Evolution, Clinical Closing and RLS Stability\n\n"
        "• In-call interactive SOAP clinical evolution with ICD-10 diagnosis picker\n"
        "• Atomic care team linking resolving database RLS permissions\n"
        "• Automated room closure and real-time consultation state synchronization\n"
        "• Real-time clinical notes and documentation directly from the video call\n"
        "• Critical WebRTC performance optimizations and system stability"
    ),
}

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not SERVICE_ACCOUNT_FILE.exists():
        print(f"ERROR: Service account not found at {SERVICE_ACCOUNT_FILE}")
        sys.exit(1)

    if not AAB_PATH.exists():
        print(f"ERROR: AAB not found at {AAB_PATH}")
        print("Run: ./gradlew bundleRelease")
        sys.exit(1)

    aab_size_mb = AAB_PATH.stat().st_size / 1024 / 1024
    print(f"✓ AAB encontrado: {AAB_PATH.name} ({aab_size_mb:.1f} MB)")

    # Auth
    credentials = service_account.Credentials.from_service_account_file(
        str(SERVICE_ACCOUNT_FILE), scopes=SCOPES
    )
    service = build("androidpublisher", "v3", credentials=credentials)
    edits = service.edits()

    # 1. Create edit
    print(f"\n📦 Creando edit para {PACKAGE_NAME}...")
    edit = edits.insert(packageName=PACKAGE_NAME, body={}).execute()
    edit_id = edit["id"]
    print(f"   Edit ID: {edit_id}")

    try:
        # 2. Upload AAB
        print(f"\n⬆️  Subiendo AAB a Play Store ({aab_size_mb:.1f} MB)...")
        media = MediaFileUpload(
            str(AAB_PATH),
            mimetype="application/octet-stream",
            resumable=True,
            chunksize=5 * 1024 * 1024,  # 5 MB chunks
        )
        upload = edits.bundles().upload(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            media_body=media,
        )

        response = None
        while response is None:
            status, response = upload.next_chunk()
            if status:
                pct = int(status.progress() * 100)
                print(f"   Progreso: {pct}%", end="\r")

        version_code = response["versionCode"]
        print(f"\n   ✓ AAB subido — versionCode: {version_code}")

        # 3. Assign to internal track
        print(f"\n🎯 Asignando al track '{TRACK}'...")
        track_body = {
            "track": TRACK,
            "releases": [
                {
                    "name": f"AutaMedica {VERSION_NAME}",
                    "versionCodes": [version_code],
                    "status": "completed",
                    "releaseNotes": [
                        {"language": lang, "text": text}
                        for lang, text in RELEASE_NOTES.items()
                    ],
                }
            ],
        }
        edits.tracks().update(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            track=TRACK,
            body=track_body,
        ).execute()
        print(f"   ✓ Asignado a {TRACK}")

        # 4. Commit edit
        print("\n✅ Commiteando edit...")
        result = edits.commit(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            changesNotSentForReview=True,
        ).execute()
        print(f"   ✓ Edit commiteado: {result.get('id', edit_id)}")

        print(f"\n🚀 AutaMedica v{VERSION_NAME} (versionCode {version_code}) publicado en Play Store [{TRACK}]")
        print(f"   https://play.google.com/console/u/0/developers/apps")

    except Exception as e:
        print(f"\n❌ Error durante upload — abortando edit: {e}")
        try:
            edits.delete(packageName=PACKAGE_NAME, editId=edit_id).execute()
            print("   Edit eliminado correctamente.")
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
