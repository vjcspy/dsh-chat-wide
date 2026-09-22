/**
 * @vitest-environment jsdom
 *
 * Client-half behaviour: the exact emitted rule, the ownership attributes on the
 * style element, singleton activation, and removal through the effect disposer.
 */
import type { Context } from '@deepseek-ai/cordis'

import { afterEach, describe, expect, it } from 'vitest'

import { installStyles, readConfiguredWidth, renderStylesheet } from '../../src/client/styles.ts'
import { CONFIG_GLOBAL, DEFAULT_WIDTH_PERCENT } from '../../src/config.ts'

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

/** All style elements currently owned by the plugin. */
function ownedStyles(): HTMLStyleElement[] {
  return [...document.head.querySelectorAll<HTMLStyleElement>(STYLE_SELECTOR)]
}

afterEach(() => {
  document.head.innerHTML = ''
  delete (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
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
    installStyles(ctx, DEFAULT_WIDTH_PERCENT)
    expect(ownedStyles()).toHaveLength(0)
    run()
    expect(ownedStyles()).toHaveLength(1)
  })

  it('stamps the package id and the stylesheet id', () => {
    const { ctx, run } = createContext()
    installStyles(ctx, DEFAULT_WIDTH_PERCENT)
    run()
    const tag = ownedStyles()[0]!
    expect(tag.getAttribute('data-plugin')).toBe('dsh-chat-wide')
    expect(tag.getAttribute('data-plugin-css')).toBe('dsh-chat-wide/transcript-width')
    expect(tag.textContent).toBe(EXPECTED_RULE)
    expect(tag.parentElement).toBe(document.head)
  })

  it('removes the exact owned node when the effect disposes', () => {
    const { ctx, run } = createContext()
    installStyles(ctx, DEFAULT_WIDTH_PERCENT)
    const disposers = run()
    const tag = ownedStyles()[0]!
    expect(ownedStyles()).toHaveLength(1)
    for (const dispose of disposers) dispose()
    expect(ownedStyles()).toHaveLength(0)
    expect(tag.isConnected).toBe(false)
  })

  it('leaves unrelated style elements in place on disposal', () => {
    const foreign = document.createElement('style')
    foreign.setAttribute('data-plugin', 'some-other-plugin')
    document.head.appendChild(foreign)

    const { ctx, run } = createContext()
    installStyles(ctx, DEFAULT_WIDTH_PERCENT)
    const disposers = run()
    for (const dispose of disposers) dispose()

    expect(ownedStyles()).toHaveLength(0)
    expect(foreign.isConnected).toBe(true)
  })

  it('keeps one element per activation across dispose/re-activate cycles', () => {
    const width = DEFAULT_WIDTH_PERCENT
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const { ctx, run } = createContext()
      installStyles(ctx, width)
      const disposers = run()
      expect(ownedStyles()).toHaveLength(1)
      for (const dispose of disposers) dispose()
      expect(ownedStyles()).toHaveLength(0)
    }
  })
})

describe('readConfiguredWidth', () => {
  it('reads the injected global', () => {
    ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = { widthPercent: 82 }
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
      ;(globalThis as Record<string, unknown>)[CONFIG_GLOBAL] = injected
      expect(readConfiguredWidth()).toBe(DEFAULT_WIDTH_PERCENT)
    }
  })
})
