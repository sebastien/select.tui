// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/instance
// Instantiates OpenTUI renderables from a compiled template and applies slots.
//
// Concepts:
// - *slots*: `out`, `on:`, `when`, `inout`, `in`, `ref` bindings on a node.
// - *scope*: row-local data ({ item, index, key }) attached to the slots of a
//   repeated element; resolvers merge it over the instance data.
// - *each*: `each="source"` repeats the element's children (or the element
//   itself when it has none) with keyed reconciliation. `each-key="path"`
//   selects a stable key from the item; the default is `name`/`id`/`key`,
//   then the index.
// - *component tags*: a `ui()` template registered with `extend()` renders as
//   a nested instance under a wrapper box; `in:prop="source"` passes data
//   (single-segment sources keep their reactivity), events `pub()`ed by the
//   child bubble to the parent through the instance chain.
// - *applied lists*: `Component.map(...)` results bound to an `out` slot; each
//   wrapper renders as a keyed child instance reconciled by `$key`.

import { BoxRenderable, TextRenderable } from "@opentui/core";
import { unwrap } from "select/state/cells";
import { TemplateParser } from "select/ui/bindings.js";
import {
	createWhenPredicate,
	evaluateParsedOut,
	inferWhenKeys,
	resolveBindingValue,
	writeDataPath,
} from "select/ui/eval.js";
import { isReactive } from "select/utils/values.js";
import { appliedDataEquals, isAppliedTemplate } from "./applied.js";
import { normalizeCollection, resolveItemPath } from "./collections.js";
import { coerceOptions, getCatalogue } from "./catalogue.js";

function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function isWsText(node) {
	return node.type === "text" && !`${node.value ?? ""}`.trim();
}

// Function: unwrapData
// Returns a view of `data` with top-level reactive cells unwrapped to their
// plain values, so behavior handlers receive the same shape select.js delivers.
function unwrapData(data) {
	if (!data || typeof data !== "object") {
		return data;
	}
	const array = Array.isArray(data);
	let plain = null;
	for (const key in data) {
		const value = data[key];
		if (isReactive(value)) {
			if (!plain) {
				// Arrays must stay arrays: a spread would turn them into plain
				// objects keyed by index.
				plain = array ? data.slice() : { ...data };
			}
			plain[key] = unwrap(value);
		}
	}
	return plain || data;
}

// Function: isWithin
// True when `target` is `node` itself or a descendant of `node`, used to route
// global key events to the focused subtree.
function isWithin(node, target) {
	let cursor = target;
	while (cursor) {
		if (cursor === node) {
			return true;
		}
		cursor = cursor.parent;
	}
	return false;
}

function textContent(children) {
	let text = "";
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child.type === "text") {
			text += child.value;
		}
	}
	return text.trim();
}

function attrText(value) {
	return value === true || value === undefined || value === null ? "" : `${value}`;
}

function takeSlots(attrs) {
	const slots = {
		in: [],
		inout: [],
		on: [],
		out: [],
		ref: null,
		when: null,
	};
	const rest = {};
	let each;
	let eachKey;
	for (const name in attrs) {
		const value = attrs[name];
		if (name === "each") {
			each = attrText(value);
		} else if (name === "each:key" || name === "each-key" || name === "eachKey") {
			eachKey = attrText(value);
		} else if (name === "out" || name === "out-replace") {
			// NOTE: `out-replace` is accepted as an alias of `out`; replacing the
			// target renderable isn't meaningful for a TUI node, so both update
			// the node's content/property in place.
			slots.out.push({
				parsed: TemplateParser.ParseOutAttributeBinding(attrText(value)),
				prop: null,
			});
		} else if (name.startsWith("out:") || name.startsWith("out-")) {
			const prefix = name.startsWith("out:") ? "out:" : "out-";
			const prop = name.slice(prefix.length);
			const raw = value === true || value === "" ? prop : attrText(value);
			slots.out.push({
				parsed: TemplateParser.ParseOutAttributeBinding(raw),
				prop,
			});
		} else if (name.startsWith("on:")) {
			const event = name.slice(3);
			slots.on.push({
				event,
				parsed: TemplateParser.ParseEventEffect(attrText(value), event),
			});
		} else if (name === "when") {
			slots.when = TemplateParser.ParseWhenShorthand(attrText(value));
		} else if (name === "inout") {
			slots.inout.push({ key: attrText(value), prop: null });
		} else if (name.startsWith("inout:")) {
			const prop = name.slice(6);
			slots.inout.push({
				key: value === true || value === "" ? prop : attrText(value),
				prop,
			});
		} else if (name === "in") {
			slots.in.push({ key: attrText(value), prop: null });
		} else if (name.startsWith("in:")) {
			const prop = name.slice(3);
			slots.in.push({
				key: value === true || value === "" ? prop : attrText(value),
				prop,
			});
		} else if (name === "ref") {
			slots.ref = value === true ? true : value;
		} else {
			rest[name] = value;
		}
	}
	if (slots.when) {
		inferWhenKeys(slots.when, slots.out);
	}
	return { rest, slots, each, eachKey };
}

