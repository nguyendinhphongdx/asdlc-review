// Cầu nối tối thiểu cho trang web: xem phiên bản, kiểm tra và cài cập nhật.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("mrdDesktop", {
  version: () => ipcRenderer.invoke("upd:version"),
  state: () => ipcRenderer.invoke("upd:state"),
  check: () => ipcRenderer.invoke("upd:check"),
  install: () => ipcRenderer.invoke("upd:install"),
  onEvent: (cb) => { const h = (_e, d) => cb(d); ipcRenderer.on("upd:event", h); return () => ipcRenderer.removeListener("upd:event", h); },
});
