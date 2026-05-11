const state = {
  status: null,
  saves: [],
  settings: null,
  selectedId: null,
  query: "",
  filter: "all"
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  managerPath: $("#managerPath"),
  saveCount: $("#saveCount"),
  saveList: $("#saveList"),
  searchInput: $("#searchInput"),
  filterButtons: Array.from(document.querySelectorAll("[data-filter]")),
  emptyDetail: $("#emptyDetail"),
  detailView: $("#detailView"),
  detailContent: $("#detailContent"),
  detailHero: $("#detailHero"),
  detailName: $("#detailName"),
  detailCreated: $("#detailCreated"),
  detailMap: $("#detailMap"),
  detailMapType: $("#detailMapType"),
  detailSize: $("#detailSize"),
  detailVersion: $("#detailVersion"),
  detailCompatibility: $("#detailCompatibility"),
  detailNotes: $("#detailNotes"),
  detailInstruction: $("#detailInstruction"),
  nameInput: $("#nameInput"),
  mapNameInput: $("#mapNameInput"),
  mapTypeInput: $("#mapTypeInput"),
  teardownVersionInput: $("#teardownVersionInput"),
  requiredMapHintInput: $("#requiredMapHintInput"),
  notesInput: $("#notesInput"),
  activatedPill: $("#activatedPill"),
  createDialog: $("#createDialog"),
  createName: $("#createName"),
  createMapName: $("#createMapName"),
  createMapType: $("#createMapType"),
  createTeardownVersion: $("#createTeardownVersion"),
  createRequiredMapHint: $("#createRequiredMapHint"),
  createNotes: $("#createNotes"),
  editDialog: $("#editDialog"),
  settingsDialog: $("#settingsDialog"),
  backupBeforeLoadInput: $("#backupBeforeLoadInput"),
  loadBackupEveryInput: $("#loadBackupEveryInput"),
  backupBeforeUpdateInput: $("#backupBeforeUpdateInput"),
  updateBackupEveryInput: $("#updateBackupEveryInput"),
  infoDialog: $("#infoDialog"),
  infoTitle: $("#infoTitle"),
  infoText: $("#infoText"),
  pathActions: $(".path-actions"),
  toast: $("#toast")
};

const iconStar = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"></path>
  </svg>
`;

const iconMenu = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5h.01"></path>
    <path d="M12 12h.01"></path>
    <path d="M12 19h.01"></path>
  </svg>
`;

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday - startOfDate) / 86400000);
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: today.getFullYear() === date.getFullYear() ? undefined : "numeric"
  }).format(date);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = unit === 0 || value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unit]}`;
}

function mapTypeLabel(value) {
  const labels = {
    official: "Official Map",
    workshop: "Workshop Map",
    local_mod: "Legacy",
    dev_map: "Legacy",
    unknown: "Unknown"
  };
  return labels[value] || labels.unknown;
}

function mapName(save) {
  return save.mapName || "Map not set";
}

function loadInstruction(save) {
  if (save.requiredMapHint) return save.requiredMapHint;
  if (save.mapName) return `Open ${save.mapName} in Teardown`;
  return "Open the required map in Teardown";
}

function detailTitle(save) {
  return /\bsetup\b/i.test(save.name) ? save.name : `${save.name} Setup`;
}

function libraryFilterForSave(save) {
  if (save.mapType === "official") return "official";
  if (save.mapType === "workshop") return "workshop";
  return "legacy";
}

function compatibilityForSave(save) {
  if (save.mapType === "official") {
    return { label: "Verified", tone: "verified", symbol: "check" };
  }
  if (save.mapType === "workshop") {
    return { label: "Untested", tone: "untested", symbol: "question" };
  }
  return { label: "Legacy", tone: "legacy", symbol: "legacy" };
}

function sceneIndex(save) {
  const index = state.saves.findIndex((item) => item.id === save.id);
  if (index >= 0) return index % 4;
  return 0;
}

function sceneClass(save) {
  return `scene-${sceneIndex(save)}`;
}

function automaticBackupText(mode, every, noun) {
  if (mode === "always") return `Automatic backup: every ${noun}.`;
  if (mode === "never") return `Automatic backup: disabled for ${noun}s.`;
  return `Automatic backup: every ${every} ${noun}s.`;
}

function backupResultText(result, skippedText) {
  if (result.backupPath) return `Backup created:\n${result.backupPath}`;
  if (result.backupSkipped) return skippedText;
  return "No previous quicksave was found to back up.";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 3200);
}

function showInfo(title, text, options = {}) {
  elements.infoTitle.textContent = title;
  elements.infoText.textContent = text;
  elements.pathActions.classList.toggle("hidden", !options.showPathActions);
  elements.infoDialog.showModal();
}

function showLoadInstructions(save, result) {
  showInfo("Ready to Quickload", [
    `"${save.name}" has been copied into Teardown's active quicksave slot.`,
    backupResultText(
      result,
      `Automatic active-save backup was skipped by your settings. Operations since last automatic backup: ${result.operationsSinceBackup}.`
    ),
    "",
    `Required map:\n${mapName(save)}`,
    `Map type:\n${mapTypeLabel(save.mapType)}`,
    "",
    loadInstruction(save),
    "",
    "Teardown is opening through Steam.",
    "Once the map is loaded, press F9 / Quickload."
  ].join("\n"), { showPathActions: false });
}

