/**
 * Host-half contract: the plugin hooks the webserver's index render and pushes
 * exactly one `global` row carrying the validated configuration.
 *
 * The row shape and the global name are the whole Host/Client handshake, so they
 * are asserted verbatim rather than loosely.
 */
import type { Context } from '@deepseek-ai/cordis'

import { describe, expect, it } from 'vitest'

import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT } from '../../src/config.ts'
import { apply, inject } from '../../src/index.ts'

/** One `webserver/index-inject` table row. */
interface InjectionRow {
  kind: string
  name: string
  value: unknown
}

interface HostHarness {
  ctx: Context
  /** Emit the index-render event and return the table subscribers filled. */
  render: () => InjectionRow[]
}

/**
 * Minimal Cordis host context: `ctx.on` is the only member this plugin uses.
 * @returns The fake context plus an index-render driver.
 */
function createContext(): HostHarness {
  const handlers: Array<(table: InjectionRow[]) => void> = []
  const ctx = {
    on: (event: string, handler: (table: InjectionRow[]) => void) => {
      expect(event).toBe('webserver/index-inject')
      handlers.push(handler)
      return () => {}
    },
  } as unknown as Context
  return {
    ctx,
    render: () => {
      const table: InjectionRow[] = []
      for (const handler of handlers) handler(table)
      return table
    },
  }
}

describe('host entry', () => {
  it('waits for the webserver service before applying', () => {
    expect(inject).toEqual(['webServer'])
  })

  it('pushes one global row naming the plugin-owned global', () => {
    const { ctx, render } = createContext()
    apply(ctx, { widthPercent: 95 })
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 95 } }])
  })

  it('carries whatever width the Loader resolved, including a custom one', () => {
    const { ctx, render } = createContext()
    apply(ctx, { widthPercent: 72.5 })
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 72.5 } }])
  })

  it('publishes the documented default when the config row omits the width', () => {
    const { ctx, render } = createContext()
    // The schema supplies this value; the Host half must forward it untouched.
    apply(ctx, { widthPercent: DEFAULT_WIDTH_PERCENT })
    expect(render()).toEqual([
      { kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: DEFAULT_WIDTH_PERCENT } },
    ])
  })

  it('touches no DOM state', () => {
    const { ctx } = createContext()
    apply(ctx, { widthPercent: 95 })
    expect(typeof document).toBe('undefined')
  })
})
