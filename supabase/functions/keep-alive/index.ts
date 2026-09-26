// Edge Function «keep-alive»: one read a day so the free tier does not pause the project
// (RNF-116). What it decides lives in `probe.ts`, which is where its tests point.
//
// ── WHO CALLS IT ────────────────────────────────────────────
//
// A pg_cron job inside the database itself, through pg_net, with the anonymous key in the
// header — the job is created by Terraform (`infra/keepalive.tf`) because its URL is the
// project's and differs in every deployment. The platform checks that key (`verify_jwt`,
// on by default), and since the anonymous key is public, anybody can call this too. That
// is acceptable because of what it does: one fixed read, and a reply that says nothing
// about the catalogue. The service key it reads with never leaves the function.
//
// It is not served by the local stack (`docker-compose.yml` only mounts `sign-file`): in
// local there is no cron and nothing to keep awake.

import { isConfigured, probeReply, probeRequest } from './probe.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, { error: 'Método no permitido.' })
  if (!isConfigured(SUPABASE_URL, SERVICE_ROLE_KEY)) {
    return reply(500, { error: 'A la función le falta la configuración de la plataforma.' })
  }

  const { url, init } = probeRequest(SUPABASE_URL, SERVICE_ROLE_KEY)
  let answer: { ok: boolean; status: number } | null = null
  try {
    const response = await fetch(url, init)
    answer = { ok: response.ok, status: response.status }
    // The rows are not wanted; releasing the body closes the connection cleanly.
    await response.body?.cancel()
  } catch {
    answer = null
  }

  const { status, body } = probeReply(answer)
  return reply(status, body)
})
