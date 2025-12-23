import { db } from "./db";
import { scanHistory, type ScanHistory, type InsertScanHistory } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getScan(id: number): Promise<ScanHistory | undefined>;
  getAllScans(): Promise<ScanHistory[]>;
  createScan(scan: InsertScanHistory): Promise<ScanHistory>;
  deleteScan(id: number): Promise<void>;
}

export const storage: IStorage = {
  async getScan(id: number) {
    const [scan] = await db.select().from(scanHistory).where(eq(scanHistory.id, id));
    return scan;
  },

  async getAllScans() {
    return db.select().from(scanHistory).orderBy(desc(scanHistory.createdAt));
  },

  async createScan(scan: InsertScanHistory) {
    const [newScan] = await db.insert(scanHistory).values(scan).returning();
    return newScan;
  },

  async deleteScan(id: number) {
    await db.delete(scanHistory).where(eq(scanHistory.id, id));
  },
};
