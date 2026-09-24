/**
 * Host-only configuration schema.
 *
 * Kept apart from `./config.ts` so the browser bundle never pulls schemastery —
 * a Host library with no business in the page — through the shared module.
 *
 * The schema serves two jobs: the Loader validates the cordis `config` row with
 * it before the plugin applies, and the settings provider projects its volatile
 * `widthPercent` field as the editable form. One schema therefore defines the
 * accepted values for the seed layer and the user layer alike.
 */
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import {
  DEFAULT_WIDTH_PERCENT,
  WIDTH_PERCENT_MAX,
  WIDTH_PERCENT_MIN,
  WIDTH_PERCENT_STEP,
} from './config.ts'

/**
 * Live Host configuration.
 *
 * The Loader keeps the `widthPercent` reference across a settings write, so the
 * plugin reads the current value through `get()` at emit time instead of holding
 * a copy of its own.
 */
export interface Config {
  /** Transcript width as a percentage of the conversation scroll content box. */
  widthPercent: Volatile<number>
}

/**
 * `widthPercent` schema: bounded percentage, defaulting to the documented 95.
 *
 * The step is the finite guard. `min`/`max` compare with `<`/`>`, which both
 * report false for `NaN`, so a bare range check would resolve `NaN` instead of
 * rejecting it. A step also bounds the precision a layout percentage can carry,
 * which is the meaningful resolution here.
 *
 * `volatile()` keeps the reference live: a settings write commits into it and
 * emits `loader/volatile-update` instead of remounting the plugin.
 */
export const Config = z.object({
  widthPercent: z
    .number()
    .step(WIDTH_PERCENT_STEP)
    .min(WIDTH_PERCENT_MIN)
    .max(WIDTH_PERCENT_MAX)
    .default(DEFAULT_WIDTH_PERCENT)
    .volatile(),
})
