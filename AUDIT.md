# Servio ITSM — System Audit

> Point-in-time audit generated 2026-08-15 via a multi-agent review (67 agents, 14
> subsystem audits, adversarial verification of every high-severity finding).
> 114 findings total; 24 high-severity findings independently confirmed, 0 refuted.
> This is a snapshot — track remediation in issues/PRs, not by editing this file.

## Executive summary

Servio is a genuinely capable, well-architected Next.js 16 ITSM platform: it already ships incident/request, problem, change with a real CAB, a service catalog, CMDB, a knowledge base, a bidirectional mail engine, a spec-driven sync engine, a REST API, dashboards/saved views, and an approve-first AI agent (Sable). The engineering discipline is visible — an SSRF guard exists, session-hardening (`requireUser`) exists, RBAC tiers are consistent in most action files, and the AI write flow is gated and audited.

**What's strong:** the change/CAB governance model (separation-of-duties intent, risk-based approver seating, EMERGENCY caps), the approve-first AI operation flow, the connector abstraction, and the mail threading model are all above the bar for a self-hosted tool.

**The biggest risk is a systemic authorization gap: security controls that exist are applied inconsistently.** The same guard (SSRF blocker, `requireUser` DB re-check, `isAgent` gate, `canTransitionConfigured` workflow gate, enum validation) is present in one code path and silently absent in a sibling path. This produces the top verified flaws: any agent can mutate/forward *any* ticket, any authenticated user can mutate the CMDB, connectors and the AI `fetch_url` tool are SSRF-exposed, and a directory sync can hijack/deactivate a local admin account by email collision. These are not missing features — they are half-applied controls.

**Top 5 priorities:**
1. **Per-ticket/group authorization** on all ticket mutations, especially the external-exfiltration path `forwardComment` (`lib/actions/tickets.ts:11-15, 933`).
2. **SSRF hardening** of connectors and `fetch_url` — route through `assertSafePublicUrl`, pin DNS, forbid redirects (`lib/connectors/csv.ts:116`, `rest.ts:94`, `lib/ai-tools.ts:193-228`).
3. **Fix `updateAssetField` RBAC** (`lib/actions/assets.ts:76-96`) and the unscoped import email-match that can hijack admins (`lib/connectors/import.ts:56-72`).
4. **Enforce lifecycle/enum/SLA integrity on every write path** — automation `set_status`/`set_priority`, `updateTicketField` enum & SLA recompute, CAB seating on manual change transitions.
5. **Ship business-hours SLA calendars + durable escalation** — the single largest ITSM-completeness gap, currently wall-clock and in-process only.

## Critical & high-severity flaws

All rows below were independently, adversarially verified. Severities reflect the verifier's corrected value. No verified finding was refuted outright; several were downgraded from the domain auditors' original "high" (noted after the table).

