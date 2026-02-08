import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// SQLite の接続URL（.env の DATABASE_URL を利用）
const url = process.env.DATABASE_URL || "file:./dev.db";

// Prisma 7 では adapter か accelerateUrl が必須
const adapter = new PrismaBetterSqlite3({ url });

export const prisma = new PrismaClient({ adapter });
