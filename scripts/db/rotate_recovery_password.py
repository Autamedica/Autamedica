"""Operator-only password rotation through the Supabase Management API."""
import json
import os
import re
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from check_recovery_source import PROJECT, SESSION_HOST, connection_options, probe

API = "https://api.supabase.com/v1/projects/" + PROJECT


def validate_configuration(environ):
    if environ.get("ROTATION_CONFIRMATION") != "RESET-" + PROJECT:
        raise RuntimeError("Exact production project confirmation required")
    password = environ.get("SUPABASE_DB_PASSWORD", "")
    token = environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not re.fullmatch(r"[A-Fa-f0-9]{64}", password) or not token:
        raise RuntimeError("A staged 256-bit password and management token are required")
    options = connection_options(environ.get("SUPABASE_DB_URL", ""), password)
    if options["PGPASSWORD"] != password or options["PGHOST"] != SESSION_HOST:
        raise RuntimeError("Staged URL and password do not match the production session endpoint")
    return password, token, options


def management_request(token, suffix="", password=None):
    data = json.dumps({"password": password}).encode() if password is not None else None
    request = Request(API + suffix, data=data,
                      method="PATCH" if password is not None else "GET",
                      headers={"Authorization": "Bearer " + token,
                               "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=120) as response:
            if response.status != 200:
                raise RuntimeError("Unexpected management API response")
            return json.loads(response.read())
    except HTTPError as error:
        # Never print response bodies: APIs may echo submitted credentials.
        raise RuntimeError("Management API rejected request (HTTP " + str(error.code) + ")") from None
    except (URLError, TimeoutError, json.JSONDecodeError):
        raise RuntimeError("Management API connection or response failure") from None


def main():
    password, token, options = validate_configuration(os.environ)
    project = management_request(token)
    if not isinstance(project, dict) or project.get("id") != PROJECT or project.get("status") != "ACTIVE_HEALTHY":
        raise RuntimeError("Production project is not confirmed healthy; rotation stopped")
    try:
        probe(options)
        print("Desired credential already works; no rotation performed.")
        return
    except RuntimeError as error:
        if str(error) != "authentication":
            raise RuntimeError("Source failed a non-authentication check; rotation stopped") from None
    except subprocess.TimeoutExpired:
        raise RuntimeError("Source connection timed out; rotation stopped") from None
    management_request(token, "/database/password", password)
    print("Management API accepted the authorized production password update.")
    for attempt in range(6):
        try:
            report = probe(options)
            print(json.dumps({"rotation_verified": True, **report}, sort_keys=True))
            return
        except (RuntimeError, subprocess.TimeoutExpired):
            if attempt < 5:
                time.sleep(10)
    raise RuntimeError("Password update accepted but connection verification failed; credential remains saved in GitHub")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print("::error::" + str(error))
        raise SystemExit(1) from None
