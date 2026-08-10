import { InfoNote } from '../../components/ui'

/**
 * The two marks of the date, said in one line and explained behind the icon
 * (ADR-004, RNF-106).
 *
 * They are two checkboxes that look alike and **do not mean the same thing**, and picking
 * the wrong one changes what the catalog prints. That is exactly what justifies the icon:
 * the line outside says what comes out printed, which is what is checked at a glance, and
 * inside is the difference with an example, which is what is needed the first time and
 * never again.
 *
 * On two screens —the record and capture— and that is why it lives here: the same field
 * with two different explanations is how they start to diverge.
 */
export function DateCertainty() {
  return (
    <div className="flex items-start gap-1 text-xs text-stone-500">
      <p className="min-w-0">«Aproximada» imprime «c.»; «Sin confirmar», «[?]».</p>
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
    </div>
  )
}
