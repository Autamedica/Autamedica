import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("source", Path(__file__).with_name("check_recovery_source.py"))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class SourceGuards(unittest.TestCase):
    def test_psql18_tls_table_requires_connection_and_protocol(self):
        self.assertTrue(source.client_tls_verified("SSL Connection|true\nSSL Protocol|TLSv1.3\n"))
        self.assertFalse(source.client_tls_verified("SSL Connection|false\nSSL Protocol|TLSv1.3\n"))
        self.assertFalse(source.client_tls_verified("SSL Connection|true\n"))

    def test_direct_source_is_read_only_and_tls(self):
        options = source.connection_options(
            f"postgresql://postgres:p%40ss@db.{source.PROJECT}.supabase.co/postgres", "")
        self.assertEqual(options["PGPASSWORD"], "p@ss")
        self.assertEqual(options["PGSSLMODE"], "require")
        self.assertIn("default_transaction_read_only=on", options["PGOPTIONS"])

    def test_session_mode_replaces_transaction_port(self):
        options = source.connection_options(
            f"postgresql://postgres.{source.PROJECT}@{source.SESSION_HOST}:6543/postgres", "secret")
        self.assertEqual(options["PGPORT"], "5432")

    def test_reject_wrong_project_host_and_user(self):
        urls = [
            "postgresql://postgres:secret@db.other.supabase.co/postgres",
            f"postgresql://postgres.other:secret@{source.SESSION_HOST}/postgres",
            f"postgresql://postgres:secret@{source.PROJECT}.attacker.example/postgres",
            f"postgresql://postgres:secret@db.{source.PROJECT}.supabase.co/other",
        ]
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                source.connection_options(url, "")

    def test_uri_options_cannot_disable_read_only_or_tls(self):
        options = source.connection_options(
            f"postgresql://postgres:secret@db.{source.PROJECT}.supabase.co/postgres?sslmode=disable&options=-c%20default_transaction_read_only=off", "")
        self.assertEqual(options["PGSSLMODE"], "require")
        self.assertIn("default_transaction_read_only=on", options["PGOPTIONS"])

    @patch.object(source.subprocess, "run")
    def test_raw_error_is_redacted(self, run):
        run.return_value = SimpleNamespace(returncode=1, stderr="password authentication failed: very-private", stdout="")
        with self.assertRaisesRegex(RuntimeError, "^authentication$"):
            source.probe({})

    @patch.object(source.subprocess, "run")
    def test_false_guard_is_rejected(self, run):
        run.return_value = SimpleNamespace(returncode=0, stderr="", stdout='{"read_only":false,"tls":true,"snapshot_supported":true}')
        with self.assertRaisesRegex(RuntimeError, "^source_guards_not_confirmed:"):
            source.probe({})

    @patch.object(source.subprocess, "run")
    def test_only_expected_report_fields_can_be_logged(self, run):
        run.return_value = SimpleNamespace(returncode=0, stderr="", stdout='SSL connection (protocol: TLSv1.3, cipher: TEST)\n{"read_only":true,"backend_tls":false,"snapshot_supported":true,"postgres_major":17,"patients":1,"doctors":1,"appointments":0,"private":"do not log"}')
        self.assertNotIn("private", source.probe({}))

    @patch.object(source.subprocess, "run")
    def test_pooler_backend_tls_is_not_client_tls(self, run):
        run.return_value = SimpleNamespace(returncode=0, stderr="", stdout='SSL connection (protocol: TLSv1.3, cipher: TEST)\n{"read_only":true,"backend_tls":false,"snapshot_supported":true,"postgres_major":17,"patients":1,"doctors":1,"appointments":0}')
        report = source.probe({})
        self.assertTrue(report["tls"])
        self.assertFalse(report["backend_tls"])

    @patch.object(source.subprocess, "run")
    def test_backend_tls_cannot_substitute_client_tls_evidence(self, run):
        run.return_value = SimpleNamespace(returncode=0, stderr="", stdout='{"read_only":true,"backend_tls":true,"snapshot_supported":true}')
        with self.assertRaisesRegex(RuntimeError, "^source_guards_not_confirmed:tls$"):
            source.probe({})


if __name__ == "__main__":
    unittest.main()
