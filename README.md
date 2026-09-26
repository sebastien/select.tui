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
    label: (_self, { count }) => `Count  ${count}`,
    keys: (self, { count }, key) => {
      if (key.name === "q") return self.quit();
      if (key.name === "left") self.update({ count: count - 1 });
      else if (key.name === "right") self.update({ count: count + 1 });
    },
  });

await render(Counter);
```

Run the bundled examples with `bun run example:counter`, `example:counter-markup`
or `example:login`.

## API

### `ui(source)`

Builds a component from an HTML string or a `markup` tree. The returned function
is a component factory with a chainable descriptor, mirroring select.js
`createComponent`:

- `ui(source)` — calling the component returns an applied wrapper:
  `Counter(data)` / `Counter.apply(data)` → `{ template, data }` (stable per
  `$key` via `_applyCache`). Mount with `Component.new()` or
  `render(Component)` / `testRender(Component)`; `render` also accepts a
  wrapper.
- `.init((self, data) => state)` — create the component's reactive data. A
  returned object replaces the data; top-level reactive values (cells) are
  subscribed automatically.
- `.does({ handler: (self, data, event) => result })` — behaviors used by
  `out`/`when`/`on:` bindings. Returning a plain object updates the data.
- `.cleanup((self, data) => …)` — called once on dispose.
- `.map(data, processor?, key?)` — map a collection to keyed child wrappers,
  rendered by binding the result to an `out` slot. `processor(value,
  indexOrKey)` builds each row's data; `key(value, indexOrKey)` (or a path
  string like `"id"`/`".id"`) sets its stable `$key`. A port of select.js's
  `UITemplate.map`: it preserves the input container shape via `remap`, so
  arrays stay arrays, Maps stay Maps, Sets stay Sets and plain objects stay
  plain objects. Without a `processor`, each item is wrapped as `{ $: item,
  $key }` (`{ $value: item, $key }` for array items). TUI delta: duplicate
  keys render as distinct rows (`#index` fallback) instead of collapsing.
- `.new(parent, options)` — creates a `TUIInstance`; `.apply(data)` — returns
  an applied wrapper (not an instance).

`ui.markup`, `ui.format`, `ui.unformat`, `ui.formats`, `ui.resolveFormat` expose
the hyperscript factories and the select.js format registry.

### `ui.component(name)`

Creates a **logic-only** definition. It is not renderable until bound to a
presentation with `.using(source)`:

```js
const Badge = ui.component("Badge")
  .init(() => ({ label: cell("hi") }))
  .does({ label: (_self, { label }) => label });

const Pill = Badge.using(`<box><text out="label"></text></box>`);
const Card = Badge.using(`<box border><text out="label"></text></box>`);
```

`.init/.does/.cleanup/.using` are available; `.new/.apply/.map` on an unbound
definition throw until `.using(source)` binds it (mirroring select.js
`createDefinitionComponent`). Both `ui(source)` components and
`ui.component(name)` definitions also expose `.using(source)` for rebinding.
The exported guards `isTemplateComponent(value)`, `isComponentDefinition(value)`
and `isAppliedTemplate(value)` distinguish the three kinds at runtime.

### `Component.map(data, processor?, key?)`

Returns a keyed `{ template, data }` wrapper collection preserving the input
shape (array, Map, Set or plain object via `remap`). Bind it to an `out`
slot to render each wrapper as a child instance (reconciled by `$key`):

```js
const Row = ui(`<box><text out="label"></text></box>`).does({
  label: (_self, data) => data.item,
});
const List = ui(`<box out="rows"></box>`).does({
  rows: (_self, data) =>
    Row.map(data.items, (item, index) => ({ item, index }), (item) => item),
});
```

### `Component.apply(data)` / calling `Component(data)`

Returns a single keyed `{ template, data }` wrapper, mirroring select.js
`UITemplate.apply`: when `data` carries a `$key`, the same wrapper identity is
reused across calls via `_applyCache`. Bind it to an `out` slot or pass it to
`render`/`testRender` (which unwrap it); use `.new()` for a direct instance.

### `ui.load(source)`

Fetches, parses and caches an external template URL/path (inline markup is
parsed directly and not fetched). It must be awaited **before** the same
source is passed to `ui(source)` or `.using(source)`: a resource-like source
that was never loaded throws rather than being misread as markup. Returns the
parsed AST.

### Behavior data

