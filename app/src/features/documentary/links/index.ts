/**
 * Los enlaces a sitios externos de una ficha (RF-1400).
 *
 * La ficha monta el bloque y nada más; todo lo demás es interior de la pieza. Lo
 * puro se exporta también porque es lo que la batería prueba y lo que otra
 * pantalla reutilizaría el día que una exposición o una publicación reciban su
 * propia ancla.
 */
export { ExternalLinksSection } from './ExternalLinksSection'
export { LinkForm } from './LinkForm'
export { useExternalLinks, useLinkActions } from './useExternalLinks'
export type { ExternalLinksState, LinkActions } from './useExternalLinks'
export * from './externalLinks'
export * from './linkDraft'
