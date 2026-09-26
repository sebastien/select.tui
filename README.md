```
                      ▐▓▓▒                         ▐▓▓▒         ▐▓▓▒                 ░▄
                      ▐██▓                         ▐██▓         ▐██▓                ▄█░
    ▄▄▄▄▄▄    ▄▄▄▄▄   ▐███      ▄▄▄▄▄      ▄▄▄▄▄   ▐███         ▐███     ▄▄▄  ▄▄▄▄ ▐▒▓▌
  ▄▒▒▒▒▒▒▓  ▄▒▒▒▒▒▒▒▄ ▐░██    ▄▒▒▒▒▒▒▒▄  ▄▒▒▒▒▒▒▒▄ ▐░██▓▒░      ▐░██▓▒░ ▐░▒▒ ▐▒▒▒▓  ▀░
▐▓▓▓▓▀     ▐▒▒▒▀▐▒▒▒▓ ▐░░░   ▐▒▒▒▀▐▒▒▒▓ ▐▒▒▒▀▐▒▒▒▒ ▐░░░         ▐░░░    ▐▒▒▒ ▐▒▒▒▓  ▄▄▄
▐████▄     ▐▓▓▓ ▐▓▓▓▓ ▐▒▒▒   ▐▓▓▓ ▐▓▓▓▓ ▐▓▓▓ ▐▓▓▓▓ ▐▒▒▒         ▐▒▒▒    ▐▓▓▓ ▐▓▓▓█ ▐▒▒▒
 ▀▀▓▓▓▓▄   ▐███ ▐██▀▀ ▐▓▓▒   ▐███ ▐██▀▀ ▐███  ▀▀▀▀ ▐▓▓▒         ▐▓▓▒    ▐███ ▐████ ▐▓▓▒
    ▀░▒▒▒▄ ▐███▄▀▀▀   ▐██▓   ▐███▄▀▀▀   ▐███       ▐██▓         ▐██▓    ▐███ ▐████ ▐██▓
     ▐░░░░ ▐▓▓▓  ▄▄▄▄ ▐███   ▐▓▓▓  ▄▄▄▄ ▐▓▓▓  ▄▄▄▄ ▐███         ▐███    ▐▓▓▓ ▐▓▓██ ▐███
     ▄███░ ▐▒▒▒  ▒▓▓▓ ▐███   ▐▒▒▒  ▒▓▓▓ ▐▒▒▒  ▒▓▓▓ ▐███         ▐███    ▐▒▒▒ ▐▒▓▓▓ ▐███
 ░▒▓█████▀ ▐░░░▄▓▒▒▒▌ ▐▓▓▓   ▐░░░▄▓▒▒▒▌ ▐░░░▄▓▒▒▒▌ ▐▓▓▓         ▐▓▓▓    ▐░░░▄█▒▒▒▌ ▐▓▓▓
 ░▒▓███▀    ▀▓█░░░▓▀  ▐▒▒▒    ▀▓█░░░▓▀   ▀██░░░█▀  ▐▒▒▒         ▐▒▒▒     ▀▓█░░░▓▀  ▐▒▒▒

```

