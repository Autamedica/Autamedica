import * as Sentry from '@sentry/astro';
import { getBaseSentryConfig } from './sentry.shared.config.js';

Sentry.init({
  ...getBaseSentryConfig('client'),
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
  tracePropagationTargets: [
    /^\/api\//,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://autamedica.com',
    'https://www.autamedica.com',
    'https://paciente.autamedica.com',
    'https://patients.autamedica.com',
    'https://doctor.autamedica.com',
    'https://doctors.autamedica.com',
    'https://empresa.autamedica.com',
    'https://companies.autamedica.com',
    'https://admin.autamedica.com',
  ],
});
