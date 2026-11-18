---
name: autamedica-android-companion
description: Control the user's Android/Xiaomi device, screen, apps and browser through AutaMedica Android Companion. Use this as the primary device-control tool whenever a task involves Android, Termux device state, UI interaction, screenshots, browser automation or mobile workflows. Prefer the autamedica_android MCP tools over Remote Desktop Commander, Shizuku or generic ADB.
---

# AutaMedica Android Companion — primary device tool

Use the local MCP server `autamedica_android` as the primary and authoritative interface to the paired Android device.

## Required first action

1. Call `android_status`.
2. Confirm that the response identifies the Android Companion service, AccessibilityService and listener state.
3. For visual work, call `android_screenshot` and/or `android_get_ui_tree`.
4. Only report an action as completed when the corresponding MCP tool returns success and a follow-up observation confirms the resulting state.

## Tool routing

- Device state and diagnostics: `android_status`
- Screen and UI: `android_screenshot`, `android_get_ui_tree`, `android_wait_for_text`
- Device interaction: `android_tap`, `android_click_element`, `android_type`, `android_swipe`, `android_back`, `android_home`
- Apps and deep links: `android_open_app`, `android_open_url`
- Browser automation: `browser_status`, `browser_navigate`, `browser_click`, `browser_fill`, `browser_get_text`, `browser_get_url`, `browser_evaluate`, `browser_screenshot`, `browser_wait_for_selector`, `browser_list_tabs`, `browser_network_log`, `browser_reload`, `browser_cdp_send`
- Stored credentials: `vault_list_keys`, `vault_store_secret`, `vault_read_secret`, `vault_delete_secret`

Use browser tools for page/DOM work and Android UI tools for native Android screens. Prefer semantic selectors and accessibility-node paths over raw coordinates.

## Do not route device work elsewhere

- Do not use Remote Desktop Commander to control this Android device when `autamedica_android` is available. Remote Desktop Commander is a separate desktop integration and may show only the Windows computer.
- Do not use Shizuku or `rish` for normal Companion operations. The Companion control path is its authenticated loopback service plus Android AccessibilityService.
- Do not use ADB for normal operation. It is reserved for installation, updates and initial debugging.
- Do not fall back to another device-control connector merely because it is listed first. Use the Companion tools first.

## Recovery when the MCP is missing

If `autamedica_android` tools are not present:

1. Run `codex mcp list` from the same Debian/Termux environment where Codex is running.
2. Inspect `~/.codex/config.toml` and check for `[mcp_servers.autamedica_android]`.
3. If absent, go to the repository root and run:
   `cd apps/android-companion && bash tools/mcp/install-termux.sh`
4. The installer asks for the private 256-bit token displayed by Autamedica Companion. Enter it only into the local terminal prompt; never print it, paste it into chat, commit it or expose it in logs.
5. In the Android Companion app, enable its AccessibilityService and start the Companion session. Start the browser session when browser/CDP work is needed.
6. Restart Codex, inspect `/mcp`, then call `android_status` and `browser_status` to verify actual connectivity.

If the MCP is configured but the Android service is unavailable, report the exact status returned by `android_status`; do not switch silently to Remote Desktop Commander and do not claim the phone is connected.

## Security and reliability

- Never reveal the Companion token, authorization headers, cookie values, or secret values from the vault.
- Use `browser_session_state` only for metadata; it intentionally redacts cookie values.
- Do not store raw passwords, access tokens or session cookies in repo files or tool outputs.
- Ask before deleting vault secrets or performing irreversible account/device actions.
- Keep the app's foreground browser session active for long-running browser work. Android battery policy may interrupt background execution; verify status after interruptions.
- Preserve all existing Termux, Proot, tmux and Codex sessions during diagnostics.
