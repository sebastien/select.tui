// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/instance
// Mounted TUI component instances: lifecycle facade over focused submodules.
// Mirrors select.js `components/instance.js` decomposition:
// - `slots.js` parses `out/on:/when/inout/in/ref` bindings,
// - `applied.js` holds `AppliedTemplate` wrappers and list shapes,
// - `reactive.js` subscribes cells and implements `set`/`update`,
// - `events.js` listens, captures and publishes (`pub`/`sub`),
// - `render.js` instantiates nodes and runs the render pipeline.
//
// Concepts:
// - *slots*: per-node bindings collected during `_create`.
// - *scope*: row-local data merged over instance data for resolvers.
// - *component tags*: `ui()` templates registered via `extend()` mount as
//   nested instances under a wrapper box.
// - *applied lists*: `Component.map(...)` wrappers reconciled by `$key`.
//
// Not ported from select.js `UIInstance` (intentional TUI subset):
// - `defaultData` host merging, cell fusion, `out-replace` node replacement,
//   `<slot>` content slots, webcomponents, link interception,
//   `componentRootClass`.

import { getDescriptorCleanup } from "./descriptor.js";
import {
	addRuntimeSub,
	attachCapture,
	bindInstance,
	dispatch,
	listen,
	publish,
	removeRuntimeSub,
	runEvent,
	scopedData,
	unbindInstance,
} from "./events.js";
import {
	createTUIInstanceId,
	registerTUIInstance,
	unregisterTUIInstance,
} from "./ids.js";
import {
	scheduleRender,
	seedInitializerState,
	setData,
	subscribe,
	subscribeValue,
	unsubscribeValue,
	updateData,
} from "./reactive.js";
import {
	instantiate,
	renderInstance,
	resolveInValue,
	resolveOut,
	syncChildInputs,
} from "./render.js";

// Class: TUIInstance
// Mounted component instance. Thin lifecycle facade: reactive state in
// `reactive.js`, events in `events.js`, node creation/rendering in `render.js`.
class TUIInstance {
	constructor(template, parent, options = {}) {
		this.template = template;
		this.parent = parent || null;
		this.data = options.data;
		this.options = options || {};
		const explicitId =
			typeof this.options.id === "string" ? this.options.id.trim() : "";
		this.id = explicitId || createTUIInstanceId();
		registerTUIInstance(this);
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
		this._effectTeardowns = undefined;
		this._context = undefined;
		this._ctxSubs = undefined;
		if (template.initializer) {
			const state = template.initializer(this, this.data);
			if (state) {
				this.data = seedInitializerState(this.data, state);
			}
		}
		if (this.data === undefined || this.data === null) {
			this.data = {};
		}
		this._subscribe();
	}

	_subscribe() {
		subscribe(this);
	}

	_subscribeValue(value) {
		subscribeValue(this, value);
	}

	_unsubscribeValue(value) {
		unsubscribeValue(this, value);
	}

	_scheduleRender() {
		scheduleRender(this);
	}

	_scopedData(slot) {
		return scopedData(this, slot);
	}

	_resolveOut(slot) {
		return resolveOut(this, slot);
	}

	_resolveInValue(sourceKey, scope = null) {
		return resolveInValue(this, sourceKey, scope);
	}

	_dispatch(name, event, data) {
		dispatch(this, name, event, data);
	}

	_syncChildInputs() {
		syncChildInputs(this);
	}

	_listen(node, event, handler) {
		return listen(this, node, event, handler);
	}

	_attachCapture(slot) {
		return attachCapture(this, slot);
	}

	_runEvent(slot, event) {
		runEvent(this, slot, event);
	}

	_instantiate() {
		instantiate(this);
	}

	_bind() {
		bindInstance(this);
	}

	_unbind() {
		unbindInstance(this);
	}

	_render() {
		renderInstance(this);
	}

	set(data) {
		return setData(this, data);
	}

	update(data) {
		return updateData(this, data);
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
		return addRuntimeSub(this, event, handler);
	}

	off(event, handler) {
		return removeRuntimeSub(this, event, handler);
	}

	pub(name, data, includeSelf = true, orig = undefined) {
		return publish(this, name, data, includeSelf, orig);
	}

	// Function: provide
	// Provides `value` as `key` to child components. Returns this for chaining.
	provide(key, value) {
		if (this._context === undefined) {
			this._context = new Map();
		}
		this._context.set(key, value);
		return this;
	}

	// Function: inject
	// Injects the value for `key` from ancestor providers. Returns
	// `defaultValue` if not found. Auto-subscribes to reactive cells so
	// provider updates re-render the injector (mirrors select.js; TUI
	// schedules via `_scheduleRender`).
	inject(key, defaultValue = undefined) {
		let current = this.parent;
		while (current) {
			if (current._context?.has(key)) {
				const value = current._context.get(key);
				if (value?.isReactive) {
					if (this._ctxSubs === undefined) {
						this._ctxSubs = new Map();
					}
					if (!this._ctxSubs.has(value)) {
						const handler = () => this._scheduleRender();
						value.sub(handler);
						this._ctxSubs.set(value, handler);
					}
				}
				return value;
			}
			current = current.parent;
		}
		return defaultValue;
	}

	// Function: effect
	// Runs `setup(this)` and tracks a returned teardown for `dispose`.
	// Mirrors select.js `UIInstance.effect` (TUI runs teardowns without the
	// `log.error` wrapper).
	effect(setup) {
		if (this._disposed || typeof setup !== "function") {
			return this;
		}
		const teardown = setup(this);
		if (typeof teardown === "function") {
			this._effectTeardowns = this._effectTeardowns ?? [];
			this._effectTeardowns.push(teardown);
		}
		return this;
	}

	dispose() {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._queued = false;
		const cleanup = getDescriptorCleanup(this.template);
		if (typeof cleanup === "function") {
			cleanup(this, this.data || {});
		}
		if (this._effectTeardowns) {
			for (const teardown of this._effectTeardowns) {
				teardown();
			}
			this._effectTeardowns.length = 0;
			this._effectTeardowns = undefined;
		}
		this._children.length = 0;
		this._childInputs.length = 0;
		this._unbind();
		for (let i = 0; i < this._subs.length; i++) {
			this._subs[i][0].unsub(this._subs[i][1]);
		}
		this._subs.length = 0;
		unregisterTUIInstance(this);
		if (this._ctxSubs) {
			for (const [cell, handler] of this._ctxSubs) {
				cell.unsub(handler);
			}
			this._ctxSubs = undefined;
		}
		if (this.nodes) {
			for (let i = 0; i < this.nodes.length; i++) {
				this.nodes[i].destroyRecursively();
			}
		}
	}
}

export { TUIInstance };

// EOF
