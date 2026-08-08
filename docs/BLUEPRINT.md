{
  "summary": "Design the architecture, data model, API and design system for Servio — an open-source ITSM tool (GLPI competitor) on Next.js 16 + shadcn",
  "agentCount": 5,
  "logs": [],
  "result": {
    "blueprint": "I'll produce the merged blueprint directly. This is a synthesis task with all four design outputs provided, so I have everything needed.\n\n# Servio — Implementation Blueprint\n\n*A modern, open-source ITSM platform. One cohesive spec an engineer can build from, front to back.*\n\n---\n\n## 1) Overview & Principles\n\n**What we're building.** Servio is a modern, open-source IT Service Management tool positioned against GLPI. It ships the ITIL-aligned core (Tickets, Problems, Changes), the operational scaffolding (Queues, Groups, Services, Categories), a CMDB (Assets), an integration/Sync engine (LDAP/AD, discovery, external ITSM), a self-service portal, SSO auth, and a clean public REST API.\n\n**Design north star.** *Operational clarity* — a quiet, fast \"control room.\" Linear's density + Vercel's restraint + one warm indigo accent. Numbers and statuses are the hero; chrome recedes.\n\n**Engineering principles.**\n1. **Single source of truth for validation.** Zod schemas in `lib/schemas/` are shared by Server Actions, the REST API, and OpenAPI generation. A portal form submit and an `/api/v1` POST validate against the same shape — no drift.\n2. **One schema, two databases.** SQLite (dev) and Postgres (prod) run the *same* `schema.prisma`. All enums are `String` columns (Zod-enforced), all JSON is `String` (TEXT). Only `DATABASE_URL`/provider differs.\n3. **Server Actions for our own UI; Route Handlers for the outside world.** Mutations from Servio's UI use co-located Server Actions. Route Handlers are reserved for `/api/v1`, Auth.js callbacks, webhooks, and cron. Page data is fetched directly in Server Components via a `lib/data/` layer (never fetch our own API).\n4. **Edge-safe RBAC.** JWT sessions (not DB sessions) so middleware can enforce coarse RBAC on the Edge without a DB round-trip. Fine-grained permission checks happen server-side.\n5. **Decoupled API auth.** `/api/v1` uses hashed Bearer tokens with scopes — never session cookies. Integrations never depend on browser auth.\n6. **Pluggable sync.** A connector registry + Zod-typed config; `runSync(sourceId, trigger)` is the single entrypoint for manual/scheduled/webhook runs.\n7. **Provenance & audit everywhere.** Synced records carry `externalId` + `syncSourceId` so manual edits aren't clobbered; significant actions write to `AuditLog`.\n8. **MVP that feels finished.** Every list/detail has a designed empty state, skeletons (no layout shift), and an error boundary. This is what makes the MVP read as complete.\n\n**Priority stack (pragmatic MVP).** Must run, must look beautiful. The Tickets module is the flagship and demo centerpiece — build it deep. Everything else is genuinely functional but leaner where noted in §9's stub/full split.\n\n---\n\n## 2) Tech Stack & Versions\n\n| Layer | Choice |\n|---|---|\n| Framework | **Next.js 16** (App Router, React 19, Turbopack) |\n| Language | **TypeScript** (strict) |\n| UI | **shadcn/ui** + **Tailwind v4** (CSS-variable tokens, OKLCH) |\n| Icons | **lucide-react** (only library; 1.5px stroke) |\n| Tables | **TanStack Table v8** |\n| Forms | **react-hook-form** + **zod** (`zodResolver`) |\n| Validation | **Zod** (single source of truth) |\n| ORM | **Prisma** — SQLite (dev) / Postgres (prod) |\n| Auth | **Auth.js v5 (NextAuth)** + `@auth/prisma-adapter`, OIDC/SSO + Credentials |\n| Theming | **next-themes** (class strategy) |\n| Toasts | **sonner** |\n| DnD (Kanban) | **@dnd-kit** |\n| Charts | **Recharts** |\n| Markdown | **@tailwindcss/typography** (`prose`) |\n| LDAP | **ldapts** |\n| Cron parsing | **cron-parser** |\n| Password hashing | **argon2** (or bcrypt) |\n| Package manager | **pnpm** |\n| Runtime notes | `/api/v1` + all Prisma access = **Node runtime**; `middleware.ts` = **Edge** (edge-safe auth config only) |\n\n**Fonts** (via `next/font/google`, subset `latin`, `display:swap`): **Inter** → `--font-sans`; **Bricolage Grotesque** → `--font-display`; **JetBrains Mono** → `--font-mono`.\n\n---\n\n## 3) Final Prisma Schema Sketch\n\n> **Conventions.** IDs are `cuid()` strings. Enums are `String` + Zod-enforced (SQLite has no native enums). JSON fields are `String`/TEXT (de/serialized in app; switchable to `Json` on Postgres). Human refs (`Ticket.number`, `Problem.number`, `Change.number`) are `Int @default(autoincrement()) @unique`, displayed as `INC-<n>`, `PRB-<n>`, `CHG-<n>`. Datasource `provider = \"sqlite\"` for dev; swap to `\"postgresql\"` for prod (same models). Mirror every enum in `lib/enums.ts`.\n\n```prisma\ngenerator client {\n  provider = \"prisma-client-js\"\n}\n\ndatasource db {\n  provider = \"sqlite\" // prod: \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n\n// ─────────────────────────── AUTH (Auth.js v5) ───────────────────────────\n\nmodel User {\n  id              String    @id @default(cuid())\n  email           String    @unique\n  name            String?\n  image           String?\n  hashedPassword  String?   // null for pure-SSO users\n  emailVerified   DateTime?\n  isActive        Boolean   @default(true)\n  isServiceAccount Boolean  @default(false)\n  phone           String?\n  title           String?\n  location        String?\n  timezone        String?\n  locale          String?   @default(\"en\")\n  externalId      String?   // id in LDAP/AD/IdP for sync correlation\n  syncSourceId    String?   // null = local record\n  lastLoginAt     DateTime?\n  createdAt       DateTime  @default(now())\n  updatedAt       DateTime  @updatedAt\n\n  accounts        Account[]\n  sessions        Session[]\n  roles           UserRole[]\n  memberships     GroupMembership[]\n  managedGroups   Group[]          @relation(\"GroupManager\")\n  createdTickets  Ticket[]         @relation(\"TicketRequester\")\n  reportedTickets Ticket[]         @relation(\"TicketCreatedBy\")\n  assignedTickets Ticket[]         @relation(\"TicketAssignee\")\n  comments        TicketComment[]\n  problemsOwned   Problem[]        @relation(\"ProblemAssignee\")\n  changesRequested Change[]        @relation(\"ChangeRequestedBy\")\n  changesAssigned Change[]         @relation(\"ChangeAssignee\")\n  approvals       ChangeApproval[]\n  ownedAssets     Asset[]          @relation(\"AssetOwner\")\n  usedAssets      Asset[]          @relation(\"AssetUser\")\n  apiTokens       ApiToken[]\n  notifications   Notification[]\n  auditLogs       AuditLog[]\n  attachments     Attachment[]     @relation(\"AttachmentUploader\")\n  syncSource      SyncSource?      @relation(fields: [syncSourceId], references: [id])\n\n  @@index([syncSourceId])\n}\n\nmodel Account {\n  id                String  @id @default(cuid())\n  userId            String\n  type              String\n  provider          String\n  providerAccountId String\n  refresh_token     String?\n  access_token      String?\n  expires_at        Int?\n  token_type        String?\n  scope             String?\n  id_token          String?\n  session_state     String?\n  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@unique([provider, providerAccountId])\n}\n\nmodel Session {\n  id           String   @id @default(cuid())\n  sessionToken String   @unique\n  userId       String\n  expires      DateTime\n  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)\n}\n\nmodel VerificationToken {\n  identifier String\n  token      String   @unique\n  expires    DateTime\n\n  @@unique([identifier, token])\n}\n\n// ─────────────────────────── RBAC ───────────────────────────\n\nmodel Role {\n  id          String   @id @default(cuid())\n  name        String   @unique\n  description String?\n  isSystem    Boolean  @default(false)\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n  permissions RolePermission[]\n  users       UserRole[]\n}\n\nmodel Permission {\n  id          String   @id @default(cuid())\n  key         String   @unique // \"ticket.update\"\n  resource    String\n  action      String\n  description String?\n  roles       RolePermission[]\n}\n\nmodel RolePermission {\n  roleId       String\n  permissionId String\n  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)\n  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)\n\n  @@id([roleId, permissionId])\n}\n\nmodel UserRole {\n  userId       String\n  roleId       String\n  assignedAt   DateTime @default(now())\n  assignedById String?\n  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)\n  role         Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)\n\n  @@id([userId, roleId])\n}\n\n// ─────────────────────────── ORG / ROUTING ───────────────────────────\n\nmodel Group {\n  id           String   @id @default(cuid())\n  name         String   @unique\n  description  String?\n  type         String   @default(\"TEAM\") // GroupType\n  parentId     String?\n  managerId    String?\n  externalId   String?\n  syncSourceId String?\n  isActive     Boolean  @default(true)\n  createdAt    DateTime @default(now())\n  updatedAt    DateTime @updatedAt\n\n  parent          Group?            @relation(\"GroupHierarchy\", fields: [parentId], references: [id])\n  children        Group[]           @relation(\"GroupHierarchy\")\n  manager         User?             @relation(\"GroupManager\", fields: [managerId], references: [id])\n  members         GroupMembership[]\n  queues          Queue[]\n  assignedTickets Ticket[]          @relation(\"TicketAssignedGroup\")\n  services        Service[]         @relation(\"ServiceSupportGroup\")\n  syncSource      SyncSource?       @relation(fields: [syncSourceId], references: [id])\n\n  @@index([syncSourceId])\n}\n\nmodel GroupMembership {\n  userId   String\n  groupId  String\n  isLead   Boolean  @default(false)\n  joinedAt DateTime @default(now())\n  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)\n  group    Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)\n\n  @@id([userId, groupId])\n}\n\nmodel Queue {\n  id                String   @id @default(cuid())\n  name              String   @unique\n  key               String   @unique\n  description       String?\n  color             String?\n  groupId           String?\n  defaultAssigneeId String?\n  defaultSlaId      String?\n  isDefault         Boolean  @default(false)\n  isActive          Boolean  @default(true)\n  sortOrder         Int      @default(0)\n  createdAt         DateTime @default(now())\n  updatedAt         DateTime @updatedAt\n\n  group      Group?   @relation(fields: [groupId], references: [id])\n  defaultSla Sla?     @relation(fields: [defaultSlaId], references: [id])\n  tickets    Ticket[]\n}\n\nmodel Category {\n  id          String   @id @default(cuid())\n  name        String\n  description String?\n  parentId    String?\n  path        String?  // denormalized materialized path\n  icon        String?\n  isActive    Boolean  @default(true)\n  sortOrder   Int      @default(0)\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  parent   Category?  @relation(\"CategoryTree\", fields: [parentId], references: [id])\n  children Category[] @relation(\"CategoryTree\")\n  tickets  Ticket[]\n  problems Problem[]\n  changes  Change[]\n  services Service[]\n\n  @@unique([parentId, name])\n}\n\nmodel Service {\n  id               String   @id @default(cuid())\n  name             String   @unique\n  slug             String   @unique\n  shortDescription String?\n  description      String?\n  categoryId       String?\n  icon             String?\n  status           String   @default(\"ACTIVE\")   // ServiceStatus\n  criticality      String   @default(\"MEDIUM\")   // ServiceCriticality\n  isRequestable    Boolean  @default(true)\n  supportGroupId   String?\n  slaId            String?\n  ownerId          String?\n  sortOrder        Int      @default(0)\n  createdAt        DateTime @default(now())\n  updatedAt        DateTime @updatedAt\n\n  category     Category? @relation(fields: [categoryId], references: [id])\n  supportGroup Group?    @relation(\"ServiceSupportGroup\", fields: [supportGroupId], references: [id])\n  sla          Sla?      @relation(fields: [slaId], references: [id])\n  tickets      Ticket[]\n  assets       Asset[]   @relation(\"AssetService\")\n  changes      Change[]\n}\n\nmodel Sla {\n  id                String   @id @default(cuid())\n  name              String   @unique\n  description       String?\n  responseMinutes   Int\n  resolutionMinutes Int\n  appliesToPriority String?  // Priority filter, null = all\n  businessHoursOnly Boolean  @default(true)\n  isActive          Boolean  @default(true)\n  createdAt         DateTime @default(now())\n  updatedAt         DateTime @updatedAt\n\n  queues   Queue[]\n  services Service[]\n  tickets  Ticket[]\n}\n\n// ─────────────────────────── TICKETS ───────────────────────────\n\nmodel Ticket {\n  id              String    @id @default(cuid())\n  number          Int       @unique @default(autoincrement())\n  type            String    @default(\"INCIDENT\") // TicketType\n  subject         String\n  description     String?\n  status          String    @default(\"NEW\")      // TicketStatus\n  priority        String    @default(\"MEDIUM\")   // Priority\n  impact          String    @default(\"MEDIUM\")   // Impact\n  urgency         String    @default(\"MEDIUM\")   // Urgency\n  source          String    @default(\"PORTAL\")   // TicketSource\n  requesterId     String\n  createdById     String?\n  assigneeId      String?\n  assignedGroupId String?\n  queueId         String?\n  categoryId      String?\n  serviceId       String?\n  assetId         String?\n  slaId           String?\n  problemId       String?\n  changeId        String?\n  dueAt           DateTime?\n  responseDueAt   DateTime?\n  firstResponseAt DateTime?\n  resolvedAt      DateTime?\n  closedAt        DateTime?\n  slaBreached     Boolean   @default(false)\n  resolutionNote  String?\n  createdAt       DateTime  @default(now())\n  updatedAt       DateTime  @updatedAt\n\n  requester     User            @relation(\"TicketRequester\", fields: [requesterId], references: [id])\n  createdBy     User?           @relation(\"TicketCreatedBy\", fields: [createdById], references: [id])\n  assignee      User?           @relation(\"TicketAssignee\", fields: [assigneeId], references: [id])\n  assignedGroup Group?          @relation(\"TicketAssignedGroup\", fields: [assignedGroupId], references: [id])\n  queue         Queue?          @relation(fields: [queueId], references: [id])\n  category      Category?       @relation(fields: [categoryId], references: [id])\n  service       Service?        @relation(fields: [serviceId], references: [id])\n  asset         Asset?          @relation(fields: [assetId], references: [id])\n  sla           Sla?            @relation(fields: [slaId], references: [id])\n  problem       Problem?        @relation(fields: [problemId], references: [id])\n  change        Change?         @relation(fields: [changeId], references: [id])\n  comments      TicketComment[]\n  attachments   Attachment[]\n  relatedAssets Asset[]         @relation(\"TicketAssets\")\n\n  @@index([status, priority])\n  @@index([assigneeId])\n  @@index([queueId])\n}\n\nmodel TicketComment {\n  id        String   @id @default(cuid())\n  ticketId  String\n  authorId  String?\n  body      String\n  isInternal Boolean @default(false)\n  isSystem  Boolean  @default(false)\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n\n  ticket      Ticket       @relation(fields: [ticketId], references: [id], onDelete: Cascade)\n  author      User?        @relation(fields: [authorId], references: [id])\n  attachments Attachment[]\n\n  @@index([ticketId])\n}\n\n// ─────────────────────────── PROBLEMS / CHANGES ───────────────────────────\n\nmodel Problem {\n  id          String   @id @default(cuid())\n  number      Int      @unique @default(autoincrement())\n  title       String\n  description String?\n  status      String   @default(\"NEW\")    // ProblemStatus\n  priority    String   @default(\"MEDIUM\") // Priority\n  impact      String   @default(\"MEDIUM\") // Impact\n  rootCause   String?\n  workaround  String?\n  assigneeId  String?\n  categoryId  String?\n  resolvedAt  DateTime?\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  assignee    User?        @relation(\"ProblemAssignee\", fields: [assigneeId], references: [id])\n  category    Category?    @relation(fields: [categoryId], references: [id])\n  tickets     Ticket[]\n  changes     Change[]\n  attachments Attachment[]\n}\n\nmodel Change {\n  id                 String    @id @default(cuid())\n  number             Int       @unique @default(autoincrement())\n  title              String\n  description        String?\n  type               String    @default(\"NORMAL\")  // ChangeType\n  status             String    @default(\"DRAFT\")   // ChangeStatus\n  risk               String    @default(\"MEDIUM\")  // RiskLevel\n  priority           String    @default(\"MEDIUM\")  // Priority\n  impact             String    @default(\"MEDIUM\")  // Impact\n  requestedById      String\n  assigneeId         String?\n  categoryId         String?\n  serviceId          String?\n  problemId          String?\n  implementationPlan String?\n  rollbackPlan       String?\n  plannedStart       DateTime?\n  plannedEnd         DateTime?\n  actualStart        DateTime?\n  actualEnd          DateTime?\n  createdAt          DateTime  @default(now())\n  updatedAt          DateTime  @updatedAt\n\n  requestedBy    User             @relation(\"ChangeRequestedBy\", fields: [requestedById], references: [id])\n  assignee       User?            @relation(\"ChangeAssignee\", fields: [assigneeId], references: [id])\n  category       Category?        @relation(fields: [categoryId], references: [id])\n  service        Service?         @relation(fields: [serviceId], references: [id])\n  problem        Problem?         @relation(fields: [problemId], references: [id])\n  approvals      ChangeApproval[]\n  tickets        Ticket[]\n  affectedAssets Asset[]          @relation(\"ChangeAssets\")\n  attachments    Attachment[]\n}\n\nmodel ChangeApproval {\n  id         String    @id @default(cuid())\n  changeId   String\n  approverId String\n  status     String    @default(\"PENDING\") // ApprovalStatus\n  stage      Int       @default(1)\n  comment    String?\n  decidedAt  DateTime?\n  createdAt  DateTime  @default(now())\n\n  change   Change @relation(fields: [changeId], references: [id], onDelete: Cascade)\n  approver User   @relation(fields: [approverId], references: [id])\n\n  @@unique([changeId, approverId, stage])\n}\n\n// ─────────────────────────── CMDB ───────────────────────────\n\nmodel Asset {\n  id             String    @id @default(cuid())\n  assetTag       String?   @unique\n  name           String\n  typeId         String\n  status         String    @default(\"IN_USE\") // AssetStatus\n  serialNumber   String?\n  model          String?\n  manufacturer   String?\n  ipAddress      String?\n  macAddress     String?\n  hostname       String?\n  location       String?\n  ownerId        String?\n  userId         String?\n  serviceId      String?\n  categoryId     String?\n  purchaseDate   DateTime?\n  warrantyExpiry DateTime?\n  cost           Float?\n  notes          String?\n  attributes     String?   // JSON blob (TEXT)\n  externalId     String?\n  syncSourceId   String?\n  lastSeenAt     DateTime?\n  createdAt      DateTime  @default(now())\n  updatedAt      DateTime  @updatedAt\n\n  type          AssetType       @relation(fields: [typeId], references: [id])\n  owner         User?           @relation(\"AssetOwner\", fields: [ownerId], references: [id])\n  user          User?           @relation(\"AssetUser\", fields: [userId], references: [id])\n  service       Service?        @relation(\"AssetService\", fields: [serviceId], references: [id])\n  category      Category?       @relation(fields: [categoryId], references: [id])\n  syncSource    SyncSource?     @relation(fields: [syncSourceId], references: [id])\n  relationsFrom AssetRelation[] @relation(\"RelationSource\")\n  relationsTo   AssetRelation[] @relation(\"RelationTarget\")\n  tickets       Ticket[]\n  relatedTickets Ticket[]       @relation(\"TicketAssets\")\n  changes       Change[]        @relation(\"ChangeAssets\")\n  attachments   Attachment[]\n\n  @@index([typeId])\n  @@index([status])\n  @@index([syncSourceId])\n}\n\nmodel AssetType {\n  id              String   @id @default(cuid())\n  name            String   @unique\n  key             String   @unique\n  icon            String?\n  parentId        String?\n  attributeSchema String?  // JSON (TEXT)\n  isActive        Boolean  @default(true)\n  createdAt       DateTime @default(now())\n\n  parent   AssetType?  @relation(\"AssetTypeTree\", fields: [parentId], references: [id])\n  children AssetType[] @relation(\"AssetTypeTree\")\n  assets   Asset[]\n}\n\nmodel AssetRelation {\n  id          String   @id @default(cuid())\n  sourceId    String\n  targetId    String\n  type        String   @default(\"DEPENDS_ON\") // RelationType\n  description String?\n  createdAt   DateTime @default(now())\n\n  source Asset @relation(\"RelationSource\", fields: [sourceId], references: [id], onDelete: Cascade)\n  target Asset @relation(\"RelationTarget\", fields: [targetId], references: [id], onDelete: Cascade)\n\n  @@unique([sourceId, targetId, type])\n  @@index([sourceId])\n  @@index([targetId])\n}\n\n// ─────────────────────────── SHARED: ATTACHMENTS / AUDIT / NOTIFY ───────────────────────────\n\nmodel Attachment {\n  id           String   @id @default(cuid())\n  filename     String\n  storageKey   String\n  mimeType     String\n  size         Int\n  checksum     String?\n  uploadedById String?\n  ticketId     String?\n  commentId    String?\n  problemId    String?\n  changeId     String?\n  assetId      String?\n  createdAt    DateTime @default(now())\n\n  uploadedBy User?          @relation(\"AttachmentUploader\", fields: [uploadedById], references: [id])\n  ticket     Ticket?        @relation(fields: [ticketId], references: [id], onDelete: Cascade)\n  comment    TicketComment? @relation(fields: [commentId], references: [id], onDelete: Cascade)\n  problem    Problem?       @relation(fields: [problemId], references: [id], onDelete: Cascade)\n  change     Change?        @relation(fields: [changeId], references: [id], onDelete: Cascade)\n  asset      Asset?         @relation(fields: [assetId], references: [id], onDelete: Cascade)\n}\n\nmodel AuditLog {\n  id         String   @id @default(cuid())\n  actorId    String?\n  action     String   // AuditAction\n  entityType String\n  entityId   String?\n  summary    String?\n  changes    String?  // JSON diff (TEXT)\n  ipAddress  String?\n  userAgent  String?\n  createdAt  DateTime @default(now())\n\n  actor User? @relation(fields: [actorId], references: [id])\n\n  @@index([entityType, entityId])\n  @@index([actorId])\n  @@index([createdAt])\n}\n\nmodel Notification {\n  id         String   @id @default(cuid())\n  userId     String\n  type       String   // NotificationType\n  title      String\n  body       String?\n  entityType String?\n  entityId   String?\n  isRead     Boolean  @default(false)\n  readAt     DateTime?\n  channel    String   @default(\"IN_APP\") // NotificationChannel\n  createdAt  DateTime @default(now())\n\n  user User @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@index([userId, isRead])\n}\n\n// ─────────────────────────── SYNC ───────────────────────────\n\nmodel SyncSource {\n  id          String   @id @default(cuid())\n  name        String   @unique\n  type        String   // SyncType (LDAP | ACTIVE_DIRECTORY | ASSET_DISCOVERY | EXTERNAL_ITSM | CSV | SCIM)\n  direction   String   @default(\"INBOUND\") // SyncDirection\n  config      String   // JSON (TEXT) — secrets encrypted at app layer\n  isEnabled   Boolean  @default(true)\n  scheduleCron String?\n  lastRunAt   DateTime?\n  lastStatus  String?  // SyncStatus\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  runs   SyncRun[]\n  users  User[]\n  groups Group[]\n  assets Asset[]\n}\n\nmodel SyncRun {\n  id               String    @id @default(cuid())\n  syncSourceId     String\n  status           String    @default(\"RUNNING\")   // SyncStatus\n  trigger          String    @default(\"SCHEDULED\")  // SyncTrigger\n  startedAt        DateTime  @default(now())\n  finishedAt       DateTime?\n  recordsProcessed Int       @default(0)\n  recordsCreated   Int       @default(0)\n  recordsUpdated   Int       @default(0)\n  recordsFailed    Int       @default(0)\n  log              String?   // JSON/text (TEXT)\n\n  syncSource SyncSource @relation(fields: [syncSourceId], references: [id], onDelete: Cascade)\n\n  @@index([syncSourceId])\n}\n\n// ─────────────────────────── API TOKENS ───────────────────────────\n\nmodel ApiToken {\n  id         String    @id @default(cuid())\n  name       String\n  tokenHash  String    @unique // sha256; raw shown once\n  prefix     String    // \"srv_ab12\"\n  userId     String?   // null = service token\n  scopes     String?   // JSON/CSV of permission keys (TEXT)\n  lastUsedAt DateTime?\n  expiresAt  DateTime?\n  revokedAt  DateTime?\n  createdAt  DateTime  @default(now())\n\n  user User? @relation(fields: [userId], references: [id], onDelete: Cascade)\n\n  @@index([userId])\n}\n```\n\n**Enums (as Zod, in `lib/enums.ts` — mirrored, single source of truth):**\n`TicketType`(INCIDENT, REQUEST) · `TicketStatus`(NEW, OPEN, PENDING, ON_HOLD, RESOLVED, CLOSED, CANCELLED) · `TicketSource`(PORTAL, EMAIL, PHONE, API, AGENT) · `Priority`(LOW, MEDIUM, HIGH, CRITICAL) · `Impact`(LOW, MEDIUM, HIGH) · `Urgency`(LOW, MEDIUM, HIGH) · `ProblemStatus`(NEW, INVESTIGATING, KNOWN_ERROR, RESOLVED, CLOSED) · `ChangeType`(STANDARD, NORMAL, EMERGENCY) · `ChangeStatus`(DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, REJECTED, SCHEDULED, IN_PROGRESS, IMPLEMENTED, REVIEW, CLOSED, CANCELLED) · `RiskLevel`(LOW, MEDIUM, HIGH) · `ApprovalStatus`(PENDING, APPROVED, REJECTED, DELEGATED) · `AssetStatus`(PLANNED, ORDERED, IN_STOCK, IN_USE, MAINTENANCE, RETIRED, DISPOSED) · `RelationType`(DEPENDS_ON, HOSTS, RUNS_ON, CONNECTS_TO, PART_OF, INSTALLED_ON, MANAGED_BY, BACKS_UP) · `GroupType`(TEAM, DEPARTMENT, ORGANIZATION) · `ServiceStatus`(ACTIVE, RETIRED, MAINTENANCE, DRAFT) · `ServiceCriticality`(LOW, MEDIUM, HIGH, CRITICAL) · `SyncType`(LDAP, ACTIVE_DIRECTORY, ASSET_DISCOVERY, EXTERNAL_ITSM, CSV, SCIM) · `SyncDirection`(INBOUND, OUTBOUND, BIDIRECTIONAL) · `SyncStatus`(SUCCESS, FAILED, PARTIAL, RUNNING) · `SyncTrigger`(SCHEDULED, MANUAL, WEBHOOK) · `AuditAction`(CREATE, UPDATE, DELETE, LOGIN, LOGOUT, ASSIGN, STATUS_CHANGE, APPROVE, REJECT, SYNC, EXPORT) · `NotificationType`(TICKET_ASSIGNED, TICKET_UPDATED, COMMENT_ADDED, MENTION, SLA_BREACH, APPROVAL_REQUEST, CHANGE_APPROVED, SYNC_FAILED, SYSTEM) · `NotificationChannel`(IN_APP, EMAIL, WEBHOOK).\n\n> **Note on Sync type naming.** The DB `SyncType` enum uses the canonical set above (`LDAP`, `ACTIVE_DIRECTORY`, `ASSET_DISCOVERY`, `EXTERNAL_ITSM`, `CSV`, `SCIM`). The sync **connector registry** keys map onto these (`ldap-ad` → `ACTIVE_DIRECTORY`/`LDAP`, `csv-import` → `CSV`, `asset-discovery` → `ASSET_DISCOVERY`, `external-itsm` → `EXTERNAL_ITSM`). Keep the enum as the DB source of truth; connector keys are an app-layer detail.\n\n---\n\n## 4) App Route / Folder Tree\n\n```\nE:/DEV/servio\n├─ prisma/\n│  ├─ schema.prisma\n│  ├─ seed.ts\n│  └─ fixtures/ad-users.json           # real AD-import connector fixture\n├─ src/\n│  ├─ middleware.ts                    # Edge RBAC gate (imports auth.config only)\n│  ├─ auth.config.ts                   # edge-safe: providers + callbacks, NO Prisma\n│  ├─ auth.ts                          # adds PrismaAdapter; exports { handlers, auth, signIn, signOut }\n│  ├─ app/\n│  │  ├─ layout.tsx                    # html/body, fonts, ThemeProvider, Toaster\n│  │  ├─ page.tsx                      # landing; redirects authed → /dashboard\n│  │  ├─ globals.css                   # Tailwind v4 + OKLCH tokens\n│  │  ├─ (auth)/\n│  │  │  ├─ layout.tsx                 # centered auth shell\n│  │  │  ├─ login/page.tsx             # OIDC/SSO + Credentials\n│  │  │  ├─ login/sso/[provider]/route.ts\n│  │  │  └─ error/page.tsx\n│  │  ├─ (app)/\n│  │  │  ├─ layout.tsx                 # staff shell (sidebar+topbar), session-guarded\n│  │  │  ├─ dashboard/page.tsx\n│  │  │  ├─ tickets/{page,new/page,[id]/page,[id]/edit/page}.tsx\n│  │  │  ├─ tickets/actions.ts\n│  │  │  ├─ problems/{page,[id]/page}.tsx + actions.ts\n│  │  │  ├─ changes/{page,[id]/page}.tsx + actions.ts\n│  │  │  ├─ queues/{page,[id]/page}.tsx + actions.ts\n│  │  │  ├─ groups/{page,[id]/page}.tsx + actions.ts\n│  │  │  ├─ services/{page,[id]/page}.tsx + actions.ts\n│  │  │  ├─ categories/page.tsx + actions.ts\n│  │  │  ├─ assets/{page,new/page,[id]/page}.tsx + actions.ts\n│  │  │  ├─ syncs/{page,new/page,[id]/page,[id]/runs/[runId]/page}.tsx + actions.ts\n│  │  │  └─ admin/\n│  │  │     ├─ layout.tsx              # ADMIN-only gate\n│  │  │     ├─ users/page.tsx\n│  │  │     ├─ roles/page.tsx\n│  │  │     ├─ sso/page.tsx\n│  │  │     ├─ api-keys/page.tsx\n│  │  │     └─ sla/page.tsx\n│  │  ├─ (portal)/\n│  │  │  ├─ layout.tsx                 # friendly self-service shell\n│  │  │  └─ portal/\n│  │  │     ├─ page.tsx                # hero + search + catalog + my tickets\n│  │  │     ├─ catalog/{page,[serviceId]/page}.tsx\n│  │  │     ├─ tickets/{page,new/page,[id]/page}.tsx\n│  │  │     └─ knowledge/page.tsx\n│  │  └─ api/\n│  │     ├─ auth/[...nextauth]/route.ts\n│  │     ├─ v1/\n│  │     │  ├─ route.ts                # version info + endpoint index\n│  │     │  ├─ openapi.json/route.ts   # generated from Zod\n│  │     │  ├─ tickets/route.ts        # GET list, POST\n│  │     │  ├─ tickets/[id]/route.ts   # GET/PATCH/DELETE\n│  │     │  ├─ tickets/[id]/comments/route.ts\n│  │     │  ├─ tickets/[id]/transition/route.ts\n│  │     │  ├─ tickets/[id]/assign/route.ts\n│  │     │  ├─ assets/route.ts + assets/[id]/route.ts\n│  │     │  ├─ assets/[id]/relationships/route.ts\n│  │     │  ├─ problems/route.ts + changes/route.ts + services/route.ts\n│  │     │  └─ syncs/[id]/trigger/route.ts\n│  │     ├─ webhooks/[source]/route.ts\n│  │     └─ cron/sync/route.ts         # CRON_SECRET-guarded dispatcher\n│  ├─ components/\n│  │  ├─ ui/                           # shadcn primitives\n│  │  ├─ app-sidebar.tsx, topbar.tsx, command-palette.tsx, breadcrumbs.tsx\n│  │  ├─ page-header.tsx, stat-card.tsx, data-table/*, empty-state.tsx\n│  │  ├─ status-badge.tsx, priority-indicator.tsx, sla-badge.tsx\n│  │  ├─ user-chip.tsx, relative-time.tsx, activity-timeline.tsx, kanban/*\n│  │  └─ portal/*                      # hero, catalog-card, request-form, status-stepper\n│  └─ lib/\n│     ├─ db.ts                         # Prisma singleton\n│     ├─ enums.ts                      # Zod enums (single source of truth)\n│     ├─ rbac.ts                       # can(role|perms, action, resource)\n│     ├─ api-auth.ts                   # Bearer token resolve + scope check\n│     ├─ audit.ts, priority-matrix.ts, sla.ts\n│     ├─ schemas/                      # ticket.ts, asset.ts, change.ts, ... (shared Zod)\n│     ├─ data/                         # server-side query layer per module\n│     ├─ api/                          # query.ts (whitelist→where), rate-limit.ts, envelope.ts, openapi.ts\n│     └─ sync/                         # connector.ts, registry.ts, engine.ts, queue.ts, connectors/*\n├─ .env.example\n├─ components.json\n└─ package.json\n```\n\n---\n\n## 5) Auth & RBAC\n\n**Split config (Auth.js v5 recommended pattern).**\n- `auth.config.ts` — **edge-safe**: providers list + `jwt`/`session`/`authorized` callbacks, **no Prisma import**. Imported by `middleware.ts`.\n- `auth.ts` — adds `PrismaAdapter(db)`, re-exports `{ handlers, auth, signIn, signOut }`. Node runtime only.\n\n**Session strategy: JWT.** Required so Edge middleware can read the token without a DB connection. The `jwt` callback bakes `userId`, effective `role`, `permissions[]`, and `groupIds[]` into the token; the `session` callback surfaces them on `session.user`.\n\n**Providers.**\n1. **Generic OIDC/SSO (primary)** — env-driven (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`). Works with Entra ID / Keycloak / Okta / Google. `profile()` maps OIDC claims → Servio user; JIT-provisions new users via the adapter with default role **REQUESTER**. A `groups`/`roles` claim is mapped to Servio roles in the `signIn` callback. **Opt-in**: only registered when the env vars are present.\n2. **Credentials (always available)** — verifies `argon2` hash from `User.hashedPassword`. This is the offline/dev + break-glass admin path, so the app runs with no IdP.\n\n**System roles & permissions.** Roles: **ADMIN** (full config), **MANAGER** (approvals, reporting), **TECHNICIAN/AGENT** (agent app, assigned queues), **REQUESTER** (portal only). Permissions are string-keyed `resource.action` (e.g. `ticket.create`, `asset.delete`, `sync.trigger`, `admin.manage`), seeded as a catalog. Effective permissions = union across a user's roles.\n\n> Role vocabulary is unified: the RBAC model names the four canonical roles **ADMIN / MANAGER / AGENT (aka TECHNICIAN) / REQUESTER**. Treat AGENT and TECHNICIAN as the same role; seed it as `AGENT` and alias in copy where \"Technician\" reads better.\n\n**Enforcement layers.**\n- **Edge (coarse, path-based) — `middleware.ts`.** Unauthenticated → redirect to `/(auth)/login` for `(app)` and `(portal)`. `/(app)/admin/*` requires ADMIN; `/(app)/*` requires AGENT+; `/(portal)/*` requires any authed user. `matcher` **excludes** `/api/auth`, static assets, and `/api/v1` (token-authed, not cookie-authed).\n- **Server (fine-grained).** `lib/rbac.ts` `can(principal, action, resource)` used in Server Actions, Route Handlers, and page-level guards. `(app)/admin/layout.tsx` is a hard ADMIN gate.\n- **API.** `/api/v1` uses `lib/api-auth.ts` Bearer resolution + scope check — **not** the session.\n\n**Route-group isolation.** Three groups (`(auth)`, `(app)`, `(portal)`) each own a layout + RBAC gate, so the portal can never render agent tooling even on a guessed URL.\n\n---\n\n## 6) Sync Engine\n\n**Domain.** `SyncSource` (config JSON + `scheduleCron` + `isEnabled` + `lastRunAt`/`lastStatus`) → `SyncRun` (per-execution audit: `trigger`, `status`, timings, `recordsProcessed/Created/Updated/Failed`, `log`). Synced `User`/`Group`/`Asset` carry `externalId` + `syncSourceId` for idempotent upserts and provenance.\n\n**Connector contract — `lib/sync/connector.ts`.**\n```ts\ninterface SyncConnector<TConfig> {\n  type: string;                          // maps to SyncType\n  configSchema: ZodSchema<TConfig>;      // validated before run\n  testConnection(cfg: TConfig): Promise<Result>;\n  run(ctx: SyncRunContext, cfg: TConfig): AsyncIterable<SyncRecord> | Promise<SyncSummary>;\n}\n// SyncRunContext: { prisma, logger (appends to SyncRun.log), upsert(byExternalId) }\n```\n\n**Registry — `lib/sync/registry.ts`.** Maps connector key → instance. Adding a connector = drop a file in `lib/sync/connectors/` and register it. Ships with:\n- `ldap-ad.ts` — LDAP bind + paged search (`ldapts`), maps directory entries → User/Group. **[real end-to-end target for its fixture-backed AD variant]**\n- `csv-import.ts` — streamed CSV → Asset/User via column mapping in config.\n- `asset-discovery.ts` — ingests scanner/agent JSON → CMDB CIs + relationships.\n- `external-itsm.ts` — pulls tickets/CIs from another ITSM REST API.\n\n**Orchestrator — `lib/sync/engine.ts` `runSync(sourceId, trigger)`** (single entrypoint for all trigger paths):\n1. Create `SyncRun` (RUNNING). 2. Resolve connector from registry. 3. Validate `config` with `connector.configSchema`. 4. Stream records; upsert idempotently by `(syncSourceId, externalId)`. 5. Honor `preserveManualEdits` provenance flag so manually-edited synced records aren't clobbered. 6. Accumulate stats; per-record errors recorded without aborting the whole run. 7. Mark SUCCESS/PARTIAL/FAILED; update `SyncSource.lastRunAt`/`lastStatus`.\n\n**Trigger paths.**\n- **Manual** — Server Action `triggerSyncRun` on `syncs/[id]/page.tsx`, or `POST /api/v1/syncs/[id]/trigger` (scope `sync:trigger`).\n- **Scheduled** — external scheduler hits `GET /api/cron/sync?secret=CRON_SECRET`; loads enabled sources whose cron is due (`cron-parser`) and dispatches `runSync` for each.\n- **Webhook** — `POST /api/webhooks/[source]`, verified by per-source secret, enqueues a WEBHOOK run.\n\n**Execution model — queue-agnostic.** Dev/self-host runs inline in the request (fine for small dirs/CSVs). Prod offloads to a worker (BullMQ/Redis or standalone Node process) via `lib/sync/queue.ts` so serverless timeouts don't truncate large LDAP/discovery syncs. `runSync` is the one entrypoint both call.\n\n**MVP scope:** the **fixture-backed AD user import** is fully real (reads `prisma/fixtures/ad-users.json`, upserts Users/Groups, writes a `SyncRun`). Remaining connectors ship as configurable UI + realistic simulated run history.\n\n---\n\n## 7) REST API\n\n**Shape.** Versioned under `/api/v1/*` (Route Handlers, **Node runtime** for Prisma). OpenAPI 3.1 served at `/api/v1/openapi.json`, generated from the same Zod schemas used for validation.\n\n**Auth.** `Authorization: Bearer <token>`. `ApiToken` rows are created in `/admin/api-keys`, stored as **SHA-256 hash** with an indexed short `prefix` for lookup, carrying `scopes` (e.g. `tickets:read`, `tickets:write`, `assets:read`, `assets:write`, `sync:trigger`) and optional expiry. `lib/api-auth.ts` resolves the key, checks scope, injects an acting principal. No cookies/CSRF. Both user-bound and service (`userId` null) tokens supported.\n\n**Envelope.**\n- List: `{ data: T[], pagination: { page, pageSize, total, totalPages, hasNext }, links: { self, next, prev } }`\n- Single: the object directly.\n- Error: `{ error: { code, message, details? } }` with proper status — 400 validation, 401 no/invalid token, 403 scope, 404, 409 conflict, 422 Zod, 429 rate limit.\n\n**Pagination.** `?page=` & `?pageSize=` (default 25, max 100); `?cursor=` keyset for large asset lists (ordered by id). Never unbounded.\n\n**Filtering & sorting.** Query params → whitelisted Prisma `where` via `lib/api/query.ts`. Each resource declares an allow-list of filterable/sortable fields. Examples: `?status=OPEN,IN_PROGRESS&priority=HIGH&queueId=…&createdAt[gte]=…&q=free-text&sort=-createdAt`.\n\n**Endpoints.**\n- Tickets *(fully writable)*: `GET/POST /tickets`, `GET/PATCH/DELETE /tickets/{id}`, `GET/POST /tickets/{id}/comments`, `POST /tickets/{id}/transition`, `POST /tickets/{id}/assign`.\n- Assets/CMDB *(fully writable)*: `GET/POST /assets`, `GET/PATCH/DELETE /assets/{id}`, `GET /assets/{id}/relationships`.\n- Secondary *(read + token auth; writes minimal/read-only if time-constrained)*: `/problems`, `/changes`, `/services`.\n- Sync: `POST /syncs/{id}/trigger` (scope `sync:trigger`).\n\n**Cross-cutting.** Per-key rate limiting (token-bucket, `lib/api/rate-limit.ts`; Redis in prod, in-memory in dev) with `X-RateLimit-*` headers. Every request logged to `AuditLog` with the acting key. camelCase JSON, ISO-8601 timestamps, cuid/uuid string IDs. Bodies validated by the shared `lib/schemas/*` (reused by Server Actions) — no drift.\n\n---\n\n## 8) Design System\n\n**Tokens** — ship as shadcn CSS variables in **OKLCH** (Tailwind v4 native), defined in `app/globals.css` under `@layer base` `:root` (light) / `.dark`, registered via `@theme inline`.\n\n- **Brand hue — Servio Indigo (~264°).** `--primary` light `oklch(0.55 0.20 264)` (#5B54E6); dark `oklch(0.68 0.17 264)` (#8B84F5, lifted for contrast); `--primary-foreground` `oklch(0.985 0 0)` both modes.\n- **Light.** `--background oklch(0.995 0.002 264)`; `--foreground oklch(0.22 0.02 264)`; `--card #fff`; `--muted oklch(0.968 0.004 264)`; `--muted-foreground oklch(0.52 0.02 264)`; `--border/--input oklch(0.922 0.004 264)`; `--ring` = primary.\n- **Dark (near-black control room).** `--background oklch(0.17 0.01 264)`; `--foreground oklch(0.96 0.005 264)`; `--card oklch(0.205 0.012 264)` (one step lighter for depth); `--popover oklch(0.23 0.014 264)`; `--muted oklch(0.26 0.012 264)`; `--muted-foreground oklch(0.68 0.015 264)`; `--border oklch(0.28 0.012 264 / 0.8)`; `--ring` = primary dark.\n- **Semantic status tokens** (own scale, not chart colors), each with a `*-subtle` bg variant: Open/New neutral `oklch(0.62 0.02 264)`; In-Progress amber `oklch(0.72 0.16 75)`; Pending/On-Hold violet-grey `oklch(0.60 0.10 300)`; Resolved green `oklch(0.68 0.16 155)`; Closed = muted-foreground.\n- **Priority scale** (always dot + label, never color-only): Low neutral; Medium blue `oklch(0.70 0.14 230)`; High orange `oklch(0.70 0.17 55)`; Critical = `--destructive`.\n- **Destructive** (delete + Critical only): light `oklch(0.58 0.22 25)`, dark `oklch(0.68 0.19 25)`.\n- **Charts** `--chart-1..5`: indigo, green, amber, magenta, cyan. Plus shadcn `--sidebar-*` tokens.\n- **Radius & elevation.** `--radius: 0.625rem` (cards 0.75rem, buttons/inputs 0.5rem, badges full). Soft low shadows (`shadow-xs` on cards, light only); dark relies on border/card contrast. Popovers/command palette get `shadow-lg` + border. No neon glows.\n- **Accessibility.** WCAG AA (4.5:1 body, 3:1 UI); status always dot/icon + label; focus ring `focus-visible:ring-[3px] ring-ring/50` + 2px offset.\n\n**Fonts.** `next/font/google`, subset latin, `display:swap`. Body/UI **Inter** → `--font-sans` (default). Headings/wordmark **Bricolage Grotesque** → `--font-display` (500–600 only, tracking `-0.02em`). IDs/timestamps/keys **JetBrains Mono** → `--font-mono` with `tabular-nums`. Wire in `@theme inline` (`--font-sans`, `--font-display`, `--font-mono`).\n\n**Type scale (dashboard-tight).** H1 page title `text-2xl` font-display 600 `tracking-[-0.02em]`; H2 `text-lg` 600; H3 card title `text-sm` 600; **body `text-sm` (14px, workhorse)**; meta `text-xs text-muted-foreground`; micro eyebrows `text-[11px] uppercase tracking-wide`. Weights 400/500/600 only (700 reserved for portal hero). Long-form uses `prose prose-sm dark:prose-invert max-w-[68ch]`.\n\n**App shell (staff).** shadcn **sidebar** block: `<SidebarProvider><AppSidebar/><SidebarInset>…</SidebarInset></SidebarProvider>`, `variant=\"inset\"`, `collapsible=\"icon\"` (3.5rem rail ↔ 16rem, cookie-persisted, ⌘B toggles).\n- **Sidebar:** brand lockup (mark collapses to squircle glyph) → prominent **New** split-button → grouped nav with eyebrow labels: **WORKSPACE** (Dashboard, My Work, Queues) · **SERVICE DESK** (Tickets, Problems, Changes, Services) · **CMDB** (Assets, Categories) · **DIRECTORY** (Groups, Users) · **SYSTEM** (Syncs, API, Settings). Items = icon + label + right-aligned count badge; active = `bg-sidebar-accent` + 2px primary left bar. Footer: user menu (avatar, role, theme toggle, sign out).\n- **Topbar** (`h-14`, sticky, `border-b`, `bg-background/80 backdrop-blur`): SidebarTrigger + breadcrumbs (left); command-palette button \"Search or jump to… ⌘K\" + New + notifications bell (unread dot) + theme toggle + avatar (right). Mobile: sidebar → Sheet.\n- **Command palette (⌘K)** — shadcn `CommandDialog`: Quick actions, Navigation, Recent, Search results (debounced from REST API). Power-user backbone.\n- **PageHeader** — title (font-display) + description + right-aligned primary action + overflow menu; list pages get a sticky filter toolbar under it. Container `max-w-screen-2xl mx-auto px-4 lg:px-6 py-4 lg:py-6`. Density: 4px grid, table rows `h-11`, buttons `h-9`.\n- **Motion.** 120–180ms, ease-out enter / ease-in exit; `tailwindcss-animate`; respect `prefers-reduced-motion`. Theme via `next-themes` (`attribute=\"class\"`, `defaultTheme=\"system\"`, `disableTransitionOnChange`, `suppressHydrationWarning`).\n\n**Portal shell (self-service).** Same tokens, calmer composition: slim centered top bar, **hero band** (low-chroma primary→background gradient, font-display greeting, large rounded search over KB + catalog). No left nav — card-driven. Large catalog category cards (icon in `--primary-subtle`), split intent CTAs (\"Report an issue\" / \"Request something\"). \"My Requests\" = friendly list with status stepper (Submitted → In Progress → Resolved), friendlier labels (\"Being worked on\"), CSAT on resolve. Mobile-first (sticky bottom \"New request\"). Shares badge/token system with staff app.\n\n**Core components.**\n- **DataTable** — TanStack v8 through shadcn `<Table>`: sticky header, hover rows (no zebra), checkbox select, pinned id + actions columns, column-visibility menu, sortable headers, **server-side** pagination/sort/filter. Toolbar: faceted multi-select popovers (status/priority/queue/assignee) + text search; active filters as removable chips. Empty state (icon + message + Clear filters); skeleton rows (`h-11`), no spinners.\n- **Badges** — `<StatusBadge>` (subtle fill + leading dot), `<PriorityIndicator>` (dot + label, Critical gets destructive ring), `<SlaBadge>` (\"Due in 2h\" → amber → destructive with pulse on breach). Plus `<UserChip>`, `<RelativeTime>`.\n- **StatCards** — grid `grid-cols-2 lg:grid-cols-4`: eyebrow, big `text-2xl font-display tabular-nums` number, delta chip, tiny Recharts sparkline; clickable → filtered list.\n- **Entity detail** — two-column on `lg`: main (60–65%) header (mono id chip + inline-editable title + status/priority/SLA badges) + Tabs (Overview / Activity / Related / Attachments); sticky right rail (35%) properties card. Action cluster in header (Assign to me, Change status, Resolve) + overflow menu.\n- **Activity timeline** — vertical rail, node dot colored by event type; entry = avatar, actor, verb, relative time, body (prose markdown or diff pill \"Status: Open → In Progress\"). Composer pinned bottom with @mention, attachment, internal-note toggle (tinted `--muted` + \"Internal\" badge, hidden from portal).\n- **Kanban board** — `@dnd-kit`, columns = statuses (count + status-color underline), cards (id chip, 2-line title, priority dot, assignee avatar, SLA, counts), optimistic PATCH + toast undo. List/Board toggle on Queues + Tickets.\n- **Forms** — react-hook-form + zod, shadcn `<Form>`; grouped Card sections; searchable Combobox for assignee/requester/category/service; inline-on-blur validation + submit summary; loading/disabled submit.\n- **Feedback** — `sonner` toasts with Undo/View actions; `<AlertDialog>` for destructive confirms; first-class empty/skeleton/error-boundary states everywhere.\n- **Syncs UI** — connector card grid (status pill Connected/Error/Never run, last-run relative time, run/config), detail = config form + run-history table + field-mapping UI + \"view log\" drawer.\n\n---\n\n## 9) Ordered Build Milestones\n\n> **Full vs. stub guardrails:** Fully implement — Tickets (flagship), Auth (dev creds always + opt-in OIDC), shell + DataTable + design system, Portal submit/track/comment, Queues/Groups/Categories/Services CRUD (dialogs), REST API for Tickets + Assets with real token auth + UI, one real sync connector (fixture AD import). Stub (realistically) — other sync connectors (config UI + simulated runs), CMDB topology graph (styled list, real data), Change scheduling/CAB calendar (state machine real), Problem auto-correlation, Attachments (metadata + local-disk only), SLA (aging indicators from timestamps, not a policy engine), KB (seeded static articles), API writes for problems/changes/services.\n\n| # | Milestone | Deliverable |\n|---|---|---|\n| **1** | **Scaffold & Tooling** | Init Next.js 16 (App Router, React 19, Turbopack) + TS strict. Tailwind v4, shadcn init + core primitives (button, input, card, table, dialog, sheet, dropdown-menu, badge, avatar, tabs, select, form, sonner, skeleton). Zod, ESLint/Prettier, `@/*` aliases, `.env.example`, lucide-react, next-themes. → Boots on `pnpm dev` with a themed placeholder; clean lint/typecheck. |\n| **2** | **Database & Prisma Schema** | Full schema (§3) on SQLite; generate client; first migration; `lib/db.ts` singleton; `lib/enums.ts` Zod mirror. → `prisma studio` shows empty tables. |\n| **3** | **Auth (SSO/OIDC) + RBAC** | Auth.js v5 split config, PrismaAdapter, JWT sessions with role/perms/groups. Generic OIDC (opt-in via env) + Credentials (always). `middleware.ts` path RBAC; `lib/rbac.ts`. → Working login (OIDC button when configured + dev creds), redirect to dashboard, logout, roles enforced. Runs offline with no IdP. |\n| **4** | **App Shell & Design System** | globals.css OKLCH tokens + fonts; staff shell (sidebar/topbar/breadcrumbs/command palette) + portal shell; reusable DataTable, PageHeader, StatCard, StatusBadge, PriorityIndicator, SlaBadge, EmptyState, DetailPanel. → Navigable app + portal, beautiful empty-state dashboard, DataTable demoed. |\n| **5** | **Tickets Module (flagship, full)** | Full CRUD incidents/requests; DataTable with filters + saved-view chips; detail (timeline, comments/internal notes, right-rail properties, linked assets); create/edit (RHF+Zod); status transitions; reassign; **priority auto-derived from impact×urgency matrix** (`lib/priority-matrix.ts`); Server Actions + AuditLog writes; optimistic toasts. → End-to-end lifecycle create→triage→comment→reassign→resolve→close. |\n| **6** | **Queues, Groups, Categories, Services** | CRUD (DataTable + create/edit **dialogs**): Queues (routing), Groups (members), Categories (hierarchical tree, expand/collapse), Services (catalog, owner group, category, request template). Wired as selectable relations in ticket forms. → All taxonomy/routing manageable; services double as portal catalog. |\n| **7** | **Self-Service Portal** | `/portal` home (catalog cards + KB quick actions), guided service-driven submit form, \"My tickets\" list + conversation thread (reply, internal notes hidden), status stepper, CSAT on resolve. Requester-scoped queries reuse ticket data layer. → Requester logs in, browses catalog, files & tracks a ticket. |\n| **8** | **Problems & Changes** | Problems: list + detail, link related tickets, root-cause/workaround, status flow. Changes: list + detail, real approval state machine (DRAFT→SUBMITTED→PENDING_APPROVAL→APPROVED/REJECTED→SCHEDULED→IN_PROGRESS→IMPLEMENTED→REVIEW→CLOSED), risk/impact, `ChangeApproval` CAB rows (multi-stage), planned window, linked assets/services. → Both browsable/mutable; approval flow works. *(CAB calendar/conflict detection stubbed.)* |\n| **9** | **Assets / CMDB** | DataTable (faceted by type/status/owner/location), asset detail (attributes, linked tickets, CI relationships as styled list/mini-diagram — real data), create/edit forms, AssetType management. → Browsable CMDB with relationships + ticket cross-links. *(Live topology graph stubbed.)* |\n| **10** | **Syncs / Integrations** | Connector registry + config forms, enable/disable, \"Run now\", SyncRun history (status/counts/log). **One real connector**: fixture AD import upserts Users/Groups + writes SyncRun. Others = configurable + simulated runs. → Integrations page + genuinely working import that visibly adds users/groups. |\n| **11** | **Public REST API** | `/api/v1` for tickets, assets, problems, changes, services, users. Bearer `ApiToken` auth (hashed) + scope checks, Zod bodies, envelope + errors + pagination, rate limiting. Admin token UI (create/revoke, raw shown once). OpenAPI JSON + lightweight docs page. → curl-able authenticated API; Tickets/Assets fully writable, secondary read-only if time-constrained. |\n| **12** | **Seed Data, Polish & Docs** | `prisma/seed.ts` (§10). Dashboard widgets (open by priority, aging, by queue) on real data. Global command palette search across modules. Visual polish pass (skeletons, empty states, responsive, dark-mode QA). README + demo creds. Single `pnpm setup` (install+migrate+seed). → First run `pnpm setup && pnpm dev` looks alive and every module is demonstrable. |\n\n---\n\n## 10) Seed Data Plan (`prisma/seed.ts`)\n\nSeed is **idempotent** (upsert by natural keys) and prints demo credentials + raw API tokens to stdout/README.\n\n1. **RBAC catalog** — seed system `Role`s (ADMIN, MANAGER, AGENT, REQUESTER, `isSystem:true`) and the full `Permission` catalog (`resource.action`), plus `RolePermission` mappings.\n2. **Users & roles (~15)** — named demo accounts with known passwords for dev Credentials login: `admin@servio.dev` / `agent@servio.dev` / `user@servio.dev` (all password `servio`), plus realistic filler users with DiceBear avatar URLs. Assign roles via `UserRole`.\n3. **Groups & Queues** — 4–5 groups (Service Desk, Network Team, Infrastructure, Application Support, Security) with `GroupMembership`; 4–5 queues (Inbox [default], Incidents, Requests, Escalations, Change Advisory) mapped to groups.\n4. **Categories** — 2–3 level tree: Hardware › {Laptop, Desktop, Printer}; Software › {OS, Application, License}; Network › {Connectivity, VPN, WiFi}; Access › {Account, Permissions}. Populate `path`.\n5. **Services (8–10)** — New Laptop Request, VPN Access, Password Reset, Email Setup, Software Install, Onboarding, Offboarding, Guest WiFi — with owner groups, categories, short descriptions, `isRequestable:true` so the portal catalog looks full.\n6. **AssetTypes** — Laptop, Desktop, Server, Router/Network, Software/Application, License, Mobile.\n7. **SLAs** — 2–3 policies (e.g. Standard, Priority) with response/resolution minutes.\n8. **Tickets (60–80)** — mix of INCIDENT/REQUEST across all statuses and priorities (derived via impact×urgency matrix), distributed across queues/agents/requesters, realistic titles, multi-message comment threads (public + internal), timestamps spread over ~60 days so dashboards/aging look alive.\n9. **Problems (4–6)** — a couple in KNOWN_ERROR, each linked to several incidents, with root-cause notes.\n10. **Changes (6–8)** — across workflow states (some DRAFT/SUBMITTED, some APPROVED/IMPLEMENTED, one REJECTED), with `ChangeApproval` approvers, risk levels, planned windows, linked assets/services.\n11. **Assets (40–60)** — across all types/statuses with owners, locations, serials/IPs; ~20 `AssetRelation` edges (app DEPENDS_ON server, server PART_OF location, workstation used-by user); several cross-linked to tickets.\n12. **Syncs** — 3–4 `SyncSource` (AD User Import [real, with `fixtures/ad-users.json`], LDAP Directory, Asset Discovery, External ITSM), each with historical `SyncRun` records (SUCCESS/PARTIAL/FAILED + counts). \"Run now\" on AD Import visibly adds users/groups.\n13. **API tokens (1–2)** — pre-seeded demo tokens; raw values printed once so the REST API + docs page are immediately curl-able.\n14. **AuditLog** — back-fill a stream (ticket created/assigned/resolved, change approved, asset updated) so activity feeds and the dashboard \"recent activity\" widget are populated on first run.\n15. **KB (5–6 static articles)** — Reset your password, Connect to VPN, Request new hardware, etc., surfaced in the portal (and portal/agent search).\n\n**Setup command.** `pnpm setup` = `prisma migrate dev` (or `db push` for dev) + `prisma generate` + `tsx prisma/seed.ts`. Then `pnpm dev` boots a populated, screenshot-ready app.",
    "raw": {
      "dataModel": {
        "models": [
          {
            "name": "User",
            "purpose": "Human accounts (agents, requesters, admins). Backing store for Auth.js identity plus ITSM profile. Requesters submit tickets via self-service portal; agents/admins operate the tool.",
            "fields": [
              "id:String @id @default(cuid())",
              "email:String @unique",
              "name:String?",
              "image:String?",
              "hashedPassword:String? (null for pure SSO users)",
              "emailVerified:DateTime?",
              "isActive:Boolean @default(true)",
              "isServiceAccount:Boolean @default(false)",
              "phone:String?",
              "title:String?",
              "location:String?",
              "timezone:String?",
              "locale:String? @default(\"en\")",
              "externalId:String? (id in LDAP/AD/IdP for sync correlation)",
              "syncSourceId:String? (which SyncSource owns this record, null = local)",
              "lastLoginAt:DateTime?",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "accounts Account[] (Auth.js OAuth/OIDC accounts)",
              "sessions Session[] (Auth.js)",
              "roles UserRole[] (RBAC many-to-many via join)",
              "memberships GroupMembership[] (groups the user belongs to)",
              "managedGroups Group[] @relation(\"GroupManager\")",
              "createdTickets Ticket[] @relation(\"TicketRequester\")",
              "reportedTickets Ticket[] @relation(\"TicketCreatedBy\")",
              "assignedTickets Ticket[] @relation(\"TicketAssignee\")",
              "comments TicketComment[]",
              "problemsOwned Problem[] @relation(\"ProblemAssignee\")",
              "changesRequested Change[] @relation(\"ChangeRequestedBy\")",
              "changesAssigned Change[] @relation(\"ChangeAssignee\")",
              "approvals ChangeApproval[]",
              "ownedAssets Asset[] @relation(\"AssetOwner\")",
              "usedAssets Asset[] @relation(\"AssetUser\")",
              "apiTokens ApiToken[]",
              "notifications Notification[]",
              "auditLogs AuditLog[]",
              "attachments Attachment[] @relation(\"AttachmentUploader\")",
              "syncSource SyncSource? @relation(fields: [syncSourceId])"
            ]
          },
          {
            "name": "Account",
            "purpose": "Auth.js v5 required model: links a User to an external OAuth/OIDC provider (SSO). One row per linked identity provider.",
            "fields": [
              "id:String @id @default(cuid())",
              "userId:String",
              "type:String (oauth | oidc | email)",
              "provider:String",
              "providerAccountId:String",
              "refresh_token:String?",
              "access_token:String?",
              "expires_at:Int?",
              "token_type:String?",
              "scope:String?",
              "id_token:String?",
              "session_state:String?",
              "@@unique([provider, providerAccountId])"
            ],
            "relations": [
              "user User @relation(fields: [userId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "Session",
            "purpose": "Auth.js v5 database session (used when not pure-JWT). Tracks active login sessions per user.",
            "fields": [
              "id:String @id @default(cuid())",
              "sessionToken:String @unique",
              "userId:String",
              "expires:DateTime"
            ],
            "relations": [
              "user User @relation(fields: [userId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "VerificationToken",
            "purpose": "Auth.js v5 model for email verification / magic-link and passwordless flows.",
            "fields": [
              "identifier:String",
              "token:String @unique",
              "expires:DateTime",
              "@@unique([identifier, token])"
            ],
            "relations": []
          },
          {
            "name": "Role",
            "purpose": "RBAC role (e.g. Admin, Agent, Manager, Requester). Aggregates permissions; assigned to users. Some roles flagged isSystem to prevent deletion.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique",
              "description:String?",
              "isSystem:Boolean @default(false)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "permissions RolePermission[]",
              "users UserRole[]"
            ]
          },
          {
            "name": "Permission",
            "purpose": "Fine-grained capability, string-keyed by resource.action (e.g. ticket.create, asset.delete, admin.manage). Seeded catalog referenced by roles.",
            "fields": [
              "id:String @id @default(cuid())",
              "key:String @unique (e.g. \"ticket.update\")",
              "resource:String (e.g. \"ticket\")",
              "action:String (e.g. \"update\")",
              "description:String?"
            ],
            "relations": [
              "roles RolePermission[]"
            ]
          },
          {
            "name": "RolePermission",
            "purpose": "Explicit join between Role and Permission (many-to-many). Explicit table so future scoping metadata can be added.",
            "fields": [
              "roleId:String",
              "permissionId:String",
              "@@id([roleId, permissionId])"
            ],
            "relations": [
              "role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)",
              "permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "UserRole",
            "purpose": "Explicit join between User and Role (many-to-many). Records who assigned the role and when for auditability.",
            "fields": [
              "userId:String",
              "roleId:String",
              "assignedAt:DateTime @default(now())",
              "assignedById:String?",
              "@@id([userId, roleId])"
            ],
            "relations": [
              "user User @relation(fields: [userId], references: [id], onDelete: Cascade)",
              "role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "Group",
            "purpose": "Team / organizational unit (e.g. Network Team, Service Desk). Tickets and queues route to groups; supports LDAP/AD sync. Self-referential parentId enables hierarchy.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique",
              "description:String?",
              "type:String @default(\"TEAM\") (GroupType enum-as-string: TEAM | DEPARTMENT | ORGANIZATION)",
              "parentId:String?",
              "managerId:String?",
              "externalId:String?",
              "syncSourceId:String?",
              "isActive:Boolean @default(true)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "parent Group? @relation(\"GroupHierarchy\", fields: [parentId], references: [id])",
              "children Group[] @relation(\"GroupHierarchy\")",
              "manager User? @relation(\"GroupManager\", fields: [managerId], references: [id])",
              "members GroupMembership[]",
              "queues Queue[]",
              "assignedTickets Ticket[] @relation(\"TicketAssignedGroup\")",
              "services Service[] @relation(\"ServiceSupportGroup\")",
              "syncSource SyncSource? @relation(fields: [syncSourceId])"
            ]
          },
          {
            "name": "GroupMembership",
            "purpose": "Explicit User-Group join with per-membership role flag (member vs lead) for routing/escalation.",
            "fields": [
              "userId:String",
              "groupId:String",
              "isLead:Boolean @default(false)",
              "joinedAt:DateTime @default(now())",
              "@@id([userId, groupId])"
            ],
            "relations": [
              "user User @relation(fields: [userId], references: [id], onDelete: Cascade)",
              "group Group @relation(fields: [groupId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "Queue",
            "purpose": "Named work queue tickets land in (e.g. \"Level 1 Support\", \"Hardware\"). Owned by a group, has default assignment + SLA policy. Central to ticket triage.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique",
              "key:String @unique (short slug, e.g. \"L1\")",
              "description:String?",
              "color:String? (UI hex badge)",
              "groupId:String?",
              "defaultAssigneeId:String?",
              "defaultSlaId:String?",
              "isDefault:Boolean @default(false)",
              "isActive:Boolean @default(true)",
              "sortOrder:Int @default(0)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "group Group? @relation(fields: [groupId], references: [id])",
              "defaultSla Sla? @relation(fields: [defaultSlaId], references: [id])",
              "tickets Ticket[]"
            ]
          },
          {
            "name": "Category",
            "purpose": "Hierarchical classification tree for tickets/problems/changes/services (e.g. Software > Email > Outlook). Self-referential for unlimited nesting.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String",
              "description:String?",
              "parentId:String?",
              "path:String? (denormalized materialized path for fast tree queries)",
              "icon:String?",
              "isActive:Boolean @default(true)",
              "sortOrder:Int @default(0)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt",
              "@@unique([parentId, name])"
            ],
            "relations": [
              "parent Category? @relation(\"CategoryTree\", fields: [parentId], references: [id])",
              "children Category[] @relation(\"CategoryTree\")",
              "tickets Ticket[]",
              "problems Problem[]",
              "changes Change[]",
              "services Service[]"
            ]
          },
          {
            "name": "Service",
            "purpose": "Service catalog entry (business/technical service, e.g. \"Email\", \"VPN Access\"). Requesters browse/order from the self-service portal; tickets link to the affected service. Has owning support group + SLA.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique",
              "slug:String @unique",
              "shortDescription:String?",
              "description:String? (long form / markdown)",
              "categoryId:String?",
              "icon:String?",
              "status:String @default(\"ACTIVE\") (ServiceStatus enum-as-string: ACTIVE | RETIRED | MAINTENANCE | DRAFT)",
              "criticality:String @default(\"MEDIUM\") (ServiceCriticality enum-as-string: LOW | MEDIUM | HIGH | CRITICAL)",
              "isRequestable:Boolean @default(true) (visible in portal catalog)",
              "supportGroupId:String?",
              "slaId:String?",
              "ownerId:String?",
              "sortOrder:Int @default(0)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "category Category? @relation(fields: [categoryId], references: [id])",
              "supportGroup Group? @relation(\"ServiceSupportGroup\", fields: [supportGroupId], references: [id])",
              "sla Sla? @relation(fields: [slaId], references: [id])",
              "tickets Ticket[]",
              "assets Asset[] @relation(\"AssetService\")",
              "changes Change[]"
            ]
          },
          {
            "name": "Sla",
            "purpose": "Service Level Agreement policy defining response/resolution time targets per priority. Applied to queues/services/tickets to compute due dates and breach status.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique",
              "description:String?",
              "responseMinutes:Int (time-to-first-response target)",
              "resolutionMinutes:Int (time-to-resolution target)",
              "appliesToPriority:String? (Priority enum-as-string filter, null = all)",
              "businessHoursOnly:Boolean @default(true)",
              "isActive:Boolean @default(true)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "queues Queue[]",
              "services Service[]",
              "tickets Ticket[]"
            ]
          },
          {
            "name": "Ticket",
            "purpose": "Core work item: incident or service request. Carries status/priority/impact/urgency/type, routing (queue/group/assignee), SLA timestamps, and links to service/category/asset. The heart of the ITSM tool.",
            "fields": [
              "id:String @id @default(cuid())",
              "number:Int @unique @default(autoincrement()) (human ref, e.g. INC-1042)",
              "type:String @default(\"INCIDENT\") (TicketType enum-as-string: INCIDENT | REQUEST)",
              "subject:String",
              "description:String?",
              "status:String @default(\"NEW\") (TicketStatus enum-as-string: NEW | OPEN | PENDING | ON_HOLD | RESOLVED | CLOSED | CANCELLED)",
              "priority:String @default(\"MEDIUM\") (Priority enum-as-string: LOW | MEDIUM | HIGH | CRITICAL)",
              "impact:String @default(\"MEDIUM\") (Impact enum-as-string: LOW | MEDIUM | HIGH)",
              "urgency:String @default(\"MEDIUM\") (Urgency enum-as-string: LOW | MEDIUM | HIGH)",
              "source:String @default(\"PORTAL\") (TicketSource enum-as-string: PORTAL | EMAIL | PHONE | API | AGENT)",
              "requesterId:String (who the ticket is for)",
              "createdById:String? (who logged it, may differ from requester)",
              "assigneeId:String?",
              "assignedGroupId:String?",
              "queueId:String?",
              "categoryId:String?",
              "serviceId:String?",
              "assetId:String? (primary affected CI)",
              "slaId:String?",
              "problemId:String? (linked known problem)",
              "changeId:String? (linked change)",
              "dueAt:DateTime? (SLA resolution due)",
              "responseDueAt:DateTime?",
              "firstResponseAt:DateTime?",
              "resolvedAt:DateTime?",
              "closedAt:DateTime?",
              "slaBreached:Boolean @default(false)",
              "resolutionNote:String?",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt",
              "@@index([status, priority])",
              "@@index([assigneeId])",
              "@@index([queueId])"
            ],
            "relations": [
              "requester User @relation(\"TicketRequester\", fields: [requesterId], references: [id])",
              "createdBy User? @relation(\"TicketCreatedBy\", fields: [createdById], references: [id])",
              "assignee User? @relation(\"TicketAssignee\", fields: [assigneeId], references: [id])",
              "assignedGroup Group? @relation(\"TicketAssignedGroup\", fields: [assignedGroupId], references: [id])",
              "queue Queue? @relation(fields: [queueId], references: [id])",
              "category Category? @relation(fields: [categoryId], references: [id])",
              "service Service? @relation(fields: [serviceId], references: [id])",
              "asset Asset? @relation(fields: [assetId], references: [id])",
              "sla Sla? @relation(fields: [slaId], references: [id])",
              "problem Problem? @relation(fields: [problemId], references: [id])",
              "change Change? @relation(fields: [changeId], references: [id])",
              "comments TicketComment[]",
              "attachments Attachment[]",
              "relatedAssets Asset[] @relation(\"TicketAssets\")"
            ]
          },
          {
            "name": "TicketComment",
            "purpose": "Threaded activity on a ticket: public replies (visible to requester) vs internal notes (agents only). Also captures system-generated event entries.",
            "fields": [
              "id:String @id @default(cuid())",
              "ticketId:String",
              "authorId:String?",
              "body:String",
              "isInternal:Boolean @default(false)",
              "isSystem:Boolean @default(false) (auto-generated status/assignment change)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt",
              "@@index([ticketId])"
            ],
            "relations": [
              "ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)",
              "author User? @relation(fields: [authorId], references: [id])",
              "attachments Attachment[]"
            ]
          },
          {
            "name": "Problem",
            "purpose": "ITIL Problem record: root cause behind one or more incidents. Tracks known-error/workaround and links related tickets for problem management.",
            "fields": [
              "id:String @id @default(cuid())",
              "number:Int @unique @default(autoincrement()) (e.g. PRB-12)",
              "title:String",
              "description:String?",
              "status:String @default(\"NEW\") (ProblemStatus enum-as-string: NEW | INVESTIGATING | KNOWN_ERROR | RESOLVED | CLOSED)",
              "priority:String @default(\"MEDIUM\") (Priority enum-as-string)",
              "impact:String @default(\"MEDIUM\") (Impact enum-as-string)",
              "rootCause:String?",
              "workaround:String?",
              "assigneeId:String?",
              "categoryId:String?",
              "resolvedAt:DateTime?",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "assignee User? @relation(\"ProblemAssignee\", fields: [assigneeId], references: [id])",
              "category Category? @relation(fields: [categoryId], references: [id])",
              "tickets Ticket[] (incidents caused by this problem)",
              "changes Change[] (fixes raised)",
              "attachments Attachment[]"
            ]
          },
          {
            "name": "Change",
            "purpose": "Change request with a formal approval + implementation workflow. Carries change type/risk, scheduling window, and drives ChangeApproval records (CAB). Links to problems/services/assets.",
            "fields": [
              "id:String @id @default(cuid())",
              "number:Int @unique @default(autoincrement()) (e.g. CHG-33)",
              "title:String",
              "description:String?",
              "type:String @default(\"NORMAL\") (ChangeType enum-as-string: STANDARD | NORMAL | EMERGENCY)",
              "status:String @default(\"DRAFT\") (ChangeStatus enum-as-string: DRAFT | SUBMITTED | PENDING_APPROVAL | APPROVED | REJECTED | SCHEDULED | IN_PROGRESS | IMPLEMENTED | REVIEW | CLOSED | CANCELLED)",
              "risk:String @default(\"MEDIUM\") (RiskLevel enum-as-string: LOW | MEDIUM | HIGH)",
              "priority:String @default(\"MEDIUM\") (Priority enum-as-string)",
              "impact:String @default(\"MEDIUM\") (Impact enum-as-string)",
              "requestedById:String",
              "assigneeId:String?",
              "categoryId:String?",
              "serviceId:String?",
              "problemId:String?",
              "implementationPlan:String?",
              "rollbackPlan:String?",
              "plannedStart:DateTime?",
              "plannedEnd:DateTime?",
              "actualStart:DateTime?",
              "actualEnd:DateTime?",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "requestedBy User @relation(\"ChangeRequestedBy\", fields: [requestedById], references: [id])",
              "assignee User? @relation(\"ChangeAssignee\", fields: [assigneeId], references: [id])",
              "category Category? @relation(fields: [categoryId], references: [id])",
              "service Service? @relation(fields: [serviceId], references: [id])",
              "problem Problem? @relation(fields: [problemId], references: [id])",
              "approvals ChangeApproval[]",
              "tickets Ticket[]",
              "affectedAssets Asset[] @relation(\"ChangeAssets\")",
              "attachments Attachment[]"
            ]
          },
          {
            "name": "ChangeApproval",
            "purpose": "Single approver's decision on a Change (CAB voting). Multiple rows per change enable multi-stage/parallel approval; status drives Change.status transition to APPROVED/REJECTED.",
            "fields": [
              "id:String @id @default(cuid())",
              "changeId:String",
              "approverId:String",
              "status:String @default(\"PENDING\") (ApprovalStatus enum-as-string: PENDING | APPROVED | REJECTED | DELEGATED)",
              "stage:Int @default(1) (approval order)",
              "comment:String?",
              "decidedAt:DateTime?",
              "createdAt:DateTime @default(now())",
              "@@unique([changeId, approverId, stage])"
            ],
            "relations": [
              "change Change @relation(fields: [changeId], references: [id], onDelete: Cascade)",
              "approver User @relation(fields: [approverId], references: [id])"
            ]
          },
          {
            "name": "Asset",
            "purpose": "Configuration Item in the CMDB (hardware, software, virtual, cloud, etc.). Typed by AssetType, has lifecycle status, ownership, and participates in a CI relationship graph via AssetRelation.",
            "fields": [
              "id:String @id @default(cuid())",
              "assetTag:String? @unique (inventory tag)",
              "name:String",
              "typeId:String (FK to AssetType)",
              "status:String @default(\"IN_USE\") (AssetStatus enum-as-string: PLANNED | ORDERED | IN_STOCK | IN_USE | MAINTENANCE | RETIRED | DISPOSED)",
              "serialNumber:String?",
              "model:String?",
              "manufacturer:String?",
              "ipAddress:String?",
              "macAddress:String?",
              "hostname:String?",
              "location:String?",
              "ownerId:String? (accountable owner)",
              "userId:String? (day-to-day user)",
              "serviceId:String? (service this CI supports)",
              "categoryId:String?",
              "purchaseDate:DateTime?",
              "warrantyExpiry:DateTime?",
              "cost:Float?",
              "notes:String?",
              "attributes:String? (JSON blob of type-specific custom fields, stored as TEXT in SQLite)",
              "externalId:String? (discovery/source id)",
              "syncSourceId:String? (asset discovery origin)",
              "lastSeenAt:DateTime? (last discovery heartbeat)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt",
              "@@index([typeId])",
              "@@index([status])"
            ],
            "relations": [
              "type AssetType @relation(fields: [typeId], references: [id])",
              "owner User? @relation(\"AssetOwner\", fields: [ownerId], references: [id])",
              "user User? @relation(\"AssetUser\", fields: [userId], references: [id])",
              "service Service? @relation(\"AssetService\", fields: [serviceId], references: [id])",
              "category Category? @relation(fields: [categoryId], references: [id])",
              "syncSource SyncSource? @relation(fields: [syncSourceId])",
              "relationsFrom AssetRelation[] @relation(\"RelationSource\")",
              "relationsTo AssetRelation[] @relation(\"RelationTarget\")",
              "tickets Ticket[] (primary-asset tickets)",
              "relatedTickets Ticket[] @relation(\"TicketAssets\")",
              "changes Change[] @relation(\"ChangeAssets\")",
              "attachments Attachment[]"
            ]
          },
          {
            "name": "AssetType",
            "purpose": "Defines a class of CI (e.g. Laptop, Server, Router, Application, License). Normalizes asset typing and can carry a schema hint for custom attributes. Supports parent for grouping.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique (e.g. \"Server\")",
              "key:String @unique (slug)",
              "icon:String?",
              "parentId:String? (type hierarchy)",
              "attributeSchema:String? (JSON of expected custom fields, TEXT in SQLite)",
              "isActive:Boolean @default(true)",
              "createdAt:DateTime @default(now())"
            ],
            "relations": [
              "parent AssetType? @relation(\"AssetTypeTree\", fields: [parentId], references: [id])",
              "children AssetType[] @relation(\"AssetTypeTree\")",
              "assets Asset[]"
            ]
          },
          {
            "name": "AssetRelation",
            "purpose": "Directed edge in the CMDB dependency graph between two Assets (e.g. DEPENDS_ON, HOSTS, CONNECTS_TO). Enables impact analysis and topology views.",
            "fields": [
              "id:String @id @default(cuid())",
              "sourceId:String",
              "targetId:String",
              "type:String @default(\"DEPENDS_ON\") (RelationType enum-as-string: DEPENDS_ON | HOSTS | RUNS_ON | CONNECTS_TO | PART_OF | INSTALLED_ON | MANAGED_BY | BACKS_UP)",
              "description:String?",
              "createdAt:DateTime @default(now())",
              "@@unique([sourceId, targetId, type])",
              "@@index([sourceId])",
              "@@index([targetId])"
            ],
            "relations": [
              "source Asset @relation(\"RelationSource\", fields: [sourceId], references: [id], onDelete: Cascade)",
              "target Asset @relation(\"RelationTarget\", fields: [targetId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "Attachment",
            "purpose": "Polymorphic file attachment (uploaded to disk/S3, metadata in DB). Nullable FKs to each parent entity keep it SQLite-friendly (no true polymorphism). Used by tickets, comments, problems, changes, assets.",
            "fields": [
              "id:String @id @default(cuid())",
              "filename:String (original name)",
              "storageKey:String (path / object key)",
              "mimeType:String",
              "size:Int (bytes)",
              "checksum:String?",
              "uploadedById:String?",
              "ticketId:String?",
              "commentId:String?",
              "problemId:String?",
              "changeId:String?",
              "assetId:String?",
              "createdAt:DateTime @default(now())"
            ],
            "relations": [
              "uploadedBy User? @relation(\"AttachmentUploader\", fields: [uploadedById], references: [id])",
              "ticket Ticket? @relation(fields: [ticketId], references: [id], onDelete: Cascade)",
              "comment TicketComment? @relation(fields: [commentId], references: [id], onDelete: Cascade)",
              "problem Problem? @relation(fields: [problemId], references: [id], onDelete: Cascade)",
              "change Change? @relation(fields: [changeId], references: [id], onDelete: Cascade)",
              "asset Asset? @relation(fields: [assetId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "SyncSource",
            "purpose": "Configured integration/sync endpoint (LDAP/AD, asset discovery, external ITSM). Holds connection config + schedule; owns synced Users/Groups/Assets and produces SyncRun history.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String @unique",
              "type:String (SyncType enum-as-string: LDAP | ACTIVE_DIRECTORY | ASSET_DISCOVERY | EXTERNAL_ITSM | CSV | SCIM)",
              "direction:String @default(\"INBOUND\") (SyncDirection enum-as-string: INBOUND | OUTBOUND | BIDIRECTIONAL)",
              "config:String (JSON connection settings, TEXT in SQLite — encrypt secrets at app layer)",
              "isEnabled:Boolean @default(true)",
              "scheduleCron:String? (cron expression)",
              "lastRunAt:DateTime?",
              "lastStatus:String? (SyncStatus enum-as-string: SUCCESS | FAILED | PARTIAL | RUNNING)",
              "createdAt:DateTime @default(now())",
              "updatedAt:DateTime @updatedAt"
            ],
            "relations": [
              "runs SyncRun[]",
              "users User[]",
              "groups Group[]",
              "assets Asset[]"
            ]
          },
          {
            "name": "SyncRun",
            "purpose": "Execution log of a single SyncSource run: counts, status, timing, and error detail. Powers the Syncs module's run-history/observability UI.",
            "fields": [
              "id:String @id @default(cuid())",
              "syncSourceId:String",
              "status:String @default(\"RUNNING\") (SyncStatus enum-as-string: SUCCESS | FAILED | PARTIAL | RUNNING)",
              "trigger:String @default(\"SCHEDULED\") (SyncTrigger enum-as-string: SCHEDULED | MANUAL | WEBHOOK)",
              "startedAt:DateTime @default(now())",
              "finishedAt:DateTime?",
              "recordsProcessed:Int @default(0)",
              "recordsCreated:Int @default(0)",
              "recordsUpdated:Int @default(0)",
              "recordsFailed:Int @default(0)",
              "log:String? (JSON/text detail or error stack, TEXT in SQLite)",
              "@@index([syncSourceId])"
            ],
            "relations": [
              "syncSource SyncSource @relation(fields: [syncSourceId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "ApiToken",
            "purpose": "Bearer token for the public REST API. Stores only a hash of the secret, scoped permissions, and expiry/revocation. Enables machine access without a session.",
            "fields": [
              "id:String @id @default(cuid())",
              "name:String (label)",
              "tokenHash:String @unique (sha256 of the secret; raw shown once)",
              "prefix:String (first chars for identification, e.g. \"srv_ab12\")",
              "userId:String? (acts on behalf of; null = service token)",
              "scopes:String? (JSON/CSV of permission keys, TEXT in SQLite)",
              "lastUsedAt:DateTime?",
              "expiresAt:DateTime?",
              "revokedAt:DateTime?",
              "createdAt:DateTime @default(now())",
              "@@index([userId])"
            ],
            "relations": [
              "user User? @relation(fields: [userId], references: [id], onDelete: Cascade)"
            ]
          },
          {
            "name": "AuditLog",
            "purpose": "Immutable trail of significant actions across the system for compliance/forensics. Polymorphic entity reference by type+id; captures actor, action, and JSON diff.",
            "fields": [
              "id:String @id @default(cuid())",
              "actorId:String? (null for system/anonymous)",
              "action:String (AuditAction enum-as-string: CREATE | UPDATE | DELETE | LOGIN | LOGOUT | ASSIGN | STATUS_CHANGE | APPROVE | REJECT | SYNC | EXPORT)",
              "entityType:String (e.g. \"Ticket\", \"Asset\")",
              "entityId:String?",
              "summary:String? (human-readable)",
              "changes:String? (JSON before/after diff, TEXT in SQLite)",
              "ipAddress:String?",
              "userAgent:String?",
              "createdAt:DateTime @default(now())",
              "@@index([entityType, entityId])",
              "@@index([actorId])",
              "@@index([createdAt])"
            ],
            "relations": [
              "actor User? @relation(fields: [actorId], references: [id])"
            ]
          },
          {
            "name": "Notification",
            "purpose": "Per-user in-app notification (assignment, mention, SLA breach, approval request). Optionally references a target entity for deep-linking; read/seen tracking for the bell UI.",
            "fields": [
              "id:String @id @default(cuid())",
              "userId:String (recipient)",
              "type:String (NotificationType enum-as-string: TICKET_ASSIGNED | TICKET_UPDATED | COMMENT_ADDED | MENTION | SLA_BREACH | APPROVAL_REQUEST | CHANGE_APPROVED | SYNC_FAILED | SYSTEM)",
              "title:String",
              "body:String?",
              "entityType:String? (deep-link target)",
              "entityId:String?",
              "isRead:Boolean @default(false)",
              "readAt:DateTime?",
              "channel:String @default(\"IN_APP\") (NotificationChannel enum-as-string: IN_APP | EMAIL | WEBHOOK)",
              "createdAt:DateTime @default(now())",
              "@@index([userId, isRead])"
            ],
            "relations": [
              "user User @relation(fields: [userId], references: [id], onDelete: Cascade)"
            ]
          }
        ],
        "enums": [
          {
            "name": "TicketType",
            "values": [
              "INCIDENT",
              "REQUEST"
            ]
          },
          {
            "name": "TicketStatus",
            "values": [
              "NEW",
              "OPEN",
              "PENDING",
              "ON_HOLD",
              "RESOLVED",
              "CLOSED",
              "CANCELLED"
            ]
          },
          {
            "name": "TicketSource",
            "values": [
              "PORTAL",
              "EMAIL",
              "PHONE",
              "API",
              "AGENT"
            ]
          },
          {
            "name": "Priority",
            "values": [
              "LOW",
              "MEDIUM",
              "HIGH",
              "CRITICAL"
            ]
          },
          {
            "name": "Impact",
            "values": [
              "LOW",
              "MEDIUM",
              "HIGH"
            ]
          },
          {
            "name": "Urgency",
            "values": [
              "LOW",
              "MEDIUM",
              "HIGH"
            ]
          },
          {
            "name": "ProblemStatus",
            "values": [
              "NEW",
              "INVESTIGATING",
              "KNOWN_ERROR",
              "RESOLVED",
              "CLOSED"
            ]
          },
          {
            "name": "ChangeType",
            "values": [
              "STANDARD",
              "NORMAL",
              "EMERGENCY"
            ]
          },
          {
            "name": "ChangeStatus",
            "values": [
              "DRAFT",
              "SUBMITTED",
              "PENDING_APPROVAL",
              "APPROVED",
              "REJECTED",
              "SCHEDULED",
              "IN_PROGRESS",
              "IMPLEMENTED",
              "REVIEW",
              "CLOSED",
              "CANCELLED"
            ]
          },
          {
            "name": "RiskLevel",
            "values": [
              "LOW",
              "MEDIUM",
              "HIGH"
            ]
          },
          {
            "name": "ApprovalStatus",
            "values": [
              "PENDING",
              "APPROVED",
              "REJECTED",
              "DELEGATED"
            ]
          },
          {
            "name": "AssetStatus",
            "values": [
              "PLANNED",
              "ORDERED",
              "IN_STOCK",
              "IN_USE",
              "MAINTENANCE",
              "RETIRED",
              "DISPOSED"
            ]
          },
          {
            "name": "RelationType",
            "values": [
              "DEPENDS_ON",
              "HOSTS",
              "RUNS_ON",
              "CONNECTS_TO",
              "PART_OF",
              "INSTALLED_ON",
              "MANAGED_BY",
              "BACKS_UP"
            ]
          },
          {
            "name": "GroupType",
            "values": [
              "TEAM",
              "DEPARTMENT",
              "ORGANIZATION"
            ]
          },
          {
            "name": "ServiceStatus",
            "values": [
              "ACTIVE",
              "RETIRED",
              "MAINTENANCE",
              "DRAFT"
            ]
          },
          {
            "name": "ServiceCriticality",
            "values": [
              "LOW",
              "MEDIUM",
              "HIGH",
              "CRITICAL"
            ]
          },
          {
            "name": "SyncType",
            "values": [
              "LDAP",
              "ACTIVE_DIRECTORY",
              "ASSET_DISCOVERY",
              "EXTERNAL_ITSM",
              "CSV",
              "SCIM"
            ]
          },
          {
            "name": "SyncDirection",
            "values": [
              "INBOUND",
              "OUTBOUND",
              "BIDIRECTIONAL"
            ]
          },
          {
            "name": "SyncStatus",
            "values": [
              "SUCCESS",
              "FAILED",
              "PARTIAL",
              "RUNNING"
            ]
          },
          {
            "name": "SyncTrigger",
            "values": [
              "SCHEDULED",
              "MANUAL",
              "WEBHOOK"
            ]
          },
          {
            "name": "AuditAction",
            "values": [
              "CREATE",
              "UPDATE",
              "DELETE",
              "LOGIN",
              "LOGOUT",
              "ASSIGN",
              "STATUS_CHANGE",
              "APPROVE",
              "REJECT",
              "SYNC",
              "EXPORT"
            ]
          },
          {
            "name": "NotificationType",
            "values": [
              "TICKET_ASSIGNED",
              "TICKET_UPDATED",
              "COMMENT_ADDED",
              "MENTION",
              "SLA_BREACH",
              "APPROVAL_REQUEST",
              "CHANGE_APPROVED",
              "SYNC_FAILED",
              "SYSTEM"
            ]
          },
          {
            "name": "NotificationChannel",
            "values": [
              "IN_APP",
              "EMAIL",
              "WEBHOOK"
            ]
          }
        ],
        "notes": [
          "Greenfield project: E:/DEV/servio is currently empty (no package.json, no prisma/schema.prisma yet). This is a from-scratch design, not reverse-engineered.",
          "SQLite constraint - NO native enums: the sqlite provider does not support Prisma `enum` blocks. All enums above must be modeled as `String` columns with the allowed values enforced at the app layer via Zod (single source of truth). The `enums` returned here are intended to be generated as Zod enums / TS union types, and optionally as real Prisma `enum` blocks guarded behind the Postgres provider for prod. Recommended: keep one Zod enum per list and infer TS types from it; store as String in the DB.",
          "SQLite constraint - NO native JSON type: fields holding JSON (Asset.attributes, AssetType.attributeSchema, SyncSource.config, SyncRun.log, ApiToken.scopes, AuditLog.changes, Notification none) are declared as `String` (TEXT) and (de)serialized in the app. On Postgres these can be switched to `Json`.",
          "SQLite constraint - autoincrement: Ticket.number/Problem.number/Change.number use Int @default(autoincrement()) for human-friendly sequential IDs; primary keys remain cuid() Strings. On SQLite autoincrement requires the column to be the sole Int and is fine as a @unique non-PK. Compose display refs like INC-<number>/PRB-<number>/CHG-<number> in the app.",
          "SQLite constraint - no partial/filtered indexes and limited ALTER: keep indexes simple (@@index / @@unique as shown). Prisma migrate recreates tables for many schema changes on SQLite, so plan destructive-ish dev migrations; prod is Postgres.",
          "Provider switch dev->prod: use a single schema with `provider = env(\"DATABASE_PROVIDER\")`-style setup is NOT supported by Prisma (provider must be static). Practical approach: keep String-based enums/JSON so the SAME schema runs on both SQLite and Postgres unchanged; only the datasource url/provider differs per environment. This keeps dev (SQLite) and prod (Postgres) on one schema.",
          "Auth.js v5: User/Account/Session/VerificationToken follow the official @auth/prisma-adapter shape. OIDC/SSO providers populate Account rows. Keep `type` on Account as String (adapter expects it). Sessions optional if using JWT strategy, but included for flexibility.",
          "RBAC design: Role<->Permission and User<->Role use explicit join tables (RolePermission, UserRole) rather than implicit m-n, so we can add metadata (assignedBy, scoping) and get predictable table names. Permissions are string-keyed (resource.action) and seeded; the app checks effective permissions = union across a user's roles.",
          "Impact + Urgency drive Priority: model stores all three independently (impact, urgency, priority) so the app can auto-derive priority from an impact/urgency matrix (classic ITIL) while still allowing manual override. Priority is persisted for indexing/filtering.",
          "SLA computation: Sla holds targets in minutes; Ticket persists responseDueAt/dueAt/firstResponseAt/resolvedAt/slaBreached so breach state is queryable without recomputation. businessHoursOnly is a flag; actual business-hours calendar can be a later model if needed.",
          "Polymorphic attachments & audit/notifications: SQLite/Prisma have no polymorphic relations, so Attachment uses multiple nullable FKs (ticket/comment/problem/change/asset), while AuditLog and Notification use entityType+entityId string pairs (no FK, indexed) for open-ended targeting.",
          "CMDB graph: Asset relationships are a directed graph via AssetRelation (source/target/type) with a unique constraint on (source,target,type) to prevent duplicate edges; enables impact analysis (which services/CIs are affected by an asset). AssetType is normalized (not an enum) so admins can add CI classes at runtime with custom attribute schemas.",
          "Change approval workflow: ChangeStatus enumerates the full lifecycle including EMERGENCY fast-path; ChangeApproval rows (per approver, with stage) implement multi-stage CAB voting. App logic transitions Change.status to APPROVED only when required approvals at all stages are satisfied, REJECTED on any rejection per policy.",
          "Sync module ties together: SyncSource (config + schedule) -> SyncRun (execution history). Synced entities (User/Group/Asset) carry externalId + syncSourceId so re-runs can upsert by (syncSourceId, externalId). Encrypt secrets inside SyncSource.config at the application layer; do not rely on DB-level encryption in SQLite.",
          "Public REST API auth: ApiToken stores only tokenHash (never the raw secret) plus a short prefix for identification; scopes reuse Permission keys so API access shares the RBAC vocabulary. Support both user-bound and service (userId null) tokens.",
          "Suggested next step: place schema at E:/DEV/servio/prisma/schema.prisma with generator client + datasource sqlite (url env DATABASE_URL), then a seed script for system Roles (Admin/Agent/Manager/Requester), Permission catalog, a default Queue, and base AssetTypes. Mirror every enum list as a Zod enum in a shared /lib/enums.ts consumed by both forms and API validation."
        ]
      },
      "architecture": {
        "routeTree": [
          "app/layout.tsx — root layout: html/body, Tailwind globals, ThemeProvider (dark/light), Toaster, font setup",
          "app/page.tsx — public marketing/landing entry; redirects authed users to /dashboard",
          "app/globals.css — Tailwind v4 layer imports + design tokens (CSS vars for shadcn theme)",
          "app/(auth)/layout.tsx — centered auth shell (logo, card), no app chrome",
          "app/(auth)/login/page.tsx — login screen: OIDC/SSO buttons + Credentials form (Auth.js signIn)",
          "app/(auth)/login/sso/[provider]/route.ts — kickoff handler to initiate a specific OIDC provider flow",
          "app/(auth)/error/page.tsx — Auth.js error surface (AccessDenied, Configuration, etc.)",
          "app/(app)/layout.tsx — authed dashboard shell: sidebar nav, topbar, requires session (redirect to /login if none)",
          "app/(app)/dashboard/page.tsx — agent overview: KPIs, open tickets by queue, SLA breaches, recent activity",
          "app/(app)/tickets/page.tsx — TanStack Table list of tickets with server-driven filtering/pagination",
          "app/(app)/tickets/new/page.tsx — create ticket form (incident/request) server action",
          "app/(app)/tickets/[id]/page.tsx — ticket detail: timeline, comments, worklog, assignment, status transitions",
          "app/(app)/tickets/[id]/edit/page.tsx — structured edit form for ticket fields",
          "app/(app)/problems/page.tsx — problem records list",
          "app/(app)/problems/[id]/page.tsx — problem detail with linked incidents + known-error/workaround",
          "app/(app)/changes/page.tsx — change requests list (with change calendar link)",
          "app/(app)/changes/[id]/page.tsx — change detail: risk, approvals, CAB, implementation plan",
          "app/(app)/queues/page.tsx — queue management + per-queue routing rules",
          "app/(app)/queues/[id]/page.tsx — queue detail: members, assignment policy, tickets",
          "app/(app)/groups/page.tsx — technician/user groups CRUD",
          "app/(app)/groups/[id]/page.tsx — group detail: members, roles, mapped queues",
          "app/(app)/services/page.tsx — service catalog (business/technical services) list",
          "app/(app)/services/[id]/page.tsx — service detail: SLAs, owner, linked CIs and request offerings",
          "app/(app)/categories/page.tsx — category tree management (ticket/asset taxonomy)",
          "app/(app)/assets/page.tsx — CMDB asset list (TanStack Table, faceted filters by type/status)",
          "app/(app)/assets/[id]/page.tsx — asset/CI detail: attributes, relationships graph, linked tickets, discovery source",
          "app/(app)/assets/new/page.tsx — manual asset creation form",
          "app/(app)/syncs/page.tsx — SyncSource list with connector type, schedule, last run status",
          "app/(app)/syncs/new/page.tsx — create SyncSource: pick connector, config form (Zod-validated)",
          "app/(app)/syncs/[id]/page.tsx — SyncSource detail: config, run history (SyncRun), manual Run Now action",
          "app/(app)/syncs/[id]/runs/[runId]/page.tsx — SyncRun log/detail: created/updated/errors per record",
          "app/(app)/admin/layout.tsx — admin-only gate (RBAC: role=ADMIN) around settings",
          "app/(app)/admin/users/page.tsx — user administration, role assignment",
          "app/(app)/admin/roles/page.tsx — role/permission matrix",
          "app/(app)/admin/sso/page.tsx — OIDC provider configuration (issuer, clientId, secret, claim mapping)",
          "app/(app)/admin/api-keys/page.tsx — issue/revoke API tokens for /api/v1, scope selection",
          "app/(app)/admin/sla/page.tsx — SLA policy editor",
          "app/(portal)/layout.tsx — self-service shell: simplified nav, requester identity, no agent tools",
          "app/(portal)/portal/page.tsx — portal home: search, popular services, my open tickets",
          "app/(portal)/portal/catalog/page.tsx — browsable service catalog for end users",
          "app/(portal)/portal/catalog/[serviceId]/page.tsx — request offering form for a service (Zod-driven fields)",
          "app/(portal)/portal/tickets/page.tsx — requester's own tickets list",
          "app/(portal)/portal/tickets/[id]/page.tsx — requester ticket view: status, replies, add comment",
          "app/(portal)/portal/tickets/new/page.tsx — free-form incident submission",
          "app/(portal)/portal/knowledge/page.tsx — knowledge base / FAQ browse+search",
          "app/api/auth/[...nextauth]/route.ts — Auth.js v5 GET/POST handlers (OIDC callbacks, session, signout)",
          "app/api/v1/route.ts — API root: version info + HATEOAS-ish endpoint index",
          "app/api/v1/tickets/route.ts — GET list (pagination/filter), POST create (token-authed)",
          "app/api/v1/tickets/[id]/route.ts — GET/PATCH/DELETE single ticket",
          "app/api/v1/tickets/[id]/comments/route.ts — GET/POST ticket comments",
          "app/api/v1/assets/route.ts — GET list (filter by type/status/owner), POST create",
          "app/api/v1/assets/[id]/route.ts — GET/PATCH/DELETE single asset (CI)",
          "app/api/v1/problems/route.ts — GET/POST problems",
          "app/api/v1/changes/route.ts — GET/POST changes",
          "app/api/v1/services/route.ts — GET service catalog (public-ish, scoped)",
          "app/api/v1/syncs/[id]/trigger/route.ts — POST to trigger a SyncRun via API token",
          "app/api/v1/openapi.json/route.ts — served OpenAPI 3.1 spec generated from Zod schemas",
          "app/api/webhooks/[source]/route.ts — inbound webhook receiver for external ITSM/asset-discovery push syncs",
          "app/api/cron/sync/route.ts — scheduled sync dispatcher hit by external cron/Vercel Cron, guarded by CRON_SECRET"
        ],
        "authStrategy": [
          "Auth.js v5 (NextAuth) configured in root auth.ts exporting { handlers, auth, signIn, signOut }; split config into auth.config.ts (edge-safe: providers list + callbacks, no Prisma) and auth.ts (adds PrismaAdapter) so middleware can import the edge-safe half.",
          "Session strategy: JWT (strategy: 'jwt') — required because middleware runs on the Edge and cannot open Prisma/DB connections; DB sessions would block edge RBAC. User id, role, and groupIds are baked into the token in the jwt callback and surfaced via the session callback.",
          "Providers: (1) OIDC/SSO as the primary path — a generic OpenID Connect provider driven by env (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET) supporting Entra ID/Keycloak/Okta/Google; profile() maps OIDC claims to Servio user + auto-provisions via adapter (JIT provisioning) with default role REQUESTER. (2) Credentials provider for local/dev and break-glass admin, verifying argon2/bcrypt hash from Prisma User.passwordHash.",
          "PrismaAdapter (@auth/prisma-adapter) persists User/Account/Session/VerificationToken; JWT sessions still use adapter for account linking + JIT user creation. OIDC group/role claim (e.g. groups or roles claim) mapped to Servio Role in signIn callback.",
          "RBAC roles: REQUESTER (portal only), TECHNICIAN (agent app, assigned queues), MANAGER (approvals, reporting), ADMIN (full config). Role stored on User, embedded in JWT; permission checks via a central lib/rbac.ts can(role, action, resource) helper used in server actions, route handlers, and page-level guards.",
          "middleware.ts (root) uses auth.config's edge-safe auth() as a wrapper: unauthenticated -> redirect to /(auth)/login for (app) and (portal); enforce coarse RBAC by path — /(app)/admin/* requires ADMIN, /(app)/* requires TECHNICIAN+, /(portal)/* requires any authed user. matcher excludes /api/auth, static assets, and /api/v1 (which uses its own token auth, not cookies).",
          "Public REST API (/api/v1) auth is separate from the browser session: Bearer token (ApiKey model, hashed at rest, prefix-indexed) validated in lib/api-auth.ts, NOT the Auth.js cookie/JWT. Scopes on the key gate read/write per resource.",
          "Server-side session access via the exported auth() (React cache) in Server Components, server actions, and route handlers; client components get session via a thin SessionProvider only where interactivity needs it."
        ],
        "syncEngine": [
          "Domain models (Prisma): SyncSource { id, name, connectorType (enum LDAP_AD|CSV_IMPORT|ASSET_DISCOVERY|EXTERNAL_ITSM), config Json (Zod-validated per connector), schedule (cron string, nullable=manual), enabled, lastRunAt, lastStatus } and SyncRun { id, sourceId, trigger (MANUAL|SCHEDULED|WEBHOOK), status (PENDING|RUNNING|SUCCESS|PARTIAL|FAILED), startedAt, finishedAt, stats Json {created,updated,skipped,failed}, log Json[] } — full audit trail of every execution.",
          "Pluggable connector contract in lib/sync/connector.ts: interface SyncConnector<TConfig> { type; configSchema: ZodSchema<TConfig>; testConnection(cfg): Promise<Result>; run(ctx: SyncRunContext, cfg): AsyncIterable<SyncRecord> | Promise<SyncSummary> }. SyncRunContext exposes prisma, logger (appends to SyncRun.log), and an upsert helper for idempotent writes keyed by externalId.",
          "Connector registry lib/sync/registry.ts maps connectorType -> connector instance; adding a connector = drop a file in lib/sync/connectors/ and register it. Ships with: ldap-ad.ts (LDAP bind + paged search, maps directory entries to User/Group; uses ldapts), csv-import.ts (streamed CSV -> Asset/User via column mapping in config), asset-discovery.ts (ingests agent/scanner payloads e.g. network scan JSON -> CMDB CIs with relationships), external-itsm.ts (pulls tickets/CIs from another ITSM REST API, bi-directional mapping).",
          "Execution orchestrator lib/sync/engine.ts runSync(sourceId, trigger): creates a SyncRun (RUNNING), resolves connector from registry, validates config with connector.configSchema, streams records, upserts idempotently by (sourceId, externalId), accumulates stats, marks SUCCESS/PARTIAL/FAILED, updates SyncSource.lastRunAt/lastStatus. Wrapped so partial failures record per-record errors without aborting the whole run.",
          "Trigger paths: (1) Manual — server action triggerSyncRun in app/(app)/syncs/[id]/page.tsx, or POST /api/v1/syncs/[id]/trigger for API. (2) Scheduled — external scheduler (Vercel Cron / OS cron / container sidecar) hits GET /api/cron/sync?secret=CRON_SECRET, which loads enabled sources whose cron is due (evaluated with a cron-parser) and dispatches runSync for each. (3) Webhook — POST /api/webhooks/[source] for push-style external ITSM/discovery, verified by per-source secret, enqueues a WEBHOOK-triggered run.",
          "Long-running runs: engine is written to be queue-agnostic. Dev/self-host runs inline within the request (fine for small dirs/CSVs); production offloads to a background worker (BullMQ/Redis or a standalone Node worker process) via lib/sync/queue.ts so serverless timeouts don't truncate large LDAP/discovery syncs. runSync is the single entrypoint both call.",
          "Field mapping + reconciliation: each SyncSource.config includes a mapping object (source field -> Servio field) validated by the connector's Zod schema; engine records provenance (source discovery) on synced Assets/Users so manually-edited records can be protected from being overwritten (config flag preserveManualEdits)."
        ],
        "apiDesign": [
          "Versioned under /api/v1/* (route handlers, Node runtime for Prisma). Version is in the path so /api/v2 can coexist; a served OpenAPI 3.1 spec at /api/v1/openapi.json is generated from the same Zod schemas used for validation (single source of truth).",
          "Auth: Authorization: Bearer <token>. Tokens are ApiKey rows created in /admin/api-keys, stored hashed (SHA-256) with an indexed short prefix for lookup, carrying scopes (e.g. tickets:read, tickets:write, assets:read, assets:write, sync:trigger) and optional expiry. lib/api-auth.ts resolves the key, checks scope, and injects an acting principal; no cookies/CSRF involved.",
          "Standard envelope: list responses return { data: T[], pagination: { page, pageSize, total, totalPages, hasNext }, links: { self, next, prev } }; single-resource responses return the object directly; errors return { error: { code, message, details? } } with proper HTTP status (400 validation, 401 no/invalid token, 403 scope, 404, 409 conflict, 422 Zod, 429 rate limit).",
          "Pagination: cursor-friendly offset model via ?page= & ?pageSize= (default 25, max 100). Also supports ?cursor= for stable keyset pagination on large asset lists (ordered by id). All list endpoints paginate by default — never unbounded.",
          "Filtering + sorting: query params map to a whitelisted Prisma where via lib/api/query.ts — e.g. GET /api/v1/tickets?status=OPEN,IN_PROGRESS&priority=HIGH&queueId=...&assigneeId=...&createdAfter=...&q=free-text&sort=-createdAt. Operators via bracket syntax (?createdAt[gte]=...). Each resource declares an allow-list of filterable/sortable fields to prevent injection and expensive scans.",
          "Key ticket endpoints: GET/POST /api/v1/tickets, GET/PATCH/DELETE /api/v1/tickets/{id}, GET/POST /api/v1/tickets/{id}/comments, POST /api/v1/tickets/{id}/transition (status workflow), POST /api/v1/tickets/{id}/assign. Create/patch bodies validated by shared Zod schemas in lib/schemas/ticket.ts (reused by server actions and the API).",
          "Key asset/CMDB endpoints: GET/POST /api/v1/assets, GET/PATCH/DELETE /api/v1/assets/{id}, GET /api/v1/assets/{id}/relationships (CI relationship graph), plus /api/v1/problems, /api/v1/changes, /api/v1/services following the same conventions. POST /api/v1/syncs/{id}/trigger fires a SyncRun (scope sync:trigger).",
          "Cross-cutting: rate limiting per API key (token-bucket in lib/api/rate-limit.ts, Redis-backed in prod / in-memory in dev) surfacing X-RateLimit-* headers; every request logged to an AuditLog with the acting key. Consistent camelCase JSON, ISO-8601 timestamps, all IDs are cuid/uuid strings."
        ],
        "decisions": [
          "Server Actions vs Route Handlers split: mutations driven from Servio's own UI (create/update ticket, assign, trigger sync, admin config) use Server Actions in app/**/actions.ts co-located per feature — validated with the SAME Zod schemas the API uses. Route Handlers are reserved for (a) the public REST API /api/v1, (b) Auth.js callbacks, (c) webhooks, (d) cron. Data fetching for pages is done directly in Server Components via a lib/data/ query layer (no internal fetch to own API).",
          "Three route groups keep concerns clean: (auth) = unauthenticated shells, (app) = agent/admin console gated to TECHNICIAN+, (portal) = end-user self-service gated to any authed user. Each group has its own layout + RBAC gate so the portal can never render agent tooling even if a URL is guessed.",
          "JWT session strategy (not database sessions) is a deliberate tradeoff to enable Edge middleware RBAC without DB access; Auth.js is split into edge-safe auth.config.ts and Node auth.ts (with PrismaAdapter) per the v5 recommended pattern.",
          "Single source of truth for validation: Zod schemas in lib/schemas/ are shared by Server Actions, REST API handlers, and OpenAPI generation — the same shape validates a portal form submit and an /api/v1 POST, eliminating drift.",
          "Sync engine is connector-pluggable via a registry + Zod-typed config so LDAP/AD, CSV, asset-discovery, and external-ITSM are peers; runSync(sourceId, trigger) is the one entrypoint for manual/scheduled/webhook so behavior is identical regardless of how it's kicked off. Engine is queue-agnostic to run inline in dev and on a worker in prod.",
          "REST API auth is intentionally decoupled from browser auth (Bearer ApiKey vs Auth.js cookie/JWT) so third-party integrations never depend on session cookies and get proper scoping/rate-limiting; API is versioned in-path with a generated OpenAPI spec.",
          "Prisma is the DB boundary: SQLite dev / Postgres prod driven purely by DATABASE_URL + provider in schema.prisma; models use string cuid IDs, soft-delete + AuditLog for compliance, and synced records carry provenance so manual edits aren't clobbered by the next sync.",
          "shadcn/ui + Tailwind v4 with CSS-variable theme tokens in globals.css enables a genuinely modern look (dark/light, dense TanStack Table views for agents, spacious cards for the portal) without a component-library lock-in — components are copied into components/ui and composed in components/ per feature."
        ]
      },
      "design": {
        "brand": [
          "NAME & CONCEPT — 'Servio' (from Latin 'servire', to serve). Positioning: the calm, fast, open ITSM system. Anti-thesis of GLPI's dense grey enterprise look. Design north star: 'operational clarity' — a control room that feels quiet, precise, and trustworthy. Think Linear's density + Vercel's restraint + a warmer, more human accent than pure blue SaaS.",
          "LOGOTYPE — Wordmark 'Servio' set in the display font (Bricolage Grotesque) at 600 weight, -0.02em tracking, all lowercase for approachability OR sentence-case for enterprise contexts (ship both). The 'o' terminal doubles as the mark.",
          "MARK (glyphmark) — A rounded-square 'ticket/node' glyph: a squircle (rounded rect, ~28% corner radius) containing a single upward diagonal 'flow' stroke, evoking both a service ticket stub and a resolution/uptime line. Renders at 16/20/24/32px in the sidebar collapsed state and favicon. Single-color, uses --primary; on dark it inverts to --primary-foreground on a --primary chip.",
          "LOGO LOCKUP — mark + wordmark with 0.5em gap. Minimum clear space = height of the mark on all sides. Collapsed sidebar shows mark only; expanded shows full lockup. Never stretch, never add gradients to the mark itself.",
          "BRAND VOICE IN UI — Short, imperative, human microcopy ('Assign to me', 'Resolve', 'Nothing needs you right now'). Empty states are encouraging, never cute-overload. Numbers and statuses are the hero, chrome recedes.",
          "ACCENT PHILOSOPHY — One confident brand hue (Servio Indigo/Violet ~264-266°) used sparingly for primary actions, active nav, and focus rings. Everything else is a near-neutral slate scale so data and status colors pop. This restraint is what separates it from the rainbow 'generic AI dashboard'.",
          "ICONOGRAPHY — lucide-react throughout (ships with shadcn), 1.5px stroke, 18px default in nav/buttons, 16px inline. Never mix icon libraries. Module icons: Tickets=Ticket, Problems=CircleAlert, Changes=GitPullRequestArrow, Services=LayoutGrid, Assets/CMDB=Server, Queues=Inbox, Groups=Users, Categories=Tags, Syncs=RefreshCw, Portal=LifeBuoy, Settings=Settings2.",
          "MOTION — Purposeful and fast. Durations 120-180ms, ease-out for enter, ease-in for exit. Use Tailwind data-state transitions (Radix). tailwindcss-animate for accordion/collapsible. Respect prefers-reduced-motion. No decorative parallax; the only 'delight' is snappy optimistic UI on assign/status changes."
        ],
        "palette": [
          "APPROACH — Ship as shadcn CSS variables in OKLCH (Tailwind v4 native, wider gamut, perceptually uniform). Define in app/globals.css under @layer base :root (light) and .dark. Register with @theme inline so utilities like bg-background, text-primary work. Provide hex fallbacks in comments for legacy tooling.",
          "BRAND HUE — Servio Indigo. --primary light: oklch(0.55 0.20 264) ≈ #5B54E6. --primary dark: oklch(0.68 0.17 264) ≈ #8B84F5 (lifted for contrast on dark). --primary-foreground: oklch(0.985 0 0) ≈ #FAFAFA both modes.",
          "LIGHT — --background: oklch(0.995 0.002 264) ≈ #FCFCFD (barely-warm white, not pure #fff to reduce glare); --foreground: oklch(0.22 0.02 264) ≈ #2B2B33; --card: oklch(1 0 0) #FFFFFF; --card-foreground: same as foreground; --popover/-foreground same as card; --muted: oklch(0.968 0.004 264) ≈ #F3F3F6; --muted-foreground: oklch(0.52 0.02 264) ≈ #71717F; --border: oklch(0.922 0.004 264) ≈ #E6E6EC; --input: same as border; --ring: --primary at 60% -> oklch(0.55 0.20 264).",
          "DARK — true 'control room' near-black, not blue-black soup. --background: oklch(0.17 0.01 264) ≈ #17171C; --foreground: oklch(0.96 0.005 264) ≈ #F2F2F5; --card: oklch(0.205 0.012 264) ≈ #1E1E25 (elevated surface, one step lighter than bg for depth); --popover: oklch(0.23 0.014 264) ≈ #24242C; --muted: oklch(0.26 0.012 264) ≈ #2A2A32; --muted-foreground: oklch(0.68 0.015 264) ≈ #A0A0AE; --border: oklch(0.28 0.012 264 / 0.8) ≈ rgba(#33333D); --input: oklch(0.30 0.012 264); --ring: --primary dark.",
          "SECONDARY / ACCENT (subtle) — --secondary light: oklch(0.965 0.004 264) #F1F1F5, --secondary-foreground: foreground; dark --secondary: oklch(0.27 0.012 264). --accent (hover surface) light: oklch(0.955 0.006 264) #EDEDF2, dark: oklch(0.28 0.014 264). These drive nav-hover and ghost-button hover.",
          "SEMANTIC STATUS SCALE (its own tokens, NOT reusing chart colors) — Open/New: slate/neutral → --status-open: oklch(0.62 0.02 264). In-Progress/Active: amber → --status-progress: oklch(0.72 0.16 75) ≈ #E8A020. Pending/On-Hold: violet-grey → --status-pending: oklch(0.60 0.10 300). Resolved/Done: green → --status-resolved: oklch(0.68 0.16 155) ≈ #2FB77E. Closed: muted-foreground. Each ships a *-subtle bg variant at ~0.15 chroma-matched for badge backgrounds (light) / low-opacity (dark).",
          "PRIORITY SCALE — Low: oklch(0.62 0.02 264) neutral; Medium: oklch(0.70 0.14 230) blue; High: oklch(0.70 0.17 55) orange; Critical/Urgent: --destructive oklch(0.58 0.22 25) ≈ #E0503F. Priority is shown as a small filled dot + label so it reads without relying on color alone (accessibility).",
          "--destructive light: oklch(0.58 0.22 25) #DC4C3E, dark: oklch(0.68 0.19 25); --destructive-foreground: oklch(0.985 0 0). Used for delete + Critical only — never for 'error state everywhere'.",
          "CHART TOKENS (dashboards) — --chart-1: --primary indigo; --chart-2: oklch(0.68 0.16 155) green; --chart-3: oklch(0.72 0.16 75) amber; --chart-4: oklch(0.65 0.19 330) magenta; --chart-5: oklch(0.70 0.13 210) cyan. Keep sidebar tokens too: --sidebar, --sidebar-foreground, --sidebar-accent, --sidebar-border, --sidebar-primary per shadcn sidebar spec.",
          "RADIUS & ELEVATION — --radius: 0.625rem (10px) base; cards 0.75rem, buttons/inputs 0.5rem, badges full/0.375rem. Shadows are soft and low: shadow-xs on cards (light only), rely on --border + --card contrast in dark instead of heavy shadows. Popovers/command palette get shadow-lg + border. Never neon glows.",
          "ACCESSIBILITY — All text/status combos target WCAG AA (4.5:1 body, 3:1 large/UI). Because status colors are lifted in dark mode and always paired with an icon/dot + text label, color is never the sole signal. Focus ring: 2px --ring with 2px offset via focus-visible:ring-[3px] ring-ring/50 (shadcn v4 pattern)."
        ],
        "typography": [
          "FONT STACK — Three Google fonts loaded via next/font/google with CSS variables, subset latin, display:swap. Body/UI: Inter (variable). Display/headings & wordmark: Bricolage Grotesque (variable) — gives Servio character without being trendy-illegible. Mono (IDs, code, API keys, timestamps): JetBrains Mono or Geist Mono.",
          "NEXT/FONT SETUP — import { Inter, Bricolage_Grotesque } from 'next/font/google'; const inter = Inter({ subsets:['latin'], variable:'--font-sans', display:'swap' }); const display = Bricolage_Grotesque({ subsets:['latin'], variable:'--font-display', display:'swap' }); apply `${inter.variable} ${display.variable}` on <html>. JetBrains_Mono -> --font-mono.",
          "TAILWIND v4 WIRING — in @theme inline: --font-sans: var(--font-sans), ui-sans-serif, system-ui...; --font-display: var(--font-display), var(--font-sans); --font-mono: var(--font-mono), ui-monospace. Then use font-sans (default on body), font-display on H1/H2 and .brand-wordmark, font-mono on tabular numbers/IDs.",
          "TYPE SCALE (tight, dashboard-appropriate) — Display/H1 page title: text-2xl/28px font-display 600 tracking-[-0.02em]. H2 section: text-lg 600. H3 card title: text-sm 600 (dashboards favor small confident labels). Body: text-sm (14px) — this is the workhorse size for tables/forms. Secondary/meta: text-xs text-muted-foreground. Micro/labels: text-[11px] uppercase tracking-wide font-medium text-muted-foreground for column-group and stat-card eyebrows.",
          "NUMERICS — Enable tabular figures on all metric/table numbers: font-variant-numeric: tabular-nums (tailwind: tabular-nums utility) so stat cards and table columns align. IDs like ticket #INC-10432 use font-mono text-xs in a --muted chip.",
          "LINE-HEIGHT & MEASURE — UI text leading-tight to leading-snug; long-form (ticket descriptions, KB articles in portal) leading-relaxed with max-w-[68ch] (prose). Use @tailwindcss/typography 'prose prose-sm dark:prose-invert' for rendered markdown in ticket comments and KB.",
          "WEIGHTS — Only 400/500/600 in the UI (Inter). 700 reserved for portal marketing/hero moments. Avoid 300 (too thin on dark). Display font used at 500-600 only."
        ],
        "appShell": [
          "LAYOUT PRIMITIVE — Build on shadcn 'sidebar' block: <SidebarProvider><AppSidebar/><SidebarInset>{topbar + breadcrumbs + page}</SidebarInset></SidebarProvider>. Sidebar variant='inset' with collapsible='icon' so it collapses to a 3.5rem icon rail (mark-only) and expands to ~16rem. State persisted in a cookie (shadcn default) so it survives reload. Ctrl/Cmd+B toggles.",
          "SIDEBAR STRUCTURE — Top: brand lockup (mark + 'Servio' wordmark, collapses to mark). A prominent 'New' split-button (New Ticket / Change / Asset). Then grouped SidebarGroups with SidebarGroupLabel eyebrows: (1) WORKSPACE — Dashboard, My Work/Assigned, Queues. (2) SERVICE DESK — Tickets, Problems, Changes, Services (catalog). (3) CMDB — Assets, Categories. (4) DIRECTORY — Groups, Users. (5) SYSTEM — Syncs/Integrations, API, Settings. Each item = icon + label + optional count badge (open ticket count) right-aligned. Active item: bg-sidebar-accent, text-foreground, 2px --primary left indicator bar.",
          "SIDEBAR FOOTER — SidebarMenu with org switcher (if multi-tenant) at top-collapsed, and user menu (avatar, name, role) at bottom with dropdown: profile, theme toggle (light/dark/system), sign out. Uses Auth.js session.",
          "TOP BAR (in SidebarInset header) — h-14, sticky, border-b, bg-background/80 backdrop-blur. Left: SidebarTrigger (collapse) + breadcrumbs. Center/right: global search button that opens the Command Palette (⌘K) — styled as a muted input-like button 'Search or jump to…  ⌘K' (not a real input, to keep focus behavior clean). Right cluster: create-button, notifications bell (with unread dot), theme toggle, avatar. On mobile the sidebar becomes a Sheet.",
          "COMMAND PALETTE (⌘K / Ctrl+K) — shadcn <CommandDialog>. Groups: Quick actions (New ticket, New change…), Navigation (jump to any module), Recent (last viewed tickets/assets), Search results (tickets by #id/title, assets, users) fetched debounced from the REST API. Each result shows an icon, primary label, and a muted secondary (status/assignee). This is the power-user backbone and a key 'modern' differentiator vs GLPI.",
          "BREADCRUMBS — shadcn Breadcrumb under/inline with topbar: Module › Sub › Entity (e.g. Tickets › Incidents › INC-10432). Last crumb is the entity title, non-link, truncates. On detail pages the breadcrumb + a compact status/priority badge row sits above the entity header.",
          "PAGE CONTAINER — content max-w-screen-2xl mx-auto px-4 lg:px-6 py-4 lg:py-6, with a consistent PageHeader component (title font-display, description text-muted-foreground, right-aligned primary action + secondary/overflow menu). List pages get a sticky filter toolbar directly under the header.",
          "DENSITY & SPACING — 4px base grid; default gap-4 between cards, gap-2 inside toolbars. Comfortable-but-dense: table rows h-11, buttons default h-9 (sm h-8). Provide a density toggle later, but MVP ships 'comfortable'.",
          "THEME TOGGLE — next-themes (attribute='class', defaultTheme='system', disableTransitionOnChange to avoid flash). Dropdown with Light/Dark/System. Ensure no FOUC via suppressHydrationWarning on <html> and the standard inline script pattern."
        ],
        "components": [
          "DATA TABLE (core pattern) — TanStack Table v8 rendered through shadcn <Table>. Sticky header, zebra-free (rely on hover:bg-muted/50 + row border), selectable rows (checkbox col), pinned first (id) + last (actions) columns. Column visibility menu, sortable headers (chevron on hover/active), server-side pagination + sort + filter. Toolbar above table: left = faceted filters (status, priority, queue, assignee) as shadcn <Popover> multi-select chips + a text search input; right = column toggle + view/export. Active filters render as removable chips. Empty state = centered icon + 'No tickets match these filters' + Clear filters. Loading = skeleton rows (h-11) not spinners.",
          "STATUS & PRIORITY BADGES — <Badge> variants driven by status/priority tokens. Status badge = subtle filled: bg *-subtle, text status color, rounded-md, text-xs font-medium, optional leading 6px dot. Priority = tiny filled dot + label (dot color from priority scale) so it reads in dense tables; Critical also gets a faint destructive ring. SLA badge variant: countdown 'Due in 2h' turns amber then destructive as it breaches, with a subtle pulse only when breached.",
          "STAT CARDS (dashboard KPIs) — <Card> grid (grid-cols-2 lg:grid-cols-4 gap-4). Each: eyebrow label (text-[11px] uppercase muted), big number (text-2xl font-display tabular-nums), delta chip (▲ 12% vs last week in green/red), and a tiny sparkline (Recharts area, single --chart color, no axes). Cards are flat with border + shadow-xs (light) / border only (dark). Clickable → filtered list.",
          "ENTITY DETAIL (ticket/problem/change/asset) — Two-column layout on lg: main column (60-65%) = header (id chip mono + title editable-inline + status/priority badges + SLA), tabbed body (Overview | Activity | Related | Attachments) using shadcn Tabs; right rail (35%) = a <Card> of properties (assignee w/ avatar, queue, requester, category, service, created/updated relative time via 'x ago', linked assets/CIs). Sticky right rail on scroll. Primary actions (Assign to me, Change status, Resolve) as a button cluster in the header; overflow in a DropdownMenu.",
          "ACTIVITY TIMELINE — Vertical timeline in the Activity tab: left rail with connector line + node dot per event (colored by event type: comment=primary, status-change=status color, assignment=neutral, SLA=amber). Each entry: avatar, actor name, action verb, relative timestamp (title=absolute), and body (comment markdown via prose, or a compact diff pill 'Status: Open → In Progress'). Comment composer pinned at bottom with @mention, attachment, and an internal-note toggle (internal notes get a subtly tinted --muted background + 'Internal' badge, hidden from portal).",
          "KANBAN QUEUE BOARD — Columns = statuses (or custom workflow states). Uses @dnd-kit for drag-and-drop (accessible, keyboard-movable) — NOT a heavy board lib. Each column: header with state name + count + subtle color underline (status token), scrollable card stack. Ticket card: id chip, title (2-line clamp), footer row = priority dot, assignee avatar, SLA badge, comment/attachment counts. Dragging shows a ghost + drop indicator; drop optimistically PATCHes status via API with toast undo. Board is a view toggle (List / Board) on Queues + Tickets.",
          "FORMS — react-hook-form + zod (zodResolver), shadcn <Form> primitives. Field = <FormLabel>, control, <FormDescription>, <FormMessage> (destructive). Grouped in <Card> sections with section headers. Submit buttons show loading spinner + disabled. Selects use <Combobox>/searchable Select for assignee/requester/category/service pickers. Inline validation on blur, summary on submit.",
          "BADGES/CHIPS/AVATARS system — Reusable <StatusBadge status>, <PriorityIndicator priority>, <SlaBadge dueAt>, <UserChip user> (avatar + name, avatar-only in dense contexts), <RelativeTime date>. Avatars: shadcn <Avatar> with color-hashed fallback initials (deterministic from user id) so the directory feels alive without uploaded photos.",
          "TOASTS & FEEDBACK — sonner for toasts (assign, resolve, sync started) with action buttons (Undo/View). Confirmations for destructive actions via <AlertDialog>. Long ops (Sync run) show inline progress + a Syncs run-history table. Optimistic UI everywhere it's safe, reconciled from API.",
          "SYNCS / INTEGRATIONS UI — Card grid of connectors (LDAP/AD, Asset Discovery, External ITSM) each with logo tile, status pill (Connected/Error/Never run), last-run relative time, and a run/config button. Detail = config form + a run-history data table + field-mapping UI. Errors surface as destructive alert with the failing record count and a 'view log' drawer.",
          "EMPTY / SKELETON / ERROR STATES — First-class: every list/detail has a designed empty state (lucide icon in a muted circle, one-line heading, subtext, primary CTA), skeletons matching final layout (no layout shift), and an error boundary card ('Something went wrong — Retry'). These states are what make an MVP feel finished."
        ],
        "portal": [
          "POSITIONING — The Self-Service Portal is a distinct, lighter, more spacious 'front door' for end-users (employees), visually calmer and warmer than the agent app — no dense sidebar, more whitespace, larger type. Same tokens, different composition. Route group e.g. app/(portal) with its own layout; agent app under app/(app).",
          "PORTAL SHELL — Slim top bar (centered Servio brand, right: my requests + avatar), then a HERO band: bg gradient using --primary at low chroma → background, a large greeting ('Hi Jonas, how can we help?') in font-display, and a prominent global search input (large, rounded-xl, shadow) that searches the KB + service catalog. No left nav; navigation is card-driven.",
          "REQUEST ENTRYPOINTS — Below hero: a grid of large Service Catalog category cards (icon tile in --primary-subtle, title, short desc, request count) → drilling into services → a guided request form (dynamic fields from the service definition, zod-validated). Prominent secondary CTA 'Report an issue' (incident) vs 'Request something' (request) split at the top to route intent.",
          "KNOWLEDGE BASE — Search-first KB: results and category browse; article page uses prose prose-lg max-w-[68ch], with 'Was this helpful?' feedback and a 'Still need help? Open a ticket' fallback that prefills context. KB surfaces in portal search and inside the agent app.",
          "MY REQUESTS — A clean, friendly list (not the agent data-table) of the user's tickets: status pill, title, last-update relative time, unread reply dot. Detail = a simplified conversation view (their messages + agent replies; internal notes hidden), status stepper (Submitted → In Progress → Resolved) as a horizontal progress indicator, reopen/close + satisfaction rating (thumbs / CSAT) on resolve.",
          "TONE & COMPONENTS — Reuse StatusBadge/RelativeTime but with friendlier labels ('Being worked on' vs 'In Progress'). Larger touch targets (buttons h-11), generous card padding (p-6), rounded-2xl on hero/catalog cards. Illustration-light: use lucide icons in tinted circles rather than stock illustrations to stay on-brand and lightweight.",
          "RESPONSIVE — Portal is mobile-first (employees hit it on phones): single-column stacked cards, sticky bottom 'New request' button on mobile, search collapses to icon. Agent app is desktop-first but degrades gracefully (sidebar → sheet, tables → horizontal scroll with pinned id column).",
          "CONSISTENCY GUARDRAIL — Portal and agent app share the exact same CSS variable tokens, fonts, radius, and badge system so branding is unified; only spacing scale, nav pattern, and copy tone differ. This keeps one design system, two experiences."
        ]
      },
      "scope": {
        "milestones": [
          {
            "order": 1,
            "name": "Scaffold & Tooling",
            "build": "Init Next.js 16 (App Router, React 19, Turbopack) + TypeScript strict. Add Tailwind v4, shadcn/ui (init + core primitives: button, input, card, table, dialog, sheet, dropdown-menu, badge, avatar, tabs, select, form, sonner/toast, skeleton). Set up Zod, ESLint/Prettier, path aliases (@/*), .env.example. Add lucide-react icons and next-themes for dark/light.",
            "deliverable": "Repo that boots with `pnpm dev` on Turbopack showing a themed placeholder page. shadcn components installed under src/components/ui. Clean lint/typecheck."
          },
          {
            "order": 2,
            "name": "Database & Prisma Schema",
            "build": "Prisma with SQLite (dev) / Postgres (prod) via datasource env switch. Model the full domain now to avoid churn: User, Account/Session (Auth.js), Group, Queue, Service, Category, Ticket (type: INCIDENT|REQUEST, status, priority, impact, urgency), TicketComment, TicketAttachment (metadata only), Problem, Change (with simple approval state), Asset (CMDB: type, status, relations self-ref for CI links), SyncConnector + SyncRun, ApiToken, AuditLog. Add enums, indexes, sensible relations. Generate client, run first migration.",
            "deliverable": "prisma/schema.prisma covering every module, migration applied, `prisma studio` shows empty tables. Typed Prisma client singleton at src/lib/db.ts."
          },
          {
            "order": 3,
            "name": "Auth (SSO/OIDC) + RBAC",
            "build": "Auth.js v5 (NextAuth) with Prisma adapter. Configure a generic OIDC provider (env-driven issuer/clientId/secret) AND a dev Credentials provider so it runs offline without an IdP. Session strategy, role on session (ADMIN|AGENT|REQUESTER). Middleware protecting /app routes and redirecting to /login; /portal accessible to authenticated requesters. Role-based guards helper.",
            "deliverable": "Working login page: OIDC button (if configured) + dev email/password login. Authenticated redirect to dashboard. Logout. Roles enforced in middleware. FULLY implemented (OIDC config is stub-friendly: works with dev creds when no IdP env present)."
          },
          {
            "order": 4,
            "name": "App Shell & Design System",
            "build": "Two shells: authenticated staff shell (/app) with collapsible sidebar (modules nav), top bar (search, theme toggle, user menu, notifications popover), breadcrumbs; and Self-Service portal shell (/portal) with a cleaner, friendlier layout. Build reusable DataTable (TanStack Table: sorting, filtering, pagination, column visibility, row actions), PageHeader, StatCard, StatusBadge, PriorityBadge, EmptyState, DetailPanel/Sheet patterns. Establish color tokens and a polished, modern aesthetic (rounded-2xl, subtle shadows, consistent spacing).",
            "deliverable": "Navigable app with sidebar + portal, beautiful empty-state dashboard, and a reusable DataTable demoed on one route. This shell is what every module plugs into."
          },
          {
            "order": 5,
            "name": "Tickets Module (flagship, full)",
            "build": "Full CRUD for Incidents & Requests. List view (DataTable with filters: status, priority, queue, assignee, category, service; saved-view chips), detail view (description, timeline of comments/activity, sidebar with assignee/group/queue/status/priority/category/service, linked assets), create/edit forms (react-hook-form + Zod), status transitions, comment/notes, reassign, priority auto-derived from impact×urgency matrix. Server Actions for mutations + AuditLog writes. Optimistic toasts.",
            "deliverable": "End-to-end ticket lifecycle in the UI: create, triage, comment, reassign, resolve, close. This is the deepest module and the demo centerpiece — FULLY implemented."
          },
          {
            "order": 6,
            "name": "Queues, Groups, Categories, Services",
            "build": "CRUD admin screens for Queues (routing buckets), Groups (teams with members), Categories (hierarchical tree, parent/child), and Services (service catalog with description, owner group, category, request template). Each is a DataTable + create/edit dialog. Wire these as selectable relations inside the Ticket forms (already referenced in M5). Category tree component with expand/collapse.",
            "deliverable": "Admin can manage all taxonomy/routing entities; tickets correctly reference them. Services double as portal catalog items. FULLY implemented but lightweight (dialogs, not full detail pages)."
          },
          {
            "order": 7,
            "name": "Self-Service Portal",
            "build": "Requester-facing /portal: home with service catalog cards (from Services) + knowledge/quick actions, 'Submit a request/incident' guided form (service-driven), 'My tickets' list with status tracking and comment thread (read + reply), profile. Distinct friendly styling. Reuses ticket data layer with requester-scoped queries.",
            "deliverable": "A requester can log in, browse the catalog, file a ticket, and track/comment on it — without seeing staff internals. FULLY implemented (KB articles can be seeded static stubs)."
          },
          {
            "order": 8,
            "name": "Problems & Changes",
            "build": "Problems: list + detail, link related tickets (known-error notes, root-cause field, status: NEW|INVESTIGATING|KNOWN_ERROR|RESOLVED). Changes: list + detail with a simple change workflow (DRAFT->SUBMITTED->APPROVED/REJECTED->IMPLEMENTED->CLOSED), risk/impact fields, approver, planned window, link affected assets/services. Reuse DataTable + DetailPanel + Server Actions.",
            "deliverable": "Both modules browsable and mutable with linking to tickets/assets. Changes show an approval flow. FULLY implemented core; advanced scheduling/CAB calendar left as stub."
          },
          {
            "order": 9,
            "name": "Assets / CMDB",
            "build": "Asset inventory: DataTable (type: SERVER|WORKSTATION|NETWORK|SOFTWARE|MOBILE, status, owner, location, serial, IP). Asset detail with attributes, linked tickets, and CI relationships (self-referential 'depends on / used by') rendered as a simple relationship list (graph view stubbed as a styled list/mini-diagram). Create/edit forms.",
            "deliverable": "Browsable CMDB with relationships and cross-links to tickets. FULLY implemented as inventory + relations; auto-discovery is handled by Syncs module, live topology graph is a stub."
          },
          {
            "order": 10,
            "name": "Syncs / Integrations",
            "build": "Sync connector registry: connector types (LDAP/AD user sync, Asset Discovery, External ITSM import) with config forms, enable/disable, 'Run now' button, and SyncRun history (status, counts, log excerpt). Implement ONE connector for real end-to-end: a mock/seedable 'AD user import' that reads a bundled JSON fixture and upserts Users/Groups, writing a SyncRun record. Others are configurable + show simulated runs.",
            "deliverable": "Integrations page listing connectors, run history, and a genuinely working import that visibly adds users/groups. Real connector = 1; rest = realistic stubs with simulated runs."
          },
          {
            "order": 11,
            "name": "Public REST API",
            "build": "Clean versioned REST under /api/v1: resources for tickets, assets, problems, changes, services, users (GET list/detail, POST/PATCH where sensible). Bearer-token auth via ApiToken table (hashed), per-request scope check, Zod-validated bodies, consistent JSON envelope + error shape, pagination. Token management UI in admin settings (create/revoke). Serve an OpenAPI JSON + a lightweight docs page.",
            "deliverable": "curl-able authenticated API for core resources with token management UI and OpenAPI spec. Tickets/Assets endpoints FULLY implemented; write endpoints for secondary resources can be read-only stubs if time-constrained."
          },
          {
            "order": 12,
            "name": "Seed Data, Polish & Docs",
            "build": "Comprehensive seed script (prisma/seed.ts). Dashboard analytics widgets (open tickets by priority, SLA-ish aging, tickets by queue) using real seeded data + charts. Global command palette (cmdk) search across modules. Final visual polish pass (loading skeletons, empty states, responsive, dark mode QA). README with setup + demo credentials. One .env.example and a single `pnpm setup` (install+migrate+seed).",
            "deliverable": "App that on first run (`pnpm setup && pnpm dev`) looks alive: populated dashboards, realistic tickets/assets/users, working demo login. Polished, screenshot-ready, and every module demonstrable."
          }
        ],
        "stubVsFull": [
          "FULLY IMPLEMENT — Tickets module (M5): the flagship. Full lifecycle, comments/timeline, filtering, reassignment, impact×urgency priority matrix, audit trail. This is the demo centerpiece and must feel deep.",
          "FULLY IMPLEMENT — Auth.js v5 with dev Credentials provider AND env-driven OIDC. Critical it runs offline with no IdP, so make dev creds the always-available path and OIDC opt-in via env.",
          "FULLY IMPLEMENT — Shared shell + DataTable + design system (M4). Everything depends on it; polish here makes every module look complete for low cost.",
          "FULLY IMPLEMENT — Self-Service portal (M7) ticket submit/track/comment. It's a listed differentiator vs GLPI and cheap to build by reusing the ticket data layer.",
          "FULLY IMPLEMENT — Queues/Groups/Categories/Services CRUD (M6), but as dialogs not full detail pages to save time while staying complete.",
          "FULLY IMPLEMENT — REST API for Tickets + Assets (M11) with real bearer-token auth and token UI. These two prove the 'clean public API' claim.",
          "FULLY IMPLEMENT — One real Sync connector: JSON-fixture 'AD user import' that actually upserts Users/Groups and records a SyncRun. Proves the Syncs concept concretely.",
          "STUB (realistic) — Remaining Sync connectors (LDAP live bind, asset discovery, external ITSM): configurable UI + simulated SyncRun history with plausible counts/logs. No live network integration.",
          "STUB — CMDB live topology graph: render CI relationships as a styled list / simple mini-diagram instead of an interactive graph library. Relationships are real data; only the visualization is simplified.",
          "STUB — Changes advanced scheduling / CAB calendar: implement the approval state machine and fields, but skip calendar/change-window conflict detection.",
          "STUB — Problems advanced correlation/known-error DB search: implement fields, linking, and status, but skip automated ticket-to-problem correlation.",
          "STUB — Attachments: store metadata (filename/size/uploader) and show the UI, but skip real blob storage/upload pipeline (or use local disk only in dev).",
          "STUB — SLA engine: show aging/priority-based indicators derived from timestamps rather than a configurable SLA policy/escalation engine.",
          "STUB — Knowledge base: seed a handful of static KB articles for the portal rather than a full authoring CMS.",
          "STUB — API write endpoints for secondary resources (problems/changes/services): expose read + token auth; make writes read-only or minimal if time is tight, keeping tickets/assets fully writable."
        ],
        "seedPlan": [
          "Users & roles: ~15 users across ADMIN, AGENT, REQUESTER. Named demo accounts with known passwords for the dev Credentials login (e.g. admin@servio.dev, agent@servio.dev, user@servio.dev — all password 'servio') plus realistic filler users with avatars (dicebear URLs).",
          "Groups & Queues: 4-5 groups (Service Desk, Network Team, Infrastructure, Application Support, Security) with members; 4-5 queues (Inbox, Incidents, Requests, Escalations, Change Advisory) mapped to groups.",
          "Categories: a 2-3 level tree (Hardware > Laptop/Desktop/Printer; Software > OS/Application/License; Network > Connectivity/VPN/WiFi; Access > Account/Permissions).",
          "Services catalog: 8-10 services (New Laptop Request, VPN Access, Password Reset, Email Setup, Software Install, Onboarding, Offboarding, Guest WiFi) with owner groups and short descriptions so the portal catalog looks full.",
          "Tickets: 60-80 tickets spread across INCIDENT/REQUEST, all statuses (New, Assigned, In Progress, Pending, Resolved, Closed), varied priorities from the impact×urgency matrix, distributed across queues/agents/requesters, with realistic titles, multi-message comment threads, and timestamps spread over the last ~60 days so dashboards/aging charts look alive.",
          "Problems: 4-6 problems, a couple in KNOWN_ERROR, each linked to several related incident tickets with a root-cause note.",
          "Changes: 6-8 changes across the workflow states (a few DRAFT/SUBMITTED, some APPROVED/IMPLEMENTED, one REJECTED), with approvers, risk levels, and planned windows.",
          "Assets/CMDB: 40-60 assets across all types with statuses, owners, locations, serials/IPs, plus ~20 CI relationships (app depends-on server, server in rack/location, workstation used-by user) and several assets cross-linked to tickets.",
          "Syncs: 3-4 seeded connectors (AD User Import [real], LDAP Directory, Asset Discovery, External ITSM) each with a few historical SyncRun records showing success/partial/failed statuses and item counts; ship the AD import JSON fixture so 'Run now' visibly adds users.",
          "API tokens: 1-2 pre-seeded demo API tokens (with the raw value printed once in seed output/README) so the REST API and docs page are immediately curl-able.",
          "AuditLog: back-fill a stream of audit entries (ticket created/assigned/resolved, change approved, asset updated) so the activity feeds and dashboard 'recent activity' widget are populated on first run.",
          "KB: 5-6 static knowledge articles (Reset your password, Connect to VPN, Request new hardware) surfaced in the portal."
        ]
      }
    }
  }
}