// What the «keep-alive» Edge Function decides, free of Deno so the battery can run it
// (RNF-116).
//
// The free tier pauses a project after about a week with no activity, and a paused project
// does not wake up by itself: somebody has to restore it from the panel. The function is
// called once a day by a pg_cron job (created by Terraform, `infra/keepalive.tf`) and does
// ONE read through the API — the same path real traffic takes, which is what the pattern
// copied from ensayadero relies on, and that project has never been paused.

/**
 * The table that is read: small, and read by every screen, so it always exists.
 *
 * `limit=1` and a single column: what proves the database is in use is that a query
 * reaches it, not what it brings back.
 */
export const PROBE_PATH = '/rest/v1/artist_funds?select=id&limit=1'

export interface ProbeRequest {
  url: string
  init: RequestInit
}

/**
 * The read, with the service key.
 *
 * The anonymous role cannot do it: it has not even got usage on the `public` schema, on
 * purpose (the initial migration revokes it), and reopening that for a ping would be
 * trading a line of the perimeter for a convenience. The service key is the one the
 * platform injects into every Edge Function — the same one `invite-user` uses — so this adds
 * no secret anywhere, and it never leaves Supabase.
 */
export function probeRequest(supabaseUrl: string, serviceKey: string): ProbeRequest {
  return {
    url: `${supabaseUrl.replace(/\/+$/, '')}${PROBE_PATH}`,
    init: {
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    },
  }
}

export interface ProbeReply {
  status: number
  body: { ok: true } | { error: string }
}

/**
 * What the function answers, given what the database answered (null: it did not answer).
 *
 * **A failure answers 502, not 200.** Nobody reads this reply —pg_cron fires and
 * forgets— so the status code is the only trace that reaches the function's log and
 * `net._http_response`. A ping that fails politely is a project that gets paused a week
 * later with nothing having said so.
 *
 * The body carries nothing from the table: the endpoint can be called by anyone holding
 * the anonymous key, which is public by design.
 */
export function probeReply(answer: { ok: boolean; status: number } | null): ProbeReply {
  if (answer === null) return { status: 502, body: { error: 'La base no ha contestado.' } }
  if (!answer.ok) {
    return { status: 502, body: { error: `La base ha contestado ${answer.status}.` } }
  }
  return { status: 200, body: { ok: true } }
}

/** Whether the platform has handed the function what it needs. */
export function isConfigured(supabaseUrl: string, serviceKey: string): boolean {
  return supabaseUrl.trim() !== '' && serviceKey.trim() !== ''
}
