-- CreateTable
CREATE TABLE "ProblemComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "problemId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProblemComment_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProblemComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeComment_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "Change" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProblemComment_problemId_idx" ON "ProblemComment"("problemId");

-- CreateIndex
CREATE INDEX "ChangeComment_changeId_idx" ON "ChangeComment"("changeId");
