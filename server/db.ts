import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertSavedScan,
  InsertUser,
  savedScans,
  users,
  type SavedScan,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Saved scans
export async function getSavedScansByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savedScans).where(eq(savedScans.ownerOpenId, openId));
}

export async function getSavedScanById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(savedScans).where(eq(savedScans.id, id)).limit(1);
  return result[0] ?? undefined;
}

// Simplified insert that matches what drizzle-orm 0.44 generates for MySQL.
// The .returning() call isn't part of the public MySQL driver API, so we
// execute the write and then read the row back by its primary key.
export async function createSavedScan(scan: InsertSavedScan) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database is not available");
  }
  await db.insert(savedScans).values(scan);
}

export async function upsertSavedScan(scan: InsertSavedScan): Promise<SavedScan | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // Insert or update on duplicate key.
  await db.insert(savedScans).values(scan).onDuplicateKeyUpdate({ set: scan });

  // Read the row back by its owner and filename (matches the generated id).
  const result = await db.select().from(savedScans).where(eq(savedScans.ownerOpenId, scan.ownerOpenId)).limit(1);
  return result[0] ?? null;
}

export async function deleteSavedScan(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.delete(savedScans).where(eq(savedScans.id, id));
  return (result as any).affectedRows > 0;
}
