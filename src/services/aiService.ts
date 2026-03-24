import { GoogleGenAI } from "@google/genai";
import { LoopCandidate } from "../types";

export class AIService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }

  async labelLoop(loop: LoopCandidate): Promise<{ label: string; tags: string[] }> {
    try {
      const prompt = `
        Analyze these audio features of a musical loop and provide a descriptive, creative label and 3-5 tags.
        
        BPM: ${loop.bpm}
        Key: ${loop.key}
        Rhythmic Density (0-1): ${loop.rhythmicDensity.toFixed(2)}
        Groove Consistency (0-1): ${loop.grooveConsistency.toFixed(2)}
        Spectral Stability (0-1): ${loop.hcdfStability.toFixed(2)}
        
        Return the result as JSON with "label" (string) and "tags" (string array).
        Example: { "label": "Crunchy 90s Drum Break", "tags": ["lofi", "dusty", "breakbeat", "drums"] }
      `;

      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      return {
        label: result.label || "Unknown Loop",
        tags: result.tags || []
      };
    } catch (error) {
      console.error("AI Labeling failed:", error);
      return {
        label: "Processed Loop",
        tags: ["audio", "loop"]
      };
    }
  }
}

export const aiService = new AIService();
