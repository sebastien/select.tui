import { cell } from "select/state/cells";
import { render, ui } from "../src/js/select/tui/index.js";

const Counter = ui(`
	<box width="42" height="9" alignItems="center" justifyContent="center"
	     backgroundColor="#1131E9" on:keypress="keys">
		<box width="38" height="7" padding="1" flexDirection="column" gap="1"
		     alignItems="center" backgroundColor="#2947F0">
			<text fg="#DCE3FF">Hello, OpenTUI!</text>
			<text out="label" fg="#FFFFFF"></text>
			<text fg="#AEBBFF">left/right change | q quit</text>
		</box>
	</box>
`)
	.init(() => ({
		count: cell(0),
	}))
	.does({
		label: (_self, { count }) => `Count  ${count}`,
		keys: (self, { count }, key) => {
			if (key.name === "q") {
				self.quit();
				return;
			}
			if (key.name === "left") {
				self.update({ count: count - 1 });
			} else if (key.name === "right") {
				self.update({ count: count + 1 });
			}
		},
	});

await render(Counter);
