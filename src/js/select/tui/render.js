// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: select/tui/render
// Node creation and render pipeline for `TUIInstance`. Mirrors select.js
// `components/render.js`: instantiate host nodes from the AST, bind `out`
// values, reconcile `Component.map` lists by `$key`, re-sync `in:` child
// inputs. Pure functions take the instance explicitly so `instance.js` stays
// a thin lifecycle facade.

import { BoxRenderable, TextRenderable } from "@opentui/core";
import { unwrap } from "@ssebastien/select/state/cells";
import {
	applyNamedProcessors,
	createWhenPredicate,
	evaluateParsedOut,
	finalizeRenderProcessorValue,
	resolveBindingValue,
	resolveRenderableValue,
} from "@ssebastien/select/ui/eval.js";
import {
	appliedCollectionItems,
	appliedDataEquals,
	isAppliedCollection,
	isEmptyAppliedCollection,
} from "./applied.js";
import { coerceOptions, getTags } from "./catalogue.js";
import { scopedData } from "./events.js";
import {
	createTrackingProxy,
	hasTrackedNonReactiveObjectDeps,
	snapshotReactiveDependencyRevisions,
} from "./runtime.js";
import { isReactive } from "@ssebastien/select/utils/values.js";
import { isWsText, takeSlots, textContent } from "./slots.js";

// Function: outSourceKey
// The data key an out slot resolves from: the binding's source key, else a
// template expression's first data dependency. Null when unresolvable (the
// slot is always re-evaluated).
function outSourceKey(slot) {
	const parsed = slot.parsed;
	if (!parsed) {
		return null;
	}
	if (parsed.mode === "template") {
		const tokens = parsed.template?.tokens;
		if (tokens?.length) {
			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i];
				if (token.type === "expr" && token.value?.path?.length) {
					const path = token.value.path;
					return typeof path[0] === "string" ? path[0] : null;
				}
			}
		}
		return null;
	}
	const binding = parsed.binding;
	if (binding?.sourceKey && !binding.sourceMap?.length) {
		return binding.sourceKey;
	}
	return null;
}

// Function: indexOutSlots
// Indexes a slot bag's out entries by their data source key so a direct update
// can find them in O(1). Entries without a key are left unindexed.
function indexOutSlots(bag, outSlots) {
	for (let i = 0; i < outSlots.length; i++) {
		const slot = outSlots[i];
		const key = outSourceKey(slot);
		if (!key) {
			continue;
		}
		let group = bag.get(key);
		if (!group) {
			group = [];
			bag.set(key, group);
		}
		group.push(slot);
	}
}

// Function: resolveOut
// Evaluates an out slot against scoped data.
function resolveOut(instance, slot) {
	return evaluateParsedOut(instance, scopedData(instance, slot), slot.parsed);
}

// Function: resolveInValue
// Resolves an in: source (behavior/cell/path).
function resolveInValue(instance, sourceKey, scope = null) {
	const data = scope
		? Object.assign({}, instance.data, scope)
		: instance.data || {};
	if (!`${sourceKey ?? ""}`.includes(".")) {
		const behavior = instance.template.behavior?.[sourceKey];
		if (typeof behavior === "function") {
			return behavior(instance, data, null);
		}
		return data[sourceKey];
	}
	return resolveBindingValue(data, { sourceKey }, false, instance);
}

