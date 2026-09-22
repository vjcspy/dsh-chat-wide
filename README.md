# dsh-chat-wide

External [Cordis](https://deepseek-harness.github.io/deepseek-harness/) plugin for **DSH Web** that pins
**only the main conversation transcript column** to a configurable percentage of its available width
(default **95%**), so the message flow no longer sits in a narrow band in the middle of the pane.

Nothing in `deepseek-harness` changes: the plugin overrides one `max-width` declaration through a
lifecycle-owned stylesheet.

## What it changes

```css
[data-slot='main.conversation'] [data-chat-flow] {
  max-width: 95%;
}
```

* `[data-slot='main.conversation']` is the Slot Renderer's documented layout-neutral anchor for the main
  conversation route. The embedded sidebar chat is a sibling region and can never have that ancestor, so it
  cannot match this rule.
* `[data-chat-flow]` is the core transcript column marker.
* Specificity is (0,2,0) against the core `.column` rule's (0,1,0), so the override wins regardless of
  stylesheet order and needs no `!important`.
* Only `max-width` is declared — core already owns `width: 100%` on that element, and
  `--dsh-chat-content-width` / `--dsh-chat-user-width` are deliberately left untouched because the composer,
  the user bubble, auxiliary panels, and the width-handle geometry all read those axes.

## Configuration

The Host half validates the width and injects it into every served page through
`webserver/index-inject`; the browser half reads and **re-validates** it from the page global, falling back to
the validated default when it is absent or malformed.

| Field | Type | Default | Bounds |
| --- | --- | --- | --- |
| `widthPercent` | number | `95` | `1` – `100`, step `0.01` |

```yaml
# cordis.patch.yml, profile patch, or ~/.dsh/cordis.patch.yml
- insert:
    - id: dsh-chat-wide
      name: 'dsh-chat-wide'
      config:
        widthPercent: 92
```

An out-of-range value fails at plugin load (the schema rejects it) instead of silently degrading the layout.
`NaN` is rejected too: the range check is paired with a `0.01` step, because `min`/`max` compare with `<`/`>`
and both report false for `NaN`.

The browser global is `__DSH_CHAT_WIDE_CONFIG__`. It is refreshed **per index render** under `dsh web`. Under
`desktop-host` and `webworker-runtime` the index-injection table is captured once at boot, so the plugin must
already be active there for the global to appear — with the plugin inactive the page simply falls back to the
default width.

## Local build

```bash
pnpm install
pnpm run check     # tsc --noEmit across the host, client, and test faces
pnpm test          # vitest: unit + built-artifact specs
pnpm run build     # tsc (host) + tsc declarations + tsdown (dynamic client bundle)
```

Artifacts: `lib/index.js` (Host half, ESM, built by `tsc`) and `lib/client.js` (dynamic browser bundle, built
by `tsdown`). The client bundle hands its factory to the shell's module loader —
`window.__ModuleLoader__.load({ id: 'dsh-chat-wide', factory: (require) => { … } })` — and keeps React and its
JSX runtimes external, because the loader owns those instances.

`test/client/client-bundle.spec.ts` reads the **built** `lib/client.js`, so run `pnpm run build:client` before
`pnpm test` when the client sources changed.

## Install into a DSH profile

```bash
# from the DSH checkout, with the target profile's process stopped
pnpm dsh plugin add dsh-chat-wide --profile web   # or add the file: path to the profile manifest
```

The package declares `dsh.bundle.patch` → `cordis.patch.yml`, and that patch's single `insert` row is what
registers the plugin. A `file:` install may materialize as a **hardlink tree**: after a rebuild that replaces
files, compare inodes between this source tree and the installed copy, and refresh with `plugin remove` then
`plugin add` if the links are stale.

Verify on a **fresh** process — an already-running host cannot compose a newly installed bundle:

```bash
pnpm dsh web --port 3180 --no-open
```

## Remove / roll back

```bash
pnpm dsh plugin remove dsh-chat-wide --profile web
```

To keep the package installed but inactive, add `disabled: true` for the `dsh-chat-wide` row in
`~/.dsh/cordis.patch.yml` instead. Back up the profile's `package.json`, `pnpm-lock.yaml`, and
`pnpm-workspace.yaml` (when present) before any profile mutation.

## Deliberate boundary and accepted residuals

This plugin widens **the transcript only**. Recorded honestly, because they are consequences of that choice:

* **The core width handle no longer resizes the transcript.** The handle writes `--dsh-chat-user-width`, and the
  transcript previously consumed the derived `--dsh-chat-content-width` axis. While this plugin is active the
  handle keeps controlling its other core surfaces, and the transcript stays pinned at the configured
  percentage. This is accepted behaviour, not a regression to fix.
* The transcript no longer shares the composer's width axis, so it is wider than the composer cap.
* The transcript holds its configured width at every pane size instead of reflowing to the core adaptive
  formula.
* The handle strips fall inside the widened column, because the handle axis stays on
  `--dsh-chat-content-width` while the column is measured against the larger `.scroll` content box. Message
  text still paints above the strips; the `col-resize` hit area can cover transcript whitespace.

Unchanged by this plugin: the composer, the user bubble, auxiliary panels, the embedded sidebar chat, and the
right panel.

## Model Experience

The plugin adds no tool, prompt, or context surface. Its only model-visible effect is layout: the transcript
column renders at the configured percentage of the conversation scroll box, and the width handle stops
resizing it while the plugin is active.

## Verification

Measured through stable attributes and computed styles (never visual inspection alone):

```bash
# the injected global must be present in the served HTML before the browser step
curl -s http://127.0.0.1:3180/ | grep -o "__DSH_CHAT_WIDE_CONFIG__[^<]*"

# one owned style element per activation, and it disappears on unload
# document.querySelectorAll("style[data-plugin='dsh-chat-wide']")
```

Then compare, at two pane widths, the computed `max-width` of `[data-slot='main.conversation'] [data-chat-flow]`
against the `.scroll` content width, and confirm the embedded conversation, composer, and user-bubble
measurements match the pre-install baseline.

## Layout

```text
src/
  index.ts          Host half: Config schema re-export, index-inject row, apply()
  config.ts         Dependency-free shared bounds, default, and coercion
  schema.ts         Host-only schemastery schema (kept out of the browser graph)
  client/
    index.ts        Browser half: read the global, install the stylesheet
    global.d.ts     Declaration for the injected global
    styles.ts       Scoped rule generation, ownership attributes, disposer
```
