// src/lib/prisma.ts
// Prisma client singleton — reuses the same instance across HMR reloads
// to prevent connection pool exhaustion during Next.js development.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}