// Function: applyOut
// Writes an out value to the node content/property.
function applyOut(slot, value) {
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

// Function: createNode
// Instantiates a renderable from an AST node plus slot bags.
function createNode(instance, ast, scope = null) {
	if (ast.type === "text") {
		return new TextRenderable(instance.ctx, { content: ast.value.trim() });
	}
	const tags = getTags();
	const entry = tags[ast.tag] ?? tags[ast.tag.toLowerCase()];
	if (!entry) {
		throw new Error(`select/tui: unknown tag <${ast.tag}>`);
	}
	const { rest, slots } = takeSlots(ast.attrs);
	if (entry.Component) {
		return createComponentTag(instance, ast, entry, { rest, slots, scope });
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
	const node = new entry.Class(instance.ctx, options);
	if (entry.configure) {
		entry.configure(node, options, instance);
	}
	if (ast.tag !== "text") {
		const children = ast.children || [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (isWsText(child)) {
				continue;
			}
			node.add(createNode(instance, child, scope));
		}
	}
	if (focused) {
		node.focus();
	}
	if (slots.ref) {
		instance.ref[slots.ref === true ? ast.tag : slots.ref] = node;
	}
	const outSlots = [];
	for (let i = 0; i < slots.out.length; i++) {
		const slot = {
			contentProp: entry.contentProp,
			node,
			parsed: slots.out[i].parsed,
			prop: slots.out[i].prop,
			scope,
		};
		instance._out.push(slot);
		outSlots.push(slot);
	}
	indexOutSlots(instance._outByKey, outSlots);
	for (let i = 0; i < slots.on.length; i++) {
		instance._on.push({
			event: slots.on[i].event,
			node,
			parsed: slots.on[i].parsed,
			scope,
		});
	}
	if (slots.when) {
		const when = {
			parsed: slots.when,
			node,
			predicate: createWhenPredicate(slots.when),
			scope,
		};
		instance._when.push(when);
	}
	for (let i = 0; i < slots.inout.length; i++) {
		instance._inout.push({
			capture: true,
			key: slots.inout[i].key,
			node,
			prop: slots.inout[i].prop || entry.contentProp || "value",
			write: true,
			scope,
		});
	}
	for (let i = 0; i < slots.in.length; i++) {
		instance._in.push({
			key: slots.in[i].key,
			node,
			prop: slots.in[i].prop || entry.contentProp || "value",
			scope,
		});
	}
	return node;
}

// Function: createComponentTag
// Mounts a nested component tag under a wrapper box.
function createComponentTag(instance, ast, entry, { rest, slots, scope }) {
	const options = coerceOptions(rest);
	const focused = options.focused;
	delete options.focused;
	const wrapper = new BoxRenderable(instance.ctx, options);
	if (focused) {
		wrapper.focus();
	}
	if (slots.ref) {
		instance.ref[slots.ref === true ? ast.tag : slots.ref] = wrapper;
	}
	if (slots.when) {
		const when = {
			node: wrapper,
			parsed: slots.when,
			predicate: createWhenPredicate(slots.when),
			scope,
		};
		instance._when.push(when);
	}
	const outSlots = [];
	for (let i = 0; i < slots.out.length; i++) {
		const slot = {
			contentProp: null,
			node: wrapper,
			parsed: slots.out[i].parsed,
			prop: slots.out[i].prop,
			scope,
		};
		instance._out.push(slot);
		outSlots.push(slot);
	}
	indexOutSlots(instance._outByKey, outSlots);
	for (let i = 0; i < slots.on.length; i++) {
		instance._on.push({
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
		const value = resolveInValue(instance, inSlot.key, scope);
		inputs.push({ key: inSlot.key, prop, scope, last: value });
		data[prop] = value;
	}
	const child = entry.Component.new(instance, { data });
	instance._children.push(child);
	if (inputs.length) {
		instance._childInputs.push({ child, inputs });
	}
	child.mount(wrapper);
	return wrapper;
}

// Function: instantiate
// Builds root nodes and resets slot bags.
function instantiate(instance) {
	instance._out.length = 0;
	instance._outByKey = new Map();
	instance._on.length = 0;
	instance._when.length = 0;
	instance._inout.length = 0;
	instance._in.length = 0;
	instance._childInputs.length = 0;
	instance._behaviorDeps = undefined;
	instance._behaviorValues = undefined;
	instance._behaviorDepRevisions = undefined;
	instance.ref = {};
	const roots = [];
	const ast = instance.template.ast;
	for (let i = 0; i < ast.length; i++) {
		const node = ast[i];
		if (isWsText(node)) {
			continue;
		}
		roots.push(createNode(instance, node));
	}
	instance.nodes = roots;
}

// Function: unwrapData
// Shallow copy of a data bag with top-level reactive cells unwrapped, so `when`
// predicates see plain values. `in:`/`inout` keep the raw cells elsewhere, which
// is what makes input write-through work.
function unwrapData(data) {
	const out = {};
	for (const key in data) {
		out[key] = unwrap(data[key]);
	}
	return out;
}

// Function: syncChildInputs
// Re-resolves in: sources into mounted children per render, pushing a child
// update only for inputs whose resolved value actually changed. A reactive
// source the child already holds is not re-pushed (the child's own
// subscription drives it). This replaces the previous unconditional push that
// woke every child on every parent render.
function syncChildInputs(instance) {
	if (!instance._childInputs.length) {
		return;
	}
	for (let i = 0; i < instance._childInputs.length; i++) {
		const entry = instance._childInputs[i];
		const child = entry.child;
		if (child._disposed) {
			continue;
		}
		let patch = null;
		for (let j = 0; j < entry.inputs.length; j++) {
			const input = entry.inputs[j];
			const value = resolveInValue(instance, input.key, input.scope);
			// A reactive value the child already holds is driven by its own
			// subscription; re-pushing it would only wake the child. If the
			// child holds a different value for the prop (e.g. init state
			// shadowed the cell), it must be pushed.
			if (isReactive(value)) {
				if (child.data?.[input.prop] === value) {
					input.last = value;
					continue;
				}
				input.last = value;
				patch = patch ?? {};
				patch[input.prop] = value;
				continue;
			}
			if (Object.is(input.last, value)) {
				continue;
			}
			input.last = value;
			patch = patch ?? {};
			patch[input.prop] = value;
		}
		if (patch) {
			child.update(patch);
		}
	}
}

// Function: renderAppliedOut
// Reconciles a mapped list slot by $key with reorder.
function renderAppliedOut(instance, slot, items) {
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
			destroyAppliedRow(instance, slot, key);
			row = null;
		}
		if (!row) {
			const wrapper = new BoxRenderable(instance.ctx, {});
			const child = item.template.new(instance, { data: item.data });
			row = {
				instance: child,
				wrapper,
				data: item.data,
				template: item.template,
			};
			rows.set(key, row);
			instance._children.push(child);
			container.add(wrapper);
			child.mount(wrapper);
		} else if (!appliedDataEquals(row.data, item.data)) {
			row.instance.update(item.data);
			row.data = item.data;
		}
	}
	for (const key of Array.from(rows.keys())) {
		if (!keep.has(key)) {
			destroyAppliedRow(instance, slot, key);
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

// Function: destroyAppliedRow
// Disposes one reconciled row and evicts its map cache.
function destroyAppliedRow(instance, slot, key) {
	const row = slot.applied?.get(key);
	if (!row) {
		return;
	}
	slot.applied.delete(key);
	row.template?._mapCache?.delete(key);
	const at = instance._children.indexOf(row.instance);
	if (at >= 0) {
		instance._children.splice(at, 1);
	}
	row.instance.dispose();
	slot.node.remove(row.wrapper);
	row.wrapper.destroyRecursively?.();
}

// Function: clearAppliedOut
// Destroys all rows of an applied slot.
function clearAppliedOut(instance, slot) {
	if (!slot.applied) {
		return;
	}
	for (const key of Array.from(slot.applied.keys())) {
		destroyAppliedRow(instance, slot, key);
	}
	slot.applied = null;
	slot.order = null;
}

// Function: applyValue
// Writes a resolved value to an out slot, reconciling mapped collections by
// key and evicting a previously-applied list when the value stops being one.
function applyValue(instance, slot, value) {
	const isApplied =
		isAppliedCollection(value) &&
		(!isEmptyAppliedCollection(value) || slot.isApplied === true);
	if (isApplied) {
		slot.isApplied = true;
		renderAppliedOut(instance, slot, appliedCollectionItems(value));
	} else {
		if (slot.isApplied) {
			clearAppliedOut(instance, slot);
			slot.isApplied = false;
		}
		applyOut(slot, value);
	}
}

// Function: applyOutSlot
// Resolves one out slot and writes it to its node, reconciling mapped
// collections by key.
function applyOutSlot(instance, slot) {
	applyValue(instance, slot, resolveOut(instance, slot));
}

// Function: renderWhen
// Re-evaluates every `when` predicate. Predicates are cheap and the inferred
// dependency keys are unreliable (they name the bound `out` slot, not the data
// keys a behavior reads), so — like select.js — they all run each render.
function renderWhen(instance) {
	for (let i = 0; i < instance._when.length; i++) {
		const slot = instance._when[i];
		const data = scopedData(instance, slot);
		slot.node.visible = !!slot.predicate(instance, unwrapData(data));
	}
}

// Function: renderOuts
// Runs the out pass. Every resolvable slot is visited (the binding itself
// decides which data keys it reads, so it cannot be skipped by data key).
// Under a granular render a behavior slot whose tracked dependencies did not
// change reuses its cached value; a first-time behavior is tracked; a plain
// binding or a template/comparison slot just re-evaluates (applyOut
// short-circuits an unchanged value).
function renderOuts(instance, changedKeys) {
	const granular = Boolean(changedKeys?.size);
	for (let i = 0; i < instance._out.length; i++) {
		const slot = instance._out[i];
		if (slot.prop === "focused") {
			continue;
		}
		const parsed = slot.parsed;
		const binding = parsed?.binding;
		const key =
			parsed && parsed.mode !== "template" && binding?.sourceKey && !binding.sourceMap?.length
				? binding.sourceKey
				: null;
		const behavior = key ? instance.template.behavior?.[key] : undefined;
		if (typeof behavior === "function") {
			if (granular) {
				const deps = instance._behaviorDeps?.get(key);
				const depRevisions = instance._behaviorDepRevisions?.get(key);
				const cacheValid =
					deps &&
					instance._behaviorValues?.has(key) &&
					!depsChanged(deps, changedKeys) &&
					!reactiveDepsChanged(depRevisions, instance.data) &&
					!hasTrackedNonReactiveObjectDeps(instance.data, deps);
				if (cacheValid) {
					applyValue(instance, slot, finalizeBehaviorValue(instance, slot, instance._behaviorValues.get(key)));
					continue;
				}
			}
			const [tracked, accessed] = createTrackingProxy(instance.data);
			const value = behavior(instance, tracked, null);
			trackBehavior(instance, key, value, accessed);
			applyValue(instance, slot, finalizeBehaviorValue(instance, slot, value));
			continue;
		}
		applyOutSlot(instance, slot);
	}
}

// Function: renderFocus
// Applies `focused` out slots (resolved last, so a focus change wins over a
// visibility change in the same pass).
function renderFocus(instance) {
	for (let i = 0; i < instance._out.length; i++) {
		const slot = instance._out[i];
		if (slot.prop !== "focused") {
			continue;
		}
		if (!resolveOut(instance, slot) && slot.node.focused) {
			slot.node.blur();
		}
	}
	for (let i = 0; i < instance._out.length; i++) {
		const slot = instance._out[i];
		if (slot.prop !== "focused") {
			continue;
		}
		if (resolveOut(instance, slot)) {
			slot.node.focus();
		}
	}
}

// Function: depsChanged
// True when any tracked dependency key is in `changedKeys`.
function depsChanged(deps, changedKeys) {
	for (const key of deps) {
		if (changedKeys.has(key)) {
			return true;
		}
	}
	return false;
}

// Function: reactiveDepsChanged
// True when a tracked reactive dependency's revision moved past the snapshot,
// or it stopped being reactive (invalidate rather than reuse stale values).
function reactiveDepsChanged(depRevisions, data) {
	if (!depRevisions || depRevisions.size === 0 || !data) {
		return false;
	}
	for (const [key, revision] of depRevisions.entries()) {
		const value = data[key];
		if (!isReactive(value) || !Number.isFinite(value.revision)) {
			return true;
		}
		if (value.revision !== revision) {
			return true;
		}
	}
	return false;
}

// Function: finalizeBehaviorValue
// Applies the out binding's processors (e.g. `out="title|upper"`) to a
// behavior's raw result, mirroring how `evaluateParsedOut` finalizes a
// behavior slot.
function finalizeBehaviorValue(instance, slot, value) {
	const binding = slot.parsed?.binding;
	if (!binding?.processors?.length) {
		return resolveRenderableValue(value);
	}
	return finalizeRenderProcessorValue(
		applyNamedProcessors(
			instance,
			instance.data,
			value,
			binding.processors,
			binding.sourceKey,
		),
	);
}

// Function: trackBehavior
// Records a behavior's value plus the data keys it read, so a later granular
// render can skip re-running it when none of those keys changed. A behavior
// that returns a mapped collection is deliberately NOT cached: list structure
// (and frequently its membership) depends on non-data state — layout refs,
// scroll position — that the dependency tracker cannot observe, so the cache
// would go stale (e.g. a windowed list would never shrink).
function trackBehavior(instance, key, value, accessed) {
	if (!instance._behaviorValues) {
		instance._behaviorValues = new Map();
	}
	instance._behaviorValues.set(key, value);
	if (isAppliedCollection(value)) {
		instance._behaviorDeps?.delete(key);
		instance._behaviorDepRevisions?.delete(key);
		return;
	}
	if (!instance._behaviorDeps) {
		instance._behaviorDeps = new Map();
	}
	const deps = new Set();
	for (const name of accessed) {
		if (typeof name === "string") {
			deps.add(name);
		}
	}
	instance._behaviorDeps.set(key, deps);
	if (!instance._behaviorDepRevisions) {
		instance._behaviorDepRevisions = new Map();
	}
	instance._behaviorDepRevisions.set(
		key,
		snapshotReactiveDependencyRevisions(instance.data, deps),
	);
}

// Function: renderInout
// Re-syncs two-way input slots from their data cells.
function renderInout(instance, changedKeys) {
	for (let i = 0; i < instance._inout.length; i++) {
		const slot = instance._inout[i];
		if (changedKeys?.size && !changedKeys.has(slot.key)) {
			continue;
		}
		const next = unwrap(instance.data?.[slot.key]);
		const value = next === undefined || next === null ? "" : `${next}`;
		if (slot.node[slot.prop] !== value) {
			slot.node[slot.prop] = value;
		}
	}
}

// Function: renderInstance
// Runs the render pipeline for `changedKeys` (null = full render): `when`
// visibility, out values, focus and inout, then the change-detected child
// input sync.
function renderInstance(instance, changedKeys = null) {
	if (!instance.nodes || instance._disposed) {
		return;
	}
	renderWhen(instance);
	renderOuts(instance, changedKeys);
	renderFocus(instance);
	renderInout(instance, changedKeys);
	syncChildInputs(instance);
}

// Function: tryDirectOutUpdate
// A path-1 cell notify names a top-level data key. When that key is bound by
// one or more out slots with no behavior (a behavior may read other keys), the
// scalar value is written straight to those nodes, skipping a full render.
// Returns false to fall back to a scheduled render.
function tryDirectOutUpdate(instance, key, value) {
	if (!instance.nodes || instance._disposed || key == null) {
		return false;
	}
	if (typeof instance.template.behavior?.[key] === "function") {
		return false;
	}
	const slots = instance._outByKey?.get(key);
	if (!slots?.length) {
		return false;
	}
	const next = isReactive(value) ? unwrap(value) : value;
	for (let i = 0; i < slots.length; i++) {
		const slot = slots[i];
		if (slot.prop === "focused") {
			continue;
		}
		if (next === undefined) {
			applyOutSlot(instance, slot);
			continue;
		}
		applyValue(instance, slot, next);
	}
	return true;
}

export {
	applyOut,
	clearAppliedOut,
	createComponentTag,
	createNode,
	destroyAppliedRow,
	instantiate,
	renderAppliedOut,
	renderInstance,
	resolveInValue,
	resolveOut,
	syncChildInputs,
	tryDirectOutUpdate,
};

// EOF
