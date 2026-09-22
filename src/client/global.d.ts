/**
 * Declaration for the Host-injected configuration global.
 *
 * The Host publishes this value through `webserver/index-inject` as
 * `{ kind: 'global', name: '__DSH_CHAT_WIDE_CONFIG__', value: config }`, which
 * renders into the served HTML as `globalThis['__DSH_CHAT_WIDE_CONFIG__'] = …`.
 * It is optional because the Client bundle is a static asset: a page cached with
 * an older index, or a host that never injected the row, must still load.
 *
 * The value is a FIRST-PAINT SEED, not the live setting. It carries whatever the
 * settings scope resolved to at index-render time; the browser half then follows
 * the settings namespace itself, which is the single runtime source of truth.
 */
declare global {
  /** Seed value for the transcript width, as resolved by the Host at index render. */
  var __DSH_CHAT_WIDE_CONFIG__: { widthPercent: number } | undefined
}

export {}
