/**
 * @vitest-environment jsdom
 *
 * Built-artifact contract: `lib/client.js` must exist, hand its factory to the
 * shell's module loader with the package id, export only what cordis loading
 * needs, request nothing outside the shell's baseline module table, and install
 * the resolved rules when that `apply` runs.
 *
 * The spec needs a built bundle, so `build:client` must have run first.
 */
import type { Context } from '@deepseek-ai/cordis'

import { existsSync, readFileSync, statSync } from 'node:fs'

import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { WidthRowInjected } from '../../src/client/WidthRow.ts'
import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT, SETTINGS_NAMESPACE } from '../../src/config.ts'

const BUNDLE_PATH = 'lib/client.js'
const HOST_ENTRY_PATH = 'lib/index.js'

/**
 * The client baseline: specifiers the shell seeds once and answers from its
 * module table. `PLATFORM_MODULES` in `packages/client/web/src/platform.ts` is
 * the authority; these are the rows this plugin can reach.
 */
const BASELINE_SPECIFIERS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

interface Registration {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/** Registrations captured from `window.__ModuleLoader__.load`. */
const registrations: Registration[] = []

/** Bare specifiers the bundle asked the shell's module table for. */
const requestedSpecifiers: string[] = []

/**
 * Answer one module request from a stand-in module table.
 *
 * React is the real module, so the bundle's hook identities are the shell's.
 * `ui-primitives` is a stand-in: the real row is a browser artifact whose CSS
 * Modules have no meaning here, and this spec asserts the request, not the part.
 * @param specifier - the bare specifier the bundle asked for.
 * @returns the module the table would hand back.
 */
function resolveModule(specifier: string): unknown {
  requestedSpecifiers.push(specifier)
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') return JsxRuntime
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { Input: () => null }
  throw new Error(`unexpected require(${specifier}) — not a client baseline module`)
}

/**
 * Evaluate the built bundle once, capturing its loader registration.
 * @returns The captured registration for the plugin bundle.
 */
function captureRegistration(): Registration {
  const source = readFileSync(BUNDLE_PATH, 'utf8')
  const loader = { load: (registration: Registration) => { registrations.push(registration) } }
  ;(globalThis as Record<string, unknown>).window = globalThis
  ;(globalThis as Record<string, unknown>).__ModuleLoader__ = loader
  try {
    new Function(source)()
  } finally {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).__ModuleLoader__
  }
  const registration = registrations.at(-1)
  if (registration === undefined) throw new Error(`${BUNDLE_PATH} did not call window.__ModuleLoader__.load`)
  return registration
}

let registration: Registration
let exports: Record<string, unknown>

beforeAll(() => {
  registration = captureRegistration()
  exports = registration.factory(resolveModule)
})

afterEach(() => {
  // Each case starts from an empty head: the bundle appends its element and
  // never adopts a foreign one, so a leftover would be read as this run's.
  document.head.innerHTML = ''
  delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
})

/** The stub context the built `apply` runs against. */
interface ApplyHarness {
  ctx: Context
  /** Run every registered effect body and collect its disposer. */
  run: () => Array<() => void>
  /** The rows the bundle registered once its slot declaration arrived. */
  rows: Array<{ name: string; id: string; order: number; inject: () => WidthRowInjected }>
}

/**
 * Minimal client context carrying the three services the bundle injects.
 * @param section - the settings section the stubbed scope holds.
 * @returns the context plus the effect runner and captured rows.
 */
function createContext(section: unknown): ApplyHarness {
  const bodies: Array<() => (() => void) | void> = []
  const rows: ApplyHarness['rows'] = []
  const snapshot = { status: 'ready', value: section, revision: 1, writable: true, mode: 'host' }
  const ctx = {
    effect: (body: () => (() => void) | void) => {
      bodies.push(body)
      return () => {}
    },
    settingsScope: {
      bind: () => ({
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        set: () => Promise.resolve(),
        unset: () => Promise.resolve(),
        mutate: () => Promise.resolve(),
      }),
    },
    locale: { getSnapshot: () => ({ active: 'en' }) },
    slots: {
      inject: (_name: string, install: () => void) => {
        install()
        return () => {}
      },
      register: (definition: ApplyHarness['rows'][number]) => {
        rows.push(definition)
        return () => {}
      },
    },
  } as unknown as Context
  return {
    ctx,
    run: () => bodies.map(body => body() ?? (() => {})),
    rows,
  }
}

