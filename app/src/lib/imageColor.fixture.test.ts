/**
 * The shared case file: the one thing that keeps the browser and the Python batch
 * tool from ending up with two different colours for the same artwork (RF-421).
 *
 * There are, and there are going to be, **two implementations of the canonical
 * chain of `imageColor.ts`**: the one that draws the thumbnail and the derivative
 * in the phone, and the one that fills the queue of pending full-resolution copies
 * from a laptop (RF-420, RF-421, ADR-010). The way that divergence shows up is the
 * worst one available — the thumbnail and the print copy of the same photograph
 * come out with different colour, and that is discovered by looking at two images,
 * which is the same as not discovering it.
 *
 * So the two are tied together by data and not by good intentions: this test
 * **generates** `__fixtures__/color-luts.json`, with pairs of (colour parameters →
 * the three tables of 256 entries `buildColorLuts` produces for them), the file is
 * versioned in the repository, and the Python test
 * `scripts/copias-corregidas/test_corrected_copies.py` reads that same file and
 * demands its own tables be identical, entry by entry. Neither side re-derives the
 * criterion: TypeScript owns it, the file is what it says, and Python transcribes.
 *
 * **How it is regenerated.** Not automatically, and that is the point:
 *
 *     UPDATE_COLOR_CASES=1 npx vitest run src/lib/imageColor.fixture.test.ts
 *
 * (or `make casos-color`). Without that variable this test **fails** when the
 * file on disk stops matching what the code produces, and the failure is the whole
 * feature: a change in the chain of colour has to be a deliberate act with the
 * Python side regenerated and re-run, instead of a silent drift discovered a year
 * later in a print shop.
 *
 * **What travels in the file are the NORMALIZED parameters** — what
 * `normalizeColor` leaves, which is also what the row holds, down to the two
 * decimals of `numeric(3,2)`. Python does not reimplement `normalizeColor`: it
 * reads columns the database has already checked and applies the chain to them, so
 * feeding it raw values here would be asking it to verify something it does not do.
 * Clamping, quantizing and the reading of a corrupt value are verified in
 * `imageColor.test.ts`, which is where they belong.
 *
 * The luminance step travels too, as its own section, and for the same reason: it
 * is part of the colour of a photograph, it is NOT in the tables — it comes after
 * them, on the three channels at once — and a Rec. 709 luminance computed on the
 * codes instead of in linear light is exactly the kind of mistake that produces a
 * plausible grey and a different one.
 */

// Declared explicitly and not left to be dragged in by `vite.config.ts`: this is
// the only test that writes a file, so it is the only one that needs `node:fs` and
// `process`, and a type resolution that depends on which other file happens to be
// in the program is a typecheck that breaks for a reason nobody can see.
/// <reference types="node" />

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildColorLuts,
  grayFromRgb,
  normalizeColor,
  type ColorEdit,
  type ColorInput,
} from './imageColor'

/**
 * The part of a colour adjustment that decides pixels. The provenance —where the
 * grey was measured, which preset was chosen— changes nothing anybody can see and
 * has no business in a file about tables.
 */
type ColorLook = Pick<
  ColorEdit,
  | 'temperature'
  | 'tint'
  | 'exposure'
  | 'blackPoint'
  | 'whitePoint'
  | 'gamma'
  | 'shoulder'
  | 'gray'
>

interface ColorLutCase {
  /**
   * Identifies the case in the failure message of both suites. English and
   * hyphenated on purpose: it is read by a developer in a diff and by a Python
   * assertion, never by the cataloger.
   */
  name: string
  color: ColorLook
  luts: { r: number[]; g: number[]; b: number[] }
}

interface GrayCase {
  /** Codes AFTER the tables, which is where the luminance step reads them. */
  rgb: [number, number, number]
  gray: number
}

interface ColorLutFixture {
  /**
   * Bumped by hand when the SHAPE of this file changes, so a Python test that
   * expects another shape says so instead of reading nulls. It is not the version
   * of the tables: those change with the code and are compared entry by entry.
   */
  version: number
  generatedBy: string
  regenerateWith: string
  cases: ColorLutCase[]
  grayCases: GrayCase[]
}

const FIXTURE_VERSION = 1

/**
 * The cases, in a fixed order because the file is versioned and a reordering would
 * read as a change of the tables.
 *
 * The coverage is the one the specification asks for and it is not decorative:
 * every parameter alone at each end of its range —where the chain is at its most
 * extreme and where a rounding that goes the other way shows up first— plus
 * combinations that are the real ones, taken from the light presets and from what
 * the automatic proposes in a storeroom.
 */
