import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { db } from "./db";
import { scanHistory, icdTermMap, icdLogicRules, icdExplanations, icdRelatedExclusions, type CodeSuggestion } from "@shared/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const PHI_PATTERNS = {
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  dobLabeled: /\b(?:DOB|Date of Birth|Birth Date|Birthdate|Born|Birthday)[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}[-/]\d{2}[-/]\d{2})\b/gi,
  serviceDateLabeled: /\b(?:Service Date|Date of Service|Visit Date|Encounter Date|DOS)[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/gi,
  allDates: /\b(0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])[-/](19|20)\d{2}\b/g,
  mrn: /\b(?:MRN|Medical Record|Record #|Patient ID|Chart #)[:\s#]*[A-Z0-9]{4,15}\b/gi,
  accountNum: /\b(?:Account|Acct|Account #|Acct #)[:\s#]*\d{5,15}\b/gi,
  insuranceId: /\b(?:Insurance ID|Member ID|Policy|Subscriber ID|Group #)[:\s#]*[A-Z0-9]{6,20}\b/gi,
  patientNameHeader: /\b(?:Patient|Patient Name|Name|Pt|Pt\.)[:\s]+([A-Z][a-zA-Z'-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'-]+)\b/gi,
  namePatterns: /\b([A-Z][a-zA-Z'-]{1,20}\s+(?:[A-Z]\.?\s+)?(?:Mc|Mac|O'|De|La|Van|Von)?[A-Z][a-zA-Z'-]{1,20})\b/g,
  hyphenatedName: /\b([A-Z][a-z]+-[A-Z][a-z]+)\b/g,
  apostropheName: /\b((?:O'|Mc|Mac)[A-Z][a-z]+)\b/g,
  lastFirstFormat: /\b([A-Z][a-zA-Z'-]+),\s*([A-Z][a-zA-Z'-]+)(?:\s+[A-Z]\.?)?\b/g,
  lastInitialFormat: /\b([A-Z][a-zA-Z'-]+),\s*([A-Z]\.?)\b/g,
  initialLastFormat: /\b([A-Z]\.?\s+[A-Z][a-zA-Z'-]+)\b/g,
  address: /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir|Place|Pl)\.?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+|Unit\s*\d+)?(?:[,\s]+[A-Za-z\s]+)?(?:,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/gi,
  zipCode: /\b\d{5}(?:-\d{4})?\b/g,
  age: /\b(?:Age|AGE)[:\s]*\d{1,3}(?:\s*(?:years?|yrs?|y\/o|yo))?\b/gi,
};

const SAFE_MEDICAL_TERMS = new Set([
  'type', 'diabetes', 'mellitus', 'hypertension', 'pneumonia', 'chronic', 'acute',
  'diagnosis', 'procedure', 'medication', 'treatment', 'assessment', 'blood',
  'pressure', 'glucose', 'insulin', 'metformin', 'aspirin', 'lab', 'test',
  'result', 'normal', 'abnormal', 'elevated', 'decreased', 'history', 'present',
  'illness', 'review', 'systems', 'physical', 'exam', 'vital', 'signs', 'heart',
  'lung', 'kidney', 'liver', 'cardiac', 'respiratory', 'renal', 'hepatic',
  'gastric', 'neural', 'chronic', 'acute', 'severe', 'mild', 'moderate',
  'bilateral', 'unilateral', 'primary', 'secondary', 'benign', 'malignant',
  'left', 'right', 'upper', 'lower', 'anterior', 'posterior', 'lateral', 'medial',
  'high', 'low', 'normal', 'total', 'partial', 'complete', 'stable', 'unstable',
]);

const PROTECTED_PLACEHOLDERS = ['[PATIENT_NAME]', '[DOB]', '[SSN]', '[MRN]', '[PHONE]', 
  '[EMAIL]', '[ADDRESS]', '[INSURANCE_ID]', '[ACCOUNT_NUMBER]', '[DATE]', '[REDACTED]',
  '[PROVIDER_NAME]', '[FACILITY_NAME]', '[SERVICE_DATE]', '[AGE]'];

function enforceDeidentification(text: string): { 
  cleanText: string; 
  detectedPHI: string[];
  wasModified: boolean;
} {
  let cleanText = text;
  const detectedPHI: string[] = [];
  let wasModified = false;

  if (PROTECTED_PLACEHOLDERS.some(p => cleanText.includes(p))) {
    for (const placeholder of PROTECTED_PLACEHOLDERS) {
      cleanText = cleanText.replace(new RegExp(placeholder.replace(/[[\]]/g, '\\$&'), 'g'), placeholder);
    }
  }

  cleanText = cleanText.replace(PHI_PATTERNS.ssn, (match) => {
    detectedPHI.push('SSN detected');
    wasModified = true;
    return '[SSN]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.phone, (match) => {
    detectedPHI.push('Phone number detected');
    wasModified = true;
    return '[PHONE]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.email, (match) => {
    detectedPHI.push('Email detected');
    wasModified = true;
    return '[EMAIL]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.dobLabeled, (match) => {
    detectedPHI.push('Date of Birth detected');
    wasModified = true;
    return '[DOB]';
  });

  const serviceDateMatches: string[] = [];
  cleanText.replace(PHI_PATTERNS.serviceDateLabeled, (match, date) => {
    serviceDateMatches.push(date);
    return match;
  });

  cleanText = cleanText.replace(PHI_PATTERNS.serviceDateLabeled, '[SERVICE_DATE]');

  cleanText = cleanText.replace(PHI_PATTERNS.allDates, (match, m, d, y) => {
    const fullDate = match;
    if (serviceDateMatches.includes(fullDate)) {
      return match;
    }
    detectedPHI.push('Unlabeled date detected (potential DOB)');
    wasModified = true;
    return '[DATE]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.mrn, (match) => {
    detectedPHI.push('MRN detected');
    wasModified = true;
    return '[MRN]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.accountNum, (match) => {
    detectedPHI.push('Account number detected');
    wasModified = true;
    return '[ACCOUNT_NUMBER]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.insuranceId, (match) => {
    detectedPHI.push('Insurance ID detected');
    wasModified = true;
    return '[INSURANCE_ID]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.age, (match) => {
    detectedPHI.push('Age detected');
    wasModified = true;
    return '[AGE]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.address, (match) => {
    detectedPHI.push('Address detected');
    wasModified = true;
    return '[ADDRESS]';
  });

  cleanText = cleanText.replace(PHI_PATTERNS.patientNameHeader, (match, name) => {
    if (name) {
      const words = name.toLowerCase().split(/\s+/);
      const allSafeMedicalTerms = words.every(w => SAFE_MEDICAL_TERMS.has(w));
      if (!allSafeMedicalTerms) {
        detectedPHI.push('Patient name in header detected');
        wasModified = true;
        return match.replace(name, '[PATIENT_NAME]');
      }
    }
    return match;
  });

  cleanText = cleanText.replace(PHI_PATTERNS.lastFirstFormat, (match, lastName, firstName) => {
    const lastLower = lastName.toLowerCase().replace(/['-]/g, '');
    const firstLower = firstName.toLowerCase().replace(/['-]/g, '');
    if (!SAFE_MEDICAL_TERMS.has(lastLower) || !SAFE_MEDICAL_TERMS.has(firstLower)) {
      detectedPHI.push('Last, First name format detected');
      wasModified = true;
      return '[PATIENT_NAME]';
    }
    return match;
  });

  cleanText = cleanText.replace(PHI_PATTERNS.lastInitialFormat, (match, lastName, initial) => {
    const lastLower = lastName.toLowerCase().replace(/['-]/g, '');
    if (!SAFE_MEDICAL_TERMS.has(lastLower)) {
      detectedPHI.push('Last, Initial name format detected');
      wasModified = true;
      return '[PATIENT_NAME]';
    }
    return match;
  });

  cleanText = cleanText.replace(PHI_PATTERNS.initialLastFormat, (match) => {
    const words = match.split(/\s+/);
    if (words.length >= 2) {
      const lastName = words[words.length - 1].toLowerCase().replace(/['-]/g, '');
      if (!SAFE_MEDICAL_TERMS.has(lastName)) {
        detectedPHI.push('Initial Last name format detected');
        wasModified = true;
        return '[PATIENT_NAME]';
      }
    }
    return match;
  });

  cleanText = cleanText.replace(PHI_PATTERNS.hyphenatedName, (match) => {
    const lowerMatch = match.toLowerCase().replace(/-/g, '');
    if (!SAFE_MEDICAL_TERMS.has(lowerMatch)) {
      detectedPHI.push('Hyphenated name detected');
      wasModified = true;
      return '[PATIENT_NAME]';
    }
    return match;
  });

  cleanText = cleanText.replace(PHI_PATTERNS.apostropheName, (match) => {
    detectedPHI.push('Celtic/Irish name pattern detected');
    wasModified = true;
    return '[PATIENT_NAME]';
  });

  const nameMatches = cleanText.match(PHI_PATTERNS.namePatterns);
  if (nameMatches) {
    const processedNames = new Set<string>();
    for (const potentialName of nameMatches) {
      if (processedNames.has(potentialName)) continue;
      if (potentialName.includes('[PATIENT_NAME]')) continue;
      processedNames.add(potentialName);
      
      const words = potentialName.split(/\s+/).map(w => w.replace(/['-]/g, ''));
      const wordsLower = words.map(w => w.toLowerCase());
      
      if (wordsLower.every(w => SAFE_MEDICAL_TERMS.has(w))) {
        continue;
      }
      
      const isLikelyName = words.length >= 2 && 
                          words.length <= 3 &&
                          words.every(w => /^[A-Z][a-zA-Z'-]*$/.test(w) || /^(?:Mc|Mac|O'|De|La|Van|Von)[A-Z]/.test(w)) &&
                          words.every(w => w.length >= 2 && w.length <= 20) &&
                          !wordsLower.some(w => ['dr', 'md', 'rn', 'np', 'pa', 'do', 'phd', 'ms', 'mr', 'mrs', 'miss'].includes(w));
      
      if (isLikelyName) {
        const nameEscaped = potentialName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleanText = cleanText.replace(new RegExp(nameEscaped, 'g'), '[PATIENT_NAME]');
        detectedPHI.push('Potential patient name detected');
        wasModified = true;
      }
    }
  }

  return { cleanText, detectedPHI, wasModified };
}

interface RelatedCode {
  code: string;
  codeType: "ICD-10" | "CPT";
  description: string;
  reason: string;
}

async function matchCodesFromDatabase(text: string, clinicalContent?: {
  diagnoses?: string[];
  procedures?: string[];
  medications?: string[];
}): Promise<{ localMatches: CodeSuggestion[]; relatedCodes: RelatedCode[]; matchedTerms: string[] }> {
  const localMatches: CodeSuggestion[] = [];
  const relatedCodes: RelatedCode[] = [];
  const matchedTerms: string[] = [];
  const textLower = text.toLowerCase();
  
  const allTerms = await db.select().from(icdTermMap);
  const allRules = await db.select().from(icdLogicRules);
  const allExplanations = await db.select().from(icdExplanations);
  const allExclusions = await db.select().from(icdRelatedExclusions);
  
  const explanationMap = new Map(allExplanations.map(e => [e.icdCode, e.explanation]));
  const exclusionMap = new Map(allExclusions.map(e => [e.icdCode, e.explanation]));
  
  const foundTerms: string[] = [];
  const foundCodes = new Set<string>();
  const suppressedCodes = new Set<string>();
  
  for (const term of allTerms) {
    if (textLower.includes(term.term.toLowerCase())) {
      foundTerms.push(term.term);
      if (term.matchedCode && !foundCodes.has(term.matchedCode)) {
        foundCodes.add(term.matchedCode);
        matchedTerms.push(term.term);
      }
    }
  }
  
  if (clinicalContent?.diagnoses) {
    for (const diagnosis of clinicalContent.diagnoses) {
      const diagLower = diagnosis.toLowerCase();
      for (const term of allTerms) {
        if (diagLower.includes(term.term.toLowerCase()) || term.term.toLowerCase().includes(diagLower)) {
          if (!foundTerms.includes(term.term)) {
            foundTerms.push(term.term);
          }
          if (term.matchedCode && !foundCodes.has(term.matchedCode)) {
            foundCodes.add(term.matchedCode);
            matchedTerms.push(term.term);
          }
        }
      }
    }
  }
  
  for (const rule of allRules) {
    if (rule.triggerTerms) {
      const allTriggersFound = rule.triggerTerms.every(trigger => 
        foundTerms.some(ft => ft.toLowerCase().includes(trigger.toLowerCase()))
      );
      
      if (allTriggersFound && rule.primaryCode) {
        const isSuppressed = rule.suppressionKeywords?.some(keyword => 
          textLower.includes(keyword.toLowerCase())
        );
        
        if (isSuppressed) {
          suppressedCodes.add(rule.primaryCode);
          const exclusionExplanation = exclusionMap.get(rule.primaryCode) || rule.reasonNotSelected;
          if (exclusionExplanation) {
            relatedCodes.push({
              code: rule.primaryCode,
              codeType: "ICD-10",
              description: rule.ruleDescription || "",
              reason: exclusionExplanation,
            });
          }
          continue;
        }
        
        foundCodes.delete(allTerms.find(t => 
          rule.triggerTerms?.some(rt => t.term.toLowerCase() === rt.toLowerCase())
        )?.matchedCode || '');
        
        if (!foundCodes.has(rule.primaryCode)) {
          foundCodes.add(rule.primaryCode);
          
          localMatches.push({
            code: rule.primaryCode,
            codeType: "ICD-10",
            description: rule.ruleDescription || "",
            confidence: "High",
            details: explanationMap.get(rule.primaryCode) || `Matched from rule: ${rule.conditionCluster}`,
          });
          
          if (rule.secondaryCode && !foundCodes.has(rule.secondaryCode)) {
            foundCodes.add(rule.secondaryCode);
            localMatches.push({
              code: rule.secondaryCode,
              codeType: "ICD-10",
              description: explanationMap.get(rule.secondaryCode) || "Secondary code per coding guidelines",
              confidence: "High",
              details: `Required secondary code for ${rule.primaryCode}`,
            });
          }
        }
      }
    }
  }
  
  for (const term of allTerms) {
    if (foundTerms.includes(term.term) && term.matchedCode && !localMatches.some(m => m.code === term.matchedCode)) {
      if (suppressedCodes.has(term.matchedCode)) {
        continue;
      }
      
      const alreadyHandledByRule = localMatches.some(m => {
        const rule = allRules.find(r => r.primaryCode === m.code);
        return rule?.triggerTerms?.some(t => t.toLowerCase() === term.term.toLowerCase());
      });
      
      if (!alreadyHandledByRule) {
        localMatches.push({
          code: term.matchedCode,
          codeType: "ICD-10",
          description: explanationMap.get(term.matchedCode) || term.term,
          confidence: term.matchConfidence && term.matchConfidence >= 90 ? "High" : "Medium",
          details: explanationMap.get(term.matchedCode) || `Matched term: "${term.term}"`,
        });
      }
    }
  }
  
  return { localMatches, relatedCodes, matchedTerms };
}

const liveAnalysisTracker = new Map<string, { count: number; resetTime: number }>();
const LIVE_ANALYSIS_LIMIT = 20;
const LIVE_ANALYSIS_WINDOW = 60000;

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

const LIVE_SCAN_PROMPT = `You are a medical document text extraction and de-identification assistant. Your job is to:

1. EXTRACT all visible text from the medical document image
2. DE-IDENTIFY the text by replacing sensitive patient information with placeholders

DE-IDENTIFICATION RULES - Replace these with placeholders:
- Patient names → [PATIENT_NAME]
- Dates of birth → [DOB]
- Social Security Numbers → [SSN]
- Medical Record Numbers (MRN) → [MRN]
- Phone numbers → [PHONE]
- Addresses → [ADDRESS]
- Email addresses → [EMAIL]
- Insurance ID numbers → [INSURANCE_ID]
- Account numbers → [ACCOUNT_NUMBER]
- Any other personally identifiable information → [REDACTED]

PRESERVE these clinical elements (do not redact):
- Diagnoses and medical conditions
- Procedure names and descriptions
- Medications and dosages
- Lab values and vital signs
- Clinical notes and observations
- Provider names (doctors, nurses) - keep as [PROVIDER_NAME]
- Facility names - keep as [FACILITY_NAME]
- Dates of service (just the date, not DOB) - keep as [SERVICE_DATE]

Respond in JSON format:
{
  "extractedText": "The full de-identified text extracted from the document with placeholders replacing sensitive information",
  "redactedFields": [
    {
      "fieldType": "Patient Name",
      "originalPosition": "Description of where in document (e.g., 'top header')"
    }
  ],
  "clinicalContent": {
    "diagnoses": ["List of diagnoses found"],
    "procedures": ["List of procedures found"],
    "medications": ["List of medications found"],
    "labValues": ["List of lab values found"],
    "vitalSigns": ["List of vital signs found"],
    "clinicalNotes": "Any other clinical observations"
  },
  "documentType": "Type of document (e.g., 'Lab Report', 'Progress Note', 'Prescription')",
  "confidence": "High" | "Medium" | "Low"
}

If the image is blurry, unclear, or doesn't contain readable text, return:
{
  "extractedText": "",
  "error": "Description of issue (e.g., 'Image too blurry', 'No text visible')",
  "confidence": "Low"
}`;

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

  app.post("/api/analyze-live", async (req, res) => {
    try {
      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const clientId = req.ip || "default";
      const now = Date.now();
      const tracker = liveAnalysisTracker.get(clientId);

      if (tracker) {
        if (now > tracker.resetTime) {
          liveAnalysisTracker.set(clientId, { count: 1, resetTime: now + LIVE_ANALYSIS_WINDOW });
        } else if (tracker.count >= LIVE_ANALYSIS_LIMIT) {
          return res.status(429).json({ error: "Rate limit exceeded. Please wait before scanning again." });
        } else {
          tracker.count++;
        }
      } else {
        liveAnalysisTracker.set(clientId, { count: 1, resetTime: now + LIVE_ANALYSIS_WINDOW });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: LIVE_SCAN_PROMPT,
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
                text: "Extract all text from this medical document and de-identify any patient information.",
              },
            ],
          },
        ],
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      let parsed: {
        extractedText?: string;
        redactedFields?: Array<{ fieldType: string; originalPosition: string }>;
        clinicalContent?: {
          diagnoses?: string[];
          procedures?: string[];
          medications?: string[];
          labValues?: string[];
          vitalSigns?: string[];
          clinicalNotes?: string;
        };
        documentType?: string;
        confidence?: string;
        error?: string;
      };
      
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { extractedText: "", error: "Failed to parse response" };
      }

      let extractedText = parsed.extractedText || "";
      let redactedFields = parsed.redactedFields || [];
      
      const { cleanText, detectedPHI, wasModified } = enforceDeidentification(extractedText);
      extractedText = cleanText;
      
      if (wasModified) {
        console.log(`[SECURITY] Server-side PHI scrubbing applied: ${detectedPHI.length} items detected`);
        for (const detected of detectedPHI) {
          const existingField = redactedFields.find(f => 
            f.fieldType.toLowerCase().includes(detected.split(':')[0].toLowerCase())
          );
          if (!existingField) {
            redactedFields.push({
              fieldType: detected.split(':')[0] || 'Protected Health Information',
              originalPosition: 'Detected by server-side verification',
            });
          }
        }
      }

      res.json({
        extractedText,
        redactedFields,
        clinicalContent: parsed.clinicalContent || {},
        documentType: parsed.documentType || "Unknown",
        confidence: parsed.confidence || "Low",
        error: parsed.error,
        serverSideDeidentification: wasModified,
      });
    } catch (error) {
      console.error("Live analysis error:", error);
      res.status(500).json({ error: "Failed to analyze frame" });
    }
  });

  app.post("/api/analyze-text-for-codes", async (req, res) => {
    try {
      const { extractedText, clinicalContent } = req.body;

      if (!extractedText) {
        return res.status(400).json({ error: "No extracted text provided" });
      }

      const { localMatches, relatedCodes, matchedTerms } = await matchCodesFromDatabase(extractedText, clinicalContent);
      
      let aiSuggestions: CodeSuggestion[] = [];
      
      if (localMatches.length < 3 || (clinicalContent?.procedures && clinicalContent.procedures.length > 0)) {
        const clinicalContext = clinicalContent ? `
Clinical Content Summary:
- Diagnoses: ${clinicalContent.diagnoses?.join(", ") || "None identified"}
- Procedures: ${clinicalContent.procedures?.join(", ") || "None identified"}
- Medications: ${clinicalContent.medications?.join(", ") || "None identified"}
- Lab Values: ${clinicalContent.labValues?.join(", ") || "None identified"}
- Vital Signs: ${clinicalContent.vitalSigns?.join(", ") || "None identified"}
- Clinical Notes: ${clinicalContent.clinicalNotes || "None"}
` : "";

        const alreadyCodedInfo = localMatches.length > 0 
          ? `\n\nNOTE: The following codes have already been identified from our database and should NOT be duplicated: ${localMatches.map(m => m.code).join(", ")}. Focus on finding additional codes not yet identified, especially CPT procedure codes.`
          : "";

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are an expert medical coder. Based on the de-identified medical text and clinical content provided, suggest appropriate ICD-10 and CPT codes.

Analyze the clinical information and provide:
1. BEST MATCH codes - the most accurate codes supported by the documentation
2. EXCLUDED codes - codes that might seem relevant but should NOT be used, with clear explanations why

Respond in JSON format:
{
  "suggestions": [
    {
      "code": "ICD-10 or CPT code (e.g., J18.9, 99213)",
      "codeType": "ICD-10" or "CPT",
      "description": "Brief description of what this code represents",
      "confidence": "High" | "Medium" | "Low",
      "details": "Reasoning for suggesting this code based on the clinical information"
    }
  ],
  "excluded_codes": [
    {
      "code": "ICD-10 or CPT code that was considered but NOT selected",
      "codeType": "ICD-10" or "CPT",
      "description": "What this code represents",
      "reason": "Clear explanation of why this code should NOT be used based on the documentation (e.g., 'Documentation indicates condition was ruled out', 'No supporting evidence for this diagnosis', 'More specific code available')"
    }
  ]
}

Guidelines:
- Use official ICD-10-CM codes for diagnoses
- Use CPT codes for procedures and services
- Provide High confidence only when clinical information clearly supports the code
- Include all relevant codes that can be inferred from the document
- If information is ambiguous, use Medium or Low confidence
- ALWAYS provide excluded_codes - think about what codes a less experienced coder might incorrectly use and explain why they're wrong
- excluded_codes should include codes that are commonly confused or similar to the correct codes`,
            },
            {
              role: "user",
              content: `Please analyze this de-identified medical document text and suggest appropriate medical codes:

${extractedText}

${clinicalContext}${alreadyCodedInfo}`,
            },
          ],
          max_completion_tokens: 2048,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content || "{}";
        let parsed: { suggestions?: CodeSuggestion[] };
        
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = { suggestions: [] };
        }

        aiSuggestions = (parsed.suggestions || []).filter(
          s => !localMatches.some(lm => lm.code === s.code)
        );
      }

      const allSuggestions = [...localMatches, ...aiSuggestions];
      
      res.json({ 
        suggested_codes: allSuggestions,
        related_codes: relatedCodes,
        source: {
          database: localMatches.length,
          ai: aiSuggestions.length,
          matchedTerms: matchedTerms,
        }
      });
    } catch (error) {
      console.error("Text to codes analysis error:", error);
      res.status(500).json({ error: "Failed to analyze text for codes" });
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
