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
VERSION_NAME = "1.2.16"

RELEASE_NOTES = {
    "es-419": (
        "v1.2.16 — Localización Integral en Portugués y Guardia en Farmacia\n\n"
        "• Experiencia 100% localizada en portugués para Brasil en todos los portales\n"
        "• Atención médica inmediata en mostrador de farmacias de turno asociadas\n"
        "• Radar de guardia médica en vivo con telemetría en tiempo real\n"
        "• Recetas electrónicas, agenda de turnos y perfil totalmente internacionalizados\n"
        "• Compatibilidad nativa Android 15 con Target SDK 35"
    ),
    "pt-BR": (
        "v1.2.16 — Tradução Integral para Português e Atendimento em Farmácia\n\n"
        "• Experiência 100% localizada em português para todo o Brasil\n"
        "• Atendimento médico imediato em balcão de farmácias de plantão parceiras\n"
        "• Radar de plantão médico ao vivo com telemetria em tempo real\n"
        "• Receitas digitais, agenda de consultas e perfil totalmente em português\n"
        "• Compatibilidade nativa Android 15 com Target SDK 35"
    ),
    "en-US": (
        "v1.2.16 — Full Portuguese Localization & Pharmacy On-Demand\n\n"
        "• 100% Portuguese localized experience across all patient & clinical portals\n"
        "• Immediate on-demand medical care at partner pharmacy counters\n"
        "• Live medical duty presence radar with real-time dispatch\n"
        "• Electronic prescriptions, appointments, and profile fully localized\n"
        "• Native Android 15 compatibility with Target SDK 35"
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

        import socket
        socket.setdefaulttimeout(300)

        response = None
        retries = 0
        while response is None:
            try:
                status, response = upload.next_chunk(num_retries=5)
                if status:
                    pct = int(status.progress() * 100)
                    print(f"   Progreso: {pct}%", end="\r", flush=True)
            except (socket.timeout, TimeoutError) as te:
                retries += 1
                if retries > 5:
                    raise te
                print(f"\n   Reintentando tras timeout en fragmento ({retries}/5)...")
                time.sleep(5)

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
        commit_kwargs = {}
        if TRACK != "production":
            commit_kwargs["changesNotSentForReview"] = True
        result = edits.commit(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            **commit_kwargs,
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
