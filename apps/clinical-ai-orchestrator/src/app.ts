import cors from 'cors';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { AppConfig } from './config.js';
import { logger } from './logger.js';
import { ClinicalAiPipelineService, createService, isInvalidInternalPayloadError, isPipelineExecutionError } from './service.js';
import type { InternalStageSlug } from './types.js';

const INTERNAL_STAGE_SLUGS: InternalStageSlug[] = [
  'media-fetch',
  'audio-prep',
  'stt-submit',
  'stt-finalize',
  'normalize',
  'reason',
  'validate',
  'deliver',
  'cleanup',
];

function jsonError(res: Response, status: number, error: string): void {
  res.status(status).json({ accepted: false, error });
}

function resolveRequestUrl(request: Request, config: AppConfig): string {
  if (config.publicBaseUrl) {
    return new URL(request.originalUrl, config.publicBaseUrl).toString();
  }

  return `${request.protocol}://${request.get('host')}${request.originalUrl}`;
}

function requireInternalApiKey(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!config.internalApiKey) {
      next();
      return;
    }

    const headerValue = request.header('x-internal-api-key');
    if (headerValue !== config.internalApiKey) {
      jsonError(response, 401, 'Invalid internal API key');
      return;
    }

    next();
  };
}

export function createApp(
  config: AppConfig,
  service: ClinicalAiPipelineService = createService(config)
): { app: Express; service: ClinicalAiPipelineService } {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get('/health', async (_request: Request, response: Response) => {
    const state = await service.getStateSnapshot();
    response.json({
      status: 'ok',
      service: 'clinical-ai-orchestrator',
      timestamp: new Date().toISOString(),
      store: state.storeKind,
      bindings: state.bindings.length,
      sessions: state.sessions.length,
      mediaItems: state.mediaItems.length,
      jobs: state.jobs.length,
      transcripts: state.transcripts.length,
    });
  });

  app.post('/api/v1/whatsapp/webhooks/inbound', async (request: Request, response: Response) => {
    const result = await service.handleTwilioWebhook({
      requestUrl: resolveRequestUrl(request, config),
      signature: request.header('X-Twilio-Signature') || '',
      rawBody: request.body as Record<string, unknown>,
    });

    response.status(result.httpStatus).json(result.body);
  });

  app.use('/internal', requireInternalApiKey(config));

  for (const stageSlug of INTERNAL_STAGE_SLUGS) {
    app.post(`/internal/jobs/${stageSlug}`, async (request: Request, response: Response) => {
      try {
        const result = await service.acceptInternalJob(stageSlug, request.body);
        response.status(200).json(result);
      } catch (error) {
        if (isInvalidInternalPayloadError(error)) {
          jsonError(response, 400, error instanceof Error ? error.message : 'Invalid internal payload');
          return;
        }

        if (isPipelineExecutionError(error)) {
          jsonError(response, 500, error instanceof Error ? error.message : 'Job execution failed');
          return;
        }

        jsonError(response, 500, error instanceof Error ? error.message : 'Unexpected internal job error');
      }
    });
  }

  if (config.enableDebugState) {
    app.get('/internal/state', async (_request: Request, response: Response) => {
      response.json(await service.getStateSnapshot());
    });
  }

  app.use((request: Request, response: Response) => {
    logger.warn('Route not found', { method: request.method, path: request.path });
    jsonError(response, 404, 'Not found');
  });

  return { app, service };
}
