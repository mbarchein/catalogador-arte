import { describe, expect, it } from 'vitest'
import { ARCHIVE_NOUN } from '../../lib/images'
import {
  pendingUploadNotice,
  pendingUploadText,
  preparingCopyText,
  uploadFailureText,
  uploadPercent,
  uploadStatusText,
} from './uploadProgress'

/**
 * RNF-106: the wait has to be legible.
 *
 * These fix the three ways a progress line goes wrong without anyone noticing: a
 * percentage that reaches a hundred before the file does, a size that reads as a
 * different number from the one the rest of the application shows for the same file, and
 * a file that gets a second name here.
 */

describe('uploadPercent', () => {
  it('is floored, so «100%» never appears with bytes still in flight (RNF-106)', () => {
    // 11 999 999 of 12 000 000 is 99.99…, and rounding it shows a finished upload that
    // then keeps going — the reading that makes the number stop being believed.
    expect(uploadPercent(11_999_999, 12_000_000)).toBe(99)
    expect(uploadPercent(12_000_000, 12_000_000)).toBe(100)
  })

  it('clamps above and below', () => {
    // Some browsers count the request headers into `loaded`, so it can exceed the body.
    expect(uploadPercent(1_100, 1_000)).toBe(100)
    expect(uploadPercent(-5, 1_000)).toBe(0)
  })

  it('answers null when there is nothing to divide by', () => {
    expect(uploadPercent(10, null)).toBeNull()
    expect(uploadPercent(10, undefined)).toBeNull()
    expect(uploadPercent(10, 0)).toBeNull()
    expect(uploadPercent(10, Number.NaN)).toBeNull()
    expect(uploadPercent(Number.POSITIVE_INFINITY, 10)).toBeNull()
  })
})

describe('uploadStatusText', () => {
  it('keeps saying only the position until a step starts', () => {
    // The screen must not go blank or flicker between one file and the next.
    expect(uploadStatusText({ index: 1, count: 3 })).toBe('Foto 1 de 3 · Subiendo…')
  })

  it('NO cuenta fotografías cuando solo hay una', () => {
    // «Subiendo 1 de 1» no dice qué está contando, y la lectura obvia —un fichero— es
    // falsa cuatro veces: una fotografía son la miniatura, la copia de consulta, el
    // original y la copia corregida. Preguntado por la catalogadora tal cual.
    expect(uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 1, total: 2 })).not.toContain(
      '1 de 1',
    )
  })

  it('nombra los cuatro ficheros, también los dos que no pueden contarse', () => {
    // Las derivadas van por la biblioteca de almacenamiento, que no informa de bytes.
    // Callárselas es lo que las hacía parecer no subidas.
    expect(uploadStatusText({ index: 1, count: 1, step: 'derivatives' })).toBe(
      'Subiendo las copias que se ven en la ficha…',
    )
    // Y sin porcentaje inventado, que sería el único número falso de la pantalla.
    expect(uploadStatusText({ index: 1, count: 1, step: 'derivatives' })).not.toMatch(/%/)
  })

  it('says which file, how much of how much, and the percentage', () => {
    expect(
      uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 4_404_019, total: 12_373_197 }),
    ).toBe('Subiendo el original: 4,2 MB de 11,8 MB (35%)')
  })

  it('starts at «0 kB» and not at nothing', () => {
    // `formatFileSize` answers null below one byte, and a line reading «de 7,6 MB» with
    // no left-hand side looks broken at exactly the moment the wait begins.
    expect(uploadStatusText({ index: 2, count: 4, step: 'master', loaded: 0, total: 8_000_000 })).toBe(
      'Foto 2 de 4 · Subiendo el original: 0 kB de 7,6 MB (0%)',
    )
  })

  it('shows what has gone out when the browser will not say the total', () => {
    // `lengthComputable` false. Silence here is indistinguishable from a stall.
    expect(
      uploadStatusText({ index: 1, count: 1, step: 'corrected', loaded: 524_288, total: null }),
    ).toBe('Subiendo la copia corregida: 512 kB enviados')
  })

  it('names the two files apart, so a stalled one can be said', () => {
    const master = uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 1, total: 2 })
    const corrected = uploadStatusText({ index: 1, count: 1, step: 'corrected', loaded: 1, total: 2 })
    expect(master).not.toBe(corrected)
  })

  it('dice que es un reintento, porque el contador vuelve a cero', () => {
    // Un PUT interrumpido no reanuda nada: los bytes se mandan otra vez desde el
    // principio. Sin decirlo, la línea baja de «80 %» a «0 %» sola, que es exactamente
    // como se lee una avería.
    expect(
      uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 0, total: 8_000_000, attempt: 2 }),
    ).toBe('Subiendo el original: 0 kB de 7,6 MB (0%) · reintento 1')
    expect(
      uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 0, total: 8_000_000, attempt: 3 }),
    ).toBe('Subiendo el original: 0 kB de 7,6 MB (0%) · reintento 2')
  })

  it('no dice nada del primer intento, que no es un reintento', () => {
    const first = uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 1, total: 2, attempt: 1 })
    expect(first).not.toContain('reintento')
    // Y sin `attempt`, que es como llega desde cualquier sitio que no lo cuente.
    expect(uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 1, total: 2 })).toBe(first)
  })

  it('lo dice también cuando el navegador no da el total', () => {
    expect(
      uploadStatusText({ index: 1, count: 1, step: 'corrected', loaded: 1024, total: null, attempt: 2 }),
    ).toBe('Subiendo la copia corregida: 1 kB enviados · reintento 1')
  })

  it('uses the same nouns as the download side and does not invent its own', () => {
    // The duplicated vocabulary table this replaced: two screens naming one file two ways
    // is how «el original» and «el máster» end up meaning the same thing to nobody.
    expect(uploadStatusText({ index: 1, count: 1, step: 'master', loaded: 1, total: 2 })).toContain(
      ARCHIVE_NOUN.master,
    )
    expect(
      uploadStatusText({ index: 1, count: 1, step: 'corrected', loaded: 1, total: 2 }),
    ).toContain(ARCHIVE_NOUN.corrected)
  })
})

