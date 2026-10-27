-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REPORTING_OFFICER', 'ANALYST', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMMERCIAL_BANK', 'DEVELOPMENT_BANK', 'FINANCE_COMPANY', 'MICROFINANCE', 'COOPERATIVE', 'INSURANCE', 'REMITTANCE', 'CAPITAL_MARKET');

-- CreateEnum
CREATE TYPE "SubjectKind" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('CASH', 'TRANSFER', 'CONNECT_IPS', 'WALLET', 'REMITTANCE', 'CHEQUE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('STR', 'TTR', 'RULE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'FALSE_POSITIVE', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'PENDING_APPROVAL', 'DISSEMINATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Typology" AS ENUM ('STRUCTURING', 'HUNDI', 'TRADE_BASED', 'FRAUD', 'TAX_EVASION', 'CORRUPTION', 'TERRORISM_FINANCING', 'OTHER');

-- CreateEnum
CREATE TYPE "Agency" AS ENUM ('DMLI', 'NEPAL_POLICE', 'DRI', 'IRD', 'CIAA', 'NRB');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('DISSEMINATE', 'CLOSE');

-- CreateEnum
CREATE TYPE "SubjectRole" AS ENUM ('SUSPECT', 'ASSOCIATE', 'VICTIM');

-- CreateTable
CREATE TABLE "ReportingEntity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportingEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "kind" "SubjectKind" NOT NULL,
    "name" TEXT NOT NULL,
    "nameNe" TEXT,
    "citizenshipNo" TEXT,
    "panNo" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "district" TEXT,
    "occupation" TEXT,
    "isPep" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "channel" "Channel" NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyAccount" TEXT,
    "narration" TEXT,
    "district" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "ruleCode" TEXT,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "narrative" TEXT,
    "entityId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "caseId" TEXT,
    "triagedById" TEXT,
    "triagedAt" TIMESTAMP(3),
    "triageNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertTransaction" (
    "alertId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "AlertTransaction_pkey" PRIMARY KEY ("alertId","transactionId")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "typology" "Typology" NOT NULL DEFAULT 'OTHER',
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "recommendation" "Recommendation",
    "submittedById" TEXT,
    "agency" "Agency",
    "disseminatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseSubject" (
    "caseId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "role" "SubjectRole" NOT NULL DEFAULT 'SUSPECT',

    CONSTRAINT "CaseSubject_pkey" PRIMARY KEY ("caseId","subjectId")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseTask" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "alertId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportingEntity_code_key" ON "ReportingEntity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Subject_citizenshipNo_idx" ON "Subject"("citizenshipNo");

-- CreateIndex
CREATE INDEX "Subject_panNo_idx" ON "Subject"("panNo");

-- CreateIndex
CREATE UNIQUE INDEX "Account_entityId_accountNo_key" ON "Account"("entityId", "accountNo");

-- CreateIndex
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_accountId_reference_key" ON "Transaction"("accountId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_reference_key" ON "Alert"("reference");

-- CreateIndex
CREATE INDEX "Alert_status_createdAt_idx" ON "Alert"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Case_reference_key" ON "Case"("reference");

-- CreateIndex
CREATE INDEX "Case_status_dueAt_idx" ON "Case"("status", "dueAt");

-- CreateIndex
CREATE INDEX "AuditEvent_caseId_createdAt_idx" ON "AuditEvent"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ReportingEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ReportingEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "ReportingEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertTransaction" ADD CONSTRAINT "AlertTransaction_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertTransaction" ADD CONSTRAINT "AlertTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseSubject" ADD CONSTRAINT "CaseSubject_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseSubject" ADD CONSTRAINT "CaseSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTask" ADD CONSTRAINT "CaseTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
