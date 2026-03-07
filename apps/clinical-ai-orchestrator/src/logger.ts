type LogLevel = 'info' | 'warn' | 'error';

function writeLog(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
  const payload = metadata ? ` ${JSON.stringify(metadata)}` : '';
  const line = `[clinical-ai-orchestrator] ${message}${payload}`;

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export const logger = {
  info(message: string, metadata?: Record<string, unknown>): void {
    writeLog('info', message, metadata);
  },
  warn(message: string, metadata?: Record<string, unknown>): void {
    writeLog('warn', message, metadata);
  },
  error(message: string, metadata?: Record<string, unknown>): void {
    writeLog('error', message, metadata);
  },
};
