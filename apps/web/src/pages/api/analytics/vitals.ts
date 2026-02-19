/**
 * Endpoint Astro para recibir métricas de Web Vitals.
 * Equivalente al route.ts de Next.js (mismo contrato de API).
 *
 * Métricas: LCP, FID, CLS, FCP, TTFB, INP
 */

import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';

interface WebVitalMetric {
  name: string;
  value: number;
  id: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const metric = await request.json() as WebVitalMetric;

    if (!metric.name || typeof metric.value !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Invalid metric data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.info('📊 Web Vital Received:', {
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType
    });

    return new Response(
      JSON.stringify({ success: true, metric: metric.name }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    logger.error('Error processing web vital:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/analytics/vitals',
      methods: ['POST'],
      description: 'Web Vitals analytics endpoint'
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
