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
AAB_PATH = Path(__file__).parent / "app/build/outputs/bundle/release/app-release.aab"
PACKAGE_NAME = "com.autamedica.android"
TRACK = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ["internal", "alpha", "beta", "production"] else "internal"
VERSION_NAME = "1.2.13"

RELEASE_NOTES = {
    "es-419": (
        "v1.2.13 — Consultas Exprés en Farmacia Bajo Demanda e Identidad Institucional\n\n"
        "• Atención médica inmediata en mostrador de farmacias asociadas\n"
        "• Guardia médica activa con cola de espera y notificación en tiempo real\n"
        "• Identidad visual oficial AutaMedica con contenedor biocerámico y sello de confianza\n"
        "• Sellos regulatorios de receta digital y validación SISA / REFEPS\n"
        "• Optimizaciones de estabilidad en videollamada y enlaces directos App Links"
    ),
    "en-US": (
        "v1.2.13 — On-Demand Pharmacy Express Consultations and Institutional Identity\n\n"
        "• Immediate medical attention at partner pharmacy counters\n"
        "• Active on-duty medical queue with real-time notifications\n"
        "• Official AutaMedica visual identity with bioceramic container and trust badges\n"
        "• Regulatory digital prescription compliance and SISA / REFEPS validation\n"
        "• Video call stability optimizations and verified App Links"
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
