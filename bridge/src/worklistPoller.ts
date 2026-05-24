import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { config, log } from './config';
import { fetchPendingWorklist, markWorklistPushed, PendingWorklistOrder } from './medsysClient';
import { buildWorklistDump } from './dumpBuilder';

async function ensureWorklistDir(): Promise<void> {
  await fs.mkdir(config.worklistDir, { recursive: true });
}

function runDump2Dcm(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.dump2dcmPath, ['+Ug', '+E', inputPath, outputPath], {
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`dump2dcm exited ${code}: ${stderr}`));
    });
  });
}

async function processOrder(order: PendingWorklistOrder): Promise<void> {
  const { dumpText } = buildWorklistDump(order);
  const baseName = `order-${order.order_id}`;
  const dumpPath = path.join(config.worklistDir, `${baseName}.dump`);
  const wlPath = path.join(config.worklistDir, `${baseName}.wl`);

  await fs.writeFile(dumpPath, dumpText, 'utf8');
  log.debug('wrote dump file', dumpPath);

  await runDump2Dcm(dumpPath, wlPath);
  log.info(`worklist entry written for order ${order.order_id} → ${wlPath}`);

  // Clean up the intermediate .dump so the worklist plugin only sees .wl files
  try { await fs.unlink(dumpPath); } catch { /* ignore */ }

  await markWorklistPushed(order.order_id);
}

let running = false;

export async function pollOnce(): Promise<void> {
  if (running) return; // prevent overlap if a poll takes longer than the interval
  running = true;
  try {
    await ensureWorklistDir();
    const orders = await fetchPendingWorklist();
    if (orders.length === 0) {
      log.debug('no pending worklist orders');
      return;
    }
    log.info(`processing ${orders.length} pending worklist order(s)`);
    for (const order of orders) {
      try {
        await processOrder(order);
      } catch (err) {
        log.error(`failed order ${order.order_id}:`, (err as Error).message);
      }
    }
  } catch (err) {
    log.error('worklist poll failed:', (err as Error).message);
  } finally {
    running = false;
  }
}

export function startWorklistPoller(): NodeJS.Timeout {
  log.info(`worklist poller starting (every ${config.pollIntervalMs}ms → ${config.worklistDir})`);
  // Run immediately, then on interval
  void pollOnce();
  return setInterval(() => { void pollOnce(); }, config.pollIntervalMs);
}
