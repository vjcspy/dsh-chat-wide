/**
 * @vitest-environment jsdom
 *
 * Client-half behaviour: the resolution order the width is read through, the
 * exact emitted rule, the ownership attributes on the style element, live
 * re-render on a source change, singleton activation, and removal through the
 * effect disposer.
 */
import type { Context } from '@deepseek-ai/cordis'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installStyles,
  pickWidthPercent,
  readConfiguredWidth,
  renderStylesheet,
  resolveWidth,
} from '../../src/client/styles.ts'
import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT, WIDTH_PERCENT_FIELD } from '../../src/config.ts'

/** Exact rule the plugin owns, with the default width interpolated. */
const EXPECTED_RULE = "[data-slot='main.conversation'] [data-chat-flow] {\n  max-width: 95%;\n}\n"

const STYLE_SELECTOR = "style[data-plugin='dsh-chat-wide']"

interface EffectHarness {
  ctx: Context
  /** Run every registered effect body and collect its disposer, in registration order. */
  run: () => Array<() => void>
}

/**
 * Minimal Cordis context: `ctx.effect` is the only member this plugin uses.
 * @returns The fake context plus a runner that executes registered effects.
 */
function createContext(): EffectHarness {
  const bodies: Array<() => (() => void) | void> = []
  const ctx = {
    effect: (body: () => (() => void) | void) => {
      bodies.push(body)
      return () => {}
    },
  } as unknown as Context
  return {
    ctx,
    run: () => bodies.map(body => body() ?? (() => {})),
  }
}

/** A subscriber stub whose listener and release can be driven directly. */
interface Subscriber {
  subscribe: (listener: () => void) => () => void
  /** Invoke the registered listener, as a source change would. */
  fire: () => void
  /** Whether the plugin has released its subscription. */
  released: () => boolean
}

/**
 * Build a subscriber stub.
 * @returns the stub, its change driver, and its release probe.
 */
function createSubscriber(): Subscriber {
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    fire: () => { for (const listener of [...listeners]) listener() },
    released: () => listeners.size === 0,
  }
}

/** All style elements currently owned by the plugin. */
function ownedStyles(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>(STYLE_SELECTOR)]
}

/**
 * Set the Host-injected global, as the served index does.
 * @param value - the injected value.
 */
function injectGlobal(value: unknown): void {
  ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = value
}

afterEach(() => {
  document.head.innerHTML = ''
  delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
})

