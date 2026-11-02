"""Negative tests for retained-only restoration; no source credentials required."""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import restore_retained_bundle as restore


def fixture():
    content = {part + ".sql": b"SELECT 1;" for part in restore.bundle.SQL_PARTS}
    identity = ("medical-documents", "synthetic/report.pdf")
    filename = "storage/" + hashlib.sha256(json.dumps(identity).encode()).hexdigest() + ".bin"
    content[filename] = b"PDF"
    checksums = {name: hashlib.sha256(data).hexdigest() for name, data in content.items()}
    manifest = {"format_version": 1, "project": restore.drill.PROJECT,
                "postgres_image_version": restore.drill.POSTGRES_IMAGE_VERSION,
                "database_restore_verified_before_packaging": True,
                "checksums": checksums, "sql_checksums": {part: checksums[part + ".sql"] for part in restore.bundle.SQL_PARTS},
                "extensions": [], "tables": [], "expected_data": [], "table_acls": [],
                "foreign_keys": [], "expected_metadata": {},
                "storage_files": [{"bucket_id": identity[0], "name": identity[1],
                                   "file": filename, "bytes": 3, "sha256": checksums[filename]}],
                "storage_inventory": {"buckets": [], "objects": [{"bucket_id": identity[0], "name": identity[1]}]}}
    return manifest, content


def make_archive(path, manifest, content, extra=None):
    with tarfile.open(path, "w:gz") as archive:
        for name, data in {"recovery.json": json.dumps(manifest).encode(), **content}.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
        if extra:
            archive.addfile(extra)


class RetainedRestoreTests(unittest.TestCase):
    def test_valid_components_reconstruct_without_source_access(self):
        manifest, content = fixture()
        with tempfile.TemporaryDirectory() as temporary, patch.object(restore.bundle, "build_opener") as network:
            root = Path(temporary)
            make_archive(root / "copy.tar.gz", manifest, content)
            actual = restore.unpack_verified(root / "copy.tar.gz", root / "restored")
            self.assertEqual(actual, manifest)
            for name, data in content.items():
                self.assertEqual((root / "restored" / name).read_bytes(), data)
            network.assert_not_called()

    def test_path_escape_symlink_duplicate_and_unknown_member_are_rejected(self):
        manifest, content = fixture()
        for name, kind in (("../escape", tarfile.REGTYPE), ("roles.sql", tarfile.SYMTYPE),
                           ("roles.sql", tarfile.REGTYPE), ("leaked.log", tarfile.REGTYPE)):
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                extra = tarfile.TarInfo(name)
                extra.type = kind
                extra.linkname = "/outside"
                make_archive(root / "copy.tar.gz", manifest, content, extra)
                with self.assertRaisesRegex(RuntimeError, "Unsafe or duplicate"):
                    restore.unpack_verified(root / "copy.tar.gz", root / "restored")
                self.assertFalse((root / "escape").exists())

    def test_corrupt_bytes_are_rejected(self):
        manifest, content = fixture()
        content["data.sql"] = b"CORRUPT"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            make_archive(root / "copy.tar.gz", manifest, content)
            with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
                restore.unpack_verified(root / "copy.tar.gz", root / "restored")

    def test_wrong_project_image_or_unverified_format_is_rejected(self):
        manifest, content = fixture()
        for field, value in (("project", "other"), ("postgres_image_version", "latest"),
                             ("format_version", 2), ("database_restore_verified_before_packaging", False)):
            changed = dict(manifest, **{field: value})
            with self.assertRaises(RuntimeError):
                restore.validate_manifest(changed, {"recovery.json", *content})

    def test_missing_sql_extra_object_or_identity_mismatch_is_rejected(self):
        manifest, content = fixture()
        variants = []
        missing = copy.deepcopy(manifest)
        del missing["checksums"]["data.sql"]
        variants.append(missing)
        mismatch = copy.deepcopy(manifest)
        mismatch["storage_files"][0]["name"] = "other.pdf"
        variants.append(mismatch)
        duplicate = copy.deepcopy(manifest)
        duplicate["storage_files"] *= 2
        variants.append(duplicate)
        incomplete = copy.deepcopy(manifest)
        incomplete["storage_inventory"]["objects"] = []
        variants.append(incomplete)
        for changed in variants:
            with self.assertRaises(RuntimeError):
                restore.validate_manifest(changed, {"recovery.json", *content})

    def test_resource_limit_precedes_extraction(self):
        manifest, content = fixture()
        with tempfile.TemporaryDirectory() as temporary, patch.object(restore, "MAX_ARCHIVE_BYTES", 1):
            root = Path(temporary)
            make_archive(root / "copy.tar.gz", manifest, content)
            with self.assertRaisesRegex(RuntimeError, "supported limits"):
                restore.unpack_verified(root / "copy.tar.gz", root / "restored")

    def test_ciphertext_corruption_precedes_key_import(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(restore.bundle, "gpg") as process:
            root = Path(temporary)
            (root / "encrypted").write_bytes(b"corrupt")
            with self.assertRaisesRegex(RuntimeError, "ciphertext checksum"):
                restore.decrypt(root / "encrypted", "0" * 64, root / "key", root)
            process.assert_not_called()

    def test_source_credentials_are_not_forwarded(self):
        with patch.dict(os.environ, {"SUPABASE_DB_URL": "secret", "PGPASSWORD": "secret",
                                    "RECOVERY_KEY": "secret", "PATH": "/usr/bin"}, clear=True):
            self.assertEqual(restore.child_environment(), {"PATH": "/usr/bin", "LC_ALL": "C"})

    def test_key_agent_is_killed_even_when_import_or_decrypt_fails(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(restore.bundle, "gpg", side_effect=RuntimeError("failed")), patch.object(restore.subprocess, "run") as process:
            root = Path(temporary)
            ciphertext = root / "copy.gpg"
            ciphertext.write_bytes(b"ciphertext")
            process.return_value.returncode = 0
            with self.assertRaises(RuntimeError):
                restore.decrypt(ciphertext, hashlib.sha256(b"ciphertext").hexdigest(), root / "key", root)
            self.assertEqual(process.call_args.args[0], ["gpgconf", "--homedir", str(root / "keys"), "--kill", "gpg-agent"])

    def test_confirmation_precedes_decryption_or_restore(self):
        with patch("sys.argv", ["restore", "--bundle", "copy", "--sha256", "0" * 64,
                                "--key-file", "key", "--confirm", "wrong"]), patch.object(restore, "decrypt") as decrypt:
            with self.assertRaisesRegex(RuntimeError, "confirmation"):
                restore.main()
            decrypt.assert_not_called()


if __name__ == "__main__":
    unittest.main()
