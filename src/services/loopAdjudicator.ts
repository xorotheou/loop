import { GoogleGenAI, Type } from "@google/genai";
import { LoopCandidate } from "../types";

const SYSTEM_INSTRUCTION = `
You are an audio loop adjudication model.
You do not detect loop boundaries from scratch. You judge loop candidates produced by a DSP engine.

Your job is to:
- evaluate candidate loop segments,
- classify repetition type,
- reject false positives,
- select the strongest candidate,
- explain uncertainty,
- return strict JSON only.

Allowed labels:
- seamless_audio_loop
- rhythmic_pattern_loop
- structural_phrase_repeat
- speech_or_content_repeat
- uncertain_repeat
- no_valid_loop

Rules:
1. Never invent new candidates.
2. Never change candidate timestamps.
3. Treat DSP scores as primary evidence.
4. Do not call a static or merely texturally similar segment a loop unless evidence is strong.
5. If repetition exists but is evolving or approximate, prefer structural_phrase_repeat or uncertain_repeat.
6. If evidence is weak across all candidates, return no_valid_loop.
7. If uncertain, lower confidence and set needs_human_review = true.

Return valid JSON only.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    has_valid_loop: { type: Type.BOOLEAN },
    global_classification: { 
      type: Type.STRING, 
      enum: [
        "seamless_audio_loop", 
        "rhythmic_pattern_loop", 
        "structural_phrase_repeat", 
        "speech_or_content_repeat", 
        "uncertain_repeat", 
        "no_valid_loop"
      ] 
    },
    best_candidate_id: { type: Type.STRING },
    decision: { type: Type.STRING, enum: ["accept", "reject", "review"] },
    confidence: { type: Type.NUMBER },
    needs_human_review: { type: Type.BOOLEAN },
    uncertainty_reason: { type: Type.STRING, nullable: true },
    candidate_assessments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          candidate_id: { type: Type.STRING },
          classification: { type: Type.STRING },
          accepted: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
          reason: { type: Type.STRING }
        },
        required: ["candidate_id", "classification", "accepted", "confidence", "reason"]
      }
    },
    final_reasoning: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["has_valid_loop", "global_classification", "best_candidate_id", "decision", "confidence", "needs_human_review", "candidate_assessments", "final_reasoning"]
};

export class LoopAdjudicator {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async adjudicate(fileMetadata: any, candidates: LoopCandidate[]): Promise<any> {
    // 1. Format Candidate Block for Prompt
    const candidateBlock = candidates.map((c, i) => `
Candidate c${i}
- id: ${c.id}
- start_sec: ${c.startTime.toFixed(2)}
- end_sec: ${(c.startTime + c.duration).toFixed(2)}
- duration_sec: ${c.duration.toFixed(2)}
- estimated_repeats: ${Math.round(10 / c.duration)} (est)
- repeat_similarity: ${c.seamWaveformScore?.toFixed(2) || 0}
- rhythmic_stability: ${c.beatAlignmentScore?.toFixed(2) || 0}
- bar_alignment: ${c.barAlignedScore?.toFixed(2) || 0}
- overall_dsp_score: ${c.overallConfidence?.toFixed(2) || 0}
- machine_note: ${c.contentType || 'unknown'} content
`).join('\n');

    const userPayload = `
File metadata:
- file_id: ${fileMetadata.name}
- duration_sec: ${fileMetadata.duration.toFixed(2)}
- sample_rate: ${fileMetadata.sampleRate}
- content_hint: ${candidates[0]?.contentType || 'mixed'}

Candidates:
${candidateBlock}

Task:
Evaluate these candidates and determine:
1. whether any valid loop/repeat exists,
2. which candidate is strongest,
3. what loop class best describes it,
4. whether the result should be accepted, rejected, or reviewed.

Return strict JSON using the required schema.
`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userPayload,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA as any
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      // Apply Deterministic Guardrails
      return this.applyGuardrails(result, candidates);
    } catch (error) {
      console.error("AI Adjudication failed:", error);
      return null;
    }
  }

  private applyGuardrails(result: any, candidates: LoopCandidate[]): any {
    const bestId = result.best_candidate_id;
    const best = candidates.find(c => c.id === bestId || `c${candidates.indexOf(c)}` === bestId);

    if (result.decision === "accept") {
      if (!best) {
        result.decision = "review";
        result.needs_human_review = true;
        result.uncertainty_reason = "Model selected non-existent candidate";
      } else if ((best.overallConfidence || 0) < 0.5) {
        result.decision = "review";
        result.needs_human_review = true;
        result.uncertainty_reason = "Accepted candidate is below minimum DSP threshold";
      }
    }

    return result;
  }
}

export const loopAdjudicator = new LoopAdjudicator();