describe('el aviso de que no se ha podido subir', () => {
  it('dice DÓNDE se quedó, no solo qué se rompió', () => {
    // «No se han podido subir 1 de 1: La conexión se ha cortado durante el envío» vale
    // igual para un enlace que muere en el primer kilobyte y para uno que muere en el
    // mismo 2 MB del mismo fichero cada vez, y son problemas distintos: uno es mala
    // cobertura y el otro es algo determinista. Leerlo en la pantalla mientras pasa no
    // es lo mismo que tenerlo escrito después.
    expect(
      uploadFailureText({
        failed: 1,
        total: 1,
        message: 'La conexión se ha cortado durante el envío.',
        at: { step: 'master', loaded: 2_097_152, total: 3_774_873, attempt: 3 },
        seconds: 47.4,
      }),
    ).toBe(
      'No se ha podido subir la fotografía: La conexión se ha cortado durante el envío. ' +
        'Se quedó en el original, 2 MB de 3,6 MB, en el intento 3. Tardó 47 s en fallar.',
    )
  })

  it('el tiempo es lo que separa la mala cobertura de un corte determinista', () => {
    // Los bytes solos no los distinguen: un navegador entrega varios megas al socket
    // antes de que la red haya mandado ninguno, así que el contador puede pararse en el
    // mismo sitio por motivos que no tienen que ver con por qué acaba. Morir siempre a
    // los mismos cuarenta segundos, en cambio, es un plazo de espera en algún punto del
    // camino, y por muchos reintentos que se den no se arregla.
    expect(uploadFailureText({ failed: 1, total: 1, message: 'Vaya.', seconds: 41.6 })).toBe(
      'No se ha podido subir la fotografía: Vaya. Tardó 42 s en fallar.',
    )
  })

  it('cuenta cuántas cuando hay varias', () => {
    expect(
      uploadFailureText({ failed: 2, total: 5, message: 'Vaya.' }),
    ).toBe('No se han podido subir 2 de 5: Vaya.')
  })

  it('no inventa un «se quedó en» cuando no llegó a empezar', () => {
    // Sin un solo evento de progreso no hay dónde: decir «0 kB de 0» sería peor que
    // callarse, porque parece una medida.
    expect(uploadFailureText({ failed: 1, total: 1, message: 'Vaya.' })).toBe(
      'No se ha podido subir la fotografía: Vaya.',
    )
    // Y las derivadas no cuentan bytes, así que tampoco tienen un punto donde quedarse.
    expect(
      uploadFailureText({
        failed: 1,
        total: 1,
        message: 'Vaya.',
        at: { step: 'derivatives', loaded: 0, total: null, attempt: 1 },
      }),
    ).toBe('No se ha podido subir la fotografía: Vaya.')
  })
})

describe('lo que queda por subir', () => {
  it('cuenta, porque la cuenta es lo que se olvida', () => {
    expect(pendingUploadText(1)).toBe('Subir la foto')
    expect(pendingUploadText(4)).toBe('Subir 4 fotos')
    expect(pendingUploadNotice(1)).toBe('Hay una fotografía sin subir.')
    expect(pendingUploadNotice(4)).toBe('Hay 4 fotografías sin subir.')
  })

  it('no dice nada cuando no queda nada', () => {
    // La barra del pie no se pinta, así que no puede tapar el menú ni la ficha cuando
    // no hay nada que hacer con ella.
    expect(pendingUploadNotice(0)).toBeNull()
    expect(pendingUploadNotice(-1)).toBeNull()
  })
})

describe('preparingCopyText', () => {
  it('announces the render, which is not a transfer (RF-420)', () => {
    // Around twelve seconds on a 9248 px original with nothing going over the network.
    // Calling it «Subiendo» would be a lie the progress line then contradicts.
    expect(preparingCopyText(2, 5)).toBe('Preparando la copia a tamaño completo de la 2 de 5…')
  })
})
