#!/usr/bin/env python3
"""Tests the JSON settings merge embedded in install-gemini-companion.sh."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

INSTALLER = Path(__file__).with_name("install-gemini-companion.sh")
SOURCE = INSTALLER.read_text(encoding="utf-8")
MATCH = re.search(
    r"python3 - \"\$SETTINGS\" \"\$MCP_LAUNCHER\" \"\$BRIDGE\" <<'PY'\n(.*?)\nPY\n",
    SOURCE,
    re.DOTALL,
)
if not MATCH:
    raise SystemExit("Could not locate the settings-writer Python block in installer")


class GeminiSettingsMergeTest(unittest.TestCase):
    def run_writer(self, settings: Path, launcher: Path, bridge: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-", str(settings), str(launcher), str(bridge)],
            input=MATCH.group(1),
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    def test_preserves_existing_settings_and_registers_shared_companion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = root / "settings.json"
            launcher = root / "launch-mcp.sh"
            bridge = root / "autamedica-android"
            launcher.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            bridge.mkdir()
            settings.write_text(
                json.dumps(
                    {
                        "theme": "dark",
                        "mcpServers": {
                            "existing-server": {"command": "existing-tool", "args": []}
                        },
                        "mcp": {
                            "allowed": ["existing-server"],
                            "excluded": ["autamedica_android"],
                        },
                    }
                ),
                encoding="utf-8",
            )

            result = self.run_writer(settings, launcher, bridge)

            self.assertEqual(result.returncode, 0, result.stderr)
            saved = json.loads(settings.read_text(encoding="utf-8"))
            self.assertEqual(saved["theme"], "dark")
            self.assertEqual(saved["mcpServers"]["existing-server"]["command"], "existing-tool")
            companion = saved["mcpServers"]["autamedica_android"]
            self.assertEqual(companion["command"], str(launcher.resolve()))
            self.assertEqual(companion["args"], [])
            self.assertEqual(companion["cwd"], str(bridge.resolve()))
            self.assertFalse(companion["trust"])
            self.assertEqual(saved["mcp"]["allowed"], ["existing-server", "autamedica_android"])
            self.assertEqual(saved["mcp"]["excluded"], [])
            self.assertTrue(list(root.glob("settings.json.bak-*")))

    def test_invalid_json_is_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            settings = root / "settings.json"
            launcher = root / "launch-mcp.sh"
            bridge = root / "autamedica-android"
            settings.write_text("{invalid", encoding="utf-8")
            original = settings.read_text(encoding="utf-8")

            result = self.run_writer(settings, launcher, bridge)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(settings.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
