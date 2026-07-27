import { describe, expect, it } from 'vitest'
import { generateRecordPdf, recordLines, printableText, recordUrl } from './recordPdf'
import type { Artwork } from './types'

const ARTWORK: Artwork = {
  catalog_id: 'TS-0001',
  artist: 'TEST',
  title: 'Bodegón de ensayo',
  attributed_title: 'YES',
  artwork_type: 'Pintura',
  execution_date: 'c. 1980',
  start_year: 1980,
  end_year: null,
  approximate_date: true,
  unconfirmed_date: false,
  date_note: '',
  technique: 'Óleo',
  support: '',
  height_cm: 50,
  width_cm: 40,
  depth_cm: null,
  signed: 'YES',
  signature_description: 'ángulo inferior derecho',
  dated_on_artwork: 'NO',
  conservation_status: 'GOOD',
  physical_location: 'Almacén, estantería 3',
  existence_status: 'PRESERVED',
  photographed: false,
  measurements_verified: false,
  inventory_phase_completed: false,
  documentation_phase_completed: false,
  catalog_record_complete: false,
  inventory_process_notes: '',
  updated_at: '2026-07-27T00:00:00Z',
  basic_updated_at: null,
  updated_by: null,
  active: true,
}

// RF-202: the identifier is the physical label glued to the artwork; the
// printable record carries it large and the QR opens the living record.
describe('recordUrl', () => {
  it('composes the record URL from the given origin', () => {
    expect(recordUrl('TS-0001', 'https://catalogo.example')).toBe(
      'https://catalogo.example/obra/TS-0001',
    )
  })

  it('tolerates the trailing slash of the origin without duplicating it', () => {
    expect(recordUrl('AR-0002', 'https://catalogo.example/')).toBe(
      'https://catalogo.example/obra/AR-0002',
    )
  })
})

describe('printableText', () => {
  it('keeps Spanish and WinAnsi typographic punctuation', () => {
    const text = 'Ñandú — «óleo», 50 × 40 cm… ¿seguro?'
    expect(printableText(text)).toBe(text)
  })

  it('replaces with "?" what Helvetica cannot print', () => {
    expect(printableText('flecha → y emoji 🎨')).toBe('flecha ? y emoji ??')
  })
})

describe('recordLines', () => {
  const lines = recordLines(ARTWORK)
  const valueOf = (label: string) => lines.find((l) => l.label === label)?.value

  it('translates the codes to the interface labels', () => {
    expect(valueOf('Fondo')).toBe('Pruebas')
    expect(valueOf('Conservación')).toBe('Bueno')
  })

  it('describes the signature when there is a description', () => {
    expect(valueOf('Firmada')).toBe('Sí, ángulo inferior derecho')
  })

  it('never leaves a gap: the empty datum is declared', () => {
    expect(valueOf('Soporte')).toBe('Sin indicar')
  })
})

describe('generateRecordPdf', () => {
  it('produces a real A5 PDF, with the QR embedded', async () => {
    const blob = await generateRecordPdf(ARTWORK, 'https://catalogo.example')
    expect(blob.type).toBe('application/pdf')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const header = String.fromCharCode(...bytes.slice(0, 5))
    expect(header).toBe('%PDF-')
    // With the QR (PNG) embedded, the record weighs quite a bit more than an
    // empty PDF.
    expect(bytes.length).toBeGreaterThan(4000)
  })
})
