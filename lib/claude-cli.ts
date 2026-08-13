import {
  query,
  tool as sdkTool,
  createSdkMcpServer,
} from "@anthropic-ai/claude-agent-sdk";
import type { ModelMessage, ToolSet } from "ai";
import type { ZodRawShape } from "zod";
import { getSetting } from "@/lib/settings";

/**
 * OPT-IN backend that answers the standalone Sable chat via the Claude Agent SDK,
 * which drives the locally-installed, logged-in `claude` CLI. Because that CLI
 * runs under the operator's own Claude login, this uses their Pro/Max
 * SUBSCRIPTION rather than a pay-per-token API key (verified: query() succeeds
 * with no ANTHROPIC_API_KEY set).
 *
 * Crucially, our EXISTING ai-sdk tools are adapted 1:1 into in-process SDK tools
 * (an in-process MCP server), so this backend gets the SAME tool set + proposals
 * as the built-in provider — with zero tool-logic duplication. The tool handlers
 * run in THIS Node process, so they keep direct `db` access and the acting
 * agent's captured context (no HTTP, no token round-trip).
 *
 * TRADE-OFFS (surfaced before enabling): grey area vs. Anthropic's consumer
 * terms; data leaves the box (goes to Anthropic); fragile across CLI/SDK updates.
 */

const MCP_SERVER = "servio";
const TOOL_PREFIX = `mcp__${MCP_SERVER}__`;

/** Built-in Claude Code tools we deny so the model never touches the host/web. */
const DISALLOWED_TOOLS = [
  "Bash", "Edit", "Write", "Read", "MultiEdit", "NotebookEdit",
  "Glob", "Grep", "WebSearch", "WebFetch", "Task", "TodoWrite",
];

/** Extract a zod raw shape ({field: zodType}) from an ai-sdk tool's inputSchema. */
function rawShape(inputSchema: unknown): Record<string, unknown> {
  const s = inputSchema as { shape?: Record<string, unknown> } | undefined;
  return s?.shape && typeof s.shape === "object" ? s.shape : {};
}

/**
 * Adapt an ai-sdk ToolSet into in-process SDK MCP tools. Each SDK tool simply
 * calls the original ai-sdk `execute` and serialises the result as text — so the
 * model sees identical behaviour to the built-in provider.
 */
function adaptTools(aiSdkTools: ToolSet) {
  return Object.entries(aiSdkTools).map(([name, t]) => {
    const def = t as {
      description?: string;
      inputSchema?: unknown;
      execute?: (args: unknown, opts: unknown) => Promise<unknown> | unknown;
    };
    return sdkTool(
      name,
      def.description ?? name,
      // The raw shape is a plain object of zod fields (SDK-compatible).
      rawShape(def.inputSchema) as ZodRawShape,
      async (args: unknown) => {
        let out: unknown;
        try {
          out = await def.execute?.(args, { toolCallId: name, messages: [] });
        } catch (e) {
          out = { error: e instanceof Error ? e.message : "tool failed" };
        }
        const text = typeof out === "string" ? out : JSON.stringify(out ?? {});
        return { content: [{ type: "text" as const, text }] };
      },
    );
  });
}

/** Flatten one message's content (string or multimodal parts) to plain text. */
function partText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        const part = p as { type?: string; text?: string };
        if (part.type === "text") return part.text ?? "";
        // The real image/document is sent as a content block alongside the
        // transcript (see buildStructuredPrompt); the text just references it.
        if (part.type === "image") return "(image attached)";
        if (part.type === "file") return "(file attached)";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Render the bounded history as a labelled transcript ending in an open Assistant turn. */
