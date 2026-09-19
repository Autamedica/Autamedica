#!/usr/bin/env python3
"""
Subir AAB directamente a track PRODUCTION y commitear.
Uso: python3 upload_production_direct.py
"""
import json
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

# ─── CONFIG ───
SERVICE_ACCOUNT_FILE = Path("/home/edu/.android-secrets/autamedica-play-store-service-account.json")
PACKAGE_NAME = "com.autamedica.android"
AAB_PATH = Path(__file__).parent / "app/build/outputs/bundle/release/app-release.aab"
VERSION_CODE = 23
VERSION_NAME = "1.2.13"
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

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

def main():
    print(f"📦 Subiendo {AAB_PATH.name} (versionCode {VERSION_CODE}, versionName {VERSION_NAME}) a PRODUCTION...")
    
    # 1. Autenticación
    creds = service_account.Credentials.from_service_account_file(str(SERVICE_ACCOUNT_FILE), scopes=SCOPES)
    service = build("androidpublisher", "v3", credentials=creds)
    edits = service.edits()
    
    # 2. Crear edit
    edit = edits.insert(packageName=PACKAGE_NAME, body={}).execute()
    edit_id = edit["id"]
    print(f"   ✓ Edit creado: {edit_id}")
    
    try:
        # 3. Subir AAB
        print(f"   ⬆ Subiendo AAB ({AAB_PATH.stat().st_size / 1024 / 1024:.1f} MB)...")
        media = MediaFileUpload(str(AAB_PATH), mimetype="application/octet-stream", resumable=True)
        bundle_resp = edits.bundles().upload(
            packageName=PACKAGE_NAME, editId=edit_id, media_body=media
        ).execute()
        uploaded_version_code = bundle_resp["versionCode"]
        print(f"   ✓ AAB subido: versionCode {uploaded_version_code}")
        
        if uploaded_version_code != VERSION_CODE:
            raise ValueError(f"VersionCode mismatch: esperado {VERSION_CODE}, subido {uploaded_version_code}")
        
        # 4. Actualizar track PRODUCTION
        print(f"   📝 Actualizando track PRODUCTION...")
        track_body = {
            "releases": [{
                "name": f"{VERSION_CODE} ({VERSION_NAME})",
                "versionCodes": [str(VERSION_CODE)],
                "status": "completed",
                "releaseNotes": [{"language": lang, "text": text} for lang, text in RELEASE_NOTES.items()],
            }]
        }
        edits.tracks().update(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            track="production",
            body=track_body
        ).execute()
        print(f"   ✓ Track PRODUCTION actualizado con release notes")
        
        # 5. Commitear edit
        print(f"   ✅ Commiteando edit...")
        commit_resp = edits.commit(
            packageName=PACKAGE_NAME,
            editId=edit_id
        ).execute()
        print(f"   ✓ Edit commiteado: {commit_resp.get('id', edit_id)}")
        
        # 6. Validar resultado
        print(f"   🔍 Validando en Play Store...")
        val_edit = edits.insert(packageName=PACKAGE_NAME, body={}).execute()
        val_id = val_edit["id"]
        try:
            t = edits.tracks().get(packageName=PACKAGE_NAME, editId=val_id, track="production").execute()
            for r in t.get("releases", []):
                vc = r.get("versionCodes")
                status = r.get("status")
                name = r.get("name")
                print(f"      Track: production | Release: {name} | versionCodes: {vc} | status: {status}")
                if vc and str(VERSION_CODE) in vc:
                    print(f"\n🎉 ÉXITO: v{VERSION_NAME} (code {VERSION_CODE}) está EN PRODUCCIÓN (status: {status})")
                    return 0
        finally:
            try:
                edits.delete(packageName=PACKAGE_NAME, editId=val_id).execute()
            except Exception:
                pass
        
        print(f"\n⚠️ ADVERTENCIA: Release subido pero no se encontró en track production")
        return 1
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        # Intentar limpiar edit
        try:
            edits.delete(packageName=PACKAGE_NAME, editId=edit_id).execute()
            print(f"   🧹 Edit descartado")
        except:
            pass
        raise
    finally:
        # Verificación final fuera del edit (consulta pública)
        try:
            service2 = build("androidpublisher", "v3", credentials=creds)
            edits2 = service2.edits()
            edit2 = edits2.insert(packageName=PACKAGE_NAME, body={}).execute()
            t = edits2.tracks().get(packageName=PACKAGE_NAME, editId=edit2["id"], track="production").execute()
            edits2.delete(packageName=PACKAGE_NAME, editId=edit2["id"]).execute()
            print(f"\n📋 Estado FINAL en PRODUCTION:")
            for r in t.get("releases", []):
                print(f"      {r.get('name')} | v{r.get('versionCodes')} | {r.get('status')}")
        except Exception as ve:
            print(f"   (Validación post-commit falló: {ve})")

if __name__ == "__main__":
    exit(main())