describe('pickWidthPercent', () => {
  it('returns the field value from a section that carries a valid width', () => {
    expect(pickWidthPercent({ [WIDTH_PERCENT_FIELD]: 82 })).toBe(82)
    expect(pickWidthPercent({ [WIDTH_PERCENT_FIELD]: 1 })).toBe(1)
    expect(pickWidthPercent({ [WIDTH_PERCENT_FIELD]: 100 })).toBe(100)
  })

  it('reports no value for an absent or non-object section', () => {
    for (const section of [undefined, null, 'wide', 42, [], () => 95]) {
      expect(pickWidthPercent(section)).toBeUndefined()
    }
  })

  it('reports no value for a malformed or out-of-range field', () => {
    // A layer that holds a bad value must fall through, not clamp: clamping here
    // would let the settings section shadow a perfectly good injected seed.
    for (const widthPercent of ['95', 0, 101, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(pickWidthPercent({ widthPercent })).toBeUndefined()
    }
  })
})

describe('resolveWidth', () => {
  it('prefers the live settings section over the injected global', () => {
    injectGlobal({ widthPercent: 90 })
    expect(resolveWidth({ widthPercent: 60 })).toBe(60)
  })

  it('falls back to the injected global when the section carries no valid value', () => {
    injectGlobal({ widthPercent: 90 })
    for (const section of [undefined, {}, { widthPercent: '60' }, { widthPercent: 0 }, { widthPercent: Number.NaN }]) {
      expect(resolveWidth(section)).toBe(90)
    }
  })

  it('falls back to the schema default when neither layer supplies a value', () => {
    expect(resolveWidth(undefined)).toBe(DEFAULT_WIDTH_PERCENT)
    injectGlobal({ widthPercent: 400 })
    expect(resolveWidth(undefined)).toBe(DEFAULT_WIDTH_PERCENT)
  })

  it('reads a finer value the settings layer accepted unchanged', () => {
    // The schema bounds and steppers the write path; the reader accepts anything
    // the bounds allow, so a value written by another client still renders.
    expect(resolveWidth({ widthPercent: 12.5 })).toBe(12.5)
  })
})

describe('renderStylesheet', () => {
  it('emits exactly one rule for the main transcript column', () => {
    expect(renderStylesheet(DEFAULT_WIDTH_PERCENT)).toBe(EXPECTED_RULE)
  })

  it('pins max-width only, leaving the shared width custom properties alone', () => {
    const css = renderStylesheet(95)
    expect(css).toContain('max-width: 95%')
    // The transcript-only boundary: these axes also drive the composer, the user
    // bubble, auxiliary panels, and the width-handle geometry.
    expect(css).not.toContain('--dsh-chat-content-width')
    expect(css).not.toContain('--dsh-chat-user-width')
    // Specificity (0,2,0) already beats the core `.column` rule (0,1,0).
    expect(css).not.toContain('!important')
    // Core owns `width: 100%`; declaring it again would fight the flex column.
    expect(css).not.toMatch(/(^|\s)width:/)
  })

  it('interpolates the validated number for any accepted width', () => {
    expect(renderStylesheet(100)).toContain('max-width: 100%')
    expect(renderStylesheet(12.5)).toContain('max-width: 12.5%')
    expect(renderStylesheet(1)).toContain('max-width: 1%')
  })
})

describe('installStyles', () => {
  it('creates one style element inside the effect body, not at call time', () => {
    const { ctx, run } = createContext()
    installStyles(ctx, () => DEFAULT_WIDTH_PERCENT, createSubscriber().subscribe)
    expect(ownedStyles()).toHaveLength(0)
    run()
    expect(ownedStyles()).toHaveLength(1)
  })

  it('stamps the package id and the stylesheet id', () => {
    const { ctx, run } = createContext()
    installStyles(ctx, () => DEFAULT_WIDTH_PERCENT, createSubscriber().subscribe)
    run()
    const tag = ownedStyles()[0]!
    expect(tag.getAttribute('data-plugin')).toBe('dsh-chat-wide')
    expect(tag.getAttribute('data-plugin-css')).toBe('dsh-chat-wide/transcript-width')
    expect(tag.textContent).toBe(EXPECTED_RULE)
    expect(tag.parentElement).toBe(document.head)
  })

  it('renders the value the reader reports at activation', () => {
    const { ctx, run } = createContext()
    installStyles(ctx, () => 72.5, createSubscriber().subscribe)
    run()
    expect(ownedStyles()[0]!.textContent).toContain('max-width: 72.5%')
  })

  it('rewrites the owned element in place when the source changes', () => {
    const { ctx, run } = createContext()
    const subscriber = createSubscriber()
    let width = 95
    installStyles(ctx, () => width, subscriber.subscribe)
    run()
    const tag = ownedStyles()[0]!

    width = 70
    subscriber.fire()

    expect(ownedStyles()).toHaveLength(1)
    expect(ownedStyles()[0]).toBe(tag)
    expect(tag.textContent).toContain('max-width: 70%')

    width = 100
    subscriber.fire()
    expect(ownedStyles()).toHaveLength(1)
    expect(tag.textContent).toContain('max-width: 100%')
  })

  it('removes the exact owned node when the effect disposes', () => {
    const { ctx, run } = createContext()
    installStyles(ctx, () => DEFAULT_WIDTH_PERCENT, createSubscriber().subscribe)
    const disposers = run()
    const tag = ownedStyles()[0]!
    expect(ownedStyles()).toHaveLength(1)
    for (const dispose of disposers) dispose()
    expect(ownedStyles()).toHaveLength(0)
    expect(tag.isConnected).toBe(false)
  })

  it('releases the subscription when the effect disposes', () => {
    const { ctx, run } = createContext()
    const subscriber = createSubscriber()
    installStyles(ctx, () => DEFAULT_WIDTH_PERCENT, subscriber.subscribe)
    const disposers = run()
    expect(subscriber.released()).toBe(false)
    for (const dispose of disposers) dispose()
    expect(subscriber.released()).toBe(true)
  })

  it('leaves unrelated style elements in place on disposal', () => {
    const foreign = document.createElement('style')
    foreign.setAttribute('data-plugin', 'some-other-plugin')
    document.head.appendChild(foreign)

    const { ctx, run } = createContext()
    installStyles(ctx, () => DEFAULT_WIDTH_PERCENT, createSubscriber().subscribe)
    const disposers = run()
    for (const dispose of disposers) dispose()

    expect(ownedStyles()).toHaveLength(0)
    expect(foreign.isConnected).toBe(true)
  })

  it('keeps one element per activation across dispose/re-activate cycles', () => {
    const width = DEFAULT_WIDTH_PERCENT
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const { ctx, run } = createContext()
      installStyles(ctx, () => width, createSubscriber().subscribe)
      const disposers = run()
      expect(ownedStyles()).toHaveLength(1)
      for (const dispose of disposers) dispose()
      expect(ownedStyles()).toHaveLength(0)
    }
  })

  it('touches no DOM when the page has none', () => {
    // A Host-side import of this module must not explode; the entry guards on
    // `document` rather than assuming a browser.
    const { ctx, run } = createContext()
    vi.stubGlobal('document', undefined)
    try {
      installStyles(ctx, () => DEFAULT_WIDTH_PERCENT, createSubscriber().subscribe)
      expect(run()).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(ownedStyles()).toHaveLength(0)
  })
})

describe('readConfiguredWidth', () => {
  it('reads the injected global', () => {
    injectGlobal({ widthPercent: 82 })
    expect(readConfiguredWidth()).toBe(82)
  })

  it('falls back to the default when the global is absent', () => {
    expect(readConfiguredWidth()).toBe(DEFAULT_WIDTH_PERCENT)
  })

  it('re-validates a malformed global instead of trusting the page', () => {
    const cases: unknown[] = [
      undefined,
      null,
      'wide',
      42,
      { widthPercent: '95' },
      { widthPercent: 0 },
      { widthPercent: 140 },
      { widthPercent: Number.NaN },
      { widthPercent: Number.POSITIVE_INFINITY },
    ]
    for (const injected of cases) {
      injectGlobal(injected)
      expect(readConfiguredWidth()).toBe(DEFAULT_WIDTH_PERCENT)
    }
  })
})
