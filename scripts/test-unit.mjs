import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = "/tmp/yieldalpha-phase14-tests";
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const compile = spawnSync(process.execPath, [tsc, "--ignoreConfig", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--outDir", output, "--rootDir", join(root, "src"), "--skipLibCheck", join(root, "src", "index.ts")], { cwd: root, stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const files = (await readdir(join(root, "tests", "unit"))).filter((file) => file.endsWith(".test.mjs")).map((file) => join(root, "tests", "unit", file));
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, env: { ...process.env, YIELDALPHA_COMPILED_ROOT: output }, stdio: "inherit" });
process.exit(result.status ?? 1);
