import { describe, expect, it } from 'vitest'
import {
  DRAFT_MAX_AGE_MS,
  draftAgeText,
  draftFingerprint,
  draftOfferText,
  draftStorageKey,
  packDraft,
  readDraft,
} from './draftStore'

/**
 * The draft that survives closing the sheet.
 *
 * What this suite pins down are the three ways for this to be WORSE than not having it:
 *
 *   · offering an ancient draft, which is accepted without looking and overwrites everything
 *     that has been corrected since;
 *   · offering it while keeping quiet that the row has changed, which silently reverts another
 *     session's correction — the kind of loss that leaves no trace;
 *   · blowing up on opening the sheet because there is rubbish in `localStorage`.
 */

const AHORA = new Date('2026-08-05T12:00:00Z')
const HACE_10_MIN = new Date('2026-08-05T11:50:00Z')

interface Campos {
  title: string
  year: number | null
}

const BORRADOR: Campos = { title: 'Carta de la galería', year: 1985 }

describe('draftStorageKey, la clave', () => {
  it('lleva prefijo del proyecto y versión del formato', () => {
    // The batch-selection key already taught what it costs to rename one that is
    // set in somebody's browser: with the version inside, changing the format is
    // changing the number.
    expect(draftStorageKey('documento-editar:abc')).toBe(
      'catalogador:borrador:v1:documento-editar:abc',
    )
  })
})

describe('readDraft, lo que se ofrece y lo que no', () => {
  it('lo apuntado hace un rato se ofrece tal cual', () => {
    const raw = packDraft({ draft: BORRADOR, at: HACE_10_MIN, fingerprint: 'a|1985' })
    const read = readDraft<Campos>(raw, { now: AHORA, fingerprint: 'a|1985' })
    expect(read.status).toBe('ready')
    expect(read.draft).toEqual(BORRADOR)
    expect(read.at?.toISOString()).toBe(HACE_10_MIN.toISOString())
  })

  it('pasados siete días se tira, y NO se ofrece', () => {
    // A draft from three weeks ago about a record touched five times since is no help: it
    // gets accepted without looking and five corrections are overwritten.
    const viejo = new Date(AHORA.getTime() - DRAFT_MAX_AGE_MS - 1)
    const read = readDraft<Campos>(
      packDraft({ draft: BORRADOR, at: viejo, fingerprint: null }),
      { now: AHORA, fingerprint: null },
    )
    expect(read.status).toBe('expired')
    expect(read.draft).toBeNull()
  })

  it('justo dentro del plazo sí se ofrece', () => {
    const limite = new Date(AHORA.getTime() - DRAFT_MAX_AGE_MS + 1000)
    expect(
      readDraft(packDraft({ draft: BORRADOR, at: limite, fingerprint: null }), {
        now: AHORA,
        fingerprint: null,
      }).status,
    ).toBe('ready')
  })

  it('si lo guardado ha cambiado, se ofrece pero marcado', () => {
    // It is not hidden —that would be losing the work a second time— and not kept quiet:
    // accepting it blindly would revert the other session's correction.
    const read = readDraft<Campos>(
      packDraft({ draft: BORRADOR, at: HACE_10_MIN, fingerprint: 'a|1985' }),
      { now: AHORA, fingerprint: 'a|1986' },
    )
    expect(read.status).toBe('stale')
    expect(read.draft).toEqual(BORRADOR)
  })

  it('un formulario de alta no tiene fila con la que chocar', () => {
    // With no fingerprint there is nothing to compare, and that is not «it changed»: it does not apply.
    expect(
      readDraft(packDraft({ draft: BORRADOR, at: HACE_10_MIN, fingerprint: null }), {
        now: AHORA,
        fingerprint: 'a|1985',
      }).status,
    ).toBe('ready')
  })

  it('un reloj mal puesto no tira el trabajo', () => {
    // A date in the future is a time zone or an unsynchronized clock. Throwing the draft
    // away for that would be losing typing over an hour's difference.
    const futuro = new Date(AHORA.getTime() + 3 * 60 * 60 * 1000)
    expect(
      readDraft(packDraft({ draft: BORRADOR, at: futuro, fingerprint: null }), {
        now: AHORA,
        fingerprint: null,
      }).status,
    ).toBe('ready')
  })

  it('la basura no revienta nada: esto corre al ABRIR la hoja', () => {
    const casos = [
      null,
      '',
      '   ',
      'no soy json',
      '{}',
      '[]',
      'null',
      '{"v":99,"at":"2026-08-05T11:50:00Z","fp":null,"draft":{}}',
      '{"v":1,"at":"ni fecha","fp":null,"draft":{}}',
      '{"v":1,"at":"2026-08-05T11:50:00Z","fp":null}',
      '{"v":1,"at":"2026-08-05T11:50:00Z","fp":null,"draft":"texto"}',
    ]
    for (const raw of casos) {
      const read = readDraft(raw, { now: AHORA, fingerprint: null })
      expect(read.status, JSON.stringify(raw)).toBe('none')
      expect(read.draft).toBeNull()
    }
  })
})

