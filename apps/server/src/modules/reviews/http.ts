import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ReviewsApi } from "./api.js";

const num = z.coerce.number();
const ListQuery = z.object({
  repositoryId: z.string().optional(), memberId: z.string().optional(), mrId: z.string().optional(), status: z.string().optional(),
  minScore: num.optional(), maxScore: num.optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(),
  limit: num.int().min(1).max(200).optional(), offset: num.int().min(0).optional(),
});
const Feedback = z.object({ feedback: z.enum(["agree", "disagree", "fixed"]).nullable() });

export function registerReviewsRoutes(app: FastifyInstance, api: ReviewsApi) {
  app.get("/api/reviews", (req) => api.listRuns(ListQuery.parse(req.query)));
  app.get<{ Params: { id: string } }>("/api/reviews/:id", (req) => api.getRun(req.params.id));
  app.get("/api/mrs", (req) => api.listMrs(z.object({ repositoryId: z.string().optional(), memberId: z.string().optional(), state: z.string().optional(), limit: num.optional(), offset: num.optional() }).parse(req.query)));
  app.post<{ Params: { id: string } }>("/api/findings/:id/feedback", async (req, reply) => (await api.setFindingFeedback(req.params.id, Feedback.parse(req.body).feedback), reply.status(204).send()));
}
