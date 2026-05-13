const state = {
  status: null,
  saves: [],
  settings: null,
  modInventory: null,
  selectedId: null,
  query: "",
  filter: "all",
  view: "library",
  backups: [],
  backupsLoaded: false,
  setupVisible: false,
  modProfiles: [],
  modProfileDetails: new Map(),
  selectedModProfileId: null,
  modProfilesLoaded: false,
  modProfileQuery: "",
  modProfileDialogMode: "create",
  modProfileDialogId: null
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
  quickloadInstruction: $("#quickloadInstruction"),
  detailModsSummary: $("#detailModsSummary"),
  modsSource: $("#modsSource"),
  modlistSelect: $("#modlistSelect"),
  requiredModsList: $("#requiredModsList"),
  modsExpand: $("#modsExpand"),
  modsToggleButton: $("#modsToggleButton"),
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
  autoloadOnLaunchInput: $("#autoloadOnLaunchInput"),
  infoDialog: $("#infoDialog"),
  infoTitle: $("#infoTitle"),
  infoText: $("#infoText"),
  pathActions: $(".path-actions"),
  toast: $("#toast"),
  importPackageButton: $("#importPackageButton"),
  exportButton: $("#exportButton"),
  backupsView: $("#backupsView"),
  backupsList: $("#backupsList"),
  backupsEmpty: $("#backupsEmpty"),
  backupNowButton: $("#backupNowButton"),
  openBackupsFolderButton: $("#openBackupsFolderButton"),
  quicksavePathInput: $("#quicksavePathInput"),
  quicksavePathBrowseButton: $("#quicksavePathBrowseButton"),
  quicksavePathResetButton: $("#quicksavePathResetButton"),
  quicksavePathHint: $("#quicksavePathHint"),
  setupDialog: $("#setupDialog"),
  setupCandidateList: $("#setupCandidateList"),
  setupQuicksavePathInput: $("#setupQuicksavePathInput"),
  setupBrowseButton: $("#setupBrowseButton"),
  setupRecheckButton: $("#setupRecheckButton"),
  confirmSetupButton: $("#confirmSetupButton"),
  modProfileSearch: $("#modProfileSearch"),
  newModProfileButton: $("#newModProfileButton"),
  modProfileList: $("#modProfileList"),
  modProfileCount: $("#modProfileCount"),
  modsActiveModlist: $("#modsActiveModlist"),
  modProfileEmpty: $("#modProfileEmpty"),
  modProfileDetail: $("#modProfileDetail"),
  modProfileName: $("#modProfileName"),
  modProfileLinkedPill: $("#modProfileLinkedPill"),
  modProfileSummary: $("#modProfileSummary"),
  modProfileModCount: $("#modProfileModCount"),
  modProfileCreated: $("#modProfileCreated"),
  modProfileSource: $("#modProfileSource"),
  modProfileUpdated: $("#modProfileUpdated"),
  modProfileCompareSelect: $("#modProfileCompareSelect"),
  modProfileModsList: $("#modProfileModsList"),
  modProfileNotes: $("#modProfileNotes"),
  modProfileApplyButton: $("#modProfileApplyButton"),
  modProfileRecaptureButton: $("#modProfileRecaptureButton"),
  modProfileCopyLinksButton: $("#modProfileCopyLinksButton"),
  modProfileEditButton: $("#modProfileEditButton"),
  modProfileDeleteButton: $("#modProfileDeleteButton"),
  modProfileDialog: $("#modProfileDialog"),
  modProfileDialogTitle: $("#modProfileDialogTitle"),
  modProfileNameInput: $("#modProfileNameInput"),
  modProfileSourceField: $("#modProfileSourceField"),
  modProfileSourceInput: $("#modProfileSourceInput"),
  modProfileSourceHint: $("#modProfileSourceHint"),
  modProfileNotesInput: $("#modProfileNotesInput"),
  confirmModProfileButton: $("#confirmModProfileButton"),
  linkProfileButton: $("#linkProfileButton"),
  linkProfileDialog: $("#linkProfileDialog"),
  linkProfileSelect: $("#linkProfileSelect"),
  confirmLinkProfileButton: $("#confirmLinkProfileButton"),
  newProfileFromLinkButton: $("#newProfileFromLinkButton")
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

function loadInstructionShort(save) {
  if (save.requiredMapHint) return save.requiredMapHint;
  if (save.mapName) return `Open ${save.mapName}`;
  return "Open the required map";
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
  lists.forEach((list) => {
    const option = document.createElement("option");
    option.value = list.id;
    const count = list.mods.length;
    option.textContent = `${list.name} (${count} active mod${count === 1 ? "" : "s"})`;
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
  elements.infoTitle.classList.toggle("success", options.tone === "success");
  elements.infoText.textContent = text;
  elements.pathActions.classList.toggle("hidden", !options.showPathActions);
  elements.infoDialog.showModal();
}

function showLoadInstructions(save, result) {
  const backupLine = result.backupPath
    ? `A backup of your previous quicksave was saved to:\n${result.backupPath}`
    : result.backupSkipped
      ? "Automatic backup was skipped by your settings."
      : "";
  const autoload = result.autoload || {};
  const autoloadActive = autoload.enabled && autoload.applied;
  const autoloadFailed = autoload.enabled && !autoload.applied;
  const nextLine = autoloadActive
    ? `${loadInstruction(save)}. The scenario will auto-load once the map is ready.`
    : `${loadInstruction(save)}, then press F9 / Quickload.`;
  const hints = [];
  if (autoloadActive) {
    hints.push("Enable the \"Quicksave Manager Auto-Load\" mod in Teardown if the quickload doesn't trigger.");
  } else if (autoloadFailed) {
    hints.push(`Auto-load could not be armed (${autoload.reason || "unknown reason"}). Press F9 / Quickload manually.`);
  }
  showInfo("Scenario loaded", [
    "Next:",
    nextLine,
    hints.length ? `\n${hints.join("\n")}` : "",
    backupLine ? `\n${backupLine}` : ""
  ].filter(Boolean).join("\n"), { showPathActions: false, tone: "success" });
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

function setActiveTopTab(buttonId, viewOverride) {
  elements.topTabs.forEach((button) => {
    button.classList.toggle("active", button.id === buttonId);
  });
  if (viewOverride) state.view = viewOverride;
}

function switchTab(viewName) {
  const tab = elements.topTabs.find((button) => button.dataset.tabView === viewName);
  if (tab) setActiveTopTab(tab.id, viewName);
  else state.view = viewName;
  render();
  if (viewName === "backups") {
    refreshBackups().then(render).catch((error) => showToast(error.message));
  }
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

function shortenStoragePath(fullPath) {
  if (!fullPath) return "";
  const segments = fullPath.split(/[\\/]/).filter(Boolean);
  if (segments.length <= 2) return fullPath;
  return segments.slice(-2).join("\\");
}

function renderStatus() {
  if (elements.managerPath) {
    const fullPath = state.status?.managerRoot || "";
    elements.managerPath.textContent = shortenStoragePath(fullPath);
    elements.managerPath.title = fullPath;
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

function renderModsSource(profileText, dateText) {
  const profileEl = elements.modsSource.querySelector(".mods-source-profile");
  const dateEl = elements.modsSource.querySelector(".mods-source-date");
  if (profileEl) profileEl.textContent = profileText;
  if (dateEl) {
    if (dateText) {
      dateEl.textContent = dateText;
      dateEl.classList.remove("hidden");
    } else {
      dateEl.textContent = "";
      dateEl.classList.add("hidden");
    }
  }
}

function renderRequiredMods(save) {
  const selectedModlistId = currentModlistId();
  populateModlistSelect(elements.modlistSelect, selectedModlistId);
  elements.requiredModsList.replaceChildren();

  const linkedProfileId = save.modProfileId;
  const linkedProfile = linkedProfileId ? state.modProfileDetails.get(linkedProfileId) : null;

  if (linkedProfile) {
    const summary = summarizeProfileMods(linkedProfile, elements.modlistSelect.value);
    elements.detailModsSummary.textContent = `${summary.active}/${summary.total} currently active`;
    renderModsSource(`Linked profile: ${linkedProfile.name}`, `Updated: ${formatDate(linkedProfile.updatedAt)}`);
    elements.modsToggleButton.disabled = !linkedProfile.mods.length;

    if (!linkedProfile.mods.length) {
      const empty = document.createElement("div");
      empty.className = "mod-row";
      empty.textContent = "Linked profile has no mods. Open the Mods tab to capture from a Teardown modlist.";
      elements.requiredModsList.append(empty);
      return;
    }

    const activeIds = activeModSet(elements.modlistSelect.value);
    const knownMods = modsMap();
    linkedProfile.mods.forEach((mod) => {
      const current = knownMods.get(mod.id) || mod;
      const status = modStatusForProfileMod(mod, activeIds, knownMods);
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
    return;
  }

  if (linkedProfileId && !linkedProfile) {
    elements.detailModsSummary.textContent = "Loading linked profile...";
    renderModsSource(`Linked profile: ${linkedProfileId}`, "");
    elements.modsToggleButton.disabled = true;
    return;
  }

  const captured = save.requiredMods;
  const mods = requiredMods(save);

  if (!captured || !mods.length) {
    elements.detailModsSummary.textContent = "No mod snapshot captured.";
    renderModsSource("Mod profile: not captured yet", "");
    elements.modsToggleButton.disabled = true;
    const empty = document.createElement("div");
    empty.className = "mod-row";
    empty.textContent = "Capture a Teardown modlist or link a saved profile.";
    elements.requiredModsList.append(empty);
    return;
  }

  const summary = summarizeRequiredMods(save, elements.modlistSelect.value);
  const sourceName = captured.source?.name || "Unknown modlist";
  const capturedAt = captured.capturedAt ? formatDate(captured.capturedAt) : "unknown time";
  elements.detailModsSummary.textContent = `${summary.active}/${summary.total} currently active`;
  renderModsSource(`Mod snapshot: ${sourceName}`, `Captured: ${capturedAt}`);
  elements.modsToggleButton.disabled = false;

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

  if (state.saves.length === 1 && saves.length === 1) {
    const hint = document.createElement("div");
    hint.className = "scenario-hint";
    const title = document.createElement("span");
    title.className = "scenario-hint-title";
    title.textContent = "No more scenarios yet.";
    const body = document.createElement("span");
    body.style.whiteSpace = "pre-line";
    body.textContent = "Create another scenario in Teardown,\nthen capture it here using the + button.";
    hint.append(title, body);
    elements.saveList.append(hint);
  }
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
  if (elements.exportButton) elements.exportButton.disabled = !save;
  elements.captureModsButton.disabled = !save;
  elements.compareModsButton.disabled = !save;
  elements.copyModLinksButton.disabled = !save;
  elements.modsToggleButton.disabled = !save;
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
  const install = state.status?.teardownInstall || {};
  if (save.teardownVersion) {
    elements.detailVersion.textContent = save.teardownVersion;
    elements.detailVersion.title = "";
  } else if (install.version) {
    elements.detailVersion.textContent = `${install.version} (installed)`;
    elements.detailVersion.title = `Detected from ${install.exePath || "Teardown.exe"}`;
  } else {
    elements.detailVersion.textContent = "Not detected";
    elements.detailVersion.title = install.diagnostic || "Teardown.exe was not found in any Steam library.";
  }
  const detailIcon = compatibility.symbol === "check"
    ? `<span class="icon icon-circle-check status-icon ${compatibility.tone}" aria-hidden="true"></span>`
    : `<span class="status-dot ${compatibility.tone}" aria-hidden="true"></span>`;
  elements.detailCompatibility.innerHTML = `${detailIcon}${compatibility.label}`;
  const compatStatus = $("#compatCardStatus");
  if (compatStatus) {
    compatStatus.textContent = compatibility.label;
    compatStatus.className = `card-status ${compatibility.tone}`;
  }
  elements.detailNotes.textContent = save.notes || "No notes.";
  elements.detailInstruction.textContent = loadInstructionShort(save);
  if (elements.quickloadInstruction) {
    const autoload = !state.settings || state.settings.autoloadOnLaunch !== false;
    elements.quickloadInstruction.textContent = autoload
      ? "Scenario auto-loads once the map is ready"
      : "Press F9 / Quickload";
  }
  elements.activatedPill.classList.toggle("hidden", !save.activatedAt);
  renderRequiredMods(save);
  const modProfileStatus = $("#modProfileStatus");
  if (modProfileStatus) {
    const linkedProfile = save.modProfileId ? state.modProfileDetails.get(save.modProfileId) : null;
    if (linkedProfile) {
      const summary = summarizeProfileMods(linkedProfile, elements.modlistSelect?.value);
      modProfileStatus.textContent = summary.total ? `${summary.active}/${summary.total} (linked)` : "Linked (empty)";
      modProfileStatus.className = `card-status ${summary.missing ? "broken" : summary.inactive ? "untested" : "verified"}`;
    } else if (save.modProfileId) {
      modProfileStatus.textContent = "Linked";
      modProfileStatus.className = "card-status untested";
    } else {
      const mods = requiredMods(save);
      if (!mods.length) {
        modProfileStatus.textContent = "Not captured";
        modProfileStatus.className = "card-status untested";
      } else {
        const summary = summarizeRequiredMods(save, elements.modlistSelect?.value);
        modProfileStatus.textContent = `${summary.active}/${summary.total} active`;
        modProfileStatus.className = `card-status ${summary.missing ? "broken" : summary.inactive ? "untested" : "verified"}`;
      }
    }
  }
}

function setModsExpanded(expanded) {
  elements.modsExpand.classList.toggle("hidden", !expanded);
  elements.modsToggleButton.textContent = expanded ? "Hide Mods" : "Show Mods";
  elements.modsToggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
}

const viewElements = Array.from(document.querySelectorAll(".view[data-view]"));

function renderView() {
  viewElements.forEach((view) => {
    view.hidden = view.dataset.view !== state.view;
  });
}

function renderBackupsView() {
  if (state.view !== "backups") return;
  elements.backupsList.replaceChildren();
  const backups = state.backups || [];
  elements.backupsEmpty.classList.toggle("hidden", backups.length > 0);
  if (!backups.length) return;

  backups.forEach((backup) => {
    const row = document.createElement("article");
    row.className = "backup-row";

    const main = document.createElement("div");
    main.className = "backup-main";

    const title = document.createElement("div");
    title.className = "backup-title";
    title.textContent = backupHeadline(backup);

    const meta = document.createElement("div");
    meta.className = "backup-meta";
    meta.textContent = [
      formatDate(backup.createdAt),
      formatBytes(backup.size),
      backupKindLabel(backup),
      backup.legacy ? "Legacy" : ""
    ].filter(Boolean).join(" • ");

    const detail = document.createElement("div");
    detail.className = "backup-detail";
    detail.textContent = backup.scenarioName
      ? `Linked scenario: ${backup.scenarioName}`
      : (backup.sourcePath || backup.id);

    main.append(title, meta, detail);

    const actions = document.createElement("div");
    actions.className = "backup-actions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "ghost-button compact";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => restoreBackupAction(backup).catch((error) => showToast(error.message)));
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "danger-button compact";
    drop.textContent = "Delete";
    drop.addEventListener("click", () => deleteBackupAction(backup).catch((error) => showToast(error.message)));
    actions.append(restore, drop);

    row.append(main, actions);
    elements.backupsList.append(row);
  });
}

function backupHeadline(backup) {
  if (backup.scenarioName) return backup.scenarioName;
  const reason = backup.reason || "manual";
  const label = reason
    .replace(/[-_]+/g, " ")
    .replace(/\bbefore load\b/i, "Before load")
    .replace(/\bbefore update\b/i, "Before update")
    .replace(/\bbefore restore\b/i, "Before restore")
    .replace(/\bmanual\b/i, "Manual");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function backupKindLabel(backup) {
  if (backup.sourceKind === "stored") return "From scenario";
  if (backup.sourceKind === "active") return "From active quicksave";
  return "";
}

function render() {
  const saves = filteredSaves();
  renderView();
  renderStatus();
  renderFilters();
  renderModControls();
  renderList(saves);
  renderDetail(saves);
  renderBackupsView();
  renderModProfileList();
  renderModProfileDetail();
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
  await refreshModProfiles();
  const linkedId = state.saves.find((save) => save.id === state.selectedId)?.modProfileId;
  if (linkedId && !state.modProfileDetails.has(linkedId)) {
    try { await fetchModProfileDetail(linkedId); } catch {}
  }
  if (state.view === "backups") {
    await refreshBackups();
  }
  render();

  if (status?.setupRequired && !state.setupVisible) {
    openSetupDialog();
  }
}

async function refreshBackups() {
  const result = await api("/api/backups");
  state.backups = result.backups || [];
  state.backupsLoaded = true;
}

async function restoreBackupAction(backup) {
  const headline = backupHeadline(backup);
  const confirmed = window.confirm([
    `Restore "${headline}" into Teardown's quicksave slot?`,
    "",
    "Your current quicksave.bin will be saved as a safety backup first.",
    "",
    `Backup created: ${formatDate(backup.createdAt)}`,
    `Size: ${formatBytes(backup.size)}`
  ].join("\n"));
  if (!confirmed) return;

  const result = await api(`/api/backups/${encodeURIComponent(backup.id)}/restore`, {
    method: "POST",
    body: JSON.stringify({})
  });
  await refreshBackups();
  render();
  showToast(result.safetyBackupId ? "Backup restored. Safety backup created." : "Backup restored.");
}

async function deleteBackupAction(backup) {
  const headline = backupHeadline(backup);
  const confirmed = window.confirm(`Delete backup "${headline}"?\n\nThis cannot be undone.`);
  if (!confirmed) return;
  await api(`/api/backups/${encodeURIComponent(backup.id)}`, { method: "DELETE" });
  await refreshBackups();
  render();
  showToast("Backup deleted.");
}

async function backupActiveNow() {
  const result = await api("/api/backup-active", {
    method: "POST",
    body: JSON.stringify({ label: "manual" })
  });
  await refreshBackups();
  render();
  showToast(`Backup created (${formatBytes(result.size)}).`);
}

async function importPackage() {
  const picker = window.teardownPackage;
  let sourcePath = "";
  if (picker?.pickOpen) {
    sourcePath = await picker.pickOpen(state.status?.packagesDir || "");
    if (!sourcePath) return;
  } else {
    sourcePath = window.prompt("Enter the full path to a .tdqscenario package:");
    if (!sourcePath) return;
  }

  const result = await api("/api/saves/import", {
    method: "POST",
    body: JSON.stringify({ sourcePath })
  });
  state.selectedId = result.id;
  state.view = "library";
  setActiveTopTab("refreshButton");
  await refresh();
  showToast(`Imported "${result.name}".`);
}

async function exportSelected() {
  const save = selectedSave();
  if (!save) return;
  const picker = window.teardownPackage;
  let destinationPath = "";
  if (picker?.pickSave) {
    const suggested = `${save.name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_") || save.id}.tdqscenario`;
    destinationPath = await picker.pickSave({ defaultPath: suggested });
    if (!destinationPath) return;
  }
  const result = await api(`/api/saves/${encodeURIComponent(save.id)}/export`, {
    method: "POST",
    body: JSON.stringify(destinationPath ? { destinationPath } : {})
  });
  showInfo("Scenario exported", [
    `${save.name} was packaged successfully.`,
    "",
    `Package: ${result.packagePath}`,
    `Size: ${formatBytes(result.size)}`,
    result.quicksaveHash ? `Hash: ${result.quicksaveHash}` : ""
  ].filter(Boolean).join("\n"), { showPathActions: false, tone: "success" });
}

function renderSetupCandidates(candidates) {
  elements.setupCandidateList.replaceChildren();
  (candidates || []).forEach((candidate) => {
    const row = document.createElement("div");
    row.className = `candidate-row ${candidate.exists ? "exists" : "missing"}`;

    const label = document.createElement("div");
    label.className = "candidate-source";
    label.textContent = candidate.source;

    const value = document.createElement("div");
    value.className = "candidate-path";
    value.textContent = candidate.path;
    value.title = candidate.path;

    const status = document.createElement("span");
    status.className = `candidate-status ${candidate.exists ? "exists" : "missing"}`;
    status.textContent = candidate.exists ? "Found" : "Missing";

    const use = document.createElement("button");
    use.type = "button";
    use.className = "ghost-button compact";
    use.textContent = "Use";
    use.disabled = !candidate.exists;
    use.addEventListener("click", () => {
      elements.setupQuicksavePathInput.value = candidate.path;
    });

    row.append(label, value, status, use);
    elements.setupCandidateList.append(row);
  });
}

function openSetupDialog() {
  state.setupVisible = true;
  renderSetupCandidates(state.status?.quicksavePathCandidates || []);
  elements.setupQuicksavePathInput.value = state.settings?.quicksavePathOverride || "";
  elements.setupDialog.showModal();
}

async function chooseQuicksavePathInto(input) {
  const picker = window.teardownQuicksave;
  if (!picker?.pick) {
    showToast("File picker is only available in the desktop app.");
    return;
  }
  const sourcePath = await picker.pick(input.value || state.status?.activeSavePath || "");
  if (sourcePath) input.value = sourcePath;
}

async function saveSetupPath() {
  const value = elements.setupQuicksavePathInput.value.trim();
  await api("/api/settings", {
    method: "PATCH",
    body: JSON.stringify({ quicksavePathOverride: value })
  });
  state.setupVisible = false;
  elements.setupDialog.close();
  await refresh();
  showToast(value ? "Quicksave path set." : "Quicksave path cleared.");
}

async function recheckQuicksavePath() {
  const status = await api("/api/status");
  state.status = status;
  renderSetupCandidates(status.quicksavePathCandidates || []);
  showToast(status.activeSavePathExists ? "Quicksave found." : "Still not found.");
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
  const autoload = !state.settings || state.settings.autoloadOnLaunch !== false;
  const followUp = autoload
    ? "After the map opens, the scenario will auto-load (requires the Quicksave Manager Auto-Load mod enabled)."
    : "After the map opens, press F9 / Quickload.";
  const confirmed = window.confirm([
    `Load "${save.name}" into Teardown?`,
    "",
    "This will copy this slot into Teardown's active quicksave.bin and open Teardown through Steam.",
    state.settings ? automaticBackupText(state.settings.backupBeforeLoad, state.settings.loadBackupEvery, "load") : "",
    "",
    `Required map: ${mapName(save)}`,
    followUp
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
      updateBackupEvery: elements.updateBackupEveryInput.value,
      quicksavePathOverride: elements.quicksavePathInput.value.trim(),
      autoloadOnLaunch: elements.autoloadOnLaunchInput.checked
    })
  });
  state.settings = settings;
  await refresh();
  showToast("Settings saved.");
}

function renderQuicksavePathHint() {
  const status = state.status;
  const override = elements.quicksavePathInput.value.trim();
  if (!status) {
    elements.quicksavePathHint.textContent = "";
    return;
  }
  if (override) {
    elements.quicksavePathHint.textContent = `Override: ${override}`;
    elements.quicksavePathHint.title = override;
    return;
  }
  const source = status.activeSavePathSource || "auto";
  elements.quicksavePathHint.textContent = status.activeSavePathExists
    ? `Auto-detected (${source}): ${status.activeSavePath}`
    : `Not found yet. Will use: ${status.activeSavePath}`;
  elements.quicksavePathHint.title = status.activeSavePath;
}

function openSettingsDialog() {
  const settings = state.settings || {
    backupBeforeLoad: "every_n",
    loadBackupEvery: 5,
    backupBeforeUpdate: "every_n",
    updateBackupEvery: 5,
    quicksavePathOverride: "",
    autoloadOnLaunch: true
  };
  elements.backupBeforeLoadInput.value = settings.backupBeforeLoad;
  elements.loadBackupEveryInput.value = settings.loadBackupEvery;
  elements.backupBeforeUpdateInput.value = settings.backupBeforeUpdate;
  elements.updateBackupEveryInput.value = settings.updateBackupEvery;
  elements.quicksavePathInput.value = settings.quicksavePathOverride || "";
  elements.autoloadOnLaunchInput.checked = settings.autoloadOnLaunch !== false;
  renderQuicksavePathHint();
  updateSettingsFrequencyState();
  fillAboutSection();
  setActiveSettingsSection("general");
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
  setActiveTopTab("refreshButton", "library");
  state.filter = "all";
  state.query = "";
  if (elements.searchInput) elements.searchInput.value = "";
  refresh()
    .then(() => showToast("Library refreshed."))
    .catch((error) => showToast(error.message));
});

$("#modsTabButton").addEventListener("click", () => {
  switchTab("mods");
  refreshModProfiles().then(render).catch((error) => showToast(error.message));
});

elements.modProfileSearch.addEventListener("input", (event) => {
  state.modProfileQuery = event.target.value;
  renderModProfileList();
});

elements.newModProfileButton.addEventListener("click", () => {
  openModProfileDialog("create");
});

elements.confirmModProfileButton.addEventListener("click", (event) => {
  event.preventDefault();
  confirmModProfileDialog()
    .then((ok) => { if (ok) elements.modProfileDialog.close(); })
    .catch((error) => showToast(error.message));
});

elements.modProfileCompareSelect.addEventListener("change", () => renderModProfileDetail());

elements.modProfileRecaptureButton.addEventListener("click", () => {
  recaptureSelectedProfile().catch((error) => showToast(error.message));
});

elements.modProfileCopyLinksButton.addEventListener("click", () => {
  copyProfileLinks().catch((error) => showToast(error.message));
});

elements.modProfileEditButton.addEventListener("click", () => {
  if (state.selectedModProfileId) openModProfileDialog("edit", state.selectedModProfileId);
});

elements.modProfileDeleteButton.addEventListener("click", () => {
  deleteSelectedProfile().catch((error) => showToast(error.message));
});

elements.linkProfileButton.addEventListener("click", () => {
  openLinkProfileDialog();
});

elements.confirmLinkProfileButton.addEventListener("click", (event) => {
  event.preventDefault();
  confirmLinkProfile()
    .then(() => elements.linkProfileDialog.close())
    .catch((error) => showToast(error.message));
});

elements.newProfileFromLinkButton.addEventListener("click", () => {
  elements.linkProfileDialog.close();
  switchTab("mods");
  openModProfileDialog("create");
});

$("#communityTabButton").addEventListener("click", () => {
  switchTab("community");
});

$("#versionsTabButton").addEventListener("click", () => {
  switchTab("versions");
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

elements.modsToggleButton.addEventListener("click", () => {
  const expanded = elements.modsToggleButton.getAttribute("aria-expanded") === "true";
  setModsExpanded(!expanded);
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
  switchTab("backups");
});

elements.importPackageButton.addEventListener("click", () => {
  importPackage().catch((error) => showToast(error.message));
});

elements.exportButton.addEventListener("click", () => {
  exportSelected().catch((error) => showToast(error.message));
});

elements.backupNowButton.addEventListener("click", () => {
  backupActiveNow().catch((error) => showToast(error.message));
});

elements.openBackupsFolderButton.addEventListener("click", () => {
  openManagedPath("backups").catch((error) => showToast(error.message));
});

elements.quicksavePathInput.addEventListener("input", renderQuicksavePathHint);

elements.quicksavePathBrowseButton.addEventListener("click", () => {
  chooseQuicksavePathInto(elements.quicksavePathInput).catch((error) => showToast(error.message));
});

elements.quicksavePathResetButton.addEventListener("click", () => {
  elements.quicksavePathInput.value = "";
  renderQuicksavePathHint();
});

elements.setupBrowseButton.addEventListener("click", () => {
  chooseQuicksavePathInto(elements.setupQuicksavePathInput).catch((error) => showToast(error.message));
});

elements.confirmSetupButton.addEventListener("click", (event) => {
  event.preventDefault();
  saveSetupPath().catch((error) => showToast(error.message));
});

elements.setupRecheckButton.addEventListener("click", () => {
  recheckQuicksavePath().catch((error) => showToast(error.message));
});

elements.setupDialog.addEventListener("close", () => {
  state.setupVisible = false;
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

async function refreshModProfiles() {
  const result = await api("/api/mod-profiles");
  state.modProfiles = result.profiles || [];
  state.modProfilesLoaded = true;
  if (state.selectedModProfileId && !state.modProfiles.some((profile) => profile.id === state.selectedModProfileId)) {
    state.selectedModProfileId = null;
    state.modProfileDetails.delete(state.selectedModProfileId);
  }
  if (!state.selectedModProfileId && state.modProfiles.length) {
    state.selectedModProfileId = state.modProfiles[0].id;
  }
  if (state.selectedModProfileId) {
    await fetchModProfileDetail(state.selectedModProfileId);
  }
}

async function fetchModProfileDetail(id, force = false) {
  if (!id) return null;
  if (!force && state.modProfileDetails.has(id)) return state.modProfileDetails.get(id);
  const profile = await api(`/api/mod-profiles/${encodeURIComponent(id)}`);
  state.modProfileDetails.set(id, profile);
  return profile;
}

function filteredModProfiles() {
  const query = state.modProfileQuery.trim().toLowerCase();
  if (!query) return state.modProfiles;
  return state.modProfiles.filter((profile) => {
    return [profile.name, profile.notes, profile.sourceModlistName]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function profileLinkedScenarios(profileId) {
  return state.saves.filter((save) => save.modProfileId === profileId);
}

function modStatusForProfileMod(mod, activeIds, knownMods) {
  const installed = mod.installed !== false || (knownMods.get(mod.id)?.installed === true);
  if (!installed) return { label: "Missing", tone: "missing" };
  if (!activeIds.has(mod.id)) return { label: "Inactive", tone: "inactive" };
  return { label: "Active", tone: "active" };
}

function summarizeProfileMods(profile, modlistId = currentModlistId()) {
  const mods = profile?.mods || [];
  const activeIds = activeModSet(modlistId);
  const knownMods = modsMap();
  const summary = { total: mods.length, active: 0, inactive: 0, missing: 0 };
  mods.forEach((mod) => {
    const status = modStatusForProfileMod(mod, activeIds, knownMods);
    summary[status.tone] += 1;
  });
  return summary;
}

function renderModProfileList() {
  if (!elements.modProfileList) return;
  const profiles = filteredModProfiles();
  elements.modProfileList.replaceChildren();

  if (!profiles.length) {
    const empty = document.createElement("div");
    empty.className = "scenario-empty";
    empty.textContent = state.modProfiles.length
      ? "No matching profiles."
      : "No mod profiles yet. Click + to capture your active Teardown modlist.";
    elements.modProfileList.append(empty);
    return;
  }

  profiles.forEach((profile) => {
    const selected = profile.id === state.selectedModProfileId;
    const row = document.createElement("article");
    row.className = `scenario-row${selected ? " selected" : ""}`;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selected ? "true" : "false");
    row.tabIndex = 0;
    row.dataset.id = profile.id;

    const thumbnail = document.createElement("span");
    thumbnail.className = "scenario-thumb profile-thumb";
    thumbnail.setAttribute("aria-hidden", "true");
    thumbnail.innerHTML = `<span class="icon icon-puzzle" aria-hidden="true"></span>`;

    const copy = document.createElement("span");
    copy.className = "scenario-copy";

    const title = document.createElement("span");
    title.className = "scenario-name";
    title.textContent = profile.name;

    const map = document.createElement("span");
    map.className = "scenario-map";
    map.textContent = profile.sourceModlistName
      ? `From: ${profile.sourceModlistName}`
      : "Custom profile";

    const linked = profileLinkedScenarios(profile.id);
    const meta = document.createElement("span");
    meta.className = "profile-meta";
    const modCount = document.createElement("span");
    modCount.className = "profile-mod-count";
    modCount.textContent = `${profile.modCount} mod${profile.modCount === 1 ? "" : "s"}`;
    const linkedTag = document.createElement("span");
    linkedTag.className = "profile-linked-tag";
    linkedTag.textContent = linked.length ? `Linked: ${linked.length}` : "Unlinked";
    meta.append(modCount, linkedTag);

    copy.append(title, map, meta);

    const utilities = document.createElement("span");
    utilities.className = "scenario-utilities";
    const size = document.createElement("span");
    size.className = "scenario-size";
    size.textContent = formatShortDate(profile.updatedAt);
    utilities.append(size);

    row.append(thumbnail, copy, utilities);
    row.addEventListener("click", () => selectModProfile(profile.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectModProfile(profile.id);
      }
    });
    elements.modProfileList.append(row);
  });
}

function selectModProfile(id) {
  state.selectedModProfileId = id;
  fetchModProfileDetail(id)
    .then(() => render())
    .catch((error) => showToast(error.message));
}

function renderModProfileDetail() {
  if (!elements.modProfileDetail) return;
  const id = state.selectedModProfileId;
  const profile = id ? state.modProfileDetails.get(id) : null;
  const visible = filteredModProfiles().some((entry) => entry.id === id);
  const empty = !profile || !visible;

  elements.modProfileEmpty.classList.toggle("hidden", !empty);
  elements.modProfileDetail.classList.toggle("hidden", empty);

  if (elements.modsActiveModlist) {
    const selectedModlistId = state.modInventory?.selectedModlistId;
    const list = (state.modInventory?.modlists || []).find((entry) => entry.id === selectedModlistId);
    elements.modsActiveModlist.textContent = list ? `${list.name} (${list.mods.length})` : "Not detected";
  }

  if (empty || !profile) return;

  elements.modProfileName.textContent = profile.name;
  const linked = profileLinkedScenarios(profile.id);
  if (linked.length) {
    elements.modProfileLinkedPill.classList.remove("hidden");
    elements.modProfileLinkedPill.textContent = `Linked to ${linked.length} scenario${linked.length === 1 ? "" : "s"}`;
  } else {
    elements.modProfileLinkedPill.classList.add("hidden");
  }

  elements.modProfileModCount.textContent = `${profile.mods.length}`;
  elements.modProfileCreated.textContent = formatDate(profile.createdAt);
  elements.modProfileSource.textContent = profile.sourceModlistName
    ? `${profile.sourceModlistName}${profile.sourceModlistId ? ` (id ${profile.sourceModlistId})` : ""}`
    : "Manual";
  elements.modProfileUpdated.textContent = formatDate(profile.updatedAt);
  elements.modProfileNotes.textContent = profile.notes || "No notes.";

  populateModlistSelect(elements.modProfileCompareSelect, state.modInventory?.selectedModlistId || "");

  const compareId = elements.modProfileCompareSelect.value || state.modInventory?.selectedModlistId || "";
  const summary = summarizeProfileMods(profile, compareId);
  elements.modProfileSummary.textContent = summary.total
    ? `${summary.active}/${summary.total} active`
    : "Empty";
  elements.modProfileSummary.className = `card-status ${summary.missing ? "broken" : summary.inactive ? "untested" : "verified"}`;

  renderProfileModsList(profile, compareId);
}

function renderProfileModsList(profile, modlistId) {
  if (!elements.modProfileModsList) return;
  elements.modProfileModsList.replaceChildren();
  if (!profile.mods.length) {
    const empty = document.createElement("div");
    empty.className = "mod-row";
    empty.textContent = "This profile has no mods yet. Re-capture from a Teardown modlist.";
    elements.modProfileModsList.append(empty);
    return;
  }

  const activeIds = activeModSet(modlistId);
  const knownMods = modsMap();
  profile.mods.forEach((mod) => {
    const current = knownMods.get(mod.id) || mod;
    const status = modStatusForProfileMod(mod, activeIds, knownMods);
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
    elements.modProfileModsList.append(row);
  });
}

function openModProfileDialog(mode, profileId) {
  state.modProfileDialogMode = mode;
  state.modProfileDialogId = profileId || null;
  const isEdit = mode === "edit";
  elements.modProfileDialogTitle.textContent = isEdit ? "Edit Mod Profile" : "New Mod Profile";
  elements.confirmModProfileButton.textContent = isEdit ? "Save Changes" : "Save Profile";

  if (isEdit && profileId) {
    const profile = state.modProfileDetails.get(profileId);
    elements.modProfileNameInput.value = profile?.name || "";
    elements.modProfileNotesInput.value = profile?.notes || "";
  } else {
    elements.modProfileNameInput.value = "";
    elements.modProfileNotesInput.value = "";
  }

  elements.modProfileSourceField.classList.toggle("hidden", isEdit);
  elements.modProfileSourceHint.classList.toggle("hidden", isEdit);
  if (!isEdit) {
    populateModlistSelect(elements.modProfileSourceInput, state.modInventory?.selectedModlistId || "");
  }

  elements.modProfileDialog.showModal();
  elements.modProfileNameInput.focus();
}

async function confirmModProfileDialog() {
  const name = elements.modProfileNameInput.value.trim();
  if (!name) {
    showToast("Profile name is required.");
    return false;
  }
  const notes = elements.modProfileNotesInput.value.trim();
  const isEdit = state.modProfileDialogMode === "edit";
  if (isEdit) {
    const id = state.modProfileDialogId;
    const updated = await api(`/api/mod-profiles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name, notes })
    });
    state.modProfileDetails.set(id, updated);
    await refreshModProfiles();
    showToast("Mod profile updated.");
  } else {
    const fromModlistId = elements.modProfileSourceInput.value;
    const created = await api("/api/mod-profiles", {
      method: "POST",
      body: JSON.stringify({ name, notes, fromModlistId })
    });
    state.modProfileDetails.set(created.id, created);
    state.selectedModProfileId = created.id;
    await refreshModProfiles();
    showToast(`Mod profile "${created.name}" created with ${created.mods.length} mod${created.mods.length === 1 ? "" : "s"}.`);
  }
  render();
  return true;
}

async function recaptureSelectedProfile() {
  const id = state.selectedModProfileId;
  if (!id) return;
  const profile = state.modProfileDetails.get(id);
  if (!profile) return;
  const sourceId = profile.sourceModlistId || state.modInventory?.selectedModlistId;
  const sourceName = profile.sourceModlistName || "the current modlist";
  const confirmed = window.confirm([
    `Re-capture "${profile.name}" from ${sourceName}?`,
    "",
    "This replaces the profile's mods with whatever's active in the chosen Teardown modlist."
  ].join("\n"));
  if (!confirmed) return;
  const updated = await api(`/api/mod-profiles/${encodeURIComponent(id)}/recapture`, {
    method: "POST",
    body: JSON.stringify({ modlistId: sourceId })
  });
  state.modProfileDetails.set(id, updated);
  await refreshModProfiles();
  render();
  showToast(`Re-captured ${updated.mods.length} mod${updated.mods.length === 1 ? "" : "s"}.`);
}

async function deleteSelectedProfile() {
  const id = state.selectedModProfileId;
  if (!id) return;
  const profile = state.modProfileDetails.get(id);
  if (!profile) return;
  const linkedCount = profileLinkedScenarios(id).length;
  const lines = [
    `Delete mod profile "${profile.name}"?`,
    "",
    "The profile folder will be moved to the trash inside mod-profiles/.deleted/."
  ];
  if (linkedCount) lines.push("", `${linkedCount} scenario${linkedCount === 1 ? "" : "s"} currently linked to this profile will be unlinked.`);
  if (!window.confirm(lines.join("\n"))) return;
  await api(`/api/mod-profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
  state.modProfileDetails.delete(id);
  state.selectedModProfileId = null;
  await refresh();
  showToast("Mod profile deleted.");
}

async function copyProfileLinks() {
  const profile = state.modProfileDetails.get(state.selectedModProfileId);
  if (!profile?.mods?.length) {
    showToast("Profile has no mods to copy.");
    return;
  }
  const lines = profile.mods.map((mod) => {
    const link = mod.link || workshopUrlFromMod(mod);
    return link ? `${mod.name || mod.id} - ${link}` : `${mod.name || mod.id} - ${mod.id}`;
  });
  await navigator.clipboard.writeText(lines.join("\n"));
  showToast(`Copied ${profile.mods.length} mod link${profile.mods.length === 1 ? "" : "s"}.`);
}

function workshopUrlFromMod(mod) {
  const id = String(mod?.id || "");
  const match = id.match(/^steam-(\d+)$/);
  return match ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${match[1]}` : "";
}

function openLinkProfileDialog() {
  const save = selectedSave();
  if (!save) return;
  elements.linkProfileSelect.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "(none — clear linkage)";
  elements.linkProfileSelect.append(blank);
  state.modProfiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} (${profile.modCount} mods)`;
    elements.linkProfileSelect.append(option);
  });
  elements.linkProfileSelect.value = save.modProfileId || "";
  elements.linkProfileDialog.showModal();
}

async function confirmLinkProfile() {
  const save = selectedSave();
  if (!save) return;
  const profileId = elements.linkProfileSelect.value;
  await api(`/api/saves/${encodeURIComponent(save.id)}/link-profile`, {
    method: "POST",
    body: JSON.stringify({ modProfileId: profileId })
  });
  if (profileId) {
    await fetchModProfileDetail(profileId);
  }
  await refresh();
  showToast(profileId ? "Mod profile linked." : "Mod profile unlinked.");
}

function toggleDetailCard(header) {
  const button = header.querySelector(".card-collapse");
  const targetId = header.dataset.target;
  const body = targetId ? document.getElementById(targetId) : header.parentElement?.querySelector(".detail-card-body");
  if (!body || !button) return;
  const expanded = button.getAttribute("aria-expanded") !== "false";
  const next = !expanded;
  button.setAttribute("aria-expanded", next ? "true" : "false");
  body.hidden = !next;
}

document.querySelectorAll(".detail-card-header.collapsible").forEach((header) => {
  header.addEventListener("click", (event) => {
    if (event.target.closest("button") && !event.target.closest(".card-collapse")) return;
    toggleDetailCard(header);
  });
});

document.addEventListener("click", (event) => {
  const goTab = event.target.closest("[data-go-tab]");
  if (goTab) {
    event.preventDefault();
    switchTab(goTab.dataset.goTab);
  }
});

function setActiveSettingsSection(name) {
  document.querySelectorAll(".settings-nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsSection === name);
  });
  document.querySelectorAll(".settings-section").forEach((section) => {
    section.classList.toggle("active", section.dataset.settingsSection === name);
  });
}

document.querySelectorAll(".settings-nav-item").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveSettingsSection(button.dataset.settingsSection);
  });
});

function fillAboutSection() {
  const aboutAppVersion = $("#aboutAppVersion");
  const aboutSchemaVersion = $("#aboutSchemaVersion");
  const aboutTeardownVersion = $("#aboutTeardownVersion");
  const aboutManagerRoot = $("#aboutManagerRoot");
  const aboutLogPath = $("#aboutLogPath");
  const status = state.status || {};
  if (aboutSchemaVersion) aboutSchemaVersion.textContent = status.schemaVersion ?? "1";
  if (aboutTeardownVersion) {
    const install = status.teardownInstall || {};
    aboutTeardownVersion.textContent = install.version || "Not detected";
    aboutTeardownVersion.title = install.exePath || install.diagnostic || "";
  }
  if (aboutManagerRoot) {
    aboutManagerRoot.textContent = status.managerRoot || "-";
    aboutManagerRoot.title = status.managerRoot || "";
  }
  if (aboutLogPath) {
    aboutLogPath.textContent = status.logPath || "-";
    aboutLogPath.title = status.logPath || "";
  }
  // app version: read from a hidden meta? Hardcode for now to match package.json.
  if (aboutAppVersion) aboutAppVersion.textContent = "0.1.0";
}

$("#openLogFileButton")?.addEventListener("click", () => {
  const logPath = state.status?.logPath;
  if (!logPath) return;
  navigator.clipboard.writeText(logPath).then(() => showToast(`Log path copied: ${logPath}`));
});

$("#openManagerRootButton")?.addEventListener("click", () => {
  openManagedPath("manager").catch((error) => showToast(error.message));
});

function applyVersionsTabVisibility() {
  const tab = $("#versionsTabButton");
  if (!tab) return;
  const enabled = Boolean(state.settings?.enableVersionsTab);
  tab.hidden = !enabled;
  if (!enabled && state.view === "versions") {
    switchTab("library");
  }
}

setupWindowControls();
refresh()
  .then(() => {
    fillAboutSection();
    applyVersionsTabVisibility();
  })
  .catch((error) => {
    showToast(error.message);
  });
