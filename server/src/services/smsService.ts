/**
 * SMS Service - Stub Implementation
 *
 * This is a placeholder service that logs SMS messages to the console.
 * When you're ready to integrate with a real SMS provider, replace the
 * implementation in sendSMS() with your provider's API.
 *
 * Recommended providers for Ghana/Africa:
 * - Hubtel (https://hubtel.com)
 * - Africa's Talking (https://africastalking.com)
 * - Twilio (https://twilio.com)
 */

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
  // Log the SMS that would be sent
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

// =============================================================
// INTEGRATION EXAMPLES (uncomment and modify when ready)
// =============================================================

/*
// HUBTEL INTEGRATION EXAMPLE:
import axios from 'axios';

export const sendSMS_Hubtel = async (to: string, message: string): Promise<SMSResult> => {
  try {
    const response = await axios.post(
      'https://smsc.hubtel.com/v1/messages/send',
      {
        From: process.env.HUBTEL_SENDER_ID,
        To: to,
        Content: message
      },
      {
        auth: {
          username: process.env.HUBTEL_CLIENT_ID!,
          password: process.env.HUBTEL_CLIENT_SECRET!
        }
      }
    );

    return {
      success: true,
      provider: 'hubtel',
      messageId: response.data.MessageId
    };
  } catch (error: any) {
    return {
      success: false,
      provider: 'hubtel',
      messageId: '',
      error: error.message
    };
  }
};
*/

/*
// TWILIO INTEGRATION EXAMPLE:
import twilio from 'twilio';

export const sendSMS_Twilio = async (to: string, message: string): Promise<SMSResult> => {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    const response = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    return {
      success: true,
      provider: 'twilio',
      messageId: response.sid
    };
  } catch (error: any) {
    return {
      success: false,
      provider: 'twilio',
      messageId: '',
      error: error.message
    };
  }
};
*/
