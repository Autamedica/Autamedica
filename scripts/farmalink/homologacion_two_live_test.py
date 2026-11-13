#!/usr/bin/env python3
"""Two one-shot Farmalink TEST homologation attempts, authorized 2026-11-03.

This is never production. No real patient or provider identifiers. Only create
a PDF after actual provider approval and a numeric nroRecElectronica.
Never automatically retry an ambiguous POST, including HTTP 504.
"""
import base64
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

from alta_demo_smoke import demo_payload

HOST = "https://test-servicios.farmalink.com.ar"
TOKEN_URL = HOST + "/api/oauth/token/generate"
ALTA_URL = HOST + "/api/recetaElect/v3/altaReceta"
OUT = Path(os.environ.get("FARMALINK_HOMOLOGATION_OUTPUT", "/tmp/farmalink-homologacion-test"))
OUT.mkdir(parents=True, exist_ok=True)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)

OPENER = urllib.request.build_opener(NoRedirect())

def safe_post(url, headers, body, timeout=65):
    r = urllib.request.Request(url, data=body, headers=headers, method="POST")
    begin = time.monotonic()
    try:
        with OPENER.open(r, timeout=timeout) as rsp:
            return rsp.status, rsp.read(131072), round(time.monotonic()-begin, 1)
    except urllib.error.HTTPError as e:
        return e.code, e.read(131072), round(time.monotonic()-begin, 1)

def json_dict(raw):
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except (UnicodeDecodeError, ValueError, TypeError):
        return {}

def write_receipt(case, payload):
    (OUT / (case + "-receipt.json")).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

def make_pdf(kind, number, payload, name, branded):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.graphics.barcode import code128
    pdf_path = OUT / (kind + "-farmalink-test.pdf")
    c = canvas.Canvas(str(pdf_path), pagesize=A4, pageCompression=1)
    w, h = A4
    c.setFont("Helvetica-Bold", 18)
    c.drawString(44, h-60, "AUTAMEDICA  |  RECETA ELECTRONICA")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(44, h-85, "SOLO HOMOLOGACION TEST - NO APTA PARA DISPENSA")
    c.setFont("Helvetica", 10)
    c.drawString(44, h-113, "ID de receta Farmalink TEST: " + number)
    c.drawString(44, h-133, "Organizacion: 182   |   Entidad test: 7110")
    af = payload["altaRecetaElectRq"]["recElectronica"]["afiliado"]
    med = payload["altaRecetaElectRq"]["recElectronica"]["medico"]
    c.drawString(44, h-155, "Paciente de prueba: " + af["nombre"] + " " + af["apellido"])
    c.drawString(44, h-171, "DNI: " + str(af["numeroDocumento"]) + "   |   Credencial TEST: " + af["credencial"]["pan"])
    c.drawString(44, h-194, "Profesional de prueba: " + med["nombre"] + " " + med["apellido"])
    c.drawString(44, h-210, "Matricula de ejemplo: " + str(med["matricula"]["numero"]))
    c.drawString(44, h-226, "Domicilio de atencion de ejemplo: " + med["domicilioAtencion"])
    c.drawString(44, h-251, "Fecha de emision TEST: " + datetime.now(ZoneInfo("America/Argentina/Buenos_Aires")).strftime("%d/%m/%Y"))
    c.line(44, h-267, w-44, h-267)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(44, h-290, "MEDICAMENTO PRESCRIPTO")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(44, h-312, name)
    c.setFont("Helvetica", 10)
    c.drawString(44, h-331, "Tipo de prescripcion: " + ("MARCA COMERCIAL (generico=N)" if branded else "GENERICA (generico=S)"))
    item = payload["altaRecetaElectRq"]["recElectronica"]["detalleRecElectronica"]["item"][0]
    c.drawString(44, h-347, "Cantidad: " + str(item["cantidad"]) + "   |   Codigo de producto: " + item["codProducto"])
    c.drawString(44, h-365, "Diagnostico DEMO: " + payload["altaRecetaElectRq"]["recElectronica"]["diagnostico"]["codigo"])
    c.line(44, h-382, w-44, h-382)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(44, h-405, "CODIGO DE BARRAS PARA VALIDACION DE FARMACIA (TEST)")
    code = code128.Code128(number, barHeight=52, barWidth=1.1)
    code.drawOn(c, 44, h-485)
    c.setFont("Helvetica", 10)
    c.drawString(44, h-502, number)
    c.setFont("Helvetica", 9)
    c.drawString(44, 98, "Documento de homologacion basado en identificador TEST de Farmalink.")
    c.drawString(44, 82, "No es una prescripcion clinica ni una firma de profesional habilitado.")
    c.save()
    return str(pdf_path)

