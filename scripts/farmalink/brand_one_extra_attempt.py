#!/usr/bin/env python3
"""One distinct branded prescription TEST attempt, never repeated."""
import base64, json, os, re, sys
from alta_demo_smoke import demo_payload
from homologacion_two_live_test import TOKEN_URL, ALTA_URL, safe_post, json_dict, write_receipt, make_pdf

def main():
    if os.getenv("GITHUB_EVENT_NAME")!="push" or os.getenv("GITHUB_RUN_ATTEMPT")!="1":
        return 8
    basic=base64.b64encode(("AUTAMEDICAClient:"+os.environ["FARMALINK_TEST_BASIC_PASSWORD"]).encode()).decode()
    st,body,_=safe_post(TOKEN_URL,{
        "Authorization":"Basic "+basic, "grant_type":"PASSWORD",
        "username":"autamedica.ws182","password":os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
        "scope":"Switch.RecetaElectRest","Accept":"application/json"},b"",25)
    token=json_dict(body).get("access_token")
    if st!=200 or not token:
        print("RESULT=AUTH_FAILURE");return 3
    print("AUTH=PASS")
    p=demo_payload(); root=p["altaRecetaElectRq"]
    root["infoCabeceraRq"]["infoBrowser"]="AutaMedica-BRAND-TEST-"+os.environ["GITHUB_RUN_ID"]
    it=root["recElectronica"]["detalleRecElectronica"]["item"][0]
    it.update({"cantidad":1,"codProducto":"56800","codDroga":"01033",
               "textoGenerico":"PREDNISOLONA","generico":"N","recomendacionMedica":"S"})
    assert root["infoCabeceraRq"]["idOrganizacion"]=="182" and "puntoEmisor" not in root
    try:
        st,body,_=safe_post(ALTA_URL,{"Authorization":"Bearer "+token,
          "Content-Type":"application/json","Accept":"application/json"},
          json.dumps(p,separators=(",",":")).encode(),65)
    except (OSError,TimeoutError):
        print("RESULT=AMBIGUOUS_NO_RETRY");return 4
    rs=json_dict(body).get("altaRecetaElectRs",{})
    ans=rs.get("respuesta",{}) if isinstance(rs,dict) else {}
    code=str(ans.get("codigo",""))
    num=str(rs.get("recElectronica",{}).get("nroRecElectronica",""))
    print("HTTP="+str(st));print("VENDOR_CODE="+re.sub("[^0-9A-Za-z]","",code))
    print("VENDOR_DESCRIPTION="+re.sub("[^0-9A-Za-z áéíóúÁÉÍÓÚ.,:()]","",str(ans.get("descripcion","")))[:90])
    if st!=200 or code not in ("0","00") or not num.isdigit():
        write_receipt("marca_N_56800",{"http":st,"code":code,"result":"REJECTED"});return 5
    write_receipt("marca_N_56800",{"http":st,"code":code,"result":"APPROVED_TEST","nroRecElectronica":num})
    print("NUMBER="+num)
    make_pdf("marca_N_56800",num,p,"PREDNISOLONA - producto comercial codigo 56800",True)
    print("RESULT=APPROVED_TEST_PDF_CREATED_BRAND_NAME_UNVERIFIED")
    return 0
if __name__=="__main__":sys.exit(main())
