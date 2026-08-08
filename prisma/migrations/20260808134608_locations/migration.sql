-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BUILDING',
    "parentId" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetTag" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SERVER',
    "status" TEXT NOT NULL DEFAULT 'IN_USE',
    "serial" TEXT,
    "model" TEXT,
    "manufacturer" TEXT,
    "location" TEXT,
    "locationId" TEXT,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "os" TEXT,
    "cpu" TEXT,
    "ramGb" INTEGER,
    "storageGb" INTEGER,
    "cost" REAL,
    "purchaseDate" DATETIME,
    "warrantyEnd" DATETIME,
    "notes" TEXT,
    "ownerId" TEXT,
    "groupId" TEXT,
    "syncSourceId" TEXT,
    "externalId" TEXT,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Asset_syncSourceId_fkey" FOREIGN KEY ("syncSourceId") REFERENCES "SyncSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Asset" ("assetTag", "cost", "cpu", "createdAt", "externalId", "groupId", "id", "ipAddress", "lastSeenAt", "location", "macAddress", "manufacturer", "model", "name", "notes", "os", "ownerId", "purchaseDate", "ramGb", "serial", "status", "storageGb", "syncSourceId", "type", "updatedAt", "warrantyEnd") SELECT "assetTag", "cost", "cpu", "createdAt", "externalId", "groupId", "id", "ipAddress", "lastSeenAt", "location", "macAddress", "manufacturer", "model", "name", "notes", "os", "ownerId", "purchaseDate", "ramGb", "serial", "status", "storageGb", "syncSourceId", "type", "updatedAt", "warrantyEnd" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");
CREATE INDEX "Asset_type_idx" ON "Asset"("type");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Asset_syncSourceId_idx" ON "Asset"("syncSourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");
