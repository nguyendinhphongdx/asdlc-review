// Tự cập nhật: hỏi GitHub Releases, tải zip đúng nền tảng, kiểm tra sha256, giải nén, rồi một script tách rời
// thay app sau khi thoát và mở lại. Không cần ký số (tải bằng node nên không dính quarantine của macOS).
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, accessSync, constants } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { app, dialog, shell } from "electron";

const REPO = "nguyendinhphongdx/asdlc-review";
const win = process.platform === "win32";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const ASSET = `ASDLC-Review-${win ? "win" : "mac"}-${arch}.zip`;

const parse = (v) => String(v).replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
export function isNewer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

async function latest() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: "application/vnd.github+json", "user-agent": "asdlc-review-updater" } });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const rel = await r.json();
  const zip = rel.assets?.find((a) => a.name === ASSET);
  const sha = rel.assets?.find((a) => a.name === `${ASSET}.sha256`);
  return { version: String(rel.tag_name).replace(/^v/, ""), page: rel.html_url, zip: zip?.browser_download_url, sha: sha?.browser_download_url };
}

async function download(url, file) {
  const r = await fetch(url, { headers: { "user-agent": "asdlc-review-updater" } });
  if (!r.ok || !r.body) throw new Error(`tải lỗi ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Vị trí app đang chạy (thư mục cần thay) và khả năng ghi vào đó. */
function target() {
  const dir = win ? path.dirname(process.execPath) : path.resolve(process.execPath, "../../..");
  try { accessSync(path.dirname(dir), constants.W_OK); accessSync(dir, constants.W_OK); return dir; } catch { return null; }
}

function swapAndRelaunch(newDir, dir) {
  const pid = process.pid;
  const dataDir = path.dirname(newDir);
  if (win) {
    const exe = path.join(dir, path.basename(process.execPath));
    const script = path.join(dataDir, "swap.cmd");
    writeFileSync(script, `@echo off\r\n:w\r\ntasklist /FI "PID eq ${pid}" | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto w)\r\nrobocopy "${newDir}" "${dir}" /MIR /NFL /NDL /NJH /NJS >nul\r\nstart "" "${exe}"\r\n`);
    spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    const script = path.join(dataDir, "swap.sh");
    writeFileSync(script, `#!/bin/sh\nwhile kill -0 ${pid} 2>/dev/null; do sleep 0.5; done\nrm -rf "${dir}.old"\nif mv "${dir}" "${dir}.old" && mv "${newDir}" "${dir}"; then rm -rf "${dir}.old"; xattr -cr "${dir}" 2>/dev/null; else [ -d "${dir}.old" ] && [ ! -d "${dir}" ] && mv "${dir}.old" "${dir}"; fi\nopen "${dir}"\n`, { mode: 0o755 });
    spawn("/bin/sh", [script], { detached: true, stdio: "ignore" }).unref();
  }
}

async function install(info, dir, onQuit) {
  const work = path.join(app.getPath("userData"), "updates");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const zip = path.join(work, ASSET);
  await download(info.zip, zip);
  if (info.sha) {
    const expect = (await (await fetch(info.sha, { headers: { "user-agent": "asdlc-review-updater" } })).text()).trim().split(/\s+/)[0];
    if (expect && expect !== sha256(zip)) throw new Error("sha256 không khớp, bỏ bản tải về");
  }
  const out = path.join(work, "extracted");
  mkdirSync(out);
  if (win) execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${out}' -Force`]);
  else execFileSync("ditto", ["-x", "-k", zip, out]);
  const entry = readdirSync(out)[0];
  if (!entry) throw new Error("gói rỗng");
  swapAndRelaunch(path.join(out, entry), dir);
  onQuit();
}

let busy = false;
/** Kiểm tra bản mới. `manual` = người dùng bấm: báo cả khi đã mới nhất / lỗi. */
export async function checkForUpdates({ manual = false, win: parent, onQuit }) {
  if (busy || (!app.isPackaged && !manual)) return;
  busy = true;
  try {
    const info = await latest();
    if (!isNewer(info.version, app.getVersion())) {
      if (manual) await dialog.showMessageBox(parent, { message: `Bạn đang dùng bản mới nhất (v${app.getVersion()}).` });
      return;
    }
    const dir = target();
    if (!info.zip || !dir) {
      const r = await dialog.showMessageBox(parent, { type: "info", message: `Có bản mới v${info.version}`, detail: "Không thể tự cập nhật trên máy này. Mở trang tải?", buttons: ["Mở trang tải", "Để sau"], defaultId: 0 });
      if (r.response === 0) void shell.openExternal(info.page);
      return;
    }
    const r = await dialog.showMessageBox(parent, { type: "info", message: `Có bản mới v${info.version} (đang dùng v${app.getVersion()})`, detail: "Cập nhật ngay: app sẽ tải bản mới, khởi động lại và giữ nguyên dữ liệu.", buttons: ["Cập nhật", "Để sau"], defaultId: 0, cancelId: 1 });
    if (r.response !== 0) return;
    await install(info, dir, onQuit);
  } catch (err) {
    console.error("cập nhật lỗi:", err.message);
    if (manual) await dialog.showMessageBox(parent, { type: "error", message: "Không cập nhật được", detail: String(err.message) });
  } finally {
    busy = false;
  }
}
