/**
 * Host-half contract: the plugin publishes the live width as one `global` row
 * and owns its Settings page policy.
 *
 * The row shape and the global name are the whole Host/Client handshake, so they
 * are asserted verbatim. The width is read from the live `Config` reference at
 * emit time — the same reference the Loader commits a settings write into — so
 * the harness mutates the value behind that reference and re-renders.
 */
import type { Context } from '@deepseek-ai/cordis'

import { describe, expect, it } from 'vitest'

import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT } from '../../src/config.ts'
import { apply, inject } from '../../src/index.ts'
import type { Config } from '../../src/schema.ts'

/** One `webserver/index-inject` table row. */
interface InjectionRow {
  kind: string
  name: string
  value: unknown
}

/** One recorded `settings.configure` call. */
interface ConfigureCall {
  policy: { auto?: boolean }
  owner: unknown
}

interface HostHarness {
  ctx: Context
  config: Config
  /** Emit the index-render event and return the table subscribers filled. */
  render: () => InjectionRow[]
  /** Commit a new value into the live config reference. */
  commit: (widthPercent: number) => void
  /** The `settings.configure` calls the registered effect bodies made. */
  configures: () => ConfigureCall[]
  /** Run every effect body registered on the context. */
  runEffects: () => void
}

/**
 * Minimal Cordis host context: `ctx.on`, `ctx.inject`, `ctx.effect`, and the
 * optional `ctx.settings` policy are the only members this plugin uses.
 * @param withSettings - whether a settings provider is mounted on the context.
 * @returns The fake context, its live config reference, and the drivers above.
 */
function createContext(withSettings: boolean): HostHarness {
  const handlers: Array<(table: InjectionRow[]) => void> = []
  const bodies: Array<() => void> = []
  const configures: ConfigureCall[] = []
  let width = DEFAULT_WIDTH_PERCENT
  const settings = {
    configure: (policy: { auto?: boolean }, owner: unknown): (() => void) => {
      configures.push({ policy, owner })
      return () => {}
    },
  }
  const effect = (body: () => void): (() => void) => {
    bodies.push(body)
    return () => {}
  }
  const ctx = {
    fiber: { id: 'dsh-chat-wide' },
    effect,
    // Acquiring an optional service: the callback runs only once a provider is
    // composed, so an absent provider leaves the sub-fiber parked and the rest of
    // `apply` untouched.
    inject: (names: string[], callback: (sub: { settings: typeof settings; effect: typeof effect }) => void) => {
      expect(names).toEqual(['settings'])
      if (withSettings) callback({ settings, effect })
      return {}
    },
    on: (event: string, handler: (table: InjectionRow[]) => void) => {
      expect(event).toBe('webserver/index-inject')
      handlers.push(handler)
      return () => {}
    },
  } as unknown as Context
  const config = { widthPercent: { get: () => width } } as unknown as Config
  return {
    ctx,
    config,
    render: () => {
      const table: InjectionRow[] = []
      for (const handler of handlers) handler(table)
      return table
    },
    commit: (widthPercent) => { width = widthPercent },
    configures: () => configures,
    runEffects: () => { for (const body of bodies) body() },
  }
}

describe('host entry', () => {
  it('waits for the webserver service before applying', () => {
    expect(inject).toEqual(['webServer'])
  })

  it('does not declare the optional settings service as an injection', () => {
    // A hard injection parks the fiber with no timeout, so a settings-less
    // profile (headless) would never apply this plugin at all.
    expect(inject).not.toContain('settings')
  })

  it('pushes one global row naming the plugin-owned global', () => {
    const { ctx, config, render } = createContext(false)
    apply(ctx, config)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: DEFAULT_WIDTH_PERCENT } }])
  })

  it('carries whatever width the live config reference resolves', () => {
    const { ctx, config, render, commit } = createContext(false)
    commit(72.5)
    apply(ctx, config)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 72.5 } }])
  })

  it('reads the live value per render rather than freezing it at apply time', () => {
    const { ctx, config, render, commit } = createContext(false)
    apply(ctx, config)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: DEFAULT_WIDTH_PERCENT } }])
    commit(40)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 40 } }])
    commit(99)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 99 } }])
  })

  it('touches no DOM state', () => {
    const { ctx, config } = createContext(true)
    apply(ctx, config)
    expect(typeof document).toBe('undefined')
  })
})

describe('host settings policy', () => {
  it('opts the plugin instance out of the generated settings page', () => {
    const { ctx, config, configures, runEffects } = createContext(true)
    apply(ctx, config)
    // The policy is registered as an effect, so it lands only once effects run.
    expect(configures()).toHaveLength(0)
    runEffects()
    expect(configures()).toEqual([{ policy: { auto: false }, owner: ctx.fiber }])
  })

  it('registers no policy when no settings provider is mounted', () => {
    const { ctx, config, configures, runEffects } = createContext(false)
    apply(ctx, config)
    runEffects()
    expect(configures()).toHaveLength(0)
  })
})
