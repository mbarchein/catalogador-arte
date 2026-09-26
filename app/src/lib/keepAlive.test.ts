import { describe, expect, it } from 'vitest'
import {
  isConfigured,
  PROBE_PATH,
  probeReply,
  probeRequest,
} from '../../../supabase/functions/keep-alive/probe'

/**
 * La lectura diaria que impide que el plan gratuito pause el proyecto (RNF-116).
 *
 * Lo que se fija es lo que haría que el ping **pareciera** funcionar sin funcionar: que
 * la consulta llegue de verdad a la base —con la clave de servicio, porque el rol anónimo
 * no tiene ni uso del esquema—, y sobre todo que un fallo **conteste en rojo**. Nadie lee
 * la respuesta: pg_cron dispara y se olvida, y el código de estado es la única traza que
 * queda. Un ping que falla con un 200 es un proyecto pausado una semana después sin que
 * nada lo haya dicho.
 */

describe('la lectura', () => {
  it('va a la API, que es por donde entra el tráfico de verdad', () => {
    const { url, init } = probeRequest('https://abc.supabase.co', 'clave-servicio')
    expect(url).toBe(`https://abc.supabase.co${PROBE_PATH}`)
    expect(url).toContain('/rest/v1/')
    expect(init.method).toBe('GET')
  })

  it('con la clave de servicio en las dos cabeceras que pide la pasarela', () => {
    const { init } = probeRequest('https://abc.supabase.co', 'clave-servicio')
    expect(init.headers).toEqual({
      apikey: 'clave-servicio',
      Authorization: 'Bearer clave-servicio',
    })
  })

  it('pide una sola fila: lo que cuenta es que la consulta llegue, no lo que traiga', () => {
    expect(PROBE_PATH).toContain('limit=1')
  })

  it('no duplica la barra si la dirección del proyecto la trae al final', () => {
    const { url } = probeRequest('https://abc.supabase.co/', 'k')
    expect(url).toBe(`https://abc.supabase.co${PROBE_PATH}`)
  })
})

describe('la respuesta', () => {
  it('contesta 200 cuando la base ha contestado', () => {
    expect(probeReply({ ok: true, status: 200 })).toEqual({ status: 200, body: { ok: true } })
  })

  it('y en rojo cuando la base contesta con error', () => {
    const reply = probeReply({ ok: false, status: 503 })
    expect(reply.status).toBe(502)
    expect(reply.body).toEqual({ error: 'La base ha contestado 503.' })
  })

  it('y en rojo cuando la base ni contesta', () => {
    expect(probeReply(null).status).toBe(502)
  })

  it('no devuelve nada del catálogo: la puede llamar cualquiera con la clave anónima', () => {
    // La clave anónima es pública por diseño, así que esta respuesta también lo es.
    expect(Object.keys(probeReply({ ok: true, status: 200 }).body)).toEqual(['ok'])
  })
})

describe('la configuración', () => {
  it('exige la dirección y la clave que pone la plataforma', () => {
    expect(isConfigured('https://abc.supabase.co', 'k')).toBe(true)
    expect(isConfigured('', 'k')).toBe(false)
    expect(isConfigured('https://abc.supabase.co', '  ')).toBe(false)
  })
})
