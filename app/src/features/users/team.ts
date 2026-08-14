import { ROLE_LABEL, type UserRole } from '../../lib/types'

/**
 * El equipo: quién entra al catálogo y qué puede hacer (RF-1107, RF-108).
 *
 * Puro y sin React, como todo lo que decide en este proyecto: el orden de una lista, lo
 * que se ofrece de cada fila y las palabras de cada aviso se verifican aquí o no se
 * verifican en ninguna parte.
 *
 * **Nada de este fichero es un permiso.** Lo que decide quién puede hacer qué son las
 * políticas RLS y los dos triggers de `profiles`; esto solo evita ofrecer un botón que la
 * base va a rechazar, que es lo que RF-106 pide y lo único que un cliente puede hacer.
 */

export interface TeamMember {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
}

/** Una fila del equipo, lista para pintar. */
export interface TeamEntry {
  member: TeamMember
  /** El nombre, o el correo cuando todavía no ha puesto ninguno. Nunca un hueco (RF-304). */
  title: string
  /** El correo debajo, salvo que ya sea el título: repetirlo sería ruido. */
  subtitle: string
  role: string
  /** Es la fila de quien está mirando la pantalla. */
  self: boolean
  /** Se le ha retirado el acceso. La fila lo DICE, porque gris a secas es decoración. */
  withoutAccess: boolean
  /**
   * Si se le puede retirar el acceso o bajarle el rol.
   *
   * Falso solo para el último superusuario con acceso: sin ninguno, nadie puede volver a
   * asignar roles desde la aplicación y hay que entrar al panel de Supabase. La base lo
   * rechaza igualmente —es un trigger—; esto es para no ofrecer el gesto.
   */
  demotable: boolean
}

const ROLE_RANK: Record<UserRole, number> = { SUPERUSER: 0, CATALOGER: 1, READER: 2 }

/** Con quién se está hablando: el nombre si lo hay, y si no el correo. */
export function memberTitle(member: TeamMember): string {
  const name = member.name.trim()
  return name === '' ? member.email : name
}

/** Los superusuarios con acceso que quedarían si esta persona dejara de serlo. */
export function otherActiveSuperusers(
  members: readonly TeamMember[],
  exceptId: string,
): number {
  return members.filter((m) => m.id !== exceptId && m.active && m.role === 'SUPERUSER').length
}

/**
 * El equipo en el orden en que se lee: primero quien entra, y dentro de cada grupo por
 * responsabilidad y luego por nombre en español.
 *
 * Quien no entra va al final y no escondido, que es el mismo criterio de las fichas
 * retiradas: esconderlo dejaría sin salida al único sitio desde el que se le devuelve el
 * acceso.
 */
export function teamEntries(
  members: readonly TeamMember[],
  selfId: string | null,
): TeamEntry[] {
  return members
    .slice()
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        memberTitle(a).localeCompare(memberTitle(b), 'es', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
    )
    .map((member) => {
      const title = memberTitle(member)
      return {
        member,
        title,
        subtitle: title === member.email ? '' : member.email,
        role: ROLE_LABEL[member.role],
        self: member.id === selfId,
        withoutAccess: !member.active,
        demotable:
          member.role !== 'SUPERUSER' ||
          !member.active ||
          otherActiveSuperusers(members, member.id) > 0,
      }
    })
}

/** Lo que hace cada rol, en una línea, para elegirlo sabiendo qué se da. */
export const ROLE_HINT: Record<UserRole, string> = {
  SUPERUSER: 'Todo lo del catalogador, y además administra el equipo.',
  CATALOGER: 'Cataloga: crea, corrige y retira fichas.',
  READER: 'Solo consulta. No escribe nada.',
}

export interface RoleOption {
  value: UserRole
  text: string
  hint: string
}

/**
 * Los roles que se ofrecen para una persona.
 *
 * Los tres siempre, con el suyo marcado, salvo que sea el último superusuario con acceso:
 * ahí solo se ofrece el que ya tiene, porque cualquier otro deja el catálogo sin
 * gobierno. El motivo se dice en la pantalla; un botón apagado sin explicación es peor
 * que no tenerlo.
 */
export function roleOptions(entry: TeamEntry): RoleOption[] {
  const all: UserRole[] = ['SUPERUSER', 'CATALOGER', 'READER']
  const offered = entry.demotable ? all : [entry.member.role]
  return offered.map((value) => ({ value, text: ROLE_LABEL[value], hint: ROLE_HINT[value] }))
}

// ── Lo que se dice al hacer cada cosa ────────────────────────

/** Confirmado, y en pasado: lo que se lee cuando ya está hecho. */
export function roleChangedNotice(member: TeamMember, role: UserRole): string {
  return `${memberTitle(member)} pasa a ${ROLE_LABEL[role]}.`
}

export function accessChangedNotice(member: TeamMember, active: boolean): string {
  return active
    ? `${memberTitle(member)} vuelve a entrar al catálogo.`
    : `${memberTitle(member)} ya no entra al catálogo.`
}

/** El título de la pregunta antes de quitar el acceso. */
export function removeAccessConfirmTitle(member: TeamMember): string {
  return `¿Quitar el acceso a ${memberTitle(member)}?`
}

/**
 * Y lo que hay que saber para contestarla: qué pasa y qué no.
 *
 * Lo segundo importa tanto como lo primero — quitar el acceso se parece a borrar la
 * cuenta y no lo es, y quien lo lee tiene que poder distinguirlo sin saber cómo está
 * hecha la aplicación.
 */
export const REMOVE_ACCESS_CONFIRM_TEXT =
  'Deja de ver el catálogo al momento. Su nombre se sigue leyendo en las fichas que tocó, y ' +
  'puedes devolvérselo cuando quieras.'

/** Por qué al último superusuario no se le puede quitar nada. */
export const LAST_SUPERUSER_HINT =
  'Es el único superusuario con acceso. Nombra a otro antes de cambiar este.'
