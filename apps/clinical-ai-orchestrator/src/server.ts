import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

const config = loadConfig();
const { app } = createApp(config);

app.listen(config.port, () => {
  logger.info('Clinical AI orchestrator listening', {
    port: config.port,
    bindings: config.doctorBindings.length,
    signatureValidation: !config.skipTwilioSignatureValidation,
  });
});
