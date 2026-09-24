/**
 * Host-side width validation: the schema that guards plugin load, and the
 * coercion the browser half applies to the injected global.
 */
import { describe, expect, it } from 'vitest'

import type { Config as ConfigShape } from '../../src/config.ts'
import { Config } from '../../src/schema.ts'

import {
  CONFIG_GLOBAL,
  DEFAULT_WIDTH_PERCENT,
  isValidWidthPercent,
  PLUGIN_ID,
  resolveWidthPercent,
  SETTINGS_NAMESPACE,
  WIDTH_PERCENT_FIELD,
  WIDTH_PERCENT_MAX,
  WIDTH_PERCENT_MIN,
  WIDTH_PERCENT_STEP,
} from '../../src/config.ts'

/**
 * Run the schema over a hostile input and unwrap the live reference.
 *
 * The schema accepts `unknown` at runtime — that is the point of validating
 * operator configuration — so the cases below deliberately pass values the
 * inferred input type forbids. `widthPercent` is volatile, so the parsed value
 * is a reference the Loader keeps live; these cases assert the value it resolves.
 * @param value - Candidate configuration.
 * @returns The resolved configuration, or whatever the schema throws.
 */
function parse(value: unknown): ConfigShape {
  const resolved = (Config as unknown as (input: unknown) => { widthPercent: { get(): number } })(value)
  return { widthPercent: resolved.widthPercent.get() }
}

describe('plugin identity', () => {
  it('keeps the package id and injected global name stable', () => {
    // Both strings are contract: the loader registers `dsh-chat-wide`, and the
    // Host/Client handshake uses the global name verbatim.
    expect(PLUGIN_ID).toBe('dsh-chat-wide')
    expect(CONFIG_GLOBAL).toBe('__DSH_CHAT_WIDE_CONFIG__')
  })

  it('declares the documented default and bounds', () => {
    expect(DEFAULT_WIDTH_PERCENT).toBe(95)
    expect(WIDTH_PERCENT_MIN).toBe(1)
    expect(WIDTH_PERCENT_MAX).toBe(100)
  })

  it('pins the accepted step to the schema resolution', () => {
    // The Settings input quantizes with this constant, so a change here is a
    // change to the write path as well as to validation.
    expect(WIDTH_PERCENT_STEP).toBe(0.01)
  })

  it('keeps the settings namespace and field stable', () => {
    // The Host registers this namespace and the browser half binds this exact
    // string; a mismatch leaves the scope `unavailable` and the row read-only.
    expect(SETTINGS_NAMESPACE).toBe('dsh-chat-wide')
    expect(SETTINGS_NAMESPACE).toBe(PLUGIN_ID)
    expect(WIDTH_PERCENT_FIELD).toBe('widthPercent')
  })

  it('names the settings field identically to the configuration field', () => {
    // One home for the field name: the namespace section and the injected global
    // both carry `widthPercent`, so a rename cannot split the two carriers.
    const wired: ConfigShape = { [WIDTH_PERCENT_FIELD]: 95 }
    expect(parse(wired)).toEqual({ widthPercent: 95 })
  })
})

describe('isValidWidthPercent', () => {
  it('accepts in-range finite numbers', () => {
    for (const value of [1, 50, 95, 100, 12.5]) {
      expect(isValidWidthPercent(value)).toBe(true)
    }
  })

  it('rejects out-of-range, non-finite, and non-number values', () => {
    for (const value of [
      0,
      0.5,
      100.5,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '95',
      null,
      undefined,
      true,
      {},
      [],
      () => 95,
    ]) {
      expect(isValidWidthPercent(value)).toBe(false)
    }
  })
})

describe('Config schema', () => {
  it('defaults widthPercent to 95 when no configuration is supplied', () => {
    expect(parse({})).toEqual({ widthPercent: DEFAULT_WIDTH_PERCENT })
  })

  it('defaults widthPercent when the row omits it', () => {
    expect(parse({ widthPercent: undefined })).toEqual({ widthPercent: DEFAULT_WIDTH_PERCENT })
  })

  it('accepts in-range widths and keeps the exact value', () => {
    for (const widthPercent of [1, 50, 95, 100, 12.5]) {
      expect(parse({ widthPercent })).toEqual({ widthPercent })
    }
  })

  it('rejects widths below the minimum', () => {
    expect(() => parse({ widthPercent: 0 })).toThrow()
    expect(() => parse({ widthPercent: -5 })).toThrow()
    expect(() => parse({ widthPercent: 0.5 })).toThrow()
  })

  it('rejects widths above the maximum', () => {
    expect(() => parse({ widthPercent: 101 })).toThrow()
    expect(() => parse({ widthPercent: 1000 })).toThrow()
  })

  it('rejects non-numeric widths', () => {
    expect(() => parse({ widthPercent: '95' })).toThrow()
    expect(() => parse({ widthPercent: true })).toThrow()
    expect(() => parse({ widthPercent: [] })).toThrow()
  })

  it('treats an explicit null as an absent value, matching the schema default', () => {
    // Schemastery's `default` absorbs `null` the same way it absorbs a missing
    // key. Documented here so the behaviour is pinned rather than incidental.
    expect(parse({ widthPercent: null })).toEqual({ widthPercent: DEFAULT_WIDTH_PERCENT })
  })

  it('rejects non-finite widths', () => {
    expect(() => parse({ widthPercent: Number.NaN })).toThrow()
    expect(() => parse({ widthPercent: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => parse({ widthPercent: Number.NEGATIVE_INFINITY })).toThrow()
  })

  it('rejects widths finer than the accepted step', () => {
    expect(() => parse({ widthPercent: 33.333 })).toThrow()
    expect(parse({ widthPercent: 12.55 })).toEqual({ widthPercent: 12.55 })
  })
})

describe('resolveWidthPercent', () => {
  it('returns an in-range number unchanged', () => {
    expect(resolveWidthPercent(95)).toBe(95)
    expect(resolveWidthPercent(1)).toBe(1)
    expect(resolveWidthPercent(100)).toBe(100)
    expect(resolveWidthPercent(88.25)).toBe(88.25)
  })

  it('falls back to the default for out-of-range numbers', () => {
    expect(resolveWidthPercent(0)).toBe(DEFAULT_WIDTH_PERCENT)
    expect(resolveWidthPercent(-1)).toBe(DEFAULT_WIDTH_PERCENT)
    expect(resolveWidthPercent(100.5)).toBe(DEFAULT_WIDTH_PERCENT)
  })

  it('falls back to the default for non-finite numbers', () => {
    expect(resolveWidthPercent(Number.NaN)).toBe(DEFAULT_WIDTH_PERCENT)
    expect(resolveWidthPercent(Number.POSITIVE_INFINITY)).toBe(DEFAULT_WIDTH_PERCENT)
  })

  it('falls back to the default for non-number values', () => {
    for (const value of [undefined, null, '95', true, {}, [], () => 95]) {
      expect(resolveWidthPercent(value)).toBe(DEFAULT_WIDTH_PERCENT)
    }
  })
})
