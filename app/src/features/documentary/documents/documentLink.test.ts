import { describe, expect, it } from 'vitest'
import type { DocumentLinkRow } from '../documentaryRows'
import {
  allLinkedText,
  DOCUMENT_OPTION_COLUMNS,
  documentLinkArgs,
  documentOptionFileText,
  documentOptionText,
  linkBlockedReason,
  linkedDocumentIds,
  noDocumentOptionsText,
  rankDocumentOptions,
  retireLinkConfirmText,
  TWO_ACTS_TEXT,
  type DocumentOption,
} from './documentLink'

/**
 * Enlazar con una obra un documento que YA está en el archivo (RF-516, RF-517,
 * RF-218, RF-304).
 *
 * Lo que se verifica aquí es la regla que sostiene toda la pantalla: un documento
 * cuelga de varias obras por una tabla puente y el PDF se guarda UNA vez, así que
 * enlazar y subir son dos actos distintos y el buscador tiene que empujar hacia el
 * primero. Un buscador que esconde lo que ya está enlazado es un buscador que invita
 * a subir el mismo escaneo por segunda vez.
 */

function option(over: Partial<DocumentOption> = {}): DocumentOption {
  return {
    id: 'doc-1',
    archive_code: 'AR-ARCH-0001',
    title: 'Carta de la galería',
    start_year: 1985,
    end_year: null,
    approximate_date: false,
    unconfirmed_date: false,
    date_note: '',
    date_text: '1985',
    file_path: 'archivo/ar-arch-0001_k3m9p2qz.pdf',
    file_size_bytes: 3_355_443,
    mime_type: 'application/pdf',
    active: true,
    document_type: { id: 'type-1', name: 'Carta', active: true },
    ...over,
  }
}

function link(over: Partial<DocumentLinkRow> = {}): DocumentLinkRow {
  return {
    id: 'link-1',
    catalog_id: 'AR-0001',
    document_id: 'doc-1',
    note: '',
    active: true,
    document: null,
    ...over,
  }
}

describe('las columnas que pide el buscador', () => {
  /**
   * Un tipo de TypeScript no existe en tiempo de ejecución: lo que la consulta olvide
   * llega como `undefined` con el tipo prometiendo un valor, que es el fallo que las
   * esquinas de una fotografía ya costaron una vez en este proyecto.
   */
  it('la lista de columnas cubre todo lo que `DocumentOption` promete', () => {
    const keys = Object.keys(option()).filter((key) => key !== 'document_type')
    for (const key of keys) {
      expect(DOCUMENT_OPTION_COLUMNS).toContain(key)
    }
    expect(DOCUMENT_OPTION_COLUMNS).toContain('document_type:document_types(')
  })

  /** Narrower than the block's on purpose: a finder identifies, it does not paint. */
  it('no arrastra las notas, la serie ni el lugar del papel', () => {
    // `note` as a standalone column, which is the document's: `date_note` does travel,
    // because it is the date in words and it is what gets printed (ADR-004).
    expect(DOCUMENT_OPTION_COLUMNS).not.toMatch(/(^|[ ,])note([ ,)]|$)/)
    expect(DOCUMENT_OPTION_COLUMNS).not.toContain('archive_series')
    expect(DOCUMENT_OPTION_COLUMNS).not.toContain('physical_place_id')
  })
})

describe('lo que se lee de un documento en el buscador, que es lo que se busca', () => {
  it('la signatura primero, y con ella el tipo y la fecha', () => {
    expect(documentOptionText(option())).toBe('AR-ARCH-0001 · Carta de la galería · Carta · 1985')
  })

  it('sin signatura no deja un separador huérfano', () => {
    expect(documentOptionText(option({ archive_code: null }))).toBe(
      'Carta de la galería · Carta · 1985',
    )
  })

  it('sin tipo y sin fecha sigue diciendo algo (RF-304)', () => {
    expect(
      documentOptionText(
        option({ archive_code: null, document_type: null, date_text: '', start_year: null }),
      ),
    ).toBe('Carta de la galería · Tipo sin clasificar · Sin fecha')
  })

  /**
   * Que haya escaneo o no es el dato que decide si basta con enlazar o hay que ir a
   * buscar el papel, así que va en la fila y no un toque más adentro. No hay columna
   * «digitalizado»: es la ruta (RF-408).
   */
  it('dice si está digitalizado y cuánto pesa', () => {
    expect(documentOptionFileText(option())).toBe('Digitalizado · 3,2 MB')
    expect(documentOptionFileText(option({ file_size_bytes: null }))).toBe('Digitalizado')
    expect(documentOptionFileText(option({ file_path: null }))).toBe('Sin digitalizar')
    expect(documentOptionFileText(option({ file_path: '   ' }))).toBe('Sin digitalizar')
  })
})

