import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { generateDossierPdf, type DossierPhoto } from './dossierPdf'
import type { DossierPage, PlannedPage } from './dossierPdfPlan'
import { textBlocks } from './dossierPdfPlan'

/**
 * RF-1607, RF-1609: que el PDF sale, y que dice lo que el plan decidió.
 *
 * La conversión de la fotografía a JPEG no se prueba aquí: el entorno no tiene
 * `createImageBitmap` ni canvas, y por eso el cargador se inyecta — es la misma
 * disciplina que ya tiene la ficha imprimible. Lo que sí se verifica es todo lo
 * demás, que es lo que decide si el documento se puede mandar: cuántas páginas
 * tiene, qué literales llegan al papel, y que **una fotografía que no se puede leer
 * deja su hueco dicho en vez de parar la generación**.
 */

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

/**
 * Lo que dice el documento, leído de vuelta.
 *
 * `pdf-lib` comprime los flujos de contenido, así que para comprobar que se imprime
 * un literal hay que inflarlos. El texto puede viajar en claro —`(Óleos) Tj`— o en
 * hexadecimal, y cuál de las dos es asunto de la librería: se buscan las dos. Es la
 * misma técnica que `recordPdf.test.ts`, escrita aquí porque la suya es privada.
 */
async function printedText(blob: Blob): Promise<string> {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))
  let content = ''
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    try {
      content += latin1(new Uint8Array(inflateSync(object.contents)))
    } catch {
      // No es un flujo comprimido: el JPEG de una fotografía.
    }
  }
  return content
}

const asHex = (text: string) =>
  Array.from(text, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')

/**
 * Que el literal está impreso, viaje en claro o en hexadecimal.
 *
 * La comparación del hexadecimal es **sin distinguir mayúsculas**, y no es un
 * detalle: `pdf-lib` escribe `<53656C…>` en mayúsculas y `toString(16)` produce
 * minúsculas, así que una comparación literal encuentra el texto en claro y falla
 * en el hexadecimal — que es la forma en la que viaja todo lo que lleva un acento
 * o un punto medio. Medido: sin esto, ocho de estas comprobaciones dan un falso
 * negativo.
 */
async function says(blob: Blob, text: string): Promise<boolean> {
  const content = await printedText(blob)
  if (content.includes(text)) return true
  return content.toLowerCase().includes(asHex(text).toLowerCase())
}

/** La página sin sección, que es lo que miran los tests que solo comprueban tinta. */
const at = (page: DossierPage, section: string | null = null): PlannedPage => ({ page, section })

async function pageCount(blob: Blob): Promise<number> {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))
  return doc.getPageCount()
}

const COVER: DossierPage = {
  kind: 'COVER',
  title: 'Seleccion para galeria',
  recipient: 'Galeria Serrano',
  date: '11 de agosto de 2026',
  blurb: textBlocks('Las medidas son sin marco.'),
}

const ARTWORK: DossierPage = {
  kind: 'ARTWORK',
  texts: [],
  caption: {
    code: 'AR-0042',
    title: 'Figura sentada',
    facts: '1965 - oleo sobre lienzo - 92 x 73 cm',
    price: '4500,00 EUR',
  },
  imageId: null,
  catalogId: 'AR-0042',
}

/** Un JPEG mínimo y válido, el mismo que usa el test de la ficha imprimible. */
const SMALL_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDACAWGBwYFCAcGhwkIiAmMFA0MCwsMGJGSjpQdGZ6eHJmcG6AkLicgIiu' +
      'im5woNqirr7EztDOfJri8uDI8LjKzsb/wAALCAAIAAwBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAwT/xAAgEAAB' +
      'AQgDAAAAAAAAAAAAAAABAgADBAUREhMxIUFR/9oACAEBAAA/ABl0PrhrIuaJgX2BLjKUgFRutoT1ryjf/9k=',
  ),
  (c) => c.charCodeAt(0),
)
const PHOTO: DossierPhoto = { jpeg: SMALL_JPEG, width: 12, height: 8 }

