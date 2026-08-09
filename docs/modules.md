# Module & feature map

This is the internal working reference for anyone (human or Claude Code) extending Servio. It maps every feature to its real files so you can jump straight to the right place. Every path below was verified against the code.

Servio has two surfaces:

| Surface | Route root | Audience | Layout |
| --- | --- | --- | --- |
| **Agent console** | `app/(console)/*` | Agents, managers, admins | `app/(console)/layout.tsx` (sidebar + topbar) |
| **Self-service portal** | `app/portal/*` | End users (requesters) | `app/portal/layout.tsx` (portal nav) |

Auth pages live at `app/login` (not a route group). There is **no `src/` directory** — everything is at the repo root. The request middleware is `proxy.ts` (Next 16 naming), not `middleware.ts`. See [architecture.md](./architecture.md) for the request lifecycle and auth/role gating.

## Per-module anatomy

Console modules follow one consistent shape. When adding a feature, mirror this layout so agents and contributors can predict where things live:

| Concern | Location | Notes |
| --- | --- | --- |
| List page | `app/(console)/<mod>/page.tsx` | Server Component; queries `lib/db`, renders table/cards. `export const dynamic = "force-dynamic"`. |
| Detail page | `app/(console)/<mod>/[id]/page.tsx` | Loads one record + related data; renders a `*-properties` panel and action components. |
| Create page | `app/(console)/<mod>/new/page.tsx` | Renders the `*-form` component. Some modules create via a dialog instead (e.g. Locations, Tags). |
| Server actions | `lib/actions/<mod>.ts` | All mutations. `"use server"`, Zod-validated, role-checked via `lib/session`, then `revalidatePath`. |
| UI components | `components/<mod>/` | Client components: forms, dialogs, property panels, action buttons. |
| Select options | `lib/data/options.ts` | Single cached `getFormOptions()` supplies dropdown data (users, groups, categories, services, etc.) to every form. |

Enums, status/priority metadata, and reference helpers (`ticketRef`, `problemRef`, `changeRef`, `PRIORITY_META`, `TICKET_STATUS_META`, `OPEN_TICKET_STATUSES`) live in `lib/constants.ts` — **not** `lib/enums.ts`. Navigation grouping and per-item role gating live in `lib/nav.ts` (`consoleNav`, `filterNav`). See [data-model.md](./data-model.md) for the underlying Prisma models. To contribute a new module, follow the pattern below and read [../CONTRIBUTING.md](../CONTRIBUTING.md).

## Navigation groups

