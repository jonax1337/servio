# Design System & UI Guide

Servio ships a small, deliberately opinionated design system layered on top of
**Tailwind v4**, **base-ui** (via the `base-nova` shadcn style), and
**next-themes**. The look is a calm "control room" aesthetic: a violet primary,
OKLCH tokens, tight tracking on display type, and status colour coded through a
single source of truth in [`lib/constants.ts`](../lib/constants.ts).

This guide documents what actually exists in the repo. For where these pieces sit
in the broader app, see [architecture.md](./architecture.md); for how each
feature module consumes them, see [modules.md](./modules.md).

- [Theme foundation](#theme-foundation)
- [Typography](#typography)
- [base-ui / shadcn setup](#base-ui--shadcn-setup)
- [Primitive library (`components/ui/`)](#primitive-library-componentsui)
- [Shared composite components](#shared-composite-components)
- [Status & priority conventions](#status--priority-conventions)
- [The two shells](#the-two-shells)

---

## Theme foundation

Everything is defined in a single stylesheet, [`app/globals.css`](../app/globals.css).
There is **no `tailwind.config` file** — Tailwind v4 is configured entirely in CSS
via `@import "tailwindcss"` and the `@theme inline { … }` block. The imports at the
top wire in the animation utilities, the shadcn base layer, and the typography
plugin:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "tw-shimmer";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));
```

Dark mode is class-based: the `dark` variant matches any element inside a `.dark`
ancestor, and next-themes toggles that class on `<html>` (see
[Typography](#typography) and [The two shells](#the-two-shells)).

### Colour tokens (OKLCH)

Colours are CSS custom properties in `oklch()` space, declared on `:root`
(light) and `.dark`, then re-exported to Tailwind utilities through the
`@theme inline` map (`--color-primary: var(--primary)`, etc.). This is why you
write `bg-primary`, `text-muted-foreground`, `border-sidebar-border` and so on —
each maps back to a variable.

The **actual** token values in `app/globals.css` (do not trust older blueprint
values):

| Token | Light `:root` | Dark `.dark` | Usage |
|-------|---------------|--------------|-------|
| `--background` | `oklch(0.994 0.002 264)` | `oklch(0.17 0.012 264)` | Page background |
| `--foreground` | `oklch(0.21 0.02 266)` | `oklch(0.965 0.004 264)` | Body text |
| `--card` / `--card-foreground` | `oklch(1 0 0)` / `0.21…` | `0.205…` / `0.965…` | Card surfaces |
| `--popover` / `--popover-foreground` | `oklch(1 0 0)` / `0.21…` | `0.215…` / `0.965…` | Menus, dropdowns |
| `--primary` | `oklch(0.55 0.196 266)` | `oklch(0.66 0.18 266)` | Brand violet |
| `--primary-foreground` | `oklch(0.99 0.002 264)` | `oklch(0.15 0.02 266)` | Text on primary |
| `--secondary` / `-foreground` | `0.967…` / `0.28…` | `0.27…` / `0.965…` | Secondary buttons |
| `--muted` / `--muted-foreground` | `0.968…` / `0.54…` | `0.255…` / `0.71…` | Subtle text/fills |
| `--accent` / `-foreground` | `0.955…` / `0.42 0.12 266` | `0.3…` / `0.9 0.05 266` | Hover/active accents |
| `--destructive` | `oklch(0.585 0.222 24)` | `oklch(0.7 0.19 22)` | Danger red |
| `--border` / `--input` | `oklch(0.922 0.006 264)` | `oklch(1 0 0 / 9%)` / `/ 12%` | Hairlines, inputs |
| `--ring` | `oklch(0.55 0.196 266)` | `oklch(0.66 0.18 266)` | Focus ring |
| `--chart-1…5` | violet → magenta → blue → teal → amber | brighter variants | Charts |
| `--sidebar*` | dedicated sidebar surface/accent/border set | — | Console sidebar |
| `--sable` / `--sable-foreground` / `--sable-muted` | near-black solid + light muted fill | near-white solid + dark muted fill | AI ("Sable") accent |

The **`--sable*`** trio is a deliberately **monochrome** AI accent — a near-black
solid on light surfaces, near-white on dark — that **replaced the old
violet/fuchsia AI tint** everywhere the app signals an AI affordance. They are
mapped in `@theme inline` to `bg-sable` / `text-sable` / `text-sable-foreground` /
`bg-sable-muted`, so retinting every AI surface is a two-variable change. Consumers
include [`components/ui/ai-button.tsx`](../components/ui/ai-button.tsx) (an
outline `Button` with a subtle `--sable` tint), the ticket triage per-field
suggestions ([`ticket-properties.tsx`](../components/tickets/ticket-properties.tsx)),
the AI draft/summary card ([`comment-thread.tsx`](../components/comments/comment-thread.tsx)),
and the Sable chat surface (composer send button + caret).

The dark theme is the **default** (`defaultTheme="dark"` in the root layout), so
verify contrast in dark first.

### Radius scale

A single `--radius: 0.7rem` drives a derived scale in `@theme inline`:

| Utility | Formula |
|---------|---------|
| `rounded-sm` | `--radius * 0.6` |
| `rounded-md` | `--radius * 0.8` |
| `rounded-lg` | `--radius` |
| `rounded-xl` | `--radius * 1.4` |
| `rounded-2xl` | `--radius * 1.8` |
| `rounded-3xl` / `4xl` | `* 2.2` / `* 2.6` |

### Base layer & utilities

The `@layer base` block applies sensible global defaults: every element gets
`border-border` and a semi-transparent `outline-ring/50`; the body sets
`bg-background text-foreground`, enables the `cv11`/`ss01` font features, and
antialiases; `h1/h2/h3` (and any `.font-display`) use the display font with
`-0.02em` letter-spacing.

Two custom utilities are worth knowing:

| Utility | Purpose |
|---------|---------|
| `.bg-grid` | Subtle 40px grid texture (used on auth/hero backdrops), drawn with `color-mix` over `--border`. |
| `.glow` | Soft primary-tinted ring + drop shadow for emphasised surfaces. |

Scrollbars are globally set to `thin` with a `--border` thumb.

---

## Typography

Fonts are wired in [`app/layout.tsx`](../app/layout.tsx) with `next/font/google`
and exposed as the CSS variables referenced by the `@theme` map:

| Role | Font | CSS variable | Token |
|------|------|--------------|-------|
| Body / UI (`font-sans`) | **Inter** | `--font-sans` | default `html` font |
| Display / headings (`font-display`, `font-heading`) | **Bricolage Grotesque** | `--font-display` | `h1–h3`, `.font-display` |
| Monospace (`font-mono`) | **JetBrains Mono** | `--font-mono` | ref numbers, kbd, code |

All three are attached to `<body>` as `${inter.variable} ${bricolage.variable}
${jetbrains.variable} font-sans antialiased`. Use `font-display` for headings,
stat values, and anything that should read as a "title"; `tabular-nums` is
applied to numeric displays (e.g. [`stat-card.tsx`](../components/stat-card.tsx),
[`pagination-bar.tsx`](../components/pagination-bar.tsx)).

The **Sable** wordmark (the AI assistant's display name) also uses the display
font — **Bricolage Grotesque @600**, i.e. `font-display font-semibold` — so the
assistant reads as a first-class brand surface rather than plain UI text.

The `<ThemeProvider>` (a thin wrapper over next-themes,
[`components/theme-provider.tsx`](../components/theme-provider.tsx)) is configured
in the root layout with `attribute="class"`, `defaultTheme="dark"`,
`enableSystem`, and `disableTransitionOnChange`. `<html>` carries
`suppressHydrationWarning` to avoid theme-flash warnings.

---

## base-ui / shadcn setup

Servio uses shadcn's newer **`base-nova`** style, which generates components on top
of [**base-ui**](https://base-ui.com) (`@base-ui/react` **^1.7.0**) rather than
Radix. Configuration lives in [`components.json`](../components.json):

```jsonc
{
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": { "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "iconLibrary": "lucide",
  "aliases": { "ui": "@/components/ui", "components": "@/components", "utils": "@/lib/utils", "lib": "@/lib", "hooks": "@/hooks" }
}
```

Add primitives with the shadcn CLI, which will scaffold into `components/ui/`
against this config. Icons come from **lucide-react** everywhere.

> [!IMPORTANT]
> base-ui is **not** Radix. Two conventions differ from most shadcn code you have
> seen (and from stale training data). Follow them exactly:

### Gotcha 1 — `render` instead of `asChild`

base-ui has no `asChild` prop. To render a primitive **as** another element (the
classic "link that looks like a button" pattern), pass a `render` prop with a JSX
element. You can see this throughout the codebase:

```tsx
// app-sidebar.tsx — a sidebar button that is actually a <Link>
<SidebarMenuButton render={<Link href={item.href} />} isActive={…} tooltip={…}>
  <item.icon className="size-4" />
  <span>{item.title}</span>
</SidebarMenuButton>

// app-topbar.tsx — breadcrumb link
<BreadcrumbLink render={<Link href="/" />}>Servio</BreadcrumbLink>
```

The same appears in `select.tsx` (`SelectPrimitive.Icon render={<ChevronDownIcon …/>}`).
If you write `asChild`, it will silently do nothing. `Button`
([`components/ui/button.tsx`](../components/ui/button.tsx)) also accepts `render`
because it wraps `@base-ui/react/button`; the shared
[`link-button.tsx`](../components/link-button.tsx) exists precisely to give you a
`<Button>`-styled `<Link>` without repeating `render` boilerplate.

### Gotcha 2 — `Select` needs `items` for typeahead/value display

base-ui's `Select` ([`components/ui/select.tsx`](../components/ui/select.tsx))
behaves differently from Radix. When you need the trigger to display the selected
label and typeahead to work, pass the option list to the `Select` root via its
`items` prop (base-ui reads it to resolve values → labels) in addition to
rendering `<SelectItem>`s. Because native `<form>` posting of base-ui Select is
awkward, Servio's forms usually prefer the searchable
[`ComboField`](#shared-composite-components) instead, which submits a plain hidden
input.

When documenting or debugging any base-ui-specific behaviour, verify against the
installed version rather than memory — the API moved between betas.

### The chat UI is assistant-ui (base-ui flavour)

The **Sable** assistant's chat surface is not hand-rolled — it is built on
[**assistant-ui**](https://assistant-ui.com) (`@assistant-ui/react` +
`@assistant-ui/react-ai-sdk`), scaffolded in the **base-ui** flavour so its
primitives match the rest of the design system. The scaffolded Thread lives in
[`components/thread.tsx`](../components/thread.tsx) alongside its supporting parts
(`markdown-text`, `reasoning`, `tool-fallback`, `tool-group`,
`tooltip-icon-button`, `attachment`, `follow-up-suggestions`), and markdown
rendering uses `react-markdown` + `remark-gfm`. The composer send button and
caret are retinted to the `--sable` accent so the chat reads as an AI surface.

---

## Primitive library (`components/ui/`)

Generated shadcn/base-ui primitives. Import via the `@/components/ui/*` alias.
Current set:

`accordion`, `alert`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`,
`card`, `checkbox`, `collapsible`, `command`, `dialog`, `dropdown-menu`,
`hover-card`, `input`, `input-group`, `label`, `pagination`, `popover`,
`progress`, `radio-group`, `scroll-area`, `select`, `separator`, `sheet`,
`sidebar`, `skeleton`, `sonner`, `switch`, `table`, `tabs`, `textarea`,
`tooltip`, `rich-text-editor`.

Notes:

- **`button.tsx`** — `cva` variants: `default`, `outline`, `secondary`, `ghost`,
  `destructive`, `link`; sizes `xs`/`sm`/`default`/`lg` plus `icon`,
  `icon-xs`/`sm`/`lg`. Note `destructive` is a **tinted** style (`bg-destructive/10
  text-destructive`), not a solid red fill.
- **`sonner.tsx`** — toast host. Mounted once in the root layout as
  `<Toaster richColors position="top-right" />`; call `toast(...)` from client code.
- **`sidebar.tsx`** — the full shadcn sidebar system (provider, inset, trigger,
  collapsible-to-icon rail). Powers the console shell.
- **`rich-text-editor.tsx`** — a **Tiptap** (StarterKit + Placeholder + `@mention`)
  editor that submits sanitised HTML via a hidden input `name`; used for ticket
  comments/descriptions. Not a plain shadcn primitive.
- **`table.tsx`** — low-level table parts (`Table`, `TableHeader`, `TableRow`,
  `TableCell`, …). There is **no** `DataTable` abstraction; list pages compose
  these primitives directly together with [`ListToolbar`](#shared-composite-components)
  and [`PaginationBar`](#shared-composite-components).

---

## Shared composite components

Higher-level, app-specific components live directly in `components/` (not
`components/ui/`). These are the building blocks every module page reuses.

| Component | File | Purpose |
|-----------|------|---------|
| `Logo` / `Wordmark` | [`components/brand.tsx`](../components/brand.tsx) | The Servio "service ring" mark and the mark-plus-wordmark lockup (optional subtitle). |
| `ThemeToggle` | [`components/theme-toggle.tsx`](../components/theme-toggle.tsx) | Ghost icon button that flips light/dark via next-themes' `resolvedTheme`. |
| `PageHeader` / `PageBody` | [`components/page-header.tsx`](../components/page-header.tsx) | Standard page title bar (optional icon, description, right-aligned action slot) and padded body wrapper. |
| `StatCard` | [`components/stat-card.tsx`](../components/stat-card.tsx) | Dashboard KPI tile: big `tabular-nums` value, label, optional hint, icon tone, optional link. Tones: `primary`/`success`/`warning`/`danger`/`muted`. |
| `EmptyState` | [`components/empty-state.tsx`](../components/empty-state.tsx) | Dashed-border centred placeholder for empty lists (icon, title, description, action slot). |
| `ToneBadge` / `StatusBadge` | [`components/status-badge.tsx`](../components/status-badge.tsx) | Pill badge driven by a `Meta` (`StatusBadge` looks the meta up from a map + value). See [Status conventions](#status--priority-conventions). |
| `PriorityDot` | [`components/status-badge.tsx`](../components/status-badge.tsx) | Small coloured dot for compact priority/status signalling (takes a `Tone`). |
| `VipBadge` | [`components/status-badge.tsx`](../components/status-badge.tsx) | Gold crown badge for VIP requesters. |
| `Combobox` | [`components/combobox.tsx`](../components/combobox.tsx) | Searchable popover select (Popover + Command). Supports icons, tones, and stacked avatar/hint rows for people. |
| `ComboField` | [`components/combo-field.tsx`](../components/combo-field.tsx) | Form-friendly `Combobox` that manages its own state and submits via a hidden `name` input — the drop-in replacement for `<Select name=…>` in `useActionState` forms. Optional `— None —` entry. |
| `ListToolbar` | [`components/list-toolbar.tsx`](../components/list-toolbar.tsx) | List-page toolbar: debounced search + filter comboboxes that push to URL `searchParams` (via `router.push`), a Clear button, and a right-aligned action slot. |
| `PaginationBar` | [`components/pagination-bar.tsx`](../components/pagination-bar.tsx) | Server-rendered "from–to of total" + prev/next, using `buildHref` from [`lib/query.ts`](../lib/query.ts) so paging stays URL-driven. |
| `CommandMenu` | [`components/command-menu.tsx`](../components/command-menu.tsx) | `⌘K` / `/` global search palette. Debounced server search against `/api/search`, grouped results, plus quick-actions and role-filtered nav when empty. |
| `CreateMenu` | [`components/create-menu.tsx`](../components/create-menu.tsx) | Topbar "+" dropdown of create shortcuts. |
| `UserMenu` / `UserAvatar` | [`components/user-menu.tsx`](../components/user-menu.tsx), [`components/user-avatar.tsx`](../components/user-avatar.tsx) | Account dropdown (profile/sign-out) and initials/image avatar. |
| `ConfirmDialog` / `EditEntityDialog` | [`components/confirm-dialog.tsx`](../components/confirm-dialog.tsx), [`components/edit-entity-dialog.tsx`](../components/edit-entity-dialog.tsx) | Reusable destructive-confirm and inline entity-edit dialogs. |
| `charts` | [`components/charts.tsx`](../components/charts.tsx) | Dashboard chart wrappers keyed to the `--chart-1…5` tokens. |

> URL-as-state: `ListToolbar`, `PaginationBar`, and the filter comboboxes all read
> from and write to `searchParams`, so list state is shareable and server-rendered.
> This is the canonical list pattern — reuse it rather than inventing client-side
> filtering.

---

## Status & priority conventions

**All** enum-like fields (statuses, priorities, types, roles, sync states, …)
resolve their label, colour, and icon through
[`lib/constants.ts`](../lib/constants.ts) — the single source of truth. SQLite has
no native enums, so these are string fields with a companion `*_META` map. (Note:
the domain constants live here in `lib/constants.ts`, **not** in any `lib/enums.ts`.)

The colour system is a small closed set of **tones**, each with a Tailwind class
string in `TONE_CLASSES`:

| Tone | Palette (tint / text / border) |
|------|-------------------------------|
| `neutral` | `muted` fill, `muted-foreground` text |
| `info` | sky |
| `success` | emerald |
| `warning` | amber |
| `danger` | red |
| `purple` | purple |
| `indigo` | indigo |

Each domain exports its allowed values plus a `Record<string, Meta>` where
`Meta = { label; tone; icon? }`. Examples:

```ts
export type Meta = { label: string; tone: Tone; icon?: LucideIcon };

TICKET_STATUS_META.IN_PROGRESS // { label: "In Progress", tone: "purple", icon: PlayCircle }
PRIORITY_META.CRITICAL         // { label: "Critical", tone: "danger", icon: Flame }
```

To render one, hand the map + raw value to `StatusBadge`, which uses `metaFor`
(returns a neutral `—` fallback for null/unknown keys):

```tsx
import { StatusBadge } from "@/components/status-badge";
import { TICKET_STATUS_META, PRIORITY_META } from "@/lib/constants";

<StatusBadge map={TICKET_STATUS_META} value={ticket.status} />
<StatusBadge map={PRIORITY_META} value={ticket.priority} />
```

Domains currently covered include: roles, ticket type/status/priority,
impact/urgency, source, pending reasons, resolution codes, problem status, change
type/status, risk, approvals, service status, criticality, auto-assign strategy,
group type, asset type/status/relation, sync type/direction/scope/run-status, SLA
clock state, KB article status/visibility, and location type. Human-facing
reference numbers are generated by helpers in the same file: `ticketRef` (`INC-`
/ `REQ-`), `problemRef` (`PRB-`), `changeRef` (`CHG-`), all zero-padded to 4
digits.

> When you add a new status/type value, add it to the `as const` array **and** its
> `*_META` map in `lib/constants.ts`. Never hard-code a colour or label at the call
> site.

---

## The two shells

Servio has two distinct layouts, matching its two audiences (see
[architecture.md](./architecture.md#routing) for routing details):

### Agent console — sidebar + topbar

`app/(console)/layout.tsx` wraps the agent
experience. It gates on `requireRole("AGENT")`, then renders a
`SidebarProvider` → `AppSidebar` + `SidebarInset(AppTopbar + main)`.

- **[`AppSidebar`](../components/app-sidebar.tsx)** — collapsible-to-icon
  (`collapsible="icon"`) rail with the `Logo`/wordmark header and role-filtered nav
  groups from [`lib/nav.ts`](../lib/nav.ts) (`consoleNav` + `filterNav`). Active
  state is derived from `usePathname`.
- **[`AppTopbar`](../components/app-topbar.tsx)** — sticky, blurred bar with a
  sidebar trigger, breadcrumb built from the path (numeric segments become
  `#123`, cuid-like ids collapse to "Details"), and the right cluster:
  `CommandMenu`, `CreateMenu`, a notifications bell with unread count, `ThemeToggle`,
  and `UserMenu`.

### Self-service portal — centred column

[`app/portal/layout.tsx`](../app/portal/layout.tsx) is the end-user help center.
It gates on `requireUser()` (any authenticated user) and renders a simple
centred column: a sticky header with the `Wordmark` (subtitle "Help Center"), a
centered `PortalNav`, and a right cluster containing an "Agent console" shortcut
(only when `isAgent(user.role)`), `ThemeToggle`, and `UserMenu`. Content is
constrained to `max-w-6xl` with a muted page background (`bg-muted/30`) and a
footer. No sidebar.

Both shells share the same tokens, fonts, badges, and `ThemeToggle`, so a
component written for one generally looks correct in the other.
