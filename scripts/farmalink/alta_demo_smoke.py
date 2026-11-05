#!/usr/bin/env python3
"""Farmalink sandbox-only altaReceta test using the vendor's published DEMO example.

This intentionally creates, at most, one DEMO prescription in TEST, never production.
No real patient/physician data and no confidential response payloads are printed.
"""
import base64
from datetime import datetime, timedelta
import json
import os
import re
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

HOST = "https://test-servicios.farmalink.com.ar"
TOKEN_URL = HOST + "/api/oauth/token/generate"
ALTA_URL = HOST + "/api/recetaElect/v3/altaReceta"


class DenyRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


opener = urllib.request.build_opener(DenyRedirects())


def request(url, *, headers, payload):
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with opener.open(req, timeout=22) as rsp:
            return rsp.status, rsp.read(65536)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(65536)


def safe(value):
    """Avoid disclosing backend content, names or patient data in public CI logs."""
    return re.sub(r"[^A-Za-zÀ-ÿ0-9 _.,:()/-]", "", str(value or ""))[:140]


def demo_payload():
    # Based on SwaggerHub DEMO; organization and affiliate credentials were
    # corrected from Farmalink's response on 2026-11-03. Vendor consultaReceta for test numbers 9600000421228 and 9600000421242
    # confirmed codDroga 01033 = GLICOLICOAC.ASOC. and codProducto 56800 =
    # ESFUMEL blanqueadora cr. x 20 g (read-only workflow 41717111174).
    # Other DEMO fields remain unverified and must be reviewed before clinical use.
    today = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).date()
    return {
        "altaRecetaElectRq": {
            "infoCabeceraRq": {
                "idOrganizacion": "182",
                "tipoOrganizacion": "NMD",
                "ipOrigen": "8.8.8.8",
                "infoBrowser": "Mozilla/5.0",
            },
            "recElectronica": {
                "tipoReceta": "1",
                "fechaVigenciaDesde": today.isoformat(),
                "fechaVigenciaHasta": (today + timedelta(days=16)).isoformat(),
                "tipoTratamiento": "P",
                "afiliado": {
                    "nombre": "Demo",
                    "apellido": "Demo",
                    "sexo": "M",
                    "fechaNacimiento": "2025-01-01",
                    "cuil": 27123456780,
                    "mail": "Demo@gmail.com",
                    "tipoDocumento": "DN",
                    "numeroDocumento": 12345678,
                    "datosOfuscado": "N",
                    "credencial": {
                        "codEntidad": 7110,
                        "pan": "20123456786",
                        "plan": "100",
                        "token": "123456",
                    },
                },
                "medico": {
                    "nombre": "Demo",
                    "apellido": "Demo",
                    "sexo": "M",
                    "fechaNacimiento": "1980-01-01",
                    "cuil": 27123456780,
                    "mail": "Demo@gmail.com",
                    "tipoDocumento": "DN",
                    "numeroDocumento": 12345678,
                    "firma": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAB10l...",
                    "domicilioAtencion": "Consultorio particular CALLE 11 Nro 2300",
                    "codigoReFeps": 123456789012,
                    "matricula": {
                        "tipo": "MN",
                        "provincia": "S",
                        "numero": 11111,
                        "especialidad": {"textoLibre": "MedicoClinico"},
                        "asociada": {"tipo": "MN", "provincia": "C", "numero": 11111},
                    },
                },
                "diagnostico": {"clasificador": 10, "codigo": "I20.9"},
                "detalleRecElectronica": {
                    "item": [{
                        "cantidad": 10,
                        "codProducto": "56800",
                        "codDroga": "01033",
                        "textoGenerico": "GLICOLICOAC.ASOC.",
                        "generico": "N",
                        "recomendacionMedica": "S",
                        "ciclos": 1,
                        "autorizacion": {"id": 123455, "cantidad": 5, "porcentaje": 1},
                    }]
                },
            },
        }
    }


def main():
    # The prior TEST DEMO alta results were ambiguous (timeout / gateway 504).
    # Block all new mutating calls until both have been reconciled with Farmalink.
    if os.getenv("FARMALINK_DEMO_RECONCILED") != "yes":
        print("RESULT=BLOCKED_PENDING_DEMO_RECONCILIATION")
        return 6
    if not (os.getenv("FARMALINK_TEST_OAUTH_PASSWORD") and os.getenv("FARMALINK_TEST_BASIC_PASSWORD")):
        print("RESULT=NOT_CONFIGURED")
        return 2
    basic = base64.b64encode(
        ("AUTAMEDICAClient:" + os.environ["FARMALINK_TEST_BASIC_PASSWORD"]).encode()
    ).decode()
    try:
        token_status, token_bytes = request(
            TOKEN_URL,
            headers={
                "Authorization": "Basic " + basic,
                "grant_type": "PASSWORD",
                "username": "autamedica.ws182",
                "password": os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
                "scope": "Switch.RecetaElectRest",
                "Accept": "application/json",
            },
            payload=b"",
        )
        token_json = json.loads(token_bytes)
    except (OSError, ValueError, UnicodeError) as exc:
        print(f"RESULT=TOKEN_FAILURE:{type(exc).__name__}")
        return 3
    if token_status != 200 or not isinstance(token_json, dict) or not token_json.get("access_token"):
        print(f"TOKEN_HTTP_STATUS={token_status}")
        print("RESULT=TOKEN_REJECTED")
        return 3
    print("TOKEN_HTTP_STATUS=200")
    print("TOKEN_OBTAINED=YES")
    try:
        status, response_bytes = request(
            ALTA_URL,
            headers={
                "Authorization": "Bearer " + token_json["access_token"],
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            payload=json.dumps(demo_payload(), separators=(",", ":")).encode(),
        )
        response = json.loads(response_bytes)
    except (OSError, ValueError, UnicodeError) as exc:
        print(f"RESULT=ALTA_TRANSPORT_OR_FORMAT_FAILURE:{type(exc).__name__}")
        return 4
    print(f"ALTA_HTTP_STATUS={status}")
    if not isinstance(response, dict):
        print("RESULT=ALTA_UNEXPECTED_RESPONSE")
        return 5
    obj = response.get("altaRecetaElectRs")
    if isinstance(obj, dict):
        answer = obj.get("respuesta", {})
        if not isinstance(answer, dict):
            answer = {}
        code = str(answer.get("codigo") or "")
        print("ALTA_VENDOR_CODE=" + safe(code))
        print("ALTA_VENDOR_DESCRIPTION=" + safe(answer.get("descripcion")))
        if status == 200 and code in {"00", "0"}:
            item = obj.get("recElectronica", {})
            receipt = str(item.get("nroRecElectronica", "") if isinstance(item, dict) else "")
            print("RESULT=TEST_ALTA_APPROVED")
            print("TEST_PRESCRIPTION_REFERENCE=" + safe(receipt))
            print("PRODUCTION_PRESCRIPTIONS_SENT=0")
            return 0
        print("RESULT=TEST_ALTA_REJECTED")
        return 5
    err = response.get("error", {})
    if isinstance(err, dict):
        internal = err.get("errorInterno", {})
        if isinstance(internal, dict):
            print("ALTA_INTERNAL_CODE=" + safe(internal.get("codigo")))
            print("ALTA_INTERNAL_DESCRIPTION=" + safe(internal.get("descripcion")))
    print("RESULT=TEST_ALTA_HTTP_REJECTED")
    return 5


if __name__ == "__main__":
    sys.exit(main())
