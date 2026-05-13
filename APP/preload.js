const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("teardownWindow", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close")
});

contextBridge.exposeInMainWorld("teardownPreview", {
  pick: (defaultPath) => ipcRenderer.invoke("preview:pick", defaultPath)
});

contextBridge.exposeInMainWorld("teardownPackage", {
  pickOpen: (defaultPath) => ipcRenderer.invoke("package:pick-open", defaultPath),
  pickSave: (options) => ipcRenderer.invoke("package:pick-save", options)
});

contextBridge.exposeInMainWorld("teardownQuicksave", {
  pick: (defaultPath) => ipcRenderer.invoke("quicksave:pick", defaultPath)
});
