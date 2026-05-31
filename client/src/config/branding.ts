/**
 * Clinic branding configuration.
 *
 * Per-deployment branding is controlled via VITE_ environment variables
 * set in Vercel. If not set, falls back to generic MedSys defaults.
 *
 * For a new client, set these in their Vercel branch env vars:
 *   VITE_CLINIC_NAME=Sunrise Medical Center
 *   VITE_CLINIC_LOGO=/sunrise-logo.png
 *   VITE_CLINIC_ADDRESS=123 Main Street, Kumasi
 *   VITE_CLINIC_PHONE=+233 30 123 4567
 *   VITE_CLINIC_EMAIL=info@sunrise.com
 */

export const branding = {
  clinicName: import.meta.env.VITE_CLINIC_NAME || 'MedSys EMR',
  clinicLogo: import.meta.env.VITE_CLINIC_LOGO || '',
  clinicAddress: import.meta.env.VITE_CLINIC_ADDRESS || '',
  clinicPhone: import.meta.env.VITE_CLINIC_PHONE || '',
  clinicEmail: import.meta.env.VITE_CLINIC_EMAIL || '',
  clinicTagline: import.meta.env.VITE_CLINIC_TAGLINE || 'Electronic Medical Record System',
};
