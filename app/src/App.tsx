import { Navigate, Route, Routes, useParams } from 'react-router'
import { useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { ResetPasswordPage } from './auth/ResetPasswordPage'
import { CapturePage } from './features/artworks/CapturePage'
import { ArtworkPage } from './features/artworks/ArtworkPage'
import { ArtworkPhotosPage } from './features/artworks/ArtworkPhotosPage'
import { ArtworksPage } from './features/artworks/ArtworksPage'
import { BibliographyPage } from './features/bibliography'
import { ExhibitionsPage, NewExhibitionPage, ExhibitionPage } from './features/exhibitions'
import { GrayTargetPage } from './features/help/GrayTargetPage'
import { PlacesPage } from './features/places/PlacesPage'
import { ArchiveSeriesPage } from './features/tables/ArchiveSeriesPage'
import { ArtworkTypesPage } from './features/tables/ArtworkTypesPage'
import { DocumentTypesPage } from './features/tables/DocumentTypesPage'
import { ExhibitionVenuesPage } from './features/tables/ExhibitionVenuesPage'
import { PartiesPage } from './features/tables/PartiesPage'
import { PublicationTypesPage } from './features/tables/PublicationTypesPage'
import { RelationshipTypesPage } from './features/tables/RelationshipTypesPage'
import { SeriesPage } from './features/tables/SeriesPage'
import { TablesPage } from './features/tables/TablesPage'
import { TrashPage } from './features/trash/TrashPage'
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
      {/* RF-309, RF-501, RF-502: la exposición es CONTENIDO del catálogo y no una
          tabla maestra, así que sus rutas cuelgan de la raíz como las de una obra
          y no de la sección «Tablas», y su listado se llega desde la navegación
          principal. Lo lee cualquiera que pueda leer; dar de alta y corregir son
          del Catalogador, comprobado DENTRO de cada pantalla, porque un botón que
          no se pinta no es una protección.

          «/exhibitions/new» se declara antes de «/exhibitions/:id»: este enrutador
          puntúa el segmento fijo por encima del dinámico y acertaría igual, pero
          el orden del fichero es lo que se lee al mantenerlo, y en él «new» no
          puede parecer el identificador de una ficha.

          La edición es una ruta y no un estado local, por los tres motivos que ya
          da la ficha de obra: sobrevive a una recarga, se envía como enlace y el
          botón «atrás» del móvil sale del formulario y no de la ficha. */}
      <Route path="/exhibitions" element={<ExhibitionsPage />} />
      <Route path="/exhibitions/new" element={<NewExhibitionPage />} />
      <Route path="/exhibitions/:id" element={<ExhibitionPage />} />
      <Route path="/exhibitions/:id/edit" element={<ExhibitionPage />} />
      {/* RF-506, RF-606: el listado de la bibliografía con su búsqueda. Lo lee
          cualquiera que pueda leer, como el de exposiciones: una referencia es
          contenido del catálogo y no una tabla maestra. NO hay ruta de alta, y su
          ausencia es la decisión: una referencia existe porque algo la cita, así que
          se crea desde la bibliografía de una obra. Todavía no hay ficha propia
          —«/bibliography/:id»— y por eso las filas del listado no son enlaces. */}
      <Route path="/bibliography" element={<BibliographyPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      {/* RF-418: qué es el testigo de gris, dónde se coloca y de dónde se baja la
          hoja imprimible. Es una ruta y no un panel del editor porque se lee antes
          de fotografiar, con la obra delante y sin ninguna foto abierta, y porque
          así se puede enviar el enlace a quien va a hacer las tomas. */}
      <Route path="/gray-target" element={<GrayTargetPage />} />
      {/* RF-1106: la sección «Tablas» y el mantenimiento de cada tabla maestra.
          Solo Catalogador, comprobado dentro de cada una: la pestaña oculta del
          pie no es una protección. */}
      <Route path="/tables" element={<TablesPage />} />
      <Route path="/places" element={<PlacesPage />} />
      <Route path="/artwork-types" element={<ArtworkTypesPage />} />
      <Route path="/series" element={<SeriesPage />} />
      <Route path="/relationship-types" element={<RelationshipTypesPage />} />
      <Route path="/exhibition-venues" element={<ExhibitionVenuesPage />} />
      <Route path="/parties" element={<PartiesPage />} />
      <Route path="/archive-series" element={<ArchiveSeriesPage />} />
      <Route path="/document-types" element={<DocumentTypesPage />} />
      <Route path="/publication-types" element={<PublicationTypesPage />} />
      {/* RF-901, RF-902: la papelera. Tampoco es una tabla maestra —dentro hay
          obras, fotografías y fichas, no solo listas—, así que su ruta cuelga de la
          raíz; su puerta está en «Tablas», que es el único índice del Catalogador.

          Solo Catalogador, y comprobado dentro de la propia pantalla. No es
          prudencia: medido contra la base, dieciocho de las veintiuna tablas con
          baja lógica tienen el `select` en `(active and can_read()) or can_edit()`
          —quien solo consulta no ve ni una fila retirada— pero tres maestras
          (`artwork_types`, `series`, `physical_places`) lo tienen en `can_read()` a
          secas y un lector SÍ vería las suyas. Y recuperar es un `update`, que
          exige `can_edit()` en todas: para un lector la pantalla sería una lista
          incompleta con un botón que la base rechaza. */}
      <Route path="/trash" element={<TrashPage />} />
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
