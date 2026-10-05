/**
 * SMS Service
 *
 * Real providers are wired up below (all via axios REST — no SDKs).
 * The first one whose credentials are present in the environment is used,
 * in this order (a failed Arkesel send falls through to the next one):
 *
 *   1. Arkesel         ARKESEL_API_KEY + ARKESEL_SENDER_ID       (Ghana-native — PRIMARY)
 *                      + ARKESEL_SENDER_APPROVED=true (app texts skip Arkesel until then)
 *   2. Hubtel          HUBTEL_CLIENT_ID + HUBTEL_CLIENT_SECRET   (Ghana; needs a GH business)
 *   3. Twilio          TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN    (US-centric; restricted for GH)
 *                      + TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID
 *   4. Africa's Talking AT_API_KEY + AT_USERNAME + AT_SENDER_ID  (Africa-native rates)
 *
 * Ghana A2P SMS requires a registered Sender ID with the provider regardless of
 * which one you pick. Numbers are normalized to E.164 (+233…) before sending.
 *
 * IMPORTANT: when NO provider is configured, sendSMS returns success:false (it
 * does NOT pretend to have sent). Callers must check `result.success` and never
 * tell a user a text was sent unless it was — otherwise "link sent" is a lie and
 * the patient never gets anything.
 */

import axios from 'axios';

/**
 * Arkesel sandbox: requests are accepted and appear in Arkesel's SMS history
 * but are never delivered or billed. Set ARKESEL_SANDBOX=true on any
 * environment that shares real patient data but must not text anyone
 * (staging).
 */
export const isArkeselSandbox = (): boolean => process.env.ARKESEL_SANDBOX === 'true';

export interface SMSResult {
  success: boolean;
  provider: string;
  messageId: string;
  error?: string;
}

export interface SMSMessage {
  to: string;
  message: string;
  patientId?: number;
  invoiceId?: number;
}

/**
 * Send an SMS message
 * Currently a stub that logs to console - replace with real provider
 */
