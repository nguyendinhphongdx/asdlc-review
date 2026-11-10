import type { FastifyInstance } from "fastify";
import { parseRange } from "../../kernel/http.js";
import type { AnalyticsApi } from "./api.js";

type Q = { from?: string; to?: string; days?: string };

export function registerAnalyticsRoutes(app: FastifyInstance, api: AnalyticsApi) {
  app.get<{ Querystring: Q }>("/api/overview", (req) => api.overview(parseRange(req.query)));
  app.get<{ Querystring: Q }>("/api/leaderboard", (req) => api.leaderboard(parseRange(req.query)));
  app.get<{ Querystring: Q }>("/api/reports", (req) => api.report(parseRange(req.query)));
  app.get<{ Querystring: Q }>("/api/reports/export.csv", async (req, reply) =>
    reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", 'attachment; filename="leaderboard.csv"').send(await api.exportCsv(parseRange(req.query))),
  );
}
