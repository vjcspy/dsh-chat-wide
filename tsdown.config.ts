/**
 * Dynamic Web Client bundle for the transcript width plugin.
 *
 * The DSH Client loads plugin bundles through the shell-owned module loader, so
 * the artifact must hand its factory to `window.__ModuleLoader__.load` instead of
 * exporting an ES module. `platform: 'browser'` + `format: 'cjs'` reproduce the
 * in-repo client-bundle preset, whose `require` answers from the preloaded
 * platform module table.
 *
 * React and its JSX runtimes are declared as externals because the loader — not
 * this bundle — owns those instances; inlining a second copy would break hooks.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is listed for the same reason and is
 * the client baseline's own rule ("baseline externals are implicit for every
 * dynamic bundle"): it is a `PLATFORM_MODULES` row the shell seeds once, so the
 * page must reach that instance through the factory's `require` rather than
 * carry a second copy with its own stylesheet. This config states the baseline
 * list explicitly because it is hand-rolled — the in-repo client preset derives
 * it from `PLATFORM_MODULES`, which an external plugin cannot import.
 *
 * The Host half is emitted by `tsc` (see `build:host`), which is why no `index`
 * entry appears here.
 */
import { defineConfig } from 'tsdown'

/** Package name; must equal the `id` the loader registers and `package.json` `name`. */
const PLUGIN_ID = 'dsh-chat-wide'

/** Specifiers left to the shell's preloaded module table. */
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
]

export default defineConfig({
  name: PLUGIN_ID,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: EXTERNAL },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
