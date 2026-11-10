import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { IdentityApi } from "./api.js";

const Identity = z.object({ platform: z.enum(["gitlab", "github", "email"]), username: z.string().min(1) });
const Create = z.object({ displayName: z.string().min(1), email: z.string().nullish(), team: z.string().nullish(), role: z.string().nullish(), active: z.boolean().optional(), identities: z.array(Identity).optional() });

export function registerIdentityRoutes(app: FastifyInstance, api: IdentityApi) {
  app.get("/api/members", () => api.list());
  app.post("/api/members", async (req, reply) => reply.status(201).send(await api.create(Create.parse(req.body))));
  app.patch<{ Params: { id: string } }>("/api/members/:id", (req) => api.update(req.params.id, Create.partial().parse(req.body)));
  app.delete<{ Params: { id: string } }>("/api/members/:id", async (req, reply) => (await api.remove(req.params.id), reply.status(204).send()));
}
