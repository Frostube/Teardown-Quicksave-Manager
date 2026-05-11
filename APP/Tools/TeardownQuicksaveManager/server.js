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
  ".png": "image/png"
};

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
    thumbnail: String(body.thumbnail || fallback.thumbnail || "").trim()
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
  return {
    activeSavePath,
    managerRoot,
    savesDir,
    backupsDir,
    deletedDir,
    hasActiveQuicksave: Boolean(active),
    activeQuicksave: active ? {
      size: active.size,
      modifiedAt: active.mtime.toISOString()
    } : null
  };
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
      loadOperationsSinceBackup: operationCount(metadata.loadOperationsSinceBackup),
      updateOperationsSinceBackup: operationCount(metadata.updateOperationsSinceBackup),
      createdAt: metadata.createdAt || quicksave.birthtime.toISOString(),
      updatedAt: metadata.updatedAt || quicksave.mtime.toISOString(),
      activatedAt: metadata.activatedAt || null,
      saveDir,
      quicksavePath,
      size: quicksave.size,
      modifiedAt: quicksave.mtime.toISOString()
    });
  }

  saves.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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
    createdAt: now,
    updatedAt: now,
    source: activeSavePath,
    size: active.size
  });

  return { id };
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
  metadata.updatedAt = new Date().toISOString();
  await writeJson(metadataPath, metadata);
  return { id };
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

  return {
    id,
    backupPath,
    backupSkipped: !backupPath,
    backupPolicy: settings.backupBeforeUpdate,
    operationsSinceBackup: metadata.updateOperationsSinceBackup,
    size: active.size,
    modifiedAt: active.mtime.toISOString()
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
