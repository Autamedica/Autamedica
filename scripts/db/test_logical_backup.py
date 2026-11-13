#!/usr/bin/env python3
"""Backup orchestration tests using a fake exporter; no database credentials or data."""
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CREATE = ROOT / "scripts/db/create-supabase-logical-backup.sh"
VERIFY = ROOT / "scripts/db/verify-supabase-logical-backup.sh"


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        tools = self.root / "bin"
        tools.mkdir()
        cli = tools / "supabase"
        cli.write_text("""#!/usr/bin/env bash
set -eu
output=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "-f" ]]; then output="$2"; shift 2; else shift; fi
done
case "$output" in
  */schema.sql) [[ "${FAIL_EXPORT:-0}" != 1 ]] || exit 9 ;;
esac
printf '%s\\n' '-- synthetic backup fixture' > "$output"
""")
        cli.chmod(0o700)
        self.env = dict(os.environ, PATH=str(tools) + os.pathsep + os.environ["PATH"],
                        DATABASE_URL="postgresql://fixture.invalid/postgres",
                        BACKUP_DIR=str(self.root / "backups"))

    def run_script(self, script, *args, success=True):
        result = subprocess.run(["bash", str(script), *map(str, args)],
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, success, result.stderr)
        return result

    def create(self):
        self.run_script(CREATE)
        return sorted((self.root / "backups").iterdir())

    def test_success_permissions_and_unique_directories(self):
        first = self.create()[0]
        self.run_script(VERIFY, first)
        self.assertEqual(stat.S_IMODE(first.stat().st_mode), 0o700)
        for component in first.iterdir():
            self.assertEqual(stat.S_IMODE(component.stat().st_mode), 0o600)
        self.assertEqual(len(self.create()), 2)

    def test_export_failure_never_publishes_partial_backup(self):
        self.env["FAIL_EXPORT"] = "1"
        self.run_script(CREATE, success=False)
        self.assertEqual(list((self.root / "backups").iterdir()), [])

    def test_missing_credentials(self):
        self.env.pop("DATABASE_URL")
        self.env.pop("SUPABASE_DB_URL", None)
        self.run_script(CREATE, success=False)
        self.assertFalse((self.root / "backups").exists())

    def test_tampering_and_missing_components_are_rejected(self):
        backup = self.create()[0]
        with (backup / "data.sql.gz").open("ab") as stream:
            stream.write(b"tampered")
        self.run_script(VERIFY, backup, success=False)
        (backup / "data.sql.gz").unlink()
        self.run_script(VERIFY, backup, success=False)

    def test_manifest_paths_are_never_followed(self):
        backup = self.create()[0]
        (backup / "SHA256SUMS").write_text("0" * 64 + "  /etc/passwd\\n")
        self.run_script(VERIFY, backup, success=False)

    def test_symlink_component_is_rejected(self):
        backup = self.create()[0]
        (backup / "roles.sql.gz").unlink()
        (backup / "roles.sql.gz").symlink_to(backup / "data.sql.gz")
        self.run_script(VERIFY, backup, success=False)


if __name__ == "__main__":
    unittest.main()
