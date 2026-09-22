/**
 * Browser half: drive the transcript width from Settings, live, and contribute
 * the Settings row that changes it.
 *
 * The namespace is the single runtime source of truth. Binding it here gives the
 * page the value in force and a subscription to every later change, so both
 * consumers follow one signal: the owned stylesheet rewrites itself, and the
 * Settings row reads the same snapshot through its injected hook source.
 *
 * Activation and cleanup ride Cordis effects, so reload, reconcile, and unload
 * cannot leave a stale style element or a live subscription behind.
 *
 * @module dsh-chat-wide/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.slots` service merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `settings.general.item` slot declaration, the
// `ctx.settingsScope` service merge, and the settings scope contracts.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the `ctx.locale` service merge whose active locale selects
// the dictionary the row binds.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { Config } from '../config.ts'
import { SETTINGS_NAMESPACE, WIDTH_PERCENT_FIELD } from '../config.ts'
import { WidthRow, type WidthRowInjected } from './WidthRow.ts'
import { bind, en, zh } from './locales.ts'
import { installStyles, resolveWidth } from './styles.ts'

export type { WidthRowInjected, WidthRowProps } from './WidthRow.ts'

/** Services this half reads; all three are shell-provided. */
export const inject = ['slots', 'settingsScope', 'locale']

/**
 * Apply the resolved transcript width live, and contribute the Settings row.
 * @param ctx - Browser-side plugin context owning the stylesheet effect.
 */
export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<Config>({ namespace: SETTINGS_NAMESPACE })
  const read = (): number => resolveWidth(scope.getSnapshot().value)
  installStyles(ctx, read, listener => scope.subscribe(listener))

  const copy = bind(ctx.locale.getSnapshot().active === 'zh' ? zh : en)
  // Built once, not per `inject()` call: the renderer caches each hook binding
  // per source object, so a fresh source on every render would tear the binding
  // down and re-add it on each pass of the same render loop.
  const widthSource: ObservableSnapshot<number> = {
    getSnapshot: read,
    subscribe: listener => scope.subscribe(listener),
  }
  const face: WidthRowInjected = {
    hooks: { widthPercent: widthSource },
    // A refused write needs no local handling: the displayed value follows the
    // settings snapshot, so a rejection simply leaves the previous width in place.
    setWidthPercent: (percent) => { void scope.set(WIDTH_PERCENT_FIELD, percent) },
    copy,
  }
  // `inject` waits for the General section to declare the slot, so this
  // registration needs no ordering edge against ui-settings-general.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'chat-wide',
    order: 13,
    inject: (): WidthRowInjected => face,
  }, WidthRow))
}