def main():
    # A rerun could generate duplicate provider prescriptions. Refuse all reruns.
    if os.environ.get("GITHUB_RUN_ATTEMPT", "1") != "1":
        print("RESULT=BLOCKED_GITHUB_ACTIONS_RERUN")
        return 10
    if os.environ.get("GITHUB_EVENT_NAME") != "push":
        print("RESULT=BLOCKED_NOT_INITIAL_PUSH")
        return 10
    secrets = ("FARMALINK_TEST_OAUTH_PASSWORD", "FARMALINK_TEST_BASIC_PASSWORD")
    if any(not os.environ.get(k) for k in secrets):
        print("RESULT=NOT_CONFIGURED")
        return 2

    basic = base64.b64encode(("AUTAMEDICAClient:" + os.environ["FARMALINK_TEST_BASIC_PASSWORD"]).encode()).decode()
    try:
        st, raw, _ = safe_post(TOKEN_URL, {
            "Authorization": "Basic " + basic,
            "grant_type": "PASSWORD",
            "username": "autamedica.ws182",
            "password": os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
            "scope": "Switch.RecetaElectRest",
            "Accept": "application/json",
        }, b"", 25)
    except (OSError, TimeoutError):
        print("RESULT=AUTH_TRANSPORT_ERROR")
        return 3
    data = json_dict(raw)
    token = data.get("access_token")
    if st != 200 or not isinstance(token, str) or not token:
        print("AUTH_HTTP_STATUS=" + str(st))
        print("RESULT=AUTH_REJECTED")
        return 3
    print("AUTH=PASS")
    headers = {"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json"}
    run_id = os.environ.get("GITHUB_RUN_ID", "local")
    # Public registry lists product 60763 as prednisolone ophthalmic SOPHIPREN
    # OFTENO, but its equivalence to the Farmalink codProducto requires provider
    # verification. This is TEST, not a clinical prescription.
    cases = [
        ("generica_S", True, "PREDNISOLONA - presentacion de prueba", "56800"),
        ("marca_N", False, "SOPHIPREN OFTENO - prednisolona, colirio 5 ml", "60763"),
    ]
    for kind, generic, printable_name, product_code in cases:
        payload = demo_payload()
        root = payload["altaRecetaElectRq"]
        root["infoCabeceraRq"]["infoBrowser"] = "AutaMedica-HOMO-"+run_id+"-"+kind
        root["recElectronica"]["detalleRecElectronica"]["item"][0].update({
            "cantidad": 1, "codProducto":product_code,
            "codDroga":"01033", "textoGenerico":"PREDNISOLONA",
            "generico":"S" if generic else "N",
            "recomendacionMedica":"N" if generic else "S",
        })
        assert root["infoCabeceraRq"]["idOrganizacion"] == "182"
        assert "puntoEmisor" not in root
        assert root["recElectronica"]["afiliado"]["credencial"]['codEntidad'] == 7110
        print("CASE="+kind)
        print("SENDING_ONCE=YES")
        try:
            st, raw, seconds = safe_post(ALTA_URL, headers, json.dumps(payload, separators=(",",":")).encode(), 65)
        except (OSError, TimeoutError):
            write_receipt(kind, {"case":kind,"result":"AMBIGUOUS_TRANSPORT","attempted":1})
            print("RESULT=AMBIGUOUS_TRANSPORT_NO_RETRY")
            return 4
        data = json_dict(raw)
        resp = data.get("altaRecetaElectRs")
        if not isinstance(resp,dict): resp={}
        answer = resp.get("respuesta")
        if not isinstance(answer,dict): answer={}
        code = str(answer.get("codigo", ""))
        rx = resp.get("recElectronica")
        if not isinstance(rx,dict): rx={}
        number = str(rx.get("nroRecElectronica",""))
        approved = st == 200 and code in ("00","0") and re.fullmatch(r"[0-9]+",number)
        print("ALTA_HTTP="+str(st))
        print("ALTA_SECONDS="+str(seconds))
        print("ALTA_VENDOR_CODE="+re.sub("[^A-Za-z0-9_-]","",code)[:24])
        if not approved:
            write_receipt(kind, {"case":kind,"http":st,"functional_code":code[:32],"result":"NOT_CONFIRMED","attempted":1})
            print("RESULT=ALTA_NOT_CONFIRMED_NO_RETRY")
            return 5
        write_receipt(kind, {"case":kind,"http":st,"functional_code":code,"result":"APPROVED_TEST","nroRecElectronica":number,"attempted":1})
        print("APPROVED_TEST_NUMBER="+number)
        print("PDF_CREATED="+make_pdf(kind, number, payload, printable_name, not generic))
    print("RESULT=TWO_TEST_RECIPES_APPROVED_WITH_PDFS")
    print("PRODUCTION_ACTIONS=0")
    print("EMAILS_SENT=0")
    return 0

if __name__ == "__main__":
    sys.exit(main())
