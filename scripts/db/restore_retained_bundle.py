"""Restore a retained encrypted bundle without contacting production.

Accepts a local ciphertext file, a trusted ciphertext hash and an escrowed key
file. Only the fixed disposable container can receive SQL. Storage bytes are
reconstructed and verified privately, never uploaded to an external service.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import time

import production_recovery_drill as drill
import retained_recovery_bundle as bundle

MAX_ARCHIVE_BYTES = 8 * 1024 ** 3
MAX_MANIFEST_BYTES = 16 * 1024 ** 2


def safe_member(name):
    return name == "recovery.json" or name in [p + ".sql" for p in bundle.SQL_PARTS] or bool(
        re.fullmatch(r"storage/[a-f0-9]{64}\.bin", name))


def unpack_verified(archive_path, destination):
    """Reject links, extra files, duplicates, tampering and inconsistent inventories."""
    destination = Path(destination)
    destination.mkdir(mode=0o700)
    with tarfile.open(archive_path, "r:gz") as archive:
        seen, total = set(), 0
        # Read and validate the full header inventory before writing any file.
        members = []
        for member in archive:
            if not member.isfile() or not safe_member(member.name) or member.name in seen:
                raise RuntimeError("Unsafe or duplicate recovery archive member")
            seen.add(member.name)
            total += member.size
            if total > MAX_ARCHIVE_BYTES or member.size < 0 or len(seen) > 100000:
                raise RuntimeError("Recovery archive exceeds supported limits")
            if member.name == "recovery.json" and member.size > MAX_MANIFEST_BYTES:
                raise RuntimeError("Recovery manifest exceeds supported limit")
            members.append(member)
        if "recovery.json" not in seen:
            raise RuntimeError("Recovery manifest missing")
        manifest = json.load(archive.extractfile("recovery.json"))
        validate_manifest(manifest, seen)
        for member in members:
            if member.name == "recovery.json":
                continue
            target = destination / member.name
            target.parent.mkdir(mode=0o700, exist_ok=True)
            digest = hashlib.sha256()
            with archive.extractfile(member) as source, target.open("xb") as output:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != manifest["checksums"][member.name]:
                raise RuntimeError("Retained component checksum mismatch")
        verify_storage(manifest, destination)
    return manifest


def validate_manifest(manifest, members):
    if manifest.get("format_version") != 1 or manifest.get("project") != drill.PROJECT:
        raise RuntimeError("Unexpected retained bundle format or project")
    if manifest.get("postgres_image_version") != drill.POSTGRES_IMAGE_VERSION:
        raise RuntimeError("Retained bundle requires a different reviewed database image")
    if manifest.get("database_restore_verified_before_packaging") is not True:
        raise RuntimeError("Retained bundle lacks initial restore verification")
    checksums = manifest.get("checksums", {})
    expected = set(checksums) | {"recovery.json"}
    if set(members) != expected or not all(safe_member(name) for name in checksums):
        raise RuntimeError("Retained archive inventory mismatch")
    if not all(isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) for value in checksums.values()):
        raise RuntimeError("Invalid retained checksum")
    sql = manifest.get("sql_checksums", {})
    if set(sql) != set(bundle.SQL_PARTS) or any(
            checksums.get(part + ".sql") != sql[part] for part in bundle.SQL_PARTS):
        raise RuntimeError("Retained SQL inventory mismatch")
    for field in ("extensions", "tables", "expected_data", "table_acls", "foreign_keys", "storage_files"):
        if not isinstance(manifest.get(field), list):
            raise RuntimeError("Retained recovery metadata incomplete")
    if not isinstance(manifest.get("expected_metadata"), dict):
        raise RuntimeError("Retained security metadata missing")
    identities, files = set(), set()
    for row in manifest["storage_files"]:
        identity = (row["bucket_id"], row["name"])
        bundle.object_url(*identity)  # Validation only; never requested.
        if identity in identities or row["file"] in files:
            raise RuntimeError("Duplicate retained Storage identity")
        identities.add(identity)
        files.add(row["file"])
        filename = hashlib.sha256(json.dumps(identity).encode()).hexdigest() + ".bin"
        if row["file"] != "storage/" + filename or checksums.get(row["file"]) != row["sha256"]:
            raise RuntimeError("Retained Storage identity or checksum mismatch")
        if type(row["bytes"]) is not int or row["bytes"] < 0:
            raise RuntimeError("Retained Storage size invalid")
    if set(checksums) != {p + ".sql" for p in bundle.SQL_PARTS} | files:
        raise RuntimeError("Unmapped retained component")
    inventory = manifest.get("storage_inventory", {}).get("objects", [])
    if len(inventory) != len(identities) or {(r["bucket_id"], r["name"]) for r in inventory} != identities:
        raise RuntimeError("Retained Storage snapshot inventory mismatch")


def verify_storage(manifest, destination):
    for row in manifest["storage_files"]:
        path = Path(destination) / row["file"]
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if path.stat().st_size != row["bytes"] or digest != row["sha256"]:
            raise RuntimeError("Reconstructed Storage bytes mismatch")


def decrypt(ciphertext, trusted_sha256, key_file, root, passphrase_file=None):
    if not re.fullmatch(r"[a-f0-9]{64}", trusted_sha256):
        raise RuntimeError("Trusted ciphertext SHA-256 required")
    with Path(ciphertext).open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != trusted_sha256:
            raise RuntimeError("Retained ciphertext checksum mismatch")
    home = Path(root) / "keys"
    home.mkdir(mode=0o700)
    try:
        # Input bytes remain private; GPG diagnostics are never forwarded.
        bundle.gpg(home, "--import", str(Path(key_file).resolve()))
        output = Path(root) / "decrypted.tar.gz"
        passphrase_args = ["--passphrase-file", str(Path(passphrase_file).resolve())] if passphrase_file else []
        bundle.gpg(home, "--pinentry-mode", "loopback", *passphrase_args,
                   "--output", str(output), "--decrypt", str(Path(ciphertext).resolve()))
        return output
    finally:
        # Removing files alone does not evict a cached escrow key/passphrase.
        result = subprocess.run(["gpgconf", "--homedir", str(home), "--kill", "gpg-agent"],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15, check=False)
        if result.returncode:
            raise RuntimeError("Recovery key agent cleanup failed; private diagnostics withheld")


def child_environment():
    # Source credentials cannot reach CLI, container setup or restored code.
    return {key: value for key, value in os.environ.items()
            if not key.startswith(("PG", "SUPABASE_", "RECOVERY_"))} | {"LC_ALL": "C"}


def restore_database(root, manifest):
    work = Path(root) / "stack"
    work.mkdir()
    clean = child_environment()
    if drill.run(["docker", "ps", "-aq", "--filter", "name=^/" + drill.CONTAINER + "$"],
                 stage="Check fresh retained-copy destination").strip():
        raise RuntimeError("Disposable destination already exists; refusing reuse")
    drill.run(["supabase", "init"], stage="Initialize retained-copy stack", cwd=work, env=clean)
    config = work / "supabase/config.toml"
    text, count = re.subn(r'(?m)^project_id = ".*"$', 'project_id = "' + drill.LOCAL_PROJECT + '"', config.read_text())
    if count != 1:
        raise RuntimeError("Unrecognized fresh Supabase configuration")
    text = re.sub(r"(?m)^major_version = [0-9]+$", "major_version = 17", text)
    config.write_text(text)
    drill.pin_postgres_image(work)
    try:
        drill.run(["supabase", "start"], stage="Start retained-copy stack", cwd=work, env=clean, timeout=900)
        inspect = json.loads(drill.run(["docker", "inspect", drill.CONTAINER], stage="Inspect retained-copy target"))[0]
        if inspect["Name"] != "/" + drill.CONTAINER or not inspect["Config"]["Image"].endswith(":" + drill.POSTGRES_IMAGE_VERSION):
            raise RuntimeError("Retained-copy destination identity or image mismatch")
        for name, schema, version in manifest["extensions"]:
            drill.local_psql(drill.extension_setup_sql(name, schema, version), stage="Prepare retained-copy extensions")
        drill.verify_extensions(manifest["extensions"])
        containers = drill.run(["docker", "ps", "-aq", "--filter", "label=com.supabase.cli.project=" + drill.LOCAL_PROJECT], stage="Find retained-copy services").split()
        others = [container for container in containers if not inspect["Id"].startswith(container)]
        if others:
            drill.run(["docker", "stop", *others], stage="Stop retained-copy application services")
        drill.local_psql("ALTER SYSTEM SET cron.launch_active_jobs='off'; SELECT pg_reload_conf();")
        for network in inspect["NetworkSettings"]["Networks"]:
            drill.run(["docker", "network", "disconnect", network, drill.CONTAINER], stage="Isolate retained-copy destination")
        drill.require_offline(json.loads(drill.run(["docker", "inspect", drill.CONTAINER], stage="Verify retained-copy isolation"))[0])
        if drill.local_psql("SHOW cron.launch_active_jobs;").strip() != "off":
            raise RuntimeError("Retained-copy destination cron active")
        drill.local_psql("DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; DROP SCHEMA storage CASCADE; CREATE SCHEMA public AUTHORIZATION postgres; ALTER DATABASE postgres SET timezone='UTC';")
        for name, schema, version in manifest["extensions"]:
            drill.local_psql(drill.extension_setup_sql(name, schema, version))
        drill.verify_extensions(manifest["extensions"])
        drill.run(["docker", "exec", drill.CONTAINER, "mkdir", "-m", "700", "/recovery"], stage="Prepare retained-copy SQL")
        for part in bundle.SQL_PARTS:
            drill.run(["docker", "cp", str(Path(root) / "components" / (part + ".sql")),
                       drill.CONTAINER + ":/recovery/" + part + ".sql"], stage="Copy retained SQL privately")
        drill.local_psql(files=tuple(part + ".sql" for part in bundle.SQL_PARTS), stage="Restore retained SQL offline")
        drill.reconcile_table_acls(manifest["table_acls"])
        actual_data = json.loads(drill.local_psql("SET timezone='UTC'; SET search_path=''; " + drill.table_manifest_sql(manifest["tables"])))
        actual_metadata = json.loads(drill.local_psql("SET search_path=''; " + drill.metadata_sql()))
        if actual_data != manifest["expected_data"] or actual_metadata != manifest["expected_metadata"]:
            raise RuntimeError("Retained database data or permissions mismatch")
        if int(drill.local_psql(drill.foreign_key_sql(manifest["foreign_keys"])).strip()) != 0:
            raise RuntimeError("Retained foreign key validation failed")
        if json.loads(drill.local_psql(bundle.inventory_sql())) != manifest["storage_inventory"]:
            raise RuntimeError("Restored Storage database inventory mismatch")
        drill.require_offline(json.loads(drill.run(["docker", "inspect", drill.CONTAINER], stage="Recheck retained-copy isolation"))[0])
    finally:
        drill.run(["supabase", "stop", "--no-backup"], stage="Destroy retained-copy destination", cwd=work, env=clean, timeout=120)
        if drill.run(["docker", "ps", "-aq", "--filter", "name=^/" + drill.CONTAINER + "$"], stage="Verify retained-copy cleanup").strip():
            raise RuntimeError("Retained-copy cleanup incomplete")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--sha256", required=True, help="Ciphertext hash from trusted retention evidence")
    parser.add_argument("--key-file", required=True, help="Private key from independent escrow, never a production secret")
    parser.add_argument("--key-passphrase-file", help="Optional protected local passphrase file; never put its contents in arguments")
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()
    if args.confirm != "RESTORE-RETAINED-" + drill.PROJECT:
        raise RuntimeError("Exact retained-copy restoration confirmation required")
    os.umask(0o077)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="autamedica-retained-restore-") as temporary:
        root = Path(temporary)
        archive = decrypt(args.bundle, args.sha256, args.key_file, root, args.key_passphrase_file)
        manifest = unpack_verified(archive, root / "components")
        restore_database(root, manifest)
        verify_storage(manifest, root / "components")
    print(json.dumps({"retained_database_restore_verified": True,
                      "retained_storage_bytes_verified": True,
                      "storage_service_restore_verified": False,
                      "source_connection_used": False, "destination_offline": True,
                      "private_working_copy_destroyed": True,
                      "verified_tables": len(manifest["tables"]),
                      "verified_storage_objects": len(manifest["storage_files"]),
                      "vault_and_external_configuration_restored": False,
                      "seconds": round(time.monotonic() - started, 2)}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, RuntimeError) else "Retained-copy recovery stopped (" + type(error).__name__ + "); private diagnostics withheld"
        print("::error::" + message, flush=True)
        raise SystemExit(1) from None
