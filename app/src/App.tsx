import { Navigate, Route, Routes, useParams } from 'react-router'
import { useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { CapturePage } from './features/artworks/CapturePage'
import { ArtworkPage } from './features/artworks/ArtworkPage'
import { ArtworkPhotosPage } from './features/artworks/ArtworkPhotosPage'
import { ArtworksPage } from './features/artworks/ArtworksPage'
import { PlacesPage } from './features/places/PlacesPage'
import { ArtworkTypesPage } from './features/tables/ArtworkTypesPage'
import { SeriesPage } from './features/tables/SeriesPage'
import { TablesPage } from './features/tables/TablesPage'
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

  return (
    <Routes>
      <Route path="/" element={<ArtworksPage />} />
      <Route path="/capture" element={<CapturePage />} />
      <Route path="/artwork/:id" element={<ArtworkPage />} />
      {/* Editing is a route, not local state: it survives a reload, can be
          bookmarked and the phone's back button leaves the form instead of
          leaving the record. */}
      <Route path="/artwork/:id/edit" element={<ArtworkPage />} />
      {/* La fotografía abierta va en la ruta por el mismo motivo que la edición
          de la ficha: sobrevive a una recarga, se comparte como enlace y el botón
          «atrás» del móvil cierra su panel en vez de salir de la pantalla. */}
      <Route path="/artwork/:id/photos" element={<ArtworkPhotosPage />} />
      <Route path="/artwork/:id/photos/:imageId" element={<ArtworkPhotosPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      {/* RF-1106: la sección «Tablas» y el mantenimiento de cada tabla maestra.
          Solo Catalogador, comprobado dentro de cada una: la pestaña oculta del
          pie no es una protección. */}
      <Route path="/tables" element={<TablesPage />} />
      <Route path="/places" element={<PlacesPage />} />
      <Route path="/artwork-types" element={<ArtworkTypesPage />} />
      <Route path="/series" element={<SeriesPage />} />
      {/* The recovery email link opens a temporary session and lands here; it
          also serves as the password change from Mi perfil. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* LEGACY REDIRECTS. /obra/:id is encoded in QR codes already printed
          on physical A5 records: that URL must keep working forever. The
          other two only cover old bookmarks. */}
      <Route path="/obra/:id" element={<LegacyArtworkRedirect />} />
      <Route path="/captura" element={<Navigate to="/capture" replace />} />
      <Route path="/perfil" element={<Navigate to="/profile" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Legacy: printed QR codes point at /obra/:id (see recordUrl in recordPdf). */
function LegacyArtworkRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/artwork/${id}`} replace />
}
