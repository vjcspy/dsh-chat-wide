/**
 * Transcript width configuration shared by the Host half and the browser half.
 *
 * This module is deliberately dependency-free: the browser bundle imports it, so
 * anything added here ships to the page. The Host-only schema that validates
 * operator configuration lives in `./schema.ts` and builds on these bounds.
 *
 * The width has three layered homes, and every one of them is spelled here so no
 * half can drift from another: the schema default, the cordis `config` seed the
 * Loader validates, and the user setting persisted under {@link SETTINGS_NAMESPACE}.
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

/**
 * Smallest accepted width increment.
 *
 * It bounds the precision a layout percentage can carry, and it is the step the
 * Host schema validates against, so the Settings input must quantize to it before
 * writing: a finer value would be refused by the namespace's own schema.
 */
export const WIDTH_PERCENT_STEP = 0.01

/**
 * Settings namespace carrying the live transcript width.
 *
 * Equals the package id by the settings convention. The browser half binds this
 * exact string, and a namespace the Host never registered leaves that scope
 * `unavailable`, so the two halves must never spell it independently.
 */
export const SETTINGS_NAMESPACE = PLUGIN_ID

/** Field inside {@link SETTINGS_NAMESPACE} carrying the width percentage. */
export const WIDTH_PERCENT_FIELD = 'widthPercent'

/** Host configuration for the plugin. */
export interface Config {
  /** Transcript width as a percentage of the conversation scroll content box. */
  widthPercent: number
}

/**
 * Test whether an untrusted value is an accepted width percentage.
 *
 * The single bounds check every consumer shares: the Host schema validates
 * operator configuration with it, and the browser half re-validates both the
 * injected global and the live settings section with it.
 * @param value - Candidate read from configuration, a settings section, or the injected global.
 * @returns Whether the value is a finite in-range number.
 */
export function isValidWidthPercent(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= WIDTH_PERCENT_MIN
    && value <= WIDTH_PERCENT_MAX
  )
}

/**
 * Coerce an untrusted value into an accepted width percentage.
 * @param value - Candidate read from configuration, a settings section, or the injected global.
 * @returns The value when {@link isValidWidthPercent} accepts it, otherwise the default.
 */
export function resolveWidthPercent(value: unknown): number {
  return isValidWidthPercent(value) ? value : DEFAULT_WIDTH_PERCENT
}
