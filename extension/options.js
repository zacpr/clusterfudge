"use strict";

const list = document.getElementById("clusters");
const form = document.getElementById("preferences");
const status = document.getElementById("status");
const error = document.getElementById("error");
const save = document.getElementById("save");
const activeTab = document.getElementById("active-tab");
const importButton = document.getElementById("import");
const exportButton = document.getElementById("export");
const fileInput = document.getElementById("config-file");
if (!browser.theme) {
  activeTab.disabled = true;
  document.getElementById("theme-note").hidden = false;
}
let ready = false;
let dirty = false;
const palette = [
  { name: "Blue", colors: ["#bfdbfe", "#3b82f6", "#1e3a8a"] },
  { name: "Green", colors: ["#bbf7d0", "#22c55e", "#14532d"] },
  { name: "Teal", colors: ["#99f6e4", "#14b8a6", "#134e4a"] },
  { name: "Amber", colors: ["#fde68a", "#f59e0b", "#78350f"] },
  { name: "Red", colors: ["#fecaca", "#ef4444", "#7f1d1d"] },
  { name: "Purple", colors: ["#e9d5ff", "#a855f7", "#581c87"] }
];

function markDirty() {
  dirty = true;
  status.textContent = "Unsaved changes";
  error.textContent = "";
}

function updateRows() {
  const rows = [...list.children];
  document.getElementById("empty").hidden = rows.length > 0;
  document.getElementById("add").disabled = rows.length >= 100;
  rows.forEach((row, index) => {
    row.querySelector("legend").textContent = `Cluster ${index + 1}`;
    row.querySelector(".up").disabled = index === 0;
    row.querySelector(".down").disabled = index === rows.length - 1;
  });
}

function addCluster(cluster = { id: crypto.randomUUID(), name: "", pattern: "", color: null }) {
  const row = document.getElementById("cluster-template").content.firstElementChild.cloneNode(true);
  row.dataset.id = cluster.id;
  const name = row.querySelector(".name");
  const pattern = row.querySelector(".pattern");
  const color = row.querySelector(".color");
  const hex = row.querySelector(".hex");
  const automatic = row.querySelector(".auto");
  name.value = cluster.name;
  pattern.value = cluster.pattern;
  automatic.checked = cluster.color === null;
  color.value = cluster.color || ClusterfudgeCore.defaultColor(cluster.name);
  hex.value = color.value;
  const preview = () => {
    color.disabled = automatic.checked;
    hex.disabled = automatic.checked;
    if (automatic.checked) {
      color.value = ClusterfudgeCore.defaultColor(name.value.trim());
      hex.value = color.value;
    }
    row.querySelector(".swatch").style.backgroundColor = color.value;
    row.querySelector(".preview").style.backgroundColor = color.value;
    row.querySelector(".preview").style.color = ClusterfudgeCore.contrastText(color.value);
    row.querySelector(".preview-title").textContent = name.value.trim() ? `${name.value.trim()} - Index Management` : "Index Management";
    for (const swatch of row.querySelectorAll(".palette-swatch")) {
      swatch.setAttribute("aria-pressed", String(!automatic.checked && swatch.dataset.color === color.value));
    }
  };
  for (const family of palette) {
    const group = document.createElement("div");
    group.className = "color-family";
    const label = document.createElement("span");
    label.textContent = family.name;
    group.append(label);
    family.colors.forEach((value, index) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "palette-swatch";
      swatch.dataset.color = value;
      swatch.style.backgroundColor = value;
      swatch.title = `${family.name} ${["light", "medium", "dark"][index]} (${value})`;
      swatch.setAttribute("aria-label", swatch.title);
      swatch.addEventListener("click", () => {
        automatic.checked = false;
        color.value = hex.value = value;
        preview();
        markDirty();
      });
      group.append(swatch);
    });
    row.querySelector(".color-palette").append(group);
  }
  row.addEventListener("input", event => {
    if (event.target === color) hex.value = color.value;
    if (event.target === hex && /^#[0-9a-f]{6}$/i.test(hex.value)) color.value = hex.value;
    preview();
    markDirty();
  });
  row.querySelector(".remove").addEventListener("click", () => { row.remove(); updateRows(); markDirty(); });
  row.querySelector(".up").addEventListener("click", () => {
    if (row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    updateRows();
    markDirty();
  });
  row.querySelector(".down").addEventListener("click", () => {
    if (row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    updateRows();
    markDirty();
  });
  list.append(row);
  preview();
  updateRows();
  return row;
}

function readForm() {
  return ClusterfudgeCore.validateConfig({
    clusters: [...list.children].map(row => ({
      id: row.dataset.id,
      name: row.querySelector(".name").value,
      pattern: row.querySelector(".pattern").value,
      color: row.querySelector(".auto").checked ? null : row.querySelector(".hex").value
    })),
    activeTabColoring: activeTab.checked
  });
}

function renderConfig(config) {
  list.replaceChildren();
  config.clusters.forEach(addCluster);
  activeTab.checked = config.activeTabColoring;
  updateRows();
}

importButton.addEventListener("click", () => {
  if (ready && !save.disabled) fileInput.click();
});
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || !ready || save.disabled) return;
  save.disabled = true;
  form.inert = true;
  try {
    if (file.size > 1024 * 1024) throw new Error("Configuration files must be no larger than 1 MB.");
    const config = ClusterfudgePreferences.importJSON(await file.text());
    renderConfig(config);
    markDirty();
    status.textContent = "JSON imported; review and save";
  } catch (failure) {
    error.textContent = failure.message;
    status.textContent = "Not imported";
  } finally {
    fileInput.value = "";
    form.inert = false;
    save.disabled = !ready;
  }
});
exportButton.addEventListener("click", () => {
  if (!ready || save.disabled) return;
  try {
    const json = ClusterfudgePreferences.exportJSON(readForm());
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "clusterfudge-config.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = dirty ? "JSON exported (unsaved changes)" : "JSON exported";
    error.textContent = "";
  } catch (failure) {
    error.textContent = failure.message;
    status.textContent = "Not exported";
  }
});

document.getElementById("add").addEventListener("click", () => {
  if (!ready) return;
  addCluster().querySelector(".name").focus();
  markDirty();
});
activeTab.addEventListener("change", markDirty);
window.addEventListener("beforeunload", event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!ready || save.disabled) return;
  try {
    const config = readForm();
    const origins = [...new Set(config.clusters.map(cluster => ClusterfudgeCore.parsePattern(cluster.pattern).matchPattern))];
    const permission = origins.length ? browser.permissions.request({ origins }) : Promise.resolve(true);
    save.disabled = true;
    form.inert = true;
    status.textContent = "Saving preferences";
    if (!await permission) throw new Error("Host access was not granted. Your existing preferences have not changed.");
    const response = await browser.runtime.sendMessage({ type: "save-preferences", config });
    if (!response?.saved) throw new Error("Preferences could not be saved. Try again after reloading the extension.");
    renderConfig(config);
    dirty = false;
    status.textContent = "Preferences saved";
    error.textContent = "";
  } catch (failure) {
    error.textContent = failure.message;
    status.textContent = "Not saved";
  } finally {
    form.inert = false;
    save.disabled = !ready;
  }
});

ClusterfudgePreferences.load(browser.storage.local).then(config => {
  renderConfig(config);
  ready = true;
  save.disabled = false;
  importButton.disabled = false;
  exportButton.disabled = false;
  status.textContent = "Preferences loaded";
}).catch(failure => {
  error.textContent = `Cannot load preferences: ${failure.message}`;
  status.textContent = "Preferences unavailable";
});