// Function: normalizeEachEntries
// Normalizes a collection (array, Map, Set, object) into
// `[{ key, item, index }]` rows with deduplicated string keys.
function normalizeEachEntries(collection, slot) {
	const entries = normalizeCollection(collection);
	const used = new Set();
	const rows = new Array(entries.length);
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		let key =
			entry.mapKey !== undefined
				? entry.mapKey
				: defaultItemKey(entry.value, entry.index, slot);
		key = typeof key === "string" ? key : `${key}`;
		if (used.has(key)) {
			let n = 0;
			let fallback = `#${i}`;
			while (used.has(fallback)) {
				fallback = `#${i}-${n++}`;
			}
			key = fallback;
		}
		used.add(key);
		rows[i] = { key, item: entry.value, index: entry.index };
	}
	return rows;
}

function defaultItemKey(item, index, slot) {
	if (slot.keyPath) {
		const key = resolveItemPath(item, slot.keyPath);
		return key === undefined || key === null ? index : key;
	}
	if (item !== null && item !== undefined && typeof item === "object") {
		return item.name ?? item.id ?? item.key ?? index;
	}
	return item;
}

class TUIInstance {
	constructor(template, parent, options = {}) {
		this.template = template;
		this.parent = parent || null;
		this.data = options.data;
		this.ref = {};
		this.nodes = null;
		this.ctx = null;
		this.renderer = null;
		this._ownedRenderer = null;
		this._disposed = false;
		this._queued = false;
		this._subs = [];
		this._listeners = [];
		this._out = [];
		this._on = [];
		this._when = [];
		this._inout = [];
		this._in = [];
		this._each = [];
		this._children = [];
		this._childInputs = [];
		this._runtimeSubs = undefined;
		if (template.initializer) {
			const state = template.initializer(this, this.data);
			if (state) {
				this.data = state;
			}
		}
		if (this.data === undefined || this.data === null) {
			this.data = {};
		}
		this._subscribe();
	}

	_subscribe() {
		const data = this.data;
		if (!data || typeof data !== "object") {
			return;
		}
		for (const key in data) {
			this._subscribeValue(data[key]);
		}
	}

	_subscribeValue(value) {
		if (!isReactive(value)) {
			return;
		}
		const handler = () => this._scheduleRender();
		value.sub(handler);
		this._subs.push([value, handler]);
	}

	_unsubscribeValue(value) {
		for (let i = 0; i < this._subs.length; i++) {
			if (this._subs[i][0] === value) {
				value.unsub(this._subs[i][1]);
				this._subs.splice(i, 1);
				return;
			}
		}
	}

	_scheduleRender() {
		if (this._queued || this._disposed) {
			return;
		}
		this._queued = true;
		queueMicrotask(() => {
			this._queued = false;
			if (!this._disposed) {
				this._render();
			}
		});
	}

	_scopedData(slot) {
		if (!slot?.scope) {
			return this.data || {};
		}
		return Object.assign({}, this.data, slot.scope);
	}

	_resolveOut(slot) {
		return evaluateParsedOut(this, unwrapData(this._scopedData(slot)), slot.parsed);
	}