async function copyText(text, successMessage) {
  if (!text) {
    showToast("No path is available to copy.");
    return;
  }

  await navigator.clipboard.writeText(text);
  showToast(successMessage);
}

async function openManagedPath(target) {
  const result = await api("/api/reveal", {
    method: "POST",
    body: JSON.stringify({ target })
  });
  showToast(`Opened ${result.opened}`);
}

function selectedSave() {
  return state.saves.find((save) => save.id === state.selectedId) || null;
}

function filteredSaves() {
  const query = state.query.trim().toLowerCase();
  return state.saves.filter((save) => {
    const matchesFilter = state.filter === "all" || libraryFilterForSave(save) === state.filter;
    if (!matchesFilter) return false;
    if (!query) return true;
    return [
      save.name,
      save.mapName,
      save.notes,
      mapTypeLabel(save.mapType)
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function renderStatus() {
  if (elements.managerPath) {
    elements.managerPath.textContent = state.status ? state.status.managerRoot : "";
    elements.managerPath.title = state.status ? state.status.managerRoot : "";
  }
  elements.saveCount.textContent = `${state.saves.length} save${state.saves.length === 1 ? "" : "s"}`;
}

function renderFilters() {
  elements.filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });
}

function renderCompatibility(container, compatibility) {
  container.className = `compatibility ${compatibility.tone}`;
  container.innerHTML = "";

  const badge = document.createElement("span");
  badge.className = "compatibility-icon";
  badge.textContent = compatibility.symbol === "check" ? "" : compatibility.symbol === "question" ? "?" : "";
  container.append(badge, document.createTextNode("Compatibility: "));

  const strong = document.createElement("strong");
  strong.textContent = compatibility.label;
  container.append(strong);
}

function renderLegacyMeta(container, save) {
  container.className = "legacy-meta";
  container.innerHTML = "";

  const tag = document.createElement("span");
  tag.className = "legacy-tag";
  tag.textContent = "Legacy";

  const size = document.createElement("span");
  size.className = "legacy-size";
  size.textContent = formatBytes(save.size);

  container.append(tag, size);
}

function renderList() {
  elements.saveList.replaceChildren();
  const saves = filteredSaves();

  if (!saves.length) {
    const empty = document.createElement("div");
    empty.className = "scenario-empty";
    empty.textContent = state.saves.length ? "No matching scenarios." : "No saved quicksaves yet.";
    elements.saveList.append(empty);
    return;
  }

  saves.forEach((save) => {
    const selected = save.id === state.selectedId;
    const row = document.createElement("article");
    row.className = `scenario-row${selected ? " selected" : ""}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected ? "true" : "false");
    row.tabIndex = 0;
    row.dataset.id = save.id;

    const thumbnail = document.createElement("span");
    thumbnail.className = `scenario-thumb ${sceneClass(save)}`;
    thumbnail.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.className = "scenario-copy";

    const title = document.createElement("span");
    title.className = "scenario-name";
    title.textContent = save.name;

    const map = document.createElement("span");
    map.className = "scenario-map";
    map.textContent = `Required map: ${mapName(save)}`;

    const meta = document.createElement("span");
    const compatibility = compatibilityForSave(save);
    if (compatibility.tone === "legacy") renderLegacyMeta(meta, save);
    else renderCompatibility(meta, compatibility);
    copy.append(title, map, meta);

    const utilities = document.createElement("span");
    utilities.className = "scenario-utilities";

    const utilityButtons = document.createElement("span");
    utilityButtons.className = "utility-buttons";

    const star = document.createElement("button");
    star.className = "row-icon-button";
    star.type = "button";
    star.title = "Favorite";
    star.setAttribute("aria-label", `Favorite ${save.name}`);
    star.innerHTML = iconStar;
    star.addEventListener("click", (event) => {
      event.stopPropagation();
      showToast("Favorites are visual only in this view.");
    });

    const menu = document.createElement("button");
    menu.className = "row-icon-button";
    menu.type = "button";
    menu.title = "More";
    menu.setAttribute("aria-label", `More actions for ${save.name}`);
    menu.innerHTML = iconMenu;
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedId = save.id;
      render();
      openEditDialog();
    });

    const size = document.createElement("span");
    size.className = "scenario-size";
    size.textContent = formatBytes(save.size);
    size.classList.toggle("hidden", compatibility.tone === "legacy");

    utilityButtons.append(star, menu);
    utilities.append(utilityButtons, size);
    row.append(thumbnail, copy, utilities);

    row.addEventListener("click", () => {
      state.selectedId = save.id;
      render();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedId = save.id;
        render();
      }
    });
    elements.saveList.append(row);
  });
}

function renderDetail() {
  const save = selectedSave();
  elements.emptyDetail.classList.toggle("hidden", Boolean(save));
  elements.detailContent.classList.toggle("hidden", !save);
  $("#activateButton").disabled = !save;
  $("#updateButton").disabled = !save;
  $("#deleteButton").disabled = !save;
  $("#copyPathButton").disabled = !save;

  if (!save) return;

  const compatibility = compatibilityForSave(save);
  elements.detailHero.className = `scenario-hero ${sceneClass(save)}`;
  elements.detailName.textContent = detailTitle(save);
  elements.detailCreated.textContent = formatShortDate(save.createdAt);
  elements.detailMap.textContent = mapName(save);
  elements.detailMapType.textContent = mapTypeLabel(save.mapType);
  elements.detailSize.textContent = formatBytes(save.size);
  elements.detailVersion.textContent = save.teardownVersion || "None";
  elements.detailCompatibility.innerHTML = `<span class="status-dot ${compatibility.tone}"></span>${compatibility.label}`;
  elements.detailNotes.textContent = save.notes || "No notes.";
  elements.detailInstruction.textContent = loadInstruction(save);
  elements.activatedPill.classList.toggle("hidden", !save.activatedAt);
}

function render() {
  renderStatus();
  renderFilters();
  renderList();
  renderDetail();
}

async function refresh() {
  const [status, saves, settings] = await Promise.all([
    api("/api/status"),
    api("/api/saves"),
    api("/api/settings")
  ]);
  state.status = status;
  state.saves = saves.saves;
  state.settings = settings;
  if (state.selectedId && !state.saves.some((save) => save.id === state.selectedId)) {
    state.selectedId = null;
  }
  if (!state.selectedId && state.saves.length) {
    state.selectedId = state.saves[0].id;
  }
  render();
}

async function createSave() {
  const name = elements.createName.value.trim();
  const mapNameValue = elements.createMapName.value.trim();
  const mapType = elements.createMapType.value;
  const teardownVersion = elements.createTeardownVersion.value.trim();
  const requiredMapHint = elements.createRequiredMapHint.value.trim();
  const notes = elements.createNotes.value.trim();
  const result = await api("/api/saves", {
    method: "POST",
    body: JSON.stringify({ name, mapName: mapNameValue, mapType, teardownVersion, requiredMapHint, notes })
  });
  state.selectedId = result.id;
  elements.createName.value = "";
  elements.createMapName.value = "";
  elements.createMapType.value = "unknown";
  elements.createTeardownVersion.value = "";
  elements.createRequiredMapHint.value = "";
  elements.createNotes.value = "";
  await refresh();
  showToast("Current quicksave stored.");
}

async function updateSelected() {
  const save = selectedSave();
  if (!save) return;
  await api(`/api/saves/${encodeURIComponent(save.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: elements.nameInput.value.trim(),
      mapName: elements.mapNameInput.value.trim(),
      mapType: elements.mapTypeInput.value,
      teardownVersion: elements.teardownVersionInput.value.trim(),
      requiredMapHint: elements.requiredMapHintInput.value.trim(),
      notes: elements.notesInput.value.trim()
    })
  });
  await refresh();
  showToast("Save details updated.");
}

function openEditDialog() {
  const save = selectedSave();
  if (!save) return;
  elements.nameInput.value = save.name;
  elements.mapNameInput.value = save.mapName || "";
  elements.mapTypeInput.value = save.mapType || "unknown";
  elements.teardownVersionInput.value = save.teardownVersion || "";
  elements.requiredMapHintInput.value = save.requiredMapHint || "";
  elements.notesInput.value = save.notes || "";
  elements.editDialog.showModal();
  elements.nameInput.focus();
}

async function loadSelected(save = selectedSave()) {
  if (!save) return;
  const confirmed = window.confirm([
    `Load "${save.name}" into Teardown?`,
    "",
    "This will copy this slot into Teardown's active quicksave.bin and open Teardown through Steam.",
    state.settings ? automaticBackupText(state.settings.backupBeforeLoad, state.settings.loadBackupEvery, "load") : "",
    "",
    `Required map: ${mapName(save)}`,
    "After the map opens, press F9 / Quickload."
  ].join("\n"));
  if (!confirmed) return;

  const result = await api(`/api/saves/${encodeURIComponent(save.id)}/load`, {
    method: "POST"
  });
  await refresh();
  showToast(result.backupPath ? "Save loaded. Automatic backup created." : "Save loaded.");
  showLoadInstructions(save, result);
}

async function saveSettings() {
  const settings = await api("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({
      backupBeforeLoad: elements.backupBeforeLoadInput.value,
      loadBackupEvery: elements.loadBackupEveryInput.value,
      backupBeforeUpdate: elements.backupBeforeUpdateInput.value,
      updateBackupEvery: elements.updateBackupEveryInput.value
    })
  });
  state.settings = settings;
  showToast("Backup settings saved.");
}

