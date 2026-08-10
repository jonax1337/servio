# 🤖 Vio — the built-in AI agent

**Vio** is Servio's built-in AI service-desk agent. Unlike a bolt-on chatbot, Vio is wired into
the platform's data and its RBAC: it can read your queue, search across the app and the web, and
**propose concrete changes that you approve with one click** before anything is written.

Vio is **optional and off by default**, **self-hostable** (runs fully local against Ollama), and
**privacy-first** (a hard gate blocks any external provider unless you explicitly opt in). All AI
runs server-side — provider keys never reach the browser.

See also: [configuration.md](configuration.md#ai-service-agent-vio) for the environment/settings
reference, and [architecture.md](architecture.md) for the runtime model.

---

## Where Vio lives

| Surface | Location | Audience |
| --- | --- | --- |
| Standalone assistant | `app/(console)/assistant/` → route `/assistant` (sidebar item **Vio**, `Sparkles` icon) | Agents+ |
| Top-bar launcher | `components/assistant/vio-launcher.tsx` (mounted in `components/app-topbar.tsx`) | Agents+ |

The assistant is a dual-pane page: a left rail (conversation history + scope switcher) and the
chat panel. Access requires the **AGENT** role (re-asserted in `app/(console)/assistant/page.tsx`
and again server-side in every action).

### Scopes

| Scope | Who sees it | What it's for |
| --- | --- | --- |
| **General** | All agents | Day-to-day service-desk work: your queue, tickets, KB, records. |
| **Admin** | Admins only (extra tab) | System-wide stats, settings, and management operations. |

Non-admins only ever get the General scope; the Admin tab is hidden **and** the Admin operations
are refused server-side. Scope is a property of each conversation (`AiConversation.scope`).

---

## Vio in the self-service portal (end users)

A separate, **USER-scoped** assistant lives in the help center — a floating **Ask Vio** widget
(`components/portal/vio-widget.tsx`) mounted in `app/portal/layout.tsx`, gated by the same
`aiConfigured()` / `aiTeaserEnabled()` switches. It is deliberately smaller and safer than the
console Vio and shares **none** of the agent tools.

- **Backend:** `lib/portal-assistant.ts` builds a per-request tool set bound to the caller's id
  (`buildPortalTools(userId)`). Chat runs through `app/api/portal/assistant/route.ts`; drafts are
  confirmed via `app/api/portal/assistant/create/route.ts`.
- **Read tools (public / own only):** `search_knowledge` (published **public** articles),
  `search_catalog`, `list_categories`, `get_service_form`, keyless `web_search` / `fetch_url`, and
  the caller's **own** tickets — `list_my_tickets` / `get_my_ticket` (public content only; internal
  notes are excluded by the same `isInternal: false` filter the portal UI uses).
