#!/usr/bin/env node
// Đóng gói app desktop cho OS đang chạy (macOS hoặc Windows) → out/ASDLC-Review-<os>-<arch>.zip (+ .sha256).
// Chạy: pnpm pack:desktop. Native module (Prisma engine) đúng nền tảng vì build trên chính OS đó; CI chạy theo ma trận.
import { execFileSync, execSync } from "node:child_process";
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const win = process.platform === "win32";
const mac = process.platform === "darwin";
if (!win && !mac) throw new Error("Chỉ hỗ trợ đóng gói trên macOS và Windows");
const arch = process.env.ARCH ?? (process.arch === "arm64" ? "arm64" : "x64");
const osName = mac ? "mac" : "win";
const sh = (cmd) => execSync(cmd, { stdio: "inherit" });
const stage = "out/stage";

rmSync("out", { recursive: true, force: true });
mkdirSync(`${stage}/apps/web`, { recursive: true });
mkdirSync(`${stage}/apps/desktop`, { recursive: true });

sh("pnpm --filter @mrd/web build");
// Server + phụ thuộc runtime (gồm tsx, prisma, Prisma Client đã generate) theo đúng cấu trúc mà ROOT_DIR mong đợi.
sh(`pnpm --config.node-linker=hoisted --filter @mrd/server deploy --prod --legacy ${stage}/apps/server`);
// deploy không mang theo Prisma Client đã generate -> generate lại ngay trong stage (engine đúng nền tảng đang build).
for (const d of ["out", "scripts"]) rmSync(`${stage}/apps/server/${d}`, { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "generate", "--schema", "prisma/schema"], { cwd: `${stage}/apps/server`, stdio: "inherit" });
cpSync("apps/web/dist", `${stage}/apps/web/dist`, { recursive: true });
cpSync("frameworks", `${stage}/frameworks`, { recursive: true });
for (const f of ["main.mjs", "updater.mjs", "preload.cjs", "icon.png"]) cpSync(`apps/desktop/${f}`, `${stage}/apps/desktop/${f}`);
writeFileSync(`${stage}/package.json`, JSON.stringify({ name: "asdlc-review", productName: "ASDLC Review", description: "AI review cho merge request", author: "ASDLC Review", version: pkg.version, main: "apps/desktop/main.mjs", type: "module" }, null, 2));
// Bỏ test khỏi gói
const prune = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) e.name === "__tests__" ? rmSync(p, { recursive: true, force: true }) : prune(p); } };
prune(`${stage}/apps/server/src`);

// Icon
let icon = "";
if (mac) {
  mkdirSync("out/icon.iconset", { recursive: true });
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync("sips", ["-z", String(s), String(s), "apps/desktop/icon.png", "--out", `out/icon.iconset/icon_${s}x${s}.png`], { stdio: "ignore" });
    execFileSync("sips", ["-z", String(s * 2), String(s * 2), "apps/desktop/icon.png", "--out", `out/icon.iconset/icon_${s}x${s}@2x.png`], { stdio: "ignore" });
  }
  execFileSync("iconutil", ["-c", "icns", "out/icon.iconset", "-o", "out/icon.icns"]);
  icon = "out/icon.icns";
} else {
  try { sh("npx --yes png-to-ico apps/desktop/icon.png > out/icon.ico"); icon = "out/icon.ico"; } catch { console.warn("Không tạo được icon .ico, dùng icon mặc định"); }
}

sh(`npx --yes @electron/packager@18 ${stage} "ASDLC Review" --platform=${mac ? "darwin" : "win32"} --arch=${arch} --electron-version=38.8.6 ${icon ? `--icon=${icon}` : ""} --out=out/app --overwrite --app-version=${pkg.version} ${mac ? "--app-bundle-id=vn.asdlc.review" : ""} --no-prune`);

const outDir = readdirSync("out/app").map((d) => path.join("out/app", d))[0];
const zip = `out/ASDLC-Review-${osName}-${arch}.zip`;
if (mac) execFileSync("ditto", ["-c", "-k", "--keepParent", path.join(outDir, "ASDLC Review.app"), zip]);
else {
  // Windows: tar.exe của runner bị crash (0xC0000005) với cây node_modules lớn -> dùng 7-Zip (có sẵn trên runner), dự phòng PowerShell.
  const abs = path.resolve(zip);
  try {
    execFileSync("7z", ["a", "-tzip", "-mx=5", "-bd", abs, path.basename(outDir)], { cwd: "out/app", stdio: "ignore" });
  } catch {
    execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${path.basename(outDir)}' -DestinationPath '${abs}' -Force`], { cwd: "out/app", stdio: "inherit" });
  }
}

const checksum = async (file) => {
  const hash = createHash("sha256");
  await new Promise((ok, err) => createReadStream(file).on("data", (d) => hash.update(d)).on("end", ok).on("error", err));
  writeFileSync(`${file}.sha256`, `${hash.digest("hex")}  ${path.basename(file)}\n`);
  console.log(`OK: ${file} (${(readFileSync(file).length / 1e6).toFixed(0)} MB)`);
};
await checksum(zip);

// Installer: macOS .dmg (kéo vào Applications), Windows .exe (Start Menu + Desktop + Gỡ cài đặt). Zip vẫn giữ cho tự cập nhật.
if (mac) {
  const dmgDir = "out/dmg";
  mkdirSync(dmgDir, { recursive: true });
  cpSync(path.join(outDir, "ASDLC Review.app"), path.join(dmgDir, "ASDLC Review.app"), { recursive: true, verbatimSymlinks: true });
  execFileSync("ln", ["-s", "/Applications", path.join(dmgDir, "Applications")]);
  const dmg = `out/ASDLC-Review-${osName}-${arch}.dmg`;
  execFileSync("hdiutil", ["create", "-volname", "ASDLC Review", "-srcfolder", dmgDir, "-ov", "-format", "UDZO", dmg], { stdio: "inherit" });
  await checksum(dmg);
} else {
  const exe = `out/ASDLC-Review-Setup-${osName}-${arch}.exe`;
  try {
    execFileSync("makensis", [`/DVERSION=${pkg.version}`, `/DSRC=${path.resolve(outDir)}`, `/DOUT=${path.resolve(exe)}`, `/DICON=${path.resolve("out/icon.ico")}`, "apps/desktop/installer.nsi"], { stdio: "inherit" });
    await checksum(exe);
  } catch (e) { console.warn("Không tạo được trình cài đặt .exe (thiếu NSIS?):", e.message); }
}
