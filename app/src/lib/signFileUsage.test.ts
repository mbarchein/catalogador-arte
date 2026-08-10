import { describe, expect, it } from 'vitest'
import { usagePage, MAX_USAGE_PAGES } from '../../../supabase/functions/sign-file/usage'

/**
 * Reading the store's listing (RF-1202).
 *
 * It is covered from here because in the Edge function there is no way of running tests, and
 * this module was written without Deno precisely for that — same as `multipart.ts`.
 *
 * What is pinned down is the only thing that can fail in silence: undercounting, and taking
 * as finished a listing that continues. Both produce a believable figure that is
 * smaller than the real one, on the screen that serves to avoid running out of room.
 */

const page = (rows: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<ListVersionsResult>${rows}${extra}</ListVersionsResult>`

const version = (size: number) => `<Version><Key>obras/x.tif</Key><Size>${size}</Size></Version>`

describe('sumar un tramo del listado', () => {
  it('suma los tamaños y cuenta los ficheros', () => {
    const result = usagePage(page(version(1_000) + version(2_500)))

    expect(result.bytes).toBe(3_500)
    expect(result.objects).toBe(2)
  })

  it('un listado vacío es cero y no un fallo', () => {
    // A freshly created bucket. Zero is the right answer, and treating it as an
    // error would leave the screen with no figure on the first day.
    const result = usagePage(page(''))

    expect(result.bytes).toBe(0)
    expect(result.objects).toBe(0)
    expect(result.next).toBeNull()
  })

  it('cuenta TODAS las versiones, que es por lo que se paga', () => {
    // The bucket keeps the previous ones on purpose (infra/b2.tf). Counting only the
    // current one would say less than the store bills for.
    const result = usagePage(page(version(4_000_000) + version(3_900_000) + version(3_800_000)))

    expect(result.bytes).toBe(11_700_000)
    expect(result.objects).toBe(3)
  })

  it('las marcas de borrado no suman: no ocupan', () => {
    const withDeleteMarker = page(
      version(1_000) + '<DeleteMarker><Key>obras/y.tif</Key></DeleteMarker>',
    )

    expect(usagePage(withDeleteMarker).bytes).toBe(1_000)
    expect(usagePage(withDeleteMarker).objects).toBe(1)
  })
})

describe('por dónde sigue el listado', () => {
  it('un tramo truncado trae los dos marcadores del siguiente', () => {
    const result = usagePage(
      page(
        version(10),
        '<IsTruncated>true</IsTruncated>' +
          '<NextKeyMarker>obras/AR-0500_v1.tif</NextKeyMarker>' +
          '<NextVersionIdMarker>4_z8a</NextVersionIdMarker>',
      ),
    )

    expect(result.next).toEqual({
      keyMarker: 'obras/AR-0500_v1.tif',
      versionIdMarker: '4_z8a',
    })
  })

  it('sin truncar no hay siguiente, aunque vengan marcadores', () => {
    const result = usagePage(
      page(
        version(10),
        '<IsTruncated>false</IsTruncated><NextKeyMarker>x</NextKeyMarker>' +
          '<NextVersionIdMarker>y</NextVersionIdMarker>',
      ),
    )

    expect(result.next).toBeNull()
  })

  it('truncado pero sin marcador se da por terminado', () => {
    // It is the defence against the infinite loop: with no marker, the next stretch
    // would be the same one, and the same, and the same.
    const result = usagePage(page(version(10), '<IsTruncated>true</IsTruncated>'))

    expect(result.next).toBeNull()
  })
})

describe('el tope de tramos', () => {
  it('está por encima de lo que este catálogo puede tener, y existe', () => {
    // A thousand objects per stretch. A loop paginating against a remote service with no
    // cap is a loop that one day does not finish.
    expect(MAX_USAGE_PAGES).toBeGreaterThanOrEqual(100)
    expect(Number.isFinite(MAX_USAGE_PAGES)).toBe(true)
  })
})
