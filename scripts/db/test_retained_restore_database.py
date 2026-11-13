"""CI-only end-to-end retained restore with synthetic data, never production.

Build an empty pinned Supabase source, insert integers and synthetic bytes,
retain an encrypted copy, destroy the source, then restore using only that copy.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from unittest.mock import patch

import production_recovery_drill as drill
import retained_recovery_bundle as bundle
import restore_retained_bundle as restore


def main():
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="retained-fixture-") as temporary:
        root = Path(temporary)
        source = root / "source"
        source.mkdir()
        clean = restore.child_environment()
        if drill.run(["docker", "ps", "-aq", "--filter", "name=^/" + drill.CONTAINER + "$"], stage="Check empty fixture destination").strip():
            raise RuntimeError("Fixture destination already exists")
        drill.run(["supabase", "init"], stage="Initialize synthetic source", cwd=source, env=clean)
        config = source / "supabase/config.toml"
        text, count = re.subn(r'(?m)^project_id = ".*"$', 'project_id = "' + drill.LOCAL_PROJECT + '"', config.read_text())
        if count != 1:
            raise RuntimeError("Unexpected fixture config")
        config.write_text(re.sub(r"(?m)^major_version = [0-9]+$", "major_version = 17", text))
        drill.pin_postgres_image(source)
        components = root / "components"
        components.mkdir()
        try:
            print("Preparing isolated synthetic source.", flush=True)
            drill.run(["supabase", "start"], stage="Start synthetic source", cwd=source, env=clean, timeout=900)
            inspection = json.loads(drill.run(["docker", "inspect", drill.CONTAINER], stage="Inspect synthetic source"))[0]
            services = drill.run(["docker", "ps", "-aq", "--filter", "label=com.supabase.cli.project=" + drill.LOCAL_PROJECT], stage="Find fixture services").split()
            others = [c for c in services if not inspection["Id"].startswith(c)]
            if others:
                drill.run(["docker", "stop", *others], stage="Stop synthetic writers")
            drill.local_psql("ALTER SYSTEM SET cron.launch_active_jobs='off'; SELECT pg_reload_conf();")
            for network in inspection["NetworkSettings"]["Networks"]:
                drill.run(["docker", "network", "disconnect", network, drill.CONTAINER], stage="Isolate synthetic source")
            drill.require_offline(json.loads(drill.run(["docker", "inspect", drill.CONTAINER], stage="Verify fixture isolation"))[0])
            drill.local_psql("CREATE TABLE public._retained_fixture(value integer PRIMARY KEY); INSERT INTO public._retained_fixture VALUES (1),(2); ALTER TABLE public._retained_fixture ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_read ON public._retained_fixture FOR SELECT TO anon USING(value=1); GRANT SELECT ON public._retained_fixture TO anon;")
            data = b"SYNTHETIC STORAGE BYTES"
            row = {"bucket_id": "medical-documents", "name": "synthetic/report.pdf"}
            drill.local_psql("INSERT INTO storage.buckets(id,name,public) VALUES ('medical-documents','medical-documents',false); INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('medical-documents','synthetic/report.pdf',jsonb_build_object('size'," + str(len(data)) + ",'eTag','" + hashlib.md5(data, usedforsecurity=False).hexdigest() + "'));")
            scopes = ",".join(drill.literal(s) for s in drill.SCOPES)
            tables = json.loads(drill.local_psql("SELECT jsonb_agg(x ORDER BY x.schema,x.name) FROM (SELECT n.nspname AS schema,c.relname AS name,array_agg(a.attname ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE c.relkind IN ('r','p') AND n.nspname IN (" + scopes + ") GROUP BY n.nspname,c.relname) x;"))
            extensions = json.loads(drill.local_psql("SELECT jsonb_agg(jsonb_build_array(e.extname,n.nspname,e.extversion) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace;"))
            foreign_keys = json.loads(drill.local_psql(drill.foreign_key_catalog_sql()))
            manifest = {"postgres_image_version": drill.POSTGRES_IMAGE_VERSION,
                        "extensions": extensions, "tables": tables,
                        "expected_data": json.loads(drill.local_psql("SET timezone='UTC'; SET search_path=''; " + drill.table_manifest_sql(tables))),
                        "expected_metadata": json.loads(drill.local_psql("SET search_path=''; " + drill.metadata_sql())),
                        "table_acls": json.loads(drill.local_psql(drill.table_acl_catalog_sql())),
                        "foreign_keys": foreign_keys,
                        "storage_inventory": json.loads(drill.local_psql(bundle.inventory_sql())),
                        "database_restore_verified_before_packaging": True,
                        "synthetic_fixture_only": True}
            # Use the actual production CLI transformations (including safe
            # schema creation), not a similar-looking raw pg_dump archive.
            # This source is already offline with its writers stopped, so no
            # live exported snapshot is needed for the synthetic fixture.
            for part, flags, section in (("roles", ["--role-only"], None),
                                         ("schema-pre", [], "pre-data"),
                                         ("data", ["--data-only", "--use-copy"], None),
                                         ("schema-post", [], "post-data")):
                script = drill.run(["supabase", "db", "dump", "--db-url",
                    "postgresql://supabase_admin:postgres@127.0.0.1:5432/postgres?sslmode=disable",
                    "--dry-run", *flags], stage="Build synthetic production-format export", cwd=source, env=clean)
                if section:
                    pattern = r"(?m)^pg_dump \\[ \t]*$"
                    if len(re.findall(pattern, script)) != 1:
                        raise RuntimeError("Unrecognized pinned fixture export script")
                    script = re.sub(pattern, lambda _: "pg_dump --section=" + section + " \\", script, count=1)
                    script = drill.include_managed_schema(script)
                if part == "data":
                    script = drill.include_managed_migration_data(script)
                with (components / (part + ".sql")).open("w") as output:
                    drill.run(["docker", "exec", "-i", drill.CONTAINER, "bash", "-s"],
                              stage="Export synthetic native section", input_text=script, output=output)
            manifest["sql_checksums"] = {part: hashlib.sha256((components / (part + ".sql")).read_bytes()).hexdigest() for part in bundle.SQL_PARTS}
            filename = "storage/" + hashlib.sha256(json.dumps((row["bucket_id"], row["name"])).encode()).hexdigest() + ".bin"
            (components / "storage").mkdir()
            (components / filename).write_bytes(data)
            storage = [dict(row, file=filename, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())]
        finally:
            drill.run(["supabase", "stop", "--no-backup"], stage="Destroy synthetic source", cwd=source, env=clean, timeout=120)
        # No source container exists from this point forward.
        print("Synthetic source destroyed; preparing encrypted retained copy.", flush=True)
        if drill.run(["docker", "ps", "-aq", "--filter", "name=^/" + drill.CONTAINER + "$"], stage="Prove synthetic source unavailable").strip():
            raise RuntimeError("Synthetic source still available")
        keys = root / "fixture-keys"
        keys.mkdir(mode=0o700)
        try:
            bundle.gpg(keys, "--pinentry-mode", "loopback", "--passphrase", "", "--quick-generate-key", "Synthetic retained restore fixture", "rsa2048", "encr", "1d")
            fingerprint = next(line.split(":")[9] for line in bundle.gpg(keys, "--with-colons", "--fingerprint", "--list-keys").splitlines() if line.startswith("fpr:"))
            private = root / "fixture-escrow.asc"
            private.write_text(bundle.gpg(keys, "--armor", "--export-secret-keys", fingerprint))
            public = bundle.gpg(keys, "--armor", "--export", fingerprint)
            output = root / "retained"
            with patch.dict(os.environ, {"RECOVERY_BACKUP_PUBLIC_KEY": public, "RECOVERY_BACKUP_FINGERPRINT": fingerprint}):
                bundle.encrypt_bundle(components, manifest, storage, output)
            replay = root / "replay"
            replay.mkdir()
            archive = restore.decrypt(output / "recovery.tar.gz.gpg", (output / "SHA256SUMS").read_text().split()[0], private, replay)
            recovered = restore.unpack_verified(archive, replay / "components")
            with patch.object(bundle, "build_opener", side_effect=AssertionError("Unexpected source API access")):
                print("Restoring from retained synthetic components only.", flush=True)
                restore.restore_database(replay, recovered)
                restore.verify_storage(recovered, replay / "components")
        finally:
            import subprocess
            subprocess.run(["gpgconf", "--homedir", str(keys), "--kill", "gpg-agent"], check=True, capture_output=True, timeout=15)
    print(json.dumps({"synthetic_retained_database_restore_verified": True,
                      "synthetic_retained_storage_bytes_verified": True,
                      "source_destroyed_before_restore": True,
                      "production_credentials_used": False,
                      "production_recovery_accredited": False}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, RuntimeError) else "Synthetic retained restore failed (" + type(error).__name__ + "); private diagnostics withheld"
        print("::error::" + message, flush=True)
        raise SystemExit(1) from None
