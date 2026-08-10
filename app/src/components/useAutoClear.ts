import { useEffect } from 'react'

/**
 * Cuánto se queda un aviso que se va solo (RNF-106).
 *
 * Cuatro segundos. Por debajo de tres no se lee del todo si la vista estaba en otro
 * sitio de la pantalla —y en esta aplicación lo normal es que estuviera en la
 * fotografía—, y por encima de cinco deja de leerse como «acaba de pasar» y se
 * queda tapando la ficha. Es también el suelo que recomiendan los lectores de
 * pantalla para un `role="status"`: menos tiempo y el anuncio se corta a medias.
 */
export const AUTO_CLEAR_MS = 4000

/**
 * Borra `value` solo, unos segundos después de aparecer.
 *
 * **Solo para lo que confirma algo que ya ha pasado**, que es lo que se lee una vez y
 * no hace falta más: «Imagen principal actualizada». Un error NO se pone aquí — pide
 * hacer algo, y un aviso que se va antes de que se decida qué hacer obliga a
 * repetir la acción para volver a leer por qué falló.
 *
 * El temporizador se reinicia cuando cambia `value`, así que dos confirmaciones
 * seguidas se leen cuatro segundos cada una en vez de compartir los del primero. Y
 * se cancela al desmontar: un `setState` sobre una pantalla que ya no está es un
 * aviso en la consola y una fuga de memoria por cada vez.
 */
export function useAutoClear(value: unknown, clear: () => void, ms = AUTO_CLEAR_MS): void {
  useEffect(() => {
    if (value === null || value === undefined || value === '') return
    const timer = setTimeout(clear, ms)
    return () => clearTimeout(timer)
    // `clear` fuera de las dependencias a propósito: es una función nueva en cada
    // render si quien llama la escribe en línea, y con ella dentro el temporizador
    // se reiniciaría en cada pintado y el aviso no se iría nunca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms])
}
