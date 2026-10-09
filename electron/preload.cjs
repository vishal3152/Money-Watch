const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("paisaWatch", {
  pickDatabaseFile: () => ipcRenderer.invoke("pick-database-file"),
  pickDatabaseDirectory: () => ipcRenderer.invoke("pick-database-directory")
});
