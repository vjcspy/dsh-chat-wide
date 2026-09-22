/**
 * Host-only configuration schema.
 *
 * Kept apart from `./config.ts` so the browser bundle never pulls schemastery —
 * a Host library with no business in the page — through the shared module. The
 * Loader resolves this schema before the plugin applies, so an out-of-range
 * `widthPercent` fails at load instead of silently degrading the transcript.
 */
import z from '@deepseek-ai/schemastery'

import type * as shared from './config.ts'

import { DEFAULT_WIDTH_PERCENT, WIDTH_PERCENT_MAX, WIDTH_PERCENT_MIN } from './config.ts'

/**
 * `widthPercent` schema: bounded percentage, defaulting to the documented 95.
 *
 * `step(0.01)` is the finite guard. `min`/`max` compare with `<`/`>`, which both
 * report false for `NaN`, so a bare range check would resolve `NaN` instead of
 * rejecting it. A step also bounds the precision a layout percentage can carry,
 * which is the meaningful resolution here.
 *
 * The interface is referenced through a namespace import because this module
 * exports the schema under the same name `Config`; a direct type import would
 * merge the two declarations and fail to compile.
 */
export const Config: z<{ widthPercent?: number }, shared.Config> = z.object({
  widthPercent: z
    .number()
    .step(0.01)
    .min(WIDTH_PERCENT_MIN)
    .max(WIDTH_PERCENT_MAX)
    .default(DEFAULT_WIDTH_PERCENT),
})