export const sendSMS = async (to: string, message: string): Promise<SMSResult> => {
  // Normalize to E.164 (+233…) for providers that require it (Twilio, AT).
  const e164 = validatePhoneNumber(to).formatted;

  // If Arkesel is configured but fails (e.g. its Sender ID is still awaiting
  // approval, or the balance ran out), fall through to the next configured
  // provider rather than dropping the message. Only reported if nothing else
  // is configured.
  let arkeselFailure: SMSResult | null = null;
  const sandbox = isArkeselSandbox();

  // --- Provider 1: Arkesel (Ghana-native — our primary) ---
  // Only once the Sender ID is approved (or in sandbox). Before approval
  // Arkesel answers "success" but holds the message as PENDING APPROVAL, so
  // the fallback below never triggers and login codes / reminders silently
  // never arrive. Set ARKESEL_SENDER_APPROVED=true once Arkesel approves it.
  if (process.env.ARKESEL_API_KEY && (process.env.ARKESEL_SENDER_APPROVED === 'true' || sandbox)) {
    try {
      // Arkesel wants the number with country code and NO leading '+' (233XXXXXXXXX).
      const recipient = e164.replace(/^\+/, '');
      const response = await axios.post(
        'https://sms.arkesel.com/api/v2/sms/send',
        {
          sender: process.env.ARKESEL_SENDER_ID || 'Clinic',
          message,
          recipients: [recipient],
          ...(sandbox ? { sandbox: true } : {}),
        },
        { headers: { 'api-key': process.env.ARKESEL_API_KEY }, timeout: 15000 }
      );
      const ok = response.data?.status === 'success';
      const data = response.data?.data;
      if (ok) {
        return {
          success: true,
          provider: 'arkesel',
          messageId: (Array.isArray(data) ? data[0]?.id : data?.id) || '',
        };
      }
      console.error('Arkesel SMS rejected:', response.data);
      arkeselFailure = {
        success: false,
        provider: 'arkesel',
        messageId: '',
        error: response.data?.message || 'SMS send failed',
      };
    } catch (error: any) {
      console.error('Arkesel SMS send failed:', error?.response?.data || error?.message);
      arkeselFailure = {
        success: false,
        provider: 'arkesel',
        messageId: '',
        error: error?.response?.data?.message || error?.message || 'SMS send failed',
      };
    }
  }

  // In sandbox mode nothing may reach a real phone — never fall back to a
  // provider that would actually deliver.
  if (arkeselFailure && sandbox) return arkeselFailure;

  // --- Provider 2: Hubtel (Ghana) ---
  if (process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET) {
    try {
      const response = await axios.post(
        'https://smsc.hubtel.com/v1/messages/send',
        {
          From: process.env.HUBTEL_SENDER_ID || 'Clinic',
          To: e164,
          Content: message,
        },
        {
          auth: {
            username: process.env.HUBTEL_CLIENT_ID,
            password: process.env.HUBTEL_CLIENT_SECRET,
          },
          timeout: 15000,
        }
      );
      return {
        success: true,
        provider: 'hubtel',
        messageId: response.data?.MessageId || response.data?.messageId || '',
      };
    } catch (error: any) {
      console.error('Hubtel SMS send failed:', error?.response?.data || error?.message);
      return {
        success: false,
        provider: 'hubtel',
        messageId: '',
        error: error?.response?.data?.Message || error?.message || 'SMS send failed',
      };
    }
  }

  // --- Provider 2: Twilio (easiest international signup) ---
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const params = new URLSearchParams();
      params.append('To', e164);
      params.append('Body', message);
      if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
        params.append('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
      } else {
        params.append('From', process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_SENDER_ID || '');
      }
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        params,
        { auth: { username: sid, password: process.env.TWILIO_AUTH_TOKEN }, timeout: 15000 }
      );
      return { success: true, provider: 'twilio', messageId: response.data?.sid || '' };
    } catch (error: any) {
      console.error('Twilio SMS send failed:', error?.response?.data || error?.message);
      return {
        success: false,
        provider: 'twilio',
        messageId: '',
        error: error?.response?.data?.message || error?.message || 'SMS send failed',
      };
    }
  }

  // --- Provider 3: Africa's Talking (Africa-native rates) ---
  if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
    try {
      const params = new URLSearchParams();
      params.append('username', process.env.AT_USERNAME);
      params.append('to', e164);
      params.append('message', message);
      if (process.env.AT_SENDER_ID) params.append('from', process.env.AT_SENDER_ID);
      const response = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        params,
        {
          headers: {
            apiKey: process.env.AT_API_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          timeout: 15000,
        }
      );
      // AT returns per-recipient status; "Success" means queued/sent to the carrier.
      const recipient = response.data?.SMSMessageData?.Recipients?.[0];
      const ok = recipient?.status === 'Success';
      return {
        success: ok,
        provider: 'africastalking',
        messageId: recipient?.messageId || '',
        error: ok ? undefined : (recipient?.status || 'SMS send failed'),
      };
    } catch (error: any) {
      console.error("Africa's Talking SMS send failed:", error?.response?.data || error?.message);
      return {
        success: false,
        provider: 'africastalking',
        messageId: '',
        error: error?.response?.data?.message || error?.message || 'SMS send failed',
      };
    }
  }

  if (arkeselFailure) return arkeselFailure;

  // No provider configured. Log the message (dev visibility) but report
  // failure — we did NOT send anything, and callers must not claim we did.
  console.warn('========================================');
  console.warn('[SMS NOT SENT — no provider configured]');
  console.warn(`To: ${e164}`);
  console.warn(`Message: ${message}`);
  console.warn('Set HUBTEL_*, TWILIO_* or AT_* env vars to enable real SMS.');
  console.warn('========================================');

  return {
    success: false,
    provider: 'none',
    messageId: '',
    error: 'SMS provider not configured',
  };
};

/**
 * Send bulk SMS messages
 * Currently a stub - replace with real provider's bulk API
 */
export const sendBulkSMS = async (messages: SMSMessage[]): Promise<SMSResult[]> => {
  console.log(`[SMS SERVICE - STUB MODE] Sending ${messages.length} messages...`);

  const results: SMSResult[] = [];

  for (const msg of messages) {
    const result = await sendSMS(msg.to, msg.message);
    results.push(result);
  }

  return results;
};

/**
 * Check if SMS service is configured and ready
 * Returns false until a real provider is integrated
 */
