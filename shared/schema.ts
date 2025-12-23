import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scanHistory = pgTable("scan_history", {
  id: serial("id").primaryKey(),
  imageBase64: text("image_base64").notNull(),
  deIdentifiedFields: jsonb("de_identified_fields").$type<string[]>().default([]),
  codeSuggestions: jsonb("code_suggestions").$type<CodeSuggestion[]>().default([]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export interface CodeSuggestion {
  code: string;
  codeType: "ICD-10" | "CPT";
  description: string;
  confidence: "High" | "Medium" | "Low";
  details?: string;
}

export const insertScanHistorySchema = createInsertSchema(scanHistory).omit({
  id: true,
  createdAt: true,
});

export type ScanHistory = typeof scanHistory.$inferSelect;
export type InsertScanHistory = z.infer<typeof insertScanHistorySchema>;

export * from "./models/chat";
