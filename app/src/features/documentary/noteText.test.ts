import { describe, expect, it } from 'vitest'
import { noteSegments, shortLinkText, NOTE_LINK_MAX } from './noteText'

/**
 * Las direcciones dentro de una nota (RF-1408).
 *
 * Una dirección no tiene espacios: es una sola palabra de ochenta caracteres, y
 * en la columna de una lista de campos el navegador la saca fuera de la pantalla
 * en vez de partirla. Aquí se fija el acortado, y sobre todo **lo que no se
 * acorta**: el dominio entero. Enseñar un trozo que se lea como otro sitio del
 * que de verdad es sería suplantación, la misma que la lista blanca de la base
 * existe para cerrar.
 */

const REAL =
  'https://www.macvac.es/obra/saliente-en-el-espacio/'

describe('cómo se lee una dirección', () => {
  it('sin el protocolo ni el «www», que no dicen nada y ocupan', () => {
    expect(shortLinkText('https://www.macvac.es/obra')).toBe('macvac.es/obra')
  })

  it('y se corta por el final cuando no cabe', () => {
    const said = shortLinkText(REAL)
    expect(said.length).toBeLessThanOrEqual(NOTE_LINK_MAX)
    expect(said.startsWith('macvac.es/obra/')).toBe(true)
    expect(said.endsWith('…')).toBe(true)
  })

  it('el dominio NUNCA se recorta', () => {
    // Es la parte que contesta «¿de quién es esto?». Recortarla es lo que
    // convierte un acortado en una suplantación.
    const said = shortLinkText('https://www.macvac.es/' + 'x'.repeat(200), 12)
    expect(said.startsWith('macvac.es')).toBe(true)
  })

  it('una dirección que no se reconoce se enseña entera', () => {
    // Larga y fea, pero verdadera. Cortar «https://macvac.es@evil.example/x»
    // dejaría a la vista un principio que se lee como del MACVA y no lo es.
    const trampa = 'https://www.macvac.es@evil.example/obra/saliente-en-el-espacio/'
    expect(shortLinkText(trampa)).toBe(trampa)
  })

  it('lo que cabe se deja como está', () => {
    expect(shortLinkText('https://macvac.es/')).toBe('macvac.es/')
  })
})

describe('partir una nota', () => {
  it('la nota de verdad que se salía de la pantalla', () => {
    const nota =
      'Archivo en pdf al imprimir el contenido de la ficha de la obra RC-0005 que ofrece el ' +
      `enlace ${REAL} en la web del MACVA.`
    const parts = noteSegments(nota)
    const link = parts.find((p) => p.href !== null)

    expect(link?.href).toBe(REAL)
    expect(link?.text.length).toBeLessThanOrEqual(NOTE_LINK_MAX)
    // El texto de alrededor no se toca ni se pierde.
    expect(parts.map((p) => p.text).join('')).toContain('en la web del MACVA.')
    expect(parts.map((p) => p.text).join('')).toContain('la ficha de la obra RC-0005')
  })

  it('sin ninguna dirección es un solo trozo de texto', () => {
    const parts = noteSegments('Una nota corriente.')
    expect(parts).toEqual([{ text: 'Una nota corriente.', href: null }])
  })

  it('el punto que cierra la frase no se lleva al enlace', () => {
    // «Véase https://macvac.es/obra.» acaba en punto, y el punto es de la frase:
    // metido en el enlace, llevaría a una dirección que nadie escribió.
    const parts = noteSegments('Véase https://macvac.es/obra.')
    const link = parts.find((p) => p.href !== null)
    expect(link?.href).toBe('https://macvac.es/obra')
    expect(parts[parts.length - 1]).toEqual({ text: '.', href: null })
  })

  it('con dos direcciones salen las dos, en orden', () => {
    const parts = noteSegments('Antes https://uno.example/a y después https://dos.example/b final')
    const links = parts.filter((p) => p.href !== null)
    expect(links.map((l) => l.href)).toEqual(['https://uno.example/a', 'https://dos.example/b'])
    expect(parts.map((p) => p.text).join('')).toContain('y después')
    expect(parts.map((p) => p.text).join('')).toContain('final')
  })

  it('una nota vacía no produce nada que pintar', () => {
    expect(noteSegments('')).toEqual([])
  })
})
