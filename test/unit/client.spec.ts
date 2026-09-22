/**
 * @vitest-environment jsdom
 *
 * Browser half, end to end against stubbed shell services: the services it
 * declares, the namespace it binds, the live re-render of the owned stylesheet
 * when the settings section moves, and the Settings row's registration and write
 * path.
 *
 * The settings scope is stubbed at its documented client surface
 * (`getSnapshot`/`subscribe`/`set`), so the assertions cover the exact calls the
 * plugin makes rather than a re-implementation of the transport.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'

import { afterEach, describe, expect, it } from 'vitest'

import type { Config as ConfigShape } from '../../src/config.ts'
import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT, SETTINGS_NAMESPACE } from '../../src/config.ts'
import { apply, inject } from '../../src/client/index.ts'
import type { WidthRowInjected } from '../../src/client/WidthRow.ts'
import { parseWidthInput } from '../../src/client/WidthRow.ts'
import { bind, en, zh } from '../../src/client/locales.ts'

const STYLE_SELECTOR = "style[data-plugin='dsh-chat-wide']"

/** One field write the plugin routed through the settings scope. */
interface WireWrite {
  field: string
  value: unknown
}

/** One registration captured from `ctx.slots.register`. */
interface RowRegistration {
  name: string
  id: string
  order: number
  inject: () => WidthRowInjected
}

/** A settings-scope stub plus its change driver. */
interface ScopeHarness {
  scope: unknown
  writes: WireWrite[]
  /** Accept a section, or `undefined` for the pre-first-acceptance state. */
  accept: (widthPercent: number | undefined) => void
  /** How many subscribers the plugin currently holds. */
  listeners: () => number
}

/**
 * Build a settings scope stub honouring the documented two identities: the
 * snapshot reference is stable until the section moves.
 * @returns the stub, its write log, and its drivers.
 */
function createScope(): ScopeHarness {
  const listeners = new Set<() => void>()
  const writes: WireWrite[] = []
  let value: ConfigShape | undefined
  let cached = buildSnapshot(value)
  const notify = (): void => {
    cached = buildSnapshot(value)
    for (const listener of [...listeners]) listener()
  }
  const scope = {
    getSnapshot: () => cached,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (field: string, next: unknown) => {
      writes.push({ field, value: next })
      value = { widthPercent: next as number }
      notify()
      return Promise.resolve()
    },
    mutate: () => Promise.resolve(),
    unset: () => Promise.resolve(),
  }
  return {
    scope,
    writes,
    accept: (widthPercent) => {
      value = widthPercent === undefined ? undefined : { widthPercent }
      notify()
    },
    listeners: () => listeners.size,
  }
}

/**
 * Build a snapshot for one accepted section.
 * @param value - the accepted section, or undefined before the first acceptance.
 * @returns the scope snapshot.
 */
function buildSnapshot(value: ConfigShape | undefined): unknown {
  return { status: 'ready', value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }
}

/** Everything the stub context recorded about one `apply`. */
interface ClientHarness {
  ctx: ClientContext
  /** Run every registered effect body and collect its disposer. */
  run: () => Array<() => void>
  /** Namespaces the plugin bound. */
  bound: Array<{ namespace: string }>
  /** Slot names the plugin asked to wait for, and their registration callbacks. */
  contributions: Array<{ name: string; install: () => void }>
  /** Row registrations the plugin performed once the slot was declared. */
  registrations: RowRegistration[]
}

/**
 * Minimal Cordis client context carrying the three services the plugin injects.
 * @param scope - the settings scope stub handed back by `bind`.
 * @returns the captured harness state.
 */
