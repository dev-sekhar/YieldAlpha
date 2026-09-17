import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = await readFile(join(root, "index.html"), "utf8");
if (!/<html\s+lang="[^"]+"/.test(html)) throw new Error("Document language is missing");
if (!/<meta\s+name="viewport"/.test(html)) throw new Error("Mobile viewport is missing");
if (!/<main>/.test(html) || !/<nav[^>]+aria-label=/.test(html)) throw new Error("Semantic main/nav landmarks are missing");
for (const button of html.matchAll(/<button\b[^>]*>/gi)) if (!/\btype="(?:button|submit|reset)"/i.test(button[0])) throw new Error(`Button is missing an explicit type: ${button[0]}`);
if (/<img\b/i.test(html)) throw new Error("Images must have an explicit accessible treatment; use the current inline/icon link pattern");
if (!/aria-live="polite"/.test(html) || !/role="status"/.test(html)) throw new Error("Dynamic status content is missing an accessible announcement path");
console.log("Accessibility shell checks passed");
