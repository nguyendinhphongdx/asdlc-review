// Vỏ Electron mỏng: chạy server, mở cửa sổ tới server. Không chứa logic nghiệp vụ.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = process.env.PORT ?? "4319";
const url = `http://127.0.0.1:${port}`;
let server;
let win;
let tray;
let quitting = false;

function startServer() {
  server = spawn(process.execPath, ["--import", "tsx", "--env-file-if-exists=../../.env", "src/main.ts"], {
    cwd: path.join(root, "apps/server"),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", WEB_DIST: path.join(root, "apps/web/dist"), PORT: port },
    stdio: "inherit",
  });
  server.on("exit", (code) => { if (!quitting) console.error(`server thoát (${code})`); });
}

async function waitReady(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return true; } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 820, title: "ASDLC Review", webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url: u }) => { void shell.openExternal(u); return { action: "deny" }; });
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  await win.loadURL((await waitReady()) ? url : `data:text/plain,Server không khởi động được`);
}

app.whenReady().then(async () => {
  startServer();
  await createWindow();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("MR");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Mở", click: () => win.show() }, { label: "Thoát", click: () => app.quit() }]));
  tray.on("click", () => win.show());
});
app.on("activate", () => win?.show());
app.on("before-quit", () => { quitting = true; server?.kill("SIGTERM"); });
