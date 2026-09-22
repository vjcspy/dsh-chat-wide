/**
 * Browser half: install the transcript width stylesheet for this fiber's life.
 *
 * The entry reads the Host-injected global (re-validating it, since the page is
 * the source) and hands the resolved number to the owned stylesheet. Activation
 * and cleanup ride Cordis effects, so reload, reconcile, and unload cannot leave
 * a stale style element behind.
 */
import type { Context } from '@deepseek-ai/cordis'

import { installStyles, readConfiguredWidth } from './styles.ts'

/**
 * Apply the configured transcript width to the main conversation column.
 * @param ctx - Browser-side plugin context owning the stylesheet effect.
 */
export function apply(ctx: Context): void {
  installStyles(ctx, readConfiguredWidth())
}
