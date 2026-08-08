# Servio module playbook (READ FIRST)

You are building one ITSM module for **Servio**, a Next.js 16 + shadcn (base-nova) app.
Match the existing code EXACTLY. Before writing, READ these real reference files:

- `app/(console)/tickets/page.tsx` — list page pattern (filters, table, pagination)
- `app/(console)/tickets/[id]/page.tsx` — detail page pattern
- `app/(console)/tickets/new/page.tsx` + `components/tickets/ticket-form.tsx` — create form
- `lib/actions/tickets.ts` — server actions pattern
- `components/tickets/ticket-properties.tsx` — inline-edit Select pattern (note `items` prop)
- `lib/constants.ts` — all status/label/tone maps + ref helpers
- `lib/query.ts`, `lib/data/options.ts`, `lib/session.ts`, `lib/audit.ts`
- `prisma/schema.prisma` — exact model field names
- The shared components you will reuse: `components/page-header.tsx`, `components/link-button.tsx`,
  `components/list-toolbar.tsx`, `components/pagination-bar.tsx`, `components/status-badge.tsx`,
  `components/empty-state.tsx`, `components/stat-card.tsx`, and `components/ui/*`.

## Hard rules (base-ui / Next 16)
1. **Next 16 async props**: `params` and `searchParams` are Promises. Type them
   `{ params: Promise<{ id: string }> }` / `{ searchParams: Promise<SearchParams> }` and `await` them.
   Add `export const dynamic = "force-dynamic";` to every page that reads the DB.
2. **NO `asChild`.** base-ui composes via `render`. For a link styled as a button use
   `<LinkButton href="…">`. For breadcrumb/menu/sidebar links use `render={<Link href="…" />}`.
   A base-ui `<Button>` rendered as a link needs `nativeButton={false}` — so always prefer `LinkButton`.
3. **Select**: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"`.
   base-ui `Select` needs an `items` prop mapping value→label so the trigger shows the label:
   `items={{ none: "—", ...Object.fromEntries(opts.map(o => [o.value, o.label])) }}`.
   For forms, pass `name` on `<Select>`; for filters use the shared `ListToolbar` instead.
4. **Prisma client** `import { db } from "@/lib/db"`. Accessors are camelCased model names:
   `db.ticket db.problem db.change db.changeApproval db.queue db.service db.sLA db.asset
   db.assetRelation db.ticketAsset db.changeAsset db.category db.group db.groupMember db.user
   db.tag db.ticketTag db.syncSource db.syncRun db.article db.notification db.apiToken db.auditLog`.
   Note **`db.sLA`** (capital LA). Types: `import type { Prisma } from "@prisma/client"`.
5. SQLite: `where: { field: { contains: q } }` (no `mode: "insensitive"`). No enums — status/type/etc are strings.
6. `Ticket`, `Problem`, `Change` have **Int autoincrement `id`**. Display with `ticketRef(id,type)`,
   `problemRef(id)`, `changeRef(id)` from `@/lib/constants`. Other models use cuid string ids.
7. Server actions: file top `"use server";`, use `revalidatePath(...)`, `redirect(...)`, zod validation,
   `writeAudit({...})` / `notify(...)` from `@/lib/audit`, `getSessionUser()` from `@/lib/session`.
   Mirror `lib/actions/tickets.ts` (createX returns ActionState for useActionState; inline field updates take FormData).
8. Client components: `"use client";` at top; may import server actions. Toasts: `import { toast } from "sonner"`.
9. Only CREATE files inside YOUR module's paths. **Never edit** shared files, `components/ui/*`,
   `lib/constants.ts`, `lib/nav.ts`, or another module. Navigation entries already exist.
10. Keep it TypeScript-clean (no `any`, no unused imports). Every page must compile and look premium,
    matching the Tickets pages' spacing/typography (`PageHeader`/`PageBody`, `rounded-xl border bg-card`).

## Standard list page shape
`PageHeader` (icon+title+description, action button) → `PageBody` with `ListToolbar` (filters) →
either `EmptyState` or a `rounded-xl border bg-card` `Table` → `PaginationBar`. Use `getParam/getPage/PAGE_SIZE`.

## Standard detail page shape
Back `LinkButton`, title, status badges, a main card + a right column of property cards. Use inline-edit
Selects (like `ticket-properties.tsx`) only where the module supports editing; otherwise show read-only rows.

Return: a short summary of what you built and the list of file paths you wrote.
