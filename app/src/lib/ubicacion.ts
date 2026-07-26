/**
 * Convención de `ubicacion_fisica` del esquema v11: siempre en minúsculas y sin
 * tildes, con los niveles de la jerarquía separados por comas y de mayor a menor.
 *
 *   edificio a, habitacion amarilla, bloque 3
 *   edificio b, habitacion 4, estanteria 3, balda 2, carpeta 1
 *
 * La convención no es cosmética. Estas cadenas se agrupan y se comparan para
 * generar listados de trabajo («todo lo que hay en la habitación amarilla»), y sin
 * normalizar, «Habitación amarilla» y «habitacion amarilla» serían dos sitios
 * distintos que no lo son.
 *
 * Se normaliza **al teclear**, no al guardar, para que lo que se ve en el campo sea
 * exactamente lo que queda almacenado. Guardar algo distinto de lo que muestras es
 * una sorpresa que se descubre tarde y de mala manera.
 */

/**
 * Marcas combinantes que se eliminan: acentos y diéresis. Se excluye a propósito
 * U+0303, la tilde de la ñ, porque la ñ es una letra del alfabeto y no un acento:
 * convertir «muñeca» en «muneca» no sería normalizar, sería una falta.
 */
const ACENTOS = /[̀-̂̄-ͯ]/g

export function normalizarUbicacion(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(ACENTOS, '')
    .normalize('NFC')
    // Espacios sobrantes alrededor de las comas: al teclear en el móvil aparecen
    // constantemente y romperían la comparación entre ubicaciones iguales.
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
}

/**
 * Recorte final, para el momento de guardar. Se separa de `normalizarUbicacion`
 * porque durante la escritura hay que dejar el espacio final: si no, no se puede
 * teclear «edificio a, habitacion» sin que desaparezca el espacio tras la coma.
 */
export function ubicacionParaGuardar(texto: string): string {
  return normalizarUbicacion(texto).replace(/[\s,]+$/, '')
}