/** The plugin-owned style element, when one exists. */
function ownedStyle(): HTMLStyleElement | undefined {
  return document.head.querySelector<HTMLStyleElement>("style[data-plugin='dsh-chat-wide']") ?? undefined
}

describe('built Client bundle', () => {
  it('exists and is non-empty', () => {
    expect(existsSync(BUNDLE_PATH)).toBe(true)
    expect(statSync(BUNDLE_PATH).size).toBeGreaterThan(0)
  })

  it('registers under the package id the loader expects', () => {
    expect(registration.id).toBe('dsh-chat-wide')
  })

  it('exports only what cordis loading needs', () => {
    expect(Object.keys(exports).sort()).toEqual(['apply', 'inject'])
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(['slots', 'settingsScope', 'locale'])
  })

  it('exposes the Host apply entry as a separate artifact', () => {
    expect(existsSync(HOST_ENTRY_PATH)).toBe(true)
    expect(statSync(HOST_ENTRY_PATH).size).toBeGreaterThan(0)
  })

  it('requests only client baseline modules, never a Host-only library', () => {
    // `schemastery` and the settings provider are Host dependencies; reaching
    // either from the page would fail at load. Every request the bundle makes
    // must be a row the shell has already seeded.
    expect(requestedSpecifiers).not.toContain('@deepseek-ai/schemastery')
    expect(requestedSpecifiers).not.toContain('@deepseek-ai/dsh-settings')
    expect(requestedSpecifiers.filter(specifier => !BASELINE_SPECIFIERS.has(specifier))).toEqual([])
    // The one non-React baseline row this plugin uses, so the assertion above
    // cannot pass vacuously.
    expect(requestedSpecifiers).toContain('@deepseek-ai/dsh-client-ui-primitives')
  })
})

describe('built Client apply', () => {
  it('installs the injected width, and nothing else touches the DOM during load', () => {
    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 90 }
    expect(ownedStyle()).toBeUndefined()

    const harness = createContext(undefined)
    ;(exports.apply as (ctx: Context) => void)(harness.ctx)
    harness.run()

    // The exact stylesheet text is `renderStylesheet`'s contract in the unit
    // spec; here the built bundle only has to install the injected width plus
    // the table rules around it.
    const css = ownedStyle()!.textContent!
    expect(css).toMatch(/^\[data-slot='main\.conversation'\] \[data-chat-flow\] \{\n  max-width: 90%;\n\}/)
    expect(css).toContain("[data-slot='main.conversation'] [data-chat-flow] .md-table-wide {")
    expect(css).toContain('overflow-x: auto;')
    expect(css).toContain("[data-slot='main.conversation'] [data-chat-flow] table {")
    expect(css).toContain('width: 100%;')
  })

  it('falls back to the documented default when the global is absent', () => {
    delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
    const harness = createContext(undefined)
    ;(exports.apply as (ctx: Context) => void)(harness.ctx)
    harness.run()

    expect(ownedStyle()!.textContent).toContain(`max-width: ${DEFAULT_WIDTH_PERCENT}%`)
  })

  it('prefers the settings section over the injected global', () => {
    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 90 }
    const harness = createContext({ widthPercent: 55 })
    ;(exports.apply as (ctx: Context) => void)(harness.ctx)
    harness.run()

    expect(ownedStyle()!.textContent).toContain('max-width: 55%')
  })

  it('registers the General Settings row once the slot declaration arrives', () => {
    const harness = createContext({ widthPercent: 95 })
    ;(exports.apply as (ctx: Context) => void)(harness.ctx)

    expect(harness.rows).toHaveLength(1)
    expect(harness.rows[0]!.name).toBe('settings.general.item')
    expect(harness.rows[0]!.id).toBe('chat-wide')
    expect(harness.rows[0]!.order).toBe(13)
    expect(SETTINGS_NAMESPACE).toBe('dsh-chat-wide')
  })
})
