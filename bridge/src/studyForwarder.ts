import express, { Request, Response } from 'express';
import { config, log } from './config';
import { buildStudyPayload } from './orthancClient';
import { postStudyWebhook } from './medsysClient';

interface PendingForward {
  attempts: number;
  payload: Awaited<ReturnType<typeof buildStudyPayload>>;
}

const retryQueue: PendingForward[] = [];

async function forwardWithRetry(orthancStudyId: string): Promise<void> {
  const payload = await buildStudyPayload(orthancStudyId);
  try {
    await postStudyWebhook(payload);
  } catch (err) {
    log.warn(`MedSys forward failed for ${payload.study_instance_uid}, queueing for retry:`, (err as Error).message);
    retryQueue.push({ attempts: 1, payload });
  }
}

async function drainRetryQueue(): Promise<void> {
  if (retryQueue.length === 0) return;
  log.info(`retrying ${retryQueue.length} queued study forward(s)`);
  const items = retryQueue.splice(0, retryQueue.length);
  for (const item of items) {
    try {
      await postStudyWebhook(item.payload);
    } catch (err) {
      item.attempts += 1;
      if (item.attempts < 10) {
        retryQueue.push(item);
      } else {
        log.error(`giving up on study ${item.payload.study_instance_uid} after ${item.attempts} attempts`);
      }
    }
  }
}

export function startStudyForwarder(): { server: ReturnType<typeof express>; retryTimer: NodeJS.Timeout } {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Loopback-only check — this endpoint is only for the local Orthanc plugin.
  app.use((req, res, next) => {
    const ip = req.socket.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return next();
    }
    res.status(403).json({ error: 'Local access only' });
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, queued: retryQueue.length });
  });

  app.post('/study-stored', async (req: Request, res: Response) => {
    const { orthanc_study_id } = req.body || {};
    if (!orthanc_study_id || typeof orthanc_study_id !== 'string') {
      return res.status(400).json({ error: 'orthanc_study_id required' });
    }
    log.info('plugin reported stored study:', orthanc_study_id);
    res.json({ ok: true });
    // Process asynchronously so the plugin returns fast
    forwardWithRetry(orthanc_study_id).catch((err) => {
      log.error('forward failed:', err);
    });
  });

  app.listen(config.pluginIngressPort, '127.0.0.1', () => {
    log.info(`plugin ingress listening on http://127.0.0.1:${config.pluginIngressPort}`);
  });

  const retryTimer = setInterval(() => { void drainRetryQueue(); }, 60_000);

  return { server: app, retryTimer };
}
