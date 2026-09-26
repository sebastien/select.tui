// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/resources
// External template sources: `ui.load(url)` fetches, parses and caches a
// template file, and `astFor(source)` resolves a source string to an AST,
// preferring a previously loaded resource.

import { toAst } from "./markup.js";

// Internal: parsed external templates keyed by resolved URL.
const RESOURCES = new Map();
// Internal: in-flight `ui.load` calls keyed by resolved URL.
const LOADING = new Map();

function isMarkupSource(source) {
	return Array.isArray(source) || (typeof source === "string" && /^\s*</.test(source));
}

// Function: isResourceReference
// True when `source` looks like an external template URL/path rather than
// inline markup, mirroring select.js's resource-reference heuristic. Bare
// strings such as `"hello"` are treated as markup text, not as URLs.
function isResourceReference(source) {
	if (typeof source !== "string") {
		return false;
	}
	const trimmed = source.trim();
	if (!trimmed || /^\s*</.test(trimmed)) {
		return false;
	}
	const rawURL = trimmed.split("#")[0];
	if (!rawURL) {
		return false;
	}
	return (
		/^(?:\.{0,2}\/|\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(rawURL) ||
		/\.(?:html?|xhtml|xml)(?:\?|$)/i.test(rawURL)
	);
}

// Function: resolveURL
// Resolves `source` to an absolute URL string, relative to the current
// location when available, then the working directory.
function resolveURL(source) {
	try {
		return new URL(source).href;
	} catch (_error) {
		const base = globalThis.location?.href ?? `file://${process.cwd()}/`;
		return new URL(source, base).href;
	}
}

// Function: astFor
// Returns the AST for a source, preferring a loaded external template. A
// resource-like source that was never loaded is an error rather than silently
// being parsed as markup text.
function astFor(source) {
	if (typeof source === "string" && !isMarkupSource(source)) {
		const cached = RESOURCES.get(source);
		if (cached) return cached;
		if (isResourceReference(source)) {
			const resolved = resolveURL(source);
			const byURL = RESOURCES.get(resolved);
			if (byURL) return byURL;
			const label = JSON.stringify(source);
			throw new Error(
				`ui(${label}): external template is not loaded; call \`await ui.load(${label})\` before using it`,
			);
		}
	}
	return toAst(source);
}

// Function: load
// Loads and caches an external template. `source` may be a markup string or
// tree (parsed directly) or a URL/path (fetched, then parsed).
async function load(source) {
	if (!isResourceReference(source)) {
		return toAst(source);
	}
	const url = resolveURL(source);
	if (RESOURCES.has(url)) {
		return RESOURCES.get(url);
	}
	if (RESOURCES.has(source)) {
		return RESOURCES.get(source);
	}
	if (LOADING.has(url)) {
		return LOADING.get(url);
	}
	const promise = (async () => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`ui.load(): unable to load ${url} (${response.status} ${response.statusText})`,
			);
		}
		const ast = toAst(await response.text());
		RESOURCES.set(url, ast);
		RESOURCES.set(source, ast);
		return ast;
	})();
	LOADING.set(url, promise);
	try {
		return await promise;
	} finally {
		LOADING.delete(url);
	}
}

export { astFor, isResourceReference, load, resolveURL };

// EOF
