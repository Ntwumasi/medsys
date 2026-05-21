import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { NotificationProvider } from './context/NotificationContext'
import { DialogProvider } from './context/DialogContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotificationProvider>
      <DialogProvider>
        <App />
      </DialogProvider>
    </NotificationProvider>
  </StrictMode>,
)
