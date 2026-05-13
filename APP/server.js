const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { buildZip, readZip } = require("./zip");

const PORT = Number(process.env.PORT || 47831);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const documentsDir = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, "Documents")
  : path.join(os.homedir(), "Documents");

const localAppDataQuicksave = path.join(localAppData, "Teardown", "quicksave.bin");
const documentsQuicksave = path.join(documentsDir, "Teardown", "quicksave.bin");
const envQuicksavePath = process.env.TEARDOWN_QUICKSAVE_PATH || "";
const teardownDataDir = path.join(localAppData, "Teardown");
const teardownModsDir = path.join(documentsDir, "Teardown", "mods");
const teardownScreenshotsDir = path.join(documentsDir, "Teardown", "screenshots");
const teardownModsRegistryPath = path.join(teardownDataDir, "mods.xml");
const teardownModlistsDir = path.join(teardownDataDir, "modlists");
const managerRoot = process.env.TEARDOWN_QSM_ROOT || path.join(documentsDir, "Teardown", "Quicksave Manager");
const savesDir = path.join(managerRoot, "saves");
const backupsDir = path.join(managerRoot, "backups");
const deletedDir = path.join(managerRoot, "deleted");
const packagesDir = path.join(managerRoot, "packages");
const modProfilesDir = path.join(managerRoot, "mod-profiles");
const modProfileTrashDir = path.join(modProfilesDir, ".deleted");
const logsDir = path.join(managerRoot, "logs");
const logPath = path.join(logsDir, "app.log");
const configPath = path.join(managerRoot, "config.json");
const teardownSteamUrl = "steam://rungameid/1167630";
const packageExtension = ".tdqscenario";
const packageSchemaVersion = 1;
const manifestSchemaVersion = 1;
const modProfileSchemaVersion = 1;
const maxPackageBytes = 2 * 1024 * 1024 * 1024;

let activeSavePath = envQuicksavePath || localAppDataQuicksave;
let activeSavePathSource = envQuicksavePath ? "env" : "localAppData";
let activeSavePathExists = false;
let setupRequired = false;

const defaultSettings = {
  backupBeforeLoad: "every_n",
  loadBackupEvery: 5,
  backupBeforeUpdate: "every_n",
  updateBackupEvery: 5,
  quicksavePathOverride: "",
  enableVersionsTab: false
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const previewExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

function safeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function looseId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .slice(0, 96);
}

function parseXmlAttributes(raw) {
  const attributes = {};
  String(raw || "").replace(/([a-zA-Z0-9_-]+)="([^"]*)"/g, (_, key, value) => {
    attributes[key] = value;
    return "";
  });
  return attributes;
}

function parseInfoText(content) {
  const info = {};
  String(content || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (match) info[match[1]] = match[2];
  });
  return info;
}

function modNameFromInfo(info, fallback) {
  return info.en_name || info.name || info.title || fallback;
}

