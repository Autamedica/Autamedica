import * as Sentry from '@sentry/astro';
import { sanitizeEvent } from './src/lib/observability/sentry';

// AuthLayout injects this runtime value before Astro's client scripts execute.
// The build-time fallbacks keep local and static preview configurations working.
const dsn =
  (typeof window !== 'undefined' ? window.__ENV?.PUBLIC_SENTRY_DSN : undefined) ||
  import.meta.env.PUBLIC_SENTRY_DSN ||
  import.meta.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      return sanitizeEvent(event);
    },
  });
}
