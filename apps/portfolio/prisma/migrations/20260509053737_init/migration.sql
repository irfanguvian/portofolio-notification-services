-- CreateEnum
CREATE TYPE "portfolio"."TxType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "portfolio"."Channel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateTable
CREATE TABLE "portfolio"."Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "portfolio"."TxType" NOT NULL,
    "qty" DECIMAL(20,8) NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."UserPreference" (
    "userId" UUID NOT NULL,
    "channel" "portfolio"."Channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "portfolio"."NotificationRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "portfolio"."Transaction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_userId_eventType_key" ON "portfolio"."NotificationRule"("userId", "eventType");