function openSettingsDialog() {
  const settings = state.settings || {
    backupBeforeLoad: "every_n",
    loadBackupEvery: 5,
    backupBeforeUpdate: "every_n",
    updateBackupEvery: 5
  };
  elements.backupBeforeLoadInput.value = settings.backupBeforeLoad;
  elements.loadBackupEveryInput.value = settings.loadBackupEvery;
  elements.backupBeforeUpdateInput.value = settings.backupBeforeUpdate;
  elements.updateBackupEveryInput.value = settings.updateBackupEvery;
  elements.settingsDialog.showModal();
}

async function launchTeardown() {
  await api("/api/launch-teardown", { method: "POST" });
  showToast("Opening Teardown through Steam.");
}

async function deleteSelected() {
  const save = selectedSave();
  if (!save) return;
  const confirmed = window.confirm(`Remove "${save.name}" from the manager?\n\nIt will be moved to the deleted folder.`);
  if (!confirmed) return;

  await api(`/api/saves/${encodeURIComponent(save.id)}`, {
    method: "DELETE"
  });
  state.selectedId = null;
  await refresh();
  showToast("Save moved to deleted folder.");
}

function showPathsDialog() {
  if (!state.status) return;
  showInfo("Paths", [
    `Active quicksave:\n${state.status.activeSavePath}`,
    `Managed saves:\n${state.status.savesDir}`,
    `Backups:\n${state.status.backupsDir}`,
    `Deleted saves:\n${state.status.deletedDir || ""}`
  ].join("\n\n"), { showPathActions: true });
}

