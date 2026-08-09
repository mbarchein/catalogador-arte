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
 * Los datos de una toma como formulario (RF-417, RF-405).
 *
 * Antes cada control guardaba por su cuenta: los chips al tocarlos y el texto al
 * salir del campo. Lo segundo es medio invisible en un móvil —se toca fuera y no
 * se sabe si entró— y convivían dos formas de guardar en el mismo bloque. Lo que
 * se fija aquí es lo que hace que un «Guardar» sirva: que sepa cuándo hay algo
 * pendiente, y que cambiar de procedencia sin guardar no se lleve por delante lo
 * escrito.
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
    // Es la razón de que el borrador lleve LOS DOS textos y no solo el que se
    // enseña: con uno, marcar «tomada de otro catálogo» y arrepentirse borraría
    // lo escrito sin que nadie lo pidiera.
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
    // Sin recortar al comparar, abrir el campo y cerrarlo dejaría el botón
    // encendido para siempre y el aviso de pendiente puesto sin nada pendiente.
    expect(photoDataDirty({ ...saved, credit: '  Ana Ruiz  ' }, saved)).toBe(false)
  })

  it('cambiar el tipo de toma, la procedencia o el texto, sí', () => {
    expect(photoDataDirty({ ...saved, shotType: 'BACK' }, saved)).toBe(true)
    expect(photoDataDirty({ ...saved, provenance: 'THIRD_PARTY' }, saved)).toBe(true)
    expect(photoDataDirty({ ...saved, credit: 'Otra persona' }, saved)).toBe(true)
  })

  it('y un cambio en el texto que NO se está enseñando cuenta igual', () => {
    // Se escribió el origen, se volvió a «propia» y no se guardó: sigue habiendo
    // algo pendiente aunque en pantalla no se vea.
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
  it('son cuatro y se leen en orden', () => {
    // El panel tenía nueve cosas apiladas sin un solo título. Los nombres viven
    // aquí para que la pantalla no pueda tener dos redacciones del mismo bloque.
    expect(Object.values(PHOTO_SECTIONS)).toEqual([
      'Qué es esta toma',
      'La imagen',
      'Orden y portada',
      'Retirar',
    ])
  })
})