	_resolveInValue(sourceKey, scope = null) {
		const data = scope
			? Object.assign({}, this.data, scope)
			: this.data || {};
		if (!`${sourceKey ?? ""}`.includes(".")) {
			const behavior = this.template.behavior?.[sourceKey];
			if (typeof behavior === "function") {
				// Behaviors receive the same unwrapped shape as every other
				// handler; the plain `data[sourceKey]` fallback still returns
				// the raw value so single-segment reactive sources pass through.
				return behavior(this, unwrapData(data), null);
			}
			return data[sourceKey];
		}
		return resolveBindingValue(data, { sourceKey }, false, this);
	}

	_dispatch(name, event, data) {
		const handler = this.template.behavior?.[name];
		if (typeof handler !== "function") {
			return;
		}
		const result = handler(this, unwrapData(data || this.data || {}), event);
		if (isPlainObject(result)) {
			this.update(result);
		}
	}

	_applyOut(slot, value) {
		const node = slot.node;
		const prop = slot.prop || slot.contentProp;
		if (prop === "focused") {
			if (value) {
				node.focus();
			} else if (node.focused) {
				node.blur();
			}
			return;
		}
		if (!prop) {
			return;
		}
		let next = value;
		if (prop === "content" || prop === "value") {
			next = value === undefined || value === null ? "" : `${value}`;
		} else if (value === undefined || value === null) {
			next = value;
		}
		if (node[prop] === next) {
			return;
		}
		node[prop] = next;
	}

