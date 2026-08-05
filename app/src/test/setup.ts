import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Lo que necesitan los tests de pantalla, y solo ellos.
 *
 * `cleanup` desmonta lo que cada test montó. Sin esto, el segundo test de un
 * fichero busca su botón en un documento que todavía tiene el del primero, y lo que
 * falla no es el aserto: es un «se han encontrado varios elementos» que manda a
 * buscar el fallo donde no está.
 *
 * Este fichero lo cargan TAMBIÉN los tests de lógica pura, que corren en node, así
 * que no debe tener nada más: importar aquí algo que necesite un DOM rompería los
 * ochenta y pico ficheros que hoy no lo necesitan. `cleanup` sin nada montado no
 * hace nada y no molesta.
 */
afterEach(() => {
  cleanup()
})
