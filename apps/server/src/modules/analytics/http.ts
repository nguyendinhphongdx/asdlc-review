import type { FastifyInstance } from "fastify";
import { parseRange } from "../../kernel/http.js";
import type { AnalyticsApi } from "./api.js";

type Q = { from?: string; to?: string; days?: string };

export function registerAnalyticsRoutes(app: FastifyInstance, api: AnalyticsApi) {
  app.get<{ Querystring: Q }>("/api/overview", (req) => api.overview(parseRange(req.query)));
  app.get<{ Querystring: Q }>("/api/leaderboard", (req) => api.leaderboard(parseRange(req.query)));
  const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
  app.get<{ Querystring: Q & { repos?: string; providers?: string; models?: string; frameworks?: string; status?: string } }>("/api/usage", (req) => {
    const q = req.query;
    const status = q.status === "succeeded" || q.status === "failed" ? q.status : "all";
    return api.usage(parseRange(q), { repoIds: list(q.repos), providers: list(q.providers), models: list(q.models), frameworks: list(q.frameworks), status });
  });
  app.get<{ Querystring: Q }>("/api/reports", (req) => api.report(parseRange(req.query)));
  app.get<{ Querystring: Q }>("/api/reports/export.csv", async (req, reply) =>
    reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", 'attachment; filename="leaderboard.csv"').send(await api.exportCsv(parseRange(req.query))),
  );
}
