const { app, BrowserWindow, shell } = require("electron");
const { startServer, paths } = require("./server");

let appServer = null;

async function createWindow() {
  appServer = await startServer();

  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: "Teardown Quicksave Manager",
    backgroundColor: "#0b0d10",
    webPreferences: {
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