describe('a quién se ofrece y a quién no', () => {
  const archive = [
    option(),
    option({ id: 'doc-2', archive_code: 'AR-ARCH-0002', title: 'Recorte de prensa' }),
    option({ id: 'doc-3', archive_code: 'AR-ARCH-0003', title: 'Cartel de la muestra', active: false }),
  ]

  /**
   * Un documento retirado NO se ofrece: esta es una lista para elegir, y ofrecer algo
   * que el archivo ha retirado sería devolverlo al uso por la puerta de atrás. Es la
   * regla contraria a la de la ficha, que sí muestra el nombre de lo retirado.
   */
  it('los documentos retirados no se ofrecen', () => {
    const choices = rankDocumentOptions(archive, '', new Set())
    expect(choices.map((choice) => choice.option.id)).toEqual(['doc-1', 'doc-2'])
  })

  /**
   * **La decisión que evita la duplicación del PDF.** Lo que ya está enlazado se ve,
   * marcado y no elegible: esconderlo dejaría el buscador con pinta de que el
   * documento no está en el archivo, y de ahí se sube otra vez.
   */
  it('lo que ya está enlazado se LISTA, marcado, y no se puede elegir dos veces', () => {
    const choices = rankDocumentOptions(archive, '', new Set(['doc-1']))
    expect(choices).toHaveLength(2)
    const already = choices.find((choice) => choice.option.id === 'doc-1')
    expect(already?.alreadyLinked).toBe(true)
    expect(already?.fileText).toBe('Ya está enlazado con esta obra')
    expect(choices.find((choice) => choice.option.id === 'doc-2')?.alreadyLinked).toBe(false)
  })

  it('la búsqueda va sobre lo que se ve, sin tildes ni mayúsculas, y con letras separadas', () => {
    expect(rankDocumentOptions(archive, 'recorte', new Set()).map((c) => c.option.id)).toEqual([
      'doc-2',
    ])
    expect(rankDocumentOptions(archive, '0002', new Set()).map((c) => c.option.id)).toEqual(['doc-2'])
    expect(rankDocumentOptions(archive, 'galeria', new Set()).map((c) => c.option.id)).toEqual([
      'doc-1',
    ])
  })

  it('las letras que han coincidido se señalan, o la opción parece arbitraria', () => {
    const choice = rankDocumentOptions(archive, 'carta', new Set())[0]
    expect(choice?.indices.length).toBeGreaterThan(0)
    expect(choice?.text).toBe(documentOptionText(option()))
  })

  /** Withdrawn links count: `document_artwork` restores them, it does not duplicate them. */
  it('se considera enlazado también lo que está en la papelera', () => {
    const ids = linkedDocumentIds([link(), link({ id: 'link-2', document_id: 'doc-2', active: false })])
    expect(ids).toEqual(new Set(['doc-1', 'doc-2']))
  })
})

describe('nunca una lista vacía sin explicación (RF-304)', () => {
  /**
   * Los dos casos son distintos y confundirlos cuesta una tarde: el archivo está
   * vacío, o tiene documentos y ninguno coincide. Los dos tienen que apuntar al OTRO
   * botón, o la catalogadora concluye que el buscador está roto.
   */
  it('el archivo vacío manda a subir, y lo nombra igual que el botón', () => {
    const said = noDocumentOptionsText(0, '')
    expect(said).toContain('todavía no tiene ningún documento')
    expect(said).toContain('Subir un documento del archivo')
  })

  it('ninguna coincidencia repite lo que se escribió y también manda a subir', () => {
    const said = noDocumentOptionsText(12, '  cartel  ')
    expect(said).toContain('«cartel»')
    expect(said).toContain('Subir un documento del archivo')
  })

  it('sin nada escrito no se cita una búsqueda que no se ha hecho', () => {
    expect(noDocumentOptionsText(12, '   ')).toContain('coincide.')
    expect(noDocumentOptionsText(12, '   ')).not.toContain('coincide con')
  })

  it('cuando todo lo que coincide ya está enlazado, se dice en vez de dejar la lista muerta', () => {
    const choices = rankDocumentOptions([option()], '', new Set(['doc-1']))
    expect(allLinkedText(choices)).toContain('ya enlazados con esta obra')
    // With something selectable nothing is said: it would be noise over a list that works.
    expect(allLinkedText(rankDocumentOptions([option()], '', new Set()))).toBeNull()
    // And with the list empty, nothing either: `noDocumentOptionsText` tells that.
    expect(allLinkedText([])).toBeNull()
  })
})

