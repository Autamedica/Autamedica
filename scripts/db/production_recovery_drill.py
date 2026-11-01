"""Restore a consistent production DB export into an offline disposable Supabase DB.

No backups or raw logs are uploaded. Production is only ever read. Storage binaries,
Vault secrets, external provider settings and deployed functions are outside this drill.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shlex
import subprocess
import tempfile
import time

from check_recovery_source import PROJECT, SESSION_HOST, connection_options, probe

LOCAL_PROJECT = "autamedica-recovery-drill"
CONTAINER = "supabase_db_" + LOCAL_PROJECT
SCOPES = ("public", "app_private", "growth_os", "auth", "storage")


def run(args, *, stage, cwd=None, env=None, input_text=None, output=None, timeout=600):
    try:
        result = subprocess.run(args, cwd=cwd, env=env, input=input_text,
                                stdout=output if output else subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, timeout=timeout,
                                check=False)
    except subprocess.TimeoutExpired:
        raise RuntimeError(stage + " timed out; private output withheld") from None
    if result.returncode:
        # Do not expose pg_dump/psql output: errors can include a clinical row.
        codes = re.findall(r"ERROR:\s+([0-9A-Z]{5})\b", result.stderr)
        diagnostic = " SQLSTATE=" + ",".join(sorted(set(codes))) if codes else ""
        locations = re.findall(r"psql:/recovery/((?:roles|schema|data)\.sql:[0-9]+):", result.stderr)
        if locations:
            diagnostic += " at " + ",".join(sorted(set(locations)))
        raise RuntimeError(stage + " failed (exit " + str(result.returncode) + ")" + diagnostic)
    return result.stdout or ""


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def with_snapshot(script, snapshot):
    if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snapshot):
        raise RuntimeError("Invalid exported snapshot identifier")
    if len(re.findall(r"(?m)^pg_dump \\[ \t]*$", script)) != 1:
        raise RuntimeError("Unrecognized pinned CLI pg_dump script")
    return re.sub(r"(?m)^pg_dump \\[ \t]*$",
                  lambda _: "pg_dump --snapshot=" + shlex.quote(snapshot) + " \\",
                  script, count=1)


def include_managed_schema(script):
    match = re.search(r'--exclude-schema "([^"]+)"', script)
    if not match:
        raise RuntimeError("Pinned CLI schema exclusion list missing")
    excluded = match.group(1).split("|")
    if "auth" not in excluded or "storage" not in excluded:
        raise RuntimeError("Pinned CLI managed schema exclusions changed")
    return script.replace(match.group(1), "|".join(s for s in excluded if s not in ("auth", "storage")))


def include_managed_migration_data(script):
    for table in ("auth.schema_migrations", "storage.migrations"):
        pattern = r'(?m)^[ \t]*--exclude-table "' + re.escape(table) + r'" \\[ \t]*\n'
        script, count = re.subn(pattern, "", script)
        if count != 1:
            raise RuntimeError("Pinned CLI managed migration exclusion changed")
    return script


def metadata_sql():
    scopes = ",".join(literal(s) for s in SCOPES)
    return """
