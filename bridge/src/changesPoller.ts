import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config, log } from './config';
import { getChanges, buildStudyPayload } from './orthancClient';
import { postStudyWebhook } from './medsysClient';

// Where we persist the last-processed Orthanc change sequence number, so a
// restart of the bridge doesn't re-process every study that's ever existed.
const STATE_FILE = path.join(process.cwd(), '.bridge-state.json');

interface BridgeState {
  last_change_seq: number;
}

async function loadState(): Promise<BridgeState> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.last_change_seq === 'number') {
      return { last_change_seq: parsed.last_change_seq };
    }
  } catch {
    // First run, or corrupted state — fall through to fresh state.
  }
  return { last_change_seq: 0 };
}

async function saveState(state: BridgeState): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let running = false;
let state: BridgeState | null = null;

/**
 * One pass over Orthanc /changes since the last seen sequence number.
 * For each StableStudy event we haven't seen before, fetch full metadata
 * and POST it to MedSys.
 */
export async function pollChangesOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    if (!state) state = await loadState();

    // Drain the full changes stream up to the current tip.
    while (true) {
      const page = await getChanges(state.last_change_seq, 100);
      if (page.Changes.length === 0) {
        if (page.Last > state.last_change_seq) {
          state.last_change_seq = page.Last;
          await saveState(state);
        }
        break;
      }

      for (const change of page.Changes) {
        if (change.ChangeType === 'StableStudy' && change.ResourceType === 'Study') {
          try {
            const payload = await buildStudyPayload(change.ID);
            await postStudyWebhook(payload);
            log.info(`forwarded study ${change.ID} (seq ${change.Seq})`);
          } catch (err) {
            log.error(`failed to forward study ${change.ID}:`, (err as Error).message);
            // Don't advance past a failed study — we'll retry it on the next poll.
            // (We persist Last AFTER this loop, so a throw here would leave Last unchanged.)
            throw err;
          }
        }
      }

      // Advance and persist
      state.last_change_seq = page.Last;
      await saveState(state);

      if (page.Done) break;
    }
  } catch (err) {
    log.warn('changes poll error:', (err as Error).message);
  } finally {
    running = false;
  }
}

export function startChangesPoller(): NodeJS.Timeout {
  log.info(`Orthanc changes poller starting (every ${config.pollIntervalMs}ms)`);
  void pollChangesOnce();
  return setInterval(() => { void pollChangesOnce(); }, config.pollIntervalMs);
}
