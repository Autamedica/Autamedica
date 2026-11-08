#!/usr/bin/env python3
"""Prepare a signed Android release using CircleCI context variables only.

Fails closed when any production input is absent. Never used by opt-in synthetic CI.
"""
import base64
import binascii
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse


def required(name: str) -> str:
    value = os.environ.get(name, "")
    if not value.strip() or "\n" in value or "\r" in value:
        raise SystemExit(f"Missing or invalid release variable: {name}")
    if "placeholder" in value.lower() or value.strip().lower().startswith("dummy"):
        raise SystemExit(f"Test placeholder cannot be used for release: {name}")
    return value


def main() -> None:
    root = Path("apps/android")
    if not (root / "gradlew").exists():
        raise SystemExit("Run release preparation from repository root")

    url = required("AUTAMEDICA_SUPABASE_URL")
    if urlparse(url).scheme != "https":
        raise SystemExit("Production SUPABASE_URL must be HTTPS")

    anon_key = required("AUTAMEDICA_SUPABASE_ANON_KEY")
    web_client_id = required("AUTAMEDICA_GOOGLE_WEB_CLIENT_ID")
    required("AUTAMEDICA_RELEASE_STORE_PASSWORD")
    required("AUTAMEDICA_RELEASE_KEY_ALIAS")
    required("AUTAMEDICA_RELEASE_KEY_PASSWORD")
    upload_sha = required("AUTAMEDICA_UPLOAD_CERT_SHA256").replace(":", "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", upload_sha):
        raise SystemExit("Invalid expected Google Play upload certificate SHA-256")

    try:
        raw = base64.b64decode(required("AUTAMEDICA_RELEASE_KEYSTORE_BASE64"), validate=True)
    except (ValueError, binascii.Error):
        raise SystemExit("Release keystore is not valid base64") from None
    if len(raw) < 256:
        raise SystemExit("Invalid or suspiciously short release keystore")

    try:
        google = json.loads(required("AUTAMEDICA_GOOGLE_SERVICES_JSON"))
    except json.JSONDecodeError:
        raise SystemExit("GOOGLE_SERVICES_JSON is not valid JSON") from None

    matches_package = any(
        client.get("client_info", {}).get("android_client_info", {}).get("package_name")
        == "com.autamedica.android"
        for client in google.get("client", [])
    )
    if not matches_package:
        raise SystemExit("Firebase configuration does not target com.autamedica.android")

    keystore = root / "autamedica-release.keystore"
    keystore.write_bytes(raw)
    keystore.chmod(0o600)
    certificate = subprocess.run(
        [
            "keytool", "-exportcert",
            "-keystore", str(keystore),
            "-alias", required("AUTAMEDICA_RELEASE_KEY_ALIAS"),
            "-storepass:env", "AUTAMEDICA_RELEASE_STORE_PASSWORD",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if certificate.returncode != 0 or not certificate.stdout:
        raise SystemExit("Cannot read release keystore upload certificate")
    if hashlib.sha256(certificate.stdout).hexdigest() != upload_sha:
        raise SystemExit("Release keystore does not match Google Play upload certificate SHA-256")
    services = root / "app" / "google-services.json"
    services.write_text(json.dumps(google), encoding="utf-8")
    services.chmod(0o600)

    sdk_home = os.environ.get("ANDROID_HOME", "")
    if not sdk_home:
        raise SystemExit("Missing ANDROID_HOME in CircleCI Android executor")
    lines = [
        f"sdk.dir={sdk_home}",
        f"SUPABASE_URL={url}",
        f"SUPABASE_ANON_KEY={anon_key}",
        f"GOOGLE_WEB_CLIENT_ID={web_client_id}",
        "RELEASE_STORE_FILE=../autamedica-release.keystore",
    ]
    props = root / "local.properties"
    props.write_text("\n".join(lines) + "\n", encoding="utf-8")
    props.chmod(0o600)
    print("Google Play upload certificate verified; production app config prepared; secrets not logged")


if __name__ == "__main__":
    main()