export const isSMSConfigured = (): boolean => {
  // Check for provider API keys in environment
  const hasArkesel = !!process.env.ARKESEL_API_KEY;
  const hasHubtel = !!(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
  const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const hasAfricasTalking = !!(process.env.AT_API_KEY && process.env.AT_USERNAME);

  return hasArkesel || hasHubtel || hasTwilio || hasAfricasTalking;
};

/**
 * Validate a phone number format (Ghana)
 */
export const validatePhoneNumber = (phone: string): { valid: boolean; formatted: string } => {
  // Remove spaces and dashes
  let cleaned = phone.replace(/[\s-]/g, '');

  // Handle Ghana phone numbers
  if (cleaned.startsWith('0')) {
    cleaned = '+233' + cleaned.substring(1);
  } else if (cleaned.startsWith('233')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+233' + cleaned;
  }

  // Basic validation - should be about 13 characters for Ghana (+233XXXXXXXXX)
  const isValid = /^\+233[0-9]{9}$/.test(cleaned);

  return {
    valid: isValid,
    formatted: cleaned
  };
};

// ---------------------------------------------------------------------------
// Arkesel bulk sending (marketing campaigns)
// ---------------------------------------------------------------------------

export interface ArkeselBatchResult {
  ok: boolean;
  /** provider message id per recipient (233XXXXXXXXX) */
  ids: Record<string, string>;
  invalid: string[];
  error?: string;
}

const ARKESEL_BASE = 'https://sms.arkesel.com';

const parseArkeselBatch = (data: any): ArkeselBatchResult => {
  const ids: Record<string, string> = {};
  const invalid: string[] = [];
  if (data?.status !== 'success') {
    return { ok: false, ids, invalid, error: data?.message || 'SMS request failed' };
  }
  if (Array.isArray(data?.data)) {
    for (const row of data.data) {
      if (row?.recipient && row?.id) ids[String(row.recipient)] = String(row.id);
      const bad = row?.['invalid numbers'];
      if (Array.isArray(bad)) invalid.push(...bad.map(String));
    }
  }
  return { ok: true, ids, invalid };
};

/**
 * Send one Arkesel request for a batch of recipients. When `variables` is
 * given, uses the template endpoint so each recipient gets their own values
 * (message tags look like <%first_name%>). The template endpoint has no
 * sandbox mode, so sandboxed personalised batches go through the plain
 * endpoint with the tags filled generically — the per-recipient text is
 * still recorded by the caller.
 */
export const sendArkeselBatch = async (opts: {
  recipients: string[];
  message: string;
  variables?: Record<string, Record<string, string>>;
  callbackUrl?: string;
  sandbox: boolean;
}): Promise<ArkeselBatchResult> => {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) return { ok: false, ids: {}, invalid: [], error: 'Arkesel is not configured (ARKESEL_API_KEY)' };
  const sender = process.env.ARKESEL_SENDER_ID;
  if (!sender) return { ok: false, ids: {}, invalid: [], error: 'No Sender ID configured (ARKESEL_SENDER_ID)' };

  const useTemplate = !!opts.variables && !opts.sandbox;
  const url = useTemplate ? `${ARKESEL_BASE}/api/v2/sms/template/send` : `${ARKESEL_BASE}/api/v2/sms/send`;
  const body: Record<string, unknown> = {
    sender,
    message: useTemplate ? opts.message : opts.message.replace(/<%\w+%>/g, 'there'),
    recipients: useTemplate ? opts.variables : opts.recipients,
  };
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;
  if (opts.sandbox) body.sandbox = true;

  try {
    const response = await axios.post(url, body, {
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    return parseArkeselBatch(response.data);
  } catch (error: any) {
    console.error('Arkesel batch send failed:', error?.response?.data || error?.message);
    return {
      ok: false,
      ids: {},
      invalid: [],
      error: error?.response?.data?.message || error?.message || 'SMS request failed',
    };
  }
};

/** SMS credits left on the Arkesel account, or null if it can't be read. */
export const getArkeselBalance = async (): Promise<{ sms: number | null; main: string | null }> => {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) return { sms: null, main: null };
  try {
    const response = await axios.get(`${ARKESEL_BASE}/api/v2/clients/balance-details`, {
      headers: { 'api-key': apiKey },
      timeout: 10000,
    });
    // Documented as data: [{ sms_balance }, { main_balance }] — accept an
    // object too in case the shape differs.
    const data = response.data?.data;
    const merged: Record<string, unknown> = Array.isArray(data) ? Object.assign({}, ...data) : (data || {});
    const sms = merged.sms_balance != null ? Number(String(merged.sms_balance).replace(/[^0-9.]/g, '')) : null;
    return { sms: Number.isFinite(sms as number) ? sms : null, main: merged.main_balance != null ? String(merged.main_balance) : null };
  } catch (error: any) {
    console.error('Arkesel balance check failed:', error?.response?.data || error?.message);
    return { sms: null, main: null };
  }
};

/**
 * SMS credits one message uses. GSM text: 160 chars in one part, 153 per part
 * once split. Anything outside the GSM alphabet (emoji, curly quotes, some
 * accents) switches to unicode: 70 / 67.
 */
export const smsParts = (text: string): { parts: number; unicode: boolean; length: number } => {
  const gsm = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/;
  const unicode = !gsm.test(text);
  const length = [...text].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { parts: length <= single ? 1 : Math.ceil(length / multi), unicode, length };
};
