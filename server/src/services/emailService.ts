/**
 * Email Service — SMTP delivery via nodemailer.
 *
 * This used to be a stub that console.logged the message and returned
 * `success: true` unconditionally, while the "real" SendGrid/SMTP functions sat
 * commented out below and were never called. Every caller (receipts, appointment
 * reminders, follow-up reminders, and now the patient-portal login link) was
 * therefore told its mail had been sent when nothing left the building.
 *
 * Now: when SMTP is configured the mail is actually sent, and when it is NOT
 * configured we return success:false so callers can tell the user the truth
 * instead of silently dropping it. Set SMTP_HOST, SMTP_USER and SMTP_PASS
 * (plus optional SMTP_PORT, SMTP_SECURE, EMAIL_FROM) to turn delivery on.
 */

import nodemailer, { type Transporter } from 'nodemailer';

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

// Built once and reused. Serverless keeps the module alive between warm
// invocations, so we don't want a fresh connection pool per email.
let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      // Port 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

/**
 * Send an email over SMTP.
 *
 * Returns success:false (rather than throwing) when SMTP isn't configured or the
 * send fails, so callers can surface an honest "couldn't send" to the user. Do
 * NOT treat a call to this function as proof of delivery — check `.success`.
 */
export const sendEmail = async (
  to: string,
  subject: string,
  body: string,
  html?: string
): Promise<EmailResult> => {
  const tx = getTransporter();

  if (!tx) {
    // No credentials. Log it so the message isn't lost in a dev environment,
    // but report failure — the old stub claimed success here, which is how
    // three separate features ended up quietly sending nothing.
    console.warn(`[email] SMTP not configured — not sent. to=${to} subject="${subject}"`);
    return {
      success: false,
      provider: 'unconfigured',
      messageId: '',
      error: 'Email is not configured on this server (SMTP_HOST/SMTP_USER/SMTP_PASS missing).',
    };
  }

  try {
    const info = await tx.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@medsys.clinic',
      to,
      subject,
      text: body,
      html: html || textToHtml(body),
    });
    return { success: true, provider: 'smtp', messageId: info.messageId };
  } catch (error: any) {
    console.error(`[email] send failed to=${to}:`, error?.message || error);
    return {
      success: false,
      provider: 'smtp',
      messageId: '',
      error: error?.message || 'SMTP send failed',
    };
  }
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
  // SMTP is the only transport actually implemented. This used to also return
  // true for SENDGRID_API_KEY / MAILGUN / SES env vars, none of which were ever
  // wired to a send path — so it could report "configured" while every send
  // silently went nowhere.
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
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

