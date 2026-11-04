"""Unit tests for the isolated synthetic Storage API harness; no Docker or network."""
import hashlib
import json
import os
import unittest
from unittest.mock import patch

import test_storage_api_isolated as smoke


OWNER = "a" * 8 + "-" + "a" * 4 + "-" + "a" * 4 + "-" + "a" * 4 + "-" + "a" * 12
OTHER = "b" * 8 + "-" + "b" * 4 + "-" + "b" * 4 + "-" + "b" * 4 + "-" + "b" * 12


def response_series(owner_read=None, other_read=404, anon_read=401, public_read=404,
                    cross_upload=403):
    return [
        (200, b"{}"),  # private bucket
        (200, json.dumps({"id": OWNER}).encode()),
        (200, b'{"access_token":"owner-token"}'),
        (200, json.dumps({"id": OTHER}).encode()),
        (200, b'{"access_token":"other-token"}'),
        (200, b"{}"),  # owner uploads
        (200, smoke.SYNTHETIC_BYTES if owner_read is None else owner_read),
        (other_read, b""), (anon_read, b""), (public_read, b""),
        (cross_upload, b""),
    ]


class StorageAPISmokeTests(unittest.TestCase):
    def test_only_loopback_api_is_allowed(self):
        self.assertEqual(smoke.validate_local_url("http://127.0.0.1:54321/"), "http://127.0.0.1:54321")
        for bad in ("https://project.supabase.co", "http://evil.example:54321",
                    "http://localhost:54321@evil.test:54321",
                    "http://localhost:54321?token=secret",
                    "https://localhost:54321", "http://localhost"):
            with self.subTest(bad=bad), self.assertRaises(RuntimeError):
                smoke.validate_local_url(bad)

    def test_local_status_requires_expected_keys(self):
        with self.assertRaises(RuntimeError):
            smoke.validate_status({"api_url": "https://example.com",
                                   "anon_key": "x", "service_role_key": "y"})
        with self.assertRaises(RuntimeError):
            smoke.validate_status({"api_url": "http://localhost:54321"})
        self.assertEqual(smoke.validate_status(
            {"api_url": "http://localhost:54321",
             "anon_key": "local-anon", "service_role_key": "local-service"})[0],
                         "http://localhost:54321")

    def test_child_environment_strips_cloud_tokens_and_database_urls(self):
        with patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "secret",
                                      "SUPABASE_DB_URL": "secret",
                                      "PGPASSWORD": "secret",
                                      "RECOVERY_PRIVATE_KEY": "secret",
                                      "GITHUB_TOKEN": "secret",
                                      "PATH": "/usr/bin"}, clear=True):
            self.assertEqual(smoke.safe_env(), {"PATH": "/usr/bin"})

    def test_owner_byte_integrity_and_all_denials(self):
        with patch.object(smoke, "api_request", side_effect=response_series()) as api:
            report = smoke.check_permissions("http://127.0.0.1:54321", "anon", "service")
        self.assertTrue(report["synthetic_owner_download_sha256_verified"])
        self.assertTrue(report["synthetic_other_patient_denied"])
        self.assertTrue(report["synthetic_anonymous_denied"])
        self.assertTrue(report["synthetic_public_url_denied"])
        self.assertTrue(report["synthetic_cross_patient_upload_denied"])
        calls = [c.args for c in api.call_args_list]
        self.assertIn("/storage/v1/object/authenticated/" + smoke.BUCKET + "/" + OWNER + "/synthetic.txt",
                      [c[2] for c in calls])
        self.assertNotIn("/storage/v1/object/authenticated/" + smoke.BUCKET,
                         [c[2] for c in calls])

    def test_wrong_downloaded_bytes_fail(self):
        with patch.object(smoke, "api_request",
                          side_effect=response_series(owner_read=b"tampered")):
            with self.assertRaisesRegex(RuntimeError, "wrong object bytes"):
                smoke.check_permissions("http://127.0.0.1:54321", "anon", "service")

    def test_cross_patient_read_must_not_succeed(self):
        with patch.object(smoke, "api_request",
                          side_effect=response_series(other_read=200)):
            with self.assertRaisesRegex(RuntimeError, "Other patient"):
                smoke.check_permissions("http://127.0.0.1:54321", "anon", "service")

    def test_anonymous_and_public_reads_must_not_succeed(self):
        for overrides in ({"anon_read": 200}, {"public_read": 200}):
            with self.subTest(overrides=overrides):
                with patch.object(smoke, "api_request",
                                  side_effect=response_series(**overrides)):
                    with self.assertRaisesRegex(RuntimeError, "must not"):
                        smoke.check_permissions("http://127.0.0.1:54321", "anon", "service")

    def test_cross_patient_upload_must_not_succeed(self):
        with patch.object(smoke, "api_request",
                          side_effect=response_series(cross_upload=200)):
            with self.assertRaisesRegex(RuntimeError, "must not upload"):
                smoke.check_permissions("http://127.0.0.1:54321", "anon", "service")

    def test_no_redirect_to_remote_destination(self):
        h = smoke.NoRedirect()
        with self.assertRaisesRegex(RuntimeError, "Unexpected HTTP redirect"):
            h.redirect_request(None, None, 302, "Moved", {},
                               "https://production.supabase.co/")


if __name__ == "__main__":
    unittest.main()
