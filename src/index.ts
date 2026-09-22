/**
 * Host half: validate the transcript width and publish it to browser pages.
 *
 * The Host owns validation only. The browser half reads the injected global and
 * installs the stylesheet, so this entry stays free of DOM work and can load in
 * a headless profile without side effects.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Config } from './config.ts'

import { CONFIG_GLOBAL } from './config.ts'

export { Config } from './schema.ts'

/** The webserver service owns the index-render event this plugin hooks. */
export const inject = ['webServer']

/**
 * Publish the validated transcript width to every served page.
 *
 * The webserver emits `webserver/index-inject` per index render and reads live
 * subscriber state at emit time, so registering here is enough: no ordering
 * requirement against the first page load.
 * @param ctx - Host context that owns the webserver service.
 * @param config - Validated configuration resolved by the Loader.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: config })
  })
}
