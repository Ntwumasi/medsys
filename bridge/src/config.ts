import 'dotenv/config';

const required = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const config = {
  medsysApiUrl: required('MEDSYS_API_URL').replace(/\/$/, ''),
  bridgeApiKey: required('BRIDGE_API_KEY'),
  worklistDir: process.env.WORKLIST_DIR || 'C:\\OrthancWorklists',
  dump2dcmPath: process.env.DUMP2DCM_PATH || 'C:\\Program Files\\DCMTK\\bin\\dump2dcm.exe',
  orthancUrl: (process.env.ORTHANC_URL || 'http://localhost:8042').replace(/\/$/, ''),
  orthancUsername: process.env.ORTHANC_USERNAME || 'medsys',
  orthancPassword: process.env.ORTHANC_PASSWORD || '',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10),
  logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
};

const levels = { debug: 0, info: 1, warn: 2, error: 3 } as const;

export const log = {
  debug: (...a: unknown[]) => levels[config.logLevel] <= 0 && console.log('[debug]', ...a),
  info:  (...a: unknown[]) => levels[config.logLevel] <= 1 && console.log('[info]', ...a),
  warn:  (...a: unknown[]) => levels[config.logLevel] <= 2 && console.warn('[warn]', ...a),
  error: (...a: unknown[]) => console.error('[error]', ...a),
};
