import { generateText, generateObject, stepCountIs } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelMessage, ToolSet } from "ai";
import type { z } from "zod";
import { getSetting, getBoolSetting, getNumberSetting } from "@/lib/settings";

/**
 * Self-hosted "AI Service Agent" (Vio) config. Config is resolved through
 * lib/settings (DB AppSetting overrides process.env), gated on an async
 * *Configured() boolean, and secrets never leak to the client. All AI runs
 * server-side (server actions / route handlers).
 *
 * `ollama` is a LOCAL, OpenAI-compatible endpoint — no key, data stays on-box.
 * `anthropic`/`openai` are EXTERNAL and require AI_ALLOW_EXTERNAL="true".
 */
export type AiProvider = "anthropic" | "openai" | "ollama";

/** The only local provider — never gated by AI_ALLOW_EXTERNAL. */
const LOCAL_PROVIDERS: readonly AiProvider[] = ["ollama"];

async function provider(): Promise<AiProvider> {
  const p = ((await getSetting("AI_PROVIDER")) ?? "anthropic").toLowerCase();
  if (p === "openai") return "openai";
  if (p === "ollama") return "ollama";
  return "anthropic";
}

/** Privacy gate: true when external (non-local) providers are permitted. */
async function allowExternal(): Promise<boolean> {
  return getBoolSetting("AI_ALLOW_EXTERNAL");
}

function isLocal(p: AiProvider): boolean {
  return LOCAL_PROVIDERS.includes(p);
}

/** Per-provider default model when AI_MODEL is unset. */
async function defaultModel(p: AiProvider): Promise<string> {
  if (p === "openai") return "gpt-4o";
  if (p === "ollama") return (await getSetting("OLLAMA_MODEL")) || "llama3.1";
  return "claude-opus-4-8"; // anthropic default
}

async function modelId(p: AiProvider): Promise<string> {
  return (await getSetting("AI_MODEL")) || (await defaultModel(p));
}

/**
 * The gate (mirrors smtpConfigured() in lib/mail.ts). True only when the
 * configured provider can actually run:
 *  - local (ollama): always OK (no key needed)
 *  - external (anthropic/openai): requires AI_ALLOW_EXTERNAL="true" AND its key
 */
export async function aiConfigured(): Promise<boolean> {
  const p = await provider();
  if (isLocal(p)) return true;
  if (!(await allowExternal())) return false; // privacy gate blocks external providers
  if (p === "anthropic") return Boolean(await getSetting("ANTHROPIC_API_KEY"));
  if (p === "openai") return Boolean(await getSetting("OPENAI_API_KEY"));
  return false;
}

/**
 * "Teaser" mode: when AI is NOT configured, still show the AI buttons as a
 * preview (a nudge to enable the feature). Clicking them surfaces a friendly
 * hint instead of running anything. Independent of aiConfigured().
 */
export async function aiTeaserEnabled(): Promise<boolean> {
  return getBoolSetting("AI_TEASER");
}

/** Safe status object for UI/debugging — contains no secrets. */
export async function aiStatus(): Promise<{
  configured: boolean;
  provider: AiProvider;
  model: string;
  local: boolean;
  externalAllowed: boolean;
}> {
  const p = await provider();
  return {
    configured: await aiConfigured(),
    provider: p,
    model: await modelId(p),
    local: isLocal(p),
    externalAllowed: await allowExternal(),
  };
}

/**
 * Hard backstop: throws before any network call if a non-local provider is
 * selected while AI_ALLOW_EXTERNAL is false, so a misconfiguration can never
 * push ticket data off-box.
 */
async function assertPrivacy(p: AiProvider): Promise<void> {
  if (!isLocal(p) && !(await allowExternal())) {
    throw new Error(
      `AI provider "${p}" is external and AI_ALLOW_EXTERNAL is not "true". Refusing to send data off-box.`,
    );
  }
}

/** Resolve the AI SDK model for the current AI_PROVIDER. Keys stay server-side. */
async function getModel() {
  const p = await provider();
  await assertPrivacy(p);
  const id = await modelId(p);

  if (p === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: (await getSetting("ANTHROPIC_API_KEY")) ?? undefined,
    });
    return anthropic(id);
  }

  if (p === "openai") {
    // OPENAI_BASE_URL lets you point at any OpenAI-compatible cloud (OpenAI,
    // Moonshot/Kimi, Zhipu/GLM, OpenRouter, …) — the model id comes from AI_MODEL.
    const openai = createOpenAI({
      apiKey: (await getSetting("OPENAI_API_KEY")) ?? undefined,
      baseURL: (await getSetting("OPENAI_BASE_URL")) || undefined,
    });
    return openai(id);
  }

  // ollama — local, OpenAI-compatible, no API key required.
  // supportsStructuredOutputs → the SDK sends response_format:json_schema (strict),
  // so Ollama grammar-constrains output to our zod schema (fixes generateObject:
  // without it the model free-forms JSON with wrong keys / missing fields).
  const ollama = createOpenAICompatible({
    name: "ollama",
    baseURL: (await getSetting("OLLAMA_BASE_URL")) || "http://localhost:11434/v1",
    supportsStructuredOutputs: true,
  });
  return ollama(id);
}

async function maxOutputTokens(): Promise<number> {
  const n = await getNumberSetting("AI_MAX_OUTPUT_TOKENS", 1024);
  return Number.isFinite(n) && n > 0 ? n : 1024;
}

/** Thin wrapper over generateText. Returns trimmed text. */
export async function generateAiText(input: {
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<string> {
  const { text } = await generateText({
    model: await getModel(),
    system: input.system,
    prompt: input.prompt,
    maxOutputTokens: input.maxOutputTokens ?? (await maxOutputTokens()),
    temperature: input.temperature,
  });
  return text.trim();
}

/**
 * Multi-step chat with optional tools (the agent loop). The model may call tools
 * (e.g. web search) up to maxSteps times before producing its final answer.
 * Returns the final text plus the tool calls it made (for UI activity display).
 */
export async function generateAiChat(input: {
  system?: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  maxSteps?: number;
  temperature?: number;
}): Promise<{ text: string; toolCalls: { name: string; input: unknown }[] }> {
  const result = await generateText({
    model: await getModel(),
    system: input.system,
    messages: input.messages,
    tools: input.tools,
    stopWhen: stepCountIs(input.maxSteps ?? 6),
    temperature: input.temperature,
    maxOutputTokens: Math.max(await maxOutputTokens(), 2048),
  });
  const toolCalls = result.steps.flatMap((s) =>
    s.toolCalls.map((tc) => ({ name: tc.toolName, input: (tc as { input?: unknown }).input })),
  );
  return { text: result.text.trim(), toolCalls };
}

/** Thin wrapper over generateObject. Returns the typed object. */
export async function generateAiObject<T>(input: {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
}): Promise<T> {
  const { object } = await generateObject({
    model: await getModel(),
    system: input.system,
    prompt: input.prompt,
    schema: input.schema,
    maxOutputTokens: input.maxOutputTokens ?? (await maxOutputTokens()),
  });
  return object;
}
