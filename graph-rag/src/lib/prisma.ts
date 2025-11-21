// src/lib/prisma.ts
// Prisma client singleton
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export { prisma };

// Query logging enabled; adjust in production if verbose.