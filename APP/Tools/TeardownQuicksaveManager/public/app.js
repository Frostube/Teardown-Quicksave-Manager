const state = {
  status: null,
  saves: [],
  settings: null,
  selectedId: null
};

const elements = {
  activeState: document.querySelector("#activeState"),
  activeModified: document.querySelector("#activeModified"),
  activeSize: document.querySelector("#activeSize"),
  managerPath: document.querySelector("#managerPath"),
  saveList: document.querySelector("#saveList"),
  emptyDetail: document.querySelector("#emptyDetail"),
  detailView: document.querySelector("#detailView"),
  detailContent: document.querySelector("#detailContent"),
  detailName: document.querySelector("#detailName"),
  detailCreated: document.querySelector("#detailCreated"),
  detailModified: document.querySelector("#detailModified"),
  detailMap: document.querySelector("#detailMap"),
  detailMapType: document.querySelector("#detailMapType"),
  detailSize: document.querySelector("#detailSize"),
  detailVersion: document.querySelector("#detailVersion"),
  detailInstruction: document.querySelector("#detailInstruction"),
  nameInput: document.querySelector("#nameInput"),
  mapNameInput: document.querySelector("#mapNameInput"),
  mapTypeInput: document.querySelector("#mapTypeInput"),
  teardownVersionInput: document.querySelector("#teardownVersionInput"),
  requiredMapHintInput: document.querySelector("#requiredMapHintInput"),
  notesInput: document.querySelector("#notesInput"),
  activatedPill: document.querySelector("#activatedPill"),
  createDialog: document.querySelector("#createDialog"),
  createName: document.querySelector("#createName"),
  createMapName: document.querySelector("#createMapName"),
  createMapType: document.querySelector("#createMapType"),
  createTeardownVersion: document.querySelector("#createTeardownVersion"),
  createRequiredMapHint: document.querySelector("#createRequiredMapHint"),
  createNotes: document.querySelector("#createNotes"),
  editDialog: document.querySelector("#editDialog"),
  settingsDialog: document.querySelector("#settingsDialog"),
  backupBeforeLoadInput: document.querySelector("#backupBeforeLoadInput"),
  loadBackupEveryInput: document.querySelector("#loadBackupEveryInput"),
  backupBeforeUpdateInput: document.querySelector("#backupBeforeUpdateInput"),
  updateBackupEveryInput: document.querySelector("#updateBackupEveryInput"),
  infoDialog: document.querySelector("#infoDialog"),
  infoTitle: document.querySelector("#infoTitle"),
  infoText: document.querySelector("#infoText"),
  pathActions: document.querySelector(".path-actions"),
  toast: document.querySelector("#toast")
};

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function mapTypeLabel(value) {
  const labels = {
    official: "Official campaign/sandbox",
    workshop: "Workshop map",
    local_mod: "Local mod",
    dev_map: "My dev map",
    unknown: "Unknown map type"
  };
  return labels[value] || labels.unknown;
}

function mapName(save) {
  return save.mapName || "Map not set";
}

