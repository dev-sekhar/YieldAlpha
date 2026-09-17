import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dashboard = await readFile(join(root, "dashboard.js"), "utf8");
const css = await readFile(join(root, "styles.css"), "utf8");
if (!/active\.slice\(0, 5\)/.test(dashboard) || !/items\.slice\(0, 5\)/.test(dashboard)) throw new Error("Dashboard feed rendering is not bounded");
if (!/overflow-x: hidden/.test(css) || !/overflow-x: auto/.test(css)) throw new Error("Mobile overflow safeguards are missing");
console.log("Mobile performance safeguards passed");
