const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const PORT = Number(process.env.PORT || 47831);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const documentsDir = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, "Documents")
  : path.join(os.homedir(), "Documents");

const activeSavePath = process.env.TEARDOWN_QUICKSAVE_PATH || path.join(localAppData, "Teardown", "quicksave.bin");
const teardownDataDir = path.join(localAppData, "Teardown");
const teardownModsDir = path.join(documentsDir, "Teardown", "mods");
const teardownScreenshotsDir = path.join(documentsDir, "Teardown", "screenshots");
const teardownModsRegistryPath = path.join(teardownDataDir, "mods.xml");
const teardownModlistsDir = path.join(teardownDataDir, "modlists");
const managerRoot = process.env.TEARDOWN_QSM_ROOT || path.join(documentsDir, "Teardown", "Quicksave Manager");
const savesDir = path.join(managerRoot, "saves");
const backupsDir = path.join(managerRoot, "backups");
const deletedDir = path.join(managerRoot, "deleted");
const configPath = path.join(managerRoot, "config.json");
const teardownSteamUrl = "steam://rungameid/1167630";

const defaultSettings = {
  backupBeforeLoad: "every_n",
  loadBackupEvery: 5,
  backupBeforeUpdate: "every_n",
  updateBackupEvery: 5
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

async function ensureDirs() {
  await fs.mkdir(savesDir, { recursive: true });
  await fs.mkdir(backupsDir, { recursive: true });
  await fs.mkdir(deletedDir, { recursive: true });
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

function normalizeSettings(settings = {}) {
  return {
    backupBeforeLoad: normalizeBackupMode(settings.backupBeforeLoad || defaultSettings.backupBeforeLoad),
    loadBackupEvery: normalizeBackupEvery(settings.loadBackupEvery || defaultSettings.loadBackupEvery),
    backupBeforeUpdate: normalizeBackupMode(settings.backupBeforeUpdate || defaultSettings.backupBeforeUpdate),
    updateBackupEvery: normalizeBackupEvery(settings.updateBackupEvery || defaultSettings.updateBackupEvery)
  };
}

async function getSettings() {
  await ensureDirs();
  const settings = normalizeSettings(await readJsonOrNull(configPath) || defaultSettings);
  await writeJson(configPath, settings);
  return settings;
}

async function updateSettings(body) {
  const current = await getSettings();
  const settings = normalizeSettings({ ...current, ...body });
  await writeJson(configPath, settings);
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

async function getStatus() {
  await ensureDirs();
  const active = await statOrNull(activeSavePath);
  const screenshotsDir = await findScreenshotDir();
  const teardownInstall = await detectTeardownInstall();
  return {
    activeSavePath,
    managerRoot,
    savesDir,
    backupsDir,
    deletedDir,
    screenshotsDir,
    hasActiveQuicksave: Boolean(active),
    activeQuicksave: active ? {
      size: active.size,
      modifiedAt: active.mtime.toISOString()
    } : null,
    teardownInstall
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
    saves.push({
      id,
      name: metadata.name || id,
      game: metadata.game || "Teardown",
      quicksaveFile: metadata.quicksaveFile || "quicksave.bin",
      notes: metadata.notes || "",
      mapName: metadata.mapName || "",
      mapType: metadata.mapType || "unknown",
      requiredMapHint: metadata.requiredMapHint || "",
      teardownVersion: metadata.teardownVersion || "",
      thumbnail: metadata.thumbnail || "",
      hasCustomPreview: Boolean(metadata.thumbnail),
      favorite: Boolean(metadata.favorite),
      loadOperationsSinceBackup: operationCount(metadata.loadOperationsSinceBackup),
      updateOperationsSinceBackup: operationCount(metadata.updateOperationsSinceBackup),
      createdAt: metadata.createdAt || quicksave.birthtime.toISOString(),
      updatedAt: metadata.updatedAt || quicksave.mtime.toISOString(),
      activatedAt: metadata.activatedAt || null,
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
  const active = await statOrNull(activeSavePath);
  if (!active) {
    const error = new Error("No active Teardown quicksave.bin was found.");
    error.status = 409;
    throw error;
  }

  const bodyMetadata = metadataFromBody(body);
  const name = bodyMetadata.name || `Quicksave ${timestamp()}`;
  const id = await uniqueSaveId(name);
  const saveDir = path.join(savesDir, id);
  const now = new Date().toISOString();

  await fs.mkdir(saveDir, { recursive: true });
  await fs.copyFile(activeSavePath, path.join(saveDir, "quicksave.bin"));
  await writeJson(path.join(saveDir, "metadata.json"), {
    id,
    name,
    game: "Teardown",
    quicksaveFile: "quicksave.bin",
    notes: bodyMetadata.notes,
    mapName: bodyMetadata.mapName,
    mapType: bodyMetadata.mapType,
    requiredMapHint: bodyMetadata.requiredMapHint,
    teardownVersion: bodyMetadata.teardownVersion,
    thumbnail: bodyMetadata.thumbnail,
    favorite: bodyMetadata.favorite,
    createdAt: now,
    updatedAt: now,
    source: activeSavePath,
    size: active.size
  });

  let requiredMods = null;
  let requiredModsWarning = "";
  try {
    requiredMods = (await captureRequiredMods(id, body.modlistId)).requiredMods;
  } catch (error) {
    requiredModsWarning = error.message;
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
  if (shouldBackup) {
    backupPath = path.join(backupsDir, `stored-${safeId(id)}-before-update-${timestamp()}.bin`);
    await fs.copyFile(source, backupPath);
    metadata.previousStoredQuicksaveBackup = backupPath;
    metadata.updateOperationsSinceBackup = 0;
  } else {
    metadata.updateOperationsSinceBackup = currentCount + 1;
  }

  await fs.copyFile(activeSavePath, source);

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

async function backupActiveQuicksave(label = "manual") {
  await ensureDirs();
  const active = await statOrNull(activeSavePath);
  if (!active) {
    const error = new Error("No active Teardown quicksave.bin was found to back up.");
    error.status = 409;
    throw error;
  }

  const backupPath = path.join(backupsDir, `quicksave-${safeId(label) || "manual"}-${timestamp()}.bin`);
  await fs.copyFile(activeSavePath, backupPath);
  return {
    backupPath,
    size: active.size,
    modifiedAt: active.mtime.toISOString()
  };
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
  if (active) {
    const currentCount = operationCount(metadata.loadOperationsSinceBackup);
    const shouldBackup = shouldCreateAutomaticBackup(
      settings.backupBeforeLoad,
      settings.loadBackupEvery,
      currentCount
    );
    if (shouldBackup) {
      const backup = await backupActiveQuicksave(`before-${id}`);
      backupPath = backup.backupPath;
      metadata.previousActiveQuicksaveBackup = backupPath;
      metadata.loadOperationsSinceBackup = 0;
    } else {
      backupSkipped = true;
      metadata.loadOperationsSinceBackup = currentCount + 1;
    }
  }

  await fs.mkdir(path.dirname(activeSavePath), { recursive: true });
  await fs.copyFile(source, activeSavePath);

  metadata.activatedAt = new Date().toISOString();
  metadata.updatedAt = metadata.updatedAt || metadata.activatedAt;
  await writeJson(metadataPath, metadata);

  return {
    id,
    backupPath,
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

    if (req.method === "POST" && url.pathname === "/api/launch-teardown") {
      return json(res, 200, await launchTeardown());
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

      if (req.method === "DELETE" && !action) {
        return json(res, 200, await deleteSave(id));
      }
    }

    return notFound(res);
  } catch (error) {
    const status = error.status || 500;
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
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    server,
    port: server.address().port,
    host,
    url: `http://${host}:${server.address().port}`
  };
}

if (require.main === module) {
  startServer()
    .then(({ url }) => {
      console.log(`Teardown Quicksave Manager running at ${url}`);
      console.log(`Active quicksave: ${activeSavePath}`);
      console.log(`Save library: ${savesDir}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  startServer,
  paths: {
    activeSavePath,
    managerRoot,
    savesDir,
    backupsDir,
    deletedDir
  }
};
