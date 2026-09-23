# dsh-chat-wide

External [Cordis](https://deepseek-harness.github.io/deepseek-harness/) plugin for **DSH Web** that pins
**only the main conversation transcript column** to a configurable percentage of its available width
(default **95%**), so the message flow no longer sits in a narrow band in the middle of the pane.

The width is adjustable at runtime from **Settings → General → Transcript width**, applies live with no
reload, and is persisted so it survives a restart. The cordis plugin `config` remains available as a seed
layer for a deployment that wants a different starting point.

It also normalizes the markdown **tables** rendered in that transcript: every table fills the column, and a
table too wide to fit scrolls inside the column instead of overflowing the pane.

Nothing in `deepseek-harness` changes: the plugin overrides a handful of declarations through one
lifecycle-owned stylesheet.

## What it changes

```css
[data-slot='main.conversation'] [data-chat-flow] {
  max-width: 95%;
}

[data-slot='main.conversation'] [data-chat-flow] .md-table-wide {
  width: 100%;
  max-width: 100%;
  margin-left: 0;
  padding-left: 0;
  padding-bottom: 0;
  overflow-x: auto;
}

[data-slot='main.conversation'] [data-chat-flow] table {
  width: 100%;
  max-width: none;
}
```

* `[data-slot='main.conversation']` is the Slot Renderer's documented layout-neutral anchor for the main
  conversation route. The embedded sidebar chat is a sibling region and can never have that ancestor, so it
  cannot match these rules.
* `[data-chat-flow]` is the core transcript column marker.
* The column rule's specificity is (0,2,0) against the core `.column` rule's (0,1,0), so the override wins
  regardless of stylesheet order and needs no `!important`. The table rules are (0,3,0) and (0,2,1), above
  core's `.tableScroll` / `.tableFill` rules — no `!important` anywhere.
* The column rule declares `max-width` only — core already owns `width: 100%` on that element, and
  `--dsh-chat-content-width` / `--dsh-chat-user-width` are deliberately left untouched because the composer,
  the user bubble, auxiliary panels, and the width-handle geometry all read those axes.

### Tables

Every markdown table in the main transcript fills the column, two- and three-column tables included. A table
whose minimum content width still exceeds the column keeps that width and scrolls horizontally inside its
wrapper, so a wide table cannot push the transcript sideways.

The `.md-table-wide` rule also resets core's wide-table breakout. Core sizes that wrapper from the gutters
around `--dsh-chat-content-width` — `--dsh-table-spare: max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2))`
and `--dsh-table-lead: calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%)`
(`packages/client/ui-chat/src/client/chat/AssistantMarkdown.module.css:33-43`). On the pinned, nearly
full-bleed column those gutters are near zero, so the lead resolves negative: `margin-left` is then positive
while the negative `padding-left` is dropped as an invalid computed value, which shifts the wrapper right and
overflows the pane's right edge instead of scrolling. Pinning the wrapper back to the column removes that
mismatch, and `overflow-x: auto` replaces core's hover-only reveal (the wrapper rests at `overflow-x: hidden`)
with a bar that is present whenever the table cannot fit.

The embedded sidebar chat keeps core table behaviour: these rules require a `main.conversation` ancestor.

## Configuration

The width has **three layers**, resolved in this order — the first one that supplies a valid value wins:

| # | Layer | Where it comes from | Role |
| --- | --- | --- | --- |
| 1 | **User setting** | Settings → General → *Transcript width* (`dsh-chat-wide.widthPercent`) | Live value; overrides everything below |
| 2 | **Cordis `config` seed** | the plugin row's `config.widthPercent` in a `cordis.patch.yml` | Composition seed, published as the namespace's `base` layer |
| 3 | **Schema default** | `95` | Applied when neither layer above supplies a value |

| Field | Type | Default | Bounds |
| --- | --- | --- | --- |
| `widthPercent` | number | `95` | `1` – `100`, step `0.01` |

### The Settings control

The plugin contributes one row to the General Settings page — the same page that owns *Appearance*,
*Font size*, and *Transcript view*. It registers into the `settings.general.item` slot as id `chat-wide`
at order `13`, just after `transcript-view` (12).

The row is a numeric input. It commits on **blur** and on **Enter**; a value outside `1`–`100` is clamped
into range, and an empty or unparseable box is ignored, so an out-of-range or `NaN` value can never reach
the store. A typed value is quantized to the `0.01` step, because the namespace's own schema refuses a
finer one — writing it would fail the mutation instead of moving the transcript. The displayed value
always follows the persisted setting, never the keystroke echo.

The row's copy comes from dictionaries owned by this plugin (`src/client/locales/`), bound in `apply()` and
passed through the slot registration's inject face: an external plugin cannot merge the renderer-visible
locale namespace, so it cannot use the framework `t` seat.

### Where the value is persisted

Writes go through the settings provider, which persists the user layer to `settings.yaml` under the
harness home (`$DSH_HOME`, default `~/.dsh/settings.yaml`) — the machine-wide store the other General rows
use. The setting therefore **survives restarts** and applies to every profile.

### The injected global is only a first-paint seed

The Host still publishes `__DSH_CHAT_WIDE_CONFIG__` through `webserver/index-inject`, but it now reads the
**settings scope at emit time** rather than a frozen config object, so the seed reflects the current
setting. It is not the live value: the browser half binds the `dsh-chat-wide` namespace directly and
re-renders its stylesheet on every change, so a Settings write moves the transcript with no reload. A page
that loaded before the settings transport answered still shows the right width, because the resolution
order in the browser is **live settings section → injected global → schema default**.

Under `desktop-host` and `webworker-runtime` the index-injection table is captured once at boot, so the
plugin must already be active there for the seed to appear — the browser half's own namespace binding still
supplies the live value.

### Seeding the cordis config layer

```yaml
# cordis.patch.yml, profile patch, or ~/.dsh/cordis.patch.yml
- insert:
    - id: dsh-chat-wide
      name: 'dsh-chat-wide'
      config:
        widthPercent: 92
```

This row is a **seed**, not the final value: a width the user later picks in Settings wins over it. An
out-of-range seed fails at plugin load (the schema rejects it) instead of silently degrading the layout.
`NaN` is rejected too: the range check is paired with a `0.01` step, because `min`/`max` compare with
`<`/`>` and both report false for `NaN`.

The settings provider is optional. The Host reads it through `ctx.get('settings')` rather than declaring it
as an injection, so a profile without it (for example `headless`) loads the plugin normally with the cordis
`config` as the whole value — no crash, and no fiber parked on a service that will never arrive.

## Local build

```bash
pnpm install
pnpm run check     # tsc --noEmit across the host, client, and test faces
pnpm test          # vitest: unit + built-artifact specs
pnpm run build     # tsc (host) + tsc declarations + tsdown (dynamic client bundle)
```

Artifacts: `lib/index.js` (Host half, ESM, built by `tsc`) and `lib/client.js` (dynamic browser bundle, built
by `tsdown`). The client bundle hands its factory to the shell's module loader —
`window.__ModuleLoader__.load({ id: 'dsh-chat-wide', factory: (require) => { … } })` — and keeps React, its
JSX runtimes, and `@deepseek-ai/dsh-client-ui-primitives` external. Those are the client baseline rows
(`PLATFORM_MODULES` in `packages/client/web/src/platform.ts`), seeded once by the shell: the page must reach
that instance through the factory's `require`, because a second inlined copy would carry its own stylesheet
and its own React-facing identity. `tsdown.config.ts` states the baseline list explicitly, since it is
hand-rolled and cannot import `PLATFORM_MODULES` the way the in-repo client preset does.

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
column renders at the configured percentage of the conversation scroll box, its markdown tables fill that
column and scroll in place when they cannot fit, and the width handle stops resizing it while the plugin is
active.

## Verification

Measured through stable attributes and computed styles (never visual inspection alone):

```bash
# the seed global must be present in the served HTML before the browser step
curl -s http://127.0.0.1:3180/ | grep -o "__DSH_CHAT_WIDE_CONFIG__[^<]*"

# the persisted user layer, after moving the Settings control
grep -A2 'dsh-chat-wide' "${DSH_HOME:-$HOME/.dsh}/settings.yaml"

# one owned style element per activation, and it disappears on unload
# document.querySelectorAll("style[data-plugin='dsh-chat-wide']")
```

Then move the *Transcript width* control and confirm the transcript follows **without a reload**, and that
the value in `settings.yaml` matches. Compare, at two pane widths, the computed `max-width` of
`[data-slot='main.conversation'] [data-chat-flow]` against the `.scroll` content width, and confirm the
embedded conversation, composer, and user-bubble measurements match the pre-install baseline.

## Layout

```text
src/
  index.ts          Host half: Config schema re-export, settings section wiring, index-inject row, apply()
  config.ts         Dependency-free shared bounds, default, step, namespace, and coercion
  schema.ts         Host-only schemastery schema (kept out of the browser graph)
  client/
    index.ts        Browser half: bind the settings namespace, install the stylesheet, register the row
    global.d.ts     Declaration for the first-paint seed global
    styles.ts       Layered width resolution, scoped rule, ownership attributes, disposer
    WidthRow.ts     General Settings row: numeric input, commit/clamp rules, write path
    locales.ts      Locale entry point for the row's copy
    locales/en.ts   Copy dictionaries (zh authoritative for the key set, en checked against it)
```
