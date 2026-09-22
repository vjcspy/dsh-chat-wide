/**
 * Copy dictionaries for the transcript-width Settings row.
 *
 * Every user-visible string the row renders lives here and reaches the component
 * as the injected `copy` object, so no product string is spelled inside a
 * component body. The row cannot rely on the framework `t` seat: that seat is
 * typed per merged locale namespace in `@deepseek-ai/dsh-client-ui-slots`, and a
 * declaration this package merged into another package's interface would have to
 * be visible to that package's renderer, which an external plugin cannot arrange.
 * The dictionary is therefore bound in `apply()` and passed through the
 * registration's inject face.
 *
 * The Chinese dictionary is authoritative for the KEY SET; the English one is
 * checked against it, so a key added to one language cannot silently go missing
 * from the other.
 */

/** Simplified Chinese dictionary; also the key source of truth. */
export const zh = {
  title: '对话宽度',
  description: '主对话记录的宽度，按对话面板的百分比计算。改动立即生效，并保存到本机设置。',
  unit: '%',
  inputLabel: '对话宽度百分比',
} satisfies Record<string, string>

/** English dictionary, checked against the Chinese key set. */
export const en = {
  title: 'Transcript width',
  description: 'Width of the main transcript column, as a percentage of the conversation pane. A change takes effect immediately and is stored in the machine settings.',
  unit: '%',
  inputLabel: 'Transcript width percentage',
} satisfies Record<LocaleKey, string>

/** Every key the row's copy dictionary defines. */
export type LocaleKey = keyof typeof zh

/** One bound translate function over the row's dictionary. */
export type Translate = (key: LocaleKey, params?: Readonly<Record<string, string | number>>) => string

/**
 * Bind a dictionary to a translate function.
 * @param dict - the locale dictionary to read.
 * @returns a translate function with `{name}` placeholder substitution.
 */
export function bind(dict: Readonly<Record<string, string>>): Translate {
  return (key, params) => {
    const template = dict[key] ?? en[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name]
      return value === undefined ? match : String(value)
    })
  }
}
