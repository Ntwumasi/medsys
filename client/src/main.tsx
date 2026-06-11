import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import App from './App.tsx'
import { NotificationProvider } from './context/NotificationContext'
import { DialogProvider } from './context/DialogContext'
import { VoIPProvider } from './context/VoIPContext'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.1,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,    // HIPAA: never capture PHI in session replays
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.5,
})

// Stale-chunk recovery. After a new deploy, a tab opened against the OLD
// index.html still references old lazy-chunk hashes (e.g. PharmacyDashboard-<hash>.js)
// that no longer exist, so the dynamic import 404s. Vite fires `vite:preloadError`
// for exactly this; force a one-time reload to pull the fresh index + chunks.
// The sessionStorage guard prevents a reload loop if the failure is genuine.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('chunk-reload') === '1') return;
  sessionStorage.setItem('chunk-reload', '1');
  window.location.reload();
});
// Clear the guards once a normal load completes so future deploys can recover too.
window.addEventListener('load', () => {
  setTimeout(() => {
    sessionStorage.removeItem('chunk-reload');
    sessionStorage.removeItem('chunk-reload-eb');
  }, 5000);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotificationProvider>
      <DialogProvider>
        <VoIPProvider>
          <App />
        </VoIPProvider>
        <Analytics />
        <SpeedInsights />
      </DialogProvider>
    </NotificationProvider>
  </StrictMode>,
)
