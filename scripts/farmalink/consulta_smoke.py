#!/usr/bin/env python3
"""Read-only consultation smoke test for Farmalink Sandbox v3.

Uses vendor TEST credential 7100/12345678 and a deliberately unassigned
recipe number 0000000000000. Never sends altaReceta or bajaReceta.
No patient data, tokens, response bodies or secrets are logged.
"""
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

HOST = "https://test-servicios.farmalink.com.ar"
TOKEN_URL = HOST + "/api/oauth/token/generate"
QUERY_URL = HOST + "/api/recetaElect/v3/consultaReceta"
RECIPE_NUMBER = "0000000000000"


class DenyRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


opener = urllib.request.build_opener(DenyRedirects())


def post(url, payload, headers, timeout=30):
    req = urllib.request.Request(url, data=payload, method="POST", headers=headers)
    try:
        with opener.open(req, timeout=timeout) as rsp:
            return rsp.status, rsp.read(8192)
    except urllib.error.HTTPError as error:
        return error.code, error.read(8192)


def safe_field(value):
    if not isinstance(value, (str, int, float)):
        return ""
    return re.sub(r"[^A-Za-zÀ-ÿ0-9 _.,:/()-]", "", str(value))[:110]


def main():
    if not (os.getenv("FARMALINK_TEST_OAUTH_PASSWORD") and os.getenv("FARMALINK_TEST_BASIC_PASSWORD")):
        print("RESULT=NOT_CONFIGURED")
        return 2

    basic = base64.b64encode(
        ("AUTAMEDICAClient:" + os.environ["FARMALINK_TEST_BASIC_PASSWORD"]).encode()
    ).decode()

    auth_headers = {
        "Authorization": "Basic " + basic,
        "grant_type": "PASSWORD",
        "username": "autamedica.ws182",
        "password": os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
        "scope": "Switch.RecetaElectRest",
        "Accept": "application/json",
    }

    try:
        token_status, token_body = post(TOKEN_URL, b"", auth_headers, timeout=22)
        if token_status != 200:
            print(f"TOKEN_HTTP_STATUS={token_status}")
            print("RESULT=TOKEN_REJECTED")
            return 3
        token = json.loads(token_body)["access_token"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"RESULT=TOKEN_ERROR:{type(exc).__name__}")
        return 3

    print("TOKEN_OBTAINED=YES")
    payload = {
        "consultaRecetaElectRq": {
            "infoCabeceraRq": {"idOrganizacion": "100", "tipoOrganizacion": "NMD"},
            "recElectronica": {
                "afiliado": {"codEntidad": 7100, "pan": "12345678"},
                "receta": {"nroRecElectronica": RECIPE_NUMBER},
            },
        }
    }

    start = time.monotonic()
    try:
        status, body = post(
            QUERY_URL,
            json.dumps(payload, separators=(",", ":")).encode(),
            {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=38,
        )
    except (OSError, TimeoutError) as exc:
        print(f"CONSULTA_ERROR={type(exc).__name__}")
        print("RESULT=CONSULTA_NO_RESPONSE")
        print("MUTATING_OPERATIONS=0")
        return 4

    print(f"CONSULTA_HTTP_STATUS={status}")
    print(f"CONSULTA_LATENCY_SECONDS={time.monotonic()-start:.1f}")
    try:
        result = json.loads(body)
        if not isinstance(result, dict):
            raise ValueError("not an object")
        for root in ("consultaRecetaElectRs", "error"):
            item = result.get(root)
            if not isinstance(item, dict):
                continue
            if root == "consultaRecetaElectRs":
                item = item.get("respuesta", {})
            elif root == "error":
                item = item.get("errorInterno", {})
            if isinstance(item, dict):
                print("VENDOR_CODE=" + safe_field(item.get("codigo")))
                print("VENDOR_DESCRIPTION=" + safe_field(item.get("descripcion")))
        print("CONSULTA_JSON=VALID")
    except (ValueError, TypeError, UnicodeError):
        print("CONSULTA_JSON=UNRECOGNIZED")
    print("MUTATING_OPERATIONS=0")
    print("RESULT=CONSULTA_RESPONDED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
