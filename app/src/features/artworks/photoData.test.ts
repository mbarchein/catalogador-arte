import { describe, expect, it } from 'vitest'
import {
  draftSourceText,
  pendingDataNotice,
  photoDataColumns,
  photoDataDirty,
  photoDataDraft,
  withSourceText,
  PHOTO_SECTIONS,
} from './photoData'

/**
 * A shot's data as a form (RF-417, RF-405).
 *
 * Each control used to save on its own: the chips on being touched and the text on
 * leaving the field. The second is half invisible on a phone —you touch outside and you do not
 * know whether it went in— and two ways of saving coexisted in the same block. What
 * is pinned down here is what makes a «Guardar» useful: that it knows when anything is
 * pending, and that changing provenance without saving does not run over what was
 * written.
 */

const saved = photoDataDraft({
  shot_type: 'GENERAL',
  provenance: 'OWN',
  photo_credit: 'Ana Ruiz',
  provenance_source: '',
})

describe('qué se está editando', () => {
  it('el borrador parte de lo guardado', () => {
    expect(saved).toEqual({
      shotType: 'GENERAL',
      provenance: 'OWN',
      credit: 'Ana Ruiz',
      origin: '',
    })
  })

  it('el campo de texto enseña el que toca a la procedencia elegida', () => {
    expect(draftSourceText(saved)).toBe('Ana Ruiz')
    expect(draftSourceText({ ...saved, provenance: 'OTHER_CATALOG' })).toBe('')
  })

  it('y escribir toca solo esa columna', () => {
    const escrito = withSourceText(saved, 'Juan Pérez')
    expect(escrito.credit).toBe('Juan Pérez')
    expect(escrito.origin).toBe('')
  })
})

describe('cambiar de procedencia sin guardar no pierde nada', () => {
  it('el ida y vuelta devuelve la autoría intacta', () => {
    // It is the reason the draft carries BOTH texts and not only the one
    // shown: with one, marking «tomada de otro catálogo» and changing one's mind would erase
    // what was written without anybody asking.
    const fuera = withSourceText({ ...saved, provenance: 'THIRD_PARTY' }, 'Web del MACVA')
    const vuelta = { ...fuera, provenance: 'OWN' as const }

    expect(draftSourceText(vuelta)).toBe('Ana Ruiz')
    expect(draftSourceText(fuera)).toBe('Web del MACVA')
  })
})

describe('cuándo hay algo que guardar', () => {
  it('sin tocar nada, no', () => {
    expect(photoDataDirty(saved, saved)).toBe(false)
    expect(pendingDataNotice(false)).toBeNull()
  })

  it('unos espacios de más tampoco', () => {
    // Without trimming when comparing, opening the field and closing it would leave the
    // button lit forever and the pending warning shown with nothing pending.
    expect(photoDataDirty({ ...saved, credit: '  Ana Ruiz  ' }, saved)).toBe(false)
  })

  it('cambiar el tipo de toma, la procedencia o el texto, sí', () => {
    expect(photoDataDirty({ ...saved, shotType: 'BACK' }, saved)).toBe(true)
    expect(photoDataDirty({ ...saved, provenance: 'THIRD_PARTY' }, saved)).toBe(true)
    expect(photoDataDirty({ ...saved, credit: 'Otra persona' }, saved)).toBe(true)
  })

  it('y un cambio en el texto que NO se está enseñando cuenta igual', () => {
    // The source was written, it went back to «propia» and it was not saved: there is
    // still something pending even if it cannot be seen on screen.
    expect(photoDataDirty({ ...saved, origin: 'Web del MACVA' }, saved)).toBe(true)
  })

  it('lo pendiente se dice, en vez de solo encender un botón', () => {
    expect(pendingDataNotice(true)).toContain('sin guardar')
  })
})

describe('lo que se manda a la base', () => {
  it('las cuatro columnas, con los textos recortados', () => {
    expect(photoDataColumns({ ...saved, credit: '  Ana Ruiz  ', origin: ' x ' })).toEqual({
      shot_type: 'GENERAL',
      provenance: 'OWN',
      photo_credit: 'Ana Ruiz',
      provenance_source: 'x',
    })
  })
})

describe('las secciones del panel', () => {
  it('queda una: lo único que se escribe', () => {
    // The panel had nine things stacked with not a single title, then three blocks,
    // and now one. Rotating and cropping, the cover, the order and removing act on the
    // shot being looked at, so they are icons over the photograph itself.
    expect(Object.values(PHOTO_SECTIONS)).toEqual(['Qué es esta toma'])
  })
})
