-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playedAt" DATETIME NOT NULL,
    "stage1" TEXT NOT NULL,
    "stage2" TEXT NOT NULL,
    "weapon" TEXT NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "fatigue" INTEGER NOT NULL,
    "irritability" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
