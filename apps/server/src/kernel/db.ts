import { PrismaClient } from "@prisma/client";

export type Db = PrismaClient;

export function createDb(url: string): Db {
  return new PrismaClient({ datasources: { db: { url } } });
}
