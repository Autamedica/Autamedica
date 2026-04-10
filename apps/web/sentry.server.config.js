import * as Sentry from '@sentry/astro';
import { getBaseSentryConfig } from './sentry.shared.config.js';

Sentry.init({
  ...getBaseSentryConfig('server'),
});
