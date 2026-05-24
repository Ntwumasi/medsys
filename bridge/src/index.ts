import { config, log } from './config';
import { startWorklistPoller } from './worklistPoller';
import { startChangesPoller } from './changesPoller';

async function main(): Promise<void> {
  log.info('medsys-bridge starting');
  log.info('MedSys API:', config.medsysApiUrl);
  log.info('Orthanc:   ', config.orthancUrl);
  log.info('Worklist:  ', config.worklistDir);

  startChangesPoller();
  startWorklistPoller();

  log.info('bridge running. Ctrl+C to stop.');
}

process.on('uncaughtException', (err) => {
  log.error('uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection:', reason);
});

main().catch((err) => {
  log.error('fatal:', err);
  process.exit(1);
});