describe('el documento sale', () => {
  it('una página por cada página del plan', async () => {
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await pageCount(blob)).toBe(3)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('la portada imprime el título, el destinatario y la fecha', async () => {
    const blob = await generateDossierPdf([at(COVER)], { title: 'Seleccion', loadPhoto: async () => null })
    expect(await says(blob, 'Seleccion para galeria')).toBe(true)
    expect(await says(blob, 'Galeria Serrano')).toBe(true)
    expect(await says(blob, '11 de agosto de 2026')).toBe(true)
    expect(await says(blob, 'Las medidas son sin marco.')).toBe(true)
  })

  it('el pie de una obra imprime el código, el título, los datos y el precio', async () => {
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await says(blob, 'AR-0042')).toBe(true)
    expect(await says(blob, 'Figura sentada')).toBe(true)
    expect(await says(blob, '92 x 73 cm')).toBe(true)
    expect(await says(blob, '4500,00 EUR')).toBe(true)
  })

  it('sin precio en el pie no se imprime ninguna cifra de más', async () => {
    const sinPrecio: DossierPage = {
      ...ARTWORK,
      caption: { ...ARTWORK.caption, price: null },
    }
    const blob = await generateDossierPdf([at(COVER), at(sinPrecio)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await says(blob, '4500,00 EUR')).toBe(false)
  })

  it('cada hoja lleva su pie con el recuento', async () => {
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    for (const page of ['1 de 3', '2 de 3', '3 de 3']) {
      expect(await says(blob, page)).toBe(true)
    }
  })
})

describe('los textos del dossier llegan al papel (RF-1614)', () => {
  it('el rótulo y el párrafo se imprimen encima de la obra a la que se pegaron', async () => {
    const conTextos: DossierPage = {
      ...ARTWORK,
      texts: [
        { heading: 'Oleos, 1962-1968', body: textBlocks('Las tres primeras estan sin enmarcar.') },
      ],
    }
    const blob = await generateDossierPdf([at(COVER), at(conTextos)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await pageCount(blob)).toBe(2)
    expect(await says(blob, 'Oleos, 1962-1968')).toBe(true)
    expect(await says(blob, 'Las tres primeras estan sin enmarcar.')).toBe(true)
  })

  it('la biografía imprime su prosa y su currículum', async () => {
    const bio: DossierPage = {
      kind: 'BIOGRAPHY',
      heading: 'Alberto Rotili',
      blocks: textBlocks('Nacio en Badajoz.'),
      cv: textBlocks('1985 - Badajoz'),
    }
    const blob = await generateDossierPdf([at(COVER), at(bio)], {
      title: 'Seleccion',
      loadPhoto: async () => null,
    })
    expect(await says(blob, 'Alberto Rotili')).toBe(true)
    expect(await says(blob, 'Nacio en Badajoz.')).toBe(true)
    expect(await says(blob, '1985 - Badajoz')).toBe(true)
  })
})

describe('las secciones y el índice llegan al papel (RF-1619 a RF-1622)', () => {
  it('la portadilla imprime el rótulo y su entradilla', async () => {
    const divider: DossierPage = {
      kind: 'DIVIDER',
      heading: 'Oleos, 1962-1968',
      body: textBlocks('Los cuatro primeros.'),
    }
    const blob = await generateDossierPdf([at(COVER), at(divider), at(ARTWORK, 'Oleos, 1962-1968')], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await pageCount(blob)).toBe(3)
    expect(await says(blob, 'Oleos, 1962-1968')).toBe(true)
    expect(await says(blob, 'Los cuatro primeros.')).toBe(true)
  })

  it('el pie lleva la sección delante del título del dossier', async () => {
    // Es lo que hace que una hoja suelta encima de una mesa siga significando algo.
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK, 'Oleos')], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await says(blob, 'Oleos · Seleccion')).toBe(true)
  })

  it('la portada no lleva sección en el pie', async () => {
    const blob = await generateDossierPdf([at(COVER)], {
      title: 'Seleccion',
      loadPhoto: async () => null,
    })
    expect(await says(blob, '· Seleccion')).toBe(false)
    expect(await says(blob, 'Seleccion')).toBe(true)
  })

  it('el índice imprime cada sección con sus obras y su página', async () => {
    const index: DossierPage = {
      kind: 'INDEX',
      entries: [
        { heading: 'Oleos', artworkCount: 2 },
        { heading: 'Papel', artworkCount: 1 },
      ],
    }
    const blob = await generateDossierPdf([at(COVER), at(index), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await says(blob, 'ÍNDICE')).toBe(true)
    expect(await says(blob, 'Oleos')).toBe(true)
    expect(await says(blob, '2 obras')).toBe(true)
    expect(await says(blob, '1 obra')).toBe(true)
  })

  it('el número del índice cuenta las hojas de verdad, incluidas las del propio índice', async () => {
    // La página de una sección no se puede saber antes de dibujar: una biografía larga
    // ocupa dos hojas y corre todo lo que viene detrás. Aquí la sección abre en la
    // tercera hoja —portada, índice, obra— y eso es lo que tiene que imprimir.
    const index: DossierPage = { kind: 'INDEX', entries: [{ heading: 'Oleos', artworkCount: 1 }] }
    const blob = await generateDossierPdf(
      [at(COVER), at(index), { page: ARTWORK, section: 'Oleos', sectionStart: true }],
      { title: 'Seleccion', loadPhoto: async () => PHOTO },
    )
    const text = await printedText(blob)
    // El «3» del índice, dibujado a la derecha de «1 obra».
    expect(text.includes('(3)') || text.toLowerCase().includes(asHex('3').toLowerCase())).toBe(true)
  })
})

