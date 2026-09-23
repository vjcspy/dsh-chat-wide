/**
 * Scoped stylesheet that pins the main transcript column to the resolved width
 * and normalizes the markdown tables rendered inside it.
 *
 * Every rule targets the Slot Renderer's `main.conversation` anchor plus the
 * transcript's own `data-chat-flow` marker, so the embedded sidebar conversation
 * (a sibling region with no `main.conversation` ancestor) can never match one.
 * No rule needs `!important`: the column rule's (0,2,0) beats the core `.column`
 * rule's (0,1,0), the wide-wrapper rule's (0,3,0) beats core's base breakout
 * (0,2,0), and the table rule's (0,2,1) beats core's `.tableScroll table` and
 * `.tableFill table` (0,1,1). Core's `:hover` / `:focus-visible` reveal ties the
 * wide-wrapper rule at (0,3,0), where either winner still scrolls the table.
 *
 * The column rule declares `max-width` only. Core already owns `width: 100%` on
 * the column, and `--dsh-chat-content-width` / `--dsh-chat-user-width` stay
 * untouched because the composer, user bubble, and auxiliary panels share those
 * axes.
 *
 * The two table rules compensate for core geometry that assumes the transcript
 * is still on the shared width axis. Core's `md-table-wide` breakout sizes
 * itself from the gutters around `--dsh-chat-content-width`, so on the pinned,
 * nearly full-bleed column its lead offset resolves negative: `margin-left`
 * shifts the wrapper right while the negative `padding-left` is dropped as an
 * invalid computed value, painting a sideways shift and a right-edge overflow
 * instead of a scroll. Narrowing the wrapper back to the column and restoring
 * `overflow-x: auto` keeps the wide table inside the transcript with its own
 * scrollbar, and `width: 100%` fills every table — multi-column and two-column
 * alike — to the column before any overflow is considered.
 *
 * The width is resolved from layered sources and re-resolved on every change, so
 * a Settings write moves the transcript without a page reload.
 */
import type { Context } from '@deepseek-ai/cordis'

import {
  CONFIG_GLOBAL,
  isValidWidthPercent,
  PLUGIN_ID,
  resolveWidthPercent,
  WIDTH_PERCENT_FIELD,
} from '../config.ts'

/** Stable DOM anchor for the main conversation route rendered by ConversationPanel. */
const MAIN_SLOT = "[data-slot='main.conversation']"

/** Stable transcript marker emitted by the core chat column. */
const CHAT_FLOW = '[data-chat-flow]'

/** Stable hook the core markdown renderer puts on the wrapper of a 4+ column table. */
const WIDE_TABLE = '.md-table-wide'

/** Stylesheet identity reported through the owned style element's `data-plugin-css`. */
const STYLE_ID = `${PLUGIN_ID}/transcript-width`

/**
 * Pick a validated width out of one candidate section.
 *
 * A section is untrusted in both directions: the injected global is
 * page-supplied data, and a settings snapshot carries whatever the Host last
 * accepted. An absent section and one holding an invalid field are therefore the
 * same answer — no value from this layer — so callers can fall through instead
 * of mistaking a malformed value for a valid narrower one.
 * @param section - a candidate carrier of {@link WIDTH_PERCENT_FIELD}, of unknown shape.
 * @returns The accepted width, or `undefined` when this layer supplies none.
 */
export function pickWidthPercent(section: unknown): number | undefined {
  if (typeof section !== 'object' || section === null) return undefined
  const value = (section as Record<string, unknown>)[WIDTH_PERCENT_FIELD]
  return isValidWidthPercent(value) ? value : undefined
}

/**
 * Read the Host-injected width off the browser global.
 *
 * The value is re-validated here rather than trusted: the global is page-supplied
 * data, and an absent or malformed value must fall back to the validated default.
 * @returns The accepted width percentage, or the default.
 */
export function readConfiguredWidth(): number {
  return resolveWidthPercent(pickWidthPercent((globalThis as Record<string, unknown>)[CONFIG_GLOBAL]))
}

/**
 * Resolve the width in force: the live settings section, then the injected
 * global, then the schema default.
 *
 * The injected global is the Host's first-paint seed, so a page that loaded
 * before the settings transport answered still shows the right column; once the
 * section arrives, or whenever the user writes one, the settings value wins.
 * @param section - the live settings section value, or `undefined` before the first acceptance.
 * @returns The width percentage to render.
 */
export function resolveWidth(section: unknown): number {
  return pickWidthPercent(section) ?? readConfiguredWidth()
}

/**
 * Render the single stylesheet this plugin owns.
 * @param widthPercent - Validated width, interpolated as a number only.
 * @returns Stylesheet text for the main transcript column and its tables.
 */
export function renderStylesheet(widthPercent: number): string {
  return [
    `${MAIN_SLOT} ${CHAT_FLOW} {`,
    `  max-width: ${widthPercent}%;`,
    '}',
    '',
    `${MAIN_SLOT} ${CHAT_FLOW} ${WIDE_TABLE} {`,
    '  width: 100%;',
    '  max-width: 100%;',
    '  margin-left: 0;',
    '  padding-left: 0;',
    '  padding-bottom: 0;',
    '  overflow-x: auto;',
    '}',
    '',
    `${MAIN_SLOT} ${CHAT_FLOW} table {`,
    '  width: 100%;',
    '  max-width: none;',
    '}',
    '',
  ].join('\n')
}

/**
 * Acquire the owned style element, and follow the resolved width for the
 * fiber's lifetime.
 *
 * One effect owns both the element and the subscription, so the plugin can never
 * hold two style elements: a change rewrites the owned node's `textContent`
 * in place instead of replacing it, and the disposer removes that exact node
 * after releasing the subscription.
 * @param ctx - Browser-side plugin context owning the effect.
 * @param read - reads the width currently in force.
 * @param subscribe - observes changes in the width's source; returns its own disposer.
 */
export function installStyles(
  ctx: Context,
  read: () => number,
  subscribe: (listener: () => void) => () => void,
): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = STYLE_ID
    tag.textContent = renderStylesheet(read())
    document.head.appendChild(tag)
    const unsubscribe = subscribe(() => { tag.textContent = renderStylesheet(read()) })
    return () => {
      unsubscribe()
      tag.remove()
    }
  }, `${PLUGIN_ID}: transcript width stylesheet`)
}
