import 'dotenv/config';

global.console = {
  ...console,
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: console.warn,
  error: console.error,
};
