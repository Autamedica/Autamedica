"""Rehydrate retained Storage object *bytes* into a disposable local Storage API.

Never contacts production/staging and never replays original patient identities,
policies, object versions or Storage metadata. All replay buckets stay PRIVATE.
A successful run proves the retained binaries can be uploaded/read via a fresh
Storage API with matching SHA-256, NOT full original Storage service recovery.

Run with --synthetic-fixture in CI (no GPG/private files), or with an independent
escrow key and local retained ciphertext on a trusted, private recovery machine.
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import tempfile
from urllib.parse import quote, urlsplit
from uuid import uuid4

import restore_retained_bundle as restore
import retained_recovery_bundle as retained
import test_storage_api_isolated as fixture

PROJECT = "autamedica-retained-storage-api"
CONTAINER = "supabase_db_" + PROJECT
FIXTURE_BUCKET = fixture.BUCKET
MAX_OBJECT_SIZE = 1024 ** 3
LIMIT = "1GiB"
DENIAL = {400, 401, 403, 404}
EXPECTED_PROJECT = restore.drill.PROJECT


def check_no_cloud_credentials():
    forbidden = ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_URL", "SUPABASE_DB_PASSWORD",
                 "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL", "DATABASE_URL",
                 "PGPASSWORD", "PGHOST", "PGPORT")
    if any(os.environ.get(name) for name in forbidden):
        raise RuntimeError("Production-like environment credentials detected; refusing real Storage replay")


def assert_empty_local_stack():
    for port in (54321, 54322, 54323):
        with socket.socket() as client:
            client.settimeout(0.25)
            if client.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError("Existing local Supabase stack on common port; refusing reuse")
    if fixture.run(["docker", "ps", "-aq", "--filter", "name=^/" + CONTAINER + "$"],
                   None, "Check clean retained Storage destination").strip():
        raise RuntimeError("Retained Storage destination already exists; refusing reuse")


def prepare_config(work):
    fixture.run(["supabase", "init"], work, "Initialize private Storage replay", timeout=60)
    config = Path(work) / "supabase/config.toml"
    text = config.read_text()
    text, pid_matches = re.subn(r'(?m)^project_id = "[^"]+"$',
                                'project_id = "' + PROJECT + '"', text)
    text, size_matches = re.subn(r'(?m)^file_size_limit = "[^"]+"$',
                                 'file_size_limit = "' + LIMIT + '"', text, count=1)
    if pid_matches != 1 or size_matches != 1:
        raise RuntimeError("Unknown pinned Supabase CLI configuration; cannot guarantee replay limits")
    config.write_text(text)


def object_endpoint(bucket, name):
    # Apply the original project's strict path validation; never interpret as local paths.
    retained.object_url(bucket, name)
    if bucket == FIXTURE_BUCKET:
        raise RuntimeError("Retained inventory collides with reserved synthetic bucket")
    return "/storage/v1/object/" + quote(bucket, safe="") + "/" + quote(name, safe="/")


def call_local(api, method, path, api_key, bearer, *, input_file=None,
               expected_size=None, expected_digest=None):
    """Stream upload/download; no redirects, proxies, names, secrets or bytes logged."""
    base = fixture.validate_local_url(api)
    parsed = urlsplit(base)
    if not path.startswith("/") or path.startswith("//") or "://" in path:
        raise RuntimeError("Invalid local Storage path")
    connection = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=120)
    headers = {"apikey": api_key, "Authorization": "Bearer " + bearer}
    try:
        if input_file is not None:
            source = Path(input_file)
            if not source.is_file() or source.is_symlink():
                raise RuntimeError("Storage replay source is not a regular file")
            size = source.stat().st_size
            if size > MAX_OBJECT_SIZE or size != expected_size:
                raise RuntimeError("Unexpected Storage replay source size")
            headers.update({"Content-Type": "application/octet-stream",
                            "Content-Length": str(size),
                            "Cache-Control": "no-store"})
            with source.open("rb") as body:
                connection.request(method, path, body=body, headers=headers)
        else:
            connection.request(method, path, headers=headers)
        response = connection.getresponse()
        status = response.status
        # HTTPConnection does not follow redirects, even to other loopback ports.
        if status in (301, 302, 303, 307, 308):
            raise RuntimeError("Storage redirect refused")
        if method == "GET" and status == 200 and expected_size is not None:
            digest = hashlib.sha256()
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > expected_size:
                    raise RuntimeError("Storage API returned more bytes than retained inventory")
                digest.update(chunk)
            if total != expected_size or digest.hexdigest() != expected_digest:
                raise RuntimeError("Storage API download failed retained SHA-256 verification")
        else:
            # Never parse or print a response body; server may echo object names.
            response.read(4096)
        return status
    except (OSError, http.client.HTTPException, TimeoutError):
        raise RuntimeError("Isolated Storage API operation failed; private diagnostics withheld") from None
    finally:
        connection.close()


def check_manifest(manifest, root, expected_objects):
    if not isinstance(manifest, dict) or manifest.get("project") != EXPECTED_PROJECT:
        raise RuntimeError("Unexpected retained project")
    files = manifest.get("storage_files")
    buckets = manifest.get("storage_inventory", {}).get("buckets")
    if not isinstance(files, list) or not isinstance(buckets, list):
        raise RuntimeError("Storage inventory absent")
    if len(files) != expected_objects:
        raise RuntimeError("Retained object count does not match approved drill")
    ids = set()
    for b in buckets:
        if not isinstance(b, dict) or not isinstance(b.get("id"), str):
            raise RuntimeError("Invalid retained bucket definition")
        bid = b["id"]
        object_endpoint(bid, "fixture")
        if bid in ids:
            raise RuntimeError("Duplicate bucket in retained inventory")
        ids.add(bid)
    if not ids and files:
        raise RuntimeError("Retained Storage has objects but no buckets")
    keys = set()
    for row in files:
        bucket, name = row["bucket_id"], row["name"]
        object_endpoint(bucket, name)
        if bucket not in ids or (bucket, name) in keys:
            raise RuntimeError("Retained Storage identity missing or duplicate")
        keys.add((bucket, name))
        source = Path(root) / row["file"]
        if not source.is_file() or source.is_symlink():
            raise RuntimeError("Retained Storage object file missing")
        size, digest = row["bytes"], row["sha256"]
        if not isinstance(size, int) or size < 0 or size > MAX_OBJECT_SIZE:
            raise RuntimeError("Retained object exceeds supported size")
        if not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise RuntimeError("Retained Storage digest malformed")
        if source.stat().st_size != size:
            raise RuntimeError("Retained Storage size mismatch")
        with source.open("rb") as handle:
            if hashlib.file_digest(handle, "sha256").hexdigest() != digest:
                raise RuntimeError("Retained Storage object integrity mismatch")
    return sorted(ids)


def replay(api, anon, service, manifest, components, expected_objects):
    ids = check_manifest(manifest, components, expected_objects)
    for bid in ids:
        # Intentional isolation: every replay bucket is PRIVATE regardless of
        # original public flag; original policy/metadata restoration is excluded.
        code, _ = fixture.api_request(api, "POST", "/storage/v1/bucket",
                                      service, service,
                                      json.dumps({"id": bid, "name": bid,
                                                  "public": False}).encode(),
                                      "application/json")
        fixture.require_status(code, {200, 201}, "Create private replay bucket")

    # Independent synthetic owner/other/anon RLS test on the SAME local API.
    fixture.setup_private_policy(None, container=CONTAINER)
    synthetic = fixture.check_permissions(api, anon, service)
    _, other_token = fixture.create_user(api, anon, service, "replay-other")

    verified = 0
    for row in manifest["storage_files"]:
        endpoint = object_endpoint(row["bucket_id"], row["name"])
        source = Path(components) / row["file"]
        status = call_local(api, "POST", endpoint, service, service,
                            input_file=source, expected_size=row["bytes"])
        if status not in (200, 201):
            raise RuntimeError("Retained Storage API upload rejected object #" + str(verified + 1))
        status = call_local(api, "GET", endpoint.replace("/storage/v1/object/", "/storage/v1/object/authenticated/", 1),
                            service, service, expected_size=row["bytes"], expected_digest=row["sha256"])
        if status != 200:
            raise RuntimeError("Retained Storage API download rejected object #" + str(verified + 1))
        protected = endpoint.replace("/storage/v1/object/", "/storage/v1/object/authenticated/", 1)
        public = endpoint.replace("/storage/v1/object/", "/storage/v1/object/public/", 1)
        for label, test_path, apikey, bearer in (
            ("other", protected, anon, other_token),
            ("anon", protected, anon, None),
            ("public", public, anon, None),
        ):
            # HEAD tests the same download permission without exposing clinical bytes.
            check = call_local(api, "HEAD", test_path, apikey, bearer or anon)
            if check not in DENIAL:
                raise RuntimeError("Retained private Storage access gate failed: " + label)
        verified += 1
        if verified % 50 == 0 or verified == expected_objects:
            print("Local Storage API replay verified: " + str(verified) + "/" + str(expected_objects), flush=True)
    return {"retained_objects_served_with_sha256": verified,
            "retained_api_bytes_verified": True,
            "retained_replay_all_buckets_private": True,
            "retained_replay_anonymous_denied": True,
            "retained_replay_other_user_denied": True,
            "retained_original_metadata_exact": False,
            "retained_original_rls_verified": False,
            "storage_service_restore_verified": False,
            **synthetic}


def assert_loopback_docker_ports(work):
    """Reject any Docker host port listening beyond the recovery host loopback."""
    ids = fixture.run(["docker", "ps", "-aq",
                       "--filter", "label=com.supabase.cli.project=" + PROJECT],
                      work, "Inspect only local replay services", timeout=30).split()
    if not ids:
        raise RuntimeError("Private replay stack has no identified containers")
    for container in ids:
        details = json.loads(fixture.run(["docker", "inspect", container],
                                         work, "Inspect local replay port bindings", timeout=30))[0]
        ports = details.get("NetworkSettings", {}).get("Ports", {})
        for bindings in ports.values():
            for binding in bindings or []:
                if binding.get("HostIp") not in ("127.0.0.1", "::1"):
                    raise RuntimeError("Replay service has non-loopback host port; refusing clinical data")


def exercise_stack(root, manifest, components, expected_objects):
    assert_empty_local_stack()
    with tempfile.TemporaryDirectory(prefix="autamedica-private-storage-stack-") as work:
        prepare_config(work)
        network = "autamedica-storage-replay-" + uuid4().hex[:12]
        fixture.run(["docker", "network", "create", "--driver", "bridge",
                     "-o", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
                     network], work, "Create private replay network", timeout=30)
        attempted = False
        result = None
        try:
            attempted = True
            fixture.run(["supabase", "start", "--network-id", network,
                         "--exclude", fixture.EXCLUDE],
                        work, "Start private replay stack", timeout=900)
            status = json.loads(fixture.run(["supabase", "status", "--output", "json"],
                                             work, "Read private replay credentials", timeout=60))
            api, anon, service = fixture.validate_status(status)
            assert_loopback_docker_ports(work)
            result = replay(api, anon, service, manifest, components, expected_objects)
        finally:
            try:
                if attempted:
                    fixture.run(["supabase", "stop", "--no-backup"], work,
                                "Destroy private replay stack", timeout=180)
            finally:
                fixture.run(["docker", "network", "rm", network], work,
                            "Destroy private replay network", timeout=45)
        if fixture.run(["docker", "ps", "-aq", "--filter",
                        "name=^/" + CONTAINER + "$"], work,
                       "Verify replay cleanup", timeout=30).strip():
            raise RuntimeError("Private Storage replay database remained after cleanup")
        return result


def synthetic_fixture(root):
    components = Path(root) / "components"
    (components / "storage").mkdir(parents=True, mode=0o700)
    buckets = [{"id": "autamedica-retained-a"}, {"id": "autamedica-retained-b"}]
    objects = []
    for bid, name, body in (
        ("autamedica-retained-a", "synthetic/folder/test.bin", b"synthetic file 1\n"),
        ("autamedica-retained-b", "synthetic/file 2.bin", b"\x00synthetic file 2\n"),
    ):
        identity = (bid, name)
        relative = "storage/" + hashlib.sha256(json.dumps(identity).encode()).hexdigest() + ".bin"
        (components / relative).write_bytes(body)
        objects.append({"bucket_id": bid, "name": name, "file": relative,
                        "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
    return {"project": EXPECTED_PROJECT, "storage_files": objects,
            "storage_inventory": {"buckets": buckets}}, components


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic-fixture", action="store_true")
    parser.add_argument("--bundle")
    parser.add_argument("--sha256")
    parser.add_argument("--key-file")
    parser.add_argument("--key-passphrase-file")
    parser.add_argument("--expected-objects", type=int)
    parser.add_argument("--confirm")
    args = parser.parse_args()
    os.umask(0o077)
    check_no_cloud_credentials()
    if shutil.disk_usage(tempfile.gettempdir()).free < 4 * 1024 ** 3:
        raise RuntimeError("Less than 4 GiB free for safe private Storage replay")
    if args.synthetic_fixture:
        if any((args.bundle, args.sha256, args.key_file, args.key_passphrase_file,
                args.expected_objects, args.confirm)):
            raise RuntimeError("Synthetic fixture must not receive real recovery inputs")
    else:
        if args.confirm != "REPLAY-STORAGE-API-" + EXPECTED_PROJECT:
            raise RuntimeError("Exact retained Storage replay confirmation required")
        if not all((args.bundle, args.sha256, args.key_file)) or not args.expected_objects:
            raise RuntimeError("Local retained ciphertext, checksum, key and expected count required")

    with tempfile.TemporaryDirectory(prefix="autamedica-retained-storage-private-") as private:
        if args.synthetic_fixture:
            manifest, components = synthetic_fixture(private)
            expected = len(manifest["storage_files"])
        else:
            decrypted = restore.decrypt(args.bundle, args.sha256,
                                        args.key_file, private, args.key_passphrase_file)
            components = Path(private) / "components"
            manifest = restore.unpack_verified(decrypted, components)
            expected = args.expected_objects
        status = exercise_stack(private, manifest, components, expected)
    print(json.dumps({"storage_api_byte_replay_verified": True,
                      "synthetic_fixture": args.synthetic_fixture,
                      "production_recovery_accredited": False,
                      "source_connection_used": False,
                      "temporary_private_copy_destroyed": True,
                      "escrow_files_deleted": False,
                      **status}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # No SQL, object paths, secrets or sensitive raw HTTP diagnostics.
        label = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        print("::error::Retained Storage API replay failed: " + label, flush=True)
        raise SystemExit(1) from None
