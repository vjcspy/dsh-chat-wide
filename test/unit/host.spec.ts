/**
 * Host-half contract: the plugin registers the width as a settings namespace
 * seeded by the Loader config, and pushes one `global` row carrying the value the
 * settings scope resolves at index-render time.
 *
 * The row shape and the global name are the whole Host/Client handshake, so they
 * are asserted verbatim. The settings provider is stubbed at its documented
 * `installSection` seam: the stub hands back the scope reader through
 * `setSource`, which is exactly how the real provider publishes a live value and
 * how it retracts to the composition entry when the provider detaches.
 */
import type { Context } from '@deepseek-ai/cordis'

import { describe, expect, it } from 'vitest'

import type { Config as ConfigShape } from '../../src/config.ts'
import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT, SETTINGS_NAMESPACE } from '../../src/config.ts'
import { apply, inject } from '../../src/index.ts'
import { Config as WidthSettingsSchema } from '../../src/schema.ts'

/** One `webserver/index-inject` table row. */
interface InjectionRow {
  kind: string
  name: string
  value: unknown
}

/** Hooks the settings provider passes to `installSection`. */
interface SectionHooks {
  setSource: (source: () => ConfigShape) => void
  onChange: () => void
}

/** What the stub recorded about the one section it was asked to install. */
interface InstalledSection {
  owner: unknown
  ns: string
  schema: unknown
  entry: ConfigShape
  hooks: SectionHooks
}

interface HostHarness {
  ctx: Context
  /** Emit the index-render event and return the table subscribers filled. */
  render: () => InjectionRow[]
  /** The section `apply` installed, or undefined when no provider was mounted. */
  installed: () => InstalledSection | undefined
  /** Publish a committed settings value, as the provider's scope reader does. */
  commit: (widthPercent: number) => void
  /** Simulate the provider detaching, which retracts the section to its entry. */
  detach: () => void
}

/**
 * Minimal Cordis host context: `ctx.on` and `ctx.inject` are the only members
 * this plugin uses, plus the one settings method it calls.
 * @param withSettings - whether a settings provider is mounted on the context.
 * @returns The fake context plus the drivers above.
 */
function createContext(withSettings: boolean): HostHarness {
  const handlers: Array<(table: InjectionRow[]) => void> = []
  let installed: InstalledSection | undefined
  const settings = {
    installSection: (
      owner: unknown,
      ns: string,
      schema: unknown,
      entry: ConfigShape,
      hooks: SectionHooks,
    ): void => {
      installed = { owner, ns, schema, entry, hooks }
      // The real provider publishes its scope reader immediately.
      hooks.setSource(() => entry)
      hooks.onChange()
    },
  }
  const ctx = {
    // Acquiring an optional service: the callback runs only once a provider is
    // composed, so an absent provider leaves the sub-fiber parked and the rest of
    // `apply` untouched.
    inject: (names: string[], callback: (sub: { settings: typeof settings }) => void) => {
      expect(names).toEqual(['settings'])
      if (withSettings) callback({ settings })
      return {}
    },
    on: (event: string, handler: (table: InjectionRow[]) => void) => {
      expect(event).toBe('webserver/index-inject')
      handlers.push(handler)
      return () => {}
    },
  } as unknown as Context
  const section = (): InstalledSection => {
    if (installed === undefined) throw new Error('apply installed no settings section')
    return installed
  }
  return {
    ctx,
    render: () => {
      const table: InjectionRow[] = []
      for (const handler of handlers) handler(table)
      return table
    },
    installed: () => installed,
    commit: (widthPercent) => { section().hooks.setSource(() => ({ widthPercent })) },
    detach: () => { section().hooks.setSource(() => section().entry) },
  }
}

/**
 * Host context whose settings provider composes after `apply` has run — the real
 * boot order that produced the registration regression this covers.
 * @returns The fake context plus a `mount` driver for the late provider.
 */
