/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'
import { scheduleChecks } from './lib/updates'
import './index.css'

// In autoUpdate mode this registration reloads the page when the new version
// takes control; scheduleChecks decides when to ask whether one exists.
// The catch: without network there is no version to look for, and that is not
// an error.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) scheduleChecks(() => void registration.update().catch(() => {}))
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
