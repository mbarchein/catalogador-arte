import { describe, expect, it } from 'vitest'
import type { DossierIssue } from '../../lib/types'
import {
  DOSSIER_ISSUE_COLUMNS,
  issueButtonLabel,
  issueEntries,
  issueSizeText,
  issuedAtText,
  issuedNotice,
  issuesNotice,
  sortIssues,
} from './dossierIssues'

/** RF-1607, RF-1608: las versiones emitidas, que solo se añaden. */

function issue(over: Partial<DossierIssue> = {}): DossierIssue {
  return {
    id: 'e1',
    dossier_id: 'd1',
    version: 1,
    issued_at: '2026-08-11T16:04:00+00:00',
    issued_by: 'u1',
    file_path: 'dossiers/d1_abc.pdf',
    file_bytes: 1_310_720,
    note: '',
    ...over,
  }
}

describe('las columnas que se piden', () => {
  it('están las ocho del tipo', () => {
    for (const column of [
      'version',
      'issued_at',
      'issued_by',
      'file_path',
      'file_bytes',
      'note',
    ]) {
      expect(DOSSIER_ISSUE_COLUMNS).toContain(column)
    }
  })

  it('no se pide ningún «active»: aquí no se retira nada', () => {
    expect(DOSSIER_ISSUE_COLUMNS).not.toContain('active')
  })
})

describe('el orden y lo que dice cada fila', () => {
  it('la más reciente primero, porque es la que se pide', () => {
    const rows = [issue({ id: 'a', version: 1 }), issue({ id: 'c', version: 3 }), issue({ id: 'b', version: 2 })]
    expect(sortIssues(rows).map((row) => row.version)).toEqual([3, 2, 1])
  })

  it('la fila lleva la versión que puso la base y su fecha con hora', () => {
    // La hora está porque dos versiones de la misma tarde son el caso normal, y dos
    // filas diciendo «11 de agosto de 2026» serían indistinguibles.
    const [entry] = issueEntries([issue({ version: 2 })])
    expect(entry?.label).toBe('Versión 2')
    expect(entry?.when).toContain('11 de agosto de 2026')
    expect(entry?.when).toMatch(/\d{2}:\d{2}/)
  })

  it('una fecha imposible se dice, no se pinta «Invalid Date»', () => {
    expect(issuedAtText('no es una fecha')).toBe('Fecha desconocida')
  })
})

describe('el tamaño del fichero', () => {
  it('en las unidades que se leen', () => {
    expect(issueSizeText(512)).toBe('512 B')
    expect(issueSizeText(284 * 1024)).toBe('284 KB')
    expect(issueSizeText(1_310_720)).toBe('1,3 MB')
  })

  it('sin medir es null, que es un dato y no un cero', () => {
    expect(issueSizeText(null)).toBeNull()
    expect(issueSizeText(0)).toBeNull()
  })
})

describe('el botón dice qué versión va a emitir (RF-1607)', () => {
  it('la primera vez no numera nada', () => {
    expect(issueButtonLabel([])).toBe('Emitir el PDF')
  })

  it('después dice el número que va a llevar, que es todo el diseño en tres palabras', () => {
    // No se corrige nada: se hace otro documento, y el de marzo se queda como se
    // mandó.
    expect(issueButtonLabel([issue({ version: 2 }), issue({ version: 1 })])).toBe(
      'Emitir la versión 3',
    )
  })

  it('lo que se dice después tranquiliza sobre las anteriores', () => {
    expect(issuedNotice(1)).toContain('con su fecha')
    expect(issuedNotice(3)).toContain('siguen como estaban')
  })
})

describe('nunca una lista en blanco (RF-304)', () => {
  it('sin emisiones se dice, y es el estado normal', () => {
    expect(issuesNotice({ loading: false, error: null, count: 0 })).toContain(
      'Todavía no se ha emitido',
    )
  })

  it('mientras carga lo dice, y tras un fallo se calla', () => {
    expect(issuesNotice({ loading: true, error: null, count: 0 })).toContain('Cargando')
    expect(issuesNotice({ loading: false, error: 'x', count: 0 })).toBeNull()
  })

  it('con filas no dice nada', () => {
    expect(issuesNotice({ loading: false, error: null, count: 2 })).toBeNull()
  })
})
