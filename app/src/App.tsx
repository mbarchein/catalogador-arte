import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { CapturePage } from './features/artworks/CapturePage'
import { ArtworkPage } from './features/artworks/ArtworkPage'
import { ArtworksPage } from './features/artworks/ArtworksPage'
import { ProfilePage } from './features/profile/ProfilePage'

export function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="p-8 text-center text-sm text-stone-600">Cargando…</div>
  }

  // RF-101: no view is reachable without a session. There is no public area,
  // so the check is a single one and covers every route.
  if (!session) {
    return <LoginPage />
  }

  // Route paths stay in Spanish: they are user-facing URLs, and /obra/:id is
  // encoded in QR codes already printed on physical labels.
  return (
    <Routes>
      <Route path="/" element={<ArtworksPage />} />
      <Route path="/captura" element={<CapturePage />} />
      <Route path="/obra/:id" element={<ArtworkPage />} />
      <Route path="/perfil" element={<ProfilePage />} />
      {/* The recovery email link opens a temporary session and lands here; it
          also serves as the password change from Mi perfil. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
