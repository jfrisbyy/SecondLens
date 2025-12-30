import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, integer, jsonb, boolean, varchar } from "drizzle-orm/pg-core";
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

export const icdTermMap = pgTable("icd_term_map", {
  id: serial("id").primaryKey(),
  term: text("term").notNull(),
  normalizedTerm: text("normalized_term"),
  matchedCode: varchar("matched_code", { length: 10 }),
  matchConfidence: integer("match_confidence").default(100),
  comboTrigger: boolean("combo_trigger").default(false),
  requiresSecondaryCode: boolean("requires_secondary_code").default(false),
});

export const icdLogicRules = pgTable("icd_logic_rules", {
  id: serial("id").primaryKey(),
  conditionCluster: text("condition_cluster"),
  triggerTerms: text("trigger_terms").array(),
  primaryCode: varchar("primary_code", { length: 10 }),
  secondaryCode: varchar("secondary_code", { length: 10 }),
  ruleDescription: text("rule_description"),
  suppressionKeywords: text("suppression_keywords").array(),
  reasonNotSelected: text("reason_not_selected"),
});

export const icdExplanations = pgTable("icd_explanations", {
  id: serial("id").primaryKey(),
  icdCode: varchar("icd_code", { length: 10 }),
  explanation: text("explanation"),
});

export const icdRelatedExclusions = pgTable("icd_related_exclusions", {
  id: serial("id").primaryKey(),
  icdCode: varchar("icd_code", { length: 10 }),
  explanation: text("explanation"),
});

export type IcdTermMap = typeof icdTermMap.$inferSelect;
export type IcdLogicRule = typeof icdLogicRules.$inferSelect;
export type IcdExplanation = typeof icdExplanations.$inferSelect;
export type IcdRelatedExclusion = typeof icdRelatedExclusions.$inferSelect;

export * from "./models/chat";
