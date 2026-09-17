import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const build = spawnSync(process.execPath, [join(root, "scripts", "build.mjs")], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn("python3", ["-m", "http.server", "4173", "--bind", "0.0.0.0", "--directory", join(root, "dist")], { cwd: root, stdio: "inherit" });
const stop = (signal) => server.kill(signal);
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
server.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
