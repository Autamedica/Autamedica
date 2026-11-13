#!/usr/bin/env python3
"""Single live homologation cycle against Farmalink TEST, using public DEMO fixture.

One alta attempt only. If it returns an approved numero, query that exact DEMO
record and cancel it only after a successful lookup. No retries on ambiguous
timeouts and no access to production. Outputs only status, vendor codes and
a DEMO receipt; no credentials, tokens or personal data.
"""
import base64
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request

from alta_demo_smoke import demo_payload

HOST = "https://test-servicios.farmalink.com.ar"
TOKEN_URL = HOST + "/api/oauth/token/generate"
API = HOST + "/api/recetaElect/v3"

class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, msg, headers, fp)

OPENER = urllib.request.build_opener(NoRedirects())

def post(url, headers, data, timeout):
    req = urllib.request.Request(url,data=data,headers=headers,method="POST")
    started = time.monotonic()
    try:
        with OPENER.open(req,timeout=timeout) as resp:
            return resp.status, resp.read(65536), round(time.monotonic()-started,1)
    except urllib.error.HTTPError as error:
        return error.code, error.read(65536), round(time.monotonic()-started,1)

def obj_from_bytes(b):
    try:
        x=json.loads(b)
        return x if isinstance(x,dict) else {}
    except (ValueError,TypeError):
        return {}

def short_code(reply,root):
    x=reply.get(root,{})
    if not isinstance(x,dict): return "NO_RESPONSE_NODE"
    y=x.get("respuesta",{})
    return str(y.get("codigo","NO_VENDOR_CODE")) if isinstance(y,dict) else "NO_VENDOR_CODE"

def code_for_http_error(reply):
    v=reply.get("error",{})
    if not isinstance(v,dict):return ""
    internal=v.get("errorInterno",{})
    if isinstance(internal,dict) and internal.get("codigo"):return str(internal["codigo"])[:10]
    return str(v.get("codigo",""))[:10]

