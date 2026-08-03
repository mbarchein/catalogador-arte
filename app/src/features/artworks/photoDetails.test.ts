import { describe, expect, it } from 'vitest'
import {
  PHOTO_DETAIL_COLUMNS,
  PHOTO_PROVENANCES,
  carriedColorOffer,
  correctedStateText,
  generalColorOf,
  photoEdit,
  provenanceOf,
  sameEditColumns,
  traceOnlyChange,
  type PhotoDetailRow,
} from './photoDetails'
import { colorAvailability, editToColumns, NO_EDIT } from '../../lib/imageEdits'
import { NO_COLOR } from '../../lib/imageColor'
import { PHOTO_PROVENANCE_LABEL, type ShotTypeValue } from '../../lib/types'

/**
 * The wiring the two screens around the editor do with the columns of a photograph.
 *
 * What is verified here is not the colour arithmetic —that belongs to imageColor.ts and
 * imageEdits.ts and is verified there— but the three decisions that get taken with it on
 * these screens: which columns to read, when a save would lose work, and what sentence
 * appears when there is nothing to show.
 */

/** A detail row with everything at its default, i.e. an untouched photograph. */
function detail(over: Partial<PhotoDetailRow> = {}): PhotoDetailRow {
  return {
    image_id: 'TS-0005_v1',
    file_photo_date: null,
    file_photo_date_exact: null,
    original_width: null,
    original_height: null,
    master_bytes: null,
    provenance: 'OWN',
    corrected_path: null,
    corrected_bytes: null,
    corrected_pending: false,
    color_temperature: null,
    color_tint: null,
    color_exposure: null,
    color_black: null,
    color_white: null,
    color_gamma: null,
    color_shoulder: null,
    color_gray: false,
    color_neutral_x: null,
    color_neutral_y: null,
    color_source: null,
    color_reference: null,
    color_light: null,
    color_inherited: false,
    ...over,
  }
}

describe('las columnas que se piden (RF-414, RF-416, RF-417, RF-420)', () => {
  it('el select nombra TODAS las columnas de la fila de detalle', () => {
    // `Object.keys` of a value typed as the interface IS the interface at runtime: the
    // literal in `detail()` does not compile with a field missing, so a column added to
    // the type reaches this assertion and fails here instead of being read as the
    // identity — which for a colour column is indistinguishable from «nadie lo ha
    // ajustado». It is the same trap the corners already fell into once.
    for (const column of Object.keys(detail())) {
      expect(PHOTO_DETAIL_COLUMNS).toContain(column)
    }
  })

  it('las tres procedencias son exactamente las que tienen etiqueta (RF-417)', () => {
    expect([...PHOTO_PROVENANCES]).toEqual(Object.keys(PHOTO_PROVENANCE_LABEL))
    expect(PHOTO_PROVENANCES).toHaveLength(3)
  })
})

describe('provenanceOf (RF-417)', () => {
  it('acepta los tres valores del enum', () => {
    expect(provenanceOf('OWN')).toBe('OWN')
    expect(provenanceOf('OTHER_CATALOG')).toBe('OTHER_CATALOG')
    expect(provenanceOf('THIRD_PARTY')).toBe('THIRD_PARTY')
  })

  it('lo que no reconoce se lee como propia y nunca como ajena', () => {
    // The direction matters: reading an unexplainable value as «ajena» would lock the
    // colour adjustment with no way to get it back, and the column's own default is OWN.
    for (const odd of [null, undefined, '', 'PROPIA', 42, {}]) {
      expect(provenanceOf(odd)).toBe('OWN')
    }
  })
})

