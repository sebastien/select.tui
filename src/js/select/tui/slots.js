// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: select/tui/slots
// Slot parsing for TUI template nodes: `out`, `on:`, `when`, `inout`, `in`,
// `ref` bindings. Mirrors select.js `components/slots.js#UITemplateSlot`
// discovery, adapted to the TUI AST (`{type,tag,attrs,children}`) and OpenTUI
// renderables. `out-replace` is an alias of `out`: replacing the target node
// isn't meaningful for a TUI node, so both update in place.

import { TemplateParser } from "@ssebastien/select/ui/bindings.js";
import { inferWhenKeys } from "@ssebastien/select/ui/eval.js";

// Function: isWsText
// True for whitespace-only text AST nodes skipped during instantiation.
function isWsText(node) {
	return node.type === "text" && !`${node.value ?? ""}`.trim();
}

// Function: textContent
// Concatenated direct text children, trimmed; used for `<text>` defaults.
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

// Function: attrText
// Normalizes an attribute value to text (`true`/`null` → `""`).
function attrText(value) {
	return value === true || value === undefined || value === null
		? ""
		: `${value}`;
}

// Function: isPlainObject
// True for plain `{}` bags (behavior patches); class instances excluded.
function isPlainObject(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

// Function: takeSlots
// Splits `attrs` into slot bindings (`in/inout/on/out/ref/when`) and leftover
// host options (`rest`). Shape mirrors `TUIInstance` slot bags.
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

export { attrText, isPlainObject, isWsText, takeSlots, textContent };

// EOF
