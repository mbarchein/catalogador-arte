import { InfoNote } from '../../components/ui'

/**
 * Las dos marcas de la fecha, dichas en una línea y explicadas detrás del icono
 * (ADR-004, RNF-106).
 *
 * Son dos casillas que se parecen y **no significan lo mismo**, y elegir la que no
 * es cambia lo que imprime el catálogo. Eso es justo lo que justifica el icono: la
 * línea de fuera dice qué sale impreso, que es lo que se comprueba de un vistazo, y
 * dentro está la diferencia con un ejemplo, que es lo que hace falta la primera vez
 * y ya nunca más.
 *
 * En dos pantallas —la ficha y la captura— y por eso aquí: el mismo campo con dos
 * explicaciones distintas es cómo empiezan a divergir.
 */
export function DateCertainty() {
  return (
    <p className="flex items-start gap-1 text-xs text-stone-500">
      <span className="min-w-0">«Aproximada» imprime «c.»; «Sin confirmar», «[?]».</span>
      <InfoNote title="Aproximada y sin confirmar" className="-mt-1 shrink-0">
        <p>
          <strong>Aproximada</strong> es de alrededor de ese año: se sabe que es de
          finales de los setenta y se pone 1978. Imprime «c. 1978».
        </p>
        <p>
          <strong>Sin confirmar</strong> es que no se sabe: el año es una estimación
          mientras alguien lo investiga. Imprime «1978 [?]».
        </p>
        <p>Pueden ir las dos: «c. 1978 [?]».</p>
      </InfoNote>
    </p>
  )
}
