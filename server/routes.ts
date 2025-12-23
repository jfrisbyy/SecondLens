import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { db } from "./db";
import { scanHistory, type CodeSuggestion } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MEDICAL_CODING_PROMPT = `You are an expert medical coder assistant. Analyze the provided medical document image and suggest appropriate ICD-10 and CPT codes.

IMPORTANT: This document may contain patient information. Focus ONLY on the clinical/medical information for coding purposes. Do not repeat any patient identifiers.

Based on the medical information visible in the document:
1. Identify diagnoses, procedures, and relevant clinical findings
2. Suggest appropriate ICD-10 diagnosis codes
3. Suggest appropriate CPT procedure codes if applicable
4. Provide confidence level (High/Medium/Low) based on clarity of information

Respond in JSON format with an array of code suggestions:
{
  "suggestions": [
    {
      "code": "ICD-10 or CPT code",
      "codeType": "ICD-10" or "CPT",
      "description": "Brief description of what the code represents",
      "confidence": "High" | "Medium" | "Low",
      "details": "Additional context or reasoning for this code suggestion"
    }
  ],
  "deIdentifiedFields": ["List of field types that were detected and should be masked, e.g., 'Patient Name', 'Date of Birth', 'MRN'"]
}

If the image is unclear or doesn't contain medical information, return an empty suggestions array.`;

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/analyze", async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: MEDICAL_CODING_PROMPT,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
              {
                type: "text",
                text: "Please analyze this medical document and provide coding suggestions.",
              },
            ],
          },
        ],
        max_completion_tokens: 2048,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let parsed: { suggestions?: CodeSuggestion[]; deIdentifiedFields?: string[] };
      
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { suggestions: [], deIdentifiedFields: [] };
      }

      const suggestions = parsed.suggestions || [];
      const deIdentifiedFields = parsed.deIdentifiedFields || [];

      const [scan] = await db
        .insert(scanHistory)
        .values({
          imageBase64: "",
          deIdentifiedFields,
          codeSuggestions: suggestions,
        })
        .returning();

      res.json({
        scanId: scan.id,
        suggestions,
        deIdentifiedFields,
      });
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze document" });
    }
  });

  app.get("/api/scans", async (req, res) => {
    try {
      const scans = await db
        .select()
        .from(scanHistory)
        .orderBy(desc(scanHistory.createdAt))
        .limit(50);
      
      res.json(scans);
    } catch (error) {
      console.error("Error fetching scans:", error);
      res.status(500).json({ error: "Failed to fetch scan history" });
    }
  });

  app.get("/api/scans/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid scan ID" });
      }

      const [scan] = await db
        .select()
        .from(scanHistory)
        .where(eq(scanHistory.id, id));

      if (!scan) {
        return res.status(404).json({ error: "Scan not found" });
      }

      res.json(scan);
    } catch (error) {
      console.error("Error fetching scan:", error);
      res.status(500).json({ error: "Failed to fetch scan" });
    }
  });

  app.delete("/api/scans/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid scan ID" });
      }

      await db.delete(scanHistory).where(eq(scanHistory.id, id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting scan:", error);
      res.status(500).json({ error: "Failed to delete scan" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
