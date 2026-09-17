import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const javascript = ["app.js", "dashboard.js", "notifications.js", "privacy.js", "sw.js"];
for (const file of javascript) {
  const result = spawnSync(process.execPath, ["--check", join(root, file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const html = await readFile(join(root, "index.html"), "utf8");
const manifest = JSON.parse(await readFile(join(root, "manifest.webmanifest"), "utf8"));
if (/<script\s*[^>]*>[^<]/i.test(html) || /<style\s*[^>]*>[^<]/i.test(html)) throw new Error("Inline script/style violates the PWA CSP policy");
if (!html.includes("Content-Security-Policy")) throw new Error("index.html is missing CSP");
if (manifest.display !== "standalone" || manifest.scope !== "./") throw new Error("Manifest is not configured for standalone scoped PWA use");
console.log("Static lint checks passed");
