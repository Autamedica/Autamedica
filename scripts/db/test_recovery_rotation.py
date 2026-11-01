import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location("rotation", Path(__file__).with_name("rotate_recovery_password.py"))
rotation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rotation)


def configuration():
    return {
        "ROTATION_CONFIRMATION": "RESET-" + rotation.PROJECT,
        "SUPABASE_DB_PASSWORD": "a" * 64,
        "SUPABASE_ACCESS_TOKEN": "test-token",
        "SUPABASE_DB_URL": f"postgresql://postgres.{rotation.PROJECT}:{'a' * 64}@{rotation.SESSION_HOST}:5432/postgres",
    }


class RotationGuards(unittest.TestCase):
    def test_requires_exact_confirmation(self):
        env = configuration()
        env["ROTATION_CONFIRMATION"] = "yes"
        with self.assertRaises(RuntimeError):
            rotation.validate_configuration(env)

    def test_password_must_be_strong_and_staged_consistently(self):
        for value in ("short", "b" * 64):
            env = configuration()
            env["SUPABASE_DB_PASSWORD"] = value
            with self.assertRaises(RuntimeError):
                rotation.validate_configuration(env)

    def test_accepts_exact_production_configuration(self):
        _, _, options = rotation.validate_configuration(configuration())
        self.assertIn("default_transaction_read_only=on", options["PGOPTIONS"])

    @patch.object(rotation, "urlopen")
    def test_api_error_never_includes_response_body(self, open_url):
        open_url.side_effect = HTTPError("https://api.supabase.com", 403, "private-response", {}, None)
        with self.assertRaisesRegex(RuntimeError, r"^Management API rejected request \(HTTP 403\)$"):
            rotation.management_request("test-token", "/database/password", "secret")

    @patch.dict(rotation.os.environ, configuration(), clear=True)
    @patch.object(rotation, "management_request")
    @patch.object(rotation, "probe", return_value={})
    def test_already_working_password_is_not_rotated(self, probe, request):
        request.return_value = {"id": rotation.PROJECT, "status": "ACTIVE_HEALTHY"}
        rotation.main()
        self.assertEqual(request.call_count, 1)

    @patch.dict(rotation.os.environ, configuration(), clear=True)
    @patch.object(rotation, "management_request")
    @patch.object(rotation, "probe", side_effect=RuntimeError("source_guards_not_confirmed"))
    def test_non_auth_failure_cannot_trigger_rotation(self, probe, request):
        request.return_value = {"id": rotation.PROJECT, "status": "ACTIVE_HEALTHY"}
        with self.assertRaisesRegex(RuntimeError, "non-authentication"):
            rotation.main()
        self.assertEqual(request.call_count, 1)

    @patch.dict(rotation.os.environ, configuration(), clear=True)
    @patch.object(rotation.time, "sleep")
    @patch.object(rotation, "management_request")
    @patch.object(rotation, "probe")
    def test_post_rotation_timeout_is_retried(self, probe, request, sleep):
        request.return_value = {"id": rotation.PROJECT, "status": "ACTIVE_HEALTHY"}
        probe.side_effect = [RuntimeError("authentication"), rotation.subprocess.TimeoutExpired("psql", 40), {}]
        rotation.main()
        self.assertEqual(request.call_count, 2)
        self.assertEqual(probe.call_count, 3)
        sleep.assert_called_once_with(10)


if __name__ == "__main__":
    unittest.main()
