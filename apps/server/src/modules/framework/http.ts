import type { FastifyInstance } from "fastify";
import type { FrameworkApi } from "./api.js";

export function registerFrameworkRoutes(app: FastifyInstance, api: FrameworkApi) {
  app.get("/api/frameworks", () => api.list());
  app.get<{ Params: { id: string } }>("/api/frameworks/:id", (req) => api.get(req.params.id));
}