function setupWindowControls() {
  const controls = window.teardownWindow;
  $("#windowMinimizeButton").addEventListener("click", () => {
    if (controls) controls.minimize();
    else showToast("Window controls are available in the desktop app.");
  });
  $("#windowMaximizeButton").addEventListener("click", () => {
    if (controls) controls.toggleMaximize();
    else showToast("Window controls are available in the desktop app.");
  });
  $("#windowCloseButton").addEventListener("click", () => {
    if (controls) controls.close();
    else window.close();
  });
}

$("#refreshButton").addEventListener("click", () => {
  state.filter = "all";
  state.query = "";
  if (elements.searchInput) elements.searchInput.value = "";
  refresh().catch((error) => showToast(error.message));
});

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = state.filter === button.dataset.filter ? "all" : button.dataset.filter;
    render();
  });
});

$("#newSaveButton").addEventListener("click", () => {
  elements.createDialog.showModal();
  elements.createName.focus();
});

$("#confirmCreateButton").addEventListener("click", (event) => {
  event.preventDefault();
  createSave()
    .then(() => elements.createDialog.close())
    .catch((error) => showToast(error.message));
});

$("#updateButton").addEventListener("click", () => {
  openEditDialog();
});

$("#confirmUpdateButton").addEventListener("click", (event) => {
  event.preventDefault();
  updateSelected()
    .then(() => elements.editDialog.close())
    .catch((error) => showToast(error.message));
});

