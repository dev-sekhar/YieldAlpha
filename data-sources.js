let repositoryPromise;

const $ = (selector) => document.querySelector(selector);

function id(prefix) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function getDomain() {
  if (!repositoryPromise) repositoryPromise = import("./lib/index.js").then(async (module) => ({ ...module, repository: await module.createWorkspaceRepository() }));
  return repositoryPromise;
}

function field(labelText, name, value, type = "text") {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  if (type === "checkbox") input.checked = Boolean(value);
  else input.value = value ?? "";
  label.append(input);
  return label;
}

function selectField(value) {
  const label = document.createElement("label");
  label.textContent = "Tier";
  const select = document.createElement("select");
  select.name = "tier";
  for (const tier of ["Tier 1", "Tier 2", "Tier 3", "Tier 4", "Context"]) {
    const option = document.createElement("option");
    option.value = tier;
    option.textContent = tier;
    option.selected = tier === value;
    select.append(option);
  }
  label.append(select);
  return label;
}

function sourceForm(source) {
  const form = document.createElement("form");
  form.className = "data-source-card";
  form.dataset.sourceId = source.id;
  const header = document.createElement("div");
  header.className = "data-source-card-heading";
  const title = document.createElement("strong");
  title.textContent = source.name;
  const badge = document.createElement("span");
  badge.className = "source-tier";
  badge.textContent = source.tier;
  header.append(title, badge);
  const fields = document.createElement("div");
  fields.className = "data-source-fields";
  fields.append(field("Name", "name", source.name), selectField(source.tier), field("URL or identifier", "url", source.url), field("Primary use", "primaryUse", source.primaryUse), field("Production role", "productionRole", source.productionRole), field("Notes", "notes", source.notes));
  const footer = document.createElement("div");
  footer.className = "data-source-card-footer";
  footer.append(field("Tracked in catalog", "enabled", source.enabled, "checkbox"));
  const research = document.createElement("small");
  research.textContent = source.researchUsed ? "Marked as used in research" : "Not marked as used in research";
  const save = document.createElement("button");
  save.className = "secondary-button";
  save.type = "submit";
  save.textContent = "Save source";
  footer.append(research, save);
  form.append(header, fields, footer);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const loaded = await getDomain();
      const value = (name) => form.elements.namedItem(name).value.trim();
      await loaded.saveDataSourceConfig(loaded.repository, { ...source, name: value("name"), tier: value("tier"), url: value("url"), primaryUse: value("primaryUse"), productionRole: value("productionRole"), notes: value("notes"), enabled: form.elements.namedItem("enabled").checked });
      setStatus("Source saved and audited.", "success");
      await loadSources();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Source could not be saved.", "error");
    } finally {
      save.disabled = false;
    }
  });
  return form;
}

function setStatus(message, tone = "") {
  const status = $("#data-sources-status");
  if (!status) return;
  status.textContent = message;
  status.className = `panel-kicker ${tone}`.trim();
}

async function loadSources() {
  const loaded = await getDomain();
  const sources = await loaded.initializeDataSources(loaded.repository);
  const container = $("#data-source-list");
  if (!container) return;
  const rank = { "Tier 1": 1, "Tier 2": 2, "Tier 3": 3, "Tier 4": 4, Context: 5 };
  container.replaceChildren(...[...sources].sort((a, b) => (rank[a.tier] - rank[b.tier]) || a.name.localeCompare(b.name)).map(sourceForm));
  setStatus(`${sources.length} sources configured`);
}

async function addSource(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const loaded = await getDomain();
    const now = new Date().toISOString();
    const value = (name) => form.elements.namedItem(name).value.trim();
    await loaded.saveDataSourceConfig(loaded.repository, { id: id("source"), kind: "data-source-config", createdAt: now, updatedAt: now, version: 0, name: value("name"), tier: value("tier"), primaryUse: "User-defined source", productionRole: "User-defined", url: value("url"), researchUsed: false, notes: "Added by user", enabled: true });
    form.reset();
    await loadSources();
    setStatus("Source added and audited.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Source could not be added.", "error");
  }
}

export function bindDataSourceControls() {
  const form = $("#data-source-add-form");
  if (!form) return;
  form.addEventListener("submit", addSource);
  loadSources().catch((error) => setStatus(error instanceof Error ? error.message : "Source catalog unavailable.", "error"));
}
