import { cell } from "select/state/cells";
import { render, ui } from "../src/js/select/tui/index.js";

const Login = ui(`
	<box border padding="2" flexDirection="column" gap="1" on:keypress="keys">
		<text fg="#FFFF00">Login Form</text>
		<box title="Username" border width="40" height="3">
			<input inout="username" placeholder="Enter username..."
			       out:focused="focusedUser" on:enter="submit" />
		</box>
		<box title="Password" border width="40" height="3">
			<input inout="password" placeholder="Enter password..."
			       out:focused="focusedPass" on:enter="submit" />
		</box>
		<text out="status" out:fg="statusFg"></text>
	</box>
`)
	.init(() => ({
		focused: cell("user"),
		password: cell(""),
		status: cell("idle"),
		username: cell(""),
	}))
	.does({
		focusedPass: (_self, { focused }) => focused.value === "pass",
		focusedUser: (_self, { focused }) => focused.value === "user",
		keys: (_self, { focused }, key) => {
			if (key.name === "tab") {
				focused.set(focused.value === "user" ? "pass" : "user");
			}
		},
		status: (_self, { status }) => `${status.value ?? "idle"}`.toUpperCase(),
		statusFg: (_self, { status }) =>
			status.value === "success"
				? "green"
				: status.value === "error"
					? "red"
					: "#999",
		submit: (_self, { username, password, status }) => {
			status.set(
				username.value === "admin" && password.value === "secret"
					? "success"
					: "error",
			);
		},
	});

await render(Login);
