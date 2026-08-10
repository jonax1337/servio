# Servio — Open-Source ITSM

A modern, open-source **IT Service Management** platform — a fresh alternative to GLPI.
Built with **Next.js 16**, **React 19**, **base-ui/shadcn** (Tailwind v4), **Prisma 6**,
**Auth.js v5** — and **Vio**, a built-in AI service-desk agent that works your queue with you.

Tickets · Problems · Changes · Teams/Groups · Services · Categories · Assets (CMDB) ·
Infrastructure Syncs · Self-Service Portal · SSO · a clean public REST API ·
and an **AI assistant that can actually do the work** (with your approval).

## ✨ Features

- **🤖 Vio — built-in AI service agent** — a first-class, self-hostable assistant that reads
  your queue, searches tickets/KB/the web, and **proposes concrete changes you approve with one
  click**. Runs fully **local** (Ollama, on-box) or via your own key (Anthropic/OpenAI) — see
  [Vio](#-vio--the-built-in-ai-agent) below. This is the headline feature.
- **Service desk** — incidents & requests with priorities, impact/urgency, SLAs,
  inline-editable properties, and a threaded activity log with internal notes.
- **Problem management** — root-cause & known-error tracking, linked incidents.
- **Change management** — normal/standard/emergency changes with an approval workflow,
  implementation & rollback plans, and affected CIs.
- **CMDB / Assets** — typed configuration items with a **dependency graph**
  (depends-on / runs-on / connects-to …) and linked tickets.
- **Service catalog** with live status (operational / degraded / outage) and SLAs.
- **Organisation** — groups & teams, people/roles, categories (tree), tags.
- **Infrastructure Syncs** — pluggable connectors (Active Directory, Azure AD / Entra,
  Intune, CSV, ServiceNow, GLPI import, REST) with run history and manual runs.
- **Self-Service Portal** — a redesigned end-user help center: one **live search** across the
  knowledge base, catalog and your own tickets; report an issue or request a service with
  **screenshot/file attachments** (images, PDF, Office docs, `.eml`); track and reply to tickets;
  and an **Ask Vio** assistant (below) that answers, opens correctly-routed requests, and fills
  catalog forms for you.
- **SSO** — OIDC/SSO (Keycloak, Authentik, Azure AD, Okta, Google…) plus email/password.
- **RBAC** — Admin / Manager / Agent / User, enforced in `proxy.ts` and server actions.
- **Public REST API** — versioned `/api/v1`, Bearer-token auth with scopes, pagination,
  filtering, and an OpenAPI 3.1 document.
- **Beautiful by default** — a quiet "control-room" dark/light theme, command palette (⌘K),
  responsive layout, and designed empty/loading states.

## 🤖 Vio — the built-in AI agent

**Vio is Servio's standout feature: an AI teammate that lives inside the service desk and can
do real work, not just chat.** It opens from the sidebar (**Vio**, `/assistant`) and from a
launcher in the top bar, and it's available to every agent.

What makes Vio different from a bolt-on chatbot:

- **It knows your data.** Vio can list *your* tickets and your team's backlog, open any ticket
  in full (SLA due dates, breaches, comments), and free-text search tickets, problems, changes,
  and the knowledge base. It can also **search the web and read a URL** when the answer isn't
  in-house.
- **It acts — but only with your approval.** When Vio wants to change something, it doesn't just
  do it. It surfaces an **approval card** ("Create category *Networking*", "Resolve INC-0042 as
  Fixed"). You click **Approve**, and only then does the mutation run — re-validated server-side.
  Nothing is written until you say so.
- **It can touch the whole platform.** Across tickets, categories & tags, groups & users,
  services & the service catalog, assets & locations (CMDB), knowledge-base articles, problems &
  changes, and — for admins — SLAs, automations and settings. Every proposed action is gated by
  **your own RBAC**: Vio can do exactly what you could do in the UI, no more.
- **Admin scope for admins.** Admins get an extra **Admin** tab: pull live statistics
  (tickets by status/priority/team, SLA breaches, resolution counts…), review non-secret
  settings, and manage system-wide config — all through the same approve-first flow.
- **Conversations persist.** Chats are saved per user (auto-titled, reopenable, archivable) in
  the `AiConversation`/`AiMessage` tables. You can attach images, text, and PDFs to a message.

**Vio also helps end users.** The self-service portal has its own **Ask Vio** — a separate,
deliberately smaller assistant scoped to a single requester. It answers from the **public**
knowledge base and catalog, reads that user's **own** tickets (never internal notes), understands
attached **screenshots** of an error, and — with the same confirm-first cards — opens a
correctly-routed ticket, fills a catalog request form, or posts a reply on one of their own
tickets. It shares **none** of the agent tools. See
[docs/ai.md](docs/ai.md#vio-in-the-self-service-portal-end-users).

**Self-hostable and privacy-first.** Vio runs against the provider *you* choose:

| Provider | Where it runs | Key needed | Notes |
| --- | --- | --- | --- |
| **Ollama** | **Local, on your box** | None | Fully offline — **data never leaves the machine**. The privacy-safe default. |
| **Anthropic** | External API | `ANTHROPIC_API_KEY` | Default model `claude-opus-4-8`. Requires the external-provider toggle. |
| **OpenAI-compatible** | External API | `OPENAI_API_KEY` | Point `OPENAI_BASE_URL` at OpenAI, OpenRouter, Moonshot/Kimi, Zhipu/GLM… |
| **Claude subscription** | Local `claude` CLI | None | Drives your logged-in Claude Pro/Max via the CLI. |

A hard **privacy gate** (`AI_ALLOW_EXTERNAL`) blocks any external provider unless you explicitly
opt in, so a misconfiguration can never push ticket data off-box. When AI is switched off,
optional **teaser mode** still shows the AI buttons as a preview. Everything is configured from
**Settings › Vio (AI assistant)** (ADMIN) — keys are encrypted at rest. Full reference:
[docs/ai.md](docs/ai.md).

## 🧱 Tech stack

| Layer      | Choice |
|------------|--------|
| Framework  | Next.js 16 (App Router, React 19, Turbopack) |
| UI         | shadcn/ui (`base-nova` on base-ui) + Tailwind v4, lucide icons, Recharts |
| Data       | Prisma 6 — SQLite (dev) / PostgreSQL (prod) |
| Auth       | Auth.js v5 (Credentials + OIDC), JWT sessions |
| AI         | Vercel AI SDK 7 — Anthropic / OpenAI-compatible / Ollama (local) / Claude Agent SDK |
| Validation | Zod 4 (shared by server actions and the REST API) |

## 🚀 Getting started

```bash
pnpm install
cp .env.example .env          # then set AUTH_SECRET (npx auth secret)
pnpm db:migrate               # create the SQLite schema
pnpm db:seed                  # rich demo data
pnpm dev                      # http://localhost:3000
```

The only value you **must** set is `AUTH_SECRET`; `DATABASE_URL` already points at a
local SQLite file, and SSO/SMTP/storage/AI are all optional. Full walkthrough:
[docs/development.md](docs/development.md).

**Demo login:** `admin@servio.dev` / `servio123`
Every seeded account uses the password `servio123`. Try other roles too:
`mara@servio.dev` (Manager), `sam@servio.dev` (Agent), or `liam@servio.dev` (User —
lands in the self-service portal).

### Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start the dev server (Turbopack) |
| `pnpm build` / `pnpm start` | Production build & serve |
| `pnpm lint` | Lint (`eslint` / `eslint-config-next`) |
| `pnpm db:migrate` | Run Prisma migrations (`prisma migrate dev`) |
| `pnpm db:seed` | Seed demo data (`seed.ts` + `seed-extras.ts`) |
| `pnpm db:reset` | Reset DB + reseed (`prisma migrate reset --force`) |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm setup` | `prisma migrate deploy && prisma db seed` (CI / first deploy) |

## 🔐 SSO / OIDC

Set these in `.env` to enable the "Continue with SSO" button (works with any OIDC provider).
SSO is registered **only** when both `AUTH_OIDC_ID` and `AUTH_OIDC_ISSUER` are set:

```dotenv
AUTH_OIDC_ID="…"
AUTH_OIDC_SECRET="…"
AUTH_OIDC_ISSUER="https://your-idp/realms/main"
AUTH_OIDC_NAME="Company SSO"
```

See [docs/configuration.md](docs/configuration.md#sso--oidc-setup) for a worked example.

## 🧠 Enabling Vio (AI)

Vio is optional and off by default. The privacy-safe way to switch it on is **local Ollama** —
no key, nothing leaves the box:

```dotenv
AI_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434/v1"
OLLAMA_MODEL="llama3.1"
```

To use a hosted model instead, pick the provider, flip the privacy gate, and supply a key:

```dotenv
AI_PROVIDER="anthropic"       # or "openai"
AI_ALLOW_EXTERNAL="true"      # required for any external provider
ANTHROPIC_API_KEY="sk-ant-…"  # or OPENAI_API_KEY (+ optional OPENAI_BASE_URL)
```

To let Vio **read screenshots** (e.g. an error a user attaches in the portal), point it at a
vision-capable model — Ollama `llama3.2-vision`, or Anthropic/OpenAI. Text-only models still work;
Vio just falls back to asking for the error text.

Everything here can also be managed from **Settings › Vio (AI assistant)** (ADMIN), which
overrides `.env` and encrypts keys at rest. Full reference: [docs/ai.md](docs/ai.md).

## 🔌 REST API

Authenticate with a Bearer token (create one under **Settings › API Tokens**):

```bash
curl "http://localhost:3000/api/v1/tickets?status=open" \
  -H "Authorization: Bearer <token>"
```

- `GET/POST /api/v1/tickets`, `GET/PATCH /api/v1/tickets/{id}`
- `GET/POST /api/v1/assets`, `GET/PATCH /api/v1/assets/{id}`
- `GET /api/v1/services`
- `GET /api/v1/openapi` — OpenAPI 3.1 spec

Demo token (seeded, scopes `read,write`, owned by `admin@servio.dev`):
`servio_demo_pat_0123456789abcdef` — development only. Full reference:
[docs/rest-api.md](docs/rest-api.md).

## 🏗️ Architecture

```
app/
  (console)/        Agent console — dashboard, Vio, and every module (route group, mounted at /)
  portal/           Self-service portal for end users
  login/            Auth pages
  api/v1/           Public REST API (token auth)
components/         Shared UI + base-ui/shadcn primitives (components/ui)
lib/                db, session, constants (enums), actions, api helpers
  ai.ts            AI provider config + privacy gate; ai-operations/  RBAC-gated write ops
prisma/             schema.prisma + seed
proxy.ts            Middleware / edge auth gate (Next 16 naming)
```

- **Server Actions** (`lib/actions/*`) power the app's own mutations; **Route Handlers**
  (`app/api/*`) serve the outside world.
- **All AI runs server-side.** Provider keys never reach the client; every Vio write goes through
  the same RBAC-checked path as the UI (`lib/ai-operations/*`).
- All "enum" fields are `String` columns backed by typed constants in `lib/constants.ts`
  (SQLite-friendly, Zod-validated) — flip the datasource to PostgreSQL without schema changes.

Deep dive: [docs/architecture.md](docs/architecture.md).

## 📚 Documentation

Full documentation lives in [`docs/`](docs/README.md):

| Doc | Contents |
| --- | --- |
| [development.md](docs/development.md) | Local setup, demo credentials, conventions |
| [configuration.md](docs/configuration.md) | Environment variables, SSO, SMTP, AI, storage |
| [ai.md](docs/ai.md) | **Vio** — providers, privacy gate, tools & the approve-first flow |
| [architecture.md](docs/architecture.md) | Runtime model, RBAC, sync engine |
| [data-model.md](docs/data-model.md) | Prisma schema & enum strategy |
| [rest-api.md](docs/rest-api.md) | The `/api/v1` REST API |
| [design-system.md](docs/design-system.md) | Theme, tokens, and UI primitives |
| [modules.md](docs/modules.md) | Feature-to-file map |
| [deployment.md](docs/deployment.md) | PostgreSQL, production, persistence |

## 🗄️ Going to production

Swap the datasource in `prisma/schema.prisma` to `postgresql`, point `DATABASE_URL` at your
Postgres instance, set a strong `AUTH_SECRET`, then `pnpm setup` (first deploy) and
`pnpm build && pnpm start`. See [docs/deployment.md](docs/deployment.md).

## 🤝 Contributing

Contributions welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. It covers the
workflow, the canonical reference files, and the "add a module" recipe.

## 📄 License

MIT — see [LICENSE](LICENSE).
