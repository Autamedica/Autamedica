#!/usr/bin/env python3
"""TikTok OAuth 2.0 helper con PKCE — captura code via local server y lo intercambia por tokens.

Uso:
  python3 scripts/tiktok-oauth.py
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import sys
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
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


def save_env(updates: dict) -> None:
    lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    existing = {i: line.split("=", 1)[0] for i, line in enumerate(lines) if "=" in line and not line.startswith("#")}

    for k, v in updates.items():
        idx = next((i for i, name in existing.items() if name == k), None)
        new_line = f"{k}={v}"
        if idx is not None:
            lines[idx] = new_line
        else:
            lines.append(new_line)

    ENV_PATH.write_text("\n".join(lines) + "\n")


env = load_env()
CLIENT_KEY = env.get("TIKTOK_CLIENT_KEY")
CLIENT_SECRET = env.get("TIKTOK_CLIENT_SECRET")
if not CLIENT_KEY or not CLIENT_SECRET:
    sys.exit("TIKTOK_CLIENT_KEY / SECRET no estan en .env")

# Configuración PKCE (Requerido obligatoriamente por TikTok OAuth v2)
# Generar un code_verifier de alta entropía
CODE_VERIFIER = secrets.token_urlsafe(64)
# Calcular el challenge usando SHA-256
sha256_hash = hashlib.sha256(CODE_VERIFIER.encode("utf-8")).digest()
CODE_CHALLENGE = base64.urlsafe_b64encode(sha256_hash).decode("utf-8").replace("=", "")

REDIRECT_URI = "http://localhost:8888/callback"
SCOPE = "user.info.basic"
STATE = secrets.token_urlsafe(16)

auth_url = (
    "https://www.tiktok.com/v2/auth/authorize/?"
    + urllib.parse.urlencode({
        "client_key": CLIENT_KEY,
        "scope": SCOPE,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "state": STATE,
        "code_challenge": CODE_CHALLENGE,
        "code_challenge_method": "S256",
    })
)

captured: dict[str, str] = {}


class CallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args, **_kwargs):
        pass

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return

        qs = dict(urllib.parse.parse_qsl(parsed.query))
        captured.update(qs)

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        ok = "code" in qs and qs.get("state") == STATE
        msg = "✓ Auth OK — podes cerrar esta pestaña." if ok else f"✗ Error: {qs}"
        self.wfile.write(f"<html><body style='font:16px system-ui;padding:40px'><h2>{msg}</h2></body></html>".encode())


def exchange_code(code: str) -> dict:
    data = urllib.parse.urlencode({
        "client_key": CLIENT_KEY,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
        "code_verifier": CODE_VERIFIER,  # PKCE verifier enviado en el intercambio
    }).encode()
    req = request.Request(
        "https://open.tiktokapis.com/v2/oauth/token/",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except error.HTTPError as e:
        sys.exit(f"Token exchange HTTP {e.code}: {e.read().decode()}")


def main() -> int:
    print(f"\n=== TikTok OAuth helper (con PKCE) ===\n")
    print(f"1. Abri esta URL en tu browser:\n")
    print(f"   {auth_url}\n")
    print(f"   (intentando abrir automatico...)")

    try:
        webbrowser.open(auth_url)
    except Exception:
        pass

    print(f"\n2. Esperando redirect a {REDIRECT_URI} ...")

    server = HTTPServer(("127.0.0.1", 8888), CallbackHandler)
    while "code" not in captured:
        server.handle_request()

    if captured.get("state") != STATE:
        sys.exit("✗ state mismatch — posible CSRF")

    print(f"✓ Code capturado (len={len(captured['code'])})")

    print("\n3. Intercambiando code por tokens...")
    tokens = exchange_code(captured["code"])
    
    data = tokens.get("data", tokens)
    
    if "access_token" not in data:
        sys.exit(f"✗ error: {tokens}")

    print(f"   access_token  ...{data['access_token'][-6:]}  (expires in {data.get('expires_in','?')}s)")
    if "refresh_token" in data:
        print(f"   refresh_token ...{data['refresh_token'][-6:]}")

    # Guardar en .env
    updates = {"TIKTOK_ACCESS_TOKEN": data["access_token"]}
    if "refresh_token" in data:
        updates["TIKTOK_REFRESH_TOKEN"] = data["refresh_token"]
    save_env(updates)

    print(f"\n✓ Guardado en .env: {', '.join(updates.keys())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
