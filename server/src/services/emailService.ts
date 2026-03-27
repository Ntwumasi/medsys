/**
 * Email Service - Stub Implementation
 *
 * This is a placeholder service that logs emails to the console.
 * When you're ready to integrate with a real email provider, replace the
 * implementation in sendEmail() with your provider's API.
 *
 * Recommended providers:
 * - SendGrid (https://sendgrid.com)
 * - Mailgun (https://mailgun.com)
 * - AWS SES (https://aws.amazon.com/ses/)
 * - Nodemailer with SMTP
 */

export interface EmailResult {
  success: boolean;
  provider: string;
  messageId: string;
  error?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
  patientId?: number;
  invoiceId?: number;
}

/**
 * Send an email
 * Currently a stub that logs to console - replace with real provider
 */
export const sendEmail = async (
  to: string,
  subject: string,
  body: string,
  html?: string
): Promise<EmailResult> => {
  // Log the email that would be sent
  console.log('========================================');
  console.log('[EMAIL SERVICE - STUB MODE]');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log('--- Body ---');
  console.log(body);
  if (html) {
    console.log('--- HTML Version ---');
    console.log(html);
  }
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('========================================');

  // Simulate a small delay like a real API would have
  await new Promise(resolve => setTimeout(resolve, 100));

  // Return success - in production this would be the provider's response
  return {
    success: true,
    provider: 'stub',
    messageId: `email-stub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };
};

/**
 * Send bulk emails
 * Currently a stub - replace with real provider's bulk API
 */
export const sendBulkEmail = async (messages: EmailMessage[]): Promise<EmailResult[]> => {
  console.log(`[EMAIL SERVICE - STUB MODE] Sending ${messages.length} emails...`);

  const results: EmailResult[] = [];

  for (const msg of messages) {
    const result = await sendEmail(msg.to, msg.subject, msg.body, msg.html);
    results.push(result);
  }

  return results;
};

/**
 * Check if email service is configured and ready
 * Returns false until a real provider is integrated
 */
export const isEmailConfigured = (): boolean => {
  // Check for provider API keys in environment
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const hasMailgun = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
  const hasSES = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const hasSMTP = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

  return hasSendGrid || hasMailgun || hasSES || hasSMTP;
};

/**
 * Validate an email address format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Generate HTML version of plain text email
 */
export const textToHtml = (text: string): string => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #2563eb;
      color: white;
      padding: 20px;
      text-align: center;
      border-radius: 8px 8px 0 0;
    }
    .content {
      background: #f9fafb;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>MedSys Clinic</h1>
  </div>
  <div class="content">
    ${text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br>').join('\n')}
  </div>
  <div class="footer">
    <p>This is an automated message from MedSys Clinic.</p>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Send payment receipt email
 */
export const sendReceiptEmail = async (
  patientEmail: string,
  patientName: string,
  paymentAmount: number,
  paymentMethod: string,
  invoiceNumber: string,
  invoiceTotal: number,
  balanceRemaining: number,
  paymentId: number
): Promise<EmailResult> => {
  const subject = `Payment Receipt - ${invoiceNumber}`;

  const body = `
Dear ${patientName},

Thank you for your payment at MedSys Healthcare.

PAYMENT DETAILS
---------------
Receipt #: RCP-${paymentId}
Invoice: ${invoiceNumber}
Amount Paid: GHS ${paymentAmount.toFixed(2)}
Payment Method: ${paymentMethod}
Date: ${new Date().toLocaleDateString()}

Invoice Total: GHS ${invoiceTotal.toFixed(2)}
Balance Remaining: GHS ${balanceRemaining.toFixed(2)}

Thank you for choosing MedSys Healthcare.

For questions about your bill, please contact our billing department.

Best regards,
MedSys Healthcare
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
    .receipt-box { background: white; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 15px 0; }
    .amount { font-size: 24px; color: #059669; font-weight: bold; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; }
    .label { color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Payment Receipt</h1>
    <p>MedSys Healthcare</p>
  </div>
  <div class="content">
    <p>Dear ${patientName},</p>
    <p>Thank you for your payment. Here are your receipt details:</p>

    <div class="receipt-box">
      <table>
        <tr><td class="label">Receipt #:</td><td>RCP-${paymentId}</td></tr>
        <tr><td class="label">Invoice:</td><td>${invoiceNumber}</td></tr>
        <tr><td class="label">Date:</td><td>${new Date().toLocaleDateString()}</td></tr>
        <tr><td class="label">Payment Method:</td><td>${paymentMethod}</td></tr>
      </table>
      <hr>
      <table>
        <tr><td class="label">Amount Paid:</td><td class="amount">GHS ${paymentAmount.toFixed(2)}</td></tr>
        <tr><td class="label">Invoice Total:</td><td>GHS ${invoiceTotal.toFixed(2)}</td></tr>
        <tr><td class="label">Balance Remaining:</td><td style="color: ${balanceRemaining > 0 ? '#dc2626' : '#059669'}">GHS ${balanceRemaining.toFixed(2)}</td></tr>
      </table>
    </div>

    <p>For questions about your bill, please contact our billing department.</p>
  </div>
  <div class="footer">
    <p>This is an automated message from MedSys Healthcare.</p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail(patientEmail, subject, body, html);
};

// =============================================================
// INTEGRATION EXAMPLES (uncomment and modify when ready)
// =============================================================

/*
// SENDGRID INTEGRATION EXAMPLE:
import sgMail from '@sendgrid/mail';

export const sendEmail_SendGrid = async (
  to: string,
  subject: string,
  body: string,
  html?: string
): Promise<EmailResult> => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

  try {
    const response = await sgMail.send({
      to,
      from: process.env.EMAIL_FROM || 'noreply@medsys.clinic',
      subject,
      text: body,
      html: html || textToHtml(body)
    });

    return {
      success: true,
      provider: 'sendgrid',
      messageId: response[0].headers['x-message-id']
    };
  } catch (error: any) {
    return {
      success: false,
      provider: 'sendgrid',
      messageId: '',
      error: error.message
    };
  }
};
*/

/*
// NODEMAILER SMTP INTEGRATION EXAMPLE:
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export const sendEmail_SMTP = async (
  to: string,
  subject: string,
  body: string,
  html?: string
): Promise<EmailResult> => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@medsys.clinic',
      to,
      subject,
      text: body,
      html: html || textToHtml(body)
    });

    return {
      success: true,
      provider: 'smtp',
      messageId: info.messageId
    };
  } catch (error: any) {
    return {
      success: false,
      provider: 'smtp',
      messageId: '',
      error: error.message
    };
  }
};
*/
