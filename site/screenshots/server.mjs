/**
 * The demonstration's server: the application's build and, on the same origin, a
 * Supabase that answers from `demo-data.mjs`.
 *
 * Why a server and not a stub inside the application: what is being photographed
 * has to be **the real build**, with its own queries, its own signed URLs and its
 * own session. A fake client injected into the source would photograph a different
 * application from the one that is deployed, which is precisely what a commercial
 * page cannot do.
 *
 * Only what the screens ask for is implemented — a subset of PostgREST (filters,
 * order, range and the singular answer), the storage signing, and enough of Auth
 * for the session to be read as open. Anything else answers empty and is logged,
 * so a screen that asks for something new says so instead of appearing blank.
 *
 *     node server.mjs <dist-directory> <images-directory> [port]
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { TABLES, RPC, USER } from './demo-data.mjs'

const [, , DIST = '../../app/dist', IMAGES = 'demo-images', PORT = '5799'] = process.argv

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

/** Unanswered requests, so a missing screen is noticed instead of coming out blank. */
export const unanswered = []

// ── The PostgREST subset ────────────────────────────────────

/** `eq.1963`, `is.null`, `in.(a,b)`: the operator and the value the query carries. */
function matches(row, key, expression) {
  const separator = expression.indexOf('.')
  const operator = expression.slice(0, separator)
  const raw = expression.slice(separator + 1)
  const value = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw
  const actual = row[key]

  switch (operator) {
    case 'eq':
      return String(actual) === String(value)
    case 'neq':
      return String(actual) !== String(value)
    case 'is':
      return actual === value || (value === null && actual === undefined)
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))
      return list.some((v) => String(actual) === v)
    }
    case 'gt':
      return actual > value
    case 'gte':
      return actual >= value
    case 'lt':
      return actual < value
    case 'lte':
      return actual <= value
    case 'like':
    case 'ilike':
      return new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i').test(
        String(actual ?? ''),
      )
    default:
      return true
  }
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'or', 'and', 'columns', 'on_conflict'])

/**
 * The embedded resources of a `select`: `party:parties(id, name)` and its nested
 * ones.
 *
 * They are not decoration of the query — the record reads
 * `row.party.active` straight off, so a row arriving without its party is not a
 * gap on screen but a crash. Splitting is done by hand because the commas of the
 * outer list and those inside the parentheses are the same character.
 */
function embeddedParts(select) {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of select ?? '') {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += character
    }
  }
  parts.push(current)

  return parts
    .map((part) => part.trim())
    .filter((part) => part.includes('('))
    .map((part) => {
      const open = part.indexOf('(')
      // `artworks!inner`, `artworks!some_fkey`: the hint about which relation to
      // follow is not part of the name.
      const head = part.slice(0, open).split('!')[0]
      const [alias, table = alias] = head.includes(':') ? head.split(':') : [head, head]
      return { alias, table, select: part.slice(open + 1, part.lastIndexOf(')')) }
    })
}

/** Which column of the row points at the embedded table. */
function foreignKey(row, alias, table) {
  const singular = table.replace(/ies$/, 'y').replace(/s$/, '')
  for (const candidate of [`${alias}_id`, `${alias}_${singular}_id`, `${singular}_id`]) {
    if (candidate in row) return candidate
  }
  return null
}

function embed(rows, select) {
  const parts = embeddedParts(select)
  if (parts.length === 0) return rows
  return rows.map((row) => {
    const copy = { ...row }
    for (const part of parts) {
      const key = foreignKey(row, part.alias, part.table)
      const target = (TABLES[part.table] ?? []).find((candidate) => candidate.id === row[key])
      copy[part.alias] = target ? embed([target], part.select)[0] : null
    }
    return copy
  })
}

function query(table, params) {
  let rows = (TABLES[table] ?? []).slice()
  if (!(table in TABLES)) unanswered.push(`tabla ${table}`)

  for (const [key, expression] of params.entries()) {
    if (RESERVED.has(key)) continue
    rows = rows.filter((row) => matches(row, key, expression))
  }

  const order = params.get('order')
  if (order) {
    // `col.asc,col2.desc`: applied from the last one backwards, which is what
    // makes a stable sort behave like several `order` calls chained.
    const keys = order.split(',').map((part) => {
      const [column, ...rest] = part.split('.')
      return { column, descending: rest.includes('desc') }
    })
    for (const { column, descending } of keys.reverse()) {
      rows.sort((a, b) => {
        const left = a[column]
        const right = b[column]
        if (left === right) return 0
        if (left === null || left === undefined) return 1
        if (right === null || right === undefined) return -1
        return (left > right ? 1 : -1) * (descending ? -1 : 1)
      })
    }
  }

  const limit = params.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))
  return embed(rows, params.get('select'))
}

