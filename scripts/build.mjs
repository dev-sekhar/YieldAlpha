import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const staticFiles = ["index.html", "styles.css", "app.js", "analysis.js", "data-sources.js", "public-data.js", "dashboard.js", "notifications.js", "privacy.js", "research-workflows.js", "sw.js", "manifest.webmanifest"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of staticFiles) await cp(join(root, file), join(dist, file));
await cp(join(root, "icons"), join(dist, "icons"), { recursive: true });
try { await mkdir(join(dist, "data"), { recursive: true }); await cp(join(root, "data", "public-data.json"), join(dist, "data", "public-data.json")); } catch { /* Snapshot is generated locally by the Python fetcher. */ }
await cp(join(root, "docs", "DATA_AVAILABILITY_MATRIX.html"), join(dist, "DATA_AVAILABILITY_MATRIX.html"));
await writeFile(join(dist, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2));

const result = spawnSync(process.execPath, [tsc, "--ignoreConfig", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--outDir", join(dist, "lib"), "--rootDir", join(root, "src"), "--skipLibCheck", join(root, "src", "index.ts")], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`YieldAlpha production output created at ${dist}`);
