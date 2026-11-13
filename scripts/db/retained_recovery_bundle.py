"""Private Storage capture and public-key encrypted recovery bundle.

Only the fixed production HTTPS endpoint is readable. No upload/delete API exists
here. Names, SQL, ACL facts and fingerprints stay inside the encrypted archive.
"""
import base64
import hashlib
from http.client import IncompleteRead
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from check_recovery_source import PROJECT

BASE_URL = "https://" + PROJECT + ".supabase.co"
SQL_PARTS = ("roles", "schema-pre", "data", "schema-post")
STORAGE_ATTEMPTS = 3


class StorageIntegrityError(RuntimeError):
    """An allowlisted diagnostic, never a remote error body or object name."""


def storage_failure(error):
    if isinstance(error, StorageIntegrityError):
        return str(error), False
    if isinstance(error, HTTPError):
        code = error.code
        error.close()
        return ("http_" + str(code) if type(code) is int and 100 <= code <= 599 else "http_error",
                code in (408, 429, 500, 502, 503, 504))
    if isinstance(error, URLError):
        error = error.reason
    if isinstance(error, ssl.SSLError):
        return "tls_error", False
    if isinstance(error, TimeoutError):
        return "timeout", True
    if isinstance(error, (ConnectionError, IncompleteRead)):
        return "connection_interrupted", True
    return "unknown", False


def capture_object(opener, request, path, expected_size, expected_etag, keepalive):
    for attempt in range(STORAGE_ATTEMPTS):
        created = False
        size, digest, md5 = 0, hashlib.sha256(), hashlib.md5(usedforsecurity=False)
        try:
            with opener.open(request, timeout=60) as response, path.open("xb") as output:
                created = True
                if response.status != 200 or response.geturl() != request.full_url:
                    raise StorageIntegrityError("response_rejected")
                try:
                    actual_etag = etag(response.headers.get("ETag"))
                except RuntimeError:
                    raise StorageIntegrityError("etag_invalid") from None
                if actual_etag != expected_etag:
                    raise StorageIntegrityError("etag_mismatch")
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > expected_size:
                        raise StorageIntegrityError("size_mismatch")
                    digest.update(chunk)
                    md5.update(chunk)
                    output.write(chunk)
            if size != expected_size:
                raise StorageIntegrityError("size_mismatch")
            if re.fullmatch(r"[a-fA-F0-9]{32}", expected_etag) and md5.hexdigest() != expected_etag.lower():
                raise StorageIntegrityError("content_mismatch")
            return digest.hexdigest()
        except Exception as error:
            if created:
                try:
                    path.unlink()
                except OSError:
                    raise RuntimeError("Storage capture cleanup failed; private diagnostics withheld") from None
            reason, retryable = storage_failure(error)
            if not retryable or attempt + 1 == STORAGE_ATTEMPTS:
                diagnostic = "" if reason == "unknown" else " (reason=" + reason + ")"
                raise RuntimeError("Storage capture failed" + diagnostic + "; private diagnostics withheld") from None
            # Repeat the same conditional GET from byte zero, never resume or
            # accept a new ETag. Keep the source snapshot alive during backoff.
            keepalive()
            print("Storage transient retry: " + reason, flush=True)
            time.sleep(2 ** (attempt + 1))


def inventory_sql():
    # Reads do not invalidate inventory solely by updating last_accessed_at.
    return """SELECT jsonb_build_object(
      'buckets',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id)
                         FROM storage.buckets b),'[]'::jsonb),
      'objects',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',id,'bucket_id',bucket_id,'name',name,'version',version,
        'updated_at',updated_at,'metadata',metadata,'archived_at',archived_at,
        'is_delete_marker',is_delete_marker,'is_versioned',is_versioned)
        ORDER BY bucket_id,name,id) FROM storage.objects),'[]'::jsonb));"""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Storage redirect refused")


