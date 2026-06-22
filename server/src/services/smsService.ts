/**
 * SMS Service - Stub Implementation
 *
 * This is a placeholder service that logs SMS messages to the console.
 * When you're ready to integrate with a real SMS provider, replace the
 * implementation in sendSMS() with your provider's API.
 *
 * Three real providers are wired up below (all via axios REST — no SDKs).
 * The first one whose credentials are present in the environment is used,
 * in this order; otherwise it falls back to the console stub (local/dev):
 *
 *   1. Hubtel          HUBTEL_CLIENT_ID + HUBTEL_CLIENT_SECRET   (Ghana; needs a GH business)
 *   2. Twilio          TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN    (easiest int'l signup)
 *                      + TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID
 *   3. Africa's Talking AT_API_KEY + AT_USERNAME + AT_SENDER_ID  (Africa-native rates)
 *
 * Ghana A2P SMS requires a registered Sender ID with the provider regardless of
 * which one you pick. Numbers are normalized to E.164 (+233…) before sending.
 */

import axios from 'axios';

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

  // --- Provider 1: Hubtel (Ghana) ---
  if (process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET) {
    try {
      const response = await axios.post(
        'https://smsc.hubtel.com/v1/messages/send',
        {
          From: process.env.HUBTEL_SENDER_ID || 'Clinic',
          To: to,
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

  // Fallback: log the SMS that would be sent (local/dev / no provider configured)
  console.log('========================================');
  console.log('[SMS SERVICE - STUB MODE]');
  console.log(`To: ${to}`);
  console.log(`Message: ${message}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('========================================');

  // Simulate a small delay like a real API would have
  await new Promise(resolve => setTimeout(resolve, 100));

  // Return success - in production this would be the provider's response
  return {
    success: true,
    provider: 'stub',
    messageId: `sms-stub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
  const hasHubtel = !!(process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET);
  const hasTwilio = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const hasAfricasTalking = !!(process.env.AT_API_KEY && process.env.AT_USERNAME);

  return hasHubtel || hasTwilio || hasAfricasTalking;
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