function loadInstruction(save) {
  if (save.requiredMapHint) return save.requiredMapHint;
  if (save.mapName) return `Open ${save.mapName}, then press F9 / Quickload.`;
  return "Open the map this quicksave came from, then press F9 / Quickload.";
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

function renderStatus() {
  const status = state.status;
  elements.managerPath.textContent = status ? status.managerRoot : "";

  if (!status || !status.hasActiveQuicksave) {
    elements.activeState.textContent = "No quicksave.bin found";
    elements.activeModified.textContent = "-";
    elements.activeSize.textContent = "-";
    return;
  }

  elements.activeState.textContent = status.activeSavePath;
  elements.activeModified.textContent = formatDate(status.activeQuicksave.modifiedAt);
  elements.activeSize.textContent = formatBytes(status.activeQuicksave.size);
}

function renderList() {
  elements.saveList.replaceChildren();

  if (!state.saves.length) {
    const empty = document.createElement("div");
    empty.className = "world-empty";
    empty.textContent = "No saved quicksaves yet.";
    elements.saveList.append(empty);
    return;
  }

  state.saves.forEach((save, index) => {
    const row = document.createElement("div");
    const selected = save.id === state.selectedId;
    row.className = `save-row${selected ? " selected" : ""}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected ? "true" : "false");
    row.tabIndex = 0;
    row.dataset.id = save.id;

    const play = document.createElement("button");
    play.className = `save-thumb play-button thumb-${index % 4}`;
    play.type = "button";
    play.title = "Load into Teardown";
    play.setAttribute("aria-label", `Load ${save.name} into Teardown`);
    play.innerHTML = "<span class=\"play-marker\" aria-hidden=\"true\"></span>";
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedId = save.id;
      render();
      loadSelected(save).catch((error) => showToast(error.message));
    });

    const main = document.createElement("span");
    main.className = "save-copy";
    const name = document.createElement("span");
    name.className = "save-name";
    name.textContent = save.name;
    const meta = document.createElement("span");
    meta.className = "save-meta";
    meta.textContent = `${mapName(save)} (${formatDate(save.updatedAt)})`;
    const details = document.createElement("span");
    details.className = "save-details";
    const note = save.notes ? `${save.notes} - ` : "";
    details.textContent = `${mapTypeLabel(save.mapType)} - ${note}Size ${formatBytes(save.size)}`;
    main.append(name, meta, details);

    const size = document.createElement("span");
    size.className = "save-size";
    size.textContent = formatBytes(save.size);

    row.append(play, main, size);
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
  document.querySelector("#activateButton").disabled = !save;
  document.querySelector("#updateButton").disabled = !save;
  document.querySelector("#deleteButton").disabled = !save;
  document.querySelector("#showMapButton").disabled = !save;
  document.querySelector("#updateSlotButton").disabled = !save;
  document.querySelector("#copyPathButton").disabled = !save;

  if (!save) return;

  elements.detailName.textContent = save.name;
  elements.detailCreated.textContent = formatDate(save.createdAt);
  elements.detailModified.textContent = formatDate(save.updatedAt);
  elements.detailMap.textContent = mapName(save);
  elements.detailMapType.textContent = mapTypeLabel(save.mapType);
  elements.detailSize.textContent = formatBytes(save.size);
  elements.detailVersion.textContent = save.teardownVersion || "-";
  elements.detailInstruction.textContent = loadInstruction(save);
  elements.activatedPill.classList.toggle("hidden", !save.activatedAt);
}

function render() {
  renderStatus();
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
  const mapName = elements.createMapName.value.trim();
  const mapType = elements.createMapType.value;
  const teardownVersion = elements.createTeardownVersion.value.trim();
  const requiredMapHint = elements.createRequiredMapHint.value.trim();
  const notes = elements.createNotes.value.trim();
  const result = await api("/api/saves", {
    method: "POST",
    body: JSON.stringify({ name, mapName, mapType, teardownVersion, requiredMapHint, notes })
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

async function backupCurrentQuicksave() {
  const confirmed = window.confirm("Back up the current active Teardown quicksave.bin now?");
  if (!confirmed) return;

  const result = await api("/api/backup-active", {
    method: "POST",
    body: JSON.stringify({ label: "manual" })
  });
  await refresh();
  showInfo("Current Quicksave Backed Up", [
    "The active Teardown quicksave.bin was copied to:",
    result.backupPath,
    "",
    `Size: ${formatBytes(result.size)}`,
    `Active save modified: ${formatDate(result.modifiedAt)}`
  ].join("\n"), { showPathActions: false });
}

async function updateSelectedSaveFile(save = selectedSave()) {
  if (!save) return;
  const confirmed = window.confirm([
    `Update "${save.name}" from the current active Teardown quicksave.bin?`,
    "",
    "Use this after playing the same map, making tweaks, and quicksaving in Teardown.",
    "",
    "This replaces the selected stored slot file. The slot name, required map, and notes will stay the same.",
    state.settings ? automaticBackupText(state.settings.backupBeforeUpdate, state.settings.updateBackupEvery, "update") : "",
    "",
    `Required map for this slot: ${mapName(save)}`
  ].join("\n"));
  if (!confirmed) return;

  const result = await api(`/api/saves/${encodeURIComponent(save.id)}/update-file`, {
    method: "POST"
  });
  await refresh();
  showInfo("Slot Updated", [
    `"${save.name}" now uses the current active Teardown quicksave.bin.`,
    "",
    backupResultText(
      result,
      `Automatic stored-slot backup was skipped by your settings. Operations since last automatic backup: ${result.operationsSinceBackup}.`
    ),
    "",
    `New size: ${formatBytes(result.size)}`,
    `Active quicksave modified: ${formatDate(result.modifiedAt)}`
  ].join("\n"), { showPathActions: false });
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

async function launchTeardown() {
  await api("/api/launch-teardown", { method: "POST" });
  showToast("Opening Teardown through Steam.");
}

function showRequiredMap(save = selectedSave()) {
  if (!save) return;
  showInfo("Required Map", [
    `Save:\n${save.name}`,
    "",
    `Open:\n${mapName(save)}`,
    "",
    `Map type:\n${mapTypeLabel(save.mapType)}`,
    "",
    loadInstruction(save)
  ].join("\n"), { showPathActions: false });
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

document.querySelector("#refreshButton").addEventListener("click", () => {
  refresh().catch((error) => showToast(error.message));
});

document.querySelector("#newSaveButton").addEventListener("click", () => {
  elements.createDialog.showModal();
  elements.createName.focus();
});

document.querySelector("#confirmCreateButton").addEventListener("click", (event) => {
  event.preventDefault();
  createSave()
    .then(() => elements.createDialog.close())
    .catch((error) => showToast(error.message));
});

document.querySelector("#updateButton").addEventListener("click", () => {
  openEditDialog();
});

document.querySelector("#confirmUpdateButton").addEventListener("click", (event) => {
  event.preventDefault();
  updateSelected()
    .then(() => elements.editDialog.close())
    .catch((error) => showToast(error.message));
});

document.querySelector("#settingsButton").addEventListener("click", () => {
  openSettingsDialog();
});

document.querySelector("#confirmSettingsButton").addEventListener("click", (event) => {
  event.preventDefault();
  saveSettings()
    .then(() => elements.settingsDialog.close())
    .catch((error) => showToast(error.message));
});

document.querySelector("#activateButton").addEventListener("click", () => {
  loadSelected().catch((error) => showToast(error.message));
});

document.querySelector("#backupButton").addEventListener("click", () => {
  backupCurrentQuicksave().catch((error) => showToast(error.message));
});

document.querySelector("#openTeardownButton").addEventListener("click", () => {
  launchTeardown().catch((error) => showToast(error.message));
});

document.querySelector("#showMapButton").addEventListener("click", () => {
  showRequiredMap();
});

document.querySelector("#updateSlotButton").addEventListener("click", () => {
  updateSelectedSaveFile().catch((error) => showToast(error.message));
});

document.querySelector("#copyPathButton").addEventListener("click", () => {
  const save = selectedSave();
  copyText(save ? save.quicksavePath : "", "Selected quicksave path copied.").catch((error) => showToast(error.message));
});

document.querySelector("#deleteButton").addEventListener("click", () => {
  deleteSelected().catch((error) => showToast(error.message));
});

document.querySelector("#revealButton").addEventListener("click", () => {
  if (!state.status) return;
  showInfo("Paths", [
    `Active quicksave:\n${state.status.activeSavePath}`,
    `Managed saves:\n${state.status.savesDir}`,
    `Backups:\n${state.status.backupsDir}`,
    `Deleted saves:\n${state.status.deletedDir || ""}`
  ].join("\n\n"), { showPathActions: true });
});

document.querySelector("#pathsButton").addEventListener("click", () => {
  document.querySelector("#revealButton").click();
});

document.querySelector("#helpButton").addEventListener("click", () => {
  showInfo("Help", [
    "1. Quicksave in Teardown.",
    "2. Click Save Current and give it a name.",
    "3. Create as many named slots as you want.",
    "4. Set the required map for each slot. The quicksave only makes sense inside that map.",
    "5. Click Load into Teardown.",
    "6. The manager backs up the current quicksave, copies the selected slot, and opens Teardown.",
    "7. Open the required map, then press F9 / Quickload.",
    "",
    "Backup Current makes an extra manual backup without changing the active slot.",
    "Settings controls how often automatic backups happen for Load and Update Slot. Manual Backup Current always creates one.",
    "Update Slot replaces the selected stored quicksave with the current active quicksave while preserving its metadata.",
    "Open Teardown only launches Steam. Show Required Map and Copy Save Path expose the selected slot context.",
    "",
    "Mode 1 is intentionally safe and universal: it manages files, but Teardown still loads the map."
  ].join("\n"), { showPathActions: false });
});

document.querySelector("#openActiveButton").addEventListener("click", () => {
  openManagedPath("active").catch((error) => showToast(error.message));
});

document.querySelector("#openSavesButton").addEventListener("click", () => {
  openManagedPath("saves").catch((error) => showToast(error.message));
});

document.querySelector("#openBackupsButton").addEventListener("click", () => {
  openManagedPath("backups").catch((error) => showToast(error.message));
});

document.querySelector("#openDeletedButton").addEventListener("click", () => {
  openManagedPath("deleted").catch((error) => showToast(error.message));
});

refresh().catch((error) => {
  showToast(error.message);
});
