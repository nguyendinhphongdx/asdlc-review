import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { FrameworkEditInput } from "@mrd/contracts";
import { applyEdit, diffFrameworks, validateEdit } from "../domain/edit.js";
import { buildRubric, checkRepoConfig, parseRepoConfig } from "../domain/resolve.js";
import { FsFrameworkSource } from "../infra/fs-source.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../frameworks");
const src = new FsFrameworkSource(dir);

const toEdit = (f: Awaited<ReturnType<typeof src.load>>): FrameworkEditInput => ({
  name: f.name, severity: f.severity as FrameworkEditInput["severity"], sizeBaseline: f.sizeBaseline, grades: f.grades,
  gates: f.gates.map((g) => ({ id: g.id, reason: g.reason, capTotal: g.capTotal, when: g.when })),
  categories: f.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight, criteria: c.criteria.map((r) => ({ id: r.id, title: r.title, check: r.check, why: r.why, defaultSeverity: r.defaultSeverity, enabled: r.enabled })) })),
});

describe("framework: bản dựng sẵn", () => {
  it("mặc định + 3 mẫu (web/backend/mobile) đều hợp lệ và đủ hạng mục", async () => {
    const all = await src.list();
    assert.deepEqual(all.map((f) => f.id).sort(), ["asdlc", "backend", "mobile", "web"]);
    for (const f of all) assert.equal(validateEdit(f, toEdit(f)).length, 0, f.id);
    assert.ok(all.find((f) => f.id === "backend")!.categories.some((c) => c.criteria.some((r) => r.id === "API-01")));
  });
  it("SEC-01 và hai gate bảo mật là bắt buộc (locked) ở mọi bản", async () => {
    for (const f of await src.list()) {
      assert.ok(f.categories.flatMap((c) => c.criteria).find((r) => r.id === "SEC-01")?.locked, f.id);
      assert.ok(f.gates.find((g) => g.id === "secret-leak")?.locked && f.gates.find((g) => g.id === "critical-security")?.locked, f.id);
    }
  });
});

describe("framework: kiểm tra chỉnh sửa", () => {
  it("không tắt/hạ/xoá rule locked và không nới gate locked", async () => {
    const f = await src.load("asdlc");
    const e = toEdit(f);
    e.categories.find((c) => c.id === "security")!.criteria.find((r) => r.id === "SEC-01")!.enabled = false;
    e.gates.find((g) => g.id === "secret-leak")!.capTotal = 80;
    const errs = validateEdit(f, e);
    assert.ok(errs.some((x) => x.includes("SEC-01") && x.includes("tắt")));
    assert.ok(errs.some((x) => x.includes("secret-leak") && x.includes("nới")));
  });
  it("báo lỗi trùng mã, gate trỏ rule không có, ngưỡng xếp loại", async () => {
    const f = await src.load("asdlc");
    const e = toEdit(f);
    e.categories[0]!.criteria.push({ id: "SEC-01", title: "x", check: "y", why: "", defaultSeverity: "minor", enabled: true });
    e.gates.push({ id: "g", reason: "r", capTotal: 50, when: { ruleIds: ["NOPE-9"] } });
    e.grades = e.grades.filter((g) => g.min !== 0);
    const errs = validateEdit(f, e);
    assert.ok(errs.some((x) => x.includes("SEC-01") && x.includes("đã tồn tại")));
    assert.ok(errs.some((x) => x.includes("NOPE-9")));
    assert.ok(errs.some((x) => x.includes("bắt đầu từ 0")));
  });
  it("applyEdit giữ cờ locked do server quản, bỏ qua client; diff chỉ ra thay đổi", async () => {
    const f = await src.load("asdlc");
    const e = toEdit(f);
    e.categories.find((c) => c.id === "security")!.weight = 30;
    e.categories[0]!.criteria.push({ id: "ACM-01", title: "Idempotent", check: "kiểm tra", why: "", defaultSeverity: "critical", enabled: true });
    assert.equal(validateEdit(f, e).length, 0);
    const next = applyEdit(f, e);
    assert.ok(next.categories.flatMap((c) => c.criteria).find((r) => r.id === "SEC-01")!.locked);
    assert.ok(!next.categories.flatMap((c) => c.criteria).find((r) => r.id === "ACM-01")!.locked);
    const d = diffFrameworks(f, next);
    assert.ok(d.some((x) => x.path === "security.weight" && x.to === "30"));
    assert.ok(d.some((x) => x.path.includes("ACM-01")));
  });
  it("rule tắt không xuất hiện trong rubric dùng để review", async () => {
    const f = await src.load("asdlc");
    const e = toEdit(f);
    e.categories.find((c) => c.id === "security")!.criteria.find((r) => r.id === "SEC-02")!.enabled = false;
    const r = buildRubric(applyEdit(f, e), null);
    assert.ok(!r.categories.flatMap((c) => c.criteria).some((x) => x.id === "SEC-02"));
  });
});

describe("framework: .asdlc.yml (D3)", () => {
  it("hợp lệ: đổi trọng số, thêm rule, tắt rule thường", async () => {
    const f = await src.load("asdlc");
    const yaml = "weights: { security: 25 }\ndisable: [CON-03]\nextraRules:\n  - { id: ACM-02, category: conventions, title: Dùng logger, check: không console.log, defaultSeverity: major }\n";
    const p = parseRepoConfig(yaml);
    const { errors, changes } = checkRepoConfig(f, p.config);
    assert.deepEqual(errors, []);
    assert.equal(changes.length, 3);
    const r = buildRubric(f, p.config);
    assert.equal(r.categories.find((c) => c.id === "security")!.weight, 25);
    assert.ok(r.categories.flatMap((c) => c.criteria).some((x) => x.id === "ACM-02"));
    assert.ok(!r.categories.flatMap((c) => c.criteria).some((x) => x.id === "CON-03"));
  });
  it("độc hại: không tắt được SEC-01; id trùng, hạng mục sai bị báo và bỏ qua", async () => {
    const f = await src.load("asdlc");
    const p = parseRepoConfig("disable: [SEC-01, NOPE]\nextraRules:\n  - { id: SEC-02, category: security, title: t, check: c }\n  - { id: ZZ-1, category: nothere, title: t, check: c }\n");
    const { errors } = checkRepoConfig(f, p.config);
    assert.equal(errors.length, 4);
    const r = buildRubric(f, p.config);
    assert.ok(r.categories.flatMap((c) => c.criteria).some((x) => x.id === "SEC-01"));
    assert.ok(!r.categories.flatMap((c) => c.criteria).some((x) => x.id === "ZZ-1"));
  });
  it("yaml sai cú pháp/kiểu trả lỗi, không ném", () => {
    assert.ok(parseRepoConfig("weights: 5").error);
    assert.ok(parseRepoConfig(": : :").error);
  });
});