	_create(ast, scope = null, _parentNode = null) {
		if (ast.type === "text") {
			return new TextRenderable(this.ctx, { content: ast.value.trim() });
		}
		const catalogue = getCatalogue();
		const entry = catalogue[ast.tag] ?? catalogue[ast.tag.toLowerCase()];
		if (!entry) {
			throw new Error(`select/tui: unknown tag <${ast.tag}>`);
		}
		const { rest, slots, each, eachKey } = takeSlots(ast.attrs);
		if (each !== undefined && each !== "") {
			return this._createEachTag(ast, entry, { rest, slots, each, eachKey, scope });
		}
		if (entry.Component) {
			return this._createComponentTag(ast, entry, { rest, slots, scope });
		}
		const options = coerceOptions(rest);
		const focused = options.focused;
		delete options.focused;
		if (ast.tag === "text") {
			const content = textContent(ast.children);
			if (content && options.content === undefined) {
				options.content = content;
			}
		}
		const node = new entry.Class(this.ctx, options);
		if (ast.tag !== "text") {
			const children = ast.children || [];
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (isWsText(child)) {
					continue;
				}
				node.add(this._create(child, scope, node));
			}
		}
		if (focused) {
			node.focus();
		}
		if (slots.ref) {
			this.ref[slots.ref === true ? ast.tag : slots.ref] = node;
		}
		for (let i = 0; i < slots.out.length; i++) {
			this._out.push({
				contentProp: entry.contentProp,
				node,
				parsed: slots.out[i].parsed,
				prop: slots.out[i].prop,
				scope,
			});
		}
		for (let i = 0; i < slots.on.length; i++) {
			this._on.push({
				event: slots.on[i].event,
				node,
				parsed: slots.on[i].parsed,
				scope,
			});
		}
		if (slots.when) {
			this._when.push({
				node,
				predicate: createWhenPredicate(slots.when),
				scope,
			});
		}
		for (let i = 0; i < slots.inout.length; i++) {
			this._inout.push({
				capture: true,
				key: slots.inout[i].key,
				node,
				prop: slots.inout[i].prop || entry.contentProp || "value",
				write: true,
				scope,
			});
		}
		for (let i = 0; i < slots.in.length; i++) {
			this._in.push({
				key: slots.in[i].key,
				node,
				prop: slots.in[i].prop || entry.contentProp || "value",
				scope,
			});
		}
		return node;
	}

	// Subsection: component tags

	_createComponentTag(ast, entry, { rest, slots, scope }) {
		const options = coerceOptions(rest);
		const focused = options.focused;
		delete options.focused;
		const wrapper = new BoxRenderable(this.ctx, options);
		if (focused) {
			wrapper.focus();
		}
		if (slots.ref) {
			this.ref[slots.ref === true ? ast.tag : slots.ref] = wrapper;
		}
		if (slots.when) {
			this._when.push({
				node: wrapper,
				predicate: createWhenPredicate(slots.when),
				scope,
			});
		}
		for (let i = 0; i < slots.out.length; i++) {
			this._out.push({
				contentProp: null,
				node: wrapper,
				parsed: slots.out[i].parsed,
				prop: slots.out[i].prop,
				scope,
			});
		}
		for (let i = 0; i < slots.on.length; i++) {
			this._on.push({
				event: slots.on[i].event,
				node: wrapper,
				parsed: slots.on[i].parsed,
				scope,
			});
		}
		const inputs = [];
		const data = {};
		for (let i = 0; i < slots.in.length; i++) {
			const inSlot = slots.in[i];
			const prop = inSlot.prop || inSlot.key;
			inputs.push({ key: inSlot.key, prop, scope });
			data[prop] = this._resolveInValue(inSlot.key, scope);
		}
		const child = entry.Component.new(this, { data });
		this._children.push(child);
		if (inputs.length) {
			this._childInputs.push({ child, inputs });
		}
		child.mount(wrapper);
		return wrapper;
	}

	// Function: _syncChildInputs
	// Re-resolves `in:` sources for mounted child components on every parent
	// render, so plain values, dotted paths and behavior-backed sources stay
	// in sync (single-segment reactive sources are passed through unchanged).
	_syncChildInputs() {
		if (!this._childInputs.length) {
			return;
		}
		for (let i = 0; i < this._childInputs.length; i++) {
			const entry = this._childInputs[i];
			const child = entry.child;
			if (child._disposed) {
				continue;
			}
			const patch = {};
			for (let j = 0; j < entry.inputs.length; j++) {
				const input = entry.inputs[j];
				patch[input.prop] = this._resolveInValue(input.key, input.scope);
			}
			child.update(patch);
		}
	}

	// Subsection: each (list iteration)

	_createEachTag(ast, entry, { rest, slots, each, eachKey, scope }) {
		const binding = TemplateParser.ParsePipedBinding(each, false);
		if (!binding) {
			throw new Error(`select/tui: invalid each binding "${each}"`);
		}
		const options = coerceOptions(rest);
		const focused = options.focused;
		delete options.focused;
		const children = (ast.children || []).filter((child) => !isWsText(child));
		if (entry.Component && children.length > 0) {
			throw new Error(
				`select/tui: <${ast.tag} each=...> cannot have children; wrap it in a box`,
			);
		}
		let rowAst;
		let container;
		if (children.length === 1) {
			rowAst = children[0];
			container = new entry.Class(this.ctx, options);
		} else if (children.length > 1) {
			rowAst = { type: "element", tag: "box", attrs: {}, children };
			container = new entry.Class(this.ctx, options);
		} else {
			// Self-repeat: the element itself is the row template.
			const attrs = Object.assign({}, ast.attrs);
			delete attrs.each;
			delete attrs["each:key"];
			delete attrs["each-key"];
			delete attrs.eachKey;
			rowAst = { type: "element", tag: ast.tag, attrs, children: [] };
			container = new BoxRenderable(this.ctx, {});
		}
		if (focused) {
			container.focus();
		}
		if (slots.ref) {
			this.ref[slots.ref === true ? ast.tag : slots.ref] = container;
		}
		if (slots.when) {
			this._when.push({
				node: container,
				predicate: createWhenPredicate(slots.when),
				scope,
			});
		}
		for (let i = 0; i < slots.out.length; i++) {
			this._out.push({
				contentProp: entry.contentProp,
				node: container,
				parsed: slots.out[i].parsed,
				prop: slots.out[i].prop,
				scope,
			});
		}
		// NOTE: `on:` handlers on an each element are cloned per row so they
		// resolve against the row scope (item/index/key).
		this._each.push({
			binding,
			container,
			keyPath: eachKey ? TemplateParser.ParseBindingPath(eachKey, true) : null,
			order: [],
			rows: new Map(),
			rowAst,
			rowOn: slots.on,
			scope,
		});
		return container;
	}

	// Subsection: applied-template lists (Component.map)
	//
	// `Component.map(...)` returns an array of `{ isAppliedTemplate, template,
	// data }` wrappers. When such an array is bound to an `out` slot, each item
	// is rendered as a child instance under the slot node, keyed by `$key`.

	_renderAppliedOut(slot, items) {
		const container = slot.node;
		if (!slot.applied) {
			slot.applied = new Map();
		}
		const rows = slot.applied;
		const keep = new Set();
		const order = new Array(items.length);
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const key = item.data?.$key ?? i;
			keep.add(key);
			order[i] = key;
			let row = rows.get(key);
			if (row && row.template !== item.template) {
				// Same key but a different component: replace the row instead
				// of reusing an instance built from a stale template.
				this._destroyAppliedRow(slot, key);
				row = null;
			}
			if (!row) {
				const wrapper = new BoxRenderable(this.ctx, {});
				const instance = item.template.new(this, { data: item.data });
				row = { instance, wrapper, data: item.data, template: item.template };
				rows.set(key, row);
				this._children.push(instance);
				container.add(wrapper);
				instance.mount(wrapper);
			} else if (!appliedDataEquals(row.data, item.data)) {
				row.instance.update(item.data);
				row.data = item.data;
			}
		}
		for (const key of Array.from(rows.keys())) {
			if (!keep.has(key)) {
				this._destroyAppliedRow(slot, key);
			}
		}
		const previous = slot.order;
		let reordered = !previous || previous.length !== order.length;
		if (!reordered) {
			for (let i = 0; i < order.length; i++) {
				if (order[i] !== previous[i]) {
					reordered = true;
					break;
				}
			}
		}
		if (reordered) {
			for (let i = 0; i < order.length; i++) {
				const row = rows.get(order[i]);
				container.remove(row.wrapper);
				container.add(row.wrapper, i);
			}
			slot.order = order;
		}
	}

	_destroyAppliedRow(slot, key) {
		const row = slot.applied?.get(key);
		if (!row) {
			return;
		}
		slot.applied.delete(key);
		// Evict the component's map-cache entry so long-lived lists do not grow
		// without bound as keys churn.
		row.template?._mapCache?.delete(key);
		const at = this._children.indexOf(row.instance);
		if (at >= 0) {
			this._children.splice(at, 1);
		}
		row.instance.dispose();
		slot.node.remove(row.wrapper);
		row.wrapper.destroyRecursively?.();
	}

	_clearAppliedOut(slot) {
		if (!slot.applied) {
			return;
		}
		for (const key of Array.from(slot.applied.keys())) {
			this._destroyAppliedRow(slot, key);
		}
		slot.applied = null;
		slot.order = null;
	}

	_renderEach(slot) {
		const data = this._scopedData(slot);
		const collection = resolveBindingValue(data, slot.binding, true, this);
		const entries = normalizeEachEntries(collection, slot);
		const keep = new Set();
		for (let i = 0; i < entries.length; i++) {
			keep.add(entries[i].key);
		}
		for (const key of Array.from(slot.rows.keys())) {
			if (!keep.has(key)) {
				this._destroyRow(slot, key);
			}
		}
		const order = new Array(entries.length);
		for (let i = 0; i < entries.length; i++) {
			const e = entries[i];
			order[i] = e.key;
			const row = slot.rows.get(e.key);
			if (row) {
				row.scope.item = e.item;
				row.scope.index = e.index;
				continue;
			}
			slot.rows.set(e.key, this._createRow(slot, e));
		}
		const reordered =
			order.length !== slot.order.length ||
			order.some((key, i) => key !== slot.order[i]);
		if (reordered) {
			for (let i = 0; i < order.length; i++) {
				const row = slot.rows.get(order[i]);
				slot.container.remove(row.node);
				slot.container.add(row.node, i);
			}
			slot.order = order;
		}
	}

	_createRow(slot, e) {
		const scope = Object.assign({}, slot.scope, {
			index: e.index,
			item: e.item,
			key: e.key,
			$key: e.key,
		});
		const marks = this._markSlotLengths();
		const node = this._create(slot.rowAst, scope, slot.container);
		slot.container.add(node);
		for (let i = 0; i < slot.rowOn.length; i++) {
			this._on.push({
				event: slot.rowOn[i].event,
				node,
				parsed: slot.rowOn[i].parsed,
				scope,
			});
		}
		const created = this._slotsSince(marks);
		const listeners = [];
		for (let i = 0; i < created.on.length; i++) {
			const s = created.on[i];
			const un = this._listen(s.node, s.event, (event) => this._runEvent(s, event));
			if (un) {
				listeners.push(un);
			}
		}
		for (let i = 0; i < created.inout.length; i++) {
			listeners.push(this._attachCapture(created.inout[i]));
		}
		for (let i = 0; i < created.in.length; i++) {
			listeners.push(this._attachCapture(created.in[i]));
		}
		for (let i = 0; i < created.out.length; i++) {
			const s = created.out[i];
			this._applyOut(s, this._resolveOut(s));
		}
		for (let i = 0; i < created.when.length; i++) {
			const s = created.when[i];
			s.node.visible = !!s.predicate(this, unwrapData(this._scopedData(s)));
		}
		for (let i = 0; i < created.each.length; i++) {
			this._renderEach(created.each[i]);
		}
		return { listeners, node, scope, slots: created };
	}

	_destroyRow(slot, key) {
		const row = slot.rows.get(key);
		if (!row) {
			return;
		}
		slot.rows.delete(key);
		for (let i = 0; i < row.listeners.length; i++) {
			row.listeners[i]();
		}
		this._unregisterSlots(row.slots);
		this._destroyEachSlots(row.slots.each);
		this._disposeChildren(row.slots.children);
		slot.container.remove(row.node);
		row.node.destroyRecursively();
	}

	_disposeChildren(children) {
		if (!children?.length) {
			return;
		}
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			child.dispose();
			const at = this._children.indexOf(child);
			if (at >= 0) {
				this._children.splice(at, 1);
			}
		}
		this._childInputs = this._childInputs.filter(
			(entry) => !entry.child._disposed,
		);
	}

	_destroyEachSlots(eachSlots) {
		for (let i = 0; i < eachSlots.length; i++) {
			const slot = eachSlots[i];
			for (const key of Array.from(slot.rows.keys())) {
				this._destroyRow(slot, key);
			}
			const at = this._each.indexOf(slot);
			if (at >= 0) {
				this._each.splice(at, 1);
			}
		}
	}

	_markSlotLengths() {
		return {
			children: this._children.length,
			each: this._each.length,
			in: this._in.length,
			inout: this._inout.length,
			on: this._on.length,
			out: this._out.length,
			when: this._when.length,
		};
	}

	_slotsSince(marks) {
		return {
			children: this._children.slice(marks.children),
			each: this._each.slice(marks.each),
			in: this._in.slice(marks.in),
			inout: this._inout.slice(marks.inout),
			on: this._on.slice(marks.on),
			out: this._out.slice(marks.out),
			when: this._when.slice(marks.when),
		};
	}

	_unregisterSlots(created) {
		this._each = this._each.filter((slot) => !created.each.includes(slot));
		this._in = this._in.filter((slot) => !created.in.includes(slot));
		this._inout = this._inout.filter((slot) => !created.inout.includes(slot));
		this._on = this._on.filter((slot) => !created.on.includes(slot));
		this._out = this._out.filter((slot) => !created.out.includes(slot));
		this._when = this._when.filter((slot) => !created.when.includes(slot));
	}

	// Subsection: events and capture

	_listen(node, event, handler) {
		const keyInput = this.renderer?.keyInput;
		if (event === "keypress") {
			if (!keyInput) {
				return null;
			}
			const routed = (keyEvent) => {
				const focused = this.renderer?.currentFocusedRenderable;
				if (focused && !isWithin(node, focused)) {
					return;
				}
				handler(keyEvent);
			};
			keyInput.on("keypress", routed);
			return () => keyInput.off("keypress", routed);
		}
		if (event === "click") {
			node.onMouseDown = handler;
			return () => {
				if (node.onMouseDown === handler) {
					node.onMouseDown = undefined;
				}
			};
		}
		node.on(event, handler);
		return () => node.off(event, handler);
	}

	_attachCapture(slot) {
		const handler = (value) => {
			const current = this.data?.[slot.key];
			if (isReactive(current)) {
				current.set(value);
				return;
			}
			this.update({ [slot.key]: value });
		};
		slot.node.on("input", handler);
		return () => slot.node.off("input", handler);
	}

	_runEvent(slot, event) {
		const parsed = slot.parsed;
		if (!parsed) {
			return;
		}
		const data = this._scopedData(slot);
		if (parsed.stopPropagation && typeof event?.stopPropagation === "function") {
			event.stopPropagation();
		}
		if (parsed.preventDefault && typeof event?.preventDefault === "function") {
			event.preventDefault();
		}
		if (parsed.mode === "assign") {
			writeDataPath(this, parsed.targetPath, event);
			this._scheduleRender();
			return;
		}
		if (parsed.mode === "publish") {
			let payload = data;
			if (parsed.binding) {
				payload = resolveBindingValue(data, parsed.binding, true, this);
			}
			this.pub(parsed.publishEvent, payload, true, event);
			return;
		}
		this._dispatch(parsed.handlerName, event, data);
	}

	_instantiate() {
		this._out.length = 0;
		this._on.length = 0;
		this._when.length = 0;
		this._inout.length = 0;
		this._in.length = 0;
		this._each.length = 0;
		this.ref = {};
		const roots = [];
		const ast = this.template.ast;
		for (let i = 0; i < ast.length; i++) {
			const node = ast[i];
			if (isWsText(node)) {
				continue;
			}
			roots.push(this._create(node));
		}
		this.nodes = roots;
	}

	_bind() {
		for (let i = 0; i < this._on.length; i++) {
			const slot = this._on[i];
			const un = this._listen(slot.node, slot.event, (event) =>
				this._runEvent(slot, event),
			);
			if (un) {
				this._listeners.push(un);
			}
		}
		for (let i = 0; i < this._inout.length; i++) {
			this._listeners.push(this._attachCapture(this._inout[i]));
		}
		for (let i = 0; i < this._in.length; i++) {
			this._listeners.push(this._attachCapture(this._in[i]));
		}
	}

	_unbind() {
		for (let i = 0; i < this._listeners.length; i++) {
			this._listeners[i]();
		}
		this._listeners.length = 0;
	}

	_render() {
		if (!this.nodes || this._disposed) {
			return;
		}
		for (let i = 0; i < this._each.length; i++) {
			this._renderEach(this._each[i]);
		}
		for (let i = 0; i < this._when.length; i++) {
			const slot = this._when[i];
			slot.node.visible = !!slot.predicate(this, unwrapData(this._scopedData(slot)));
		}
		const focuses = [];
		for (let i = 0; i < this._out.length; i++) {
			const slot = this._out[i];
			if (slot.prop === "focused") {
				focuses.push(slot);
				continue;
			}
			const value = this._resolveOut(slot);
			const isApplied =
				Array.isArray(value) &&
				(value.length > 0
					? value.every((item) => isAppliedTemplate(item))
					: slot.isApplied === true);
			if (isApplied) {
				slot.isApplied = true;
				this._renderAppliedOut(slot, value);
			} else {
				if (slot.isApplied) {
					this._clearAppliedOut(slot);
					slot.isApplied = false;
				}
				this._applyOut(slot, value);
			}
		}
		for (let i = 0; i < focuses.length; i++) {
			const slot = focuses[i];
			if (!this._resolveOut(slot) && slot.node.focused) {
				slot.node.blur();
			}
		}
		for (let i = 0; i < focuses.length; i++) {
			const slot = focuses[i];
			if (this._resolveOut(slot)) {
				slot.node.focus();
			}
		}
		for (let i = 0; i < this._inout.length; i++) {
			const slot = this._inout[i];
			const next = unwrap(this.data?.[slot.key]);
			const value = next === undefined || next === null ? "" : `${next}`;
			if (slot.node[slot.prop] !== value) {
				slot.node[slot.prop] = value;
			}
		}
		this._syncChildInputs();
	}

	set(data) {
		this.data = data === undefined || data === null ? {} : data;
		for (let i = 0; i < this._subs.length; i++) {
			this._subs[i][0].unsub(this._subs[i][1]);
		}
		this._subs.length = 0;
		this._subscribe();
		this._scheduleRender();
		return this;
	}

	update(data) {
		if (!data || typeof data !== "object") {
			return this.set(data);
		}
		if (!this.data || typeof this.data !== "object") {
			this.data = {};
		}
		for (const key in data) {
			const current = this.data[key];
			const next = data[key];
			if (isReactive(current) && !isReactive(next)) {
				current.set(next);
				continue;
			}
			if (isReactive(current) && isReactive(next) && current !== next) {
				this._unsubscribeValue(current);
			}
			if (isReactive(next) && !isReactive(current)) {
				this._subscribeValue(next);
			}
			this.data[key] = next;
		}
		this._scheduleRender();
		return this;
	}

	mount(target) {
		if (this._disposed) {
			return this;
		}
		const parent = target?.root ?? target;
		this.ctx = parent.ctx ?? target;
		this.renderer = this.ctx;
		if (!this.nodes) {
			this._instantiate();
		}
		for (let i = 0; i < this.nodes.length; i++) {
			parent.add(this.nodes[i]);
		}
		this._bind();
		this._render();
		return this;
	}

	unmount() {
		this._unbind();
		if (!this.nodes) {
			return this;
		}
		for (let i = 0; i < this.nodes.length; i++) {
			const node = this.nodes[i];
			node.parent?.remove(node);
		}
		return this;
	}

	quit() {
		if (this._ownedRenderer) {
			this._ownedRenderer.destroy();
			return this;
		}
		this.dispose();
		return this;
	}

	on(event, handler) {
		if (!this._runtimeSubs) {
			this._runtimeSubs = new Map();
		}
		const list = this._runtimeSubs.get(event);
		if (list) {
			list.push(handler);
		} else {
			this._runtimeSubs.set(event, [handler]);
		}
		return this;
	}

	off(event, handler) {
		const list = this._runtimeSubs?.get(event);
		if (!list) {
			return this;
		}
		const i = list.indexOf(handler);
		if (i >= 0) {
			list.splice(i, 1);
		}
		return this;
	}

	pub(name, data, includeSelf = true, orig = undefined) {
		let current = this;
		let first = true;
		while (current) {
			if (!first || includeSelf) {
				const payload =
					data === undefined ? unwrapData(current.data || {}) : unwrapData(data);
				if (current._runtimeSubs) {
					const list = current._runtimeSubs.get(name);
					if (list) {
						for (let i = 0; i < list.length; i++) {
							const result = list[i](current, payload, orig);
							if (isPlainObject(result)) {
								current.update(result);
							}
							if (result === false || result === null) {
								return this;
							}
						}
					}
				}
				const handler = current.template?.behavior?.[name];
				if (typeof handler === "function") {
					const result = handler(current, payload, orig);
					if (isPlainObject(result)) {
						current.update(result);
					}
					if (result === false || result === null) {
						return this;
					}
				}
			}
			first = false;
			current = current.parent;
		}
		return this;
	}

	dispose() {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._queued = false;
		if (typeof this.template.cleanup === "function") {
			this.template.cleanup(this, unwrapData(this.data || {}));
		}
		for (let i = 0; i < this._each.length; i++) {
			const slot = this._each[i];
			for (const key of Array.from(slot.rows.keys())) {
				this._destroyRow(slot, key);
			}
		}
		this._each.length = 0;
		for (let i = 0; i < this._children.length; i++) {
			this._children[i].dispose();
		}
		this._children.length = 0;
		this._childInputs.length = 0;
		this._unbind();
		for (let i = 0; i < this._subs.length; i++) {
			this._subs[i][0].unsub(this._subs[i][1]);
		}
		this._subs.length = 0;
		if (this.nodes) {
			for (let i = 0; i < this.nodes.length; i++) {
				this.nodes[i].destroyRecursively();
			}
		}
	}
}

export { isReactive, TUIInstance, unwrap };

// EOF
