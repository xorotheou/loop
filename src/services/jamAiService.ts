import { GoogleGenAI } from "@google/genai";
import { LoopCandidate } from "../types";

export class JamAiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async suggestLoopFill(currentLoops: LoopCandidate[], bpm: number): Promise<string> {
    const loopDescriptions = currentLoops.map(l => 
      `- ${l.aiClassification || 'Unknown'} loop at ${l.bpm} BPM (Score: ${l.score.toFixed(2)})`
    ).join('\n');

    const prompt = `
      You are a music production assistant. 
      The user is currently jamming with the following loops at ${bpm} BPM:
      ${loopDescriptions || 'No loops active yet.'}

      Suggest ONE missing element that would complement this jam. 
      Provide a brief musical reason why it fits.
      Also, provide a short prompt that could be used in a generative audio AI (like MusicLM or AudioCraft) to create this missing loop.

      Format your response as:
      SUGGESTION: [The element]
      REASON: [The reason]
      PROMPT: [The AI prompt]
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      return response.text || "No suggestion available.";
    } catch (error) {
      console.error("Jam AI Suggestion failed:", error);
      return "Failed to get suggestion.";
    }
  }
}

export const jamAiService = new JamAiService();
