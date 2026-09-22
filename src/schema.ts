/**
 * Host-only configuration schema.
 *
 * Kept apart from `./config.ts` so the browser bundle never pulls schemastery —
 * a Host library with no business in the page — through the shared module.
 *
 * The same schema serves two jobs: the Loader validates the cordis `config` row
 * with it before the plugin applies, and the settings provider validates every
 * write to `dsh-chat-wide` with it. One schema therefore defines the accepted
 * values for the seed layer and the user layer alike.
 */
import z from '@deepseek-ai/schemastery'

import type * as shared from './config.ts'

import {
  DEFAULT_WIDTH_PERCENT,
  WIDTH_PERCENT_MAX,
  WIDTH_PERCENT_MIN,
  WIDTH_PERCENT_STEP,
} from './config.ts'

/**
 * `widthPercent` schema: bounded percentage, defaulting to the documented 95.
 *
 * The step is the finite guard. `min`/`max` compare with `<`/`>`, which both
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
    .step(WIDTH_PERCENT_STEP)
    .min(WIDTH_PERCENT_MIN)
    .max(WIDTH_PERCENT_MAX)
    .default(DEFAULT_WIDTH_PERCENT),
})
