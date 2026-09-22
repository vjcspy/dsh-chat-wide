/**
 * @vitest-environment jsdom
 *
 * Built-artifact contract: `lib/client.js` must exist, hand its factory to the
 * shell's module loader with the package id, export only `apply`, and install the
 * configured rule when that `apply` runs.
 *
 * The spec needs a built bundle, so `build:client` must have run first.
 */
import type { Context } from '@deepseek-ai/cordis'

import { existsSync, readFileSync, statSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT } from '../../src/config.ts'

const BUNDLE_PATH = 'lib/client.js'
const HOST_ENTRY_PATH = 'lib/index.js'

/** Specifiers the shell's preloaded module table is allowed to answer. */
const EXTERNAL_SPECIFIERS = new Set(['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'])

interface Registration {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/** Registrations captured from `window.__ModuleLoader__.load`. */
const registrations: Registration[] = []

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
/** Bare specifiers the bundle asked the shell's module table for. */
const requestedSpecifiers: string[] = []

beforeAll(() => {
  registration = captureRegistration()
  exports = registration.factory((specifier) => {
    requestedSpecifiers.push(specifier)
    throw new Error(`unexpected require(${specifier}) — react and its runtime must stay external`)
  })
})

afterAll(() => {
  document.head.innerHTML = ''
  delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
})

describe('built Client bundle', () => {
  it('exists and is non-empty', () => {
    expect(existsSync(BUNDLE_PATH)).toBe(true)
    expect(statSync(BUNDLE_PATH).size).toBeGreaterThan(0)
  })

  it('registers under the package id the loader expects', () => {
    expect(registration.id).toBe('dsh-chat-wide')
  })

  it('exports apply as its only value export', () => {
    expect(Object.keys(exports)).toEqual(['apply'])
    expect(typeof exports.apply).toBe('function')
  })

  it('exposes the Host apply entry as a separate artifact', () => {
    expect(existsSync(HOST_ENTRY_PATH)).toBe(true)
    expect(statSync(HOST_ENTRY_PATH).size).toBeGreaterThan(0)
  })

  it('keeps Host-only libraries out of the browser graph', () => {
    // `schemastery` is a Host dependency; reaching it from the page would fail
    // at load. The shared module therefore stays dependency-free.
    expect(requestedSpecifiers).not.toContain('@deepseek-ai/schemastery')
    expect(requestedSpecifiers.filter(specifier => !EXTERNAL_SPECIFIERS.has(specifier))).toEqual([])
  })
})

describe('built Client apply', () => {
  it('installs the injected width, and nothing else touches the DOM during load', () => {
    const effects: Array<() => (() => void) | void> = []
    const ctx = {
      effect: (body: () => (() => void) | void) => {
        effects.push(body)
        return () => {}
      },
    } as unknown as Context

    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 90 }
    expect(document.head.querySelectorAll("style[data-plugin='dsh-chat-wide']")).toHaveLength(0)

    ;(exports.apply as (ctx: Context) => void)(ctx)
    expect(effects).toHaveLength(1)
    for (const body of effects) body()

    const tags = [...document.head.querySelectorAll<HTMLStyleElement>("style[data-plugin='dsh-chat-wide']")]
    expect(tags).toHaveLength(1)
    expect(tags[0]!.textContent).toBe("[data-slot='main.conversation'] [data-chat-flow] {\n  max-width: 90%;\n}\n")
  })

  it('falls back to the documented default when the global is absent', () => {
    const effects: Array<() => (() => void) | void> = []
    const ctx = {
      effect: (body: () => (() => void) | void) => {
        effects.push(body)
        return () => {}
      },
    } as unknown as Context

    delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
    ;(exports.apply as (ctx: Context) => void)(ctx)
    for (const body of effects) body()

    const tags = [...document.head.querySelectorAll<HTMLStyleElement>("style[data-plugin='dsh-chat-wide']")]
    expect(tags.at(-1)!.textContent).toContain(`max-width: ${DEFAULT_WIDTH_PERCENT}%`)
  })
})
