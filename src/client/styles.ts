/**
 * Scoped stylesheet that pins the main transcript column to the configured width.
 *
 * The rule targets the Slot Renderer's `main.conversation` anchor plus the
 * transcript's own `data-chat-flow` marker, so the embedded sidebar conversation
 * (a sibling region with no `main.conversation` ancestor) can never match it.
 * Specificity (0,2,0) beats the core `.column` rule's (0,1,0), so no
 * `!important` is needed and stylesheet order does not matter.
 *
 * Only `max-width` is declared. Core already owns `width: 100%` on the column,
 * and `--dsh-chat-content-width` / `--dsh-chat-user-width` stay untouched
 * because the composer, user bubble, and auxiliary panels share those axes.
 */
import type { Context } from '@deepseek-ai/cordis'

import { CONFIG_GLOBAL, PLUGIN_ID, resolveWidthPercent } from '../config.ts'

/** Stable DOM anchor for the main conversation route rendered by ConversationPanel. */
const MAIN_SLOT = "[data-slot='main.conversation']"

/** Stable transcript marker emitted by the core chat column. */
const CHAT_FLOW = '[data-chat-flow]'

/** Stylesheet identity reported through the owned style element's `data-plugin-css`. */
const STYLE_ID = `${PLUGIN_ID}/transcript-width`

/**
 * Read the injected Host configuration off the browser global.
 *
 * The value is re-validated here rather than trusted: the global is page-supplied
 * data, and an absent or malformed value must fall back to the validated default.
 * @returns The accepted width percentage.
 */
export function readConfiguredWidth(): number {
  const injected = (globalThis as Record<string, unknown>)[CONFIG_GLOBAL]
  if (typeof injected !== 'object' || injected === null) return resolveWidthPercent(undefined)
  return resolveWidthPercent((injected as Record<string, unknown>).widthPercent)
}

/**
 * Render the single rule this plugin owns.
 * @param widthPercent - Validated width, interpolated as a number only.
 * @returns Stylesheet text for the main transcript column.
 */
export function renderStylesheet(widthPercent: number): string {
  return `${MAIN_SLOT} ${CHAT_FLOW} {\n  max-width: ${widthPercent}%;\n}\n`
}

/**
 * Acquire the owned style element for this fiber's lifetime.
 * @param ctx - Browser-side plugin context owning the effect.
 * @param widthPercent - Validated width percentage.
 */
export function installStyles(ctx: Context, widthPercent: number): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = renderStylesheet(widthPercent)
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, `${PLUGIN_ID}: transcript width stylesheet`)
}