describe('lo que viaja a `document_artwork` (RF-516, RF-517)', () => {
  it('los tres argumentos, con la nota recortada', () => {
    expect(documentLinkArgs('AR-0001', 'doc-1', '  reproducida en la página 3  ')).toEqual({
      p_catalog_id: 'AR-0001',
      p_document_id: 'doc-1',
      p_note: 'reproducida en la página 3',
    })
  })

  /**
   * Una nota vacía viaja vacía a propósito: la función conserva lo que ya hubiera
   * cuando lo que llega está en blanco —«lo que no se manda no se borra»— y así
   * volver a enlazar desde un formulario que abre limpio no puede vaciar la frase
   * que alguien investigó.
   */
  it('una nota en blanco viaja en blanco, que es «no toques la que hay»', () => {
    expect(documentLinkArgs('AR-0001', 'doc-1', '   ').p_note).toBe('')
  })
})

describe('«sin revisar» no es «no», y aquí manda al revés (RF-218)', () => {
  /**
   * `tg_artwork_document_status_coherent` lo rechaza y lo dice en español —medido
   * contra la base—, y esa frase se muestra tal cual cuando llega. Pero un control que
   * va a ser rechazado tiene que decirlo ANTES de pulsarse: ella está de pie.
   */
  it('con la documentación «investigada sin resultado» se avisa antes de tocar', () => {
    const said = linkBlockedReason('NONE_FOUND')
    expect(said).toContain('Investigado, sin resultados')
    expect(said).toContain('Investigación en curso')
  })

  it('en cualquier otro estado no estorba, «sin revisar» incluido', () => {
    expect(linkBlockedReason('UNREVIEWED')).toBeNull()
    expect(linkBlockedReason('IN_PROGRESS')).toBeNull()
    expect(linkBlockedReason('COMPLETE')).toBeNull()
    // And without knowing the state nothing is blocked either: not knowing is not a no.
    expect(linkBlockedReason(null)).toBeNull()
  })
})

describe('quitar un documento de la ficha dice lo que NO pasa (RF-517, RF-901)', () => {
  /**
   * Es el aviso entero de esta pieza: el documento se queda en el archivo, con su
   * fichero, y lo siguen viendo las demás obras. Una catalogadora que crea que va a
   * destruir un expediente escaneado dejará el vínculo equivocado en el catálogo.
   */
  it('el documento sigue en el archivo y el fichero no se toca', () => {
    const said = retireLinkConfirmText({ title: 'Carta de la galería', file: { bytes: 3_355_443 } })
    expect(said).toContain('«Carta de la galería»')
    expect(said).toContain('sigue en el archivo')
    expect(said).toContain('las demás obras y exposiciones')
    expect(said).toContain('no se borran nunca')
    expect(said).toContain('se puede volver a añadir')
  })

  it('sin fichero no se promete nada sobre ningún fichero', () => {
    const said = retireLinkConfirmText({ title: 'Carta', file: null })
    expect(said).not.toContain('fichero')
    expect(said).toContain('sigue en el archivo')
  })

  it('sin título no deja unas comillas vacías', () => {
    expect(retireLinkConfirmText({ title: '   ', file: null })).toMatch(/^este documento/)
  })
})

describe('por qué hay dos botones, dicho una vez', () => {
  /**
   * Sin esta frase los dos botones parecen el camino largo y el corto de lo mismo, y
   * se pulsa el de arriba: para la segunda obra de un recorte eso son dos copias del
   * PDF en el almacén y dos fichas que hay que reconciliar a mano.
   */
  it('dice que un documento se guarda una vez y cuelga de varias obras', () => {
    expect(TWO_ACTS_TEXT).toContain('varias obras')
    expect(TWO_ACTS_TEXT).toContain('una sola vez')
    expect(TWO_ACTS_TEXT).toContain('todavía no está en el archivo')
  })
})
