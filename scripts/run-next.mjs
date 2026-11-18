import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (command !== "dev" && command !== "start") {
	throw new Error("Usage: node scripts/run-next.mjs <dev|start> [...args]");
}

const nextCli = fileURLToPath(
	new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const next = spawn(process.execPath, [nextCli, command, ...args], {
	env: {
		...process.env,
		NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA ?? "1",
	},
	stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => next.kill(signal));
}

next.on("error", (error) => {
	console.error("Unable to start Next.js:", error);
	process.exitCode = 1;
});

next.on("exit", (code, signal) => {
	process.exitCode = signal ? 1 : (code ?? 1);
});
