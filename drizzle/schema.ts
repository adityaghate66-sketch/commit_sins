import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing auth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Saved scan results so users can review past verdicts later. */
export const savedScans = mysqlTable("saved_scans", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  /** Pointer to the user who saved this scan. */
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 240 }).notNull(),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  findings: json("findings").notNull().default([]),
  status: mysqlEnum("status", ["blocked", "clean"]).notNull(),
  maskedValues: json("maskedValues").notNull().default([]),
  machineId: varchar("machineId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SavedScan = typeof savedScans.$inferSelect;
export type InsertSavedScan = typeof savedScans.$inferInsert;
