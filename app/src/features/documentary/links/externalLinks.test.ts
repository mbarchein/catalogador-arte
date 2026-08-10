import { describe, expect, it } from 'vitest'
import {
  EMPTY_TEXT,
  STALE_DAYS,
  agoText,
  checkBadge,
  daysSince,
  groupLinks,
  linkCountText,
  linkDestination,
  linkDomain,
  linkLabel,
  linkTypeText,
  missingSourceNotice,
  photoNotice,
  photoTitle,
  reproductionsWithoutSource,
  retiredNotice,
  sortLinks,
  type ExternalLinkRow,
  type PhotoRef,
} from './externalLinks'

/**
 * RF-1401 a RF-1408: un enlace es un dato propio que se pulsa, y lo que decide
 * esta mitad del bloque es **qué se lee antes de pulsarlo**.
 *
 * Dos cosas de aquí son de seguridad y no de estética, y por eso llevan sus casos
 * uno a uno:
 *
 *  · El DOMINIO que se enseña tiene que ser el trozo de la dirección que la base
 *    validó. Si la pantalla enseñara como dominio otra cosa, estaría afirmando un
 *    destino que no es el destino, que es justo la suplantación que la lista
 *    blanca de `is_web_url` existe para cerrar.
 *  · «Sin comprobar» NO es «roto» (RF-1405). Es el estado en el que nace todo
 *    enlace, y confundirlos convierte el aviso del que sí está roto en ruido.
 */

// ── Fixtures ─────────────────────────────────────────────────

function link(over: Partial<ExternalLinkRow> = {}): ExternalLinkRow {
  return {
    id: 'link-1',
    artwork_id: 'RC-0005',
    image_id: null,
    url: 'https://www.macvac.es/obra/saliente-en-el-espacio/',
    title: 'Ficha en el MACVA',
    link_type: 'MUSEUM_PAGE',
    note: '',
    archive_url: null,
    check_status: null,
    checked_at: null,
    checked_by: null,
    active: true,
    created_at: '2026-08-05T10:00:00Z',
    ...over,
  }
}

function photo(over: Partial<PhotoRef> = {}): PhotoRef {
  return {
    image_id: 'RC-0005_v1',
    shot_type: 'GENERAL',
    sort_order: 1,
    provenance: 'OWN',
    active: true,
    ...over,
  }
}

const NOW = new Date('2026-08-05T12:00:00Z')

// ── The destination seen before touching ─────────────────────

describe('linkDomain · RF-1408: el dominio dice a dónde lleva', () => {
  it('saca el nombre del sitio y le quita el www', () => {
    expect(linkDomain('https://www.macvac.es/obra/saliente-en-el-espacio/')).toBe('macvac.es')
  })

  it('conserva el subdominio, que sí dice a dónde va', () => {
    expect(linkDomain('https://coleccion.museoreinasofia.es/obra/1234')).toBe(
      'coleccion.museoreinasofia.es',
    )
  })

  it('conserva el puerto', () => {
    expect(linkDomain('http://archivo.ejemplo.es:8080/ficha')).toBe('archivo.ejemplo.es:8080')
  })

  it('no se queda con lo que hay detrás de la primera barra, ni de ? ni de #', () => {
    expect(linkDomain('https://ejemplo.es/macvac.es/obra')).toBe('ejemplo.es')
    expect(linkDomain('https://ejemplo.es?x=macvac.es')).toBe('ejemplo.es')
    expect(linkDomain('https://ejemplo.es#macvac.es')).toBe('ejemplo.es')
  })

  it('NO enseña un dominio cuando la autoridad no es un nombre de sitio llano', () => {
    // Credentials before the host: it reads as MACVA's and goes somewhere else.
    expect(linkDomain('https://www.macvac.es@evil.example/obra')).toBe('')
    // The backslash, which the browser treats as a slash.
    expect(linkDomain('https://evil.example\\.ejemplo.es/')).toBe('')
    // Zero width inside the site's name.
    expect(linkDomain('https://macvac\u200b.es/')).toBe('')
    // Direcciones IP y localhost.
    expect(linkDomain('https://192.168.1.7/obra')).toBe('')
    expect(linkDomain('https://[::1]/obra')).toBe('')
    expect(linkDomain('http://localhost:5173/obra')).toBe('')
  })

  it('no reconoce esquemas que la base no admite', () => {
    expect(linkDomain('javascript:alert(1)')).toBe('')
    expect(linkDomain('//evil.example')).toBe('')
    expect(linkDomain('data:text/html,<b>x')).toBe('')
  })
})

