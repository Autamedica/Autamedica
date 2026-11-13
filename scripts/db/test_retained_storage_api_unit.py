"""No-secret unit tests for retained Storage API byte replay."""
import hashlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import test_retained_storage_api as replay


class FakeResponse:
    def __init__(self, status, body):
        self.status = status
        self.body = io.BytesIO(body)

    def read(self, n=-1):
        return self.body.read(n)


class FakeConnection:
    response = FakeResponse(200, b"")
    sent = None

    def __init__(self, host, port, timeout):
        if host not in ("127.0.0.1", "localhost", "::1"):
            raise AssertionError("Unexpected nonlocal destination")
        self.host, self.port = host, port

    def request(self, method, path, body=None, headers=None):
        self.sent = (method, path, headers)
        if body is not None:
            self.uploaded = body.read()

    def getresponse(self):
        return self.response

    def close(self):
        return None


class RetainedStorageAPITests(unittest.TestCase):
    def test_fixture_object_integrity_and_inventory(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest, root = replay.synthetic_fixture(temp)
            ids = replay.check_manifest(manifest, root, 2)
            self.assertEqual(len(ids), 2)
            self.assertEqual(len(manifest["storage_files"]), 2)
            with self.assertRaisesRegex(RuntimeError, "object count"):
                replay.check_manifest(manifest, root, 359)

    def test_rejects_unsafe_paths_duplicate_objects_and_wrong_sha(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest, root = replay.synthetic_fixture(temp)
            original = manifest["storage_files"][0]
            original["name"] = "../escape"
            with self.assertRaisesRegex(RuntimeError, "Unsupported Storage object path"):
                replay.check_manifest(manifest, root, 2)
            original["name"] = "synthetic/folder/test.bin"
            manifest["storage_files"].append(dict(original))
            with self.assertRaisesRegex(RuntimeError, "duplicate"):
                replay.check_manifest(manifest, root, 3)
            manifest["storage_files"].pop()
            original["sha256"] = "0" * 64
            with self.assertRaisesRegex(RuntimeError, "integrity"):
                replay.check_manifest(manifest, root, 2)

    def test_never_accepts_real_storage_host(self):
        with self.assertRaises(RuntimeError):
            replay.call_local("https://qxjjrpksmwwrmubhvjew.supabase.co",
                              "GET", "/storage/v1/object/b/n", "a", "b")
        with self.assertRaises(RuntimeError):
            replay.object_endpoint(replay.FIXTURE_BUCKET, "folder/file")

    def test_stream_upload_and_download_hash(self):
        body = b"\x00valid encrypted-fixture plaintext data\n"
        with tempfile.TemporaryDirectory() as temp:
            src = Path(temp) / "opaque"
            src.write_bytes(body)
            with patch.object(replay.http.client, "HTTPConnection", FakeConnection):
                FakeConnection.response = FakeResponse(201, b"{}")
                self.assertEqual(
                    replay.call_local("http://127.0.0.1:54321", "POST",
                                      "/storage/v1/object/private/f", "local", "local",
                                      input_file=src, expected_size=len(body)),
                    201)
                FakeConnection.response = FakeResponse(200, body)
                self.assertEqual(
                    replay.call_local("http://127.0.0.1:54321", "GET",
                                      "/storage/v1/object/authenticated/private/f",
                                      "local", "local", expected_size=len(body),
                                      expected_digest=hashlib.sha256(body).hexdigest()),
                    200)
                FakeConnection.response = FakeResponse(200, b"tampered")
                with self.assertRaisesRegex(RuntimeError, "SHA-256"):
                    replay.call_local("http://127.0.0.1:54321", "GET",
                                      "/storage/v1/object/authenticated/private/f",
                                      "local", "local", expected_size=len(body),
                                      expected_digest=hashlib.sha256(body).hexdigest())

    def test_redirects_are_never_followed(self):
        with patch.object(replay.http.client, "HTTPConnection", FakeConnection):
            FakeConnection.response = FakeResponse(302, b"")
            with self.assertRaisesRegex(RuntimeError, "redirect"):
                replay.call_local("http://127.0.0.1:54321", "GET",
                                  "/storage/v1/object/private/f", "local", "local")

    def test_replay_refuses_cross_patient_visibility(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest, root = replay.synthetic_fixture(temp)
            with patch.object(replay.fixture, "api_request", return_value=(200, b"{}")), \
                 patch.object(replay.fixture, "check_permissions", return_value={}), \
                 patch.object(replay.fixture, "setup_private_policy"), \
                 patch.object(replay.fixture, "create_user", return_value=("id", "other-token")), \
                 patch.object(replay, "call_local") as call:
                call.side_effect = lambda api, method, *rest, **kw: (
                    201 if method == "POST" else 200 if method == "GET" else 403)
                report = replay.replay("http://127.0.0.1:54321", "anon", "service",
                                       manifest, root, 2)
                self.assertTrue(report["retained_api_bytes_verified"])
                self.assertFalse(report["storage_service_restore_verified"])
                self.assertEqual(report["retained_objects_served_with_sha256"], 2)
                call.side_effect = lambda api, method, *rest, **kw: (
                    201 if method == "POST" else 200)
                with self.assertRaisesRegex(RuntimeError, "access gate"):
                    replay.replay("http://127.0.0.1:54321", "anon", "service",
                                  manifest, root, 2)

    def test_docker_public_host_binding_is_rejected(self):
        visible = '{"NetworkSettings":{"Ports":{"8000/tcp":[{"HostIp":"0.0.0.0","HostPort":"54321"}]}}}'
        with patch.object(replay.fixture, "run",
                          side_effect=["container-id", "[" + visible + "]"]):
            with self.assertRaisesRegex(RuntimeError, "non-loopback"):
                replay.assert_loopback_docker_ports(None)
        private = '{"NetworkSettings":{"Ports":{"8000/tcp":[{"HostIp":"127.0.0.1","HostPort":"54321"}]}}}'
        with patch.object(replay.fixture, "run",
                          side_effect=["container-id", "[" + private + "]"]):
            replay.assert_loopback_docker_ports(None)

    def test_refuses_environment_with_production_credentials(self):
        with patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "secret"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "credentials"):
                replay.check_no_cloud_credentials()


if __name__ == "__main__":
    unittest.main()