function modNameFromId(id) {
  return String(id || "")
    .replace(/^steam-/, "Workshop ")
    .replace(/^local-/, "")
    .replace(/^builtin-/, "Built-in ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function workshopIdFromModId(id) {
  const match = String(id || "").match(/^steam-(\d+)$/);
  return match ? match[1] : "";
}

function workshopUrl(id) {
  const workshopId = workshopIdFromModId(id);
  return workshopId ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}` : "";
}

function previewUrl(id, version = Date.now()) {
  return `/api/saves/${encodeURIComponent(id)}/preview?v=${version}`;
}

function previewExtension(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (previewExtensions.has(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  return "";
}

function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function logFormat(level, message, details) {
  const meta = details && Object.keys(details).length ? " " + JSON.stringify(details) : "";
  return `${new Date().toISOString()} [${level}] ${message}${meta}\n`;
}

function log(level, message, details = {}) {
  const line = logFormat(level, message, details);
  try {
    fsSync.mkdirSync(logsDir, { recursive: true });
    fsSync.appendFileSync(logPath, line);
  } catch (error) {
    console.error("[log-write-failed]", error.message);
  }
  if (level === "error" || level === "warn") {
    process.stderr.write(line);
  } else if (process.env.TEARDOWN_QSM_VERBOSE) {
    process.stdout.write(line);
  }
}

async function readLogTail(maxLines = 200) {
  try {
    const content = await fs.readFile(logPath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(maxLines, 2000)));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

const errorCodeMessages = {
  EACCES: "Permission denied. Try running the manager without elevated privileges or check the file owner.",
  EPERM: "Permission denied for this file. Another program may be holding it open.",
  EBUSY: "The file is in use. Close Teardown and try again.",
  ENOSPC: "Not enough disk space to complete this operation.",
  EROFS: "The destination is read-only.",
  EMFILE: "Too many files are open. Restart the manager and try again.",
  ENOTDIR: "Expected a folder but found a file at this path.",
  EISDIR: "Expected a file but found a folder at this path.",
  ENAMETOOLONG: "The selected file path is too long for Windows."
};

function friendlyError(error, fallback) {
  if (!error) return new Error(fallback || "Unexpected error.");
  if (error.status && error.message) return error;
  const message = errorCodeMessages[error.code];
  if (message) {
    const wrapped = new Error(`${fallback ? fallback + ": " : ""}${message}`);
    wrapped.status = error.status || (error.code === "EACCES" || error.code === "EPERM" ? 403 : 500);
    wrapped.cause = error;
    return wrapped;
  }
  const wrapped = new Error(fallback || error.message || "Unexpected error.");
  wrapped.status = error.status || 500;
  wrapped.cause = error;
  return wrapped;
}

async function safeFsOp(operation, fallback) {
  try {
    return await operation();
  } catch (error) {
    throw friendlyError(error, fallback);
  }
}

function quicksavePathCandidates(settings) {
  const candidates = [];
  const override = String(settings?.quicksavePathOverride || "").trim();
  if (override) candidates.push({ path: override, source: "override" });
  if (envQuicksavePath && envQuicksavePath !== override) {
    candidates.push({ path: envQuicksavePath, source: "env" });
  }
  if (!candidates.some((c) => c.path === localAppDataQuicksave)) {
    candidates.push({ path: localAppDataQuicksave, source: "localAppData" });
  }
  if (!candidates.some((c) => c.path === documentsQuicksave)) {
    candidates.push({ path: documentsQuicksave, source: "documents" });
  }
  return candidates;
}

async function resolveActiveSavePath(settings) {
  const candidates = quicksavePathCandidates(settings);
  const annotated = [];
  let resolved = null;
  for (const candidate of candidates) {
    const stat = await statOrNull(candidate.path);
    const exists = Boolean(stat);
    annotated.push({ ...candidate, exists });
    if (!resolved && exists) resolved = { ...candidate, exists };
  }

  if (resolved) {
    activeSavePath = resolved.path;
    activeSavePathSource = resolved.source;
    activeSavePathExists = true;
    setupRequired = false;
    return { resolved, candidates: annotated, setupRequired: false };
  }

  const override = String(settings?.quicksavePathOverride || "").trim();
  if (override) {
    activeSavePath = override;
    activeSavePathSource = "override";
    activeSavePathExists = false;
    setupRequired = false;
    return { resolved: { path: override, source: "override", exists: false }, candidates: annotated, setupRequired: false };
  }

  activeSavePath = candidates[0]?.path || localAppDataQuicksave;
  activeSavePathSource = candidates[0]?.source || "localAppData";
  activeSavePathExists = false;
  setupRequired = true;
  return { resolved: { path: activeSavePath, source: activeSavePathSource, exists: false }, candidates: annotated, setupRequired: true };
}

async function ensureDirs() {
  await fs.mkdir(savesDir, { recursive: true });
  await fs.mkdir(backupsDir, { recursive: true });
  await fs.mkdir(deletedDir, { recursive: true });
  await fs.mkdir(packagesDir, { recursive: true });
  await fs.mkdir(modProfilesDir, { recursive: true });
  await fs.mkdir(modProfileTrashDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
}

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJsonOrNull(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeBackupMode(value) {
  return ["always", "every_n", "never"].includes(value) ? value : "every_n";
}

function normalizeBackupEvery(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return 5;
  return Math.min(Math.max(number, 2), 50);
}

function normalizeQuicksavePathOverride(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw;
}

function normalizeSettings(settings = {}) {
  return {
    backupBeforeLoad: normalizeBackupMode(settings.backupBeforeLoad || defaultSettings.backupBeforeLoad),
    loadBackupEvery: normalizeBackupEvery(settings.loadBackupEvery || defaultSettings.loadBackupEvery),
    backupBeforeUpdate: normalizeBackupMode(settings.backupBeforeUpdate || defaultSettings.backupBeforeUpdate),
    updateBackupEvery: normalizeBackupEvery(settings.updateBackupEvery || defaultSettings.updateBackupEvery),
    quicksavePathOverride: normalizeQuicksavePathOverride(
      settings.quicksavePathOverride !== undefined ? settings.quicksavePathOverride : defaultSettings.quicksavePathOverride
    ),
    enableVersionsTab: Boolean(settings.enableVersionsTab !== undefined ? settings.enableVersionsTab : defaultSettings.enableVersionsTab)
  };
}

async function getSettings() {
  await ensureDirs();
  const settings = normalizeSettings(await readJsonOrNull(configPath) || defaultSettings);
  await writeJson(configPath, settings);
  await resolveActiveSavePath(settings);
  return settings;
}

async function updateSettings(body) {
  const current = await getSettings();
  const previousOverride = current.quicksavePathOverride;
  const settings = normalizeSettings({ ...current, ...body });

  if (settings.quicksavePathOverride && settings.quicksavePathOverride !== previousOverride) {
    if (!path.isAbsolute(settings.quicksavePathOverride)) {
      const error = new Error("Quicksave path must be an absolute path.");
      error.status = 400;
      throw error;
    }
    if (path.basename(settings.quicksavePathOverride).toLowerCase() !== "quicksave.bin") {
      const error = new Error("Quicksave path must end with quicksave.bin.");
      error.status = 400;
      throw error;
    }
  }

  await writeJson(configPath, settings);
  await resolveActiveSavePath(settings);
  log("info", "settings.updated", {
    backupBeforeLoad: settings.backupBeforeLoad,
    loadBackupEvery: settings.loadBackupEvery,
    backupBeforeUpdate: settings.backupBeforeUpdate,
    updateBackupEvery: settings.updateBackupEvery,
    quicksavePathOverrideChanged: previousOverride !== settings.quicksavePathOverride
  });
  return settings;
}

function operationCount(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function shouldCreateAutomaticBackup(mode, every, currentCount) {
  if (mode === "always") return true;
  if (mode === "never") return false;
  return currentCount + 1 >= every;
}

function metadataFromBody(body, fallback = {}) {
  return {
    name: String(body.name || fallback.name || "").trim(),
    notes: String(body.notes || fallback.notes || "").trim(),
    mapName: String(body.mapName || fallback.mapName || "").trim(),
    mapType: String(body.mapType || fallback.mapType || "unknown").trim(),
    requiredMapHint: String(body.requiredMapHint || fallback.requiredMapHint || "").trim(),
    teardownVersion: String(body.teardownVersion || fallback.teardownVersion || "").trim(),
    thumbnail: String(body.thumbnail || fallback.thumbnail || "").trim(),
    favorite: typeof body.favorite === "boolean" ? body.favorite : Boolean(fallback.favorite)
  };
}

function resolveSaveDir(id) {
  const clean = safeId(id);
  if (!clean) throw new Error("Invalid save id");
  const resolved = path.resolve(savesDir, clean);
  const root = path.resolve(savesDir);
  if (resolved !== root && resolved.startsWith(root + path.sep)) return resolved;
  throw new Error("Invalid save path");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function uniqueSaveId(name) {
  const base = safeId(name) || "quicksave";
  let id = base;
  let index = 2;
  while (await statOrNull(path.join(savesDir, id))) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

async function isTeardownRunning() {
  if (process.platform !== "win32") return { running: false, detected: false };
  try {
    const stdout = await runPowerShell(
      "@(Get-Process -Name 'teardown' -ErrorAction SilentlyContinue).Count"
    );
    const count = Number.parseInt(stdout, 10);
    return { running: Number.isFinite(count) && count > 0, detected: true };
  } catch {
    return { running: false, detected: false };
  }
}

async function getStatus() {
  await ensureDirs();
  const settings = await getSettings();
  const resolution = await resolveActiveSavePath(settings);
  const active = await statOrNull(activeSavePath);
  const screenshotsDir = await findScreenshotDir();
  const teardownInstall = await detectTeardownInstall();
  const teardownRunning = await isTeardownRunning();
  return {
    activeSavePath,
    activeSavePathSource,
    activeSavePathExists: Boolean(active),
    quicksavePathCandidates: resolution.candidates,
    setupRequired: resolution.setupRequired,
    quicksavePathOverride: settings.quicksavePathOverride || "",
    defaultQuicksavePath: localAppDataQuicksave,
    documentsQuicksavePath: documentsQuicksave,
    managerRoot,
    savesDir,
    backupsDir,
    deletedDir,
    packagesDir,
    logsDir,
    logPath,
    packageExtension,
    schemaVersion: manifestSchemaVersion,
    screenshotsDir,
    hasActiveQuicksave: Boolean(active),
    activeQuicksave: active ? {
      size: active.size,
      modifiedAt: active.mtime.toISOString()
    } : null,
    teardownInstall,
    teardownRunning
  };
}

async function readTeardownModRegistry() {
  try {
    const raw = await fs.readFile(teardownModsRegistryPath, "utf8");
    const mods = [];
    raw.replace(/<mod\s+([^>]*?)\/>/g, (_, attributesRaw) => {
      const attributes = parseXmlAttributes(attributesRaw);
      if (attributes.id) mods.push(attributes);
      return "";
    });
    return mods;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readLocalMods() {
  const mods = new Map();
  let entries = [];
  try {
    entries = await fs.readdir(teardownModsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return mods;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const modDir = path.join(teardownModsDir, entry.name);
    const infoPath = path.join(modDir, "info.txt");
    const info = parseInfoText(await fs.readFile(infoPath, "utf8").catch(() => ""));
    const name = modNameFromInfo(info, entry.name);
    const mod = {
      id: `local-${safeId(entry.name)}`,
      aliases: Array.from(new Set([
        `local-${safeId(entry.name)}`,
        `local-${looseId(entry.name)}`
      ])),
      kind: "local",
      name,
      author: info.author || "",
      tags: info.tags || "",
      path: modDir,
      link: "",
      installed: true
    };
    mod.aliases.forEach((id) => mods.set(id, { ...mod, id }));
  }
  return mods;
}

async function steamAppsDirs() {
  const candidates = [
    path.join("C:", "Program Files (x86)", "Steam", "steamapps"),
    path.join("C:", "Program Files", "Steam", "steamapps")
  ];

  if (process.platform === "win32") {
    for (let code = 67; code <= 90; code += 1) {
      candidates.push(path.join(`${String.fromCharCode(code)}:`, "SteamLibrary", "steamapps"));
    }
  }

  const dirs = [];
  for (const candidate of candidates) {
    if (await statOrNull(candidate)) dirs.push(candidate);
  }
  return Array.from(new Set(dirs));
}

let cachedTeardownExe = null;
let cachedTeardownVersion = "";

async function readSteamLibraryRootsFromVdf() {
  const roots = new Set();
  for (const steamAppsDir of await steamAppsDirs()) {
    const vdfPath = path.join(steamAppsDir, "libraryfolders.vdf");
    try {
      const raw = await fs.readFile(vdfPath, "utf8");
      const matches = raw.matchAll(/"path"\s+"([^"]+)"/gi);
      for (const match of matches) {
        roots.add(match[1].replace(/\\\\/g, "\\"));
      }
    } catch {}
  }
  return Array.from(roots);
}

async function teardownInstallDirFromManifest() {
  const candidates = new Set(await steamAppsDirs());
  for (const root of await readSteamLibraryRootsFromVdf()) {
    candidates.add(path.join(root, "steamapps"));
  }
  for (const steamAppsDir of candidates) {
    const manifestPath = path.join(steamAppsDir, "appmanifest_1167630.acf");
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const match = raw.match(/"installdir"\s+"([^"]+)"/i);
      if (match) {
        const installDir = path.join(steamAppsDir, "common", match[1]);
        if (await statOrNull(installDir)) return installDir;
      }
    } catch {}
  }
  return "";
}

async function findTeardownExe() {
  if (cachedTeardownExe && (await statOrNull(cachedTeardownExe))) return cachedTeardownExe;
  cachedTeardownExe = null;

  const installDir = await teardownInstallDirFromManifest();
  if (installDir) {
    for (const exeName of ["teardown.exe", "Teardown.exe"]) {
      const exePath = path.join(installDir, exeName);
      if (await statOrNull(exePath)) {
        cachedTeardownExe = exePath;
        return exePath;
      }
    }
    console.warn(`[version] manifest pointed to ${installDir} but no teardown.exe inside`);
  }

  for (const steamAppsDir of await steamAppsDirs()) {
    for (const exeName of ["teardown.exe", "Teardown.exe"]) {
      const exePath = path.join(steamAppsDir, "common", "Teardown", exeName);
      if (await statOrNull(exePath)) {
        cachedTeardownExe = exePath;
        return exePath;
      }
    }
  }
  return "";
}

function powerShellExecutable() {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(powerShellExecutable(), [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-Command", command
    ], { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = String(stderr || "");
        reject(error);
      } else {
        resolve(String(stdout || "").trim());
      }
    });
  });
}

async function detectTeardownInstall() {
  if (process.platform !== "win32") {
    return { exePath: "", version: "", diagnostic: "Version detection only runs on Windows." };
  }
  const exe = await findTeardownExe();
  if (!exe) {
    const tried = await steamAppsDirs();
    return {
      exePath: "",
      version: "",
      diagnostic: `teardown.exe not found. Searched: ${tried.join(" | ") || "(no Steam libraries found)"}`
    };
  }
  if (cachedTeardownVersion) {
    return { exePath: exe, version: cachedTeardownVersion, diagnostic: "" };
  }
  const escaped = exe.replace(/'/g, "''");
  try {
    const raw = await runPowerShell(
      `$v = (Get-Item -LiteralPath '${escaped}').VersionInfo; ` +
      `if ($v.ProductVersion) { $v.ProductVersion } else { $v.FileVersion }`
    );
    if (raw) {
      cachedTeardownVersion = raw;
      return { exePath: exe, version: raw, diagnostic: "" };
    }
    return { exePath: exe, version: "", diagnostic: `PowerShell returned empty version metadata for ${exe}` };
  } catch (error) {
    return {
      exePath: exe,
      version: "",
      diagnostic: `PowerShell failed: ${error.message}${error.stderr ? ` | ${error.stderr}` : ""}`
    };
  }
}

async function steamRootDirs() {
  const roots = new Set();
  const candidates = [
    path.join("C:", "Program Files (x86)", "Steam"),
    path.join("C:", "Program Files", "Steam")
  ];
  if (process.platform === "win32") {
    for (let code = 67; code <= 90; code += 1) {
      candidates.push(path.join(`${String.fromCharCode(code)}:`, "Steam"));
      candidates.push(path.join(`${String.fromCharCode(code)}:`, "SteamLibrary"));
    }
  }
  for (const steamAppsDir of await steamAppsDirs()) {
    candidates.push(path.dirname(steamAppsDir));
  }
  for (const candidate of candidates) {
    if (await statOrNull(candidate)) roots.add(candidate);
  }
  return Array.from(roots);
}

async function findScreenshotDir() {
  for (const root of await steamRootDirs()) {
    const userdata = path.join(root, "userdata");
    let users = [];
    try {
      users = await fs.readdir(userdata, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    for (const user of users) {
      if (!user.isDirectory()) continue;
      const screenshotDir = path.join(userdata, user.name, "760", "remote", "1167630", "screenshots");
      if (await statOrNull(screenshotDir)) return screenshotDir;
    }
  }

  if (await statOrNull(teardownScreenshotsDir)) return teardownScreenshotsDir;
  return teardownScreenshotsDir;
}

async function readWorkshopMods() {
  const mods = new Map();
  const dirs = await steamAppsDirs();
  for (const steamAppsDir of dirs) {
    const contentDir = path.join(steamAppsDir, "workshop", "content", "1167630");
    let entries = [];
    try {
      entries = await fs.readdir(contentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const modDir = path.join(contentDir, entry.name);
      const info = parseInfoText(await fs.readFile(path.join(modDir, "info.txt"), "utf8").catch(() => ""));
      const id = `steam-${entry.name}`;
      mods.set(id, {
        id,
        kind: "steam",
        name: modNameFromInfo(info, `Workshop ${entry.name}`),
        author: info.author || "",
        tags: info.tags || "",
        path: modDir,
        link: workshopUrl(id),
        installed: true
      });
    }
  }
  return mods;
}

async function readModlists() {
  let indexNames = new Map();
  try {
    const rawIndex = await fs.readFile(path.join(teardownModlistsDir, "index.xml"), "utf8");
    rawIndex.replace(/<modlist\s+([^>]*?)>\s*<name>([^<]*)<\/name>/g, (_, attributesRaw, name) => {
      const attributes = parseXmlAttributes(attributesRaw);
      if (attributes.id) indexNames.set(attributes.id, name);
      return "";
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let entries = [];
  try {
    entries = await fs.readdir(teardownModlistsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const modlists = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^\d+\.xml$/i.test(entry.name)) continue;
    const id = entry.name.replace(/\.xml$/i, "");
    const filePath = path.join(teardownModlistsDir, entry.name);
    const [raw, stat] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath)
    ]);
    const name = raw.match(/<name>([^<]*)<\/name>/)?.[1] || indexNames.get(id) || `Modlist ${id}`;
    const mods = [];
    raw.replace(/<mod\s+([^>]*?)\/>/g, (_, attributesRaw) => {
      const attributes = parseXmlAttributes(attributesRaw);
      if (attributes.id) mods.push(attributes.id);
      return "";
    });
    modlists.push({
      id,
      name,
      path: filePath,
      updatedAt: stat.mtime.toISOString(),
      mods
    });
  }

  modlists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return modlists;
}

async function readSelectedModlistId() {
  try {
    const raw = await fs.readFile(path.join(teardownDataDir, "options.xml"), "utf8");
    return raw.match(/<mods>[\s\S]*?<playmode\s+value="([^"]+)"/)?.[1] || "";
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function getModInventory() {
  const [registry, localMods, workshopMods, modlists, selectedId] = await Promise.all([
    readTeardownModRegistry(),
    readLocalMods(),
    readWorkshopMods(),
    readModlists(),
    readSelectedModlistId()
  ]);

  const mods = new Map([...localMods, ...workshopMods]);
  registry.forEach((mod) => {
    if (mods.has(mod.id)) return;
    const link = workshopUrl(mod.id);
    mods.set(mod.id, {
      id: mod.id,
      kind: mod.id.startsWith("steam-") ? "steam" : mod.id.startsWith("builtin-") ? "builtin" : "local",
      name: modNameFromId(mod.id),
      author: "",
      tags: "",
      path: "",
      link,
      installed: true
    });
  });

  const selectedModlistId = modlists.some((modlist) => modlist.id === selectedId)
    ? selectedId
    : modlists[0]?.id || "";

  return {
    dataDir: teardownDataDir,
    localModsDir: teardownModsDir,
    registryPath: teardownModsRegistryPath,
    modlistsDir: teardownModlistsDir,
    selectedModlistId,
    modlists,
    mods: Array.from(mods.values()).sort((a, b) => a.name.localeCompare(b.name))
  };
}

function modsById(inventory) {
  return new Map(inventory.mods.map((mod) => [mod.id, mod]));
}

async function captureRequiredMods(id, modlistId = "") {
  const saveDir = resolveSaveDir(id);
  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath);
  if (!metadata) {
    const error = new Error("Save not found.");
    error.status = 404;
    throw error;
  }

  const inventory = await getModInventory();
  const source = inventory.modlists.find((modlist) => modlist.id === String(modlistId || "")) || inventory.modlists[0];
  if (!source) {
    const error = new Error("No Teardown modlists were found.");
    error.status = 409;
    throw error;
  }

  const knownMods = modsById(inventory);
  metadata.requiredMods = {
    capturedAt: new Date().toISOString(),
    source: {
      id: source.id,
      name: source.name,
      path: source.path,
      updatedAt: source.updatedAt
    },
    mods: source.mods.map((modId) => {
      const known = knownMods.get(modId);
      return known || {
        id: modId,
        kind: modId.startsWith("steam-") ? "steam" : modId.startsWith("builtin-") ? "builtin" : "local",
        name: modNameFromId(modId),
        author: "",
        tags: "",
        path: "",
        link: workshopUrl(modId),
        installed: false
      };
    })
  };
  metadata.updatedAt = new Date().toISOString();
  await writeJson(metadataPath, metadata);
  return { id, requiredMods: metadata.requiredMods };
}

function resolveModProfileDir(id) {
  const clean = safeId(id);
  if (!clean) {
    const error = new Error("Invalid mod profile id.");
    error.status = 400;
    throw error;
  }
  const resolved = path.resolve(modProfilesDir, clean);
  const root = path.resolve(modProfilesDir);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    const error = new Error("Invalid mod profile path.");
    error.status = 400;
    throw error;
  }
  return resolved;
}

async function uniqueModProfileId(name) {
  const base = safeId(name) || "mod-profile";
  let id = base;
  let index = 2;
  while (await statOrNull(path.join(modProfilesDir, id))) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
}

function modEntryFromInventory(modId, inventory) {
  const known = inventory ? modsById(inventory).get(modId) : null;
  if (known) {
    return {
      id: known.id,
      kind: known.kind,
      name: known.name,
      author: known.author || "",
      tags: known.tags || "",
      link: known.link || workshopUrl(known.id),
      installed: known.installed !== false,
      enabled: true
    };
  }
  return {
    id: modId,
    kind: modId.startsWith("steam-") ? "steam" : modId.startsWith("builtin-") ? "builtin" : "local",
    name: modNameFromId(modId),
    author: "",
    tags: "",
    link: workshopUrl(modId),
    installed: false,
    enabled: true
  };
}

function normalizeProfileModInput(mod, inventory) {
  const rawId = String(mod?.id || "").trim();
  if (!rawId) return null;
  const base = modEntryFromInventory(rawId, inventory);
  return {
    ...base,
    name: mod.name || base.name,
    author: mod.author || base.author,
    tags: mod.tags || base.tags,
    link: mod.link || base.link,
    enabled: mod.enabled !== false
  };
}

async function listModProfiles() {
  await ensureDirs();
  const entries = await fs.readdir(modProfilesDir, { withFileTypes: true });
  const profiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const profile = await readJsonOrNull(path.join(modProfilesDir, entry.name, "profile.json"));
    if (!profile) continue;
    profiles.push({
      schemaVersion: profile.schemaVersion || 1,
      id: profile.id || entry.name,
      name: profile.name || entry.name,
      notes: profile.notes || "",
      createdAt: profile.createdAt || "",
      updatedAt: profile.updatedAt || "",
      sourceModlistId: profile.sourceModlistId || "",
      sourceModlistName: profile.sourceModlistName || "",
      sourceCapturedAt: profile.sourceCapturedAt || "",
      modCount: Array.isArray(profile.mods) ? profile.mods.length : 0
    });
  }
  profiles.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return profiles;
}

async function readModProfile(id) {
  const dir = resolveModProfileDir(id);
  const profile = await readJsonOrNull(path.join(dir, "profile.json"));
  if (!profile) {
    const error = new Error("Mod profile not found.");
    error.status = 404;
    throw error;
  }
  return profile;
}

async function createModProfile(body) {
  await ensureDirs();
  const inventory = await getModInventory();
  const name = String(body?.name || "").trim();
  if (!name) {
    const error = new Error("Profile name is required.");
    error.status = 400;
    throw error;
  }

  let mods = [];
  let sourceModlistId = "";
  let sourceModlistName = "";
  let sourceCapturedAt = "";

  if (body.fromModlistId) {
    const modlist = inventory.modlists.find((entry) => entry.id === String(body.fromModlistId));
    if (!modlist) {
      const error = new Error(`Teardown modlist not found: ${body.fromModlistId}`);
      error.status = 404;
      throw error;
    }
    sourceModlistId = modlist.id;
    sourceModlistName = modlist.name;
    sourceCapturedAt = new Date().toISOString();
    mods = modlist.mods.map((modId) => modEntryFromInventory(modId, inventory));
  } else if (Array.isArray(body.mods)) {
    mods = body.mods
      .map((mod) => normalizeProfileModInput(mod, inventory))
      .filter(Boolean);
  }

  const id = await uniqueModProfileId(name);
  const dir = path.join(modProfilesDir, id);
  await safeFsOp(() => fs.mkdir(dir, { recursive: true }), "Could not create mod profile folder");
  const now = new Date().toISOString();
  const profile = {
    schemaVersion: modProfileSchemaVersion,
    id,
    name,
    notes: String(body.notes || "").trim(),
    createdAt: now,
    updatedAt: now,
    sourceModlistId,
    sourceModlistName,
    sourceCapturedAt,
    mods
  };
  await writeJson(path.join(dir, "profile.json"), profile);
  log("info", "mod-profile.created", { id, name, source: sourceModlistId || "manual", modCount: mods.length });
  return profile;
}

async function updateModProfile(id, body) {
  const profile = await readModProfile(id);
  const inventory = body && Array.isArray(body.mods) ? await getModInventory() : null;
  const next = { ...profile };
  if (body?.name !== undefined) next.name = String(body.name).trim() || profile.name;
  if (body?.notes !== undefined) next.notes = String(body.notes).trim();
  if (Array.isArray(body?.mods)) {
    next.mods = body.mods
      .map((mod) => normalizeProfileModInput(mod, inventory))
      .filter(Boolean);
  }
  next.updatedAt = new Date().toISOString();
  await writeJson(path.join(resolveModProfileDir(id), "profile.json"), next);
  log("info", "mod-profile.updated", { id, name: next.name, modCount: next.mods.length });
  return next;
}

async function recaptureModProfile(id, modlistId) {
  const profile = await readModProfile(id);
  const inventory = await getModInventory();
  const sourceId = String(modlistId || profile.sourceModlistId || inventory.selectedModlistId || "").trim();
  const modlist = inventory.modlists.find((entry) => entry.id === sourceId);
  if (!modlist) {
    const error = new Error(`Teardown modlist not found: ${sourceId || "(none selected)"}`);
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const next = {
    ...profile,
    sourceModlistId: modlist.id,
    sourceModlistName: modlist.name,
    sourceCapturedAt: now,
    mods: modlist.mods.map((modId) => modEntryFromInventory(modId, inventory)),
    updatedAt: now
  };
  await writeJson(path.join(resolveModProfileDir(id), "profile.json"), next);
  log("info", "mod-profile.recaptured", { id, source: modlist.id, modCount: next.mods.length });
  return next;
}

async function deleteModProfile(id) {
  const dir = resolveModProfileDir(id);
  const stat = await statOrNull(dir);
  if (!stat) {
    const error = new Error("Mod profile not found.");
    error.status = 404;
    throw error;
  }

  await ensureDirs();
  const saves = await listSaves();
  const clean = safeId(id);
  let unlinked = 0;
  for (const save of saves) {
    if (save.modProfileId !== clean) continue;
    const metaPath = path.join(savesDir, save.id, "metadata.json");
    const metadata = await readJsonOrNull(metaPath);
    if (!metadata) continue;
    metadata.modProfileId = null;
    metadata.updatedAt = new Date().toISOString();
    await writeJson(metaPath, metadata);
    unlinked += 1;
  }

  const trashTarget = path.join(modProfileTrashDir, `${clean}-${timestamp()}`);
  await safeFsOp(() => fs.rename(dir, trashTarget), "Could not move mod profile to trash");
  log("info", "mod-profile.deleted", { id: clean, unlinkedScenarios: unlinked });
  return { id: clean, unlinkedScenarios: unlinked, movedTo: trashTarget };
}

async function linkScenarioToProfile(scenarioId, profileId) {
  const saveDir = resolveSaveDir(scenarioId);
  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath);
  if (!metadata) {
    const error = new Error("Scenario not found.");
    error.status = 404;
    throw error;
  }

  const cleanProfile = profileId ? safeId(profileId) : "";
  if (cleanProfile) {
    await readModProfile(cleanProfile);
    metadata.modProfileId = cleanProfile;
  } else {
    metadata.modProfileId = null;
  }
  metadata.updatedAt = new Date().toISOString();
  await writeJson(metadataPath, metadata);
  log("info", "scenario.profile-linked", { scenarioId, modProfileId: metadata.modProfileId });
  return { id: scenarioId, modProfileId: metadata.modProfileId };
}

async function removeExistingPreviews(saveDir) {
  for (const ext of previewExtensions) {
    await fs.unlink(path.join(saveDir, `preview${ext === ".jpeg" ? ".jpg" : ext}`)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function setSavePreviewFromBuffer(id, buffer, ext) {
  const saveDir = resolveSaveDir(id);
  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath);
  if (!metadata) {
    const error = new Error("Save not found.");
    error.status = 404;
    throw error;
  }
  if (!previewExtensions.has(ext)) {
    const error = new Error("Preview must be a PNG, JPG, or WEBP image.");
    error.status = 400;
    throw error;
  }

  await removeExistingPreviews(saveDir);
  const previewPath = path.join(saveDir, `preview${ext}`);
  await fs.writeFile(previewPath, buffer);
  metadata.thumbnail = previewUrl(id);
  metadata.previewFile = path.basename(previewPath);
  metadata.previewUpdatedAt = new Date().toISOString();
  metadata.updatedAt = metadata.previewUpdatedAt;
  await writeJson(metadataPath, metadata);
  return { id, thumbnail: metadata.thumbnail };
}

async function setSavePreviewFromPath(id, sourcePath) {
  const source = String(sourcePath || "");
  const ext = previewExtension(source);
  if (!ext) {
    const error = new Error("Preview must be a PNG, JPG, or WEBP image.");
    error.status = 400;
    throw error;
  }
  const stat = await statOrNull(source);
  if (!stat || !stat.isFile()) {
    const error = new Error("Selected preview image was not found.");
    error.status = 404;
    throw error;
  }
  const buffer = await fs.readFile(source);
  return setSavePreviewFromBuffer(id, buffer, ext);
}

async function setSavePreviewFromData(id, body) {
  const dataUrl = String(body.dataUrl || "");
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) {
    const error = new Error("Preview upload must be a PNG, JPG, or WEBP image.");
    error.status = 400;
    throw error;
  }
  const ext = match[1].toLowerCase().startsWith("jp") ? ".jpg" : `.${match[1].toLowerCase()}`;
  return setSavePreviewFromBuffer(id, Buffer.from(match[2], "base64"), ext);
}

async function serveSavePreview(id, res) {
  const saveDir = resolveSaveDir(id);
  const metadata = await readJsonOrNull(path.join(saveDir, "metadata.json")) || {};
  const previewFile = metadata.previewFile || "";
  const ext = previewExtension(previewFile);
  if (!previewFile || !ext) return notFound(res);
  const filePath = path.resolve(saveDir, previewFile);
  if (!filePath.startsWith(path.resolve(saveDir) + path.sep)) return notFound(res);

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-cache"
    });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return notFound(res);
    json(res, 500, { error: error.message });
  }
}

async function listSaves() {
  await ensureDirs();
  const entries = await fs.readdir(savesDir, { withFileTypes: true });
  const saves = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const saveDir = path.join(savesDir, id);
    const quicksavePath = path.join(saveDir, "quicksave.bin");
    const quicksave = await statOrNull(quicksavePath);
    if (!quicksave) continue;

    const metadata = await readJsonOrNull(path.join(saveDir, "metadata.json")) || {};
    if (!metadata.schemaVersion || metadata.lastActivatedAt === undefined || metadata.modProfileId === undefined) {
      const migrated = {
        schemaVersion: manifestSchemaVersion,
        modProfileId: metadata.modProfileId ?? null,
        lastActivatedAt: metadata.lastActivatedAt ?? metadata.activatedAt ?? null,
        teardownVersion: metadata.teardownVersion || "not_detected",
        ...metadata,
        schemaVersion: manifestSchemaVersion
      };
      Object.assign(metadata, migrated);
      try {
        await writeJson(path.join(saveDir, "metadata.json"), metadata);
      } catch {}
    }
    saves.push({
      schemaVersion: metadata.schemaVersion,
      id,
      name: metadata.name || id,
      game: metadata.game || "Teardown",
      quicksaveFile: metadata.quicksaveFile || "quicksave.bin",
      notes: metadata.notes || "",
      mapName: metadata.mapName || "",
      mapType: metadata.mapType || "unknown",
      requiredMapHint: metadata.requiredMapHint || "",
      teardownVersion: metadata.teardownVersion || "not_detected",
      thumbnail: metadata.thumbnail || "",
      hasCustomPreview: Boolean(metadata.thumbnail),
      favorite: Boolean(metadata.favorite),
      loadOperationsSinceBackup: operationCount(metadata.loadOperationsSinceBackup),
      updateOperationsSinceBackup: operationCount(metadata.updateOperationsSinceBackup),
      createdAt: metadata.createdAt || quicksave.birthtime.toISOString(),
      updatedAt: metadata.updatedAt || quicksave.mtime.toISOString(),
      activatedAt: metadata.activatedAt || null,
      lastActivatedAt: metadata.lastActivatedAt || metadata.activatedAt || null,
      modProfileId: metadata.modProfileId || null,
      requiredMods: metadata.requiredMods || null,
      saveDir,
      quicksavePath,
      size: quicksave.size,
      modifiedAt: quicksave.mtime.toISOString()
    });
  }

  saves.sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt) - new Date(a.updatedAt));
  return saves;
}

async function createSave(body) {
  await ensureDirs();
  await getSettings();
  const active = await statOrNull(activeSavePath);
  if (!active) {
    const error = new Error("No active Teardown quicksave.bin was found at:\n" + activeSavePath);
    error.status = 409;
    throw error;
  }

  const bodyMetadata = metadataFromBody(body);
  const name = bodyMetadata.name || `Quicksave ${timestamp()}`;
  const id = await uniqueSaveId(name);
  const saveDir = path.join(savesDir, id);
  const now = new Date().toISOString();

  await safeFsOp(() => fs.mkdir(saveDir, { recursive: true }), "Could not create scenario folder");
  await safeFsOp(() => fs.copyFile(activeSavePath, path.join(saveDir, "quicksave.bin")), "Could not copy active quicksave into the scenario folder");
  await writeJson(path.join(saveDir, "metadata.json"), {
    schemaVersion: manifestSchemaVersion,
    id,
    name,
    game: "Teardown",
    quicksaveFile: "quicksave.bin",
    notes: bodyMetadata.notes,
    mapName: bodyMetadata.mapName,
    mapType: bodyMetadata.mapType,
    requiredMapHint: bodyMetadata.requiredMapHint,
    teardownVersion: bodyMetadata.teardownVersion || "not_detected",
    thumbnail: bodyMetadata.thumbnail,
    favorite: bodyMetadata.favorite,
    createdAt: now,
    updatedAt: now,
    lastActivatedAt: null,
    modProfileId: null,
    source: activeSavePath,
    size: active.size
  });
  log("info", "scenario.created", { id, name, mapType: bodyMetadata.mapType, size: active.size });

  let requiredMods = null;
  let requiredModsWarning = "";
  try {
    requiredMods = (await captureRequiredMods(id, body.modlistId)).requiredMods;
  } catch (error) {
    requiredModsWarning = error.message;
    log("warn", "scenario.mods-capture-failed", { id, message: error.message });
  }

  return { id, requiredMods, requiredModsWarning };
}

async function updateSave(id, body) {
  const saveDir = resolveSaveDir(id);
  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath);
  if (!metadata) {
    const error = new Error("Save not found.");
    error.status = 404;
    throw error;
  }

  const bodyMetadata = metadataFromBody(body, metadata);
  metadata.name = bodyMetadata.name || id;
  metadata.game = metadata.game || "Teardown";
  metadata.quicksaveFile = metadata.quicksaveFile || "quicksave.bin";
  metadata.notes = bodyMetadata.notes;
  metadata.mapName = bodyMetadata.mapName;
  metadata.mapType = bodyMetadata.mapType;
  metadata.requiredMapHint = bodyMetadata.requiredMapHint;
  metadata.teardownVersion = bodyMetadata.teardownVersion;
  metadata.thumbnail = bodyMetadata.thumbnail;
  metadata.favorite = bodyMetadata.favorite;
  metadata.updatedAt = new Date().toISOString();
  await writeJson(metadataPath, metadata);
  return { id };
}

async function setFavorite(id, favorite) {
  const saveDir = resolveSaveDir(id);
  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath);
  if (!metadata) {
    const error = new Error("Save not found.");
    error.status = 404;
    throw error;
  }

  metadata.favorite = Boolean(favorite);
  await writeJson(metadataPath, metadata);
  return { id, favorite: metadata.favorite };
}

async function updateSaveFile(id) {
  await ensureDirs();
  const settings = await getSettings();
  const active = await statOrNull(activeSavePath);
  if (!active) {
    const error = new Error("No active Teardown quicksave.bin was found.");
    error.status = 409;
    throw error;
  }

  const saveDir = resolveSaveDir(id);
  const source = path.join(saveDir, "quicksave.bin");
  const sourceStat = await statOrNull(source);
  if (!sourceStat) {
    const error = new Error("Selected save has no quicksave.bin.");
    error.status = 404;
    throw error;
  }

  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath) || { id, name: id };
  const currentCount = operationCount(metadata.updateOperationsSinceBackup);
  const shouldBackup = shouldCreateAutomaticBackup(
    settings.backupBeforeUpdate,
    settings.updateBackupEvery,
    currentCount
  );
  let backupPath = null;
  let backupId = null;
  if (shouldBackup) {
    const backup = await backupStoredQuicksave(saveDir, `before-update-${safeId(id)}`, {
      scenarioId: id,
      scenarioName: metadata.name || id
    });
    backupPath = backup.backupPath;
    backupId = backup.backupId;
    metadata.previousStoredQuicksaveBackup = backupPath;
    metadata.previousStoredQuicksaveBackupId = backupId;
    metadata.updateOperationsSinceBackup = 0;
  } else {
    metadata.updateOperationsSinceBackup = currentCount + 1;
  }

  await safeFsOp(() => fs.copyFile(activeSavePath, source), "Could not copy the active quicksave into this scenario");
  log("info", "scenario.updated-from-active", { id, backupId: backupId || "", policy: settings.backupBeforeUpdate });

  metadata.game = metadata.game || "Teardown";
  metadata.quicksaveFile = metadata.quicksaveFile || "quicksave.bin";
  metadata.quicksaveUpdatedAt = new Date().toISOString();
  metadata.updatedAt = metadata.quicksaveUpdatedAt;
  metadata.source = activeSavePath;
  metadata.size = active.size;
  await writeJson(metadataPath, metadata);

  let requiredMods = null;
  let requiredModsWarning = "";
  try {
    requiredMods = (await captureRequiredMods(id)).requiredMods;
  } catch (error) {
    requiredModsWarning = error.message;
  }

  return {
    id,
    backupPath,
    backupSkipped: !backupPath,
    backupPolicy: settings.backupBeforeUpdate,
    operationsSinceBackup: metadata.updateOperationsSinceBackup,
    size: active.size,
    modifiedAt: active.mtime.toISOString(),
    requiredMods,
    requiredModsWarning
  };
}

function backupFolderName(reason, scenarioId) {
  const reasonSlug = safeId(reason) || "manual";
  const suffix = scenarioId ? `_${safeId(scenarioId)}` : "";
  return `backup_${timestamp()}_${reasonSlug}${suffix}`;
}

async function uniqueBackupFolder(reason, scenarioId) {
  const base = backupFolderName(reason, scenarioId);
  let name = base;
  let index = 2;
  while (await statOrNull(path.join(backupsDir, name))) {
    name = `${base}-${index}`;
    index += 1;
  }
  return name;
}

async function sha256OfFile(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fsSync.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function createBackupFolder({ sourcePath, reason, scenarioId, scenarioName, sourceKind, requireSource = true }) {
  await ensureDirs();
  const stat = await statOrNull(sourcePath);
  if (!stat) {
    if (!requireSource) return null;
    const error = new Error(`Nothing to back up. The source file does not exist:\n${sourcePath}`);
    error.status = 409;
    throw error;
  }

  const name = await uniqueBackupFolder(reason, scenarioId);
  const folder = path.join(backupsDir, name);
  await fs.mkdir(folder, { recursive: true });
  const quicksaveTarget = path.join(folder, "quicksave.bin");
  await safeFsOp(() => fs.copyFile(sourcePath, quicksaveTarget), "Could not copy quicksave for backup");

  let hash = "";
  try {
    hash = await sha256OfFile(quicksaveTarget);
  } catch {}

  const metadata = {
    schemaVersion: 1,
    id: name,
    createdAt: new Date().toISOString(),
    reason: reason || "manual",
    sourceKind: sourceKind || "active",
    sourcePath,
    scenarioId: scenarioId || "",
    scenarioName: scenarioName || "",
    size: stat.size,
    sourceModifiedAt: stat.mtime.toISOString(),
    quicksaveHash: hash
  };

  await writeJson(path.join(folder, "backup.json"), metadata);
  log("info", "backup.created", {
    id: name,
    reason: metadata.reason,
    sourceKind: metadata.sourceKind,
    scenarioId: metadata.scenarioId,
    size: metadata.size
  });
  return { folder, name, metadata };
}

async function backupActiveQuicksave(label = "manual", options = {}) {
  await ensureDirs();
  const result = await createBackupFolder({
    sourcePath: activeSavePath,
    reason: label,
    scenarioId: options.scenarioId || "",
    scenarioName: options.scenarioName || "",
    sourceKind: "active"
  });
  return {
    backupId: result.name,
    backupPath: result.folder,
    quicksavePath: path.join(result.folder, "quicksave.bin"),
    size: result.metadata.size,
    modifiedAt: result.metadata.sourceModifiedAt
  };
}

async function backupStoredQuicksave(saveDir, label, options = {}) {
  await ensureDirs();
  const source = path.join(saveDir, "quicksave.bin");
  const result = await createBackupFolder({
    sourcePath: source,
    reason: label,
    scenarioId: options.scenarioId || "",
    scenarioName: options.scenarioName || "",
    sourceKind: "stored"
  });
  return {
    backupId: result.name,
    backupPath: result.folder,
    quicksavePath: path.join(result.folder, "quicksave.bin")
  };
}

function isBackupFolderName(name) {
  return /^backup_\d{4}-\d{2}-\d{2}-\d{6}_/.test(name);
}

function legacyBackupReasonFromFilename(name) {
  if (/^stored-/.test(name)) return "before-update";
  if (/^quicksave-before-/.test(name)) return "before-load";
  return "manual";
}

async function listBackups() {
  await ensureDirs();
  const entries = await fs.readdir(backupsDir, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    const fullPath = path.join(backupsDir, entry.name);
    if (entry.isDirectory()) {
      const metadata = await readJsonOrNull(path.join(fullPath, "backup.json")) || {};
      const quicksave = await statOrNull(path.join(fullPath, "quicksave.bin"));
      if (!quicksave) continue;
      backups.push({
        id: entry.name,
        kind: "folder",
        path: fullPath,
        quicksavePath: path.join(fullPath, "quicksave.bin"),
        createdAt: metadata.createdAt || quicksave.birthtime.toISOString(),
        reason: metadata.reason || "manual",
        sourceKind: metadata.sourceKind || "active",
        sourcePath: metadata.sourcePath || "",
        scenarioId: metadata.scenarioId || "",
        scenarioName: metadata.scenarioName || "",
        size: quicksave.size,
        quicksaveHash: metadata.quicksaveHash || "",
        legacy: false
      });
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".bin")) {
      const stat = await statOrNull(fullPath);
      if (!stat) continue;
      backups.push({
        id: entry.name,
        kind: "file",
        path: fullPath,
        quicksavePath: fullPath,
        createdAt: stat.birthtime.toISOString(),
        reason: legacyBackupReasonFromFilename(entry.name),
        sourceKind: entry.name.startsWith("stored-") ? "stored" : "active",
        sourcePath: "",
        scenarioId: "",
        scenarioName: "",
        size: stat.size,
        quicksaveHash: "",
        legacy: true
      });
    }
  }
  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return backups;
}

function resolveBackupPath(backupId) {
  const clean = String(backupId || "").trim();
  if (!clean) throw Object.assign(new Error("Backup id is required."), { status: 400 });
  if (clean.includes("..") || clean.includes("/") || clean.includes("\\")) {
    throw Object.assign(new Error("Invalid backup id."), { status: 400 });
  }
  const resolved = path.resolve(backupsDir, clean);
  const root = path.resolve(backupsDir);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    throw Object.assign(new Error("Invalid backup path."), { status: 400 });
  }
  return resolved;
}

async function describeBackup(backupId) {
  const resolved = resolveBackupPath(backupId);
  const stat = await statOrNull(resolved);
  if (!stat) throw Object.assign(new Error("Backup not found."), { status: 404 });
  if (stat.isDirectory()) {
    const metadata = await readJsonOrNull(path.join(resolved, "backup.json")) || {};
    const quicksavePath = path.join(resolved, "quicksave.bin");
    const quicksaveStat = await statOrNull(quicksavePath);
    if (!quicksaveStat) throw Object.assign(new Error("Backup folder is missing quicksave.bin."), { status: 409 });
    return {
      id: backupId,
      kind: "folder",
      path: resolved,
      quicksavePath,
      size: quicksaveStat.size,
      metadata
    };
  }
  return {
    id: backupId,
    kind: "file",
    path: resolved,
    quicksavePath: resolved,
    size: stat.size,
    metadata: {}
  };
}

async function restoreBackup(backupId, options = {}) {
  await ensureDirs();
  const backup = await describeBackup(backupId);
  const active = await statOrNull(activeSavePath);

  let safetyBackup = null;
  if (active && options.createSafetyBackup !== false) {
    safetyBackup = await backupActiveQuicksave(`before-restore-${safeId(backupId).slice(0, 32) || "backup"}`, {
      scenarioId: "",
      scenarioName: "Safety backup before restore"
    });
  }

  await fs.mkdir(path.dirname(activeSavePath), { recursive: true });
  await safeFsOp(() => fs.copyFile(backup.quicksavePath, activeSavePath), "Could not restore the backup into the active quicksave slot");
  log("info", "backup.restored", { id: backupId, kind: backup.kind, safetyBackupId: safetyBackup?.backupId || "" });

  return {
    id: backupId,
    restoredFrom: backup.quicksavePath,
    activeSavePath,
    safetyBackupId: safetyBackup?.backupId || null,
    safetyBackupPath: safetyBackup?.backupPath || null
  };
}

async function deleteBackup(backupId) {
  const resolved = resolveBackupPath(backupId);
  const stat = await statOrNull(resolved);
  if (!stat) throw Object.assign(new Error("Backup not found."), { status: 404 });
  await safeFsOp(() => fs.rm(resolved, { recursive: true, force: true }), "Could not delete the backup");
  log("info", "backup.deleted", { id: backupId });
  return { id: backupId };
}

async function activateSave(id) {
  await ensureDirs();
  const settings = await getSettings();
  const saveDir = resolveSaveDir(id);
  const source = path.join(saveDir, "quicksave.bin");
  const sourceStat = await statOrNull(source);
  if (!sourceStat) {
    const error = new Error("Selected save has no quicksave.bin.");
    error.status = 404;
    throw error;
  }

  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath) || { id, name: id };
  const active = await statOrNull(activeSavePath);
  let backupPath = null;
  let backupSkipped = false;
  let backupId = null;
  if (active) {
    const currentCount = operationCount(metadata.loadOperationsSinceBackup);
    const shouldBackup = shouldCreateAutomaticBackup(
      settings.backupBeforeLoad,
      settings.loadBackupEvery,
      currentCount
    );
    if (shouldBackup) {
      const backup = await backupActiveQuicksave(`before-load-${safeId(id)}`, {
        scenarioId: id,
        scenarioName: metadata.name || id
      });
      backupPath = backup.backupPath;
      backupId = backup.backupId;
      metadata.previousActiveQuicksaveBackup = backupPath;
      metadata.previousActiveQuicksaveBackupId = backupId;
      metadata.loadOperationsSinceBackup = 0;
    } else {
      backupSkipped = true;
      metadata.loadOperationsSinceBackup = currentCount + 1;
    }
  }

  await safeFsOp(() => fs.mkdir(path.dirname(activeSavePath), { recursive: true }), "Could not prepare the Teardown quicksave folder");
  await safeFsOp(() => fs.copyFile(source, activeSavePath), "Could not write the scenario into Teardown's quicksave slot");

  metadata.activatedAt = new Date().toISOString();
  metadata.lastActivatedAt = metadata.activatedAt;
  metadata.updatedAt = metadata.updatedAt || metadata.activatedAt;
  await writeJson(metadataPath, metadata);
  log("info", "scenario.activated", { id, backupId: backupId || "", policy: settings.backupBeforeLoad });

  return {
    id,
    backupPath,
    backupId,
    backupSkipped,
    backupPolicy: settings.backupBeforeLoad,
    operationsSinceBackup: operationCount(metadata.loadOperationsSinceBackup)
  };
}

async function deleteSave(id) {
  await ensureDirs();
  const saveDir = resolveSaveDir(id);
  const exists = await statOrNull(saveDir);
  if (!exists) {
    const error = new Error("Save not found.");
    error.status = 404;
    throw error;
  }

  const target = path.join(deletedDir, `${safeId(id)}-${timestamp()}`);
  await fs.rename(saveDir, target);
  return { id, movedTo: target };
}

function openPath(targetPath) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
    execFile(command, [targetPath], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function openExternal(targetUrl) {
  return new Promise((resolve, reject) => {
    if (process.platform === "win32") {
      execFile("cmd.exe", ["/c", "start", "", targetUrl], (error) => {
        if (error) reject(error);
        else resolve();
      });
      return;
    }

    const command = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(command, [targetUrl], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function revealTarget(target) {
  await ensureDirs();
  const targets = {
    active: path.dirname(activeSavePath),
    manager: managerRoot,
    saves: savesDir,
    backups: backupsDir,
    deleted: deletedDir
  };

  const targetPath = targets[target];
  if (!targetPath) {
    const error = new Error("Unknown path target.");
    error.status = 400;
    throw error;
  }

  await openPath(targetPath);
  return { opened: targetPath };
}

async function revealSave(id) {
  const saveDir = resolveSaveDir(id);
  const exists = await statOrNull(saveDir);
  if (!exists) {
    const error = new Error("Save not found.");
    error.status = 404;
    throw error;
  }

  await openPath(saveDir);
  return { opened: saveDir };
}

async function launchTeardown() {
  await openExternal(teardownSteamUrl);
  return { launched: teardownSteamUrl };
}

async function loadSave(id) {
  const activation = await activateSave(id);
  const launch = await launchTeardown();
  return {
    ...activation,
    ...launch
  };
}

function packageFileName(name) {
  const slug = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "scenario";
  return `${slug}${packageExtension}`;
}

async function uniquePackagePath(baseDir, fileName) {
  let candidate = path.join(baseDir, fileName);
  if (!(await statOrNull(candidate))) return candidate;
  const ext = path.extname(fileName);
  const stem = fileName.slice(0, -ext.length);
  for (let index = 2; index < 999; index += 1) {
    candidate = path.join(baseDir, `${stem}-${index}${ext}`);
    if (!(await statOrNull(candidate))) return candidate;
  }
  return path.join(baseDir, `${stem}-${Date.now()}${ext}`);
}

async function exportSave(id, options = {}) {
  await ensureDirs();
  const saveDir = resolveSaveDir(id);
  const metadataPath = path.join(saveDir, "metadata.json");
  const metadata = await readJsonOrNull(metadataPath);
  if (!metadata) throw Object.assign(new Error("Scenario not found."), { status: 404 });
  const quicksavePath = path.join(saveDir, "quicksave.bin");
  const quicksaveStat = await statOrNull(quicksavePath);
  if (!quicksaveStat) throw Object.assign(new Error("Scenario has no quicksave.bin to export."), { status: 409 });
  if (quicksaveStat.size === 0) throw Object.assign(new Error("Scenario quicksave.bin is empty."), { status: 409 });
  if (quicksaveStat.size > maxPackageBytes) {
    throw Object.assign(new Error("Quicksave is too large to package (over 2 GB)."), { status: 413 });
  }

  const quicksaveBuffer = await fs.readFile(quicksavePath);
  const quicksaveHash = crypto.createHash("sha256").update(quicksaveBuffer).digest("hex");

  const exportedAt = new Date().toISOString();
  const packageManifest = {
    schemaVersion: packageSchemaVersion,
    package: {
      format: "tdqscenario",
      version: packageSchemaVersion,
      exportedAt,
      tool: "Teardown Quicksave Manager"
    },
    id,
    title: metadata.name || id,
    name: metadata.name || id,
    notes: metadata.notes || "",
    mapName: metadata.mapName || "",
    mapType: metadata.mapType || "unknown",
    requiredMapHint: metadata.requiredMapHint || "",
    teardownVersion: metadata.teardownVersion || "not_detected",
    favorite: Boolean(metadata.favorite),
    createdAt: metadata.createdAt || null,
    updatedAt: metadata.updatedAt || null,
    lastActivatedAt: metadata.lastActivatedAt || metadata.activatedAt || null,
    fileSizeBytes: quicksaveStat.size,
    quicksaveHash,
    requiredMods: metadata.requiredMods || null
  };

  const entries = [
    ["manifest.json", Buffer.from(JSON.stringify(packageManifest, null, 2), "utf8")],
    ["quicksave.bin", quicksaveBuffer]
  ];

  if (metadata.previewFile) {
    const previewSrc = path.join(saveDir, metadata.previewFile);
    const previewStat = await statOrNull(previewSrc);
    if (previewStat) {
      const previewBuffer = await fs.readFile(previewSrc);
      const ext = path.extname(metadata.previewFile).toLowerCase() || ".png";
      entries.push([`preview${ext}`, previewBuffer]);
    }
  }

  const zip = buildZip(entries);
  const destinationDir = options.destinationDir && path.isAbsolute(options.destinationDir) ? options.destinationDir : packagesDir;
  await safeFsOp(() => fs.mkdir(destinationDir, { recursive: true }), "Could not prepare the package destination folder");
  const destPath = options.destinationPath && path.isAbsolute(options.destinationPath)
    ? options.destinationPath
    : await uniquePackagePath(destinationDir, packageFileName(metadata.name || id));
  await safeFsOp(() => fs.writeFile(destPath, zip), "Could not write the package file");

  log("info", "scenario.exported", { id, packagePath: destPath, size: zip.length, quicksaveHash });

  return {
    id,
    packagePath: destPath,
    size: zip.length,
    quicksaveHash,
    quicksaveSize: quicksaveStat.size,
    manifest: packageManifest
  };
}

function validateImportedManifest(manifest, quicksaveSize) {
  if (!manifest || typeof manifest !== "object") {
    throw Object.assign(new Error("Package manifest is missing or invalid JSON."), { status: 400 });
  }
  if (typeof manifest.schemaVersion !== "number") {
    throw Object.assign(new Error("Package manifest is missing schemaVersion."), { status: 400 });
  }
  if (manifest.schemaVersion > packageSchemaVersion) {
    throw Object.assign(
      new Error(`Package was created with a newer format (schemaVersion ${manifest.schemaVersion}). Update the manager and try again.`),
      { status: 400 }
    );
  }
  const title = String(manifest.title || manifest.name || "").trim();
  if (!title) {
    throw Object.assign(new Error("Package manifest has no title."), { status: 400 });
  }
  if (manifest.fileSizeBytes !== undefined && Number(manifest.fileSizeBytes) !== quicksaveSize) {
    throw Object.assign(
      new Error(`Quicksave size mismatch (manifest says ${manifest.fileSizeBytes}, payload is ${quicksaveSize}).`),
      { status: 400 }
    );
  }
}

function detectImagePreviewName(entryName, buffer) {
  const ext = path.extname(entryName || "").toLowerCase();
  if (previewExtensions.has(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return ".jpg";
  if (buffer.length >= 12 && buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP") return ".webp";
  return "";
}

async function importPackageFromPath(sourcePath) {
  await ensureDirs();
  const clean = String(sourcePath || "").trim();
  if (!clean) throw Object.assign(new Error("Package path is required."), { status: 400 });
  if (!path.isAbsolute(clean)) throw Object.assign(new Error("Package path must be absolute."), { status: 400 });
  const stat = await statOrNull(clean);
  if (!stat || !stat.isFile()) {
    throw Object.assign(new Error(`Package file not found:\n${clean}`), { status: 404 });
  }
  if (stat.size > maxPackageBytes) {
    throw Object.assign(new Error("Package file is unusually large (over 2 GB)."), { status: 413 });
  }
  if (path.extname(clean).toLowerCase() !== packageExtension) {
    log("warn", "package.unexpected-extension", { sourcePath: clean });
  }

  const buffer = await fs.readFile(clean);

  let entries;
  try {
    entries = readZip(buffer);
  } catch (error) {
    throw Object.assign(new Error(`Package is not a valid .tdqscenario file: ${error.message}`), { status: 400 });
  }

  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (!manifestEntry) throw Object.assign(new Error("Package is missing manifest.json."), { status: 400 });
  const quicksaveEntry = entries.find((entry) => entry.name === "quicksave.bin");
  if (!quicksaveEntry) throw Object.assign(new Error("Package is missing quicksave.bin."), { status: 400 });
  if (quicksaveEntry.data.length === 0) {
    throw Object.assign(new Error("Package quicksave.bin is empty."), { status: 400 });
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch (error) {
    throw Object.assign(new Error(`Package manifest is not valid JSON: ${error.message}`), { status: 400 });
  }

  validateImportedManifest(manifest, quicksaveEntry.data.length);

  if (manifest.quicksaveHash) {
    const actualHash = crypto.createHash("sha256").update(quicksaveEntry.data).digest("hex");
    if (actualHash !== manifest.quicksaveHash) {
      throw Object.assign(
        new Error("Package quicksave failed hash verification. The file may be corrupted."),
        { status: 400 }
      );
    }
  }

  const previewEntry = entries.find((entry) => /^preview\.(png|jpe?g|webp)$/i.test(entry.name));
  const title = String(manifest.title || manifest.name || "Imported scenario").trim();
  const baseId = safeId(manifest.id || title) || "imported-scenario";
  const id = await uniqueSaveId(baseId);
  const saveDir = path.join(savesDir, id);
  await safeFsOp(() => fs.mkdir(saveDir, { recursive: true }), "Could not create scenario folder during import");
  await safeFsOp(() => fs.writeFile(path.join(saveDir, "quicksave.bin"), quicksaveEntry.data), "Could not write imported quicksave");

  let previewFile = "";
  if (previewEntry) {
    const ext = detectImagePreviewName(previewEntry.name, previewEntry.data) || ".png";
    previewFile = `preview${ext}`;
    await safeFsOp(() => fs.writeFile(path.join(saveDir, previewFile), previewEntry.data), "Could not write imported preview");
  }

  const now = new Date().toISOString();
  const metadata = {
    schemaVersion: manifestSchemaVersion,
    id,
    name: title,
    game: "Teardown",
    quicksaveFile: "quicksave.bin",
    notes: String(manifest.notes || ""),
    mapName: String(manifest.mapName || ""),
    mapType: String(manifest.mapType || "unknown"),
    requiredMapHint: String(manifest.requiredMapHint || ""),
    teardownVersion: String(manifest.teardownVersion || "not_detected"),
    thumbnail: previewFile ? `/api/saves/${encodeURIComponent(id)}/preview?v=${Date.now()}` : "",
    previewFile: previewFile || undefined,
    previewUpdatedAt: previewFile ? now : undefined,
    favorite: Boolean(manifest.favorite),
    createdAt: manifest.createdAt || now,
    updatedAt: now,
    lastActivatedAt: null,
    modProfileId: null,
    importedAt: now,
    importedFrom: clean,
    importedPackageSize: stat.size,
    source: clean,
    size: quicksaveEntry.data.length,
    requiredMods: manifest.requiredMods || null
  };
  await writeJson(path.join(saveDir, "metadata.json"), metadata);
  log("info", "scenario.imported", { id, title, fromPath: clean, size: quicksaveEntry.data.length });

  return {
    id,
    name: title,
    saveDir,
    importedFrom: clean,
    size: quicksaveEntry.data.length,
    manifest
  };
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, await getStatus());
    }

    if (req.method === "GET" && url.pathname === "/api/saves") {
      return json(res, 200, { saves: await listSaves() });
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      return json(res, 200, await getSettings());
    }

    if (req.method === "GET" && url.pathname === "/api/mods") {
      return json(res, 200, await getModInventory());
    }

    if (req.method === "PATCH" && url.pathname === "/api/settings") {
      return json(res, 200, await updateSettings(await readBody(req)));
    }

    if (req.method === "POST" && url.pathname === "/api/saves") {
      const body = await readBody(req);
      return json(res, 201, await createSave(body));
    }

    if (req.method === "POST" && url.pathname === "/api/reveal") {
      const body = await readBody(req);
      return json(res, 200, await revealTarget(body.target));
    }

    if (req.method === "POST" && url.pathname === "/api/backup-active") {
      const body = await readBody(req);
      return json(res, 200, await backupActiveQuicksave(body.label || "manual"));
    }

    if (req.method === "GET" && url.pathname === "/api/backups") {
      return json(res, 200, { backups: await listBackups() });
    }

    if (req.method === "POST" && url.pathname === "/api/launch-teardown") {
      return json(res, 200, await launchTeardown());
    }

    if (req.method === "GET" && url.pathname === "/api/logs") {
      const lines = Number.parseInt(url.searchParams.get("lines") || "200", 10);
      return json(res, 200, { lines: await readLogTail(Number.isFinite(lines) ? lines : 200), path: logPath });
    }

    if (req.method === "POST" && url.pathname === "/api/saves/import") {
      const body = await readBody(req);
      return json(res, 200, await importPackageFromPath(body.sourcePath));
    }

    if (req.method === "GET" && url.pathname === "/api/mod-profiles") {
      return json(res, 200, { profiles: await listModProfiles() });
    }

    if (req.method === "POST" && url.pathname === "/api/mod-profiles") {
      const body = await readBody(req);
      return json(res, 201, await createModProfile(body));
    }

    const modProfileMatch = url.pathname.match(/^\/api\/mod-profiles\/([^/]+)(?:\/([^/]+))?$/);
    if (modProfileMatch) {
      const profileId = decodeURIComponent(modProfileMatch[1]);
      const action = modProfileMatch[2] || "";

      if (req.method === "GET" && !action) {
        return json(res, 200, await readModProfile(profileId));
      }

      if (req.method === "PATCH" && !action) {
        return json(res, 200, await updateModProfile(profileId, await readBody(req)));
      }

      if (req.method === "POST" && action === "recapture") {
        const body = await readBody(req);
        return json(res, 200, await recaptureModProfile(profileId, body.modlistId));
      }

      if (req.method === "DELETE" && !action) {
        return json(res, 200, await deleteModProfile(profileId));
      }
    }

    const backupMatch = url.pathname.match(/^\/api\/backups\/([^/]+)(?:\/([^/]+))?$/);
    if (backupMatch) {
      const id = decodeURIComponent(backupMatch[1]);
      const action = backupMatch[2] || "";

      if (req.method === "POST" && action === "restore") {
        const body = await readBody(req);
        return json(res, 200, await restoreBackup(id, body));
      }

      if (req.method === "DELETE" && !action) {
        return json(res, 200, await deleteBackup(id));
      }
    }

    const match = url.pathname.match(/^\/api\/saves\/([^/]+)(?:\/([^/]+))?$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const action = match[2] || "";

      if (req.method === "PATCH" && !action) {
        return json(res, 200, await updateSave(id, await readBody(req)));
      }

      if (req.method === "POST" && action === "update-file") {
        return json(res, 200, await updateSaveFile(id));
      }

      if (req.method === "POST" && action === "activate") {
        return json(res, 200, await activateSave(id));
      }

      if (req.method === "POST" && action === "load") {
        return json(res, 200, await loadSave(id));
      }

      if (req.method === "POST" && action === "favorite") {
        const body = await readBody(req);
        return json(res, 200, await setFavorite(id, body.favorite));
      }

      if (req.method === "POST" && action === "mods") {
        const body = await readBody(req);
        return json(res, 200, await captureRequiredMods(id, body.modlistId));
      }

      if (req.method === "POST" && action === "link-profile") {
        const body = await readBody(req);
        return json(res, 200, await linkScenarioToProfile(id, body.modProfileId || ""));
      }

      if (req.method === "GET" && action === "preview") {
        return serveSavePreview(id, res);
      }

      if (req.method === "POST" && action === "preview-path") {
        const body = await readBody(req);
        return json(res, 200, await setSavePreviewFromPath(id, body.sourcePath));
      }

      if (req.method === "POST" && action === "preview-data") {
        return json(res, 200, await setSavePreviewFromData(id, await readBody(req)));
      }

      if (req.method === "POST" && action === "reveal") {
        return json(res, 200, await revealSave(id));
      }

      if (req.method === "POST" && action === "export") {
        const body = await readBody(req);
        return json(res, 200, await exportSave(id, body));
      }

      if (req.method === "DELETE" && !action) {
        return json(res, 200, await deleteSave(id));
      }
    }

    return notFound(res);
  } catch (rawError) {
    const error = friendlyError(rawError);
    const status = error.status || 500;
    log("warn", "api.error", {
      method: req.method,
      path: url.pathname,
      status,
      message: error.message,
      code: rawError?.code || rawError?.cause?.code || ""
    });
    return json(res, status, { error: error.message || "Unexpected error" });
  }
}

async function serveStatic(req, res, url) {
  let requested = decodeURIComponent(url.pathname);
  if (requested === "/") requested = "/index.html";

  const filePath = path.resolve(PUBLIC_DIR, "." + requested);
  const publicRoot = path.resolve(PUBLIC_DIR);
  if (filePath !== publicRoot && !filePath.startsWith(publicRoot + path.sep)) {
    return notFound(res);
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Content-Length": content.length
    });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return notFound(res);
    json(res, 500, { error: error.message });
  }
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  });
}

async function startServer(options = {}) {
  const port = options.port === undefined ? PORT : Number(options.port);
  const host = options.host || HOST;
  const server = createServer();
  await ensureDirs();
  await resolveActiveSavePath(await readJsonOrNull(configPath) || defaultSettings);
  log("info", "server.starting", { host, requestedPort: port, activeSavePath, activeSavePathExists, setupRequired });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const resolvedPort = server.address().port;
  log("info", "server.started", { port: resolvedPort });

  return {
    server,
    port: resolvedPort,
    host,
    url: `http://${host}:${resolvedPort}`
  };
}

if (require.main === module) {
  startServer()
    .then(({ url }) => {
      console.log(`Teardown Quicksave Manager running at ${url}`);
      console.log(`Active quicksave: ${activeSavePath}`);
      console.log(`Save library: ${savesDir}`);
      console.log(`Log file: ${logPath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  startServer,
  paths: {
    get activeSavePath() { return activeSavePath; },
    managerRoot,
    savesDir,
    backupsDir,
    deletedDir,
    packagesDir,
    logsDir,
    logPath
  }
};
