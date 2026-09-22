/**
 * Transcript width configuration shared by the Host half and the browser half.
 *
 * This module is deliberately dependency-free: the browser bundle imports it, so
 * anything added here ships to the page. The Host-only schema that validates
 * operator configuration lives in `./schema.ts` and builds on these bounds.
 */

/** Package id stamped onto the injected global and the owned style element. */
export const PLUGIN_ID = 'dsh-chat-wide'

/** Name of the browser global carrying the resolved Host configuration. */
export const CONFIG_GLOBAL = '__DSH_CHAT_WIDE_CONFIG__'

/** Transcript width applied when no configuration is supplied. */
export const DEFAULT_WIDTH_PERCENT = 95

/** Narrowest accepted transcript width, as a percentage of the scroll content box. */
export const WIDTH_PERCENT_MIN = 1

/** Widest accepted transcript width, as a percentage of the scroll content box. */
export const WIDTH_PERCENT_MAX = 100

/** Host configuration for the plugin. */
export interface Config {
  /** Transcript width as a percentage of the conversation scroll content box. */
  widthPercent: number
}

/**
 * Coerce an untrusted value into an accepted width percentage.
 *
 * Used by the browser half on the injected global, and by the Host schema as its
 * bounds check, so both halves accept exactly the same values.
 * @param value - Candidate read from Host configuration or the injected global.
 * @returns The value when it is a finite in-range number, otherwise the default.
 */
export function resolveWidthPercent(value: unknown): number {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= WIDTH_PERCENT_MIN
    && value <= WIDTH_PERCENT_MAX
  ) {
    return value
  }
  return DEFAULT_WIDTH_PERCENT
}
