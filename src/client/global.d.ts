/**
 * Declaration for the Host-injected configuration global.
 *
 * The Host publishes this value through `webserver/index-inject` as
 * `{ kind: 'global', name: '__DSH_CHAT_WIDE_CONFIG__', value: config }`, which
 * renders into the served HTML as `globalThis['__DSH_CHAT_WIDE_CONFIG__'] = …`.
 * It is optional because the Client bundle is a static asset: a page cached with
 * an older index, or a host that never injected the row, must still load.
 */
declare global {
  /** Validated Host configuration for the transcript width plugin. */
  var __DSH_CHAT_WIDE_CONFIG__: { widthPercent: number } | undefined
}

export {}
