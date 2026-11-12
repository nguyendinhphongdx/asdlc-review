// Vỏ Electron mỏng: chạy server, mở cửa sổ tới server. Không chứa logic nghiệp vụ.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, Tray, nativeImage, safeStorage, shell } from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** App GUI không thừa hưởng PATH của shell: bổ sung các nơi thường cài claude/codex/git/node. */
function richPath() {
  const home = os.homedir();
  const extra = [path.join(home, ".local/bin"), path.join(home, ".claude/local"), path.join(home, ".npm-global/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  return [...new Set([...extra, ...(process.env.PATH ?? "").split(path.delimiter)])].filter(Boolean).join(path.delimiter);
}
const port = process.env.PORT ?? "4319";
const url = `http://127.0.0.1:${port}`;
let server;
let win;
let tray;
let quitting = false;

/** Khoá mã hoá secret trong DB: sinh một lần, cất bằng keychain hệ điều hành (safeStorage), không nằm cạnh DB. */
function masterKey() {
  if (process.env.MRD_SECRET_KEY || !safeStorage.isEncryptionAvailable()) return process.env.MRD_SECRET_KEY ?? "";
  const file = path.join(app.getPath("userData"), "secret.key.enc");
  try {
    if (existsSync(file)) return safeStorage.decryptString(readFileSync(file));
    const key = randomBytes(32).toString("hex");
    writeFileSync(file, safeStorage.encryptString(key), { mode: 0o600 });
    return key;
  } catch (err) {
    console.error("không dùng được keychain, server sẽ tự tạo khoá file:", err.message);
    return "";
  }
}

function startServer() {
  server = spawn(process.execPath, ["--import", "tsx", "--env-file-if-exists=../../.env", "src/main.ts"], {
    cwd: path.join(root, "apps/server"),
    env: {
      ...process.env, ELECTRON_RUN_AS_NODE: "1", WEB_DIST: path.join(root, "apps/web/dist"), PORT: port, MRD_SECRET_KEY: masterKey(), PATH: richPath(),
      // Bản đóng gói: dữ liệu để ở thư mục người dùng (không ghi vào bundle), hàng đợi lưu trong SQLite, quét MR định kỳ vì máy cá nhân khó nhận webhook.
      ...(app.isPackaged ? { DATA_DIR: path.join(app.getPath("userData"), "data"), REDIS_URL: process.env.REDIS_URL ?? "sqlite", POLL_INTERVAL_MIN: process.env.POLL_INTERVAL_MIN ?? "5" } : {}),
    },
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
