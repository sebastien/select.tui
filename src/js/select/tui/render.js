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
import { unwrap } from "select/state/cells";
import {
	createWhenPredicate,
	evaluateParsedOut,
	resolveBindingValue,
} from "select/ui/eval.js";
import {
	appliedCollectionItems,
	appliedDataEquals,
	isAppliedCollection,
	isEmptyAppliedCollection,
} from "./applied.js";
import { coerceOptions, getTags } from "./catalogue.js";
import { scopedData } from "./events.js";
import { isWsText, takeSlots, textContent } from "./slots.js";

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
	for (let i = 0; i < slots.out.length; i++) {
		instance._out.push({
			contentProp: entry.contentProp,
			node,
			parsed: slots.out[i].parsed,
			prop: slots.out[i].prop,
			scope,
		});
	}
	for (let i = 0; i < slots.on.length; i++) {
		instance._on.push({
			event: slots.on[i].event,
			node,
			parsed: slots.on[i].parsed,
			scope,
		});
	}
	if (slots.when) {
		instance._when.push({
			node,
			predicate: createWhenPredicate(slots.when),
			scope,
		});
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
		instance._when.push({
			node: wrapper,
			predicate: createWhenPredicate(slots.when),
			scope,
		});
	}
	for (let i = 0; i < slots.out.length; i++) {
		instance._out.push({
			contentProp: null,
			node: wrapper,
			parsed: slots.out[i].parsed,
			prop: slots.out[i].prop,
			scope,
		});
	}
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
		inputs.push({ key: inSlot.key, prop, scope });
		data[prop] = resolveInValue(instance, inSlot.key, scope);
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
	instance._on.length = 0;
	instance._when.length = 0;
	instance._inout.length = 0;
	instance._in.length = 0;
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

// Function: syncChildInputs
// Re-resolves in: sources into mounted children per render.
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
		const patch = {};
		for (let j = 0; j < entry.inputs.length; j++) {
			const input = entry.inputs[j];
			patch[input.prop] = resolveInValue(instance, input.key, input.scope);
		}
		child.update(patch);
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

// Function: renderInstance
// Runs when/out/focus/inout passes plus child sync.
function renderInstance(instance) {
	if (!instance.nodes || instance._disposed) {
		return;
	}
	for (let i = 0; i < instance._when.length; i++) {
		const slot = instance._when[i];
		slot.node.visible = !!slot.predicate(instance, scopedData(instance, slot));
	}
	const focuses = [];
	for (let i = 0; i < instance._out.length; i++) {
		const slot = instance._out[i];
		if (slot.prop === "focused") {
			focuses.push(slot);
			continue;
		}
		const value = resolveOut(instance, slot);
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
	for (let i = 0; i < focuses.length; i++) {
		const slot = focuses[i];
		if (!resolveOut(instance, slot) && slot.node.focused) {
			slot.node.blur();
		}
	}
	for (let i = 0; i < focuses.length; i++) {
		const slot = focuses[i];
		if (resolveOut(instance, slot)) {
			slot.node.focus();
		}
	}
	for (let i = 0; i < instance._inout.length; i++) {
		const slot = instance._inout[i];
		const next = unwrap(instance.data?.[slot.key]);
		const value = next === undefined || next === null ? "" : `${next}`;
		if (slot.node[slot.prop] !== value) {
			slot.node[slot.prop] = value;
		}
	}
	syncChildInputs(instance);
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
};

// EOF
