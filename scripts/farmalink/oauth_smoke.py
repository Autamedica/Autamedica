#!/usr/bin/env python3
"""One-shot Farmalink TEST OAuth smoke check.

Reads credentials exclusively from environment variables. Never writes tokens,
request bodies, headers, or credentials to stdout, files, or GitHub artifacts.
No prescription API is invoked. Exit codes: 0=token, 2=missing config,
3=HTTP rejection, 4=network/TLS, 5=unexpected token response.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

URL = "https://test-servicios.farmalink.com.ar/api/oauth/token/generate"
SCOPE = "Switch.RecetaElectRest"
REQUIRED = (
    "FARMALINK_TEST_OAUTH_PASSWORD",
    "FARMALINK_TEST_BASIC_PASSWORD",
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        # Never forward credential headers to a different URL.
        raise urllib.error.HTTPError(request.full_url, code, msg, headers, fp)


def run() -> int:
    if any(not os.environ.get(k) for k in REQUIRED):
        print("RESULT=NOT_CONFIGURED")
        print("Configure FARMALINK_TEST_OAUTH_PASSWORD and FARMALINK_TEST_BASIC_PASSWORD as GitHub Actions secrets.")
        return 2
    oauth_user = "autamedica.ws182"
    basic_user = "AUTAMEDICAClient"
    basic_pwd = os.environ["FARMALINK_TEST_BASIC_PASSWORD"]
    basic_header = base64.b64encode(f"{basic_user}:{basic_pwd}".encode()).decode()
    req = urllib.request.Request(
        URL,
        data=b"",
        method="POST",
        headers={
            "Authorization": f"Basic {basic_header}",
            "grant_type": "PASSWORD",
            "username": oauth_user,
            "password": os.environ["FARMALINK_TEST_OAUTH_PASSWORD"],
            "scope": SCOPE,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=18) as resp:
            status, body = resp.status, resp.read(64 * 1024)
    except urllib.error.HTTPError as exc:
        print(f"HTTP_STATUS={exc.code}")
        print("RESULT=HTTP_REJECTED")
        return 3
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"RESULT=NETWORK_ERROR:{type(exc).__name__}")
        return 4
    print(f"HTTP_STATUS={status}")
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = None
    if isinstance(payload, dict) and isinstance(payload.get("access_token"), str) and payload["access_token"]:
        print("RESULT=TOKEN_OBTAINED")
        print("PRESCRIPTIONS_SENT=0")
        return 0
    print("RESULT=NO_TOKEN_IN_RESPONSE")
    return 5


if __name__ == "__main__":
    sys.exit(run())