const CASES: { name: string; color: Partial<ColorLook> }[] = [
  // The identity. If this one drifts, everything has drifted.
  { name: 'neutral', color: {} },

  // ── Each parameter alone, at both ends of its range ──
  { name: 'temperature-min', color: { temperature: -60 } },
  { name: 'temperature-max', color: { temperature: 60 } },
  { name: 'tint-min', color: { tint: -40 } },
  { name: 'tint-max', color: { tint: 40 } },
  { name: 'exposure-min', color: { exposure: -2 } },
  { name: 'exposure-max', color: { exposure: 2 } },
  // One notch of the strip, which lands on 0,17 through `numeric(3,2)`: the
  // smallest exposure that exists, and the one that proves both sides round the
  // stored two decimals the same way and not the sixth of a stop they came from.
  { name: 'exposure-one-notch', color: { exposure: 1 / 6 } },
  { name: 'black-point-min', color: { blackPoint: 0 } },
  { name: 'black-point-max', color: { blackPoint: 64 } },
  { name: 'white-point-min', color: { whitePoint: 192 } },
  { name: 'white-point-max', color: { whitePoint: 255 } },
  { name: 'gamma-min', color: { gamma: 0.6 } },
  { name: 'gamma-max', color: { gamma: 1.6 } },
  { name: 'shoulder-min', color: { shoulder: 0 } },
  { name: 'shoulder-max', color: { shoulder: 100 } },
  // The switch alone: the tables are the identity and the luminance step is on.
  // It is here to pin exactly that — that `gray` is NOT in the tables.
  { name: 'gray-only', color: { gray: true } },

  // ── Combinations, and they are the real ones ──
  // The bulb of the storeroom, which is what this whole feature exists for: the
  // incandescent preset plus the exposure the correction costs, because gains
  // normalized to 1 can only darken.
  { name: 'incandescent-preset-lifted', color: { temperature: -34, tint: -5, exposure: 0.5 } },
  // Cool fluorescent tubes with the olive cast, in black and white: the signature
  // detail of a label, which is the one case where `gray` is used.
  { name: 'fluorescent-cool-gray', color: { temperature: 12, tint: 10, gamma: 1.1, gray: true } },
  // What the automatic tends to propose on a photograph taken indoors: the two
  // points brought in and half a stop up.
  {
    name: 'auto-like-levels',
    color: { temperature: 8, tint: 3, exposure: 0.5, blackPoint: 12, whitePoint: 240 },
  },
  // A dark shot pushed hard, which is where the shoulder earns its place: without
  // it the varnish highlights would flatten into one white.
  { name: 'pushed-with-shoulder', color: { exposure: 1.5, shoulder: 60, blackPoint: 6, gamma: 1.25 } },
  // The two ends of the range at once, with the midtones at their darkest: the
  // corner of the chain where step 7 gets a negative value and the `max(0, …)`
  // is the difference between a table and a blank channel.
  {
    name: 'levels-crushed-dark-midtones',
    color: { blackPoint: 64, whitePoint: 192, gamma: 0.6 },
  },
  // Everything off its default at once, luminance included. Not a plausible
  // adjustment; it is the one case that would catch a step applied in the wrong
  // order, because with a single parameter moved most orders agree.
  {
    name: 'everything-at-once',
    color: {
      temperature: -22,
      tint: 7,
      exposure: -0.83,
      blackPoint: 9,
      whitePoint: 246,
      gamma: 1.35,
      shoulder: 25,
      gray: true,
    },
  },
]

/**
 * The codes the luminance step is checked on: the ends, mid grey, the three
 * primaries —where weighting the codes instead of the light is wrong by the most—
 * and a few ordinary ones from a photograph.
 */
const GRAY_SAMPLES: [number, number, number][] = [
  [0, 0, 0],
  [255, 255, 255],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [4, 4, 4],
  [4, 2, 1],
  [18, 52, 86],
  [200, 180, 160],
  [77, 77, 78],
  [250, 249, 200],
]

/** The look of an adjustment as it would be stored, which is what Python reads. */
function look(color: ColorInput): ColorLook {
  const c = normalizeColor(color)
  return {
    temperature: c.temperature,
    tint: c.tint,
    exposure: c.exposure,
    blackPoint: c.blackPoint,
    whitePoint: c.whitePoint,
    gamma: c.gamma,
    shoulder: c.shoulder,
    gray: c.gray,
  }
}

function buildFixture(): ColorLutFixture {
  return {
    version: FIXTURE_VERSION,
    generatedBy: 'app/src/lib/imageColor.fixture.test.ts',
    regenerateWith: 'make casos-color',
    cases: CASES.map(({ name, color }) => {
      const luts = buildColorLuts(color)
      return {
        name,
        color: look(color),
        luts: {
          r: Array.from(luts.r),
          g: Array.from(luts.g),
          b: Array.from(luts.b),
        },
      }
    }),
    grayCases: GRAY_SAMPLES.map((rgb) => ({ rgb, gray: grayFromRgb(rgb[0], rgb[1], rgb[2]) })),
  }
}

/**
 * The file as text, and the text is what gets compared.
 *
 * Indented so that the parameters of a case can be read in a diff, but with the
 * numeric arrays collapsed onto one line each: a 256-entry table exploded one
 * number per line turns 24 tables into twenty thousand lines of noise, and nobody
 * reads a table by eye anyway — that is what the Python test is for.
 *
 * The way there is a sentinel: `JSON.stringify` has no hook for «this array on one
 * line», so the replacer turns each numeric array into a marked string and the
 * marks are then unwrapped in the text. The marker cannot appear inside a JSON
 * number, so the substitution has nothing else to hit.
 */
