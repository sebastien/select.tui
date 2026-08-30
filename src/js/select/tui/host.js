// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/host
// Renderer lifecycle: `render` and `testRender`.

import { createCliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";

function isCliRenderer(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		value.root &&
		typeof value.root.add === "function" &&
		value.keyInput
	);
}

async function render(Component, rendererOrConfig) {
	const existing = isCliRenderer(rendererOrConfig);
	const renderer = existing
		? rendererOrConfig
		: await createCliRenderer({
				exitOnCtrlC: true,
				...(rendererOrConfig && typeof rendererOrConfig === "object"
					? rendererOrConfig
					: null),
			});
	const instance = Component.new();
	if (!existing) {
		instance._ownedRenderer = renderer;
	}
	instance.mount(renderer.root);
	renderer.once("destroy", () => instance.dispose());
	return instance;
}

async function testRender(Component, options = {}) {
	const { data, ...testOptions } = options;
	const setup = await createTestRenderer({
		height: 10,
		width: 40,
		...testOptions,
	});
	const instance = Component.new(
		null,
		data !== undefined ? { data } : undefined,
	);
	instance.mount(setup.renderer.root);
	setup.renderer.once("destroy", () => instance.dispose());
	return Object.assign(setup, { instance });
}

export { render, testRender };

// EOF
