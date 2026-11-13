"""Isolated *synthetic* Supabase Storage API smoke test.

Does not use AutaMedica production/staging, retained patient records or escrow.
This test cannot certify recovery of the 359 real Storage binaries.
It proves a local Storage service enforces a private-bucket owner policy.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4

PROJECT = "autamedica-storage-api-fixture"
BUCKET = "autamedica-private-smoke"
DB_CONTAINER = "supabase_db_" + PROJECT
EXCLUDE = "realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta"
DENIAL = {400, 401, 403, 404}
MAX_RESPONSE = 1024 * 1024
SYNTHETIC_BYTES = b"AutaMedica synthetic storage fixture only; no patient information.\n"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Unexpected HTTP redirect in isolated smoke test")


HTTP = build_opener(ProxyHandler({}), NoRedirect())


def safe_env():
    """No production credentials reach child commands or containers."""
    allowed = ("PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR",
               "DOCKER_HOST", "DOCKER_CONFIG", "XDG_RUNTIME_DIR")
    return {k: v for k, v in os.environ.items() if k in allowed}


def run(command, directory, stage, *, data=None, timeout=900):
    """Never relay CLI stdout/stderr because local credentials may appear."""
    try:
        result = subprocess.run(command, input=data, cwd=directory, env=safe_env(),
                                capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(stage + " failed (" + type(exc).__name__ + ")") from None
    if result.returncode:
        raise RuntimeError(stage + " failed (exit " + str(result.returncode) + ")")
    return result.stdout


def validate_local_url(url):
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError("Refusing any non-loopback Storage endpoint")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.port:
        raise RuntimeError("Unexpected local endpoint configuration")
    return url.rstrip("/")


def validate_status(status):
    """Supabase CLI v2.122.0 JSON; fail closed if the shape changes."""
    if not isinstance(status, dict):
        raise RuntimeError("Unexpected local status format")
    lower = {k.lower(): v for k, v in status.items()}
    api = lower.get("api_url")
    anon = lower.get("anon_key")
    service = lower.get("service_role_key")
    if not all(isinstance(s, str) and s for s in (api, anon, service)):
        raise RuntimeError("Required local-only API keys or URL absent")
    return validate_local_url(api), anon, service


def api_request(base, method, path, apikey, bearer=None, payload=None,
                content_type=None):
    """Return HTTP code and bounded body; never print tokens or responses."""
    base = validate_local_url(base)
    if not path.startswith("/") or path.startswith("//"):
        raise RuntimeError("Invalid relative API path")
    headers = {"apikey": apikey}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    if content_type:
        headers["Content-Type"] = content_type
    req = Request(base + path, data=payload, headers=headers, method=method)
    try:
        with HTTP.open(req, timeout=30) as response:
            body = response.read(MAX_RESPONSE + 1)
            if len(body) > MAX_RESPONSE:
                raise RuntimeError("Unexpected oversized local API response")
            return response.status, body
    except HTTPError as exc:
        # Deliberately discard the response body: it may contain credentials.
        exc.close()
        return exc.code, b""


def require_status(status, accepted, label):
    if status not in accepted:
        raise RuntimeError(label + ": unexpected HTTP status " + str(status))


def parse_json(body, label):
    try:
        value = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise RuntimeError(label + ": invalid local JSON") from None
    if not isinstance(value, dict):
        raise RuntimeError(label + ": unexpected local JSON")
    return value


def setup_private_policy(directory, container=DB_CONTAINER):
    # Fixture policies only. Never read, modify, or replay production policies.
    policy = """
CREATE POLICY autamedica_smoke_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'autamedica-private-smoke'
         AND split_part(name, '/', 1) = (select auth.uid()::text));
CREATE POLICY autamedica_smoke_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'autamedica-private-smoke'
         AND split_part(name, '/', 1) = (select auth.uid()::text));
