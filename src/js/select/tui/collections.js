// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/collections
// Shared helpers for normalizing collections and resolving values/paths. Used
// by `Component.map` (applied.js) to map arrays, Maps, Sets and plain objects.

import { unwrap } from "select/state/cells";
import { isReactive } from "select/utils/values.js";

// Function: resolveReactive
// Returns the plain value of a reactive cell, or `value` unchanged.
function resolveReactive(value) {
	return isReactive(value) ? unwrap(value) : value;
}

// Function: normalizeCollection
// Normalizes an array, Map, Set or plain object into
// `[{ value, index, mapKey? }]`. `mapKey` is set for Map/object entries and
// left undefined for arrays/Sets, whose callers derive a positional key.
function normalizeCollection(data) {
	const value = resolveReactive(data);
	const entries = [];
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			entries.push({ value: value[i], index: i });
		}
	} else if (value instanceof Map) {
		let i = 0;
		for (const [key, item] of value) {
			entries.push({ value: item, index: i++, mapKey: key });
		}
	} else if (value instanceof Set) {
		let i = 0;
		for (const item of value) {
			entries.push({ value: item, index: i++ });
		}
	} else if (value !== null && value !== undefined && typeof value === "object") {
		let i = 0;
		for (const key of Object.keys(value)) {
			entries.push({ value: value[key], index: i++, mapKey: key });
		}
	}
	return entries;
}

// Function: resolvePath
// Resolves a dotted path string (e.g. `"user.id"` or `".id"`) against `value`.
function resolvePath(value, path) {
	if (value === null || value === undefined) return undefined;
	const parts = `${path}`.replace(/^\./, "").split(".");
	let cursor = value;
	for (let i = 0; i < parts.length; i++) {
		if (cursor === null || cursor === undefined) return undefined;
		cursor = cursor[parts[i]];
	}
	return cursor;
}

export { normalizeCollection, resolvePath, resolveReactive };

// EOF
