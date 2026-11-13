"""Restore a consistent production DB export into an offline disposable Supabase DB.

The default drill uploads no backups or raw logs. Opt-in retention captures Storage
and encrypts the bundle; Vault, external settings and functions remain excluded.
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
import retained_recovery_bundle as retained

LOCAL_PROJECT = "autamedica-recovery-drill"
CONTAINER = "supabase_db_" + LOCAL_PROJECT
# Verified from the production project's read-only management metadata. The
# CLI's default PG17 image can contain a different set of extension packages.
POSTGRES_IMAGE_VERSION = "17.6.1.084"
SCOPES = ("public", "app_private", "growth_os", "auth", "storage")
BACKUP_PARTS = ("roles", "schema-pre", "data", "schema-post")


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
        locations = re.findall(r"psql:/recovery/((?:roles|schema|schema-pre|schema-post|data)\.sql:[0-9]+):", result.stderr)
        if locations:
            diagnostic += " at " + ",".join(sorted(set(locations)))
        for fragment, reason in (("no password supplied", "local_password_required"),
                                 ("password authentication failed", "authentication_failed"),
                                 ("Connection refused", "connection_refused"),
                                 ("No such file or directory", "local_socket_missing")):
            if fragment in result.stderr:
                diagnostic += " reason=" + reason
                break
        raise RuntimeError(stage + " failed (exit " + str(result.returncode) + ")" + diagnostic)
    return result.stdout or ""


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def with_snapshot(script, snapshot, section=None):
    if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", snapshot):
        raise RuntimeError("Invalid exported snapshot identifier")
    if len(re.findall(r"(?m)^pg_dump \\[ \t]*$", script)) != 1:
        raise RuntimeError("Unrecognized pinned CLI pg_dump script")
    if section not in (None, "pre-data", "post-data"):
        raise RuntimeError("Unexpected schema export section")
    section_flag = " --section=" + section if section else ""
    return re.sub(r"(?m)^pg_dump \\[ \t]*$",
                  lambda _: "pg_dump --snapshot=" + shlex.quote(snapshot) + section_flag + " \\",
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


def table_acl_catalog_sql():
    scopes = ",".join(literal(s) for s in SCOPES)
    return """SELECT coalesce(jsonb_agg(x ORDER BY x.schema,x.name),'[]'::jsonb) FROM (
      SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
        pg_get_userbyid(c.relowner) AS owner,
        (SELECT coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),
          CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
          a.privilege_type,a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
         FROM aclexplode(coalesce(c.relacl,acldefault(
           CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a) AS grants
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN (%s) AND c.relkind IN ('r','p','v','m','S')) x;""" % scopes


def acl_state(fact):
    return fact['owner'], fact['kind'], frozenset(tuple(grant) for grant in fact['grants'])


def reconcile_table_acl_sql(expected, actual):
    kinds = {'r': 'TABLE', 'p': 'TABLE', 'v': 'VIEW', 'm': 'MATERIALIZED VIEW', 'S': 'SEQUENCE'}
    privileges = {'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN', 'USAGE'}
    source = {(f['schema'], f['name']): f for f in expected}
    target = {(f['schema'], f['name']): f for f in actual}
    if source.keys() != target.keys():
        raise RuntimeError('Source/destination permission object inventories differ')
    statements, changed = ['BEGIN;'], 0
    ordered = sorted(source, key=lambda key: (0 if source[key]['kind'] in ('r', 'p') else 2 if source[key]['kind'] == 'S' else 1, key))
    for key in ordered:
        wanted = source[key]
        existing = target[key]
        if key[0] not in SCOPES or wanted['kind'] not in kinds or wanted['kind'] != existing['kind']:
            raise RuntimeError('Unexpected permission object')
        for grantor, grantee, privilege, grantable in wanted['grants']:
            if grantor != wanted['owner'] or privilege not in privileges or not isinstance(grantable, bool):
                raise RuntimeError('Unsupported source permission grant chain')
        if acl_state(wanted) == acl_state(existing):
            continue
        changed += 1
        relation = ident(key[0]) + '.' + ident(key[1])
        object_type = 'SEQUENCE' if wanted['kind'] == 'S' else 'TABLE'
        if wanted['owner'] != existing['owner']:
            statements.append('ALTER ' + kinds[wanted['kind']] + ' ' + relation + ' OWNER TO ' + ident(wanted['owner']) + ';')
        # Remove only grants on the objects that actually differ. Preserve the
        # source grantor, privileges and grant options instead of relaxing checks.
        revocations = set()
        for grantor, grantee, _, _ in existing['grants']:
            if grantor == existing['owner']:
                grantor = wanted['owner']
            revocations.add((grantor, grantee))
        for grantor, grantee in sorted(revocations):
            role = 'PUBLIC' if grantee == 'PUBLIC' else ident(grantee)
            statements.extend(['SET ROLE ' + ident(grantor) + ';',
                'REVOKE ALL PRIVILEGES ON ' + object_type + ' ' + relation + ' FROM ' + role + ' CASCADE;', 'RESET ROLE;'])
        statements.append('SET ROLE ' + ident(wanted['owner']) + ';')
        for _, grantee, privilege, grantable in wanted['grants']:
            role = 'PUBLIC' if grantee == 'PUBLIC' else ident(grantee)
            option = ' WITH GRANT OPTION' if grantable else ''
            statements.append('GRANT ' + privilege + ' ON ' + object_type + ' ' + relation + ' TO ' + role + option + ';')
        statements.append('RESET ROLE;')
    statements.append('COMMIT;')
    return '\n'.join(statements), changed


def reconcile_table_acls(expected):
    actual = json.loads(local_psql(table_acl_catalog_sql(), stage='Capture offline table permissions'))
    sql, changed = reconcile_table_acl_sql(expected, actual)
    local_psql(sql, stage='Restore exact source table permissions')
    after = json.loads(local_psql(table_acl_catalog_sql(), stage='Verify exact source table permissions'))
    normalize = lambda facts: {(f['schema'], f['name']): acl_state(f) for f in facts}
    if normalize(expected) != normalize(after):
        raise RuntimeError('Source table permission facts still differ after replay')
    return changed


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


def extension_setup_sql(name, schema, version):
    # PostgreSQL rejects even CREATE SCHEMA IF NOT EXISTS pg_catalog: reserved
    # names are checked before existence. This namespace is already provided.
    create_schema = "" if schema in ("pg_catalog", "public") else "CREATE SCHEMA IF NOT EXISTS " + ident(schema) + "; "
    return create_schema + "CREATE EXTENSION IF NOT EXISTS " + ident(name) + " WITH SCHEMA " + ident(schema) + " VERSION " + literal(version) + " CASCADE;"


def pin_postgres_image(work):
    # Supported per-project image pin in the pinned CLI's resolveDbImage.
    temporary_state = work / "supabase" / ".temp"
    temporary_state.mkdir(parents=True, exist_ok=True)
    (temporary_state / "postgres-version").write_text(POSTGRES_IMAGE_VERSION + "\n")


def verify_extensions(extensions):
    names = ",".join(literal(extension[0]) for extension in extensions)
    actual = json.loads(local_psql("SELECT jsonb_agg(jsonb_build_array(e.extname,n.nspname,e.extversion) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN (" + names + ");", stage="Verify destination extensions"))
    if actual != extensions:
        raise RuntimeError("Destination extension versions or schemas differ from source")


def local_psql(sql=None, files=(), stage="Offline destination SQL"):
    if CONTAINER != "supabase_db_autamedica-recovery-drill":
        raise RuntimeError("Unexpected restore destination")
    # The fresh CLI stack uses its documented default password. Explicit TCP
    # avoids image-dependent Unix-socket paths/auth; production secrets are
    # never forwarded to this helper or selected as a restore destination.
    args = ["docker", "exec", "-i", "-e", "PGPASSWORD=postgres", CONTAINER,
            "psql", "-X", "--no-password", "-qAt", "-h", "127.0.0.1", "-p", "5432",
            "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"]
    if files:
        args.append("--single-transaction")
        for file in files:
            args.extend(["-f", "/recovery/" + file])
    return run(args, stage=stage, input_text=sql, timeout=600)


def check_section_restore():
    """Exercise NOT VALID semantics on integers before any production export."""
    schema = "_recovery_section_guard"
    local_psql("CREATE SCHEMA " + schema + "; CREATE TABLE " + schema +
               ".sample (value integer); INSERT INTO " + schema +
               ".sample VALUES (0); ALTER TABLE " + schema +
               ".sample ADD CONSTRAINT positive CHECK (value>0) NOT VALID;",
               stage="Create synthetic restore-order guard")
    try:
        parts = []
        for flags in (("--schema-only", "--section=pre-data"), ("--data-only",),
                      ("--schema-only", "--section=post-data")):
            parts.append(run(["docker", "exec", "-e", "PGPASSWORD=postgres", CONTAINER,
                              "pg_dump", "-h", "127.0.0.1", "-U", "supabase_admin",
                              "-d", "postgres", "--schema=" + schema, *flags],
                             stage="Export synthetic restore-order guard"))
        local_psql("DROP SCHEMA " + schema + " CASCADE;", stage="Reset synthetic guard")
        local_psql("BEGIN;\n" + "\n".join(parts) + "\nCOMMIT;", stage="Restore synthetic guard")
        result = local_psql("SELECT count(*),(SELECT convalidated FROM pg_constraint WHERE conrelid='" +
                            schema + ".sample'::regclass AND conname='positive') FROM " + schema + ".sample;")
        if result.strip() != "1|f":
            raise RuntimeError("Synthetic NOT VALID state did not survive restoration")
        local_psql("DO $$ BEGIN BEGIN INSERT INTO " + schema +
                   ".sample VALUES (0); RAISE EXCEPTION 'new invalid value accepted'; "
                   "EXCEPTION WHEN check_violation THEN NULL; END; END $$;",
                   stage="Verify restored guard rejects new invalid values")
        print("Synthetic restore-order guard passed; historical rows retained and new invalid writes rejected.", flush=True)
    finally:
        local_psql("DROP SCHEMA IF EXISTS " + schema + " CASCADE;", stage="Remove synthetic guard")


def check_acl_restore():
    table = 'public._recovery_acl_guard'
    local_psql('CREATE TABLE ' + table + ' (value integer); REVOKE ALL ON TABLE ' +
               table + ' FROM PUBLIC,anon,authenticated,service_role; GRANT SELECT ON TABLE ' +
               table + ' TO anon WITH GRANT OPTION;', stage='Create synthetic permission guard')
    def facts():
        return [f for f in json.loads(local_psql(table_acl_catalog_sql()))
                if f['schema'] == 'public' and f['name'] == '_recovery_acl_guard']
    try:
        expected = facts()
        local_psql('REVOKE SELECT ON TABLE ' + table + ' FROM anon CASCADE; GRANT INSERT ON TABLE ' +
                   table + ' TO authenticated;', stage='Alter synthetic permission guard')
        sql, changed = reconcile_table_acl_sql(expected, facts())
        local_psql(sql, stage='Restore synthetic permission guard')
        if changed != 1 or len(expected) != 1 or acl_state(expected[0]) != acl_state(facts()[0]):
            raise RuntimeError('Synthetic permission replay failed')
        print('Synthetic permission guard passed; source grantor/options restored and extra access removed.', flush=True)
    finally:
        local_psql('DROP TABLE IF EXISTS ' + table + ';', stage='Remove synthetic permission guard')


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
    retain = os.environ.get("RECOVERY_RETAIN_BUNDLE", "false")
    if retain not in ("true", "false"):
        raise RuntimeError("Invalid retained backup mode")
    retain = retain == "true"
    bundle_report = {}
    output_dir = Path.cwd() / "recovery-output"
    if retain:
        retained.preflight()
        if output_dir.exists() or output_dir.is_symlink():
            raise RuntimeError("Recovery output already exists; refusing reuse")
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
        pin_postgres_image(work)
        try:
            print("Starting an empty disposable Supabase stack.", flush=True)
            run(["supabase", "start"], stage="Start disposable stack", cwd=work, env=clean_env, timeout=900)
            print("Empty stack ready; inspecting the fixed destination.", flush=True)
            inspect = json.loads(run(["docker", "inspect", CONTAINER], stage="Inspect target"))[0]
            if inspect["Name"] != "/" + CONTAINER:
                raise RuntimeError("Destination identity mismatch")
            if not inspect["Config"]["Image"].endswith(":" + POSTGRES_IMAGE_VERSION):
                raise RuntimeError("Destination ignored the verified PostgreSQL image pin")
            check_section_restore()
            check_acl_restore()
            dump_started = time.monotonic()
            with (root / "source-private.log").open("w") as source_log:
                snapshot = Snapshot(source_env, source_log)
                try:
                    print("Opening read-only source snapshot.", flush=True)
                    snapshot_id = snapshot.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();")
                    recovery_point = snapshot.query("SELECT transaction_timestamp();")
                    storage_inventory = json.loads(snapshot.query(retained.inventory_sql())) if retain else None
                    extensions = json.loads(snapshot.query("SELECT jsonb_agg(jsonb_build_array(e.extname,n.nspname,e.extversion) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace;"))
                    # Only vendor extension SQL runs in this empty stack; no source
                    # application SQL or clinical data is restored before isolation.
                    print("Checking exact extension versions and dependencies on the empty target.", flush=True)
                    for name, schema, version in extensions:
                        local_psql(extension_setup_sql(name, schema, version), stage="Preflight destination extension " + name)
                    verify_extensions(extensions)
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
                    expected_table_acls = json.loads(snapshot.query(table_acl_catalog_sql()))
                    reconcile_table_acl_sql(expected_table_acls, expected_table_acls)
                    foreign_keys = json.loads(snapshot.query(foreign_key_catalog_sql()))
                    foreign_key_query = foreign_key_sql(foreign_keys)
                    if int(snapshot.query(foreign_key_query)) != 0:
                        raise RuntimeError("Source contains foreign key violations; recovery cannot be accredited")
                    for name, flags, section in (("roles", ["--role-only"], None),
                                                  ("schema-pre", [], "pre-data"),
                                                  ("data", ["--data-only", "--use-copy"], None),
                                                  ("schema-post", [], "post-data")):
                        print("Exporting " + name + ".", flush=True)
                        script = run(["supabase", "db", "dump", "--db-url", url, "--dry-run", *flags],
                                     stage="Build " + name + " export", cwd=work, env=clean_env)
                        if name != "roles":
                            script = with_snapshot(script, snapshot_id, section)
                        if name.startswith("schema-"):
                            script = include_managed_schema(script)
                        if name == "data":
                            script = include_managed_migration_data(script)
                        with (root / (name + ".sql")).open("w") as output:
                            run(["docker", "exec", "-i", "-e", "PGSSLMODE=require", "-e", "PGGSSENCMODE=disable",
                                 "-e", "PGOPTIONS=" + source_env["PGOPTIONS"], CONTAINER, "bash", "-s"],
                                stage="Export " + name, input_text=script, output=output)
                        if (root / (name + ".sql")).stat().st_size == 0:
                            raise RuntimeError("Empty backup component")
                        # Preserve the same transaction while avoiding an idle
                        # timeout between the separate native dump sections.
                        if snapshot.query("SELECT 1;") != "1":
                            raise RuntimeError("Source snapshot keepalive failed")
                    if snapshot.process.poll() is not None:
                        raise RuntimeError("Source snapshot ended before all exports completed")
                    if retain:
                        storage_files = retained.capture_storage(storage_inventory, root / "storage",
                            os.environ["SUPABASE_SERVICE_ROLE_KEY"], lambda: snapshot.query("SELECT 1;"))
                        # Leave the exported snapshot only after all SQL and bytes
                        # are captured. A fresh transaction detects changed objects.
                        snapshot.query("COMMIT; BEGIN READ ONLY; SELECT 1;")
                        current_storage = json.loads(snapshot.query(retained.inventory_sql()))
                        retained.verify_inventory(storage_inventory, current_storage)
                finally:
                    snapshot.close()
            checksums = {name: hashlib.sha256((root / (name + ".sql")).read_bytes()).hexdigest()
                         for name in BACKUP_PARTS}
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
            for name, schema, version in extensions:
                local_psql(extension_setup_sql(name, schema, version), stage="Prepare destination extension " + name)
            verify_extensions(extensions)
            run(["docker", "exec", CONTAINER, "mkdir", "-m", "700", "/recovery"], stage="Prepare private target files")
            for name in BACKUP_PARTS:
                run(["docker", "cp", str(root / (name + ".sql")), CONTAINER + ":/recovery/" + name + ".sql"], stage="Copy private backup")
            local_psql(files=tuple(name + ".sql" for name in BACKUP_PARTS), stage="Atomic database restoration")
            permissions_reconciled = reconcile_table_acls(expected_table_acls)
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
            if retain:
                bundle_report = retained.encrypt_bundle(root, {
                    "postgres_image_version": POSTGRES_IMAGE_VERSION,
                    "database_snapshot_time_utc": recovery_point, "sql_checksums": checksums,
                    "extensions": extensions, "tables": tables,
                    "expected_data": expected_data, "expected_metadata": expected_metadata,
                    "table_acls": expected_table_acls, "foreign_keys": foreign_keys,
                    "storage_inventory": storage_inventory,
                    "database_restore_verified_before_packaging": True,
                    "vault_secrets_included": False, "external_configuration_included": False,
                }, storage_files, output_dir)
            report = {"database_restore_verified": True, "verified_tables": len(tables),
                              "rows_verified": sum(row[1] for row in actual_data),
                              "data_fingerprints_match": True, "security_metadata_match": True,
                              "foreign_keys_verified": len(foreign_keys),
                              "permission_objects_reconciled": permissions_reconciled,
                              "table_permission_facts_verified": True,
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
    report.update(bundle_report)
    # Only the subsequent artifact upload can prove retention; creation alone
    # never sets backup_retained=true or accredits a retained-copy restore.
    report["total_drill_seconds"] = round(time.monotonic() - started, 2)
    print(json.dumps(report, sort_keys=True), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, RuntimeError) else "Recovery drill stopped (" + type(error).__name__ + "); private diagnostics withheld"
        print("::error::" + message, flush=True)
        raise SystemExit(1) from None

