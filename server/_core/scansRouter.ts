import { z } from "zod";
import { protectedProcedure, router, adminProcedure } from "./trpc";
import * as db from "../db";
import type { InsertSavedScan, SavedScan } from "../../drizzle/schema";

export const scansRouter = router({
  // List saved scans for the current user (or admin sees everything).
  list: protectedProcedure.query(async ({ ctx }) => {
    const scans = await db.getSavedScansByOpenId(ctx.user!.openId);
    return scans;
  }),

  // Get one saved scan.
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const scan = await db.getSavedScanById(input.id);
      if (!scan) throw new Error("Scan not found");
      return scan;
    }),

  // Save a scan result to the user's history.
  save: protectedProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(240),
        content: z.string(),
        summary: z.string(),
        findings: z.array(
          z.object({
            id: z.string(),
            fileName: z.string(),
            line: z.number(),
            type: z.string(),
            severity: z.string(),
            maskedValue: z.string(),
            remediation: z.string(),
          })
        ),
        status: z.enum(["blocked", "clean"]),
        maskedValues: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scan: InsertSavedScan = {
        ownerOpenId: ctx.user!.openId,
        userId: ctx.user!.id,
        fileName: input.fileName,
        content: input.content,
        summary: input.summary,
        findings: input.findings,
        status: input.status,
        maskedValues: input.maskedValues,
        createdAt: new Date(),
      };
      const saved = await db.upsertSavedScan(scan);
      return saved;
    }),

  // Delete a saved scan.
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await db.deleteSavedScan(input.id);
      if (!deleted) throw new Error("Scan not found");
      return { success: true };
    }),
});
