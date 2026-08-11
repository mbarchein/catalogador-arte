/**
 * Emitting a dossier's PDF, and reading the ones already emitted (RF-1607,
 * RF-1608).
 *
 * ── EL ORDEN DE LAS TRES OPERACIONES, QUE NO ES CASUAL ──────
 *
 * Se genera, se sube, y **solo entonces** se escribe la fila. Así no hay forma de
 * que exista una versión que prometa un fichero que no está: lo que puede pasar es
 * lo contrario —un fichero huérfano de unos megabytes si la inserción falla después
 * de la subida—, y ése es un fallo mucho más barato. Está razonado en la migración
 * y se implementa aquí.
 *
 * La versión la pone la base y no este cliente, así que la ruta **no la lleva
 * dentro**: dos personas emitiendo a la vez calcularían la misma. Lleva un sufijo
 * aleatorio, que es el idioma que ya usan las fotografías.
 *
 * ── `pdf-lib` SE CARGA CUANDO SE PULSA ──────────────────────
 *
 * Importación dinámica, como la ficha imprimible: quien abre la aplicación en un
 * almacén no paga el peso del generador hasta que lo usa.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadSignedFile } from '../../lib/download'
import { BUCKET, randomSuffix, signedUrl } from '../../lib/images'
import { supabase } from '../../lib/supabase'
import type { ArtistFund, DossierIssue } from '../../lib/types'
import { DOSSIER_ISSUE_COLUMNS } from './dossierIssues'
import { dossierFailureText, dossierWriteResult } from './dossierMessages'
import type { DossierItemRow } from './dossierItems'
import {
  dossierPages,
  issueBlockedReason,
  issueFileName,
  issuePath,
  type FundTexts,
} from './dossierPdfPlan'
import type { DossierRow } from './dossierIndex'

export interface IssueInput {
  dossier: DossierRow
  items: readonly DossierItemRow[]
  funds: readonly FundTexts[]
}

export interface DossierIssuesQuery {
  issues: DossierIssue[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Generates, uploads and records one version. Resolves to null when it worked. */
  issue: (input: IssueInput) => Promise<string | null>
  /** Downloads an already-issued PDF, signing its path. Resolves to null when it worked. */
  download: (issue: DossierIssue, title: string) => Promise<string | null>
}

/** The biography and CV of every fund, for the PDF to read them live (RF-1617). */
export async function loadFundTexts(): Promise<FundTexts[]> {
  const { data } = await supabase.from('artist_funds').select('code, name, biography, cv')
  return ((data ?? []) as { code: ArtistFund; name: string; biography: string; cv: string }[]).map(
    (row) => ({ code: row.code, name: row.name, biography: row.biography, cv: row.cv }),
  )
}

export function useDossierIssues(dossierId: string | undefined): DossierIssuesQuery {
  const [issues, setIssues] = useState<DossierIssue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (dossierId === undefined) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: failure } = await supabase
      .from('dossier_issues')
      .select(DOSSIER_ISSUE_COLUMNS)
      .eq('dossier_id', dossierId)
    if (!alive.current) return
    setLoading(false)
    if (failure) {
      setError(dossierFailureText(failure, 'loadItems'))
      return
    }
    setError(null)
    setIssues((data ?? []) as unknown as DossierIssue[])
  }, [dossierId])

  useEffect(() => {
    void reload()
  }, [reload])

  const issue = useCallback(
    async (input: IssueInput): Promise<string | null> => {
      if (dossierId === undefined) return null

      // The date travels into the plan already written for a person: the module that
      // decides the pages is pure, and `new Date()` inside it would be a decision
      // nothing can pin down.
      const date = new Date().toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Madrid',
      })
      const pages = dossierPages({
        dossier: input.dossier,
        recipientName: input.dossier.recipient?.name ?? '',
        date,
        items: input.items,
        funds: input.funds,
      })

      // Said before anything is generated: an empty dossier would produce a cover
      // with nothing behind it, which is a document somebody sends by accident.
      const blocked = issueBlockedReason(pages)
      if (blocked !== null) return blocked

      let blob: Blob
      try {
        const { generateDossierPdf } = await import('./dossierPdf')
        blob = await generateDossierPdf(pages, { title: input.dossier.title })
      } catch (cause) {
        // Everything from here is on the device: no canvas, no memory, a browser that
        // cannot. It says so instead of leaving a spinner turning.
        const said = cause instanceof Error ? cause.message : ''
        return `No se ha podido generar el PDF en este dispositivo${said === '' ? '' : `: ${said}`}. Prueba en un ordenador.`
      }

      const path = issuePath(dossierId, randomSuffix())
      const upload = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'application/pdf',
        // Never replace: the paths of this bucket are immutable and the service
        // worker caches by path. The random suffix makes a clash impossible anyway.
        upsert: false,
      })
      if (upload.error) {
        return `El PDF se ha generado pero no se ha podido guardar: ${upload.error.message}`
      }

      const { data, error: failure } = await supabase
        .from('dossier_issues')
        .insert({ dossier_id: dossierId, file_path: path, file_bytes: blob.size })
        .select('version')
      const message = dossierWriteResult('save', { failure, rows: (data ?? []).length })
      await reload()
      if (message !== null) {
        // The file is up there and the row is not: said out loud, because the
        // alternative is a version that nobody can find and nobody knows exists.
        return `${message} El fichero se ha subido, pero la emisión no consta: vuelve a emitir.`
      }
      return null
    },
    [dossierId, reload],
  )

  const download = useCallback(
    async (row: DossierIssue, title: string): Promise<string | null> => {
      const url = await signedUrl(row.file_path, 300)
      if (url === null) {
        return 'No se ha podido preparar la descarga. Comprueba la conexión y vuelve a intentarlo.'
      }
      try {
        await downloadSignedFile(url, issueFileName(title, row.version), 'el PDF del dossier')
        return null
      } catch (cause) {
        return cause instanceof Error ? cause.message : 'No se ha podido descargar el PDF.'
      }
    },
    [],
  )

  return { issues, loading, error, reload, issue, download }
}
