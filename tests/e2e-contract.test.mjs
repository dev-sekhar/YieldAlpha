import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("release smoke: the mobile shell wires install, dashboard, alerts, privacy, and offline assets", async () => {
  const html = await read("index.html");
  const app = await read("app.js");
  const worker = await read("sw.js");
  for (const asset of ["app.js", "styles.css", "manifest.webmanifest", "icons/icon.svg"]) assert.match(html, new RegExp(asset.replaceAll(".", "\\.")));
  assert.match(app, /loadDashboard/);
  assert.match(app, /registerServiceWorker/);
  assert.match(app, /bindPrivacyControls/);
  assert.match(worker, /APP_SHELL/);
  assert.match(worker, /privacy\.js/);
  assert.match(html, /id="alerts"/);
  assert.match(html, /id="privacy"/);
});

