import { supabase } from './supabase'

/**
 * What version is running, on both sides.
 *
 * The build data is compiled into the bundle (see `define` in vite.config.ts):
 * at runtime there is no package.json to read and no git to ask. The database
 * side comes from the `platform_info` RPC, because the client cannot know the
 * schema of the project it is talking to.
 *
 * It matters for support: «it works in local but not in production» is
 * answered by comparing these two blocks, and asking for them must not require
 * opening a dashboard.
 */

declare const __BUILD__: {
  version: string
  date: string
  commit: string
  deps: Record<string, string>
}

export const BUILD = __BUILD__

/** Version ranges as declared (`^7.18.1` → `7.18.1`): the caret is noise here. */
export function cleanRange(range: string | undefined): string {
  return (range ?? '').replace(/^[\^~]/, '')
}

/**
 * Build date in the reader's terms: Spanish, Madrid time (RNF of the
 * interface). The stored value is UTC, which nobody reads.
 */
export function formatBuildDate(iso: string = BUILD.date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export interface PlatformInfo {
  postgres: string
  schema_version: string | null
  migrations: number
}

/** Postgres version and applied schema. Null when it cannot be asked. */
export async function platformInfo(): Promise<PlatformInfo | null> {
  const { data, error } = await supabase.rpc('platform_info')
  if (error || !data) return null
  return data as PlatformInfo
}

/**
 * Host of the API in use, which is what tells production from the local stack
 * apart at a glance. Only the host: the full URL adds nothing readable.
 */
export function apiHost(url: string = import.meta.env.VITE_SUPABASE_URL ?? ''): string {
  try {
    return new URL(url).host
  } catch {
    return '—'
  }
}
