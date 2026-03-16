-- CreateEnum
CREATE TYPE "public"."AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "aiAccess" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."AiAccessRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiAccessRequest_token_key" ON "public"."AiAccessRequest"("token");

-- CreateIndex
CREATE INDEX "AiAccessRequest_userId_idx" ON "public"."AiAccessRequest"("userId");

-- CreateIndex
CREATE INDEX "AiAccessRequest_token_idx" ON "public"."AiAccessRequest"("token");

-- AddForeignKey
ALTER TABLE "public"."AiAccessRequest" ADD CONSTRAINT "AiAccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