describe('draftFingerprint, ¿ha cambiado la fila?', () => {
  it('cambia cuando cambia cualquier campo', () => {
    expect(draftFingerprint(['Carta', 1985, false])).toBe(
      draftFingerprint(['Carta', 1985, false]),
    )
    expect(draftFingerprint(['Carta', 1985, false])).not.toBe(
      draftFingerprint(['Carta', 1986, false]),
    )
  })

  it('los ausentes no se confunden con la cadena vacía… ni al revés', () => {
    // `null` and `''` are the same «no datum» for the form, so here too: otherwise,
    // a field the base returns as null and the form leaves blank would give «it has
    // changed» on every opening.
    expect(draftFingerprint([null, 'x'])).toBe(draftFingerprint(['', 'x']))
    expect(draftFingerprint([undefined, 'x'])).toBe(draftFingerprint(['  ', 'x']))
  })

  it('y el orden importa, que es lo que la hace útil', () => {
    expect(draftFingerprint(['a', 'b'])).not.toBe(draftFingerprint(['b', 'a']))
  })
})

describe('draftAgeText, «¿esto es de ahora o de otro día?»', () => {
  const desde = (ms: number) => draftAgeText(new Date(AHORA.getTime() - ms), AHORA)

  it('los tramos, en palabras', () => {
    expect(desde(5_000)).toBe('hace un momento')
    expect(desde(60_000)).toBe('hace un momento')
    expect(desde(20 * 60_000)).toBe('hace 20 minutos')
    expect(desde(60 * 60_000)).toBe('hace una hora')
    expect(desde(5 * 60 * 60_000)).toBe('hace 5 horas')
    expect(desde(24 * 60 * 60_000)).toBe('ayer')
  })

  it('pasados dos días entra la fecha, que es cuando los días dejan de decir nada', () => {
    expect(desde(4 * 24 * 60 * 60_000)).toBe('el 1 de agosto')
  })

  it('nunca sale un tiempo negativo', () => {
    expect(draftAgeText(new Date(AHORA.getTime() + 60_000), AHORA)).toBe('hace un momento')
  })
})

describe('draftOfferText, lo que se lee al ofrecerlo', () => {
  it('lo normal: cuándo fue y una pregunta', () => {
    const text = draftOfferText({ status: 'ready', at: HACE_10_MIN, now: AHORA })
    expect(text).toContain('hace 10 minutos')
    expect(text).toContain('¿Lo recuperas?')
  })

  it('lo desfasado dice qué ha pasado y qué se perdería', () => {
    const text = draftOfferText({ status: 'stale', at: HACE_10_MIN, now: AHORA })!
    expect(text).toContain('han cambiado')
    expect(text).toContain('se perdería')
    expect(text).toContain('míralo antes de guardar')
  })

  it('el fichero que no se ha podido guardar se dice AQUÍ, no al descubrirlo', () => {
    const text = draftOfferText({
      status: 'ready',
      at: HACE_10_MIN,
      now: AHORA,
      filesLost: true,
    })!
    expect(text).toContain('volver a elegirlo')
  })

  it('y sin nada que ofrecer no hay frase', () => {
    expect(draftOfferText({ status: 'none', at: null, now: AHORA })).toBeNull()
    expect(draftOfferText({ status: 'expired', at: HACE_10_MIN, now: AHORA })).toBeNull()
  })
})
