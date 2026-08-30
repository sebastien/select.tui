// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/instance
// Instantiates OpenTUI renderables from a compiled template and applies slots.

import { TextRenderable } from "@opentui/core";
import { unwrap } from "select/state/cells";
import { TemplateParser } from "select/ui/bindings.js";
import {
	createWhenPredicate,
	evaluateParsedOut,
	inferWhenKeys,
	isReactive,
	resolveBindingValue,
	writeDataPath,
} from "select/ui/eval.js";
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
			slots.out.push({
				parsed: TemplateParser.ParseOutAttributeBinding(attrText(value)),
				prop: null,
				replace: name === "out-replace",
			});
		} else if (name.startsWith("out:") || name.startsWith("out-")) {
			const prefix = name.startsWith("out:") ? "out:" : "out-";
			const prop = name.slice(prefix.length);
			const raw = value === true || value === "" ? prop : attrText(value);
			slots.out.push({
				parsed: TemplateParser.ParseOutAttributeBinding(raw),
				prop,
				replace: false,
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

function eventPayload(event) {
	if (typeof event === "string" || typeof event === "number") {
		return event;
	}
	return event;
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
			const value = data[key];
			if (!isReactive(value)) {
				continue;
			}
			const handler = () => this._scheduleRender();
			value.sub(handler);
			this._subs.push([value, handler]);
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

	_resolveOut(slot) {
		return evaluateParsedOut(this, this.data || {}, slot.parsed);
	}

	_dispatch(name, event) {
		const handler = this.template.behavior?.[name];
		if (typeof handler !== "function") {
			return;
		}
		const result = handler(this, this.data || {}, event);
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
		const next =
			value === undefined || value === null
				? prop === "content" || prop === "value"
					? ""
					: value
				: value;
		if (node[prop] === next) {
			return;
		}
		node[prop] = next;
	}

	_create(ast) {
		if (ast.type === "text") {
			return new TextRenderable(this.ctx, { content: ast.value.trim() });
		}
		const entry = getCatalogue()[ast.tag];
		if (!entry) {
			throw new Error(`select/tui: unknown tag <${ast.tag}>`);
		}
		const { rest, slots } = takeSlots(ast.attrs);
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
				node.add(this._create(child));
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
				replace: slots.out[i].replace,
			});
		}
		for (let i = 0; i < slots.on.length; i++) {
			this._on.push({
				event: slots.on[i].event,
				node,
				parsed: slots.on[i].parsed,
			});
		}
		if (slots.when) {
			this._when.push({
				node,
				predicate: createWhenPredicate(slots.when),
			});
		}
		for (let i = 0; i < slots.inout.length; i++) {
			this._inout.push({
				capture: true,
				key: slots.inout[i].key,
				node,
				prop: slots.inout[i].prop || entry.contentProp || "value",
				write: true,
			});
		}
		for (let i = 0; i < slots.in.length; i++) {
			this._in.push({
				key: slots.in[i].key,
				node,
				prop: slots.in[i].prop || entry.contentProp || "value",
			});
		}
		return node;
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

	_runEvent(slot, event) {
		const parsed = slot.parsed;
		if (!parsed) {
			return;
		}
		if (parsed.stopPropagation && typeof event?.stopPropagation === "function") {
			event.stopPropagation();
		}
		if (parsed.preventDefault && typeof event?.preventDefault === "function") {
			event.preventDefault();
		}
		if (parsed.mode === "assign") {
			writeDataPath(this, parsed.targetPath, eventPayload(event));
			this._scheduleRender();
			return;
		}
		if (parsed.mode === "publish") {
			let payload = this.data || {};
			if (parsed.binding) {
				payload = resolveBindingValue(this.data || {}, parsed.binding, this);
			}
			this.pub(parsed.publishEvent, payload, true, event);
			return;
		}
		this._dispatch(parsed.handlerName, event);
	}

	_listen(node, event, handler) {
		const keyInput = this.renderer?.keyInput;
		if (event === "keypress") {
			if (!keyInput) {
				return;
			}
			keyInput.on("keypress", handler);
			this._listeners.push(() => keyInput.off("keypress", handler));
			return;
		}
		if (event === "click") {
			node.onMouseDown = handler;
			this._listeners.push(() => {
				if (node.onMouseDown === handler) {
					node.onMouseDown = undefined;
				}
			});
			return;
		}
		node.on(event, handler);
		this._listeners.push(() => node.off(event, handler));
	}

	_bind() {
		for (let i = 0; i < this._on.length; i++) {
			const slot = this._on[i];
			this._listen(slot.node, slot.event, (event) =>
				this._runEvent(slot, event),
			);
		}
		const capture = (slot) => {
			const handler = (value) => {
				const current = (this.data || {})[slot.key];
				if (isReactive(current)) {
					current.set(value);
					return;
				}
				this.update({ [slot.key]: value });
			};
			slot.node.on("input", handler);
			this._listeners.push(() => slot.node.off("input", handler));
		};
		for (let i = 0; i < this._inout.length; i++) {
			capture(this._inout[i]);
		}
		for (let i = 0; i < this._in.length; i++) {
			capture(this._in[i]);
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
			slot.node.visible = !!slot.predicate(this, this.data || {});
		}
		const focuses = [];
		for (let i = 0; i < this._out.length; i++) {
			const slot = this._out[i];
			if (slot.prop === "focused") {
				focuses.push(slot);
				continue;
			}
			this._applyOut(slot, this._resolveOut(slot));
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
			const next = unwrap((this.data || {})[slot.key]);
			const value = next === undefined || next === null ? "" : next;
			if (slot.node[slot.prop] !== value) {
				slot.node[slot.prop] = value;
			}
		}
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
			} else {
				this.data[key] = next;
			}
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
				const payload = data === undefined ? current.data || {} : data;
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
			this.template.cleanup(this, this.data || {});
		}
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
