/**
 * Host half: register the live transcript width as a user setting, and seed every
 * served page with its current value.
 *
 * The width has two layers here. The cordis `config` the Loader validated is the
 * composition seed, published as the settings namespace's `base`; the user layer
 * persisted through Settings overrides it. The Host holds no copy of the live
 * value: the index-render handler reads the settings scope at emit time, so a
 * change committed while the page is open is reflected by the next render.
 *
 * The browser half owns the live value from then on — it subscribes to the same
 * namespace directly — so the injected global only seeds first paint.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the `ctx.settings` service merge. The provider is reached
// through `ctx.get` at runtime, so the package stays an optional dependency.
import type {} from '@deepseek-ai/dsh-settings'
import type { Config } from './config.ts'

import { CONFIG_GLOBAL, SETTINGS_NAMESPACE } from './config.ts'
import { Config as WidthSettingsSchema } from './schema.ts'

export { Config } from './schema.ts'

/** The webserver service owns the index-render event this plugin hooks. */
export const inject = ['webServer']

/**
 * Wire the width into Settings and publish its current value to served pages.
 *
 * `settings` is read through `ctx.get` rather than declared as an injection: the
 * settings provider is optional, and a profile without it (headless) must load
 * this plugin normally — with the Loader config as the whole value — instead of
 * parking a fiber on a service that will never arrive.
 * @param ctx - Host context that owns the webserver service.
 * @param config - Validated configuration resolved by the Loader; the seed layer.
 */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  const settings = ctx.get('settings')
  if (settings !== undefined) {
    settings.installSection(ctx, SETTINGS_NAMESPACE, WidthSettingsSchema, config, {
      // Called with the scope's own reader while the provider is mounted, and
      // with the Loader config again if it detaches.
      setSource: (source) => { current = source },
      // Nothing re-registers on a commit: the index-render handler below reads
      // the scope at emit time, so a change needs no notification path.
      onChange: () => {},
    })
  }
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: CONFIG_GLOBAL, value: current() })
  })
}