def main():
    # Do not issue another DEMO prescription while two previous results are ambiguous.
    if os.environ.get("FARMALINK_DEMO_RECONCILED") != "yes":
        print("RESULT=BLOCKED_PENDING_DEMO_RECONCILIATION")
        return 2
    if not all(os.environ.get(k) for k in ("FARMALINK_TEST_OAUTH_PASSWORD","FARMALINK_TEST_BASIC_PASSWORD")):
        print("RESULT=NOT_CONFIGURED")
        return 2
    # Authentication
    basic=base64.b64encode(("AUTAMEDICAClient:"+os.environ["FARMALINK_TEST_BASIC_PASSWORD"]).encode()).decode()
    try:
        st,body,_=post(TOKEN_URL,{
            "Authorization":"Basic "+basic,
            "grant_type":"PASSWORD",
            "username":"autamedica.ws182",
            "password":os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
            "scope":"Switch.RecetaElectRest",
            "Accept":"application/json"
        },b"",25)
        if st!=200:
            print("AUTH_HTTP="+str(st))
            print("RESULT=AUTH_REJECTED")
            return 3
        token=obj_from_bytes(body)["access_token"]
        if not isinstance(token,str) or not token: raise ValueError("missing token")
    except (OSError,ValueError,KeyError,TypeError) as ex:
        print("RESULT=AUTH_ERROR_"+type(ex).__name__)
        return 3
    print("AUTH=PASS")
    print("DESTINATION=TEST_ONLY")
    print("PRODUCTION_ACTIONS=0")
    req_headers={"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json"}

    # Fresh homologation trial marker to distinguish this from the previous
    # uncertain vendor transaction, without changing the published DEMO identities.
    tag=uuid.uuid4().hex[:10]
    payload=demo_payload()
    payload["altaRecetaElectRq"]["infoCabeceraRq"]["infoBrowser"]="AutaMedica-Test-"+tag
    print("TEST_ATTEMPT_TAG="+tag)
    print("ALTA_REQUEST_COUNT=1")
    try:
        st,body,elapsed=post(API+"/altaReceta",req_headers,
            json.dumps(payload,separators=(",",":")).encode(),85)
    except (OSError,TimeoutError) as ex:
        print("ALTA_ERROR="+type(ex).__name__)
        print("RESULT=ALTA_AMBIGUOUS_NO_AUTO_RETRY")
        return 4
    print("ALTA_HTTP="+str(st))
    print("ALTA_LATENCY_SECONDS="+str(elapsed))
    result=obj_from_bytes(body)
    if st!=200:
        print("ALTA_INTERNAL_ERROR_CODE="+code_for_http_error(result))
        print("RESULT=ALTA_HTTP_REJECTED")
        return 5
    code=short_code(result,"altaRecetaElectRs")
    print("ALTA_VENDOR_CODE="+code)
    x=result.get("altaRecetaElectRs",{})
    if not isinstance(x,dict): x={}
    rx=x.get("recElectronica",{})
    number=str(rx.get("nroRecElectronica","")) if isinstance(rx,dict) else ""
    if code not in ("00","0") or not number.isdigit():
        print("RESULT=ALTA_VENDOR_REJECTED_OR_MISSING_NUMBER")
        return 5
    print("ALTA_APPROVED_DEMO_NUMBER="+number)

    # Query exactly the newly approved DEMO record before cancellation.
    reference={
      "infoCabeceraRq":{"idOrganizacion":"182","tipoOrganizacion":"NMD"},
      "recElectronica":{"afiliado":{"codEntidad":7110,"pan":"20123456786"},
                      "receta":{"nroRecElectronica":number}}
    }
    consult={"consultaRecetaElectRq":reference}
    try:
        st,body,elapsed=post(API+"/consultaReceta",req_headers,
            json.dumps(consult,separators=(",",":")).encode(),65)
    except (OSError,TimeoutError) as ex:
        print("CONSULTA_ERROR="+type(ex).__name__)
        print("RESULT=ALTA_APPROVED_CONSULTA_UNKNOWN_NO_BAJA")
        return 6
    print("CONSULTA_HTTP="+str(st))
    print("CONSULTA_LATENCY_SECONDS="+str(elapsed))
    result=obj_from_bytes(body)
    if st!=200:
        print("CONSULTA_INTERNAL_ERROR_CODE="+code_for_http_error(result))
        print("RESULT=ALTA_APPROVED_CONSULTA_FAILED_NO_BAJA")
        return 6
    code=short_code(result,"consultaRecetaElectRs")
    print("CONSULTA_VENDOR_CODE="+code)
    if code not in ("00","0"):
        print("RESULT=ALTA_APPROVED_CONSULTA_NOT_CONFIRMED_NO_BAJA")
        return 6

    # This is exclusively the synthetic DEMO record created in this same run.
    cancel={"bajaRecetaElectRq":reference}
    print("BAJA_ELIGIBLE=DEMO_CREATED_AND_QUERIED_IN_SAME_RUN")
    try:
        st,body,elapsed=post(API+"/bajaReceta",req_headers,
            json.dumps(cancel,separators=(",",":")).encode(),65)
    except (OSError,TimeoutError) as ex:
        print("BAJA_ERROR="+type(ex).__name__)
        print("RESULT=BAJA_AMBIGUOUS_NO_RETRY")
        return 7
    print("BAJA_HTTP="+str(st))
    print("BAJA_LATENCY_SECONDS="+str(elapsed))
    result=obj_from_bytes(body)
    if st!=200:
        print("BAJA_INTERNAL_ERROR_CODE="+code_for_http_error(result))
        print("RESULT=BAJA_HTTP_REJECTED")
        return 7
    code=short_code(result,"bajaRecetaElectRs")
    print("BAJA_VENDOR_CODE="+code)
    print("RESULT="+("FULL_DEMO_CYCLE_APPROVED" if code in ("00","0") else "BAJA_VENDOR_REJECTED"))
    return 0 if code in ("00","0") else 7

if __name__=="__main__":
    sys.exit(main())