function createContext(scope: unknown): ClientHarness {
  const bodies: Array<() => (() => void) | void> = []
  const bound: Array<{ namespace: string }> = []
  const contributions: Array<{ name: string; install: () => void }> = []
  const registrations: RowRegistration[] = []
  const ctx = {
    effect: (body: () => (() => void) | void) => {
      bodies.push(body)
      return () => {}
    },
    settingsScope: {
      bind: (spec: { namespace: string }) => {
        bound.push(spec)
        return scope
      },
    },
    locale: { getSnapshot: () => ({ active: 'en' }) },
    slots: {
      inject: (name: string, install: () => void) => {
        contributions.push({ name, install })
        return () => {}
      },
      register: (definition: RowRegistration) => {
        registrations.push(definition)
        return () => {}
      },
    },
  } as unknown as ClientContext
  return {
    ctx,
    run: () => bodies.map(body => body() ?? (() => {})),
    bound,
    contributions,
    registrations,
  }
}

/**
 * Apply the browser half and complete its slot registration.
 * @param harness - the stub context harness.
 * @returns the harness plus the performed registration and its inject face.
 */
function activate(harness: ClientHarness): { registration: RowRegistration; face: WidthRowInjected } {
  const contribution = harness.contributions[0]
  if (contribution === undefined) throw new Error('apply registered into no slot')
  contribution.install()
  const registration = harness.registrations[0]
  if (registration === undefined) throw new Error('the slot contribution registered no row')
  return { registration, face: registration.inject() }
}

/** All style elements currently owned by the plugin. */
function ownedStyles(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>(STYLE_SELECTOR)]
}

afterEach(() => {
  document.head.innerHTML = ''
  delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
})

describe('browser half wiring', () => {
  it('declares the shell services it reads, and never a host-only one', () => {
    expect(inject).toEqual(['slots', 'settingsScope', 'locale'])
  })

  it('binds the plugin settings namespace', () => {
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    expect(harness.bound).toEqual([{ namespace: SETTINGS_NAMESPACE }])
    expect(harness.bound[0]!.namespace).toBe('dsh-chat-wide')
  })

  it('waits for the General section to declare the row slot', () => {
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    expect(harness.contributions).toHaveLength(1)
    expect(harness.contributions[0]!.name).toBe('settings.general.item')
    // Nothing is registered until that declaration appears.
    expect(harness.registrations).toHaveLength(0)
  })

  it('registers the row under the agreed id and order, after the in-tree rows', () => {
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { registration } = activate(harness)
    expect(registration.name).toBe('settings.general.item')
    expect(registration.id).toBe('chat-wide')
    // font-size is 11 and transcript-view is 12 in the shipped rows.
    expect(registration.order).toBe(13)
  })
})

describe('browser half stylesheet', () => {
  it('seeds from the injected global before any settings section arrives', () => {
    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 90 }
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    harness.run()
    expect(ownedStyles()[0]!.textContent).toContain('max-width: 90%')
  })

  it('prefers the accepted settings section over the injected global', () => {
    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 90 }
    const scope = createScope()
    scope.accept(60)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    harness.run()
    expect(ownedStyles()[0]!.textContent).toContain('max-width: 60%')
  })

  it('re-renders the owned element in place when the settings section moves', () => {
    const scope = createScope()
    scope.accept(95)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    harness.run()
    const tag = ownedStyles()[0]!
    expect(tag.textContent).toContain('max-width: 95%')

    scope.accept(70)
    expect(ownedStyles()).toHaveLength(1)
    expect(ownedStyles()[0]).toBe(tag)
    expect(tag.textContent).toContain('max-width: 70%')
  })

  it('falls back to the default when neither layer supplies a value', () => {
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    harness.run()
    expect(ownedStyles()[0]!.textContent).toContain(`max-width: ${DEFAULT_WIDTH_PERCENT}%`)
  })

  it('removes the single owned node and releases the subscription on disposal', () => {
    const scope = createScope()
    scope.accept(95)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const disposers = harness.run()
    expect(ownedStyles()).toHaveLength(1)
    expect(scope.listeners()).toBeGreaterThan(0)
    for (const dispose of disposers) dispose()
    expect(ownedStyles()).toHaveLength(0)
    expect(scope.listeners()).toBe(0)
  })

  it('ignores a change delivered after disposal', () => {
    const scope = createScope()
    scope.accept(95)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const disposers = harness.run()
    const tag = ownedStyles()[0]!
    for (const dispose of disposers) dispose()
    scope.accept(20)
    expect(ownedStyles()).toHaveLength(0)
    expect(tag.isConnected).toBe(false)
  })
})

