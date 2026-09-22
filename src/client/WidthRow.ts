/**
 * Transcript-width row for the General Settings section.
 *
 * Presentation only. The persisted width arrives as the injected hook source
 * `widthPercent` (bound by the renderer as `useWidthPercent`), and every write
 * goes back through the injected `setWidthPercent` callback, so this component
 * never sees `ctx` and owns no subscription machinery. `copy` rides the same
 * face because an external plugin cannot merge the renderer-visible locale
 * namespace (see `./locales/en.ts`).
 *
 * Plain `createElement` over inline styles, matching this package's other
 * browser component: a CSS Modules sheet would need a stylesheet pipeline this
 * package's toolchain does not ship, so only shared `--dsw-*` tokens are
 * referenced and the row follows the active theme.
 *
 * The control is `Input` from the client primitives baseline module, which
 * forwards `InputHTMLAttributes` verbatim. It contributes no commit semantics of
 * its own, so blur/Enter commit, clamping, and refusal of invalid input are all
 * implemented here — the displayed value follows the persisted setting, never
 * the keystroke echo.
 */

import { createElement, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `settings.general.item` slot declaration and authorizes
// this row to be registered into it.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WIDTH_PERCENT_MAX, WIDTH_PERCENT_MIN, WIDTH_PERCENT_STEP } from '../config.ts'
import type { Translate } from './locales.ts'

/**
 * Decimal places the accepted step carries.
 *
 * Derived from {@link WIDTH_PERCENT_STEP} rather than spelled as `2`, so a step
 * change cannot leave the quantizer writing values the schema then refuses.
 */
const STEP_DECIMALS = (String(WIDTH_PERCENT_STEP).split('.')[1] ?? '').length

/** Power-of-ten scale of the accepted step. */
const STEP_SCALE = 10 ** STEP_DECIMALS

/** Registration-side face of the row: the live value, the write path, and the copy. */
export interface WidthRowInjected {
  hooks: {
    /** Persisted width percentage, bound by the renderer as `useWidthPercent`. */
    widthPercent: ObservableSnapshot<number>
  }
  /**
   * Persist one width.
   * @param percent - a value already clamped to the accepted bounds and quantized to the step.
   */
  setWidthPercent: (percent: number) => void
  /** Bound translate function over this row's dictionary. */
  copy: Translate
}

/** Full Settings-row props: runtime share plus the injected face. */
export type WidthRowProps = PropsRuntime<'settings.general.item'> & InjectFace<WidthRowInjected>

/**
 * Turn one raw input value into a width worth persisting.
 *
 * `type="number"` reports an empty value for anything it cannot parse, so an
 * empty box covers both "cleared" and "not a number"; the numeric guard keeps a
 * directly-supplied unparseable string out as well. A finite value is clamped to
 * the accepted bounds and quantized to {@link WIDTH_PERCENT_STEP}, because the
 * namespace's own schema refuses a finer value — writing one would fail the
 * mutation instead of moving the transcript.
 * @param raw - the input's own value.
 * @returns The value to write, or `undefined` when the input must be ignored.
 */
export function parseWidthInput(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  const clamped = Math.min(WIDTH_PERCENT_MAX, Math.max(WIDTH_PERCENT_MIN, parsed))
  return Math.round(clamped * STEP_SCALE) / STEP_SCALE
}

const MUTED = 'var(--dsw-alias-label-secondary, #6b7280)'

const styles = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    color: 'var(--dsw-alias-label-primary, #111827)',
  } satisfies CSSProperties,
  text: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 } satisfies CSSProperties,
  title: { fontWeight: 600 } satisfies CSSProperties,
  description: { color: MUTED, fontSize: '12px', lineHeight: 1.5 } satisfies CSSProperties,
  control: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 } satisfies CSSProperties,
  input: { width: '72px' } satisfies CSSProperties,
  unit: { color: MUTED, fontSize: '12px' } satisfies CSSProperties,
} as const

/**
 * Render the transcript-width row.
 * @param props - composed slot props (see {@link WidthRowProps}).
 * @returns the settings row element tree.
 */
export function WidthRow({ useWidthPercent, setWidthPercent, copy }: WidthRowProps): ReactNode {
  const widthPercent = useWidthPercent(value => value)
  // While the box is being edited it holds the raw keystrokes; on commit it
  // releases them so the displayed value comes from the persisted setting again.
  const [draft, setDraft] = useState<string | undefined>(undefined)

  const commit = (raw: string): void => {
    setDraft(undefined)
    const next = parseWidthInput(raw)
    if (next !== undefined) setWidthPercent(next)
  }

  return createElement('div', { style: styles.row },
    createElement('div', { style: styles.text },
      createElement('div', { style: styles.title }, copy('title')),
      createElement('div', { style: styles.description }, copy('description'))),
    createElement('div', { style: styles.control },
      createElement(Input, {
        style: styles.input,
        type: 'number',
        min: WIDTH_PERCENT_MIN,
        max: WIDTH_PERCENT_MAX,
        step: WIDTH_PERCENT_STEP,
        'aria-label': copy('inputLabel'),
        value: draft ?? String(widthPercent),
        onChange: (event: ChangeEvent<HTMLInputElement>) => { setDraft(event.currentTarget.value) },
        onBlur: (event: ChangeEvent<HTMLInputElement>) => { commit(event.currentTarget.value) },
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') commit(event.currentTarget.value)
        },
      }),
      createElement('span', { style: styles.unit }, copy('unit'))))
}
