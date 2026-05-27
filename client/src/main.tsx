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
