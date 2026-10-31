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

## 2026-10-31 recovery follow-up — verified Oracle disk and logs

**Production findings** (GitHub Actions [fast inspection](https://github.com/ecucondorSA/Autamedica/actions/runs/41231926696), [read-only progress check](https://github.com/ecucondorSA/Autamedica/actions/runs/41232828657), [rotation audit](https://github.com/ecucondorSA/Autamedica/actions/runs/41232922025)):

- Root filesystem was completely full (30 GiB, effectively zero free). /var/log used about 15.6 GiB.
- Historical rotated `/var/log/messages-*` files from August/September were 0.8–5.8 GiB each, uncompressed.
- An approved recovery workflow removed only root's disposable npm cache and began lossless gzip compression of four historical log files. At the 2026-10-31 19:09 UTC read-only probe, **5,618 MiB were free**; the OpenClaw Gateway remained active and `/readyz` returned HTTP 200. **This probe is not proof that the recovery workflow has finished or that all gzip checks passed.**
- The live `/var/log/messages` is still approximately 3,766 MiB and was **not** compressed or truncated.
- `logrotate.timer` is active; `/etc/logrotate.d/rsyslog` controls `/var/log/messages`. From the last 10,000 syslog entries, `warp-desktop-svc` contributed 4,734 and `turnserver` 3,777 entries. These counts do not characterize the entire historical log.
- All **new diagnostic and recovery workflows on this PR have manual-only triggers**; they are not intended for automatic deployment.

### Prevent disk exhaustion from recurring

1. First ensure the recovery job finishes successfully, with gzip integrity checks and `/readyz=200`, before planning further production work.
2. Do not delete, truncate, or blindly suppress the live `/var/log/messages`; investigate WARP and TURN log severity and excessive restart/error loops. No raw log content or secrets should be printed into public/shared CI.
3. With a separate backup of the current `/etc/logrotate.d/rsyslog`, adjust syslog retention for this host by explicitly enabling `compress`, a documented `rotate` retention count, and an appropriate `daily` + `maxsize` policy. Preserve the existing postrotate rsyslog reload behavior. Coordinate retention with operational and compliance needs.
4. Verify the proposed configuration first with `sudo logrotate -d /etc/logrotate.conf`, and confirm the scheduled logrotate invocation frequency. A size limit cannot rotate more frequently than the timer runs.
5. Add alerts for root disk utilization and inode capacity, with headroom for Gateway state snapshots and Node/OpenClaw updates.
6. **Upgrade gate:** before any OpenClaw bridge update, require a verified recovery archive of `/opt/openclaw`, `/opt/nodejs`, the Gateway systemd unit and relevant configuration; do not upload agent sessions or secret state to GitHub. Manual or external backup work must use an authorized mechanism.
7. The automated stop/backup workflow creation attempt was blocked by tool security controls. Do not try to bypass that denial through alternate tool routes. The release upgrade and MCP activation remain unperformed.

Logrotate reference: https://man7.org/linux/man-pages/man8/logrotate.8.html
OpenClaw migration: https://docs.openclaw.ai/install/updating
