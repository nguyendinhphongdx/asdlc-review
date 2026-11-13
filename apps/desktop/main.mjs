// Vỏ Electron mỏng: chạy server, mở cửa sổ tới server. Không chứa logic nghiệp vụ.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLatest, installUpdate } from "./updater.mjs";
import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, safeStorage, shell } from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** App GUI không thừa hưởng PATH của shell: bổ sung các nơi thường cài claude/codex/git/node. */
function richPath() {
  const home = os.homedir();
  // CLI cài bằng npm thường nằm trong thư mục của trình quản lý phiên bản Node (nvm, volta, asdf…) hoặc npm global của Windows.
  const nvmDir = path.join(process.env.NVM_DIR ?? path.join(home, ".nvm"), "versions/node");
  const nvmBins = existsSync(nvmDir) ? readdirSync(nvmDir).sort().reverse().map((v) => path.join(nvmDir, v, "bin")) : [];
  const win = process.platform === "win32" ? [path.join(process.env.APPDATA ?? path.join(home, "AppData/Roaming"), "npm")] : [];
  const extra = [path.join(home, ".local/bin"), path.join(home, ".claude/local"), path.join(home, ".npm-global/bin"), ...nvmBins, path.join(home, ".volta/bin"), path.join(home, ".asdf/shims"), path.join(home, ".bun/bin"), path.join(home, "Library/pnpm"), ...win, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
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

// ---- Cập nhật: trang web gọi qua preload; kết quả kiểm tra nền được đẩy về để hiện chấm báo ở sidebar ----
let latestInfo = null;
let updating = false;
const emit = (d) => win?.webContents.send("upd:event", d);
const publicInfo = (i) => i && { current: i.current, latest: i.latest, available: i.available, canAuto: i.canAuto, page: i.page };
async function backgroundCheck() {
  try { latestInfo = await checkLatest(); if (latestInfo.available) emit({ type: "available", info: publicInfo(latestInfo) }); } catch (err) { console.error("kiểm tra cập nhật lỗi:", err.message); }
}
ipcMain.handle("upd:version", () => ({ version: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle("upd:state", () => publicInfo(latestInfo));
ipcMain.handle("upd:check", async () => { latestInfo = await checkLatest(); return publicInfo(latestInfo); });
ipcMain.handle("upd:install", async () => {
  if (updating || !latestInfo?.available) return;
  updating = true;
  try { await installUpdate(latestInfo, (p) => emit({ type: "progress", ...p }), () => app.quit()); }
  catch (err) { updating = false; emit({ type: "error", message: String(err.message ?? err) }); }
});

function startServer() {
  server = spawn(process.execPath, ["--import", "tsx", "--env-file-if-exists=../../.env", "src/main.ts"], {
    cwd: path.join(root, "apps/server"),
    env: {
      ...process.env, ELECTRON_RUN_AS_NODE: "1", WEB_DIST: path.join(root, "apps/web/dist"), PORT: port, APP_VERSION: app.getVersion(), MRD_SECRET_KEY: masterKey(), PATH: richPath(),
      // Bản đóng gói: dữ liệu để ở thư mục người dùng (không ghi vào bundle), hàng đợi lưu trong SQLite, quét MR định kỳ vì máy cá nhân khó nhận webhook.
      ...(app.isPackaged ? { DATA_DIR: path.join(app.getPath("userData"), "data"), REDIS_URL: process.env.REDIS_URL ?? "sqlite", POLL_INTERVAL_MIN: process.env.POLL_INTERVAL_MIN ?? "5" } : {}),
    },
    stdio: "inherit",
  });
  server.on("exit", (code) => { if (!quitting) console.error(`server thoát (${code})`); });
}

/** Tắt hẳn server con (Windows: cả cây tiến trình, vì SIGTERM không đảm bảo kết thúc và tiến trình còn sống sẽ giữ cổng + file của bản cũ). */
function killServer() {
  if (!server?.pid) return;
  try { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else server.kill("SIGTERM"); } catch { /* đã thoát */ }
}

/** Server của bản cũ còn sống (mồ côi sau khi cập nhật/đóng không sạch) sẽ giữ cổng và phục vụ giao diện cũ: tìm và tắt nó trước khi chạy server mới. */
async function clearStaleServer() {
  let h;
  try { h = await (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) })).json(); } catch { return; } // cổng trống
  if (!h || typeof h.version !== "string") return; // không phải server của app này, không đụng
  try {
    const pids = process.platform === "win32"
      ? [...new Set(execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true }).split(/\r?\n/).filter((l) => l.includes(`:${port} `) && /LISTENING/i.test(l)).map((l) => l.trim().split(/\s+/).pop()))]
      : execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      if (!pid || Number(pid) === process.pid) continue;
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore", windowsHide: true }); else process.kill(Number(pid), "SIGTERM");
    }
    await new Promise((r) => setTimeout(r, 1200));
  } catch (err) { console.error("không tắt được server cũ:", err.message); }
}

async function waitReady(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return true; } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 820, title: "ASDLC Review", webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(path.dirname(fileURLToPath(import.meta.url)), "preload.cjs") } });
  win.webContents.setWindowOpenHandler(({ url: u }) => { void shell.openExternal(u); return { action: "deny" }; });
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  await win.loadURL((await waitReady()) ? url : `data:text/plain,Server không khởi động được`);
}

app.setName("ASDLC Review");
// Chỉ một bản chạy cùng lúc: mở lần hai thì đưa cửa sổ đang có lên trước (tránh hai app tranh một cổng/DB).
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { win?.show(); win?.focus(); });
app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  // Chạy dev (`electron .`) thì Dock mặc định là icon Electron; bản đóng gói đã có icon riêng.
  if (process.platform === "darwin") app.dock?.setIcon(nativeImage.createFromPath(path.join(path.dirname(fileURLToPath(import.meta.url)), "icon.png")));
  await clearStaleServer();
  startServer();
  await createWindow();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("MR");
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "Mở", click: () => win.show() }, { label: `Phiên bản v${app.getVersion()}…`, click: () => { win.show(); void win.loadURL(`${url}/settings?tab=version`); } }, { label: "Thoát", click: () => app.quit() }]));
  tray.on("click", () => win.show());
  setTimeout(() => void backgroundCheck(), 15_000);
  setInterval(() => void backgroundCheck(), 6 * 3600_000);
});
app.on("activate", () => win?.show());
app.on("before-quit", () => { quitting = true; killServer(); });