| Severity | Domain | Issue | File | Fix |
|---|---|---|---|---|
| High | Tickets | No per-ticket/group scoping: any agent can resolve/merge/**forward** any ticket (incl. exfiltrating a confidential thread to an external email) | `lib/actions/tickets.ts:11-15`, `933` | Add `canActOnTicket(me, ticket)` (group/assignee scope) to every mutating action; gate merge/forward/resolution/delete at minimum |
| High | Tickets | SLA deadlines never recomputed on priority/service/SLA change → stale, under-reported breaches | `lib/actions/tickets.ts:151-206` | Re-run `slaCreateData`/`resolveSla` for priority/serviceId/slaId edits on unresolved tickets (bank pausedMs/firstResponseAt) |
| High | Tickets | `mergeTicket`: ~N+5 un-transactioned writes, no target validation, no merge-cycle guard → half-merged state / FK 500 | `lib/actions/tickets.ts:552-612` | Wrap in `db.$transaction`; pre-validate target exists & not merged/cancelled/cyclic |
| High | Problem/Change | Change creator can self-approve (SoD anchored only to `assigneeId`; no `createdById` on Change) | `lib/cab.ts:14-27`, `lib/actions/changes.ts:173-175`, `schema.prisma:715-746` | Add `Change.createdById`; exclude from `selectApprovers` + all SoD checks |
| High | Catalog | Free-text request silently dropped for empty-schema catalog items (default config) — 100% data loss of the user's typed request | `lib/portal-tickets.ts:145-174` | When `fields.length===0`, capture `f_details` into description/formData |
| High | Assets/CMDB | `updateAssetField` has no `isAgent` check → any authenticated USER can mutate any asset (IDOR) | `lib/actions/assets.ts:76-96` | Use `requireAgentA()` (already defined in file) |
| High | SLA/Automation | Automation `set_status` bypasses `canTransitionConfigured` (admin-disabled/role-gated transitions) — engine is ticket-only | `lib/automations.ts:73-83` | Route through `canTransitionConfigured` with a dedicated automation role; skip+log disallowed |
| High | KB | REVIEW→PUBLISHED has no approver gate; author self-publishes to public portal (REVIEW is cosmetic) | `lib/actions/knowledge.ts:190-217` | Require distinct reviewer/MANAGER; track approverId/approvedAt; block self-approval |
| High | Mail | Trusted threading-header match: a forwarded email injects a **public** comment and grants the third party a portal participant seat | `lib/mail-inbound/process.ts:152-154, 175-186` | Require sender corroboration before auto-public + auto-participant; else route to triage or match-without-participant |
| High | Sync | SSRF: CSV/REST connectors fetch admin-supplied URLs with no guard; CSV follows redirects (reachable by MANAGER) | `lib/connectors/csv.ts:116`, `lib/connectors/rest.ts:94` | Route through `assertSafePublicUrl`, `redirect:"error"`, re-validate each `nextPath` |
| High | Sync | Account takeover: unscoped `email` match in `importUsers` reactivates/rebinds/steals local admin accounts; reconcile sweep can then deactivate them | `lib/connectors/import.ts:56-72` | Never adopt-by-email a foreign-owned/local account; skip if `passwordHash`/`role!=USER`/differing `syncSourceId`; log conflict |
| High | AI (Sable) | `fetch_url` SSRF guard is TOCTOU / DNS-rebinding vulnerable (validated IP ≠ fetched IP); reachable from USER-scoped portal | `lib/ai-tools.ts:193-228` | Resolve once and connect to the validated IP (custom lookup/dispatcher), preserve Host, reject peer not in validated set |
| High | Auth/API | Any authenticated user can mint API tokens incl. `admin` scope (`createApiToken` never checks role) | `lib/actions/tokens.ts:22-28` | `requireRole('ADMIN')` in `createApiToken`/`revokeApiToken` |
| High | Auth/API | No rate-limit/lockout on login or Bearer API; token verify falls back to O(N) bcrypt scan → CPU-DoS | `lib/api.ts:26-36` | Per-IP/account throttling; prefix-miss → immediate fail (no full scan); constant-work verify |
| High | Auth/API | Assets & Services REST endpoints not owner/role-scoped → any read token enumerates the whole CMDB/catalog (BOLA) | `app/api/v1/assets/route.ts:16-37` | Apply `principalIsAgent` scoping as tickets already do |
| High | Reporting | "Breached" dashboard filter counts already-resolved/closed met-SLA tickets as breached (missing `resolvedAt:null` guard) | `lib/dashboard/compute.ts:46` | Scope deadline clause to `resolvedAt:null`, mirroring `ai-stats.ts:123` |
| High | Reporting | SLA gauge overstates compliance (only measures closed work; excludes live open breaches) and ignores first-response SLA | `lib/dashboard/compute.ts:196` | Include open-breached in denominator; add first-response metric; relabel "Resolution SLA" |
| High | Org/Custom fields | Custom-field & Category admin gates trust stale JWT role and skip `isActive` (demoted/deactivated user keeps admin write) | `lib/actions/custom-fields.ts:14-17`, `lib/actions/categories.ts:11-14` | Use `getCurrentUser()` + `isActive`, matching people/groups/settings |
| High | Data model | `updateTicketField` persists unvalidated enums (priority/impact/urgency/type) — no DB CHECK | `lib/actions/tickets.ts:142-206` | Validate value against tuple per-field; verify relation FKs exist |
| High | Data model | User importer adopts/reactivates local accounts (incl. admins) by email; no last-admin guard | `lib/connectors/import.ts:56-72` | (Same fix as the Sync row above — one shared defect) |

**Downgraded on verification (still valid, moved to Medium):**
- **ChangeAsset has no write path** (`schema.prisma:939`) — confirmed dead relation, but a missing-feature gap, not a corruption/security bug → **medium**.
- **Manual status edit bypasses CAB seating** (`lib/actions/changes.ts:116-129`, `transitions.ts:29-42`) — confirmed, but recoverable (APPROVED stays unreachable via this path) → **medium**.
- **Automation `set_status` bypass** — confirmed, but engine is ticket-only, ticket workflow intentionally fails-open, rule authoring needs MANAGER+ → **medium**.
- **SLA escalation via in-process `setInterval`** (`lib/scheduler.ts:135-163`) — **partly-confirmed**: the serverless prong is refuted (Servio runs `next start` on a VM with `fs`-only storage); the multi-instance double-fire is real but a documented single-instance-by-default constraint → **medium**.
- **Portal API routes trust JWT (`isActive`/role)** (`app/api/portal/*`) — confirmed, but confined to USER-scoped self-service writes scoped to `me.id`; no escalation → **medium**.

## Medium & low findings by domain

**Tickets / Incident core**
- Public replies auto-provision active USER accounts for any To/Cc address (spoof/typo spam) — `tickets.ts:443-460`.
- Link actions (`linkTicket`, `setTicketProblem`, `setTicketChange`, `linkAsset`) accept arbitrary target IDs → FK 500 / dangling links / id enumeration — `tickets.ts:526-540`.
- Required custom fields not enforceable at ticket creation (only post-hoc via sidebar) — `tickets.ts:45-125`.
- `escalateTicket`/`toggleMajorIncident` write NEW→OPEN bypassing `canTransitionConfigured` — `tickets.ts:486`.
- Low: watchers notified of internal-only notes (with snippet); two divergent RESOLVED paths; non-atomic sequential bulk update; `resolveMentions` full-table scan.

**Problem / Change / Approvals / CAB**
- Catalog `decideApproval` lacks the `isAgent()` gate its siblings have — a plain USER approver can flip a ticket lifecycle — `approvals.ts:13-29`.
- Polymorphic `Approval` rows orphaned on entity deletion (no FK/cascade); inflate `/approvals` — `schema.prisma:832-850`.
- Low: unanimity check read-then-write outside a transaction; CAB priority/EMERGENCY cap depend on alphabetical role-string ordering; `requestApproval` seats any active user while UI only offers agents.

**Service Catalog**
- Catalog-request SLA ignores the item's service (`slaCreateData({priority:"MEDIUM"})` omits `serviceId`) — `portal-tickets.ts:158`.
- `select`-field answers not validated against `options` — `service-forms.ts:41-59`.
- Approver only validated at edit time → stranded PENDING requests — `catalog-admin.ts:49-54`.
- Item saveable with `requiresApproval=true` + no approver → hard-fails every request — `catalog-admin.ts:27-47`.
- Low: unbounded answer length; `deleteCatalogItem` swallows errors + silently detaches history; `estimatedDays` accepts negatives.

**Assets / CMDB**
- `updateAssetField` writes unvalidated `status` enum & unverified owner/group FKs — `assets.ts:70-86`.
- `addAssetRelation` doesn't verify source/target exist or scope — `assets.ts:196-213` (add `@@index` on sourceId/targetId).
- Location hierarchy allows transitive parent cycles → nodes vanish from tree — `locations.ts:62`.
- Sync `assetTag` fallback lets a source silently claim a manually-created asset — `import.ts:170-183`.
- Low: dual location fields (`location` vs `locationRef`) diverge; synced assets never get `locationId`; AssetRelation edges not inverse-paired (one-directional CI graph).

**SLA / escalation / automations**
- `escalate` action silently *de-escalates* to LOW when priority is unknown/corrupt (`indexOf` → -1) — `automations.ts:87-91`.
- `set_priority`/`assign`/`set_group` write unvalidated values, bypassing the group-membership invariant — `automations.ts:84-86`.
- AT_RISK idempotency is in-memory only → re-fires on every restart/deploy/instance — `sla-escalation.ts:20,65-69`.
- First-response SLA breaches are never escalated/notified — `sla.ts:150`, `sla-escalation.ts:57`.
- SLA clock is wall-clock minus manual pauses (no business hours) — `sla.ts:41-47,141-167`.
- Low: priority-fallback SLA winner decided alphabetically; automation assign sends no notification; stale schema comment.

**Knowledge Base**
- Revision history written on every save but no route/UI to view/diff/restore — `knowledge.ts:115-172`.
- Server-side KB search is case-sensitive on SQLite while the client browser is case-insensitive — `portal/search/route.ts:29`, `ai-tools.ts:255`.
- Low: portal article view is a write-on-every-GET counter (off-by-one display); `knowledgeSearchTool` returns INTERNAL articles with no visibility filter; `changeArticleStatus`/`deleteArticle` fail silently.

**Mail engine**
- Inbound sender/CC addresses not format-validated, no domain allowlist → active USER rows for spam/typos — `process.ts:247-253`.
- Outbound mail has no retry/backoff — a transient SMTP blip permanently drops a customer notification — `mail.ts:125-130`.
- Simulation mode (SMTP unconfigured) marks rows `SENT` — silent data loss — `mail.ts:81-124`.
- Low: `getTemplate` swallows all DB errors; whole raw message buffered before size cap; scheduler has no distributed lock; `sentAt` stamped on RECEIVED rows; new SMTP connection per message.

**Sync engine**
- No response-size cap or timeout on CSV/REST fetches → memory exhaustion / hung runs — `csv.ts:116-121`, `rest.ts:88-109`.
- Missing `@@unique([syncSourceId, externalId])` → duplicate imported identities; `externalId` unindexed — `schema.prisma:80-81`.
- Low: REST header JSON.parse unguarded; scope default mismatch (schema `ASSETS` vs `resolveScope` `USERS`); `API` trigger enum has no code path.

**AI (Sable)** — see the dedicated section below for security items; also:
- Destructive KB ops resolve target by `title:{contains}` first-match → wrong-record deletion; approval card shows the model's input string, not the resolved title/id — `ai-operations/modules/knowledge.ts:131-139`.
- The chat `scope` (GENERAL/ADMIN) is plumbed everywhere but never gates operations (dead param) — `ai-operations/tools.ts:12-18`.
- `AI_ALLOW_EXTERNAL`/`AI_PROVIDER` are Sable-writable via `setting.update` → the surface the privacy gate protects can open the gate — `ai-operations/modules/config.ts:28-44`.
- Low: legacy `sendMessage` action still reachable and drifted; portal proposal enums use `.catch()` (silent MEDIUM coercion); read tools expose every ticket incl. internal comments to any agent; claude-code JSON extraction is fragile.

**Auth / RBAC / API**
- API ticket PATCH/POST assigns `assigneeId` with no group-membership/agent/existence check; bad FKs surface as 500 not 422 — `app/api/v1/tickets/[id]/route.ts:64,89`.
- OIDC uses `allowDangerousEmailAccountLinking:true` → unverified IdP email enables local-account takeover — `auth.ts:60`.
- Token prefix is nearly constant (`servio_pat_` + 7 random chars) → defeats candidate index, degrades to full-table bcrypt scan — `tokens.ts:41-42`.
- Low: `admin` scope tier is cosmetic (no route enforces it).

**Reporting / dashboards / audit**
- Dashboard widgets do uncached full-table scans on unindexed `createdAt`/`resolvedAt`/`resolveDueAt` on every home load (~9 live queries) — `compute.ts:218`; add indexes + `unstable_cache`.
- No global/admin audit-log viewer — LOGIN/SYNC/settings/token/automation events are invisible (compliance gap) — `entity-history.tsx:15` (only reader).
- Low: `AuditLog.ip` never populated; live widget-preview endpoint skips `sanitizeOptions`; `buildTicketWhere` clobbers `w.OR`; SavedView/Dashboard JSON validated only on write.

**Org / people / groups / settings**
- `settingIsSet` reports a secret as configured even when it can no longer be decrypted (post key-rotation) — `settings.ts:73-79`.
- `updateCategory` blocks self-parent but not deeper cycles → infinite recursion in tree walks — `categories.ts:110-111`.
- Required custom fields never enforced at create for tickets/problems/changes — `custom-fields.ts:162`.
- Low: `Group.email`/description unbounded, not `.email()`-validated; uniform silent-return on guardrail failures; `setCustomFieldValue` writes values for hidden fields.

**Data model integrity**
- `updateTicketField` accepts arbitrary FK ids for group/category/service/sla; asset importer writes unvalidated type/status enums; connector SSRF (dup of Sync); polymorphic reference columns (`Approval`/`AuditLog`/`Notification`/`EmailMessage`) have no FK → dangling rows on delete.
- Low: unindexed Ticket sort/filter columns; title-only `contains` search; stale enum schema comments; `ticketRef` called with raw type instead of stored `prefix` in merge.

## Missing ITSM capabilities

De-duplicated across domains; **Must** = table-stakes gaps, **Should** = expected by mature buyers, **Nice** = differentiators.

**SLA & escalation (Must)**
- **Business-hours / holiday calendars** per team/service/timezone — the single most-cited gap. Every named competitor computes SLAs against operational schedules; Servio is wall-clock, so a Friday-5pm ticket "breaches" over the weekend.
- **Proactive breach escalation & multi-stage/tiered escalation chains** (notify manager → reassign → bump priority at % thresholds; on-call rotations).
- **Durable/at-most-once escalation execution** (external cron or DB-claimed job) instead of in-process `setInterval`.

**Agent productivity (Must)**
- **Canned responses / macros** (apply status+assignee+reply in one click).
- **Full-text/cross-field search** across description, comments, requester, custom fields (currently title-only `contains`).

**Change/CAB (Must/Should)**
- **Change calendar with blackout/freeze windows + CI conflict detection** (Must).
- **CAB quorum / N-of-M / percentage thresholds / per-type approval policies** (Must).
- **Affected-CI linkage on Changes** with automated risk/impact from the CI graph (Must — `ChangeAsset` has no write path).
- **Tracked PIR** for emergency/failed changes; **approval delegation/OOO + reminders**; **risk questionnaire** (Should/Nice).

**CMDB (Must/Should)**
- **Impact / blast-radius traversal over the CI graph** (Must — biggest CMDB gap; relations stored but rendered one hop deep). **Topology visualization** (Should).
- **CI reconciliation / identification-rule engine** (Should). **SAM/license/contract-renewal alerts**, **automated discovery** (Should).

**Catalog & fulfillment (Must/Should)**
- **Multi-stage / group-based approvals with delegation** and a **re-request path after rejection** (Must).
- **Fulfillment tasks / workflow orchestration** after approval; **conditional/dependent form fields + richer validation** (Should).

**KB (Must/Should)**
- **Article feedback + deflection metrics** (was-this-helpful, self-service success) (Must).
- **Enforced review/approval workflow** with distinct approver + scheduled publish/expiry/periodic-review (Must).
- **Revision viewer with diff + rollback** (data model already exists), **KB↔ticket suggestion/attach** (KCS) (Should).

**Cross-cutting reporting (Must)**
- **CSAT/CES surveys** on resolution and their reporting dimension — zero references in the codebase; a core KPI is entirely absent.
- **Report export (CSV/PDF) + scheduled emailed reports**; **cross-domain reporting** (change success, problem trends, agent productivity, SLA attainment); **admin audit-trail viewer** (Must/Should).

**Auth / API / platform (Must/Should)**
- **Login brute-force protection** (lockout/backoff/failed-login auditing) and **API rate limiting with 429/quota headers** (Must).
- **MFA/TOTP**, **fine-grained per-resource API scopes**, **token expiry/rotation (TTL)**, **webhooks/event subscriptions** (Should).

## AI (Sable) assessment

**Strengths.** The approve-first, RBAC-gated, audited write flow is a strong design: model proposals never mutate directly; a human confirms, and the mutation re-checks the operation's role. Providers are pluggable (local Ollama / Anthropic / OpenAI / Claude CLI) behind an `AI_ALLOW_EXTERNAL` privacy gate with a hard `assertPrivacy()` backstop. The portal assistant is deliberately scoped read-only (public KB + catalog) and uses a separate, visibility-filtered `portalKnowledgeTool`.

**Risks (verified).**
- **`fetch_url` SSRF via DNS rebinding** (`lib/ai-tools.ts:193-228`) — validated IP ≠ fetched IP; reachable from the USER-scoped portal. **Highest-priority AI fix.**
- **The privacy gate is self-mutable** — Sable's own `setting.update` can flip `AI_ALLOW_EXTERNAL`/`AI_PROVIDER` (`config.ts:28-44`).
- **Wrong-record destruction** — destructive KB ops resolve by first-match `title:{contains}` and the approval card shows the model's fuzzy input, not the resolved article (`knowledge.ts:131-139`).
- **Dead `scope` gate** — the GENERAL/ADMIN scope is plumbed but never enforced (`tools.ts:12-18`).
- **No rate-limiting/quota** on any AI endpoint (console/portal/apply).
- **Indirect prompt injection** — attachment text and fetched pages flow into context unlabelled and can steer an auto-drafted **public** portal reply (still one human click).

**Missing AI capabilities.**
- **Proposal-level audit/telemetry** (who proposed vs approved, provider/model, tokens, args, dismissed proposals) — today only the final mutation is audited (Must).
- **Per-user/tenant usage metering + budget caps** (Must).
- **Admin policy controls** to enable/disable individual AI ops and set auto-approve vs require-approval per op (Should).
- **Prompt-injection guardrails** (delimit/label untrusted content; injection classifier) (Should).
- **Deterministic entity resolution with disambiguation** instead of substring first-match (Should).
- **Semantic/vector retrieval** for KB deflection + similar-incident detection (Nice).
- Portal: **conversation-to-agent handoff** with transcript, **deflection analytics**, **grounded answers with citations + low-confidence fallback**, **multi-language KB retrieval** (Must/Should).

## Documentation gaps & drift

- **`prisma/schema.prisma` (enum comments)** — `Ticket.source` comment omits `SABLE`; `EmailMessage.status` comment is stale; `AutomationRule.trigger` comment omits the two SLA triggers. The `String`-backed-enum strategy trades DB correctness for these comments, so drift is exactly the risk it must avoid.
- **`docs/ai.md`** — should document (a) that gating is **role-only, not scope** (the `scope` param is inert), and (b) the trust boundary that `search_knowledge_base` is AGENT-only and not self-guarding against INTERNAL leakage in a USER context.
- **`docs/data-model.md`** — documents an `API` sync trigger that has **no code path** (`sync-runner.ts:22`); either implement or drop.
- **`docs/deployment.md`** — correctly documents the single-instance scheduler constraint; make the multi-instance escalation double-fire caveat more prominent since horizontal scaling is otherwise implied.
- **`AGENTS.md`/`CLAUDE.md`** — accurate; no fix needed beyond keeping an enum-drift check in sync.
- **Code comments contradicting behavior:** `changes.ts:173` "Never decide on a change you own, even as ADMIN" (false when approver ≠ assignee); `process.ts:176-177` "no sender corroboration is needed".

## Recommended roadmap

**Now (security correctness — half-applied controls; mostly small, high-impact diffs)**
1. **Ticket authorization:** add `canActOnTicket(me, ticket)` and apply to every mutation; gate `forwardComment`, `mergeTicket`, `setTicketResolution`, delete first.
2. **SSRF sweep:** route CSV/REST connectors and `fetch_url` through `assertSafePublicUrl` with pinned DNS + `redirect:"error"`; re-validate REST `nextPath` hops.
3. **RBAC gaps:** `updateAssetField` → `requireAgentA`; `createApiToken`/`revokeApiToken` → `requireRole('ADMIN')`; custom-field/category gates → `getCurrentUser()`+`isActive`.
4. **Import hijack:** stop unscoped email-adoption in `importUsers` (skip `passwordHash`/non-USER/foreign-source; never force `isActive:true`; log conflict).
5. **REST scoping:** apply `principalIsAgent` to assets/services endpoints; validate `assigneeId` group-membership on API PATCH/POST.
6. **`mergeTicket` transaction + target validation.**
7. **Reporting correctness:** fix the "breached" filter and SLA gauge guards.
8. **CAB SoD:** add `Change.createdById`; exclude from approver seating + SoD checks.

**Next (integrity, enforcement, and the biggest completeness gap)**
1. **Business-hours SLA calendars** + **durable at-most-once escalation** (external cron / DB-claimed job; conditional `updateMany where escalatedAt=null`; persist AT_RISK marker).
2. **Unify write-path enforcement:** validate enums + recompute SLA in `updateTicketField`; route automation actions through the same lifecycle/enum/group-membership checks as the console; funnel both RESOLVED paths through one routine.
3. **CAB seating on manual transitions** + **CAB quorum/threshold policies**.
4. **Enforce required custom fields** at create + on RESOLVED/CLOSED; enforce `select`-option validation; capture empty-schema catalog free-text.
5. **Rate-limiting + budgets** across login, `/api/v1`, and all AI endpoints; **login lockout/backoff + failed-login audit**.
6. **Mail hardening:** SPF/DKIM/DMARC-aware inbound triage, bounce/spam quarantine, inbound-contact validation, outbound retry/backoff, distinct SIMULATED status.
7. **Global admin audit-log viewer** (`/audit`, ADMIN-gated, filter/export) + populate `AuditLog.ip`; add missing Ticket indexes + widget caching.
8. **AI:** proposal-level audit telemetry; make the privacy gate non-self-mutable; deterministic entity resolution; untrusted-content fencing.

**Later (feature depth & platform maturity)**
1. **CMDB impact/blast-radius traversal** + topology visualization; reconciliation/identification-rule engine; affected-CI-driven change risk.
2. **CSAT/CES surveys** + reporting; **report export + scheduled reports**; **cross-domain & agent-productivity analytics**; historical metric snapshots.
3. **Agent macros / canned responses**; **full-text search** (SQLite FTS5 / Postgres tsvector); semantic/vector KB deflection + duplicate detection.
4. **KB editorial workflow** (enforced approver, scheduled publish/expiry, revision viewer+diff+rollback, KCS, feedback/deflection metrics).
5. **Catalog/change fulfillment orchestration**, multi-stage/delegated approvals, change calendar + freeze windows + PIR.
6. **Platform:** webhooks/event subscriptions, fine-grained API scopes + token TTL/rotation, MFA, soft-delete tombstones + orphan/blob reconciliation, DB-level enum/CHECK constraints on Postgres, optimistic concurrency, and (if MSP/multi-BU is ever a goal) a tenant-scoping column.