- **Confirm-first writes:** every `propose_*` only drafts; the widget renders a confirm card and the
  create route re-validates server-side before acting as the signed-in user:
  - `propose_request` → `createPortalTicketFor` (routed ticket with type / priority / impact /
    urgency and an optional category),
  - `propose_service_request` → `createCatalogRequestFor` (fills a catalog item's dynamic form),
  - `propose_reply` → `addPortalReply` (a **public** reply on one of the user's own open tickets).

  Portal/Vio tickets carry `source: "VIO"` (a purple "via Vio" badge, `SOURCE_META.VIO`).
- **Attachments & vision:** the widget stages files (images / PDF / …, incl. `.eml`) and sends the
  current turn to a vision-capable model; anything attached is linked onto the ticket Vio opens. On
  the `claude-code` backend images are passed as real Anthropic content blocks
  (`lib/claude-cli.ts`) instead of being flattened to text.

The shared creation core (`lib/portal-tickets.ts`) routes catalog requests to the item's
**service team → category team → Service Desk triage**, runs automations, then auto-assigns; free-form
tickets default to Service Desk triage. Team ownership on `Service` / `Category` (`groupId`) is
informational (surfaced to Vio) and only *pre-routes* catalog requests — it never auto-routes
free-form tickets.

---

## What Vio can do

Vio's capabilities split cleanly into **read tools** (run immediately) and **write operations**
(propose-only — see [the approve-first flow](#the-approve-first-flow)). The section above covers the
portal assistant; the rest of this page describes the **agent console** Vio.

### Read & research tools

General scope (`lib/assistant-tools.ts` + `lib/ai-tools.ts`):

- `list_my_tickets` — the signed-in agent's personal queue (active first).
- `list_team_tickets` — the agent's team backlog (e.g. unassigned work to pick up).
- `list_tickets` — structured filters (assignee / status / priority / team).
- `get_ticket` — full detail of one ticket: SLA due dates & breaches, impact/urgency, comments.
- `search_tickets`, `search_problems`, `search_changes` — free-text search.
- `search_knowledge_base` — internal KB articles.
- `web_search`, `fetch_url` — public web + read a URL, for facts not documented in-house.

Admin scope adds (`lib/ai-admin-tools.ts`, `lib/ai-stats.ts`):

- `get_statistics` — live metrics: tickets by status/priority/team/category, open counts,
  created/resolved over a timeframe, SLA breaches, users by role, a counts overview.
- `get_settings_overview` — non-secret settings and whether each secret is set (never the value).
- `search_people`, `search_groups`, `search_categories`, `search_services` — record lookups.

Identity is always captured server-side (the acting agent's id and team memberships) — the model
can never spoof "who am I".

### Write operations (RBAC-gated, propose-only)

Every mutation Vio can suggest is defined as an `AiOperation` in `lib/ai-operations/` and surfaced
to the model as a `propose_*` tool. Coverage by module:

| Module | File | Operations (write) |
| --- | --- | --- |
| Tickets | `modules/tickets.ts` | create, update field/status/priority, comment, resolve, escalate, link, tasks, work-log, tags, watch, major-incident |
| Categories & Tags | `modules/taxonomy.ts` | category create/update, tag create/delete |
| Groups & Users | `modules/org.ts` | group create / auto-assign, user field (role/active — ADMIN) |
| Services & Catalog | `modules/catalog-services.ts` | service create/update, catalog item create/publish/delete |
| Assets & Locations (CMDB) | `modules/cmdb.ts` | asset create/update, location create/update/delete |
| Knowledge base | `modules/knowledge.ts` | article create, set status, delete |
| Problems & Changes | `modules/problems-changes.ts` | problem/change create, update field, comment |
| SLAs, Automations, Settings | `modules/config.ts` | SLA CRUD, automation toggle/delete, setting update (ADMIN) |

Authority is **the app's real RBAC**. Each operation's `minRole` mirrors the underlying UI
action, so Vio can do exactly what the acting user could do by hand — no more. Operations flagged
`adminOnly` are only offered in the Admin scope. `setting.update` refuses any key that looks
secret (contains `KEY`/`PASS`/`SECRET`/`TOKEN`).

---

## The approve-first flow

Nothing Vio "decides" to change is applied automatically. The path is:

1. **Propose.** The model calls a `propose_*` tool. The tool validates the arguments against the
   operation's Zod schema and returns a *proposal* — **no mutation happens**.
2. **Collect.** All proposals from the turn are gathered into `AssistantProposal[]` (deduped),
   each with a human label from the operation's `label()`.
3. **Render.** The chat shows an **approval card** per proposal
   (`components/assistant/proposal-card.tsx`) with an **Approve** and a **Dismiss** button.
4. **Approve.** Clicking Approve calls the `applyAssistantProposal` server action, which
   **re-resolves the operation, re-checks RBAC** (fresh DB role vs. `minRole`, conversation scope
   vs. `adminOnly`), **re-validates the args**, then runs the real mutation — reusing existing
   server actions where possible, else a guarded Prisma write plus an audit entry (`writeAudit`).

Client-supplied args are never trusted: they are re-validated at apply time. The underlying
mutation writes its own audit trail, so AI-driven changes are indistinguishable from — and as
accountable as — manual ones.

---

## Providers

Configured via `AI_PROVIDER` (`lib/ai.ts`). Config resolves through `lib/settings` — a DB
`AppSetting` row overrides `process.env` — so an admin can manage everything from the UI.

| Provider | `AI_PROVIDER` | Runs | Key | Privacy gate | Default model |
| --- | --- | --- | --- | --- | --- |
| **Ollama** | `ollama` | **Local, on-box** | none | not gated (self-authorized) | `OLLAMA_MODEL` (`llama3.1`) |
| **Anthropic** | `anthropic` | External API | `ANTHROPIC_API_KEY` | **requires `AI_ALLOW_EXTERNAL=true`** | `claude-opus-4-8` |
| **OpenAI-compatible** | `openai` | External API | `OPENAI_API_KEY` | **requires `AI_ALLOW_EXTERNAL=true`** | `gpt-4o` |
| **Claude subscription** | `claude-code` | Local `claude` CLI | none (your login) | not gated (self-authorized) | CLI default |

- **Ollama** is a local, OpenAI-compatible endpoint — no key, data stays on the machine. This is
  the privacy-safe default and the recommended way to try Vio.
- **OpenAI-compatible** works with any compatible cloud via `OPENAI_BASE_URL` (OpenAI, OpenRouter,
  Moonshot/Kimi, Zhipu/GLM, …); the model id comes from `AI_MODEL`.
- **Claude subscription** (`claude-code`) drives the operator's own logged-in `claude` CLI (their
  Pro/Max plan) through the Claude Agent SDK. Selecting it *is* the consent — data does leave the
  box (to Anthropic), which the settings UI calls out.

### The privacy gate

`AI_ALLOW_EXTERNAL` is a hard backstop. When it is not exactly `"true"`, `assertPrivacy()` in
`lib/ai.ts` **throws before any network call** for a non-local provider — so a misconfiguration
can never send ticket data off-box. Local (`ollama`) and subscription (`claude-code`) providers
authorize themselves and are not subject to the gate.

`aiConfigured()` is the effective on/off switch (mirrors `smtpConfigured()`): true only when the
selected provider can actually run (local always; external only with the gate open **and** a key).

### Teaser mode

When AI is *not* configured, `AI_TEASER=true` still renders the AI buttons as a preview. Clicking
one shows a friendly "ask your admin to enable AI" hint instead of calling anything — a nudge, not
a live feature.

---

## Configuration

All keys are read through `lib/settings` (DB overrides `.env`); secrets are encrypted at rest
(AES-256-GCM). Manage them under **Settings › Vio (AI assistant)** (ADMIN) or in `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `anthropic` | `anthropic` \| `openai` \| `ollama` \| `claude-code` |
| `AI_ALLOW_EXTERNAL` | `false` | Privacy gate — must be `true` to use anthropic/openai |
| `AI_MODEL` | provider default | Explicit model id (blank = provider default) |
| `AI_MAX_OUTPUT_TOKENS` | `1024` | Output token cap |
| `AI_TEASER` | `false` | Show AI buttons as a preview when AI is off |
| `ANTHROPIC_API_KEY` | — | Anthropic key (external; needs the gate) |
| `OPENAI_API_KEY` | — | OpenAI key (external; needs the gate) |
| `OPENAI_BASE_URL` | — | Override endpoint for any OpenAI-compatible cloud |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Local Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.1` | Local Ollama model |

### Quick start: local, private (Ollama)

```dotenv
AI_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434/v1"
OLLAMA_MODEL="llama3.1"
```

### Quick start: hosted model (Anthropic / OpenAI)

```dotenv
AI_PROVIDER="anthropic"       # or "openai"
AI_ALLOW_EXTERNAL="true"      # required for any external provider
ANTHROPIC_API_KEY="sk-ant-…"  # or OPENAI_API_KEY (+ optional OPENAI_BASE_URL)
```

---

## Conversation persistence

Chats are saved per user in two Prisma models (migration
`20260809000000_vio_assistant_conversations`):

- **`AiConversation`** — `title` (auto-titled from the first user message), `scope`
  (`GENERAL`/`ADMIN`), `archived`, timestamps, owner. Indexed by `(userId, archived, updatedAt)`
  so the left rail sorts newest-first.
- **`AiMessage`** — one turn: `role` (`user`/`assistant`), `content`, sanitized `html`,
  `toolCalls` (JSON), and `proposals` (JSON). Cascades with its conversation.

A conversation can be renamed and archived (soft-delete). Each message accepts up to six
attachments (images are downscaled client-side; text is inlined; PDFs are sent as file parts to
providers that support them).

---

## File map

| Concern | Files |
| --- | --- |
| Page & UI | `app/(console)/assistant/{page,layout}.tsx`, `components/assistant/*` (`assistant-shell`, `chat-panel`, `message-list`, `conversation-list`, `proposal-card`, `vio-launcher`, `typing-dots`) |
| Server actions | `lib/actions/ai-assistant.ts` (`listConversations`, `createConversation`, `getConversation`, `renameConversation`, `archiveConversation`, `sendMessage`, `applyAssistantProposal`; system prompts) |
| Provider layer | `lib/ai.ts` (config, gate, `generateAiText`/`Chat`/`Object`), `lib/claude-cli.ts` (Agent SDK adapter) |
| Read tools | `lib/assistant-tools.ts`, `lib/ai-tools.ts`, `lib/ai-admin-tools.ts`, `lib/ai-stats.ts` |
| Write operations | `lib/ai-operations/` (`registry.ts`, `types.ts`, `tools.ts`, `modules/*`) |
| Settings UI | `app/(console)/settings/ai/page.tsx` |
| Persistence | `prisma/schema.prisma` (`AiConversation`, `AiMessage`) + the migration above |

---

## Related docs

- [configuration.md](configuration.md) — the full environment-variable reference.
- [architecture.md](architecture.md) — server-first runtime, Server Actions, RBAC.
- [data-model.md](data-model.md) — the Prisma schema and enum strategy.
