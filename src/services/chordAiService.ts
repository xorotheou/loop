import { GoogleGenAI, Type } from "@google/genai";
import { ChordSuggestion } from "../types";

export class ChordAiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async suggestChords(key: string, bpm: number, mood: string = "energetic"): Promise<ChordSuggestion[]> {
    const prompt = `Suggest a 4-chord progression in the key of ${key} at ${bpm} BPM with a ${mood} mood. 
    Return the chords as a list of MIDI note names (e.g., ["C4", "E4", "G4"]).
    Include duration (e.g., "1n", "2n") and velocity (0-1).`;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING, description: "Chord name (e.g. C Major)" },
              notes: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "List of MIDI notes"
              },
              duration: { type: Type.STRING, description: "Tone.js duration string" },
              velocity: { type: Type.NUMBER }
            },
            required: ["id", "name", "notes", "duration", "velocity"]
          }
        }
      }
    });

    try {
      const chords = JSON.parse(response.text) as ChordSuggestion[];
      return chords.map((c, i) => ({
        ...c,
        id: `chord-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 9)}`
      }));
    } catch (e) {
      console.error("Failed to parse chord suggestions", e);
      return [];
    }
  }
}

export const chordAiService = new ChordAiService();
