const path = require("path");
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { startServer, paths } = require("./server");

let appServer = null;

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.on("window:minimize", (event) => {
  windowFromEvent(event)?.minimize();
});

ipcMain.on("window:toggle-maximize", (event) => {
  const window = windowFromEvent(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});

ipcMain.on("window:close", (event) => {
  windowFromEvent(event)?.close();
});

ipcMain.handle("preview:pick", async (event, defaultPath) => {
  const window = windowFromEvent(event);
  const result = await dialog.showOpenDialog(window, {
    title: "Choose Preview Screenshot",
    defaultPath,
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

async function createWindow() {
  appServer = await startServer({ port: 0 });

  const window = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    title: "Teardown Quicksave Manager",
    frame: false,
    backgroundColor: "#050505",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  window.removeMenu();
  await window.loadURL(appServer.url);
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (appServer) {
    appServer.server.close();
    appServer = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error(error);
      shell.openPath(paths.managerRoot);
    });
  }
});
