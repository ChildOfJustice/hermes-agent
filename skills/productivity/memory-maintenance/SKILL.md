---
name: memory-maintenance
description: "Session wrap-up: distil durable learnings into MemPalace, audit for secrets and junk, clean transcripts. Load when the user says 'wrap up', 'tidy memory', or 'save what we learned'."
version: 1.0.0
author: Hermes Agent (Nous Research)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [memory, mempalace, housekeeping, wrap-up, cleanup, transcripts]
    related_skills: [hermes-mempalace-guide, self-improvement-after-task]
---

# Memory Maintenance — Session Wrap-Up

A focused procedure for end-of-session memory hygiene. The goal: extract what
matters, delete what doesn't, leave MemPalace cleaner than you found it.

For the full end-of-task pipeline (skill creation, self-improvement, deeper
curation), load `self-improvement-after-task` instead.

## Triggers

- "wrap up", "wrap up for today"
- "tidy the memory", "clean up memory"
- "save what we learned"
- After any session with 10+ tool calls or non-trivial new findings

---

## Procedure (run all steps in order)

### Step 0 — Filter before writing (mental pass)

Scan the session. Only durable, distilled facts get written. Discard:
  - Failed attempts superseded by a working solution
  - Intermediate dead-ends that led nowhere
  - Anything stale in 7 days: PR numbers, commit SHAs, step completions
  - "We tried X, it failed" — UNLESS the failure is a recurring pattern to avoid

Keep:
  - The final working approach / root cause of a fixed bug
  - Non-obvious pitfalls that will recur → bug-patterns
  - Confirmed workflow or API pattern → tool-usage
  - Architecture/tooling decision made → decisions
  - Project-specific convention confirmed → project-conventions
  - Open questions / what's next → handoffs

Rule: would this help future-me avoid re-discovering the same thing?
Yes → write it. No → skip it.

### Step 1 — Write durable knowledge FIRST (before any cleanup)

Transcripts are the raw source. Distil lessons into structured rooms
BEFORE cleaning transcripts — otherwise the knowledge is gone.

Call mempalace_promote_learning for each learning:
  kind "decision"           → architecture choices made
  kind "tool-usage"         → workflows and pitfalls discovered
  kind "project-convention" → repo-specific rules confirmed
  kind "bug-pattern"        → root causes of bugs fixed
  kind "handoff"            → session summary + what's next

Or call mempalace_add_drawer directly for explicit room placement.

Always check for duplicates before filing:
  mempalace_check_duplicate(content="...", threshold=0.9)

### Step 2 — Check status

  mempalace_status()

Note the drawer counts per room. Compare after cleanup to confirm nothing
important was accidentally deleted.

### Step 3 — Audit structured rooms for junk

List drawers in non-transcript rooms and scan for obvious junk:
  mempalace_list_drawers(room="decisions", limit=30)
  mempalace_list_drawers(room="tool-usage", limit=30)
  mempalace_list_drawers(room="bug-patterns", limit=30)
  mempalace_list_drawers(room="project-conventions", limit=30)
  mempalace_list_drawers(room="handoffs", limit=30)
  mempalace_list_drawers(room="diary", limit=30)
  mempalace_list_drawers(room="skill-candidates", limit=30)

Junk indicators:
  - Starts with "TEST" or "test write" — smoke-test artifacts
  - Single-line stubs with no real content
  - Completed-step logs ("Step 3 done", "PR X merged")
  - Entries that exactly duplicate an existing skill
  - Obvious duplicates of another drawer in the same room

Delete junk by drawer_id:
  mempalace_delete_drawer(drawer_id="...")

Don't bulk-delete. Review each candidate. The point is curation, not erasure.

DO NOT touch memory-tool or user-profile rooms. They are maintained
exclusively by the built-in memory tool's mirror hook.

### Step 4 — Audit for secrets

  mempalace_audit_secrets()

Review the REDACTED previews. If any drawer ID surfaces a real secret
(API key, token, password, private key), delete it:
  mempalace_delete_drawer(drawer_id="...")

Never print or log the actual secret content — the audit returns redacted
previews specifically to avoid this.

### Step 5 — Clean transcripts

ALWAYS dry-run first:
  mempalace_cleanup(room="transcripts", max_delete=50, apply=False)

Review what would be deleted. Then apply:
  mempalace_cleanup(room="transcripts", max_delete=50, apply=True)

Transcripts accumulate fast. Routine cleanup after each session keeps the
DB lean. The structured rooms (decisions, tool-usage, etc.) survive this.

### Step 6 — Report to user

Give a compact summary:

  Memory saved:
    - <room>: <one-line description of what was added>
    ...

  Junk deleted: N drawers (<rooms>)
  Secrets found: 0 / N (action taken)
  Transcripts cleaned: N deleted, M remaining

---

## Pitfalls

  Write before cleanup.
    If you clean transcripts first and haven't extracted lessons, the
    knowledge is gone for this session.

  mempalace_cleanup is dry-run by default (apply=False).
    Always call with apply=False first, inspect the output, then apply=True.

  Never target memory-tool or user-profile in cleanup.
    These are mirrors of the built-in memory tool. Cleaning them breaks
    the mirror and causes stale/missing entries in future sessions.

  Avoid deleting drawers from other writer_ids.
    Each agent profile has a writer_id. Deletions are scoped to your
    writer_id. If mempalace_delete_drawer returns "not found" but the
    drawer appears in list output, it belongs to a different writer.

  Don't save imperative instructions to the built-in memory tool.
    "User prefers X" ✓ — "Always do X" ✗
    Imperative entries get re-read as directives in future sessions.