describe('linkLabel y linkDestination · nunca un hueco (RF-304, RF-1408)', () => {
  it('el título manda cuando lo hay, y debajo se ve el dominio', () => {
    const row = link()
    expect(linkLabel(row)).toBe('Ficha en el MACVA')
    expect(linkDestination(row)).toBe('macvac.es')
  })

  it('sin título se llama por el dominio, y entonces no se repite debajo', () => {
    const row = link({ title: '' })
    expect(linkLabel(row)).toBe('macvac.es')
    expect(linkDestination(row)).toBeNull()
  })

  it('un título de solo espacios cuenta como ausente', () => {
    expect(linkLabel(link({ title: '   ' }))).toBe('macvac.es')
  })

  it('cuando no se reconoce el dominio se enseña la dirección entera y no un hueco', () => {
    const raro = link({ title: '', url: 'https://www.macvac.es@evil.example/obra' })
    expect(linkLabel(raro)).toBe('https://www.macvac.es@evil.example/obra')
    expect(linkDestination(raro)).toBeNull()
  })
})

describe('linkTypeText · RF-1402: «sin clasificar» no es «no encaja»', () => {
  it('nulo es «Sin clasificar» y OTHER es «Otro», y no son lo mismo', () => {
    expect(linkTypeText(null)).toBe('Sin clasificar')
    expect(linkTypeText('OTHER')).toBe('Otro')
    expect(linkTypeText(null)).not.toBe(linkTypeText('OTHER'))
  })

  it('el origen de una reproducción tiene su propia clase (RF-1407)', () => {
    expect(linkTypeText('PHOTO_SOURCE')).toBe('Origen de la fotografía')
  })
})

// ── The count and the empty case ────────────────────────────

describe('linkCountText · nunca un cero pelado', () => {
  it('cuenta en singular y en plural', () => {
    expect(linkCountText(1)).toBe('1 enlace')
    expect(linkCountText(3)).toBe('3 enlaces')
  })

  it('el vacío es una frase, no «0 enlaces»', () => {
    expect(linkCountText(0)).toBe('Ninguno registrado')
    expect(linkCountText(0)).not.toContain('0')
  })
})

describe('EMPTY_TEXT · el bloque sin estado de investigación lo dice', () => {
  it('no insinúa que no haya nada que enlazar', () => {
    expect(EMPTY_TEXT).toContain('no lleva estado de investigación')
    expect(EMPTY_TEXT).toContain('no')
  })
})

// ── The check done by hand ──────────────────────────────────

describe('agoText y daysSince', () => {
  it('cuenta los días enteros que han pasado', () => {
    expect(daysSince('2026-08-05T10:00:00Z', NOW)).toBe(0)
    expect(daysSince('2026-08-01T10:00:00Z', NOW)).toBe(4)
    expect(daysSince(null, NOW)).toBeNull()
    expect(daysSince('no es una fecha', NOW)).toBeNull()
  })

  it('lo dice como se dice en español', () => {
    expect(agoText(0)).toBe('hoy')
    expect(agoText(1)).toBe('ayer')
    expect(agoText(3)).toBe('hace 3 días')
    expect(agoText(30)).toBe('hace un mes')
    expect(agoText(90)).toBe('hace 3 meses')
    expect(agoText(400)).toBe('hace más de un año')
    expect(agoText(900)).toBe('hace más de 2 años')
  })
})

