import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { RestablecerPage } from './auth/RestablecerPage'
import { CapturaPage } from './features/obras/CapturaPage'
import { ObraPage } from './features/obras/ObraPage'
import { ObrasPage } from './features/obras/ObrasPage'
import { PerfilPage } from './features/perfil/PerfilPage'

export function App() {
  const { sesion, cargando } = useAuth()

  if (cargando) {
    return <div className="p-8 text-center text-sm text-stone-600">Cargando…</div>
  }

  // RF-101: ninguna vista es accesible sin sesión. No hay zona pública, así que
  // la comprobación es una sola y cubre todas las rutas.
  if (!sesion) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route path="/" element={<ObrasPage />} />
      <Route path="/captura" element={<CapturaPage />} />
      <Route path="/obra/:id" element={<ObraPage />} />
      <Route path="/perfil" element={<PerfilPage />} />
      {/* El enlace del correo de recuperación abre sesión temporal y aterriza
          aquí; también sirve como cambio de contraseña desde Mi perfil. */}
      <Route path="/reset-password" element={<RestablecerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
