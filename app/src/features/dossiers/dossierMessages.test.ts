import { describe, expect, it } from 'vitest'
import {
  dossierFailureText,
  dossierWriteResult,
  removeItemConfirmText,
  retireDossierConfirmText,
} from './dossierMessages'

/**
 * RF-1600: lo que las pantallas del dossier dicen cuando la base dice no.
 *
 * Los códigos y los nombres de restricción de este fichero se provocaron uno a uno
 * contra el esquema —las mismas migraciones, aplicadas en una base local, con el
 * insert que falla escrito a mano— y se copiaron literalmente. Los mensajes de
 * abajo son los de esa medición, así que un cambio de nombre en una restricción
 * rompe este fichero, que es exactamente lo que tiene que pasar.
 */

describe('las seis restricciones, cada una en las palabras de su consecuencia', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['dossiers_title_not_blank', 'encontrar el dossier'],
    ['dossier_items_price_positive', 'Cero no es un precio'],
    ['dossier_items_currency_shape', 'tres letras'],
    ['dossier_items_artwork_shape', 'texto libre'],
    ['dossier_items_text_shape', 'rótulo'],
    ['dossier_items_biography_shape', 'ficha del fondo'],
  ]

  for (const [constraint, expected] of cases) {
    it(constraint, () => {
      const text = dossierFailureText(
        {
          code: '23514',
          message: `new row for relation "x" violates check constraint "${constraint}"`,
        },
        'save',
      )
      expect(text).toContain(expected)
      // Y nunca el nombre de la restricción: quien cataloga no lo ha visto nunca.
      expect(text).not.toContain(constraint)
    })
  }
})

describe('lo que dicen los demás códigos', () => {
  it('la obra repetida manda a buscarla en la lista, no a repetir el intento', () => {
    const text = dossierFailureText(
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "dossier_items_unique"',
      },
      'addArtwork',
    )
    expect(text).toContain('ya está en el dossier')
  })

  it('cada clave ajena rota dice qué se ha ido, porque la consecuencia no es la misma', () => {
    const fk = (name: string) =>
      dossierFailureText(
        { code: '23503', message: `violates foreign key constraint "${name}"` },
        'save',
      )
    expect(fk('dossier_items_catalog_id_fkey')).toContain('obra')
    expect(fk('dossier_items_image_id_fkey')).toContain('fotografía')
    expect(fk('dossiers_recipient_party_id_fkey')).toContain('destinatario')
  })

  it('lo que escribe un trigger se pasa tal cual, con su pista pegada', () => {
    // Ya está en español y vive al lado de la regla: reescribirlo aquí sería una
    // segunda copia que se desincroniza. Son las dos frases que más importan —«la
    // fotografía no es de la obra» y «este dossier ya lleva la biografía».
    const text = dossierFailureText(
      {
        code: 'P0001',
        message: 'La fotografía AR-0001_v99 no es de la obra AR-0001',
        hint: 'Elige una fotografía de esa obra.',
      },
      'editItem',
    )
    expect(text).toBe('La fotografía AR-0001_v99 no es de la obra AR-0001. Elige una fotografía de esa obra.')
  })

  it('sin pista no se inventa un punto de más', () => {
    const text = dossierFailureText({ code: 'P0001', message: 'Ya lleva esa biografía' }, 'addBiography')
    expect(text).toBe('Ya lleva esa biografía')
  })

  it('el lector que intenta escribir lee qué puede hacer, no «forbidden»', () => {
    const text = dossierFailureText(
      { code: '42501', message: 'new row violates row-level security policy' },
      'save',
    )
    expect(text).toContain('Catalogador')
  })

  it('un dossier que no existe no se lee como una avería del catálogo', () => {
    expect(
      dossierFailureText({ code: 'PGRST116', message: 'no rows returned' }, 'loadOne'),
    ).toBe('Ese dossier no está en el catálogo.')
  })

  it('sin conexión se dice que el cambio no ha salido, que es la mitad que el navegador no dice', () => {
    const text = dossierFailureText({ message: 'Failed to fetch' }, 'reorder')
    expect(text).toContain('conexión')
    expect(text).toContain('No se ha podido cambiar el orden')
  })

  it('un fallo inesperado conserva lo que dijo la base', () => {
    // Esconderlo es dejar un fallo que nadie puede diagnosticar.
    const text = dossierFailureText({ code: 'XX000', message: 'algo muy raro' }, 'addText')
    expect(text).toContain('algo muy raro')
    expect(text).toContain('No se ha podido añadir el texto')
  })
})

describe('una escritura que no ha tocado nada no es un éxito', () => {
  it('cero filas se cuenta como fallo, aunque la base no diera error', () => {
    // Medido en este proyecto: PostgREST contesta 200 y `[]` a un PATCH sobre un
    // identificador que no está. Fiarse de «no hay error» haría que la pantalla
    // dijera que se guardó.
    expect(dossierWriteResult('save', { rows: 0 })).toContain('No se ha tocado nada')
  })

  it('sin contar filas y sin error, es un éxito', () => {
    expect(dossierWriteResult('reorder', {})).toBeNull()
  })

  it('con error manda el error', () => {
    expect(dossierWriteResult('save', { failure: { code: 'PGRST116', message: 'x' } })).toContain(
      'no está en el catálogo',
    )
  })
})

describe('las confirmaciones dicen qué pasa de verdad (RF-1612)', () => {
  it('una obra vuelve con su nota y su precio, y eso quita el miedo a ordenar', () => {
    expect(removeItemConfirmText('ARTWORK', 'Figura sentada')).toContain('vuelve con su nota')
  })

  it('un texto NO vuelve, y se dice antes del toque y no después', () => {
    const text = removeItemConfirmText('TEXT', 'Óleos')
    expect(text).toContain('no se puede recuperar')
    expect(text).not.toContain('vuelve con su nota')
  })

  it('la biografía sigue en la ficha del fondo', () => {
    expect(removeItemConfirmText('BIOGRAPHY', '')).toContain('ficha del fondo')
  })

  it('retirar el dossier cuenta lo que lleva y tranquiliza sobre lo ya emitido', () => {
    const text = retireDossierConfirmText('Selección para galería', '12 obras · 1 texto')
    expect(text).toContain('«Selección para galería»')
    expect(text).toContain('12 obras · 1 texto')
    expect(text).toContain('no se tocan')
  })
})
