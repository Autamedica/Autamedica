#!/usr/bin/env python3
"""Read-only Farmalink TEST consultation for TWO existing accepted DEMO records.
No altaReceta or bajaReceta, no mutation, no tokens logged.
"""
import base64, json, os, re, sys
from homologacion_two_live_test import TOKEN_URL, HOST, safe_post, json_dict

def scrub(value):
    return re.sub(r"[^0-9A-Za-z áéíóúñÁÉÍÓÚÑ._/-]","",str(value or ""))[:110]

def main():
    user = "AUTAMEDICAClient"
    password = os.getenv("FARMALINK_TEST_BASIC_PASSWORD")
    oauth = os.getenv("FARMALINK_TEST_OAUTH_PASSWORD")
    if not password or not oauth:
        print("RESULT=NO_CREDENTIALS");return 2
    basic=base64.b64encode((user+":"+password).encode()).decode()
    try:
        status,raw,_=safe_post(TOKEN_URL,{"Authorization":"Basic "+basic,
        "grant_type":"PASSWORD","username":"autamedica.ws182",
        "password":oauth,"scope":"Switch.RecetaElectRest","Accept":"application/json"},b"",30)
    except (OSError,TimeoutError):
        print("RESULT=AUTH_TRANSPORT_UNKNOWN");return 3
    tok=json_dict(raw).get("access_token")
    if status!=200 or not tok:
        print("RESULT=AUTH_NOT_APPROVED");return 3
    headers={"Authorization":"Bearer "+tok,"Content-Type":"application/json","Accept":"application/json"}
    for number in ("9600000421228","9600000421242"):
        payload={"consultaRecetaElectRq":{
           "infoCabeceraRq":{"idOrganizacion":"182","tipoOrganizacion":"NMD"},
           "recElectronica":{"afiliado":{"codEntidad":7110,"pan":"20123456786"},
            "receta":{"nroRecElectronica":number}}}}
        try:
            status,raw,seconds=safe_post(HOST+"/api/recetaElect/v3/consultaReceta",headers,
                                         json.dumps(payload,separators=(",",":")).encode(),50)
        except (OSError,TimeoutError):
            print("RECIPE="+number+" HTTP=TRANSPORT_ERROR");continue
        root=json_dict(raw)
        print("RECIPE="+number+" HTTP="+str(status)+" LATENCY="+str(seconds))
        print("ROOT_KEYS="+",".join(root.keys()))
        response=root.get("consultaRecetaElectRs",{})
        if not isinstance(response,dict):response={}
        answer=response.get("respuesta",{})
        if isinstance(answer,dict):
            print("CODE="+scrub(answer.get("codigo"))+" DESC="+scrub(answer.get("descripcion")))
        print("RESPONSE_KEYS="+",".join(response.keys()))
        recipe=response.get("recElectronica",{})
        if not isinstance(recipe,dict): recipe={}
        print("RX_KEYS="+",".join(recipe.keys()))
        detail=recipe.get("detalleRecElectronica",{})
        if not isinstance(detail,dict): detail={}
        print("DETAIL_KEYS="+",".join(detail.keys()))
        ref=detail.get("referenciaRx")
        print("REF_TYPE="+type(ref).__name__)
        refs=ref if isinstance(ref,list) else [ref] if isinstance(ref,dict) else []
        for n,item in enumerate(refs[:3]):
            if not isinstance(item,dict): continue
            print("REF_"+str(n)+"_KEYS="+",".join(item.keys()))
            exclude={"nombre","apellido","dni","pan","cuil","mail","numeroDocumento"}
            droga=item.get("droga")
            if isinstance(droga,dict):
                for k,v in droga.items():
                    if isinstance(v,(str,int,float)):
                        print("DRUG_"+scrub(k)+"="+scrub(v))
            item_container=item.get("items")
            prod=item_container.get("item",[]) if isinstance(item_container,dict) else []
            if isinstance(prod,dict):prod=[prod]
            for jj,record in enumerate(prod[:3] if isinstance(prod,list) else []):
                if isinstance(record,dict):
                    print("PRODUCT_"+str(jj)+"_KEYS="+",".join(record.keys()))
                    for kk,vv in record.items():
                        if isinstance(vv,(str,int,float,bool)):
                            print("PRODUCT_"+str(jj)+"_"+scrub(kk)+"="+scrub(vv))
                        elif isinstance(vv,dict):
                            print("PRODUCT_"+str(jj)+"_"+scrub(kk)+"_KEYS="+",".join(vv.keys()))
            for k,v in item.items():
                if k not in exclude and isinstance(v,(str,int,float,bool)):
                    print("REF_"+str(n)+"_"+scrub(k)+"="+scrub(v))
                elif isinstance(v,dict) and k not in exclude:
                    print("REF_"+str(n)+"_"+scrub(k)+"_KEYS="+",".join(v.keys()))
        items=detail.get("item",[])
        if isinstance(items,dict): items=[items]
        for i,item in enumerate(items[:3] if isinstance(items,list) else []):
            if not isinstance(item,dict):continue
            # DEMO prescription items only; do not log affiliate/prescriber identifiers.
            allowed=("codProducto","codDroga","textoGenerico","generico",
                     "recomendacionMedica","descripcion","descripcionProducto",
                     "nombreComercial","nombreProducto","marca","presentacion",
                     "cantidad","producto")
            print("ITEM_"+str(i)+"="+json.dumps({k:scrub(item[k]) for k in allowed if k in item},ensure_ascii=False))
    print("RESULT=READ_ONLY")
    return 0

if __name__ == "__main__":sys.exit(main())