describe('un texto largo ocupa las hojas que ocupa (RF-1616)', () => {
  /** Una biografía de las que se pegan de una web: quince párrafos y una lista larga. */
  const longBiography = (): DossierPage => ({
    kind: 'BIOGRAPHY',
    heading: 'Alberto Rotili',
    blocks: textBlocks(
      Array.from({ length: 15 }, (_, i) => `Parrafo numero ${i + 1}. ${'Pinto del natural. '.repeat(8)}`).join(
        '\n\n',
      ),
    ),
    cv: textBlocks(
      ['## Exposiciones', ...Array.from({ length: 30 }, (_, i) => `- ${1970 + i} - Sala numero ${i + 1}`)].join(
        '\n',
      ),
    ),
  })

  it('la biografía sigue en la hoja siguiente en vez de escribirse por debajo del margen', async () => {
    // Sin esto, lo que no cabía se dibujaba fuera de la hoja y desaparecía: no un
    // párrafo mal colocado, un párrafo QUE NO ESTÁ. Con una biografía pegada de una web
    // deja de ser hipotético.
    const blob = await generateDossierPdf([at(COVER), at(longBiography(), 'Rotili')], {
      title: 'Seleccion',
      loadPhoto: async () => null,
    })
    expect(await pageCount(blob)).toBeGreaterThan(2)
    // Y lo de arriba y lo del final están los dos.
    expect(await says(blob, 'Parrafo numero 1.')).toBe(true)
    expect(await says(blob, 'Sala numero 30')).toBe(true)
  })

  it('las hojas que añade llevan el pie con su sección y el recuento bien', async () => {
    // El total no se puede escribir antes de haber escrito todas las hojas: «3 de 14»
    // con un 14 estimado es peor que no llevar recuento.
    const blob = await generateDossierPdf([at(COVER), at(longBiography(), 'Rotili')], {
      title: 'Seleccion',
      loadPhoto: async () => null,
    })
    const total = await pageCount(blob)
    expect(await says(blob, `Rotili · Seleccion`)).toBe(true)
    expect(await says(blob, `${total} de ${total}`)).toBe(true)
  })

  it('el índice sigue apuntando a la hoja correcta cuando un texto se ha llevado dos', async () => {
    const index: DossierPage = { kind: 'INDEX', entries: [{ heading: 'Oleos', artworkCount: 1 }] }
    const blob = await generateDossierPdf(
      [
        at(COVER),
        at(index),
        at(longBiography()),
        { page: ARTWORK, section: 'Oleos', sectionStart: true },
      ],
      { title: 'Seleccion', loadPhoto: async () => PHOTO },
    )
    const total = await pageCount(blob)
    // La obra es la última hoja, y es la que el índice tiene que nombrar.
    const text = await printedText(blob)
    const expected = String(total)
    expect(text.includes(`(${expected})`) || text.toLowerCase().includes(asHex(expected).toLowerCase())).toBe(
      true,
    )
  })
})

describe('una fotografía que falla no para el documento', () => {
  it('sin fotografía, el hueco se DICE y la página sale', async () => {
    // Es la disciplina de la ficha imprimible: ni la cobertura de un almacén ni un
    // navegador sin canvas son motivo para dejar a nadie sin documento. Y quien lo
    // recibe tiene que poder distinguir «no hay foto» de «se ha roto esto».
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => null,
    })
    expect(await pageCount(blob)).toBe(2)
    expect(await says(blob, 'Sin fotografía disponible')).toBe(true)
    // Y el pie sigue estando: la página no se queda a medias.
    expect(await says(blob, 'AR-0042')).toBe(true)
  })

  it('un cargador que revienta tampoco para el documento', async () => {
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => {
        throw new Error('sin cobertura')
      },
    })
    expect(await pageCount(blob)).toBe(2)
    expect(await says(blob, 'AR-0042')).toBe(true)
  })

  it('unos bytes que no son un JPEG se dicen de otra manera', async () => {
    const blob = await generateDossierPdf([at(COVER), at(ARTWORK)], {
      title: 'Seleccion',
      loadPhoto: async () => ({ jpeg: Uint8Array.from([1, 2, 3]), width: 10, height: 10 }),
    })
    expect(await pageCount(blob)).toBe(2)
    expect(await says(blob, 'no se ha podido incluir')).toBe(true)
  })
})

describe('lo que el papel no admite', () => {
  it('un carácter que Helvetica no conoce no tira la generación abajo', async () => {
    // `printableText` lo cambia por «?»: un interrogante visible es mejor que un
    // dossier que no se genera.
    const raro: DossierPage = {
      ...ARTWORK,
      caption: { ...ARTWORK.caption, title: 'Figura 中文 sentada' },
    }
    const blob = await generateDossierPdf([at(COVER), at(raro)], {
      title: 'Seleccion',
      loadPhoto: async () => PHOTO,
    })
    expect(await pageCount(blob)).toBe(2)
    expect(await says(blob, 'Figura ?? sentada')).toBe(true)
  })
})
