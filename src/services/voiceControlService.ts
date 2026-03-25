import { FunctionDeclaration, GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { audioEngine } from "./audioEngine";

export class VoiceControlService {
  private ai: GoogleGenAI;
  private session: any;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async start(onStatus: (status: string) => void) {
    onStatus("Initializing Voice Control...");
    
    const controlFunctions: FunctionDeclaration[] = [
      {
        name: "toggleJam",
        description: "Start or pause the jam session",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "setBpm",
        description: "Set the BPM of the jam session",
        parameters: {
          type: Type.OBJECT,
          properties: {
            bpm: { type: Type.NUMBER, description: "BPM value (e.g. 120)" }
          },
          required: ["bpm"]
        }
      },
      {
        name: "setReverb",
        description: "Set the master reverb wet level",
        parameters: {
          type: Type.OBJECT,
          properties: {
            wet: { type: Type.NUMBER, description: "Wet level from 0 to 1" }
          },
          required: ["wet"]
        }
      },
      {
        name: "setDelay",
        description: "Set the master delay wet level",
        parameters: {
          type: Type.OBJECT,
          properties: {
            wet: { type: Type.NUMBER, description: "Wet level from 0 to 1" }
          },
          required: ["wet"]
        }
      }
    ];

    this.session = await this.ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: "You are a studio assistant. You can control the jam session, set BPM, and adjust effects. Use the provided tools to execute commands. Keep your responses brief.",
        tools: [{ functionDeclarations: controlFunctions }]
      },
      callbacks: {
        onopen: () => {
          onStatus("Listening...");
          this.startMic();
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.functionCall) {
                const { name, args, id } = part.functionCall;
                console.log("Voice Command:", name, args);
                this.handleToolCall(name, args);
                
                // Send response back
                this.session.sendToolResponse({
                  functionResponses: [{
                    name,
                    id,
                    response: { result: "success" }
                  }]
                });
              }
            }
          }
        },
        onclose: () => onStatus("Voice Control Closed"),
        onerror: (err) => {
          console.error("Voice Control Error:", err);
          onStatus("Error: " + err.message);
        }
      }
    });
  }

  private handleToolCall(name: string, args: any) {
    switch (name) {
      case "toggleJam":
        audioEngine.toggleJam();
        break;
      case "setBpm":
        audioEngine.setBpm(args.bpm);
        break;
      case "setReverb":
        audioEngine.setReverb(args.wet);
        break;
      case "setDelay":
        audioEngine.setDelay(args.wet);
        break;
    }
  }

  private async startMic() {
    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        // Convert Int16Array to base64
        const uint8 = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Data = btoa(binary);

        if (this.session) {
          this.session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: "audio/pcm;rate=16000" }
          });
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (err) {
      console.error("Failed to start mic", err);
    }
  }

  stop() {
    if (this.session) this.session.close();
    if (this.processor) this.processor.disconnect();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.audioContext) this.audioContext.close();
    
    this.session = null;
    this.processor = null;
    this.stream = null;
    this.audioContext = null;
  }
}

export const voiceControlService = new VoiceControlService();
