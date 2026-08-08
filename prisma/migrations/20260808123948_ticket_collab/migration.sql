-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" INTEGER NOT NULL,
    "linkedTicketId" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RELATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketLink_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketLink_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'INCIDENT',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "impact" TEXT NOT NULL DEFAULT 'MEDIUM',
    "urgency" TEXT NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "isMajorIncident" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" INTEGER,
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "groupId" TEXT,
    "queueId" TEXT,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "slaId" TEXT,
    "problemId" INTEGER,
    "changeId" INTEGER,
    "dueAt" DATETIME,
    "firstResponseAt" DATETIME,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "SLA" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "Change" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Ticket" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assigneeId", "categoryId", "changeId", "closedAt", "createdAt", "description", "dueAt", "firstResponseAt", "groupId", "id", "impact", "priority", "problemId", "queueId", "requesterId", "resolvedAt", "serviceId", "slaId", "source", "status", "title", "type", "updatedAt", "urgency") SELECT "assigneeId", "categoryId", "changeId", "closedAt", "createdAt", "description", "dueAt", "firstResponseAt", "groupId", "id", "impact", "priority", "problemId", "queueId", "requesterId", "resolvedAt", "serviceId", "slaId", "source", "status", "title", "type", "updatedAt", "urgency" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");
CREATE INDEX "Ticket_queueId_idx" ON "Ticket"("queueId");
CREATE INDEX "Ticket_requesterId_idx" ON "Ticket"("requesterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Task_ticketId_idx" ON "Task"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketLink_ticketId_linkedTicketId_key" ON "TicketLink"("ticketId", "linkedTicketId");