Behaviors receive **unwrapped plain values** (top-level cells are unwrapped),
matching select.js. Use `self.data` when you need the underlying cell, and
`self.update({ key: value })` to write back to one.

### `render(Component, rendererOrConfig?)`

Creates (or reuses) an OpenTUI renderer, mounts the component and returns the
instance. `instance.quit()` destroys an owned renderer, else disposes the
instance.

### `testRender(Component, { data, width, height, … })`

Creates an OpenTUI test renderer, mounts the component and returns the renderer
setup augmented with `instance`. Use `setup.renderOnce()` and
`setup.captureCharFrame()` in tests.

### Instance

Returned by `render`/`testRender` and `Component.new()`; mirrors select.js
`UIInstance` lifecycle:

- `set(data)` / `update(patch)` — replace/merge data with cell write-through.
- `pub(name, payload?)` / `on(event, handler)` / `off(event, handler)` —
  runtime events bubbling up the parent chain; `sub` handlers come from the
  template descriptor.
- `provide(key, value)` / `inject(key, default?)` — ancestor context;
  reactive cells auto re-render injectors.
- `effect(setup)` — runs `setup(self)`, tracks a returned teardown for
  `dispose()`.
- `quit()` / `dispose()` / `mount(target)` / `unmount()` — renderer-aware
  teardown and (re)mounting.
- `id` / `data` / `ref` / `parent` — identity (see `getTUIInstance(id)`),
  current data bag, `ref="name"` nodes, parent instance.

### `extend({ tag: Class | { Class, contentProp } | uiComponent })`

Registers additional tags. Passing `null` removes a tag. Built-in tags: `box`,
`text`, `input`, `scrollbox`. `getTags()` returns the live tag registry
(`getCatalogue()` is a compatibility alias) for advanced introspection.

### `markup`

A hyperscript proxy: `const { box, text } = markup; box({ … }, text("hi"))`.
Passing a plain object as the first argument treats it as attributes.

## Binding language

Attributes on a node drive binding and reactivity. `source` is a select.js
binding source (a key, a dotted path, or a behavior name).

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

List rendering uses `Component.map(collection, processor?, key?)` bound to an
`out` slot; each returned applied template renders as a keyed child instance.

`out` supports the select.js processor syntax (`out="name|upper"`) and string
templates (`out="Hello ${name}"`), and comparisons (`out="count>0"`).

`keypress` handlers are routed to the focused subtree: when a node is focused,
only handlers on its ancestors (or itself) run; when nothing is focused, all
handlers run.

## Porting status vs select.js

Aligned (reuse `select.js` directly where possible):

- Binding parsing/eval: `TemplateParser`, `evaluateParsedOut`,
  `createWhenPredicate`, `inferWhenKeys`, `resolveBindingValue`,
  `writeDataPath`, `UIEvent`, `unwrap`/`isReactive`, `remap`, `FORMATS`/`format`.
- Facade: `Component(...args)→apply`, `Component.apply/map/new/using`,
  `definition.new/apply/map` throw until `.using()`, `_applyCache`/`_mapCache`
  stable identity, shape-preserving `map`.
- Instances: `set`/`update` with cell write-through, `on`/`off`/`pub` bubbling,
  `effect` setup/teardown, `provide`/`inject` ancestor context (reactive
  cells auto re-render injectors), init-state seeding (construction data
  survives under `init()` state), `id` registry (`getTUIInstance`).
- Descriptor: `componentName`/`doCleanup` canonical with `name`/`cleanup`
  aliases kept in sync.

Intentional TUI subset (not ported):

- Sources: CSS selectors, DOM nodes, `<template>` registries, `#Key`
  references, JSON/CSS/SVG loads, `<style>` extraction.
- Templates: `singleton`, `lexicalTemplates`/`localTemplates`, `<slot>`
  content slots, webcomponents, `Dynamic`/`lazy`/`register`/`resolve`,
  `componentRootClass`, link interception, `virtual`/`mask`.
- Instances: `defaultData` host merging, cell fusion, `out-replace` node
  replacement.
- Host tags (`catalogue.js#TAGS`) are distinct from `COMPONENTS`: they map
  TUI renderables (`box`, `text`, `input`, `scrollbox`), not logic components.

## Development

```sh
bun test tests
```

Tests live in `tests/` and cover parsing, markup, slots, mapped lists, component
tags and the host lifecycle.
