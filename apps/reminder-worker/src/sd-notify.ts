import { spawn } from 'node:child_process';

const SOCKET = globalThis.process?.env?.NOTIFY_SOCKET ?? '';
export const underSystemd = Boolean(SOCKET);

function send(args: string[]): void {
  if (!underSystemd) return;
  const proc = spawn('systemd-notify', args, { stdio: 'ignore', detached: true });
  proc.on('error', () => {});
  proc.unref();
}

export function sdReady(status?: string): void {
  const args = ['--ready'];
  if (status) args.push(`--status=${status}`);
  send(args);
}

export function sdWatchdog(): void {
  send(['WATCHDOG=1']);
}

export function sdStopping(status?: string): void {
  const args = ['STOPPING=1'];
  if (status) args.push(`STATUS=${status}`);
  send(args);
}

export function sdStatus(status: string): void {
  send([`--status=${status}`]);
}
