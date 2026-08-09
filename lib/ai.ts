import { generateText, generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { z } from "zod";

/**
 * Self-hosted "AI Service Agent" config. Mirrors the lib/mail.ts ethos: read
 * straight from process.env at call time, gate on a *Configured() boolean, and
 * never leak secrets to the client. All AI runs server-side (server actions).
 *
 * `ollama` is a LOCAL, OpenAI-compatible endpoint — no key, data stays on-box.
 * `anthropic`/`openai` are EXTERNAL and require AI_ALLOW_EXTERNAL="true".
 */
export type AiProvider = "anthropic" | "openai" | "ollama";

/** The only local provider — never gated by AI_ALLOW_EXTERNAL. */
const LOCAL_PROVIDERS: readonly AiProvider[] = ["ollama"];

function provider(): AiProvider {
  const p = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (p === "openai") return "openai";
  if (p === "ollama") return "ollama";
  return "anthropic";
}

/** Privacy gate: true when external (non-local) providers are permitted. */
function allowExternal(): boolean {
  return process.env.AI_ALLOW_EXTERNAL === "true";
}

function isLocal(p: AiProvider): boolean {
  return LOCAL_PROVIDERS.includes(p);
}

/** Per-provider default model when AI_MODEL is unset. */
function defaultModel(p: AiProvider): string {
  if (p === "openai") return "gpt-4o";
  if (p === "ollama") return process.env.OLLAMA_MODEL || "llama3.1";
  return "claude-opus-4-8"; // anthropic default
}

function modelId(p: AiProvider): string {
  return process.env.AI_MODEL || defaultModel(p);
}

/**
 * The gate (mirrors smtpConfigured() in lib/mail.ts). True only when the
 * configured provider can actually run:
 *  - local (ollama): always OK (no key needed)
 *  - external (anthropic/openai): requires AI_ALLOW_EXTERNAL="true" AND its key
 */
export function aiConfigured(): boolean {
  const p = provider();
  if (isLocal(p)) return true;
  if (!allowExternal()) return false; // privacy gate blocks external providers
  if (p === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (p === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return false;
}

/**
 * "Teaser" mode: when AI is NOT configured, still show the AI buttons as a
 * preview (a nudge to enable the feature). Clicking them surfaces a friendly
 * hint instead of running anything. Independent of aiConfigured().
 */
export function aiTeaserEnabled(): boolean {
  return process.env.AI_TEASER === "true";
}

/** Safe status object for UI/debugging — contains no secrets. */
export function aiStatus(): {
  configured: boolean;
  provider: AiProvider;
  model: string;
  local: boolean;
  externalAllowed: boolean;
} {
  const p = provider();
  return {
    configured: aiConfigured(),
    provider: p,
    model: modelId(p),
    local: isLocal(p),
    externalAllowed: allowExternal(),
  };
}

/**
 * Hard backstop: throws before any network call if a non-local provider is
 * selected while AI_ALLOW_EXTERNAL is false, so a misconfiguration can never
 * push ticket data off-box.
 */
function assertPrivacy(p: AiProvider): void {
  if (!isLocal(p) && !allowExternal()) {
    throw new Error(
      `AI provider "${p}" is external and AI_ALLOW_EXTERNAL is not "true". Refusing to send data off-box.`,
    );
  }
}

/** Resolve the AI SDK model for the current AI_PROVIDER. Key stays in process.env. */
function getModel() {
  const p = provider();
  assertPrivacy(p);
  const id = modelId(p);

  if (p === "anthropic") {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(id);
  }

  if (p === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(id);
  }

  // ollama — local, OpenAI-compatible, no API key required.
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  });
  return ollama(id);
}

function maxOutputTokens(): number {
  const n = Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 1024);
  return Number.isFinite(n) && n > 0 ? n : 1024;
}

/** Thin wrapper over generateText. Returns trimmed text. */
export async function generateAiText(input: {
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const { text } = await generateText({
    model: getModel(),
    system: input.system,
    prompt: input.prompt,
    maxOutputTokens: input.maxOutputTokens ?? maxOutputTokens(),
  });
  return text.trim();
}

/** Thin wrapper over generateObject. Returns the typed object. */
export async function generateAiObject<T>(input: {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
}): Promise<T> {
  const { object } = await generateObject({
    model: getModel(),
    system: input.system,
    prompt: input.prompt,
    schema: input.schema,
    maxOutputTokens: input.maxOutputTokens ?? maxOutputTokens(),
  });
  return object;
}