/** `Range: 0-499`, which is what `.range()` sends. */
function sliceRange(rows, header) {
  if (!header) return rows
  const [from, to] = header.split('-').map(Number)
  return rows.slice(from, to + 1)
}

// ── Session ─────────────────────────────────────────────────

/**
 * A token with the shape of a JWT and no signature worth anything: nothing here
 * validates it, and putting a real one in a repository would be a bad habit even
 * for a demonstration.
 */
function token() {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return [
    part({ alg: 'HS256', typ: 'JWT' }),
    part({
      sub: USER.id,
      email: USER.email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      iat: Math.floor(Date.now() / 1000),
    }),
    'demostracion',
  ].join('.')
}

export function session() {
  return {
    access_token: token(),
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: 'demo-refresh',
    user: {
      id: USER.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: USER.email,
      email_confirmed_at: '2026-01-02T10:00:00Z',
      phone: '',
      confirmed_at: '2026-01-02T10:00:00Z',
      last_sign_in_at: '2026-08-15T08:00:00Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { name: USER.name },
      identities: [],
      created_at: '2026-01-02T10:00:00Z',
      updated_at: '2026-08-15T08:00:00Z',
      is_anonymous: false,
    },
  }
}

// ── The server ──────────────────────────────────────────────

function json(response, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    ...extraHeaders,
  })
  response.end(payload)
}

async function serveFile(response, path) {
  try {
    const info = await stat(path)
    if (!info.isFile()) return false
    const body = await readFile(path)
    response.writeHead(200, {
      'content-type': MIME[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(body)
    return true
  } catch {
    return false
  }
}

export function start({ dist = DIST, images = IMAGES, port = Number(PORT) } = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://localhost:${port}`)
    const path = url.pathname

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      })
      return response.end()
    }

    // ── Auth ────────────────────────────────────────────────
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/user')) return json(response, session().user)
      if (path.endsWith('/logout')) return json(response, {})
      return json(response, session())
    }

    // ── Storage ─────────────────────────────────────────────
    // Signing a batch: the client asks for a list and gets back one relative
    // address per path, which is what `createSignedUrls` returns.
    if (path.startsWith('/storage/v1/object/sign/')) {
      const rest = path.slice('/storage/v1/object/sign/'.length)
      if (request.method === 'POST') {
        const body = await new Promise((resolve) => {
          let text = ''
          request.on('data', (chunk) => (text += chunk))
          request.on('end', () => resolve(text))
        })
        const { paths = [] } = JSON.parse(body || '{}')
        return json(
          response,
          paths.map((filePath) => ({
            error: null,
            path: filePath,
            signedURL: `/object/sign/obras/${filePath}?token=demostracion`,
          })),
        )
      }
      if (request.method === 'GET') {
        const [, file] = rest.split('/')
        const served = await serveFile(response, join(images, normalize(file).replace(/^(\.\.[/\\])+/, '')))
        if (served) return
        response.writeHead(404).end()
        return
      }
    }
    if (path.startsWith('/storage/v1/')) return json(response, {})

    // ── PostgREST ───────────────────────────────────────────
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.slice('/rest/v1/rpc/'.length)
      if (!(name in RPC)) unanswered.push(`rpc ${name}`)
      return json(response, RPC[name] ?? null)
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length)
      // Writes are not part of the demonstration: nothing is photographed after
      // saving, and answering an empty success keeps a screen from showing an error.
      if (request.method !== 'GET') return json(response, [])

      const rows = query(table, url.searchParams)
      const page = sliceRange(rows, request.headers['range'])
      const singular = String(request.headers['accept'] ?? '').includes('pgrst.object')
      return json(response, singular ? (page[0] ?? null) : page, {
        'content-range': `0-${Math.max(0, page.length - 1)}/${rows.length}`,
      })
    }

    // ── The application ─────────────────────────────────────
    const safe = normalize(path).replace(/^(\.\.[/\\])+/, '')
    if (await serveFile(response, join(dist, safe))) return
    // Every route falls back to the index: it is a single-page application and
    // the screenshots are taken by navigating straight to each address.
    if (await serveFile(response, join(dist, 'index.html'))) return
    response.writeHead(404).end()
  })

  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await start()
  console.log(`demostración en http://localhost:${PORT}`)
}
