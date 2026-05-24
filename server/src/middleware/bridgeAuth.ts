import { Request, Response, NextFunction } from 'express';

const getBridgeApiKey = (): string => {
  const key = process.env.BRIDGE_API_KEY;
  if (!key) {
    throw new Error('BRIDGE_API_KEY environment variable is required');
  }
  return key;
};

export const authenticateBridge = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const provided = req.headers['x-bridge-key'];

  if (!provided || typeof provided !== 'string') {
    res.status(401).json({ error: 'Bridge authentication required' });
    return;
  }

  let expected: string;
  try {
    expected = getBridgeApiKey();
  } catch {
    console.error('CRITICAL: BRIDGE_API_KEY not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    res.status(401).json({ error: 'Invalid bridge key' });
    return;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  if (mismatch !== 0) {
    res.status(401).json({ error: 'Invalid bridge key' });
    return;
  }

  next();
};