$("#settingsButton").addEventListener("click", () => {
  openSettingsDialog();
});

$("#confirmSettingsButton").addEventListener("click", (event) => {
  event.preventDefault();
  saveSettings()
    .then(() => elements.settingsDialog.close())
    .catch((error) => showToast(error.message));
});

$("#activateButton").addEventListener("click", () => {
  loadSelected().catch((error) => showToast(error.message));
});

$("#backupButton").addEventListener("click", () => {
  openManagedPath("backups").catch((error) => showToast(error.message));
});

$("#openTeardownButton").addEventListener("click", () => {
  launchTeardown().catch((error) => showToast(error.message));
});

$("#copyPathButton").addEventListener("click", () => {
  const save = selectedSave();
  copyText(save ? save.quicksavePath : "", "Selected quicksave path copied.").catch((error) => showToast(error.message));
});

$("#deleteButton").addEventListener("click", () => {
  deleteSelected().catch((error) => showToast(error.message));
});

$("#revealButton").addEventListener("click", () => {
  openManagedPath("backups").catch((error) => showToast(error.message));
});

$("#pathsButton").addEventListener("click", () => {
  showPathsDialog();
});

$("#openActiveButton").addEventListener("click", () => {
  openManagedPath("active").catch((error) => showToast(error.message));
});

$("#openSavesButton").addEventListener("click", () => {
  openManagedPath("saves").catch((error) => showToast(error.message));
});

$("#openBackupsButton").addEventListener("click", () => {
  openManagedPath("backups").catch((error) => showToast(error.message));
});

$("#openDeletedButton").addEventListener("click", () => {
  openManagedPath("deleted").catch((error) => showToast(error.message));
});

setupWindowControls();
refresh().catch((error) => {
  showToast(error.message);
});
