/**
 * Host half: publish the live transcript width to every served page.
 *
 * The width has one home: the plugin's `Config`. The cordis `config` the Loader
 * validated is the composition seed; a user layer persisted through Settings is
 * committed into the same volatile reference by the Loader, so the index-render
 * handler reads the current value at emit time and a change committed while the
 * page is open is reflected by the next render.
 *
 * The browser half owns the live value from then on — it subscribes to the same
 * namespace directly — so the injected global only seeds first paint.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the `ctx.settings` service merge. The provider is reached
// through `ctx.inject` at runtime, so the package stays an optional dependency.
import type {} from '@deepseek-ai/dsh-settings'

import { CONFIG_GLOBAL } from './config.ts'
import { Config } from './schema.ts'

export { Config } from './schema.ts'

/** The webserver service owns the index-render event this plugin hooks. */
export const inject = ['webServer']

/**
 * Publish the live width to served pages.
 *
 * `settings` is reached through `ctx.inject` rather than a top-level injection:
 * that parks only the sub-fiber that owns this plugin's page policy, so a
 * profile without a settings provider (headless) still applies this plugin and
 * keeps the Loader config as the whole value.
 * @param ctx - Host context that owns the webserver service.
 * @param config - Validated live configuration resolved by the Loader; the seed layer.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    // The plugin ships its own Settings row, so it opts out of the generated
    // page. The policy belongs to this plugin instance.
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: { widthPercent: config.widthPercent.get() } })
  })
}
