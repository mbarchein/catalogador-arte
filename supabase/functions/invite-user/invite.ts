/**
 * Lo que decide la invitación, sin Deno y sin red, para poder probarlo.
 *
 * El mismo criterio que `paths.ts` y `multipart.ts` de la función que firma ficheros: la
 * batería del proyecto corre en node, así que una decisión escrita dentro del `serve` es
 * una decisión que no verifica nadie. Aquí está lo que se puede equivocar —qué es un
 * correo, qué nombre se manda, y qué se le dice a quien invita cuando la plataforma dice
 * que no— y fuera queda el cable.
 */

/**
 * Un correo aceptable, con criterio deliberadamente estrecho.
 *
 * No pretende validar el RFC 5322 —nadie lo hace bien y no hace falta—: lo que tiene que
 * evitar es mandar una invitación a una dirección con una errata, porque la invitación se
 * va a un buzón que nadie mira y quien invita cree que ya está hecho. Sin espacios, con
 * una arroba, con punto en el dominio y sin caracteres de control.
 */
export function isInvitableEmail(email: string): boolean {
  const clean = email.trim()
  if (clean.length === 0 || clean.length > 254) return false
  if (/[\s<>",;\\]/.test(clean)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(clean)
}

/** El correo tal como se manda: sin espacios alrededor y en minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Lo que se manda a la plataforma para invitar.
 *
 * El nombre viaja en los metadatos con la clave `name`, que es la que lee el trigger que
 * crea el perfil (`tg_new_user`). Si se mandara con otra, el perfil nacería sin nombre y
 * la pantalla del equipo enseñaría el correo hasta que la persona lo corrigiera.
 *
 * **El rol no viaja.** Nace Lector por omisión —así lo declara la tabla desde la primera
 * migración— y se asigna después desde la pantalla, que es donde queda la traza. Mandarlo
 * aquí sería un segundo camino para dar permisos, y uno que no pasa por el trigger que
 * exige ser superusuario.
 */
export function invitePayload(email: string, name: string, redirectTo: string) {
  const clean = name.trim()
  return {
    email: normalizeEmail(email),
    ...(clean === '' ? {} : { data: { name: clean } }),
    ...(redirectTo === '' ? {} : { redirect_to: redirectTo }),
  }
}

/**
 * Lo que se le dice a quien invita cuando la plataforma contesta que no.
 *
 * En español y diciendo qué hacer, como el resto de los mensajes que ve la usuaria. El
 * caso que de verdad importa es el correo repetido: la plataforma contesta 422 y sin
 * traducirlo se leería como una avería, cuando lo que pasa es que esa persona ya está en
 * el equipo — que es una respuesta útil y no un error.
 */
export function inviteFailureText(status: number, body: string): string {
  const said = body.toLowerCase()
  if (status === 422 || said.includes('already been registered') || said.includes('already registered')) {
    return 'Esa dirección ya tiene cuenta. Búscala en la lista: puede que solo necesite que le devuelvas el acceso.'
  }
  if (status === 429) {
    return 'La plataforma ha recibido demasiadas invitaciones seguidas. Espera un minuto y vuelve a intentarlo.'
  }
  if (status === 400) {
    return 'La plataforma ha rechazado la dirección. Compruébala antes de volver a mandarla.'
  }
  return 'No se ha podido mandar la invitación. Vuelve a intentarlo en un momento.'
}

/** Lo que se lee cuando sí se ha mandado. Dice lo que va a pasar después. */
export function invitedNotice(email: string): string {
  return `Invitación mandada a ${normalizeEmail(email)}. Entra como Lector en cuanto elija su contraseña.`
}
