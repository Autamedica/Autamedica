"""Check the production recovery source without emitting credentials or patient data."""
import json
import os
import re
import subprocess
from urllib.parse import unquote, urlsplit

PROJECT = "qxjjrpksmwwrmubhvjew"
SESSION_HOST = "aws-1-sa-east-1.pooler.supabase.com"


def client_tls_verified(output):
    if re.search(r"^SSL connection \(protocol: TLSv[0-9.]+,", output, re.MULTILINE):
        return True
    # psql 18 prints conninfo as a table; -At makes it label|value pairs.
    fields = dict(line.split("|", 1) for line in output.splitlines() if "|" in line)
    return fields.get("SSL Connection") == "true" and re.fullmatch(
        r"TLSv[0-9.]+", fields.get("SSL Protocol", "")) is not None


def connection_options(url, password):
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    user = unquote(parsed.username or "")
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ValueError("Invalid database connection scheme")
    if host == f"db.{PROJECT}.supabase.co":
        if user not in ("postgres", f"postgres.{PROJECT}"):
            raise ValueError("Unexpected direct database user")
    elif host.endswith(".pooler.supabase.com"):
        if user != f"postgres.{PROJECT}":
            raise ValueError("Wrong source project")
    else:
        raise ValueError("Source host is not the production Supabase database")
    if parsed.path != "/postgres":
        raise ValueError("Unexpected database")
    secret = unquote(parsed.password or "") or password
    if not secret:
        raise ValueError("Database password is unavailable")
    return {
        "PGHOST": host, "PGPORT": "5432", "PGUSER": user,
        "PGDATABASE": "postgres", "PGPASSWORD": secret,
        "PGSSLMODE": "require", "PGGSSENCMODE": "disable", "PGCONNECT_TIMEOUT": "8",
        "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=10000",
    }


def probe(options):
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    env.update(options)
    env["LC_ALL"] = "C"
    sql = """
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
 'read_only',current_setting('transaction_read_only')='on',
 'backend_tls',coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false),
 'snapshot_supported',pg_export_snapshot() IS NOT NULL,
 'postgres_major',current_setting('server_version_num')::int / 10000,
 'patients',(select count(*) from public.patients),
 'doctors',(select count(*) from public.doctors),
 'appointments',(select count(*) from public.appointments));
ROLLBACK;
"""
    result = subprocess.run(
        ["psql", "-X", "--no-password", "-At", "-v", "ON_ERROR_STOP=1", "-c", "\\conninfo", "-c", sql],
        env=env, capture_output=True, text=True, timeout=40, check=False,
    )
    if result.returncode:
        # Do not forward raw libpq errors: they may contain a URI or server data.
        error = result.stderr.lower()
        reason = "authentication" if "password authentication failed" in error else "connection_or_query"
        raise RuntimeError(reason)
    rows = [line for line in result.stdout.splitlines() if line.startswith("{")]
    if len(rows) != 1:
        raise RuntimeError("unexpected_response")
    report = json.loads(rows[0])
    if not isinstance(report, dict):
        raise RuntimeError("unexpected_response")
    # A pooler's backend connection is distinct from the client TLS connection.
    # Never print the raw connection report, which contains connection metadata.
    report["tls"] = client_tls_verified(result.stdout)
    if not all(report.get(key) is True for key in ("read_only", "tls", "snapshot_supported")):
        failed = [key for key in ("read_only", "tls", "snapshot_supported") if report.get(key) is not True]
        raise RuntimeError("source_guards_not_confirmed:" + ",".join(failed))
    fields = ("read_only", "tls", "backend_tls", "snapshot_supported", "postgres_major", "patients", "doctors", "appointments")
    if any(key not in report for key in fields):
        raise RuntimeError("incomplete_response")
    return {key: report[key] for key in fields}


def main():
    url = os.environ.get("SUPABASE_DB_URL", "")
    password = os.environ.get("SUPABASE_DB_PASSWORD", "")
    try:
        options = connection_options(url, password)
    except ValueError:
        # A missing/stale URI must not select another project. The explicitly
        # configured production password can try the documented session endpoint.
        if not password:
            raise RuntimeError("source_configuration_missing_or_wrong_project") from None
        options = connection_options(
            f"postgresql://postgres.{PROJECT}@{SESSION_HOST}:5432/postgres", password)
    candidates = [options]
    fallback = dict(options, PGHOST=SESSION_HOST, PGUSER=f"postgres.{PROJECT}")
    if password:
        fallback["PGPASSWORD"] = password
    if fallback != options:
        candidates.append(fallback)
    for index, candidate in enumerate(candidates):
        try:
            report = probe(candidate)
            print(json.dumps({"source_preflight": "passed", **report}, sort_keys=True))
            return
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
            reason = str(error) if isinstance(error, RuntimeError) else "timeout_or_response"
            print(f"Source attempt {index + 1}: failed ({reason})")
    raise RuntimeError("No verified production recovery connection")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError):
        print("::error::Recovery source preflight failed; no production data changed.")
        raise SystemExit(1) from None
