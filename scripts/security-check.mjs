import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = await readFile(join(root, "index.html"), "utf8");
if (!/default-src 'self'/.test(html) || !/object-src 'none'/.test(html) || !/script-src 'self'/.test(html)) throw new Error("CSP is missing required restrictive directives");
for (const file of ["app.js", "dashboard.js", "notifications.js", "privacy.js", "sw.js"]) {
  const source = await readFile(join(root, file), "utf8");
  for (const pattern of [/\beval\s*\(/, /new\s+Function\s*\(/, /innerHTML\s*=/, /outerHTML\s*=/]) {
    if (pattern.test(source)) throw new Error(`${file} contains unsafe dynamic rendering: ${pattern}`);
  }
}
const privacy = await readFile(join(root, "privacy.js"), "utf8");
if (!/delete copy\.apiKey/.test(privacy)) throw new Error("Provider API keys are not excluded from browser backups");
console.log("Security checks passed");
