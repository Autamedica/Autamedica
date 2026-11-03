"""Credential-free capture failure tests and a real GnuPG recovery round trip."""
import base64
import hashlib
import io
import json
import os
import ssl
from pathlib import Path
import tarfile
import tempfile
import unittest
from urllib.error import HTTPError, URLError
from unittest.mock import patch

import retained_recovery_bundle as bundle
import production_recovery_drill as drill
import restore_retained_bundle as restore
from test_restore_retained_bundle import fixture


class Response(io.BytesIO):
    status = 200

    def __init__(self, data, url):
        super().__init__(data)
        self.url = url
        self.headers = {"ETag": hashlib.md5(data, usedforsecurity=False).hexdigest()}

    def geturl(self):
        return self.url


class BundleTests(unittest.TestCase):
    def service_key(self, **changes):
        claims = {"ref": drill.PROJECT, "role": "service_role", "exp": 9999999999, **changes}
        payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
        return "eyJhbGciOiJIUzI1NiJ9." + payload + ".synthetic_signature"

    def management_response(self, key):
        url = "https://api.supabase.com/v1/projects/" + drill.PROJECT + "/api-keys?reveal=true"
        return Response(json.dumps([{"name": "service_role", "api_key": key}]).encode(), url)

    def test_configured_storage_key_does_not_contact_management(self):
        with patch.dict(os.environ, {"SUPABASE_SERVICE_ROLE_KEY": "configured"}, clear=True), patch.object(bundle, "build_opener") as network:
            self.assertEqual(bundle.resolve_storage_key(), "configured")
            network.assert_not_called()

    def test_lookup_selects_existing_fixed_project_service_key(self):
        key = self.service_key()
        with patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "synthetic-admin-token", "GITHUB_ACTIONS": "true"}, clear=True), patch.object(bundle, "build_opener") as opener, patch("builtins.print") as output:
            opener.return_value.open.return_value = self.management_response(key)
            self.assertEqual(bundle.resolve_storage_key(), key)
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "GET")
            self.assertEqual(request.full_url, "https://api.supabase.com/v1/projects/" + drill.PROJECT + "/api-keys?reveal=true")
            output.assert_called_once_with("::add-mask::" + key, flush=True)

    def test_lookup_refuses_foreign_role_project_and_expiry(self):
        for key in (self.service_key(ref="other"), self.service_key(role="anon"), self.service_key(exp=0), "sb_secret_synthetic"):
            with patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "synthetic"}, clear=True), patch.object(bundle, "build_opener") as opener:
                opener.return_value.open.return_value = self.management_response(key)
                with self.assertRaisesRegex(RuntimeError, "^Storage credential lookup failed; private diagnostics withheld$"):
                    bundle.resolve_storage_key()

    def test_lookup_error_never_exposes_token_or_body(self):
        with patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "synthetic"}, clear=True), patch.object(bundle, "build_opener") as opener:
            opener.return_value.open.side_effect = ValueError("private key and private response")
            with self.assertRaisesRegex(RuntimeError, "^Storage credential lookup failed; private diagnostics withheld$"):
                bundle.resolve_storage_key()

    def row(self, size=3):
        return {"bucket_id": "medical-documents", "name": "patient/report.pdf",
                "metadata": {"size": size, "eTag": hashlib.md5(b"pdf", usedforsecurity=False).hexdigest()}}

    def test_paths_are_encoded_and_cannot_escape(self):
        self.assertTrue(bundle.object_url("medical-documents", "x/a ?#.pdf").endswith("x/a%20%3F%23.pdf"))
        for name in ("../secret", "/x", "x/./y", "x//y", "x\\y", ""):
            with self.assertRaises(RuntimeError):
                bundle.object_url("medical-documents", name)
        with self.assertRaises(RuntimeError):
            bundle.object_url("https://evil", "x")

    def test_redirects_are_refused(self):
        with self.assertRaisesRegex(RuntimeError, "redirect"):
            bundle.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil")

    def test_missing_config_stops_before_source_or_destination(self):
        with patch.dict(os.environ, {"RECOVERY_DRILL_CONFIRMATION": "RESTORE-" + drill.PROJECT,
                                    "RECOVERY_RETAIN_BUNDLE": "true"}, clear=True), patch.object(drill, "probe") as probe:
            with self.assertRaisesRegex(RuntimeError, "configuration missing"):
                drill.main()
            probe.assert_not_called()

    def test_capture_streams_private_bytes_to_hashed_filename(self):
        row = self.row()
        url = bundle.object_url(row["bucket_id"], row["name"])
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, "build_opener") as opener:
            opener.return_value.open.return_value = Response(b"pdf", url)
            keepalive = unittest.mock.Mock()
            files = bundle.capture_storage({"objects": [row]}, Path(directory) / "storage", "private", keepalive)
            self.assertEqual(files[0]["sha256"], hashlib.sha256(b"pdf").hexdigest())
            self.assertEqual((Path(directory) / files[0]["file"]).read_bytes(), b"pdf")
            self.assertNotIn("patient", files[0]["file"])
            keepalive.assert_called_once()

    def test_download_size_or_version_failure_never_passes(self):
        for row in (self.row(2), self.row(4), dict(self.row(), is_versioned=True)):
            with tempfile.TemporaryDirectory() as directory, patch.object(bundle, "build_opener") as opener:
                opener.return_value.open.return_value = Response(b"pdf", bundle.object_url(row["bucket_id"], row["name"]))
                with self.assertRaises(RuntimeError):
                    bundle.capture_storage({"objects": [row]}, Path(directory) / "storage", "private", lambda: None)

    def test_download_errors_do_not_emit_urls_or_secrets(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, "build_opener") as opener:
            opener.return_value.open.side_effect = ValueError("patient/report.pdf secret")
            with self.assertRaisesRegex(RuntimeError, "^Storage capture failed; private diagnostics withheld$"):
                bundle.capture_storage({"objects": [self.row()]}, Path(directory) / "storage", "private", lambda: None)

    def test_stale_same_size_response_is_rejected(self):
        row = self.row()
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, "build_opener") as opener:
            opener.return_value.open.return_value = Response(b"old", bundle.object_url(row["bucket_id"], row["name"]))
            with self.assertRaises(RuntimeError):
                bundle.capture_storage({"objects": [row]}, Path(directory) / "storage", "private", lambda: None)

    def test_timeout_retries_same_conditional_request(self):
        row = self.row()
        url = bundle.object_url(row['bucket_id'], row['name'])
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, 'build_opener') as opener, patch.object(bundle.time, 'sleep'):
            opener.return_value.open.side_effect = [TimeoutError('private URL and token'), Response(b'pdf', url)]
            files = bundle.capture_storage({'objects': [row]}, Path(directory) / 'storage', 'private', lambda: None)
            self.assertEqual(len(files), 1)
            requests = opener.return_value.open.call_args_list
            self.assertEqual(len(requests), 2)
            self.assertIs(requests[0].args[0], requests[1].args[0])
            self.assertEqual(requests[0].args[0].get_header('If-match'), '"' + row['metadata']['eTag'] + '"')

    def test_partial_transfer_is_discarded_before_retry(self):
        class Interrupted(Response):
            def read(self, size=-1):
                if self.tell():
                    raise ConnectionResetError('private payload')
                return super().read(1)
        row = self.row()
        url = bundle.object_url(row['bucket_id'], row['name'])
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, 'build_opener') as opener, patch.object(bundle.time, 'sleep'):
            opener.return_value.open.side_effect = [Interrupted(b'pdf', url), Response(b'pdf', url)]
            files = bundle.capture_storage({'objects': [row]}, Path(directory) / 'storage', 'private', lambda: None)
            self.assertEqual((Path(directory) / files[0]['file']).read_bytes(), b'pdf')

    def test_timeout_exhaustion_is_bounded_and_private(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, 'build_opener') as opener, patch.object(bundle.time, 'sleep'):
            opener.return_value.open.side_effect = URLError(TimeoutError('private token and URL'))
            with self.assertRaisesRegex(RuntimeError, r'^Storage capture failed \(reason=timeout\); private diagnostics withheld$'):
                bundle.capture_storage({'objects': [self.row()]}, Path(directory) / 'storage', 'private', lambda: None)
            self.assertEqual(opener.return_value.open.call_count, 3)

    def test_http_retries_only_transient_statuses(self):
        row = self.row()
        url = bundle.object_url(row['bucket_id'], row['name'])
        for status in (401, 403, 404, 412, 429, 503):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory, patch.object(bundle, 'build_opener') as opener, patch.object(bundle.time, 'sleep'):
                opener.return_value.open.side_effect = [HTTPError(url, status, 'private response', {}, io.BytesIO(b'private')), Response(b'pdf', url)]
                if status in (429, 503):
                    self.assertEqual(len(bundle.capture_storage({'objects': [row]}, Path(directory) / 'storage', 'private', lambda: None)), 1)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reason=http_' + str(status)):
                        bundle.capture_storage({'objects': [row]}, Path(directory) / 'storage', 'private', lambda: None)
                    self.assertEqual(opener.return_value.open.call_count, 1)

    def test_integrity_and_tls_failures_are_never_retried(self):
        row = self.row()
        url = bundle.object_url(row['bucket_id'], row['name'])
        for error in (URLError(ssl.SSLCertVerificationError('private certificate')),):
            with tempfile.TemporaryDirectory() as directory, patch.object(bundle, 'build_opener') as opener, patch.object(bundle.time, 'sleep'):
                opener.return_value.open.side_effect = error
                with self.assertRaisesRegex(RuntimeError, 'reason=tls_error'):
                    bundle.capture_storage({'objects': [row]}, Path(directory) / 'storage', 'private', lambda: None)
                self.assertEqual(opener.return_value.open.call_count, 1)
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, 'build_opener') as opener:
            opener.return_value.open.return_value = Response(b'old', url)
            with self.assertRaisesRegex(RuntimeError, 'reason=etag_mismatch'):
                bundle.capture_storage({'objects': [row]}, Path(directory) / 'storage', 'private', lambda: None)
            self.assertEqual(opener.return_value.open.call_count, 1)
            self.assertEqual(list((Path(directory) / 'storage').iterdir()), [])

    def test_inventory_drift_or_duplicate_objects_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "changed during capture"):
            bundle.verify_inventory({"objects": [self.row()]}, {"objects": []})
        row = self.row()
        with tempfile.TemporaryDirectory() as directory, patch.object(bundle, "build_opener") as opener:
            opener.return_value.open.return_value = Response(b"pdf", bundle.object_url(row["bucket_id"], row["name"]))
            with self.assertRaisesRegex(RuntimeError, "Duplicate"):
                bundle.capture_storage({"objects": [row, row]}, Path(directory) / "storage", "private", lambda: None)

    def test_sql_bytes_must_match_the_verified_restore_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in bundle.SQL_PARTS:
                (root / (name + ".sql")).write_text("SELECT 1;")
            with self.assertRaisesRegex(RuntimeError, "SQL bytes differ"):
                bundle.encrypt_bundle(root, {"sql_checksums": {name: "0" * 64 for name in bundle.SQL_PARTS}}, [], root / "output")

    def test_post_capture_tampering_is_rejected_before_encryption(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in bundle.SQL_PARTS:
                (root / (name + ".sql")).write_text("SELECT 1;")
            (root / "storage").mkdir()
            name = "storage/" + "a" * 64 + ".bin"
            (root / name).write_bytes(b"bad")
            with self.assertRaisesRegex(RuntimeError, "changed after capture"):
                bundle.encrypt_bundle(root, {}, [{"file": name, "bytes": 3,
                    "sha256": hashlib.sha256(b"pdf").hexdigest()}], root / "output")

    def test_real_encryption_decryption_preserves_sql_acl_and_storage(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            home = root / "keys"
            home.mkdir(mode=0o700)
            passphrase_file = root / "synthetic-passphrase"
            passphrase_file.write_text("synthetic-test-passphrase\n")
            try:
                bundle.gpg(home, "--pinentry-mode", "loopback", "--passphrase-file", str(passphrase_file),
                           "--quick-generate-key", "Synthetic recovery test", "rsa2048", "encr", "1d")
            except RuntimeError:
                # Some Codex containers prohibit AF_UNIX sockets. CI must still
                # run the real round trip; never turn a CI failure into a skip.
                if not os.environ.get("CI"):
                    import socket
                    try:
                        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM):
                            pass
                    except PermissionError:
                        self.skipTest("Local sandbox prohibits GnuPG agent sockets; required in CI")
                raise
            listing = bundle.gpg(home, "--with-colons", "--fingerprint", "--list-keys")
            fingerprint = next(line.split(":")[9] for line in listing.splitlines() if line.startswith("fpr:"))
            public = bundle.gpg(home, "--armor", "--export", fingerprint)
            key_file = root / "escrow.asc"
            key_file.write_text(bundle.gpg(home, "--pinentry-mode", "loopback", "--passphrase-file", str(passphrase_file),
                                          "--armor", "--export-secret-keys", fingerprint))
            private = root / "working"
            private.mkdir()
            metadata, content = fixture()
            (private / "storage").mkdir()
            for name, data in content.items():
                (private / name).write_bytes(data)
            output = root / "output"
            with patch.dict(os.environ, {"RECOVERY_BACKUP_PUBLIC_KEY": public,
                                        "RECOVERY_BACKUP_FINGERPRINT": fingerprint}):
                report = bundle.encrypt_bundle(private, metadata, metadata["storage_files"], output)
            self.assertFalse(report["retained_copy_restore_verified"])
            self.assertEqual(sorted(p.name for p in output.iterdir()), ["SHA256SUMS", "recovery.tar.gz.gpg"])
            replay = root / "replay"
            replay.mkdir()
            restored = restore.decrypt(output / "recovery.tar.gz.gpg",
                (output / "SHA256SUMS").read_text().split()[0], key_file, replay, passphrase_file)
            recovered = restore.unpack_verified(restored, replay / "components")
            self.assertEqual(recovered["project"], drill.PROJECT)
            with tarfile.open(restored) as archive:
                manifest = json.load(archive.extractfile("recovery.json"))
                self.assertEqual(manifest["table_acls"], metadata["table_acls"])
                for name, digest in manifest["checksums"].items():
                    self.assertEqual(hashlib.sha256(archive.extractfile(name).read()).hexdigest(), digest)
            with self.assertRaisesRegex(RuntimeError, "fingerprint mismatch"):
                bundle.import_recipient(home, public, "0" * 40)
            with self.assertRaisesRegex(RuntimeError, "public key only"):
                bundle.import_recipient(home, "BEGIN PGP PRIVATE KEY BLOCK", fingerprint)


if __name__ == "__main__":
    unittest.main()