function buildTranscript(messages: ModelMessage[]): string {
  const lines = messages.map(
    (m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${partText(m.content)}`,
  );
  lines.push("Assistant:");
  return lines.join("\n\n");
}

/** Parse a data URL into an Anthropic base64 source ({ media_type, data }). */
function dataUrlToSource(dataUrl: string): { media_type: string; data: string } | null {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  return m ? { media_type: m[1], data: m[2] } : null;
}

type BinaryBlock =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

/** Extract Anthropic image/document blocks from ai-sdk image/file parts. */
function binaryBlocks(messages: ModelMessage[]): BinaryBlock[] {
  const blocks: BinaryBlock[] = [];
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const p of m.content as Array<{ type?: string; image?: unknown; data?: unknown; mediaType?: string }>) {
      if (p.type === "image" && typeof p.image === "string") {
        const src = dataUrlToSource(p.image);
        if (src) blocks.push({ type: "image", source: { type: "base64", ...src } });
      } else if (p.type === "file" && typeof p.data === "string" && p.mediaType === "application/pdf") {
        const src = dataUrlToSource(p.data);
        if (src) blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: src.data } });
      }
    }
  }
  return blocks;
}

/**
 * Run one chat turn through the Claude Agent SDK (subscription-powered) with our
 * tools exposed in-process. Returns the same shape as generateAiChat, including
 * the tool calls (prefix-stripped) so the caller can build activity chips and
 * approval cards exactly as it does for the built-in provider.
 */
export async function generateViaClaudeSdk(input: {
  system?: string;
  messages: ModelMessage[];
  aiSdkTools: ToolSet;
  model?: string;
  maxTurns?: number;
  /** Enable extended thinking with this token budget; captured reasoning is returned. */
  maxThinkingTokens?: number;
}): Promise<{ text: string; toolCalls: { name: string; input: unknown }[]; reasoning?: string }> {
  const model = input.model || (await getSetting("AI_MODEL")) || "sonnet";
  const server = createSdkMcpServer({
    name: MCP_SERVER,
    version: "1.0.0",
    tools: adaptTools(input.aiSdkTools),
  });
  const allowedTools = Object.keys(input.aiSdkTools).map((n) => TOOL_PREFIX + n);

  const toolCalls: { name: string; input: unknown }[] = [];
  const reasoningParts: string[] = [];
  let finalText = "";
  let errorSubtype: string | null = null;

  const options: Record<string, unknown> = {
    model,
    systemPrompt: input.system, // a plain string REPLACES Claude Code's default
    mcpServers: { [MCP_SERVER]: server },
    allowedTools,
    disallowedTools: DISALLOWED_TOOLS,
    settingSources: [], // don't load project CLAUDE.md / settings
    maxTurns: input.maxTurns ?? 12,
  };
  if (input.maxThinkingTokens && input.maxThinkingTokens > 0) {
    options.maxThinkingTokens = input.maxThinkingTokens;
  }

  // When the turn carries images/PDFs, send a structured user message with real
  // Anthropic content blocks (Claude is vision-capable) instead of flattening to
  // text; otherwise keep the simple string transcript.
  const blocks = binaryBlocks(input.messages);
  const transcript = buildTranscript(input.messages);
  const prompt = blocks.length
    ? (async function* () {
        yield {
          type: "user" as const,
          message: { role: "user" as const, content: [{ type: "text", text: transcript }, ...blocks] },
          parent_tool_use_id: null,
        };
      })()
    : transcript;

  const iterator = query({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt: prompt as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: options as any,
  });

  for await (const message of iterator as AsyncIterable<Record<string, unknown>>) {
    const msg = message as {
      type: string;
      subtype?: string;
      result?: string;
      message?: {
        content?: Array<{ type?: string; name?: string; input?: unknown; thinking?: string }>;
      };
    };
    if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === "tool_use" && typeof block.name === "string" && block.name.startsWith(TOOL_PREFIX)) {
          toolCalls.push({ name: block.name.slice(TOOL_PREFIX.length), input: block.input });
        } else if (block.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
          reasoningParts.push(block.thinking.trim());
        }
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") finalText = String(msg.result ?? "");
      else errorSubtype = msg.subtype ?? "error";
    }
  }

  if (!finalText.trim() && errorSubtype) {
    throw new Error(`Claude subscription backend error: ${errorSubtype}`);
  }
  return {
    text: finalText.trim(),
    toolCalls,
    reasoning: reasoningParts.length ? reasoningParts.join("\n\n") : undefined,
  };
}