"""
    run(["docker", "exec", "-i", container, "psql", "-X",
         "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
        directory, "Install synthetic owner policy", data=policy, timeout=60)


def create_user(api, anon, service, label):
    email = "storage-" + label + "-" + uuid4().hex + "@example.invalid"
    password = uuid4().hex + uuid4().hex
    body = json.dumps({"email": email, "password": password, "email_confirm": True}).encode()
    status, raw = api_request(api, "POST", "/auth/v1/admin/users", service, service,
                              body, "application/json")
    require_status(status, {200, 201}, "Create synthetic user")
    uid = parse_json(raw, "Synthetic user")["id"]
    if not re.fullmatch(r"[0-9a-f-]{36}", str(uid)):
        raise RuntimeError("Unexpected synthetic user ID")
    login = json.dumps({"email": email, "password": password}).encode()
    status, raw = api_request(api, "POST", "/auth/v1/token?grant_type=password",
                              anon, payload=login, content_type="application/json")
    require_status(status, {200}, "Synthetic authentication")
    token = parse_json(raw, "Synthetic session").get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Missing synthetic session token")
    return uid, token


def check_permissions(api, anon, service):
    status, _ = api_request(api, "POST", "/storage/v1/bucket", service, service,
                            json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode(),
                            "application/json")
    require_status(status, {200, 201}, "Create private fixture bucket")
    owner_id, owner_token = create_user(api, anon, service, "owner")
    _, other_token = create_user(api, anon, service, "other")
    object_path = quote(owner_id + "/synthetic.txt", safe="/")
    path = "/storage/v1/object/" + BUCKET + "/" + object_path
    read_path = "/storage/v1/object/authenticated/" + BUCKET + "/" + object_path
    public_path = "/storage/v1/object/public/" + BUCKET + "/" + object_path

    status, _ = api_request(api, "POST", path, anon, owner_token,
                            SYNTHETIC_BYTES, "text/plain")
    require_status(status, {200, 201}, "Synthetic upload as owner")

    status, raw = api_request(api, "GET", read_path, anon, owner_token)
    require_status(status, {200}, "Owner downloads synthetic file")
    if hashlib.sha256(raw).digest() != hashlib.sha256(SYNTHETIC_BYTES).digest():
        raise RuntimeError("Storage API returned the wrong object bytes")

    status, _ = api_request(api, "GET", read_path, anon, other_token)
    require_status(status, DENIAL, "Other patient must not read owner's file")

    status, _ = api_request(api, "GET", read_path, anon)
    require_status(status, DENIAL, "Anonymous user must not read private file")

    status, _ = api_request(api, "GET", public_path, anon)
    require_status(status, DENIAL, "Private bucket must not expose a public URL")

    status, _ = api_request(api, "POST",
                            "/storage/v1/object/" + BUCKET + "/" + object_path,
                            anon, other_token, b"unauthorized", "text/plain")
    require_status(status, DENIAL, "Other patient must not upload to owner's path")
    return {"synthetic_owner_download_sha256_verified": True,
            "synthetic_other_patient_denied": True,
            "synthetic_anonymous_denied": True,
            "synthetic_public_url_denied": True,
            "synthetic_cross_patient_upload_denied": True}


def main():
    os.umask(0o077)
    # Refuse even if a caller mistakenly provides production credentials.
    forbidden = ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_URL", "SUPABASE_DB_PASSWORD",
                 "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "DATABASE_URL",
                 "PGPASSWORD", "RECOVERY_BACKUP_PRIVATE_KEY")
    if any(os.environ.get(k) for k in forbidden):
        raise RuntimeError("Remove production credentials before running synthetic test")
    # Do not stop any existing local stack or hijack its fixed ports.
    for port in (54321, 54322, 54323):
        with socket.socket() as client:
            client.settimeout(0.2)
            if client.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError("Local Supabase port already occupied; refusing reuse")
    if run(["docker", "ps", "-aq", "--filter", "name=^/" + DB_CONTAINER + "$"],
           None, "Check empty fixture container").strip():
        raise RuntimeError("Existing fixture container must be reviewed, not reused")

    with tempfile.TemporaryDirectory(prefix="autamedica-storage-api-fixture-") as root:
        work = Path(root)
        run(["supabase", "init"], root, "Initialize synthetic-only stack", timeout=60)
        config = work / "supabase/config.toml"
        txt, n = re.subn(r'(?m)^project_id = ".*"$',
                         'project_id = "' + PROJECT + '"', config.read_text())
        if n != 1:
            raise RuntimeError("Unrecognized local Supabase configuration")
        config.write_text(txt)
        network = "autamedica-storage-fixture-" + uuid4().hex[:12]
        run(["docker", "network", "create", "--driver", "bridge",
             "-o", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
             network], root, "Create loopback-bound test network", timeout=30)
        attempted = False
        result = None
        try:
            attempted = True
            run(["supabase", "start", "--network-id", network,
                 "--exclude", EXCLUDE], root, "Start synthetic-only Supabase stack")
            status = json.loads(run(["supabase", "status", "--output", "json"],
                                    root, "Read local CLI status", timeout=60))
            api, anon, service = validate_status(status)
            setup_private_policy(root)
            result = check_permissions(api, anon, service)
        finally:
            if attempted:
                run(["supabase", "stop", "--no-backup"], root, "Clean up fixture stack", timeout=150)
            run(["docker", "network", "rm", network], root, "Remove fixture network", timeout=30)
            if run(["docker", "ps", "-aq", "--filter",
                    "name=^/" + DB_CONTAINER + "$"], root,
                   "Check fixture cleanup", timeout=30).strip():
                raise RuntimeError("Fixture database container remained after cleanup")
    if result is None:
        raise RuntimeError("No test result")
    print(json.dumps({"synthetic_storage_api_verified": True,
                      "production_recovery_accredited": False,
                      "storage_service_restore_verified": False,
                      "source_connection_used": False, "private_working_copy_destroyed": True,
                      **result}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Never leak diagnostic responses, JWTs, secrets, or private documents.
        msg = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print("::error::Synthetic Storage API smoke test failed: " + msg, flush=True)
        raise SystemExit(1) from None