describe('checkBadge · RF-1405: cuatro estados y el cuarto es la ausencia', () => {
  it('sin comprobar NO es roto, y lo dice con palabras', () => {
    const badge = checkBadge(link(), NOW)
    expect(badge.label).toBe('Sin comprobar')
    expect(badge.tone).toBe('unchecked')
    expect(badge.tone).not.toBe('broken')
    expect(badge.detail).toContain('no es roto')
  })

  it('los tres resultados llevan su tono, y «ha cambiado» no es «ya no está»', () => {
    const at = '2026-08-04T10:00:00Z'
    expect(checkBadge({ check_status: 'WORKING', checked_at: at }, NOW)).toMatchObject({
      label: 'Funciona',
      tone: 'working',
      stale: false,
    })
    expect(checkBadge({ check_status: 'CHANGED', checked_at: at }, NOW)).toMatchObject({
      label: 'Ha cambiado',
      tone: 'changed',
    })
    expect(checkBadge({ check_status: 'BROKEN', checked_at: at }, NOW)).toMatchObject({
      label: 'Ya no está',
      tone: 'broken',
    })
  })

  it('dice cuándo se comprobó', () => {
    const badge = checkBadge({ check_status: 'WORKING', checked_at: '2026-08-04T10:00:00Z' }, NOW)
    expect(badge.detail).toBe('Comprobado ayer.')
  })

  it('un «funciona» de hace más de un año se envejece sin dejar de ser un «funciona»', () => {
    const old = new Date(NOW.getTime() - (STALE_DAYS + 5) * 86_400_000).toISOString()
    const badge = checkBadge({ check_status: 'WORKING', checked_at: old }, NOW)
    expect(badge.stale).toBe(true)
    expect(badge.label).toBe('Funciona')
    expect(badge.tone).toBe('working')
    expect(badge.detail).toContain('sigue constando que funciona')
  })

  it('un «ya no está» viejo no se envejece: sigue roto hasta que alguien mire', () => {
    const old = new Date(NOW.getTime() - (STALE_DAYS + 5) * 86_400_000).toISOString()
    expect(checkBadge({ check_status: 'BROKEN', checked_at: old }, NOW).stale).toBe(false)
  })

  it('una fecha ilegible se dice en vez de callarse', () => {
    const badge = checkBadge({ check_status: 'WORKING', checked_at: 'x' }, NOW)
    expect(badge.detail).toContain('no se ha podido leer')
  })
})

describe('retiredNotice · RF-1406: se retira, no se borra', () => {
  it('un enlace activo no lleva aviso y uno retirado sí', () => {
    expect(retiredNotice({ active: true })).toBeNull()
    expect(retiredNotice({ active: false })).toContain('Retirado')
  })
})

// ── The order and the groups ────────────────────────────────

