// AI writing for the email inbox. Gemini (free tier) is tried first; if it isn't configured,
// hits its quota or fails, the paid Claude API is used — when a key for it is set.
//
// Env:
//   GEMINI_API_KEY      free key from https://aistudio.google.com/apikey
//   GEMINI_MODEL        optional, default "gemini-2.5-flash"
//   ANTHROPIC_API_KEY   optional paid backup
//   ANTHROPIC_MODEL     optional, default "claude-opus-5-5"

import Anthropic from "@anthropic-ai/sdk";

export type AiProvider = "gemini" | "claude";
export type AiResult = { text: string; provider: AiProvider };

export class AiUnavailable extends Error {}

export function aiConfigured() {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Generate text from a system prompt + one user prompt, with automatic provider fallback. */
export async function generateText(system: string, prompt: string): Promise<AiResult> {
  const errors: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      return { text: await gemini(system, prompt), provider: "gemini" };
    } catch (e) {
      errors.push(`Gemini: ${(e as Error).message}`);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { text: await claude(system, prompt), provider: "claude" };
    } catch (e) {
      errors.push(`Claude: ${(e as Error).message}`);
    }
  }
  if (!errors.length) throw new AiUnavailable("AI writing isn't set up yet — add GEMINI_API_KEY to the server's environment variables.");
  console.error("[ai] all providers failed:", errors.join(" | "));
  throw new AiUnavailable(errors.some((e) => /quota|limit/i.test(e)) ? "The free AI quota is used up for now. Try again later, or add a paid backup key." : "The AI couldn't write a draft right now. Please try again.");
}

// ─── Gemini (REST) ───────────────────────────────────────────

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

async function gemini(system: string, prompt: string): Promise<string> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      const quota = res.status === 429 || data.error?.status === "RESOURCE_EXHAUSTED";
      throw new Error(quota ? "free quota reached" : `${res.status} ${data.error?.message ?? res.statusText}`);
    }
    if (data.promptFeedback?.blockReason) throw new Error(`blocked (${data.promptFeedback.blockReason})`);
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error(`empty response (${data.candidates?.[0]?.finishReason ?? "unknown"})`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Claude (paid backup) ────────────────────────────────────

let anthropic: Anthropic | null = null;

async function claude(system: string, prompt: string): Promise<string> {
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      // A short email draft doesn't need deep reasoning.
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new Error("declined to write this draft");
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error(`empty response (${response.stop_reason})`);
    return text;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new Error("rate limit reached");
    if (e instanceof Anthropic.AuthenticationError) throw new Error("invalid API key");
    if (e instanceof Anthropic.APIError) throw new Error(`${e.status ?? ""} ${e.message}`.trim());
    throw e;
  }
}
