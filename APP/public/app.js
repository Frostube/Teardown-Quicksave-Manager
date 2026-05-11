const state = {
  status: null,
  saves: [],
  settings: null,
  modInventory: null,
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
  topTabs: Array.from(document.querySelectorAll(".top-tab")),
  filterButtons: Array.from(document.querySelectorAll("[data-filter]")),
  emptyDetail: $("#emptyDetail"),
  detailView: $("#detailView"),
  detailContent: $("#detailContent"),
  detailHero: $("#detailHero"),
  uploadPreviewButton: $("#uploadPreviewButton"),
  previewFileInput: $("#previewFileInput"),
  detailName: $("#detailName"),
  detailCreated: $("#detailCreated"),
  detailMap: $("#detailMap"),
  detailMapType: $("#detailMapType"),
  detailSize: $("#detailSize"),
  detailVersion: $("#detailVersion"),
  detailCompatibility: $("#detailCompatibility"),
  detailNotes: $("#detailNotes"),
  detailInstruction: $("#detailInstruction"),
  detailModsSummary: $("#detailModsSummary"),
  modsSource: $("#modsSource"),
  modlistSelect: $("#modlistSelect"),
  requiredModsList: $("#requiredModsList"),
  captureModsButton: $("#captureModsButton"),
  compareModsButton: $("#compareModsButton"),
  copyModLinksButton: $("#copyModLinksButton"),
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
  createModlistInput: $("#createModlistInput"),
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

const iconStar = `<span class="icon icon-star" aria-hidden="true"></span>`;

const iconMenu = `<span class="icon icon-ellipsis-vertical" aria-hidden="true"></span>`;

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

function previewStyle(save) {
  return save.thumbnail ? `url("${save.thumbnail}")` : "";
}

function automaticBackupText(mode, every, noun) {
  if (mode === "always") return `Automatic backup: every ${noun}.`;
  if (mode === "never") return `Automatic backup: disabled for ${noun}s.`;
  return `Automatic backup: every ${every} ${noun}s.`;
}

function currentModlistId() {
  return elements.modlistSelect.value || state.modInventory?.selectedModlistId || "";
}

function modlists() {
  return state.modInventory?.modlists || [];
}

function modsMap() {
  return new Map((state.modInventory?.mods || []).map((mod) => [mod.id, mod]));
}

function activeModSet(modlistId = currentModlistId()) {
  const list = modlists().find((item) => item.id === modlistId) || modlists()[0];
  return new Set(list?.mods || []);
}

function requiredMods(save) {
  return save?.requiredMods?.mods || [];
}

function modStatus(mod, activeIds = activeModSet(), knownMods = modsMap()) {
  const current = knownMods.get(mod.id);
  if (!current?.installed && !mod.installed) return { label: "Missing", tone: "missing" };
  if (!activeIds.has(mod.id)) return { label: "Inactive", tone: "inactive" };
  return { label: "Active", tone: "active" };
}

function summarizeRequiredMods(save, modlistId = currentModlistId()) {
  const mods = requiredMods(save);
  const activeIds = activeModSet(modlistId);
  const knownMods = modsMap();
  const summary = { total: mods.length, active: 0, inactive: 0, missing: 0 };
  mods.forEach((mod) => {
    const status = modStatus(mod, activeIds, knownMods);
    summary[status.tone] += 1;
  });
  return summary;
}

function populateModlistSelect(select, selectedId) {
  select.replaceChildren();
  const lists = modlists();
  if (!lists.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No Teardown modlists found";
    select.append(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const currentId = state.modInventory?.selectedModlistId || "";
  lists.forEach((list) => {
    const option = document.createElement("option");
    option.value = list.id;
    option.textContent = `${list.name} (${list.mods.length})${list.id === currentId ? " - current in Teardown" : ""}`;
    select.append(option);
  });
  select.value = lists.some((list) => list.id === selectedId) ? selectedId : lists[0].id;
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

function setActiveTopTab(buttonId) {
  elements.topTabs.forEach((button) => {
    button.classList.toggle("active", button.id === buttonId);
  });
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

function renderModControls() {
  populateModlistSelect(elements.createModlistInput, state.modInventory?.selectedModlistId || "");
}

function renderCompatibility(container, compatibility) {
  container.className = `compatibility ${compatibility.tone}`;
  container.innerHTML = "";

  const badge = document.createElement("span");
  badge.className = compatibility.symbol === "check" ? "icon icon-circle-check compatibility-icon" : "compatibility-icon";
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

function renderRequiredMods(save) {
  const selectedModlistId = currentModlistId();
  populateModlistSelect(elements.modlistSelect, selectedModlistId);
  const captured = save.requiredMods;
  const mods = requiredMods(save);
  elements.requiredModsList.replaceChildren();

  if (!captured || !mods.length) {
    elements.detailModsSummary.textContent = "Not captured";
    elements.modsSource.textContent = "No mod snapshot captured.";
    const empty = document.createElement("div");
    empty.className = "mod-row";
    empty.textContent = "Capture a Teardown modlist to attach required mods to this save.";
    elements.requiredModsList.append(empty);
    return;
  }

  const summary = summarizeRequiredMods(save, elements.modlistSelect.value);
  const sourceName = captured.source?.name || "Unknown modlist";
  const capturedAt = captured.capturedAt ? formatDate(captured.capturedAt) : "unknown time";
  elements.detailModsSummary.textContent = `${summary.active}/${summary.total} active`;
  elements.modsSource.textContent = `Captured from ${sourceName} on ${capturedAt}`;

  const activeIds = activeModSet(elements.modlistSelect.value);
  const knownMods = modsMap();
  mods.forEach((mod) => {
    const current = knownMods.get(mod.id) || mod;
    const status = modStatus(mod, activeIds, knownMods);
    const row = document.createElement("div");
    row.className = "mod-row";

    const main = document.createElement("div");
    main.className = "mod-main";
    const label = document.createElement(current.link ? "a" : "span");
    label.textContent = current.name || mod.name || mod.id;
    if (current.link) {
      label.href = current.link;
      label.target = "_blank";
      label.rel = "noreferrer";
    }
    const meta = document.createElement("div");
    meta.className = "mod-meta";
    meta.textContent = `${current.kind || mod.kind || "mod"} - ${mod.id}`;
    main.append(label, meta);

    const badge = document.createElement("span");
    badge.className = `mod-status ${status.tone}`;
    badge.textContent = status.label;
    row.append(main, badge);
    elements.requiredModsList.append(row);
  });
}

function renderList(saves = filteredSaves()) {
  elements.saveList.replaceChildren();

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
    thumbnail.style.backgroundImage = previewStyle(save);

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
    star.className = `row-icon-button favorite-button${save.favorite ? " active" : ""}`;
    star.type = "button";
    star.title = save.favorite ? "Remove favorite" : "Favorite";
    star.setAttribute("aria-label", `${save.favorite ? "Remove favorite from" : "Favorite"} ${save.name}`);
    star.setAttribute("aria-pressed", save.favorite ? "true" : "false");
    star.innerHTML = iconStar;
    star.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(save).catch((error) => showToast(error.message));
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

function renderDetail(visibleSaves = filteredSaves()) {
  const selected = selectedSave();
  const save = selected && visibleSaves.some((item) => item.id === selected.id) ? selected : null;
  const emptyLabel = elements.emptyDetail.querySelector("span") || elements.emptyDetail;
  emptyLabel.textContent = selected && !save ? "Selected scenario is hidden by the current filter" : "No scenario selected";
  elements.emptyDetail.classList.toggle("hidden", Boolean(save));
  elements.detailContent.classList.toggle("hidden", !save);
  $("#activateButton").disabled = !save;
  $("#updateButton").disabled = !save;
  $("#deleteButton").disabled = !save;
  $("#copyPathButton").disabled = !save;
  elements.captureModsButton.disabled = !save;
  elements.compareModsButton.disabled = !save;
  elements.copyModLinksButton.disabled = !save;
  elements.uploadPreviewButton.disabled = !save;

  if (!save) return;

  const compatibility = compatibilityForSave(save);
  elements.detailHero.className = `scenario-hero ${sceneClass(save)}`;
  elements.detailHero.style.backgroundImage = previewStyle(save);
  elements.detailName.textContent = detailTitle(save);
  elements.detailCreated.textContent = formatShortDate(save.createdAt);
  elements.detailMap.textContent = mapName(save);
  elements.detailMapType.textContent = mapTypeLabel(save.mapType);
  elements.detailSize.textContent = formatBytes(save.size);
  elements.detailVersion.textContent = save.teardownVersion || "None";
  const detailIcon = compatibility.symbol === "check"
    ? `<span class="icon icon-circle-check status-icon ${compatibility.tone}" aria-hidden="true"></span>`
    : `<span class="status-dot ${compatibility.tone}" aria-hidden="true"></span>`;
  elements.detailCompatibility.innerHTML = `${detailIcon}${compatibility.label}`;
  elements.detailNotes.textContent = save.notes || "No notes.";
  elements.detailInstruction.textContent = loadInstruction(save);
  elements.activatedPill.classList.toggle("hidden", !save.activatedAt);
  renderRequiredMods(save);
}

function render() {
  const saves = filteredSaves();
  renderStatus();
  renderFilters();
  renderModControls();
  renderList(saves);
  renderDetail(saves);
}

async function refresh() {
  const [status, saves, settings, mods] = await Promise.all([
    api("/api/status"),
    api("/api/saves"),
    api("/api/settings"),
    api("/api/mods")
  ]);
  state.status = status;
  state.saves = saves.saves;
  state.settings = settings;
  state.modInventory = mods;
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
  const modlistId = elements.createModlistInput.value;
  const result = await api("/api/saves", {
    method: "POST",
    body: JSON.stringify({ name, mapName: mapNameValue, mapType, teardownVersion, requiredMapHint, notes, modlistId })
  });
  state.selectedId = result.id;
  elements.createName.value = "";
  elements.createMapName.value = "";
  elements.createMapType.value = "unknown";
  elements.createTeardownVersion.value = "";
  elements.createRequiredMapHint.value = "";
  elements.createNotes.value = "";
  await refresh();
  showToast(result.requiredModsWarning ? `Current quicksave stored. Mods not captured: ${result.requiredModsWarning}` : "Current quicksave stored.");
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

async function toggleFavorite(save) {
  const result = await api(`/api/saves/${encodeURIComponent(save.id)}/favorite`, {
    method: "POST",
    body: JSON.stringify({ favorite: !save.favorite })
  });
  save.favorite = result.favorite;
  await refresh();
  showToast(result.favorite ? "Scenario added to favorites." : "Scenario removed from favorites.");
}

async function openSelectedFolder() {
  const save = selectedSave();
  if (!save) return;
  const result = await api(`/api/saves/${encodeURIComponent(save.id)}/reveal`, {
    method: "POST"
  });
  showToast(`Opened ${result.opened}`);
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

async function captureSelectedMods() {
  const save = selectedSave();
  if (!save) return;
  const modlistId = currentModlistId();
  const modlist = modlists().find((item) => item.id === modlistId);
  const confirmed = window.confirm([
    `Capture required mods for "${save.name}"?`,
    "",
    `Source modlist: ${modlist ? modlist.name : "latest Teardown modlist"}`,
    "This only stores a snapshot in the manager. It will not edit Teardown's mod files."
  ].join("\n"));
  if (!confirmed) return;

  await api(`/api/saves/${encodeURIComponent(save.id)}/mods`, {
    method: "POST",
    body: JSON.stringify({ modlistId })
  });
  await refresh();
  showToast("Required mods captured.");
}

function requiredModLines(save) {
  const activeIds = activeModSet();
  const knownMods = modsMap();
  return requiredMods(save).map((mod) => {
    const current = knownMods.get(mod.id) || mod;
    const status = modStatus(mod, activeIds, knownMods);
    const link = current.link ? `\n  ${current.link}` : "";
    return `${status.label}: ${current.name || mod.name || mod.id} (${mod.id})${link}`;
  });
}

function compareSelectedMods() {
  const save = selectedSave();
  if (!save) return;
  if (!requiredMods(save).length) {
    showToast("No required mods have been captured for this save.");
    return;
  }

  const summary = summarizeRequiredMods(save);
  const list = requiredModLines(save).join("\n");
  showInfo("Required Mods Compare", [
    `${summary.active}/${summary.total} active`,
    `${summary.inactive} installed but inactive`,
    `${summary.missing} missing`,
    "",
    list
  ].join("\n"), { showPathActions: false });
}

async function copyRequiredModLinks() {
  const save = selectedSave();
  if (!save) return;
  const mods = requiredMods(save);
  if (!mods.length) {
    showToast("No required mods have been captured for this save.");
    return;
  }

  const knownMods = modsMap();
  const lines = mods.map((mod) => {
    const current = knownMods.get(mod.id) || mod;
    if (current.link) return `${current.name || mod.name || mod.id} - ${current.link}`;
    return `${current.name || mod.name || mod.id} - ${mod.id}`;
  });
  await navigator.clipboard.writeText(lines.join("\n"));
  showToast("Required mod links copied.");
}

async function uploadPreviewFromPath(sourcePath) {
  const save = selectedSave();
  if (!save || !sourcePath) return;
  await api(`/api/saves/${encodeURIComponent(save.id)}/preview-path`, {
    method: "POST",
    body: JSON.stringify({ sourcePath })
  });
  await refresh();
  showToast("Preview updated.");
}

async function uploadPreviewFromFile(file) {
  const save = selectedSave();
  if (!save || !file) return;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error || new Error("Preview file could not be read.")));
    reader.readAsDataURL(file);
  });
  await api(`/api/saves/${encodeURIComponent(save.id)}/preview-data`, {
    method: "POST",
    body: JSON.stringify({ name: file.name, dataUrl })
  });
  await refresh();
  showToast("Preview updated.");
}

async function choosePreview() {
  const save = selectedSave();
  if (!save) return;
  const picker = window.teardownPreview;
  if (picker?.pick) {
    const sourcePath = await picker.pick(state.status?.screenshotsDir || "");
    if (sourcePath) await uploadPreviewFromPath(sourcePath);
    return;
  }

  elements.previewFileInput.value = "";
  elements.previewFileInput.click();
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
  updateSettingsFrequencyState();
  elements.settingsDialog.showModal();
}

function updateSettingsFrequencyState() {
  elements.loadBackupEveryInput.disabled = elements.backupBeforeLoadInput.value !== "every_n";
  elements.updateBackupEveryInput.disabled = elements.backupBeforeUpdateInput.value !== "every_n";
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
  setActiveTopTab("refreshButton");
  state.filter = "all";
  state.query = "";
  if (elements.searchInput) elements.searchInput.value = "";
  refresh()
    .then(() => showToast("Library refreshed."))
    .catch((error) => showToast(error.message));
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
  setActiveTopTab("settingsButton");
  openSettingsDialog();
});

$("#confirmSettingsButton").addEventListener("click", (event) => {
  event.preventDefault();
  saveSettings()
    .then(() => elements.settingsDialog.close())
    .catch((error) => showToast(error.message));
});

elements.backupBeforeLoadInput.addEventListener("change", updateSettingsFrequencyState);
elements.backupBeforeUpdateInput.addEventListener("change", updateSettingsFrequencyState);
elements.modlistSelect.addEventListener("change", () => renderDetail());

$("#activateButton").addEventListener("click", () => {
  loadSelected().catch((error) => showToast(error.message));
});

elements.captureModsButton.addEventListener("click", () => {
  captureSelectedMods().catch((error) => showToast(error.message));
});

elements.compareModsButton.addEventListener("click", () => {
  compareSelectedMods();
});

elements.copyModLinksButton.addEventListener("click", () => {
  copyRequiredModLinks().catch((error) => showToast(error.message));
});

elements.uploadPreviewButton.addEventListener("click", () => {
  choosePreview().catch((error) => showToast(error.message));
});

elements.previewFileInput.addEventListener("change", () => {
  const file = elements.previewFileInput.files?.[0];
  uploadPreviewFromFile(file).catch((error) => showToast(error.message));
});

$("#backupButton").addEventListener("click", () => {
  openManagedPath("backups").catch((error) => showToast(error.message));
});

$("#copyPathButton").addEventListener("click", () => {
  openSelectedFolder().catch((error) => showToast(error.message));
});

$("#deleteButton").addEventListener("click", () => {
  deleteSelected().catch((error) => showToast(error.message));
});

$("#revealButton").addEventListener("click", () => {
  setActiveTopTab("revealButton");
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
