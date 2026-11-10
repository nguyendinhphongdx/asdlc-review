import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { createScmModule } from "../index.js";
import { isReviewCommand } from "../domain/webhooks.js";

const scm = createScmModule({ gitlab: { baseUrl: "https://gitlab.example.com", token: "t", webhookSecret: "s3" }, github: { token: "", webhookSecret: "gh" }, botMention: "@mr-reviewer" });

describe("scm", () => {
  it("parseUrl GitLab (nhóm lồng) và GitHub", () => {
    assert.deepEqual(scm.parseUrl("https://gitlab.example.com/g/sub/repo/-/merge_requests/12"), { platform: "gitlab", projectPath: "g/sub/repo", iid: 12 });
    assert.deepEqual(scm.parseUrl("https://github.com/o/r/pull/7"), { platform: "github", projectPath: "o/r", iid: 7 });
    assert.equal(scm.parseUrl("https://other.com/g/r/-/merge_requests/1"), null);
  });
  it("parseProjectUrl", () => {
    assert.deepEqual(scm.parseProjectUrl("https://gitlab.example.com/g/sub/repo.git"), { platform: "gitlab", projectPath: "g/sub/repo", webUrl: "https://gitlab.example.com/g/sub/repo" });
    assert.equal(scm.parseProjectUrl("https://github.com/o/r/pull/3")?.projectPath, "o/r");
    assert.equal(scm.parseProjectUrl("https://gitlab.example.com/onlyone"), null);
  });
  it("xác thực webhook", () => {
    assert.equal(scm.verifyWebhook("gitlab", { "x-gitlab-token": "s3" }, ""), true);
    assert.equal(scm.verifyWebhook("gitlab", { "x-gitlab-token": "bad" }, ""), false);
    const body = '{"a":1}';
    const sig = "sha256=" + createHmac("sha256", "gh").update(body).digest("hex");
    assert.equal(scm.verifyWebhook("github", { "x-hub-signature-256": sig }, body), true);
  });
  it("chuẩn hoá sự kiện GitLab", () => {
    const base = { object_kind: "merge_request", project: { path_with_namespace: "g/r" }, user: { username: "u" } };
    assert.equal(scm.parseWebhook("gitlab", {}, { ...base, object_attributes: { iid: 3, action: "open", last_commit: { id: "abc" } } })?.kind, "mr_opened");
    assert.equal(scm.parseWebhook("gitlab", {}, { ...base, object_attributes: { iid: 3, action: "update" } }), null);
    assert.equal(scm.parseWebhook("gitlab", {}, { ...base, object_attributes: { iid: 3, action: "update", oldrev: "x" } })?.kind, "mr_updated");
    assert.equal(scm.parseWebhook("gitlab", {}, { ...base, object_attributes: { iid: 3, action: "merge" } })?.kind, "mr_merged");
    const note = { object_kind: "note", project: base.project, user: base.user, merge_request: { iid: 9 }, object_attributes: { noteable_type: "MergeRequest", note: "/review" } };
    assert.deepEqual(scm.parseWebhook("gitlab", {}, note)?.iid, 9);
  });
  it("nhận lệnh review", () => {
    assert.ok(isReviewCommand("/review", "@bot"));
    assert.ok(isReviewCommand("hey @bot please review this", "@bot"));
    assert.ok(!isReviewCommand("looks good", "@bot"));
  });
});