`select/tui` is an extension to [select.js](https://github.com/sebastien/select.js), a
pure JavaScript UI library supporting [opentui](https://opentui.com) bindings. It's
designed to make is very easy to write components that have the same controller
logic, but a presentation in HTML and one in TUI.

## Install

```sh
bun add select.tui @opentui/core
```

`select.tui` depends on `select` (the select.js runtime). During development the
dependency is a symlink at `deps/selectjs`; the pinned revision lives in
`.gitdeps`.

## Quick start

```js
import { cell } from "select/state/cells";
import { render, ui } from "select.tui";

const Counter = ui(`
  <box width="42" height="9" alignItems="center" justifyContent="center" on:keypress="keys">
    <box width="38" height="7" padding="1" flexDirection="column" gap="1" alignItems="center">
      <text>Hello, OpenTUI!</text>
      <text out="label"></text>
      <text>left/right change | q quit</text>
    </box>
  </box>
`)
  .init(() => ({ count: cell(0) }))
  .does({
    label: (_self, { count }) => `Count  ${count.value}`,
    keys: (self, { count }, key) => {
      if (key.name === "q") return self.quit();
      if (key.name === "left") count.set(count.value - 1);
      else if (key.name === "right") count.set(count.value + 1);
    },
  });

await render(Counter);
```

Run the bundled examples with `bun run example:counter`, `example:counter-markup`
or `example:login`.

## API

### `ui(source)`

Builds a component from an HTML string or a `markup` tree. The returned function
is a component factory with a chainable descriptor:

- `ui(source)` — instantiate directly: `Counter()` / `Counter(data)`.
- `.init((self, data) => state)` — create the component's reactive data. A
  returned object replaces the data; top-level reactive values (cells) are
  subscribed automatically.
- `.does({ handler: (self, data, event) => result })` — behaviors used by
  `out`/`when`/`on:` bindings. Returning a plain object updates the data.
- `.cleanup((self, data) => …)` — called once on dispose.
- `.new(parent, options)` / `.apply(data)` — low-level constructors.

`ui.markup`, `ui.format`, `ui.unformat`, `ui.formats`, `ui.resolveFormat` expose
the hyperscript factories and the select.js format registry.

### `render(Component, rendererOrConfig?)`

Creates (or reuses) an OpenTUI renderer, mounts the component and returns the
instance. `instance.quit()` destroys an owned renderer, else disposes the
instance.

### `testRender(Component, { data, width, height, … })`

Creates an OpenTUI test renderer, mounts the component and returns the renderer
setup augmented with `instance`. Use `setup.renderOnce()` and
`setup.captureCharFrame()` in tests.

### `extend({ tag: Class | { Class, contentProp } | uiComponent })`

Registers additional tags. Passing `null` removes a tag. Built-in tags: `box`,
`text`, `input`, `scrollbox`.

### `markup`

A hyperscript proxy: `const { box, text } = markup; box({ … }, text("hi"))`.
Passing a plain object as the first argument treats it as attributes.

## Binding language

Attributes on a node drive binding and reactivity. `source` is a select.js
binding source (a key, a dotted path, `item`/`index`/`key` inside `each`, or a
behavior name).

| Attribute | Direction | Meaning |
| --- | --- | --- |
| `out="source"` | data → node | Sets the node's content (`text`, `input`) from the source. |
| `out:prop="source"` | data → node | Sets an arbitrary node property (e.g. `out:fg`). |
| `out-replace` | data → node | Alias of `out` (TUI nodes update in place). |
| `when="expr"` | data → visibility | Toggles `node.visible`; supports `!`, `?`, comparisons and `&&`/`\|\|`. |
| `in:prop="source"` | data → child | On a **component tag**, passes `source` to the child as `prop`; single-segment sources stay reactive, others re-sync on render. |
| `inout` / `inout:prop` | both | Two-way binding through an `input` event. |
| `on:event="handler"` | node → behavior | Calls a behavior; `@path` assigns, `!Event` publishes. |
| `ref="name"` | — | Stores the created node on `instance.ref`. |
| `each="source"` | — | Repeats the element (or its children) with keyed reconciliation. |
| `each:key="path"` | — | Stable key per item (default `name`/`id`/`key`, then index). |

Inside `each`, the row scope exposes `item`, `index`, `key` and `$key`.
`on:` handlers, `out`, `when` and `in:` all resolve against the row scope.

`out` supports the select.js processor syntax (`out="name|upper"`) and string
templates (`out="Hello ${name}"`), and comparisons (`out="count>0"`).

`keypress` handlers are routed to the focused subtree: when a node is focused,
only handlers on its ancestors (or itself) run; when nothing is focused, all
handlers run.

## Development

```sh
bun test tests
```

Tests live in `tests/` and cover parsing, markup, slots, `each`, component tags
and the host lifecycle.