function createDeferredContext(): {
  ctx: Context
  mount: () => void
  installed: () => InstalledSection | undefined
  render: () => InjectionRow[]
} {
  const handlers: Array<(table: InjectionRow[]) => void> = []
  let pending: ((sub: { settings: unknown }) => void) | undefined
  let installed: InstalledSection | undefined
  const settings = {
    installSection: (
      owner: unknown,
      ns: string,
      schema: unknown,
      entry: ConfigShape,
      hooks: SectionHooks,
    ): void => {
      installed = { owner, ns, schema, entry, hooks }
      hooks.setSource(() => entry)
      hooks.onChange()
    },
  }
  const ctx = {
    inject: (names: string[], callback: (sub: { settings: unknown }) => void) => {
      expect(names).toEqual(['settings'])
      pending = callback
      return {}
    },
    on: (event: string, handler: (table: InjectionRow[]) => void) => {
      expect(event).toBe('webserver/index-inject')
      handlers.push(handler)
      return () => {}
    },
  } as unknown as Context
  return {
    ctx,
    mount: () => { pending?.({ settings }) },
    installed: () => installed,
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

  it('does not declare the optional settings service as an injection', () => {
    // A hard injection parks the fiber with no timeout, so a settings-less
    // profile (headless) would never apply this plugin at all.
    expect(inject).not.toContain('settings')
  })

  it('pushes one global row naming the plugin-owned global', () => {
    const { ctx, render } = createContext(false)
    apply(ctx, { widthPercent: 95 })
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 95 } }])
  })

  it('carries whatever width the Loader resolved, including a custom one', () => {
    const { ctx, render } = createContext(false)
    apply(ctx, { widthPercent: 72.5 })
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 72.5 } }])
  })

  it('publishes the documented default when the config row omits the width', () => {
    const { ctx, render } = createContext(false)
    // The schema supplies this value; the Host half must forward it untouched.
    apply(ctx, { widthPercent: DEFAULT_WIDTH_PERCENT })
    expect(render()).toEqual([
      { kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: DEFAULT_WIDTH_PERCENT } },
    ])
  })

  it('touches no DOM state', () => {
    const { ctx } = createContext(true)
    apply(ctx, { widthPercent: 95 })
    expect(typeof document).toBe('undefined')
  })
})

describe('host settings wiring', () => {
  it('installs the section under the plugin namespace with the Loader config as the seed', () => {
    const { ctx, installed } = createContext(true)
    apply(ctx, { widthPercent: 72.5 })
    const section = installed()!
    expect(section.ns).toBe(SETTINGS_NAMESPACE)
    expect(section.ns).toBe('dsh-chat-wide')
    expect(section.entry).toEqual({ widthPercent: 72.5 })
    // The same schema the Loader validated with, so the seed and the user layer
    // accept exactly one set of values.
    expect(section.schema).toBe(WidthSettingsSchema)
    // The outer context owns the section, so the provider's teardown reports the
    // consumer as unloading correctly.
    expect(section.owner).toBe(ctx)
  })

  it('installs no section when no settings provider is mounted', () => {
    const { ctx, installed, render } = createContext(false)
    apply(ctx, { widthPercent: 80 })
    expect(installed()).toBeUndefined()
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 80 } }])
  })

  it('registers the section when the provider composes after apply', () => {
    // Regression: acquiring the service once with `ctx.get` at apply time missed a
    // provider that mounted later, so the namespace stayed unregistered and every
    // Settings write was refused while the seed default masked the failure.
    const { ctx, mount, installed, render } = createDeferredContext()
    apply(ctx, { widthPercent: 88 })
    expect(installed()).toBeUndefined()
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 88 } }])
    mount()
    const section = installed()
    expect(section?.ns).toBe(SETTINGS_NAMESPACE)
    expect(section?.entry).toEqual({ widthPercent: 88 })
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 88 } }])
  })

  it('publishes the committed settings value in preference to the Loader config', () => {
    const { ctx, render, commit } = createContext(true)
    apply(ctx, { widthPercent: 95 })
    commit(60)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 60 } }])
  })

  it('reads the live value per render rather than freezing it at apply time', () => {
    const { ctx, render, commit } = createContext(true)
    apply(ctx, { widthPercent: 95 })
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 95 } }])
    commit(40)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 40 } }])
    commit(99)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 99 } }])
  })

  it('falls back to the Loader config when the settings provider detaches', () => {
    const { ctx, render, commit, detach } = createContext(true)
    apply(ctx, { widthPercent: 72.5 })
    commit(60)
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 60 } }])
    detach()
    expect(render()).toEqual([{ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: 72.5 } }])
  })
})
