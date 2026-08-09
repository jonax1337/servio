# Servio — Open-Source ITSM

A modern, open-source **IT Service Management** platform — a fresh alternative to GLPI.
Built with **Next.js 16**, **React 19**, **shadcn/ui** (Tailwind v4), **Prisma 6**, and **Auth.js v5**.

Tickets · Problems · Changes · Teams/Groups · Services · Categories · Assets (CMDB) ·
Infrastructure Syncs · Self-Service Portal · SSO · and a clean public REST API.

## ✨ Features

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
- **Self-Service Portal** — a clean end-user help center: submit requests, track tickets,
  browse the service catalog and knowledge base.
- **SSO** — OIDC/SSO (Keycloak, Authentik, Azure AD, Okta, Google…) plus email/password.
- **RBAC** — Admin / Manager / Agent / User, enforced in `proxy.ts` and server actions.
- **Public REST API** — versioned `/api/v1`, Bearer-token auth with scopes, pagination,
  filtering, and an OpenAPI 3.1 document.
- **Beautiful by default** — a quiet "control-room" dark/light theme, command palette (⌘K),
  responsive layout, and designed empty/loading states.

## 🧱 Tech stack

| Layer      | Choice |
|------------|--------|
| Framework  | Next.js 16 (App Router, React 19, Turbopack) |
| UI         | shadcn/ui (`base-nova` on base-ui) + Tailwind v4, lucide icons, Recharts |
| Data       | Prisma 6 — SQLite (dev) / PostgreSQL (prod) |
| Auth       | Auth.js v5 (Credentials + OIDC), JWT sessions |
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
local SQLite file, and SSO/SMTP/storage are optional. Full walkthrough:
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
| `pnpm lint` | Lint (`eslint-config-next`) |
| `pnpm db:migrate` | Run Prisma migrations (`prisma migrate dev`) |
| `pnpm db:seed` | Seed demo data (`seed.ts` + `seed-extras.ts`) |
| `pnpm db:reset` | Reset DB + reseed |
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
  (console)/        Agent console — dashboard + every module (route group, mounted at /)
  portal/           Self-service portal for end users
  login/            Auth pages
  api/v1/           Public REST API (token auth)
components/         Shared UI + base-ui/shadcn primitives (components/ui)
lib/                db, session, constants (enums), actions, api helpers
prisma/             schema.prisma + seed
proxy.ts            Middleware / edge auth gate (Next 16 naming)
```

- **Server Actions** (`lib/actions/*`) power the app's own mutations; **Route Handlers**
  (`app/api/*`) serve the outside world.
- All "enum" fields are `String` columns backed by typed constants in `lib/constants.ts`
  (SQLite-friendly, Zod-validated) — flip the datasource to PostgreSQL without schema changes.

Deep dive: [docs/architecture.md](docs/architecture.md).

## 📚 Documentation

Full documentation lives in [`docs/`](docs/README.md):

| Doc | Contents |
| --- | --- |
| [development.md](docs/development.md) | Local setup, demo credentials, conventions |
| [configuration.md](docs/configuration.md) | Environment variables, SSO, SMTP, storage |
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