`lib/nav.ts` groups console modules and gates each by `minRole` (`AGENT` < `MANAGER` < `ADMIN`; `filterNav` hides items above the user's rank):

| Group | Modules |
| --- | --- |
| Overview | Dashboard (`/`) |
| Service Operations | Tickets, Board (`/queues`), Problems, Changes, Approvals |
| Catalog & CMDB | Services, Service Catalog (MANAGER+), Assets, Locations, Categories, Knowledge Base |
| Organisation | Groups, People, Tags |
| Administration | Automations (MANAGER+), Syncs (MANAGER+), Settings (MANAGER+) |

---

## Service Operations

### Tickets
The core incident/request module and the richest one in the codebase.

| | |
| --- | --- |
| Routes | `app/(console)/tickets/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/tickets.ts` |
| Components | `components/tickets/` |

Actions include `createTicket`, `updateTicketField`, `updateTicketDetails`, `addTicketComment`, `escalateTicket`, `toggleMajorIncident`, `toggleWatch`, `addParticipant`, `linkTicket`/`unlinkTicket`, `mergeTicket`, `setTicketResolution`, `setTicketPending`, `setTicketDueDate`, `forwardTicketExternal`, `unlinkAsset`, `unlinkRelation`, task CRUD (`addTask`, `toggleTask`, `deleteTask`), and work-log entries (`addWorkLog`, `deleteWorkLog`). Key components: `ticket-form`, `ticket-properties`, `ticket-actions`, `ticket-tasks`, `comment-composer`, `work-log`, `log-time-popover`, `resolution-dialog`, `pending-reason-dialog`, `due-date-picker`, `sla-badge`, `form-answers` (renders catalog service-form answers).

### Board (Queues)
`app/(console)/queues/page.tsx` — a thin, single-file page. Queues were dissolved into Teams/Groups; the board simply groups open tickets by `Group` (excluding `VENDOR` groups) into columns, with an "Unassigned" column for ticket without a `groupId`. No dedicated actions or components folder.

### Problems

| | |
| --- | --- |
| Routes | `app/(console)/problems/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/problems.ts` — `createProblem`, `updateProblemField`, `updateProblemDetails`, `addProblemComment` |
| Components | `components/problems/` — `problem-form`, `problem-properties`, `create-problem-dialog` |

### Changes
Includes a built-in approval workflow.

| | |
| --- | --- |
| Routes | `app/(console)/changes/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/changes.ts` — `createChange`, `updateChangeField`, `updateChangeDetails`, `addChangeComment`, `submitChangeForApproval`, `addChangeApprover`, `removeChangeApprover`, `decideApproval` |
| Components | `components/changes/` — `change-form`, `change-properties`, `approval-panel`, `approval-actions`, `add-approver`, `remove-approver`, `submit-for-approval` |

### Approvals
A cross-cutting inbox for the current user's pending approvals (currently backed by change approvals).

| | |
| --- | --- |
| Route | `app/(console)/approvals/page.tsx` (list only — no detail/new) |
| Actions | `lib/actions/approvals.ts` — `decideApproval` |
| Components | `components/approvals/approval-decision` |

---

## Catalog & CMDB

### Services
The service portfolio (business/technical services tickets are filed against).

| | |
| --- | --- |
| Routes | `app/(console)/services/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/services.ts` — `createService`, `updateServiceField` |
| Components | `components/services/` — `service-form`, `service-properties`, `create-service-dialog` |

### Service Catalog (admin)
The requestable-item catalog editor (MANAGER+; `requireRole("MANAGER")`). List-style admin page — no `[id]`/`new` routes; items are edited inline.

| | |
| --- | --- |
| Route | `app/(console)/catalog/page.tsx` |
| Actions | `lib/actions/catalog-admin.ts` — `createCatalogItem`, `updateCatalogItem`, `toggleCatalogPublished`, `deleteCatalogItem` |
| Components | `components/catalog/` — `catalog-editor`, `catalog-browser`, `catalog-icon`, `publish-toggle` |

Catalog request forms are defined via `lib/service-forms.ts` (`parseFormSchema`). The requester-facing catalog lives in the portal (below); `lib/actions/catalog.ts` (`createCatalogRequest`) is the request-submission action shared with the portal.

### Assets (CMDB)

| | |
| --- | --- |
| Routes | `app/(console)/assets/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/assets.ts` — `createAsset`, `updateAssetField`, `updateAsset` |
| Components | `components/assets/` — `asset-form`, `asset-properties`, `asset-edit-dialog` |

### Locations
Created/edited via dialog (no `new/` route).

| | |
| --- | --- |
| Routes | `app/(console)/locations/page.tsx`, `[id]/page.tsx` |
| Actions | `lib/actions/locations.ts` — `createLocation`, `updateLocation`, `deleteLocation` |
| Components | `components/locations/location-dialog` |

### Categories
Ticket/problem/change categorisation tree.

| | |
| --- | --- |
| Routes | `app/(console)/categories/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/categories.ts` — `createCategory`, `updateCategory` |
| Components | `components/categories/` — `category-form`, `create-category-dialog` |

### Knowledge base
The only console module keyed by `slug` instead of `[id]`, with a dedicated edit route.

| | |
| --- | --- |
| Routes | `app/(console)/knowledge/page.tsx`, `[slug]/page.tsx`, `[slug]/edit/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/knowledge.ts` — `createArticle`, `updateArticle`, `changeArticleStatus`, `deleteArticle` |
| Components | `components/knowledge/article-editor` (uses the shared `components/ui/rich-text-editor`) |

---

## Organisation

### Groups / Teams
Groups are the unit of assignment/auto-routing (they replaced Queues). Includes auto-assign configuration.

| | |
| --- | --- |
| Routes | `app/(console)/groups/page.tsx`, `[id]/page.tsx`, `new/page.tsx` |
| Actions | `lib/actions/groups.ts` — `createGroup`, `setGroupAutoAssign` |
| Components | `components/groups/` — `group-form`, `create-group-dialog`, `auto-assign-control` |

### People
User directory. Read-heavy; users are typically provisioned via syncs, so there is no `new/` route.

| | |
| --- | --- |
| Routes | `app/(console)/people/page.tsx`, `[id]/page.tsx` |
| Actions | `lib/actions/people.ts` — `updateUserField` |
| Components | `components/people/user-properties` |

### Tags
Free-form labels; created/removed inline.

| | |
| --- | --- |
| Route | `app/(console)/tags/page.tsx` |
| Actions | `lib/actions/tags.ts` — `createTag`, `deleteTag` |
| Components | `components/tags/tag-creator` |

---

## Administration

### Automations
Rule engine (trigger → conditions → actions), MANAGER+.

| | |
| --- | --- |
| Route | `app/(console)/automations/page.tsx` |
| Actions | `lib/actions/automations.ts` — `createRule`, `updateRule`, `toggleRule`, `deleteRule` |
| Components | `components/automations/` — `rule-builder`, `toggle-switch` |

### Syncs / Integrations
External data sync connectors (e.g. directory/asset imports), MANAGER+.

| | |
| --- | --- |
| Routes | `app/(console)/syncs/page.tsx`, `[id]/page.tsx` |
| Actions | `lib/actions/syncs.ts` — `runSync`, `toggleSyncActive` |
| Components | `components/syncs/` — `run-button`, `toggle-active` |

### Settings
A hub page (`app/(console)/settings/page.tsx`, MANAGER+) linking to sub-pages:

| Sub-page | Route | Purpose | Actions / components |
| --- | --- | --- | --- |
| API tokens | `settings/api/page.tsx` | Create/revoke API tokens | `lib/actions/tokens.ts` (`createApiToken`, `revokeApiToken`); `components/settings/token-manager` |
| Mail | `settings/mail/page.tsx` | SMTP status + mail queue (`lib/mail.ts`, `smtpConfigured`) | Read-only view of the mail log |
| SLA | `settings/sla/page.tsx` | Manage SLA policies | `lib/actions/sla-admin.ts` (`createSla`, `updateSla`, `toggleSla`, `deleteSla`); `components/settings/sla-manager` |

See [configuration.md](./configuration.md) for the environment/config side of Mail, SLA, and tokens.

### Notifications
Per-user in-app notification feed, shown as a **popover** opened from the topbar bell (no dedicated route).

| | |
| --- | --- |
| UI | `components/notifications-menu.tsx` — base-ui `Popover` in the topbar bell; loads on open |
| Actions | `lib/actions/notifications.ts` — `listNotifications`, `markAllRead`, `markRead` |
| Entity links | `ENTITY_HREF` map routes `Ticket`/`Problem`/`Change` notifications to their detail pages |

---

## Cross-cutting features

### Search
Global command palette (`Cmd/Ctrl+K` or `/`), not a route.

| | |
| --- | --- |
| Component | `components/command-menu.tsx` (mounted in the console layout) |
| Backend | `app/api/search/route.ts` — a Node route handler that fans out across tickets, problems, changes, assets, people, and services, returning grouped `{ group, href, title, sub }` results. Auth-gated via `getSessionUser`. |

### Shared building blocks
Reused across every module, worth knowing before building UI:

| Component | Purpose |
| --- | --- |
| `components/page-header.tsx` | `PageHeader` + `PageBody` layout wrappers used by nearly every page |
| `components/list-toolbar.tsx`, `pagination-bar.tsx` | List filtering + pagination |
| `components/status-badge.tsx` | `StatusBadge` / `ToneBadge` (driven by `lib/constants.ts` metadata) |
| `components/comments/` | `comment-thread`, `composer-attachments` (shared comment UI) |
| `components/attachments/` | `attachment-list`, `attachments-card`, `file-upload` (paired with `lib/actions/attachments.ts` → `deleteAttachment`) |
| `components/history/entity-history.tsx` | Audit/history timeline |
| `components/edit-entity-dialog.tsx`, `confirm-dialog.tsx`, `empty-state.tsx`, `stat-card.tsx`, `combobox.tsx`, `combo-field.tsx` | Generic primitives |
| `components/ui/` | shadcn/base-ui design-system primitives — see [design-system.md](./design-system.md) |

---

## Portal (self-service)

The requester surface under `app/portal/*`, laid out by `app/portal/layout.tsx` with `components/portal/portal-nav.tsx`.

| Feature | Route | Purpose | Key files |
| --- | --- | --- | --- |
| Home | `app/portal/page.tsx` | Requester dashboard: recent tickets, featured catalog items, published KB articles | `getSessionUser`, `db.ticket`/`catalogItem`/`article` |
| Catalog | `app/portal/catalog/page.tsx` | Browse published catalog items | `components/catalog/catalog-browser`, `catalog-icon` |
| Request | `app/portal/request/[serviceId]/page.tsx` | Submit a catalog request (dynamic per-service form) | `components/portal/service-request-form`, `request-form`; `lib/actions/catalog.ts` → `createCatalogRequest`; form schema via `lib/service-forms.ts` |
| New ticket | `app/portal/new/page.tsx` | Raise a plain support ticket | `lib/actions/portal.ts` → `createPortalTicket` |
| My tickets | `app/portal/tickets/page.tsx`, `[id]/page.tsx` | Track own tickets + reply | `lib/actions/portal.ts` → `addPortalComment`; `components/portal/portal-comment` |
| Knowledge | `app/portal/knowledge/page.tsx`, `[slug]/page.tsx` | Read published, public-facing KB articles | shares KB data; only published/public articles surface |

Portal write paths are deliberately narrow: requesters can only create tickets/catalog requests and comment on their own tickets (`lib/actions/portal.ts`, `lib/actions/catalog.ts`). All privileged mutations stay in the console action files.

---

## Related docs

- [architecture.md](./architecture.md) — layers, request lifecycle, auth/role gating, `proxy.ts`
- [data-model.md](./data-model.md) — Prisma models behind these modules
- [rest-api.md](./rest-api.md) — API tokens and HTTP endpoints
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — how to add a module the Servio way