SELECT json_build_object(
 'rls',(SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'')) FROM (
   SELECT jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity) x
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN (%s) AND c.relkind IN ('r','p')) q),
 'policies',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname)::text,''))
   FROM pg_policies p WHERE schemaname IN (%s)),
 'table_grants',(SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'')) FROM (
   SELECT jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(a.grantor),
     CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     a.privilege_type,a.is_grantable) x
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a
   WHERE n.nspname IN (%s) AND c.relkind IN ('r','p','v','m','S')) q),
 'function_grants',(SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'')) FROM (
   SELECT jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
     CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     a.privilege_type,a.is_grantable) x
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE n.nspname IN (%s) AND NOT EXISTS (
     SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
       AND d.objid=p.oid AND d.deptype='e')) q),
 'functions',(SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'')) FROM (
   SELECT jsonb_build_array(n.nspname,p.proname,pg_get_userbyid(p.proowner),
     pg_get_functiondef(p.oid)) x FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN (%s) AND p.prokind IN ('f','p') AND NOT EXISTS (
     SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass
       AND d.objid=p.oid AND d.deptype='e')) q),
 'constraints',(SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'')) FROM (
   SELECT jsonb_build_array(n.nspname,r.relname,c.conname,c.convalidated,
     pg_get_constraintdef(c.oid,true)) x FROM pg_constraint c
   JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE n.nspname IN (%s)) q),
 'triggers',(SELECT md5(coalesce(jsonb_agg(x ORDER BY x::text)::text,'')) FROM (
   SELECT jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) x
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN (%s) AND NOT t.tgisinternal) q));
""" % (scopes, scopes, scopes, scopes, scopes, scopes, scopes)


def table_manifest_sql(tables):
    parts = []
    for table in tables:
        schema, name, columns = table["schema"], table["name"], table["columns"]
        if schema not in SCOPES:
            raise RuntimeError("Unexpected manifest table")
        projection = ",".join(ident(c) for c in columns)
        label = literal(schema + "." + name)
        parts.append("SELECT jsonb_build_array(" + label + ",count(*),"
                     "md5(coalesce(string_agg(h,'' ORDER BY h),''))) AS x FROM "
                     "(SELECT md5(to_jsonb(r)::text) h FROM (SELECT " + projection +
                     " FROM " + ident(schema) + "." + ident(name) + ") r) rows")
    if not parts:
        raise RuntimeError("No source tables selected")
    return "SELECT coalesce(jsonb_agg(x ORDER BY x->>0),'[]'::jsonb) FROM (" + " UNION ALL ".join(parts) + ") all_tables;"


def foreign_key_sql(keys):
    checks = []
    for key in keys:
        child = ident(key["schema"]) + "." + ident(key["table"])
        parent = ident(key["parent_schema"]) + "." + ident(key["parent_table"])
        columns, referenced = key["columns"], key["referenced"]
        if not columns or len(columns) != len(referenced) or key["match"] not in ("s", "f"):
            raise RuntimeError("Unsupported foreign key shape")
        nonnull = " AND ".join("c." + ident(c) + " IS NOT NULL" for c in columns)
        equal = " AND ".join("p." + ident(p) + "=c." + ident(c) for c, p in zip(columns, referenced))
        invalid = "(" + nonnull + ") AND NOT EXISTS (SELECT 1 FROM " + parent + " p WHERE " + equal + ")"
        if key["match"] == "f":
            any_nonnull = " OR ".join("c." + ident(c) + " IS NOT NULL" for c in columns)
            invalid = "(" + invalid + ") OR ((" + any_nonnull + ") AND NOT (" + nonnull + "))"
        checks.append("SELECT count(*) AS n FROM " + child + " c WHERE " + invalid)
    return "SELECT coalesce(sum(n),0) FROM (" + " UNION ALL ".join(checks) + ") violations;" if checks else "SELECT 0;"


def foreign_key_catalog_sql():
    scopes = ",".join(literal(s) for s in SCOPES)
    return """SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT n.nspname AS schema,r.relname AS table,pn.nspname AS parent_schema,
        p.relname AS parent_table,c.confmatchtype AS match,
        (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(num,ord)
          JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num) AS columns,
        (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(num,ord)
          JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num) AS referenced
      FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_class p ON p.oid=c.confrelid
      JOIN pg_namespace pn ON pn.oid=p.relnamespace
      WHERE c.contype='f' AND n.nspname IN (%s)) x;""" % scopes


class Snapshot:
    def __init__(self, env, log):
        self.process = subprocess.Popen(
            ["psql", "-X", "--no-password", "-qAt", "-v", "ON_ERROR_STOP=1"],
            env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)

    def query(self, sql):
        self.process.stdin.write(sql + "\n")
        self.process.stdin.flush()
        if not self.selector.select(timeout=120):
            raise RuntimeError("Snapshot query timed out")
        line = self.process.stdout.readline().strip()
        if not line:
            raise RuntimeError("Snapshot query failed; raw error withheld")
        return line

    def close(self):
        try:
            self.process.communicate("ROLLBACK;\n\\q\n", timeout=10)
        except (BrokenPipeError, subprocess.TimeoutExpired):
            self.process.kill()
            self.process.wait(timeout=10)
        self.selector.close()


def extension_setup_sql(name, schema):
    # PostgreSQL rejects even CREATE SCHEMA IF NOT EXISTS pg_catalog: reserved
    # names are checked before existence. This namespace is already provided.
    create_schema = "" if schema in ("pg_catalog", "public") else "CREATE SCHEMA IF NOT EXISTS " + ident(schema) + "; "
    return create_schema + "CREATE EXTENSION IF NOT EXISTS " + ident(name) + " WITH SCHEMA " + ident(schema) + ";"


def local_psql(sql=None, files=(), stage="Offline destination SQL"):
    if CONTAINER != "supabase_db_autamedica-recovery-drill":
        raise RuntimeError("Unexpected restore destination")
    args = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt",
            "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"]
    if files:
        args.append("--single-transaction")
        for file in files:
            args.extend(["-f", "/recovery/" + file])
    return run(args, stage=stage, input_text=sql, timeout=600)


def require_offline(inspection):
    if inspection.get("Name") != "/" + CONTAINER:
        raise RuntimeError("Unexpected destination container")
    if inspection.get("NetworkSettings", {}).get("Networks"):
        raise RuntimeError("Restore destination still has network access")
    mode = inspection.get("HostConfig", {}).get("NetworkMode", "")
    if mode in ("host", "container") or mode.startswith("container:"):
        raise RuntimeError("Restore destination uses an unsafe network mode")


def main():
    if os.environ.get("RECOVERY_DRILL_CONFIRMATION") != "RESTORE-" + PROJECT:
        raise RuntimeError("Exact source project confirmation required")
    url, password = os.environ.get("SUPABASE_DB_URL", ""), os.environ.get("SUPABASE_DB_PASSWORD", "")
    options = connection_options(url, password)
    if options["PGHOST"] != SESSION_HOST or options["PGPASSWORD"] != password or not re.fullmatch(r"[a-fA-F0-9]{64}", password):
        raise RuntimeError("Source connection is not the staged production session credential")
    # CLI receives only the validated canonical endpoint, never URI query options.
    url = "postgresql://" + options["PGUSER"] + ":" + password + "@" + SESSION_HOST + ":5432/postgres?sslmode=require"
    probe(options)
    source_env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    source_env.update(options)
    source_env["PGOPTIONS"] = "-c default_transaction_read_only=on -c statement_timeout=90000 -c timezone=UTC -c search_path="
    clean_env = {k: v for k, v in os.environ.items() if not k.startswith(("PG", "SUPABASE_"))}
    clean_env["LC_ALL"] = "C"
    os.umask(0o077)
    started = time.monotonic()
    existing = run(["docker", "ps", "-aq", "--filter", "name=^/" + CONTAINER + "$"], stage="Check fresh destination")
    if existing.strip():
        raise RuntimeError("Disposable destination already exists; refusing reuse")
    with tempfile.TemporaryDirectory(prefix="autamedica-recovery-") as temporary:
        root = Path(temporary)
        work = root / "stack"
        work.mkdir()
        run(["supabase", "init"], stage="Initialize disposable stack", cwd=work, env=clean_env)
        config = work / "supabase" / "config.toml"
        text = config.read_text()
        text, count = re.subn(r'(?m)^project_id = ".*"$', 'project_id = "' + LOCAL_PROJECT + '"', text)
        text = re.sub(r"(?m)^major_version = [0-9]+$", "major_version = 17", text)
        if count != 1:
            raise RuntimeError("Unrecognized fresh Supabase configuration")
        config.write_text(text)
        try:
            print("Starting an empty disposable Supabase stack.", flush=True)
            run(["supabase", "start"], stage="Start disposable stack", cwd=work, env=clean_env, timeout=900)
            print("Empty stack ready; inspecting the fixed destination.", flush=True)
            inspect = json.loads(run(["docker", "inspect", CONTAINER], stage="Inspect target"))[0]
            if inspect["Name"] != "/" + CONTAINER:
                raise RuntimeError("Destination identity mismatch")
            dump_started = time.monotonic()
            with (root / "source-private.log").open("w") as source_log:
                snapshot = Snapshot(source_env, source_log)
                try:
                    print("Opening read-only source snapshot.", flush=True)
                    snapshot_id = snapshot.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();")
                    scopes = ",".join(literal(s) for s in SCOPES)
                    tables = json.loads(snapshot.query("SELECT jsonb_agg(x ORDER BY x.schema,x.name) FROM ("
                        "SELECT n.nspname AS schema,c.relname AS name,array_agg(a.attname ORDER BY a.attnum) AS columns "
                        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                        "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped "
                        "WHERE c.relkind IN ('r','p') AND n.nspname IN (" + scopes + ") "
                        "GROUP BY n.nspname,c.relname) x;"))
                    print("Source catalog captured; verifying source fingerprints and constraints.", flush=True)
                    manifest_query = table_manifest_sql(tables)
                    expected_data = json.loads(snapshot.query(manifest_query))
                    expected_metadata = json.loads(snapshot.query(metadata_sql()))
                    foreign_keys = json.loads(snapshot.query(foreign_key_catalog_sql()))
                    foreign_key_query = foreign_key_sql(foreign_keys)
                    if int(snapshot.query(foreign_key_query)) != 0:
                        raise RuntimeError("Source contains foreign key violations; recovery cannot be accredited")
                    extensions = json.loads(snapshot.query("SELECT jsonb_agg(jsonb_build_array(e.extname,n.nspname)) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace;"))
                    for name, flags in (("roles", ["--role-only"]), ("schema", []), ("data", ["--data-only", "--use-copy"])):
                        print("Exporting " + name + ".", flush=True)
                        script = run(["supabase", "db", "dump", "--db-url", url, "--dry-run", *flags],
                                     stage="Build " + name + " export", cwd=work, env=clean_env)
                        if name != "roles":
                            script = with_snapshot(script, snapshot_id)
                        if name == "schema":
                            script = include_managed_schema(script)
                        if name == "data":
                            script = include_managed_migration_data(script)
                        with (root / (name + ".sql")).open("w") as output:
                            run(["docker", "exec", "-i", "-e", "PGSSLMODE=require", "-e", "PGGSSENCMODE=disable",
                                 "-e", "PGOPTIONS=" + source_env["PGOPTIONS"], CONTAINER, "bash", "-s"],
                                stage="Export " + name, input_text=script, output=output)
                        if (root / (name + ".sql")).stat().st_size == 0:
                            raise RuntimeError("Empty backup component")
                    if snapshot.process.poll() is not None:
                        raise RuntimeError("Source snapshot ended before all exports completed")
                finally:
                    snapshot.close()
            checksums = {name: hashlib.sha256((root / (name + ".sql")).read_bytes()).hexdigest()
                         for name in ("roles", "schema", "data")}
            dump_seconds = round(time.monotonic() - dump_started, 2)
            print("Consistent schema/data export completed; isolating the destination.", flush=True)
            containers = run(["docker", "ps", "-aq", "--filter", "label=com.supabase.cli.project=" + LOCAL_PROJECT], stage="Find disposable services").split()
            target_id = inspect["Id"]
            others = [container for container in containers if not target_id.startswith(container)]
            if others:
                run(["docker", "stop", *others], stage="Stop disposable application services")
            local_psql("ALTER SYSTEM SET cron.launch_active_jobs='off';")
            local_psql("SELECT pg_reload_conf();")
            for network in inspect["NetworkSettings"]["Networks"]:
                run(["docker", "network", "disconnect", network, CONTAINER], stage="Isolate destination")
            offline = json.loads(run(["docker", "inspect", CONTAINER], stage="Verify isolation"))[0]
            require_offline(offline)
            if local_psql("SHOW cron.launch_active_jobs;").strip() != "off":
                raise RuntimeError("Destination cron is not disabled")
            for name, expected_hash in checksums.items():
                file = root / (name + ".sql")
                if hashlib.sha256(file.read_bytes()).hexdigest() != expected_hash:
                    raise RuntimeError("Backup integrity check failed")
            restore_started = time.monotonic()
            # This helper can only address the fixed local container, never the source.
            local_psql("DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; DROP SCHEMA storage CASCADE; CREATE SCHEMA public AUTHORIZATION postgres; ALTER DATABASE postgres SET timezone='UTC';", stage="Reset offline destination schemas")
            for name, schema in extensions:
                local_psql(extension_setup_sql(name, schema), stage="Prepare destination extension " + name)
            run(["docker", "exec", CONTAINER, "mkdir", "-m", "700", "/recovery"], stage="Prepare private target files")
            for name in ("roles", "schema", "data"):
                run(["docker", "cp", str(root / (name + ".sql")), CONTAINER + ":/recovery/" + name + ".sql"], stage="Copy private backup")
            local_psql(files=("roles.sql", "schema.sql", "data.sql"), stage="Atomic database restoration")
            actual_data = json.loads(local_psql("SET timezone='UTC'; SET search_path=''; " + manifest_query).strip())
            actual_metadata = json.loads(local_psql("SET search_path=''; " + metadata_sql()).strip())
            if int(local_psql(foreign_key_query).strip()) != 0:
                raise RuntimeError("Restored foreign key validation failed")
            if actual_data != expected_data:
                raise RuntimeError("Restored data fingerprints differ; no recovery pass issued")
            if actual_metadata != expected_metadata:
                mismatches = [key for key in expected_metadata if actual_metadata.get(key) != expected_metadata[key]]
                raise RuntimeError("Restored security metadata differs: " + ",".join(mismatches))
            require_offline(json.loads(run(["docker", "inspect", CONTAINER], stage="Recheck isolation"))[0])
            report = {"database_restore_verified": True, "verified_tables": len(tables),
                              "rows_verified": sum(row[1] for row in actual_data),
                              "data_fingerprints_match": True, "security_metadata_match": True,
                              "foreign_keys_verified": len(foreign_keys),
                              "source_read_only": True, "destination_offline": True,
                              "snapshot_consistent": True, "export_seconds": dump_seconds,
                              "restore_and_validation_seconds": round(time.monotonic() - restore_started, 2),
                              "total_drill_seconds": round(time.monotonic() - started, 2),
                              "storage_binaries_included": False, "vault_secrets_included": False,
                              "backup_retained": False}
        finally:
            # The disposable runner is an additional cleanup boundary on cancellation.
            run(["supabase", "stop", "--no-backup"], stage="Remove disposable stack", cwd=work, env=clean_env, timeout=120)
            if run(["docker", "ps", "-aq", "--filter", "name=^/" + CONTAINER + "$"], stage="Verify destination removed").strip():
                raise RuntimeError("Disposable destination cleanup incomplete")
    report["cleanup_verified"] = True
    print(json.dumps(report, sort_keys=True), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, RuntimeError) else "Recovery drill stopped (" + type(error).__name__ + "); private diagnostics withheld"
        print("::error::" + message, flush=True)
        raise SystemExit(1) from None
