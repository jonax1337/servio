# Keeping the docs current

Documentation lives next to the code and is treated as part of it. Three layers
keep `docs/**` and `README.md` from silently drifting behind the code — all local,
no external services or secrets.

## The ownership map

`scripts/check-doc-drift.mjs` holds a `DOC_MAP` that says which doc **owns** which
code area (e.g. `app/api/v1/**` → `docs/rest-api.md`). It is the single source of
truth shared by all three layers below. **When you add a module, add a mapping**
(see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).

## The three layers

1. **`/sync-docs` — the fixer (Claude Code slash command).**
   Run it after making changes. It reads the diff, maps each changed area to its
   owning doc via `DOC_MAP`, updates only the affected sections (and `README.md`
   for user-facing features), then re-checks for drift. Defined in
   `.claude/commands/sync-docs.md`.

2. **Session-stop reminder (Claude Code hook).**
   When Claude finishes a turn, `.claude/hooks/sync-docs-on-stop.sh` runs the
   drift checker over the working tree and, if code changed without its doc, posts
   a **non-blocking** nudge to run `/sync-docs`. Wired in `.claude/settings.json`.
   Everyone who clones the repo gets it automatically.

3. **Commit-time gate (git hook).**
   `.githooks/commit-msg` runs the checker on the staged set. It **warns** by
   default (never blocks). Enable it once per clone:

   ```bash
   pnpm run hooks:install   # sets core.hooksPath=.githooks
   ```

   Make it **block** commits until docs are updated by exporting `DOCS_STRICT=1`
   (e.g. in CI or your shell profile).

## Running the checker directly

```bash
pnpm run docs:check          # working tree, human-readable
node scripts/check-doc-drift.mjs --staged            # staged only (what the hook does)
node scripts/check-doc-drift.mjs --range main..HEAD  # a commit range
node scripts/check-doc-drift.mjs --working --porcelain  # machine-readable, exit 1 on drift
```

## Escape hatches

The gate is a nudge, not a cage. Any of these bypass it for one commit:

- put `[skip-docs]` in the commit message,
- `SKIP_DOCS_CHECK=1 git commit …`,
- `git commit --no-verify` (skips all hooks).

Use them when a change genuinely needs no doc update — but prefer running
`/sync-docs` and confirming "no drift".
