const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("teardownWindow", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close")
});

contextBridge.exposeInMainWorld("teardownPreview", {
  pick: (defaultPath) => ipcRenderer.invoke("preview:pick", defaultPath)
});
