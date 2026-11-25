# Gemini CLI + AutaMedica Android Companion

This adds Gemini CLI as a second, independent coding agent alongside Codex CLI.

## Shared architecture

- Codex and Gemini each run in their own CLI process and may use separate tmux sessions.
- Both clients launch the same authenticated local MCP process:
  `~/.local/share/autamedica-android/launch-mcp.sh`.
- The Companion token, Android AccessibilityService, Android control listener and WebView/CDP bridge are shared. No second Android server or second token is created.
- Gemini's MCP entry is `autamedica_android` in `~/.gemini/settings.json`.
- Existing Gemini settings and other MCP servers are preserved. The Companion server is registered with `trust: false`, leaving Gemini's tool confirmation behavior enabled.

## Install on Xiaomi (inside the same Debian/Termux environment)

Prerequisites: Node.js 20+ for Gemini CLI. The existing Companion bridge must already be installed for Codex in this same Linux home.

From the repository root:

```bash
bash apps/android-companion/tools/gemini/install-gemini-companion.sh
```

The installer:
1. Installs the stable `@google/gemini-cli` package if the `gemini` command is missing.
2. Verifies the existing Companion launcher and local token file without printing or copying the token.
3. Merges the MCP definition into `~/.gemini/settings.json`, creating a timestamped backup first.
4. Preserves existing MCP entries and existing Gemini preferences.

If the Companion bridge has not been installed in this Linux home, first run the existing Companion installer:

```bash
bash apps/android-companion/tools/mcp/install-termux.sh
```

That setup asks for the token directly in the terminal. Never paste the token into chat or commit it.

## Launch

Direct session:

```bash
./gemini.sh
```

Independent tmux session:

```bash
./gemini.sh --tmux
```

The installer marks `gemini.sh` executable. Use `bash gemini.sh` if the checkout filesystem does not preserve executable bits. The tmux session name is `autamedica-gemini`; Codex sessions are not stopped or reused.

At first launch, Gemini may ask you to authenticate with your Google account and trust the AutaMedica repository folder. Complete that interactive setup in the terminal.

## Verify

Inside Gemini CLI, run:

```text
/mcp
```

Or from a shell in a trusted AutaMedica project folder:

```bash
gemini mcp list
```

The MCP list should show `autamedica_android` as connected. Then ask Gemini to call the Companion status and native UI tools. Verify the returned Android package/UI state before considering the phone connected.

## Native Android capabilities

Gemini receives the same Companion tools as Codex, including status, UI tree, screenshot, open app, tap, click, type, swipe, back, home and wait-for-text. Browser/CDP tools are also exposed by the shared server, but are independent of native Android app control.

## Test settings merge

```bash
python3 apps/android-companion/tools/gemini/test-gemini-settings.py
bash -n gemini.sh
bash -n apps/android-companion/tools/gemini/install-gemini-companion.sh
```
