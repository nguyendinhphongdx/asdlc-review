import type { FastifyInstance } from "fastify";
import type { SettingsApi } from "./api.js";

export function registerSettingsRoutes(app: FastifyInstance, api: SettingsApi) {
  app.get("/api/settings", () => api.snapshot());
  app.put("/api/settings", (req) => api.update((req.body ?? {}) as Record<string, unknown>));
}
