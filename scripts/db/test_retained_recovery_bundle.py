"""Credential-free capture failure tests and a real GnuPG recovery round trip."""
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import retained_recovery_bundle as bundle
import production_recovery_drill as drill


class Response(io.BytesIO):
    status = 200

    def __init__(self, data, url):
        super().__init__(data)
        self.url = url
        self.headers = {"ETag": hashlib.md5(data, usedforsecurity=False).hexdigest()}

    def geturl(self):
        return self.url


class BundleTests(unittest.TestCase):
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
            try:
                bundle.gpg(home, "--pinentry-mode", "loopback", "--passphrase", "",
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
            private = root / "working"
            private.mkdir()
            for name in bundle.SQL_PARTS:
                (private / (name + ".sql")).write_text("SELECT 1;\n")
            (private / "storage").mkdir()
            object_name = "storage/" + "a" * 64 + ".bin"
            (private / object_name).write_bytes(b"synthetic pdf")
            output = root / "output"
            with patch.dict(os.environ, {"RECOVERY_BACKUP_PUBLIC_KEY": public,
                                        "RECOVERY_BACKUP_FINGERPRINT": fingerprint}):
                report = bundle.encrypt_bundle(private, {"table_acls": [{"synthetic": True}],
                    "sql_checksums": {name: hashlib.sha256(b"SELECT 1;\n").hexdigest() for name in bundle.SQL_PARTS}},
                    [{"file": object_name, "bytes": 13,
                      "sha256": hashlib.sha256(b"synthetic pdf").hexdigest()}], output)
            self.assertFalse(report["retained_copy_restore_verified"])
            self.assertEqual(sorted(p.name for p in output.iterdir()), ["SHA256SUMS", "recovery.tar.gz.gpg"])
            restored = root / "decrypted.tar.gz"
            bundle.gpg(home, "--output", str(restored), "--decrypt", str(output / "recovery.tar.gz.gpg"))
            with tarfile.open(restored) as archive:
                manifest = json.load(archive.extractfile("recovery.json"))
                self.assertEqual(manifest["table_acls"], [{"synthetic": True}])
                for name, digest in manifest["checksums"].items():
                    self.assertEqual(hashlib.sha256(archive.extractfile(name).read()).hexdigest(), digest)
            with self.assertRaisesRegex(RuntimeError, "fingerprint mismatch"):
                bundle.import_recipient(home, public, "0" * 40)
            with self.assertRaisesRegex(RuntimeError, "public key only"):
                bundle.import_recipient(home, "BEGIN PGP PRIVATE KEY BLOCK", fingerprint)


if __name__ == "__main__":
    unittest.main()
