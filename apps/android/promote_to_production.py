#!/usr/bin/env python3
"""
Promueve AutaMedica v1.2.1 (versionCode 11) de internal → production al 100%.
"""

import sys
from pathlib import Path
from googleapiclient.discovery import build
from google.oauth2 import service_account

SERVICE_ACCOUNT_FILE = Path("/home/edu/.android-secrets/autamedica-play-store-service-account.json")
PACKAGE_NAME = "com.autamedica.android"
VERSION_CODE = 14
VERSION_NAME = "1.2.4"

RELEASE_NOTES = {
    "es-419": (
        "v1.2.4 — WebRTC Nativo, Sistema de Llamadas Entrantes, Android 16\n\n"
        "• Sistema de videollamadas WebRTC nativo (sin LiveKit)\n"
        "• Notificaciones de llamadas entrantes con pantalla completa y timbrado\n"
        "• Sala de espera optimizada: botón manual para llamar y cancelar\n"
        "• Corrección de control de llamada y finalización de audio/video\n"
        "• Protección ante swipe en Android 14+ (silencia al descartar)\n"
        "• Compatibilidad total con Android 16 (Target SDK 36)\n"
        "• Mejoras de estabilidad y rendimiento en telemedicina"
    ),
    "en-US": (
        "v1.2.4 — Native WebRTC, Incoming Call System, Android 16\n\n"
        "• Native WebRTC video calling (LiveKit removed)\n"
        "• Full-screen incoming call notifications with ringtone and vibration\n"
        "• Optimized waiting room: manual call and cancel controls\n"
        "• Fixed call termination and media controls\n"
        "• Swipe-to-dismiss protection on Android 14+ (silences on dismiss)\n"
        "• Full compatibility with Android 16 (Target SDK 36)\n"
        "• Stability and performance improvements in telemedicine"
    ),
}

SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

def main():
    credentials = service_account.Credentials.from_service_account_file(
        str(SERVICE_ACCOUNT_FILE), scopes=SCOPES
    )
    service = build("androidpublisher", "v3", credentials=credentials)
    edits = service.edits()

    print(f"📦 Creando edit para {PACKAGE_NAME}...")
    edit = edits.insert(packageName=PACKAGE_NAME, body={}).execute()
    edit_id = edit["id"]
    print(f"   Edit ID: {edit_id}")

    try:
        # Verificar que el versionCode existe en internal antes de promover
        print(f"\n🔍 Verificando versionCode {VERSION_CODE} en internal...")
        internal = edits.tracks().get(
            packageName=PACKAGE_NAME, editId=edit_id, track="internal"
        ).execute()
        codes = [
            vc
            for r in internal.get("releases", [])
            for vc in r.get("versionCodes", [])
        ]
        if VERSION_CODE not in [int(c) for c in codes]:
            print(f"   ⚠️  versionCode {VERSION_CODE} no encontrado en internal. Disponibles: {codes}")
            print("   Continuando de todas formas (puede ya estar en otro track)...")
        else:
            print(f"   ✓ versionCode {VERSION_CODE} confirmado en internal")

        # Asignar a production al 100%
        print(f"\n🚀 Publicando en production (100%)...")
        track_body = {
            "track": "production",
            "releases": [
                {
                    "name": f"AutaMedica {VERSION_NAME}",
                    "versionCodes": [VERSION_CODE],
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
            track="production",
            body=track_body,
        ).execute()
        print("   ✓ Asignado a production")

        # Commit (con changesNotSentForReview=True para que Play Console lo acepte aunque haya rechazo o publicación administrada)
        print("\n✅ Commiteando edit...")
        result = edits.commit(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            changesNotSentForReview=True,
        ).execute()
        print(f"   ✓ Edit commiteado: {result.get('id', edit_id)}")

        print(f"\n🎉 AutaMedica v{VERSION_NAME} (versionCode {VERSION_CODE}) EN PRODUCCIÓN al 100%")
        print("   https://play.google.com/console/u/0/developers/apps")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        try:
            edits.delete(packageName=PACKAGE_NAME, editId=edit_id).execute()
            print("   Edit eliminado.")
        except Exception:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()
