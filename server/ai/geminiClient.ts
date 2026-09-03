import { GoogleGenAI } from "@google/genai";
import { ChatMessage, AiGenerateRequest, AiGenerateResponse, TokenUsage } from "./types";
import { calculateAiCostUsd } from "./costCalculator";

let geminiInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!geminiInstance) {
    geminiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiInstance;
}

export async function generateWithGemini(
  request: AiGenerateRequest,
  options: { timeoutMs?: number } = {}
): Promise<AiGenerateResponse> {
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 45000;
  const ai = getGeminiClient();

  if (!ai) {
    throw new Error("GEMINI_API_KEY environment variable is missing");
  }

  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];

  let fullPrompt = "";
  for (const m of request.messages) {
    if (m.role !== "system") {
      fullPrompt += `${m.role.toUpperCase()}: ${m.content}\n\n`;
    }
  }
  fullPrompt = fullPrompt.trim() || "Iniciar raciocínio clínico.";

  let lastError: any = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];
    try {
      const responsePromise = ai.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        config: {
          systemInstruction: request.systemPrompt || undefined,
          temperature: request.temperature ?? 0.2,
          responseMimeType: request.responseFormat === "json" ? "application/json" : undefined,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms waiting for Gemini (${modelName})`)), timeoutMs)
      );

      const response: any = await Promise.race([responsePromise, timeoutPromise]);
      const text = response.text || "";
      const durationMs = Date.now() - startTime;

      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = response.usageMetadata?.totalTokenCount || (inputTokens + outputTokens);
      const estimatedCostUsd = calculateAiCostUsd(modelName, inputTokens, outputTokens);

      const usage: TokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd,
      };

      return {
        text,
        model: modelName,
        provider: "google",
        durationMs,
        usage,
      };
    } catch (err: any) {
      lastError = err;
      const isRateOrQuota =
        err?.status === 429 ||
        err?.code === 429 ||
        /429|quota|rate|exhausted/i.test(err?.message || "");

      console.warn(`[Gemini Client] Model ${modelName} attempt failed (rateLimit: ${isRateOrQuota}):`, err?.message || err);

      // If rate limited, sleep briefly before next candidate model
      if (isRateOrQuota && i < candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
      }
    }
  }

  throw lastError || new Error("All Gemini candidate models failed");
}

export async function* streamWithGemini(
  request: AiGenerateRequest
): AsyncGenerator<string, void, unknown> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY environment variable is missing");
  }

  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let fullPrompt = "";
  for (const m of request.messages) {
    if (m.role !== "system") {
      fullPrompt += `${m.role.toUpperCase()}: ${m.content}\n\n`;
    }
  }
  const promptContent = fullPrompt.trim() || "Iniciar raciocínio clínico.";

  let lastError: any = null;

  for (const modelName of candidateModels) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: promptContent,
        config: {
          systemInstruction: request.systemPrompt || undefined,
          temperature: request.temperature ?? 0.2,
        },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini Stream] Model ${modelName} stream error:`, err?.message || err);
    }
  }

  throw lastError || new Error("All Gemini stream candidate models failed");
}
