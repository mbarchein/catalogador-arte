/**
 * Leer el portapapeles del sistema, con HTML si lo tiene.
 *
 * Existe por una medición: **en el móvil, el evento de pegar da solo texto plano**. Se
 * pega una biografía desde el teléfono y llegan las palabras sin los títulos ni las
 * listas, mientras que en el ordenador llegan las dos cosas. Lo que sí puede leer los
 * dos formatos es la API asíncrona —`navigator.clipboard.read()`—, con dos condiciones
 * que la hacen inservible dentro del evento de pegar y perfecta detrás de un botón:
 * pide un **toque explícito** y puede pedir un permiso.
 *
 * Devuelve siempre las dos mitades, vacías si no hay: así quien llama decide con la
 * misma función que usa para el pegado normal, y no hay dos caminos que se
 * desincronicen.
 *
 * Vive en `lib/` y no en el componente porque es una capacidad del navegador con tres
 * finales —lo lee, no lo deja, no existe— y los tres tienen que quedar dichos en un
 * sitio.
 */
export interface ClipboardContents {
  html: string
  text: string
}

/**
 * Lo que haya en el portapapeles, o null si el navegador no deja leerlo.
 *
 * Null y no una excepción: no poder leer el portapapeles no es una avería —Firefox no
 * implementa `read()`, y en cualquier navegador la usuaria puede negar el permiso—, y
 * quien llama tiene otra salida que ofrecer.
 */
export async function readClipboard(): Promise<ClipboardContents | null> {
  const clipboard = navigator.clipboard
  if (clipboard === undefined) return null

  // `read()` da los dos formatos. Es la única forma de llegar al HTML en un teléfono.
  if (typeof clipboard.read === 'function') {
    try {
      const items = await clipboard.read()
      let html = ''
      let text = ''
      for (const item of items) {
        if (html === '' && item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text()
        }
        if (text === '' && item.types.includes('text/plain')) {
          text = await (await item.getType('text/plain')).text()
        }
      }
      if (html !== '' || text !== '') return { html, text }
    } catch {
      // Permiso negado, o un navegador que anuncia `read` y no lo cumple. Queda el
      // texto plano, que es mejor que nada.
    }
  }

  if (typeof clipboard.readText === 'function') {
    try {
      return { html: '', text: await clipboard.readText() }
    } catch {
      return null
    }
  }

  return null
}
