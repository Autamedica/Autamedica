#!/usr/bin/env python3
"""Non-mutating negative contract tests against Farmalink TEST.

Only malformed requests missing the complete prescription/receta reference are
submitted. It is impossible to create or cancel a valid prescription from
these payloads. OAuth credential values and token are never logged.
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://test-servicios.farmalink.com.ar"
TOKEN_URL = BASE + "/api/oauth/token/generate"
API_BASE = BASE + "/api/recetaElect/v3"


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)


OPENER = urllib.request.build_opener(NoRedirects())


def post(path: str, headers: dict, data: bytes, timeout=26):
    req = urllib.request.Request(path, data=data, headers=headers, method="POST")
    started = time.monotonic()
    try:
        with OPENER.open(req, timeout=timeout) as res:
            return res.status, res.read(8192), round(time.monotonic()-started,1)
    except urllib.error.HTTPError as error:
        return error.code, error.read(8192), round(time.monotonic()-started,1)


def format_error(body):
    try:
        obj = json.loads(body)
        err = obj.get("error", {}) if isinstance(obj,dict) else {}
        nested = err.get("errorInterno", {}) if isinstance(err,dict) else {}
        return str(nested.get("codigo") or err.get("codigo") or "") if isinstance(nested,dict) else ""
    except (ValueError, TypeError):
        return ""


def main():
    if not (os.environ.get("FARMALINK_TEST_OAUTH_PASSWORD") and os.environ.get("FARMALINK_TEST_BASIC_PASSWORD")):
        print("RESULT=NOT_CONFIGURED")
        return 2
    creds = base64.b64encode(
        ("AUTAMEDICAClient:" + os.environ["FARMALINK_TEST_BASIC_PASSWORD"]).encode("utf-8")
    ).decode("ascii")
    try:
        status, data, duration = post(TOKEN_URL, {
            "Authorization": "Basic " + creds,
            "grant_type": "PASSWORD",
            "username": "autamedica.ws182",
            "password": os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
            "scope": "Switch.RecetaElectRest",
            "Accept": "application/json",
        }, b"", 22)
        if status != 200:
            print("AUTH_HTTP=" + str(status))
            return 3
        token = json.loads(data)["access_token"]
    except (OSError,ValueError,KeyError,TypeError) as ex:
        print("RESULT=AUTH_FAILED_" + type(ex).__name__)
        return 3

    print("AUTH_RESULT=PASS")
    print("TEST_HOST_ONLY=YES")
    bearer={"Authorization":"Bearer "+token, "Content-Type":"application/json", "Accept":"application/json"}

    # Strictly incomplete requests: no medico, affiliate, medication, number, or item.
    cases=[
        ("altaReceta", {"altaRecetaElectRq":{"infoCabeceraRq":{"idOrganizacion":"100"}}}),
        ("consultaReceta", {"consultaRecetaElectRq":{"infoCabeceraRq":{}}}),
        ("bajaReceta", {"bajaRecetaElectRq":{"infoCabeceraRq":{}}}),
    ]
    failures=0
    for operation, body in cases:
        try:
            http, reply, elapsed=post(API_BASE+"/"+operation,bearer,
                json.dumps(body,separators=(",",":")).encode("utf-8"),timeout=28)
            print(operation.upper()+"_HTTP="+str(http))
            print(operation.upper()+"_LATENCY_S="+str(elapsed))
            print(operation.upper()+"_VENDOR_ERROR_CODE="+format_error(reply))
            if http != 400:
                print(operation.upper()+"_RESULT=UNEXPECTED_RESPONSE")
                failures+=1
            else:
                print(operation.upper()+"_RESULT=EXPECTED_FORMAT_REJECTION")
        except (OSError,TimeoutError) as ex:
            print(operation.upper()+"_ERROR="+type(ex).__name__)
            failures+=1
    print("PATIENT_IDENTIFIERS_SENT=0")
    print("MEDICATIONS_SENT=0")
    print("PRESCRIPTION_REFERENCES_SENT=0")
    print("VALID_ALTA_OR_BAJA_SENT=0")
    print("RESULT="+("PASS" if failures==0 else "PARTIAL_FAIL"))
    return 0 if failures==0 else 4


if __name__ == "__main__":
    sys.exit(main())
