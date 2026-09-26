// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/instance
// Instantiates OpenTUI renderables from a compiled template and applies slots.
//
// Concepts:
// - *slots*: `out`, `on:`, `when`, `inout`, `in`, `ref` bindings on a node.
// - *scope*: row-local data attached to the slots of a nested node; resolvers
//   merge it over the instance data.
// - *component tags*: a `ui()` template registered with `extend()` renders as
//   a nested instance under a wrapper box; `in:prop="source"` passes data
//   (single-segment sources keep their reactivity), events `pub()`ed by the
//   child bubble to the parent through the instance chain.
// - *applied lists*: `Component.map(...)` results bound to an `out` slot; each
//   wrapper renders as a keyed child instance reconciled by `$key`.

import { BoxRenderable, TextRenderable } from "@opentui/core";
import { unwrap } from "select/state/cells";
import { TemplateParser } from "select/ui/bindings.js";
import { UIEvent } from "select/ui/components/model.js";
import {
	createWhenPredicate,
	evaluateParsedOut,
	inferWhenKeys,
	resolveBindingValue,
	writeDataPath,
} from "select/ui/eval.js";
import { isReactive } from "select/utils/values.js";
import { appliedDataEquals, isAppliedTemplate } from "./applied.js";
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

// Function: isAppliedCollection
// True when `value` is a mapped collection of applied templates in any shape
// `Component.map` can return: an array, a Map, a Set or a plain object. Empty
// containers count as applied so a previously-populated slot can be cleared.
function isAppliedCollection(value) {
	if (Array.isArray(value)) {
		return value.every((item) => isAppliedTemplate(item));
	}
	if (value instanceof Map) {
		for (const item of value.values()) {
			if (!isAppliedTemplate(item)) return false;
		}
		return true;
	}
	if (value instanceof Set) {
		for (const item of value) {
			if (!isAppliedTemplate(item)) return false;
		}
		return true;
	}
	if (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	) {
		for (const key in value) {
			if (!isAppliedTemplate(value[key])) return false;
		}
		return true;
	}
	return false;
}

function isEmptyAppliedCollection(value) {
	if (Array.isArray(value)) return value.length === 0;
	if (value instanceof Map || value instanceof Set) return value.size === 0;
	return (
		value !== null &&
		typeof value === "object" &&
		Object.keys(value).length === 0
	);
}

// Ordered applied-template items, flattening any collection shape.
function appliedCollectionItems(value) {
	if (Array.isArray(value)) return value;
	if (value instanceof Map) return Array.from(value.values());
	if (value instanceof Set) return Array.from(value);
	return Object.values(value);
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
	for (const name in attrs) {
		const value = attrs[name];
		if (name === "out" || name === "out-replace") {
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
	return { rest, slots };
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
		return evaluateParsedOut(this, this._scopedData(slot), slot.parsed);
	}

	_resolveInValue(sourceKey, scope = null) {
		const data = scope
			? Object.assign({}, this.data, scope)
			: this.data || {};
		if (!`${sourceKey ?? ""}`.includes(".")) {
			const behavior = this.template.behavior?.[sourceKey];
			if (typeof behavior === "function") {
				// Behaviors receive the raw data bag, exactly like select.js.
				return behavior(this, data, null);
			}
			// Single-segment sources pass the cell through so the child
			// subscribes directly; select.tui re-pushes `in:` a frame later
			// through `_syncChildInputs`, so the cell keeps updates immediate.
			return data[sourceKey];
		}
		return resolveBindingValue(data, { sourceKey }, false, this);
	}

	_dispatch(name, event, data) {
		const handler = this.template.behavior?.[name];
		if (typeof handler !== "function") {
			return;
		}
		const result = handler(this, data || this.data || {}, event);
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
		const { rest, slots } = takeSlots(ast.attrs);
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

	// Subsection: applied-template lists (Component.map)
	//
	// `Component.map(...)` returns applied-template wrappers in the shape of the
	// input collection (array, Map, Set or plain object). When bound to an `out`
	// slot, each wrapper renders as a child instance under the slot node, keyed
	// by `$key`.

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

	_unregisterSlots(created) {
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
				payload = resolveBindingValue(data, parsed.binding, false, this);
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
		for (let i = 0; i < this._when.length; i++) {
			const slot = this._when[i];
			slot.node.visible = !!slot.predicate(this, this._scopedData(slot));
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
				isAppliedCollection(value) &&
				(!isEmptyAppliedCollection(value) || slot.isApplied === true);
			if (isApplied) {
				slot.isApplied = true;
				this._renderAppliedOut(slot, appliedCollectionItems(value));
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
		const payload = data === undefined ? this.data || {} : data;
		const event = new UIEvent(name, payload, this, orig);
		let current = this;
		let first = true;
		while (current) {
			if (!first || includeSelf) {
				event.current = current;
				const selfData = current.data || {};
				const dispatch = (handler) => {
					const result = handler(current, selfData, event);
					if (isPlainObject(result)) {
						current.update(result);
					}
					return result === false || result === null ? "stop" : "continue";
				};
				if (current._runtimeSubs) {
					const list = current._runtimeSubs.get(name);
					if (list) {
						for (let i = 0; i < list.length; i++) {
							if (dispatch(list[i]) === "stop") {
								return this;
							}
						}
					}
				}
				const subs = current.template?.subs?.get(name);
				if (subs) {
					for (let i = 0; i < subs.length; i++) {
						if (dispatch(subs[i]) === "stop") {
							return this;
						}
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
			this.template.cleanup(this, this.data || {});
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