const INLINE = '@@'

function serialize(fixture: ColorLutFixture): string {
  const text = JSON.stringify(
    fixture,
    (_key, value) =>
      Array.isArray(value) && value.every((entry) => typeof entry === 'number')
        ? `${INLINE}${value.join(', ')}${INLINE}`
        : value,
    2,
  ).replace(new RegExp(`"${INLINE}([^"]*)${INLINE}"`, 'g'), (_match, body: string) => `[${body}]`)
  // Trailing newline: it is a text file in a repository.
  return `${text}\n`
}

const FIXTURE_PATH = fileURLToPath(new URL('./__fixtures__/color-luts.json', import.meta.url))

/** Set to regenerate instead of failing. See the header of this file. */
const REGENERATE = process.env.UPDATE_COLOR_CASES === '1'

function write(text: string): void {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  writeFileSync(FIXTURE_PATH, text, 'utf8')
}

describe('el fichero de casos compartido con la herramienta local (RF-421)', () => {
  const expected = serialize(buildFixture())

  it('el fichero versionado dice exactamente lo que produce buildColorLuts hoy', () => {
    // Missing file: this test is what generates it, so it writes it. That happens
    // once, when the file is born; from then on the branch below is the one that
    // matters.
    if (!existsSync(FIXTURE_PATH)) {
      write(expected)
      return
    }
    if (REGENERATE) {
      write(expected)
      return
    }
    const actual = readFileSync(FIXTURE_PATH, 'utf8')
    // Not `toEqual` on the parsed object: the message of a failure has to say what
    // to do, because the answer is never «edit the file by hand».
    if (actual !== expected) {
      throw new Error(
        [
          'app/src/lib/__fixtures__/color-luts.json ya no coincide con lo que produce imageColor.ts.',
          '',
          'Si el cambio en la cadena de color es intencionado, hay que regenerar el fichero',
          'de casos Y volver a pasar el test de la herramienta local, que compara sus tablas',
          'con este mismo fichero:',
          '',
          '  make casos-color',
          '',
          'Si no lo es, el color de la aplicación acaba de cambiar sin querer.',
        ].join('\n'),
      )
    }
    expect(actual).toBe(expected)
  })

  it('cubre el ajuste neutro, los dos topes de cada parámetro y varias combinaciones', () => {
    const names = CASES.map((entry) => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('neutral')
    for (const parameter of [
      'temperature',
      'tint',
      'exposure',
      'black-point',
      'white-point',
      'gamma',
      'shoulder',
    ]) {
      expect(names).toContain(`${parameter}-min`)
      expect(names).toContain(`${parameter}-max`)
    }
    // Combinations: more than one parameter off its default at the same time.
    const combinations = CASES.filter(({ color }) => {
      const c = look(color)
      const moved = [
        c.temperature !== 0,
        c.tint !== 0,
        c.exposure !== 0,
        c.blackPoint !== 0,
        c.whitePoint !== 255,
        c.gamma !== 1,
        c.shoulder !== 0,
        c.gray,
      ].filter(Boolean)
      return moved.length > 1
    })
    expect(combinations.length).toBeGreaterThanOrEqual(4)
  })

  it('cada tabla trae 256 códigos, en rango y sin decrecer', () => {
    for (const entry of buildFixture().cases) {
      for (const channel of ['r', 'g', 'b'] as const) {
        const lut = entry.luts[channel]
        expect(lut, `${entry.name}.${channel}`).toHaveLength(256)
        for (let i = 0; i < lut.length; i += 1) {
          const value = lut[i]!
          expect(Number.isInteger(value), `${entry.name}.${channel}[${i}]`).toBe(true)
          expect(value, `${entry.name}.${channel}[${i}]`).toBeGreaterThanOrEqual(0)
          expect(value, `${entry.name}.${channel}[${i}]`).toBeLessThanOrEqual(255)
          if (i > 0) {
            // Every step of the chain is monotone increasing, so the table is too.
            // Python relies on this to be able to say that a table that decreases
            // is corrupt and not merely different.
            expect(value, `${entry.name}.${channel}[${i}]`).toBeGreaterThanOrEqual(lut[i - 1]!)
          }
        }
      }
    }
  })

  it('el fichero se puede leer como JSON y trae su versión y su cómo regenerarlo', () => {
    const parsed = JSON.parse(serialize(buildFixture())) as ColorLutFixture
    expect(parsed.version).toBe(FIXTURE_VERSION)
    expect(parsed.regenerateWith).toBe('make casos-color')
    expect(parsed.cases).toHaveLength(CASES.length)
    expect(parsed.grayCases).toHaveLength(GRAY_SAMPLES.length)
    // The luminance step is not in the tables and this is where that is stated as
    // data: the switch alone leaves the three tables at the identity.
    const grayOnly = parsed.cases.find((entry) => entry.name === 'gray-only')
    expect(grayOnly?.color.gray).toBe(true)
    expect(grayOnly?.luts.r).toEqual(Array.from({ length: 256 }, (_value, i) => i))
  })
})
