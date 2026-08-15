#!/bin/sh
# Session-stop advisory: when Claude Code finishes a turn, check whether code
# changed in the working tree without its owning docs, and (non-blocking) nudge
# to run /sync-docs. Never blocks the stop — pure reminder.
#
# Wired in .claude/settings.json under hooks.Stop. Keep it fast and side-effect
# free; the actual doc rewrite is a human/agent action via /sync-docs.

gaps="$(node "${CLAUDE_PROJECT_DIR:-.}/scripts/check-doc-drift.mjs" --working --porcelain 2>/dev/null)"

if [ -n "$gaps" ]; then
  # Compact the gap list into one advisory line.
  summary="$(printf '%s' "$gaps" | awk -F'\t' '{printf "%s→%s; ", $1, $2}')"
  printf '{"systemMessage":"📝 Docs may be stale for: %s Run /sync-docs before committing (or [skip-docs] to bypass)."}\n' \
    "$(printf '%s' "$summary" | sed 's/"/\\"/g')"
fi
exit 0