describe('sortLinks · lo vigente primero, luego por tipo y por alta', () => {
  it('lo retirado va al final aunque su tipo mande', () => {
    const rows = [
      link({ id: 'retirado', link_type: 'MUSEUM_PAGE', active: false }),
      link({ id: 'prensa', link_type: 'PRESS' }),
    ]
    expect(sortLinks(rows).map((r) => r.id)).toEqual(['prensa', 'retirado'])
  })

  it('el orden de los tipos es el del enumerado y «sin clasificar» cierra', () => {
    const rows = [
      link({ id: 'sin-clase', link_type: null }),
      link({ id: 'otro', link_type: 'OTHER' }),
      link({ id: 'prensa', link_type: 'PRESS' }),
      link({ id: 'museo', link_type: 'MUSEUM_PAGE' }),
    ]
    expect(sortLinks(rows).map((r) => r.id)).toEqual(['museo', 'prensa', 'otro', 'sin-clase'])
  })

  it('dentro de un tipo manda la fecha de alta, y un empate lo rompe la dirección', () => {
    const rows = [
      link({ id: 'nuevo', created_at: '2026-08-06T10:00:00Z' }),
      link({ id: 'viejo', created_at: '2026-08-01T10:00:00Z' }),
      link({ id: 'empate-z', created_at: '2026-08-01T10:00:00Z', url: 'https://z.ejemplo.es/' }),
    ]
    // The exact date tie really happens: the two rows the notes migration moved
    // share the same `now()`.
    expect(sortLinks(rows).map((r) => r.id)).toEqual(['viejo', 'empate-z', 'nuevo'])
  })

  it('no toca la lista que recibe', () => {
    const rows = [link({ id: 'b', link_type: 'PRESS' }), link({ id: 'a' })]
    sortLinks(rows)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('photoTitle y photoNotice · una toma se nombra por su sitio en la galería', () => {
  it('el número es el de la galería y no el del fichero', () => {
    expect(photoTitle(photo({ image_id: 'RC-0004_v7', sort_order: 7, shot_type: 'BACK' }))).toBe(
      'Foto 7 · Reverso',
    )
  })

  it('avisa de la toma retirada y de la que no es propia', () => {
    expect(photoNotice(photo())).toBeNull()
    expect(photoNotice(photo({ provenance: 'OTHER_CATALOG' }))).toBe('Tomada de otro catálogo')
    expect(photoNotice(photo({ active: false, provenance: 'THIRD_PARTY' }))).toBe(
      'Fotografía retirada de la ficha · Recibida de un tercero',
    )
  })
})

describe('groupLinks · el arco exclusivo, repartido en pantalla (RF-1401)', () => {
  const own = link({ id: 'de-la-obra' })
  const ofPhoto = link({
    id: 'de-la-foto',
    artwork_id: null,
    image_id: 'RC-0005_v1',
    link_type: 'PHOTO_SOURCE',
  })

  it('separa los de la obra de los de sus fotografías', () => {
    const groups = groupLinks([own, ofPhoto], [photo()])
    expect(groups.artwork.map((r) => r.id)).toEqual(['de-la-obra'])
    expect(groups.photos).toHaveLength(1)
    expect(groups.photos[0]).toMatchObject({ imageId: 'RC-0005_v1', title: 'Foto 1 · General' })
    expect(groups.photos[0]?.links.map((r) => r.id)).toEqual(['de-la-foto'])
  })

  it('los grupos van en el orden de la galería', () => {
    const groups = groupLinks(
      [
        link({ id: 'a', artwork_id: null, image_id: 'RC-0005_v3' }),
        link({ id: 'b', artwork_id: null, image_id: 'RC-0005_v1' }),
      ],
      [photo({ image_id: 'RC-0005_v3', sort_order: 3 }), photo()],
    )
    expect(groups.photos.map((g) => g.imageId)).toEqual(['RC-0005_v1', 'RC-0005_v3'])
  })

  it('una fotografía que no se ha podido leer NO pierde su enlace', () => {
    const groups = groupLinks(
      [link({ id: 'huerfano', artwork_id: null, image_id: 'RC-0005_v9' })],
      [photo()],
    )
    expect(groups.photos).toHaveLength(1)
    expect(groups.photos[0]?.title).toBe('RC-0005_v9')
    expect(groups.photos[0]?.notice).toContain('identificador de la toma')
  })

  it('el recuento de la cabecera son solo los activos', () => {
    const groups = groupLinks([own, ofPhoto, link({ id: 'fuera', active: false })], [photo()])
    expect(groups.activeCount).toBe(2)
  })

  it('una ficha sin enlaces devuelve los tres grupos vacíos y no rompe', () => {
    expect(groupLinks([], [photo()])).toEqual({ artwork: [], photos: [], activeCount: 0 })
  })
})

// ── The pair that closes RF-1407 ────────────────────────────

describe('reproductionsWithoutSource · una reproducción dice de dónde salió', () => {
  const source = link({
    id: 'origen',
    artwork_id: null,
    image_id: 'RC-0005_v1',
    link_type: 'PHOTO_SOURCE',
  })

  it('una toma propia nunca falta: no tiene origen que declarar', () => {
    expect(reproductionsWithoutSource([photo()], [])).toEqual([])
  })

  it('una reproducción sin enlace de origen es la que falta', () => {
    const repro = photo({ provenance: 'OTHER_CATALOG' })
    expect(reproductionsWithoutSource([repro], []).map((p) => p.image_id)).toEqual(['RC-0005_v1'])
  })

  it('con su enlace de origen deja de faltar', () => {
    const repro = photo({ provenance: 'OTHER_CATALOG' })
    expect(reproductionsWithoutSource([repro], [source])).toEqual([])
  })

  it('un enlace de origen RETIRADO no documenta nada', () => {
    const repro = photo({ provenance: 'OTHER_CATALOG' })
    expect(reproductionsWithoutSource([repro], [{ ...source, active: false }])).toHaveLength(1)
  })

  it('un enlace de otra clase en la misma foto no cuenta como origen', () => {
    const repro = photo({ provenance: 'OTHER_CATALOG' })
    const otro = { ...source, link_type: 'PRESS' as const }
    expect(reproductionsWithoutSource([repro], [otro])).toHaveLength(1)
  })

  it('el aviso nombra cada toma, porque lo que sigue es abrirla', () => {
    const dos = [
      photo({ image_id: 'RC-0005_v1', provenance: 'OTHER_CATALOG' }),
      photo({ image_id: 'RC-0005_v2', sort_order: 2, shot_type: 'BACK', provenance: 'THIRD_PARTY' }),
    ]
    const notice = missingSourceNotice(reproductionsWithoutSource(dos, []))
    expect(notice).toContain('Foto 1 · General')
    expect(notice).toContain('Foto 2 · Reverso')
    expect(notice).toContain('no dicen')
  })

  it('en singular se lee en singular', () => {
    const notice = missingSourceNotice([photo({ provenance: 'OTHER_CATALOG' })])
    expect(notice).toContain('Esta reproducción no dice')
    expect(notice).toContain('salió')
  })

  it('sin ninguna reproducción pendiente no hay aviso que dar', () => {
    expect(missingSourceNotice([])).toBeNull()
  })
})
