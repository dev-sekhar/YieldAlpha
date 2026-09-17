import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("PWA manifest has installable application metadata", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons.length >= 2);
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("service worker caches and serves the offline shell", async () => {
  const source = await read("sw.js");
  assert.match(source, /caches\.open/);
  assert.match(source, /APP_SHELL/);
  assert.match(source, /skipWaiting/);
  assert.match(source, /clients\.claim/);
  assert.match(source, /event\.request\.mode === "navigate"/);
  assert.match(source, /caches\.match\("\.\/index\.html"\)/);
});

test("application registers the service worker and handles installation", async () => {
  const source = await read("app.js");
  assert.match(source, /serviceWorker\.register/);
  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /userChoice/);
  assert.match(source, /navigator\.onLine/);
});

test("PWA shell references manifest, service worker assets, and icons", async () => {
  const html = await read("index.html");
  const worker = await read("sw.js");
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /icons\/icon\.svg/);
  for (const asset of ["./index.html", "./styles.css", "./app.js", "./manifest.webmanifest"]) assert.match(worker, new RegExp(asset.replaceAll(".", "\\.")));
});

test("PWA shell has mobile viewport and responsive layout safeguards", async () => {
  const html = await read("index.html");
  const css = await read("styles.css");
  assert.match(html, /name="viewport"/);
  assert.match(html, /width=device-width/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /prefers-reduced-motion/);
});
