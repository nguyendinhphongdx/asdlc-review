import { randomBytes } from "node:crypto";
import type { SecretsApi } from "../modules/secrets/index.js";
import type { Config } from "../kernel/config.js";

export const KEY = { gitlabToken: "gitlab.token", gitlabUrl: "gitlab.url", gitlabWebhook: "gitlab.webhookSecret" } as const;

/**
 * Nguồn sự thật cho thông tin đăng nhập nền tảng: ưu tiên giá trị lưu trong DB (nhập từ UI),
 * dự phòng biến môi trường. Đọc đồng bộ từ bộ nhớ nên scm gọi mỗi request mà không tốn I/O.
 */
export function createCredentials(config: Config, secrets: SecretsApi) {
  const gitlab = () => ({
    baseUrl: secrets.peek(KEY.gitlabUrl) ?? config.GITLAB_URL,
    token: secrets.peek(KEY.gitlabToken) ?? config.GITLAB_TOKEN,
    webhookSecret: secrets.peek(KEY.gitlabWebhook) ?? config.GITLAB_WEBHOOK_SECRET,
  });
  return {
    gitlab,
    github: () => ({ token: config.GITHUB_TOKEN, webhookSecret: config.GITHUB_WEBHOOK_SECRET }),
    tokenSource: (): "db" | "env" | "none" => (secrets.peek(KEY.gitlabToken) ? "db" : config.GITLAB_TOKEN ? "env" : "none"),
    async saveGitlab(input: { baseUrl: string; token?: string }) {
      await secrets.set(KEY.gitlabUrl, input.baseUrl.replace(/\/+$/, ""));
      if (input.token) await secrets.set(KEY.gitlabToken, input.token);
      if (!secrets.peek(KEY.gitlabWebhook) && !config.GITLAB_WEBHOOK_SECRET) await secrets.set(KEY.gitlabWebhook, randomBytes(24).toString("hex"));
    },
    async clearGitlab() {
      await secrets.delete(KEY.gitlabToken);
      await secrets.delete(KEY.gitlabUrl);
    },
    async regenerateWebhookSecret() {
      const s = randomBytes(24).toString("hex");
      await secrets.set(KEY.gitlabWebhook, s);
      return s;
    },
    /** Secret webhook hiện hành; tạo mới nếu chưa có (và có khoá để lưu). */
    async ensureWebhookSecret() {
      const cur = gitlab().webhookSecret;
      if (cur) return cur;
      return secrets.canStore ? this.regenerateWebhookSecret() : "";
    },
  };
}
export type Credentials = ReturnType<typeof createCredentials>;