describe('General row write path', () => {
  it('reads the value in force through its injected hook source', () => {
    const scope = createScope()
    scope.accept(72.5)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { face } = activate(harness)
    expect(face.hooks.widthPercent.getSnapshot()).toBe(72.5)

    scope.accept(80)
    expect(face.hooks.widthPercent.getSnapshot()).toBe(80)
  })

  it('falls back to the injected global through the hook source too', () => {
    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 88 }
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { face } = activate(harness)
    expect(face.hooks.widthPercent.getSnapshot()).toBe(88)
  })

  it('keeps one hook-source identity across inject calls', () => {
    // The renderer caches each hook binding per source object, so a fresh source
    // per render would tear the binding down and re-add it on every pass.
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { registration } = activate(harness)
    expect(registration.inject().hooks.widthPercent).toBe(registration.inject().hooks.widthPercent)
  })

  it('writes the accepted value into the namespace field', () => {
    const scope = createScope()
    scope.accept(95)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { face } = activate(harness)
    face.setWidthPercent(70)
    expect(scope.writes).toEqual([{ field: 'widthPercent', value: 70 }])
  })

  it('never writes an out-of-range or unparseable value', () => {
    const scope = createScope()
    scope.accept(95)
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { face } = activate(harness)
    const accepted = [0, 101, -5, Number.NaN, Number.POSITIVE_INFINITY, '']
      .map(raw => parseWidthInput(String(raw)))
      .filter(next => next !== undefined)
    for (const next of accepted) face.setWidthPercent(next)
    expect(scope.writes).toEqual([
      { field: 'widthPercent', value: 1 },
      { field: 'widthPercent', value: 100 },
      { field: 'widthPercent', value: 1 },
    ])
  })

  it('supplies every user-visible string from the dictionary', () => {
    const scope = createScope()
    const harness = createContext(scope.scope)
    apply(harness.ctx)
    const { face } = activate(harness)
    expect(face.copy('title')).toBe(en.title)
    expect(face.copy('description')).toBe(en.description)
    expect(face.copy('unit')).toBe(en.unit)
    expect(face.copy('inputLabel')).toBe(en.inputLabel)
  })
})

describe('parseWidthInput', () => {
  it('accepts values inside the bounds unchanged', () => {
    expect(parseWidthInput('95')).toBe(95)
    expect(parseWidthInput('1')).toBe(1)
    expect(parseWidthInput('100')).toBe(100)
    expect(parseWidthInput('12.5')).toBe(12.5)
  })

  it('clamps values outside the bounds', () => {
    expect(parseWidthInput('0')).toBe(1)
    expect(parseWidthInput('-40')).toBe(1)
    expect(parseWidthInput('101')).toBe(100)
    expect(parseWidthInput('1e3')).toBe(100)
  })

  it('ignores an empty or unparseable box', () => {
    for (const raw of ['', '   ', 'wide', 'NaN', 'Infinity']) {
      expect(parseWidthInput(raw)).toBeUndefined()
    }
  })

  it('quantizes to the step the settings schema validates against', () => {
    // A finer value would be refused by the namespace's own schema, so the write
    // path must never produce one.
    expect(parseWidthInput('33.333')).toBe(33.33)
    expect(parseWidthInput('12.567')).toBe(12.57)
    expect(parseWidthInput(' 95.5 ')).toBe(95.5)
  })
})

describe('copy dictionaries', () => {
  it('keeps the English dictionary complete against the authoritative key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('renders every key of both dictionaries', () => {
    for (const dictionary of [zh, en]) {
      const copy = bind(dictionary)
      for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
        expect(copy(key).length).toBeGreaterThan(0)
      }
    }
  })

  it('substitutes placeholders and leaves unknown ones intact', () => {
    const copy = bind({ withPlaceholder: 'kept {n} of {missing}' })
    expect(copy('withPlaceholder' as never, { n: 2 })).toBe('kept 2 of {missing}')
  })
})
