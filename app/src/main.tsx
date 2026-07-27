/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ProveedorAuth } from './auth/AuthContext'
import { programarComprobaciones } from './lib/actualizaciones'
import './index.css'

// En modo autoUpdate este registro recarga la página cuando la versión nueva
// toma el control; programarComprobaciones decide cuándo preguntar si existe.
// El catch: sin red no hay versión que buscar, y no es un error.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (registro) programarComprobaciones(() => void registro.update().catch(() => {}))
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorAuth>
        <App />
      </ProveedorAuth>
    </BrowserRouter>
  </StrictMode>,
)
