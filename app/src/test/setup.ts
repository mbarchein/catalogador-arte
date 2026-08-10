import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * What the screen tests need, and only they.
 *
 * `cleanup` unmounts whatever each test mounted. Without this, a file's second test
 * looks for its button in a document that still has the first one's, and what
 * fails is not the assertion: it is a «several elements were found» that sends one to
 * look for the failure where it is not.
 *
 * This file is ALSO loaded by the pure-logic tests, which run in node, so
 * it must have nothing else: importing something here that needs a DOM would break the
 * eighty-odd files that do not need one today. `cleanup` with nothing mounted does
 * nothing and gets in nobody's way.
 */
afterEach(() => {
  cleanup()
})
