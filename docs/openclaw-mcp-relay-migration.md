# OpenClaw MCP Relay — diagnosis and safe migration gate

**Evidence from Oracle VM on 2026-10-31** (GitHub Actions runs [41231184031](https://github.com/ecucondorSA/Autamedica/actions/runs/41231184031), [41231254595](https://github.com/ecucondorSA/Autamedica/actions/runs/41231254595), [41231353366](https://github.com/ecucondorSA/Autamedica/actions/runs/41231353366)):

| Check | Result |
| --- | --- |
| Oracle SSH using protected GitHub secrets + pinned host key | reachable |
| systemd `openclaw-gateway.service` | active |
| Gateway HTTP `http://127.0.0.1:18789/readyz` | 200 |
| OpenClaw CLI | 2026.5.7 |
| Node.js | 22.22.3 |
| npm | 11.14.1 |
| MCP Relay command/plugin | missing / not listed |
| CLI Gateway access as service owner | failed |
| OpenClaw backup subcommand | missing |
| OpenClaw updater dry-run | unsupported or failed |
| Node 24 binary in PATH | not found |

**Root cause:** This deployment predates the bundled MCP Relay. The Gateway is alive; it has not yet been upgraded to a release with MCP Relay. In addition, the currently installed Node.js 22 is not supported by modern OpenClaw releases. The current OpenClaw MCP endpoint listed in the ChatGPT private plugin is **not** proof of pairing.

## DO NOT run these directly on the live Gateway

- `npm install -g openclaw@latest` without checking the package owner and performing the documented migration bridge.
- `openclaw plugins enable mcp-relay` on the existing release: the plugin is not installed.
- Restart or stop the Gateway without backup and a rollback test.
- Change the bind address to `0.0.0.0`, publish the Gateway token, or put credentials in the repo.
- Treat a green GitHub Actions diagnostic as a successful MCP pairing.

## Safe migration sequence — requires maintenance and verified rollback

1. Determine the actual systemd unit owner, installation root, profile, state directory, and any overrides (do not log credentials).
2. Confirm sufficient disk space. Create a **verified full-state backup** protected with owner-only permissions, plus a VM/volume snapshot where possible. Keep backups on Oracle; never upload auth/session data as GitHub artifacts.
3. Consult https://docs.openclaw.ai/install/updating. Older installations need the documented **2026.9.5 bridge** before the latest update; take a second verified checkpoint after that migration.
4. Provision a patched Node.js **24.22.1+** or **26.12.1+** compatible runtime in an isolated path, without replacing the live Node 22 runtime until ready.
5. Perform a controlled maintenance with the documented bridge, Doctor migrations, and managed updater. Validate `/readyz`, WhatsApp channel state, service owner, and rollback while in a maintenance window.
6. Only after the new Gateway is proven healthy, run `openclaw plugins enable mcp-relay` and `openclaw mcp-relay status` as the correct account; follow any explicit restart instructions.
7. Authorize the MCP client with `openclaw mcp-relay pair` or Gateway Control UI > Connected apps. Pairing is one-time and expires after ten minutes; **do not put the code in chat or GitHub**.
8. ChatGPT full custom MCP requires a compatible plan/workspace, with initial setup on the web. ChatGPT Plus cannot be relied on for the complete custom MCP workflow. Android direct control is separate.

Official references:
- https://docs.openclaw.ai/plugins/mcp-relay
- https://docs.openclaw.ai/install/updating
- https://docs.openclaw.ai/install/updating/rollback-and-recovery
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

The GitHub Actions diagnostics workflow on this branch has been changed to **manual dispatch only**; no automatic production SSH operations remain.