def object_url(bucket, name):
    if not isinstance(bucket, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", bucket):
        raise RuntimeError("Unsupported Storage bucket name")
    if not isinstance(name, str) or not name or any(
            part in ("", ".", "..") for part in name.split("/")) or "\\" in name:
        raise RuntimeError("Unsupported Storage object path")
    return BASE_URL + "/storage/v1/object/authenticated/" + quote(bucket, safe="") + "/" + quote(name, safe="/")


def etag(value):
    if not isinstance(value, str):
        raise RuntimeError("Storage ETag missing")
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", value):
        raise RuntimeError("Unsupported Storage ETag")
    return value


def capture_storage(inventory, directory, key, keepalive):
    directory = Path(directory)
    directory.mkdir(mode=0o700)
    opener = build_opener(NoRedirect())
    files, seen = [], set()
    for row in inventory["objects"]:
        if row.get("archived_at") or row.get("is_delete_marker") or row.get("is_versioned"):
            raise RuntimeError("Versioned Storage requires a version-aware recovery procedure")
        identity = (row["bucket_id"], row["name"])
        if identity in seen:
            raise RuntimeError("Duplicate Storage identity")
        seen.add(identity)
        url = object_url(*identity)
        expected_size = (row.get("metadata") or {}).get("size")
        expected_etag = etag((row.get("metadata") or {}).get("eTag"))
        if type(expected_size) is not int or expected_size < 0:
            raise RuntimeError("Storage size metadata missing or invalid")
        # Never use remote filenames as filesystem paths.
        filename = hashlib.sha256(json.dumps(identity).encode()).hexdigest() + ".bin"
        request = Request(url, headers={"apikey": key, "Authorization": "Bearer " + key,
                                        "Accept-Encoding": "identity", "Cache-Control": "no-cache",
                                        "If-Match": '"' + expected_etag + '"'})
        digest = capture_object(opener, request, directory / filename,
                                expected_size, expected_etag, keepalive)
        files.append({"bucket_id": identity[0], "name": identity[1],
                      "file": "storage/" + filename, "bytes": expected_size,
                      "sha256": digest})
        keepalive()
        if len(files) % 25 == 0 or len(files) == len(inventory["objects"]):
            print("Storage objects verified: " + str(len(files)) + "/" + str(len(inventory["objects"])), flush=True)
    return files


def gpg(home, *args, input_text=None):
    result = subprocess.run(["gpg", "--no-options", "--homedir", str(home),
                             "--batch", "--no-tty", "--no-auto-key-retrieve",
                             *args], input=input_text, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=600, check=False)
    if result.returncode:
        raise RuntimeError("Recovery encryption failed; private diagnostics withheld")
    return result.stdout


def import_recipient(home, public_key, fingerprint):
    if not re.fullmatch(r"[A-F0-9]{40}", fingerprint):
        raise RuntimeError("Full recovery recipient fingerprint required")
    if "PRIVATE KEY" in public_key or "BEGIN PGP PUBLIC KEY BLOCK" not in public_key:
        raise RuntimeError("Recovery encryption requires a public key only")
    gpg(home, "--import", input_text=public_key)
    keys = gpg(home, "--with-colons", "--fingerprint", "--list-keys")
    primary = []
    pending = False
    for line in keys.splitlines():
        fields = line.split(":")
        if fields[0] == "pub":
            pending = True
        elif fields[0] == "fpr" and pending:
            primary.append(fields[9])
            pending = False
    if primary != [fingerprint]:
        raise RuntimeError("Recovery public key fingerprint mismatch")


def preflight():
    public = os.environ.get("RECOVERY_BACKUP_PUBLIC_KEY", "")
    fingerprint = os.environ.get("RECOVERY_BACKUP_FINGERPRINT", "")
    if not public or not fingerprint:
        raise RuntimeError("Retained backup configuration missing; no production export started")
    with tempfile.TemporaryDirectory(prefix="recovery-key-check-") as directory:
        import_recipient(directory, public, fingerprint)
        gpg(directory, "--trust-model", "always", "--recipient", fingerprint,
            "--output", str(Path(directory) / "probe.gpg"), "--encrypt", input_text="recovery preflight")
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = resolve_storage_key()


def resolve_storage_key():
    """Read an existing project credential; never create, rotate or persist it."""
    configured = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if configured:
        return configured
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("Storage recovery credential unavailable; no production export started")
    endpoint = "https://api.supabase.com/v1/projects/" + PROJECT + "/api-keys?reveal=true"
    request = Request(endpoint, headers={"Authorization": "Bearer " + token,
                                         "Accept": "application/json"})
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            if response.status != 200 or response.geturl() != endpoint:
                raise ValueError("Unexpected credential endpoint")
            raw = response.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                raise ValueError("Unexpected credential response size")
        records = json.loads(raw)
        if not isinstance(records, list):
            raise ValueError("Unexpected credential response")
        candidates = [r.get("api_key") for r in records if isinstance(r, dict) and r.get("name") == "service_role"]
        if len(candidates) != 1 or not isinstance(candidates[0], str):
            raise ValueError("Unique legacy service credential required")
        key = candidates[0]
        if not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", key):
            raise ValueError("Unexpected credential format")
        payload = key.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        # TLS and the fixed endpoint establish provenance. Decoding only guards
        # accidental cross-project/role selection; it is not JWT verification.
        if claims.get("ref") != PROJECT or claims.get("role") != "service_role":
            raise ValueError("Wrong project or credential role")
        if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= time.time():
            raise ValueError("Expired credential")
    except Exception:
        raise RuntimeError("Storage credential lookup failed; private diagnostics withheld") from None
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::add-mask::" + key, flush=True)
    return key


def verify_inventory(expected, current):
    if expected != current:
        raise RuntimeError("Storage changed during capture; no bundle issued")


def encrypt_bundle(root, metadata, storage_files, output_dir):
    root, output_dir = Path(root), Path(output_dir)
    output_dir.mkdir(mode=0o700)  # Refuse reuse, including symlinks.
    archive = root / "recovery.tar.gz"
    manifest = dict(metadata, format_version=1, project=PROJECT, storage_files=storage_files)
    members = [name + ".sql" for name in SQL_PARTS] + [row["file"] for row in storage_files]
    manifest["checksums"] = {}
    for name in members:
        if name not in [part + ".sql" for part in SQL_PARTS] and not re.fullmatch(r"storage/[a-f0-9]{64}\.bin", name):
            raise RuntimeError("Unsafe recovery bundle member")
        path = root / name
        if not path.is_file() or path.is_symlink():
            raise RuntimeError("Recovery bundle component missing or unsafe")
        with path.open("rb") as stream:
            manifest["checksums"][name] = hashlib.file_digest(stream, "sha256").hexdigest()
    for row in storage_files:
        path = root / row["file"]
        if path.stat().st_size != row["bytes"] or manifest["checksums"][row["file"]] != row["sha256"]:
            raise RuntimeError("Storage bytes changed after capture")
    expected_sql = metadata.get("sql_checksums", {})
    if set(expected_sql) != set(SQL_PARTS) or any(
            manifest["checksums"][name + ".sql"] != expected_sql[name] for name in SQL_PARTS):
        raise RuntimeError("SQL bytes differ from the verified restore inputs")
    (root / "recovery.json").write_text(json.dumps(manifest, sort_keys=True))
    with tarfile.open(archive, "w:gz") as package:
        for name in ["recovery.json", *members]:
            package.add(root / name, arcname=name, recursive=False)
    with tempfile.TemporaryDirectory(prefix="recovery-encrypt-") as home:
        fingerprint = os.environ["RECOVERY_BACKUP_FINGERPRINT"]
        import_recipient(home, os.environ["RECOVERY_BACKUP_PUBLIC_KEY"], fingerprint)
        target = output_dir / "recovery.tar.gz.gpg"
        gpg(home, "--trust-model", "always", "--recipient", fingerprint,
            "--cipher-algo", "AES256", "--output", str(target), "--encrypt", str(archive))
    with target.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    (output_dir / "SHA256SUMS").write_text(digest + "  recovery.tar.gz.gpg\n")
    return {"encrypted_bundle_created": True, "storage_objects_captured": len(storage_files),
            "storage_bytes_captured": sum(row["bytes"] for row in storage_files),
            "storage_binaries_included": True, "storage_binaries_restored": False,
            "retained_copy_restore_verified": False}