describe('photoEdit: el encuadre y el color se leen juntos (RF-414)', () => {
  it('junta la geometría de una fila con el color de la otra', () => {
    const edit = photoEdit({ rotation: 90 }, detail({ color_temperature: 12, color_gamma: 1.2 }))
    expect(edit.rotation).toBe(90)
    expect(edit.color.temperature).toBe(12)
    expect(edit.color.gamma).toBe(1.2)
  })

  it('leer solo el encuadre pierde el color, que es justo lo que se evita', () => {
    // This is the failure the merge exists to prevent, written down so that it stays
    // prevented: with the gallery's row alone the summary would announce no colour over
    // a photograph that plainly shows one, and a save built on it would write the
    // identity into fourteen columns.
    expect(photoEdit({ rotation: 90 }, null).color).toEqual(NO_COLOR)
  })
})

describe('sameEditColumns y traceOnlyChange (RF-414, RF-418)', () => {
  const framing = { rotation: 0 as const, crop: null, corners: null }

  it('dos ediciones iguales escriben la misma fila', () => {
    expect(sameEditColumns(NO_EDIT, NO_EDIT)).toBe(true)
    expect(traceOnlyChange(NO_EDIT, NO_EDIT)).toBe(false)
  })

  it('«revisado y dejado como estaba» no cambia un píxel y sí cambia la fila', () => {
    const reviewed = { ...framing, color: { source: 'REVIEWED_UNCHANGED' as const } }
    expect(sameEditColumns(reviewed, NO_EDIT)).toBe(false)
    expect(traceOnlyChange(reviewed, NO_EDIT)).toBe(true)
    // And it really is the trace and nothing else: the fourteen columns differ in one.
    expect(editToColumns(reviewed).color_source).toBe('REVIEWED_UNCHANGED')
    expect(editToColumns(NO_EDIT).color_source).toBeNull()
  })

  it('mover el sitio donde se tomó el gris es traza y no píxeles (RF-418)', () => {
    const picked = { ...framing, color: { neutral: { x: 0.4, y: 0.6 } } }
    expect(traceOnlyChange(picked, NO_EDIT)).toBe(true)
  })

  it('un ajuste que sí cambia píxeles no es traza', () => {
    const warmer = { ...framing, color: { temperature: 10 } }
    expect(sameEditColumns(warmer, NO_EDIT)).toBe(false)
    expect(traceOnlyChange(warmer, NO_EDIT)).toBe(false)
  })

  it('un giro tampoco es traza', () => {
    expect(traceOnlyChange({ rotation: 90, crop: null }, NO_EDIT)).toBe(false)
  })
})

describe('generalColorOf: la toma general manda (RF-414)', () => {
  const rows = [
    { image_id: 'a', shot_type: 'GENERAL' as ShotTypeValue },
    { image_id: 'b', shot_type: 'BACK' as ShotTypeValue },
    { image_id: 'c', shot_type: 'GENERAL' as ShotTypeValue },
  ]

  it('devuelve el color de la primera toma general del orden colocado', () => {
    const details = {
      a: detail({ image_id: 'a', color_temperature: 8 }),
      c: detail({ image_id: 'c', color_temperature: -20 }),
    }
    expect(generalColorOf(rows, details)?.temperature).toBe(8)
  })

  it('salta la fotografía que se está editando: la general no hereda de nadie', () => {
    const details = {
      a: detail({ image_id: 'a', color_temperature: 8 }),
      c: detail({ image_id: 'c', color_temperature: -20 }),
    }
    expect(generalColorOf(rows, details, 'a')?.temperature).toBe(-20)
  })

  it('no hereda de una toma que no sea general', () => {
    expect(generalColorOf(rows, { b: detail({ image_id: 'b', color_temperature: 30 }) })).toBeUndefined()
  })

  it('sin toma general, o con su color neutro, no hay nada que heredar', () => {
    expect(generalColorOf([], {})).toBeUndefined()
    expect(generalColorOf(rows, { a: detail({ image_id: 'a' }) })).toBeUndefined()
  })

  it('un color neutro con traza tampoco se hereda: no hay números que copiar', () => {
    // `REVIEWED_UNCHANGED` is work done and worth keeping in its own row, but there is
    // nothing in it for another photograph to start from.
    const details = { a: detail({ image_id: 'a', color_source: 'REVIEWED_UNCHANGED' }) }
    expect(generalColorOf(rows, details)).toBeUndefined()
  })
})

