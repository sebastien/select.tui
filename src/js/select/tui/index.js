// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui
// Select.js templates on OpenTUI renderables.

import { isAppliedTemplate } from "./applied.js";
import { extend, getCatalogue, getTags } from "./catalogue.js";
import { component, isComponentDefinition } from "./definition.js";
import { render, testRender } from "./host.js";
import { getTUIInstance } from "./ids.js";
import { markup } from "./markup.js";
import { load } from "./resources.js";
import { isTemplateComponent, ui } from "./template.js";

// The definition and resource APIs are attached here rather than in the
// factory module so `definition.js` can depend on `template.js` without a
// circular import.
ui.component = component;
ui.load = load;

export {
	component,
	extend,
	getCatalogue,
	getTags,
	getTUIInstance,
	isAppliedTemplate,
	isComponentDefinition,
	isTemplateComponent,
	load,
	markup,
	render,
	testRender,
	ui,
};
export default ui;

// EOF
