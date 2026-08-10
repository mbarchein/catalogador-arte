/**
 * A record's links to external sites (RF-1400).
 *
 * The record mounts the block and nothing else; everything else is the piece's interior. The
 * pure part is also exported because it is what the suite tests and what another
 * screen would reuse the day an exhibition or a publication receives its
 * own anchor.
 */
export { ExternalLinksSection } from './ExternalLinksSection'
export { LinkForm } from './LinkForm'
export { useExternalLinks, useLinkActions } from './useExternalLinks'
export type { ExternalLinksState, LinkActions } from './useExternalLinks'
export * from './externalLinks'
export * from './linkDraft'