describe('correctedStateText: el estado de la copia, siempre dicho (RF-420)', () => {
  it('cuando está pendiente dice que se genera después y que el máster está intacto', () => {
    const text = correctedStateText(detail({ corrected_pending: true }), { rotation: 90, crop: null })
    expect(text).toContain('pendiente')
    expect(text).toContain('ordenador')
    expect(text).toContain('máster')
  })

  it('cuando existe dice su tamaño y para qué sirve', () => {
    const text = correctedStateText(
      detail({ corrected_path: 'TS-0005/TS-0005_ab12cd34_corrected.jpg', corrected_bytes: 5_242_880 }),
      { rotation: 90, crop: null },
    )
    expect(text).toContain('5,0 MB')
    expect(text).toContain('imprenta')
  })

  it('una corrección anterior a la copia se explica en vez de leerse como «no hace falta»', () => {
    // The fourth state, the one the feature did not create: the 39 rows already in the
    // database carry corrections, no path and the flag down. Nothing is repaired
    // backwards (ADR-010), so what is owed is saying it.
    const text = correctedStateText(detail(), { rotation: 90, crop: null })
    expect(text).toContain('antes de que se guardaran copias')
    expect(text).not.toContain('no hace falta')
  })

  it('sin correcciones no hace falta ninguna copia', () => {
    expect(correctedStateText(detail(), NO_EDIT)).toContain('no hace falta')
  })

  it('sin la fila, lo dice: nunca un hueco', () => {
    expect(correctedStateText(undefined, NO_EDIT)).not.toBe('')
    expect(correctedStateText(null, NO_EDIT)).toContain('No se ha podido leer')
  })
})

describe('carriedColorOffer: el mismo color que la anterior (RF-414, RF-417)', () => {
  const remembered = { temperature: 14, gamma: 1.15 }

  it('ofrece el ajuste recordado en una toma general propia', () => {
    const offer = carriedColorOffer(remembered, 'GENERAL', 'OWN')
    expect(offer.reason).toBeNull()
    expect(offer.color?.temperature).toBe(14)
    expect(offer.color?.gamma).toBe(1.15)
  })

  it('no se ofrece en una reproducción ajena, con la razón del modelo y no otra (RF-417)', () => {
    // Same sentence as the editor's, taken from the same function: two wordings for the
    // same rule is how the two screens start disagreeing about it.
    for (const provenance of ['OTHER_CATALOG', 'THIRD_PARTY'] as const) {
      const offer = carriedColorOffer(remembered, 'GENERAL', provenance)
      expect(offer.color).toBeNull()
      expect(offer.reason).toBe(colorAvailability(true, provenance).reason)
    }
  })

  it('sin nada recordado explica cómo se llena, en vez de aparecer roto', () => {
    const offer = carriedColorOffer(null, 'GENERAL', 'OWN')
    expect(offer.color).toBeNull()
    expect(offer.reason).toContain('tanda')
  })

  it('un ajuste neutro no es una luz que repetir', () => {
    expect(carriedColorOffer(NO_COLOR, 'GENERAL', 'OWN').color).toBeNull()
  })

  it('el ajuste llega restringido al tipo de toma: un detalle de daño no hereda el rango tonal', () => {
    const offer = carriedColorOffer(remembered, 'DAMAGE_DETAIL', 'OWN')
    expect(offer.reason).toBeNull()
    expect(offer.color?.temperature).toBe(14)
    // The midtones are not offered on a damage detail —there the colour IS the datum—
    // so they must not arrive through this door either.
    expect(offer.color?.gamma).toBe(1)
  })

  it('si de lo recordado no queda nada para ese tipo de toma, se dice por qué', () => {
    const offer = carriedColorOffer({ gamma: 1.4 }, 'DAMAGE_DETAIL', 'OWN')
    expect(offer.color).toBeNull()
    expect(offer.reason).toContain('detalle')
  })
})
