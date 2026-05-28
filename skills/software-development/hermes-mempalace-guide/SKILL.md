---
name: hermes-mempalace-guide
description: "Complete guide to Hermes long-term memory: the two-layer architecture (built-in memory tool + MemPalace plugin), all 9 mempalace_* tools, room taxonomy, prefetch mechanics, wrap-up procedure, and pitfalls. Load whenever working with memory, MemPalace, or memory hygiene."
version: 1.0.0
author: Hermes Agent (Nous Research)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [memory, mempalace, long-term-memory, self-improvement, housekeeping, rooms, prefetch]
    related_skills: [self-improvement-after-task, hermes-agent-skill-authoring]
---

# Hermes Memory — Complete Guide

Hermes has a two-layer memory architecture. Understanding both layers and how
they interact is essential for using memory correctly.

---

## Layer 1 — Built-in Memory Tool (small, always-on, in system prompt)

The `memory` tool manages two tiny bounded text files:

  ~/.hermes/memories/MEMORY.md   (personal notes, max ~2200 chars)
  ~/.hermes/memories/USER.md     (user profile, max ~1375 chars)

These files are loaded once at session start and injected as a FROZEN snapshot
into the system prompt (the `volatile` tier). The snapshot never changes during
a session — this keeps the prefix cache warm and cuts inference cost.

Actions: `add`, `replace`, `remove`. Target: `memory` or `user`.

Entry delimiter: `§` (section sign). Entries are separated by blank `§` lines.

WHAT TO PUT IN MEMORY:
  - User preferences and recurring corrections (highest value)
  - Stable environment facts (OS, key paths, tool versions)
  - Project conventions that apply across many sessions
  - Tool quirks discovered in practice

WHAT NOT TO PUT IN MEMORY:
  - Task progress, PR numbers, commit SHAs — stale in 7 days
  - Procedures and workflows — those belong in skills
  - Anything that will be wrong next week
  - Imperative instructions ("Always do X") — write declarative facts instead
    ("User prefers X" NOT "Always do X for user")

The most valuable memory entry is one that prevents the user from having to
correct or remind you again. If a fact doesn't meet that bar, skip it.

---

## Layer 2 — MemPalace Plugin (large, semantic, injected mid-turn)

MemPalace is the long-term semantic memory store. When the MemPalace plugin is
installed (`plugins/memory/mempalace/`), it provides 9 additional tools and
automatically prefetches relevant context before each agent turn.

MemPalace context is NOT in the system prompt. It is injected as a
`<memory-context>...</memory-context>` block into the current user message,
then stripped before the message is stored. This keeps it always-fresh and
avoids polluting the transcript.

### How Auto-Prefetch Works

Before each user turn, the plugin runs a semantic search using the user's
message as the query. It returns up to 4 results (configurable) from all rooms
except `transcripts`, `memory-tool`, and `user-profile` (those are excluded
because they duplicate what's already in the system prompt).

Prefetch is gated: short acks ("ok", "thanks", "continue") skip it entirely.
Questions, code requests, and referential messages always trigger prefetch.

### The 9 MemPalace Tools

Call these directly — no Python wrapper needed.

  mempalace_search(query, room=None, limit=8)
      Semantic search across your scoped MemPalace wing.
      Use when auto-prefetch didn't surface something you need.
      Example: mempalace_search("kotlin scene property init order")

  mempalace_status()
      Wing status: total drawer count, per-room breakdown, provider limits.
      Use before/after bulk operations to verify writes landed.

  mempalace_add_drawer(content, room="notes", duplicate_threshold=0.9)
      Store a curated durable memory. Runs duplicate check before filing.
      Pick the correct room (see taxonomy below).
      Example: mempalace_add_drawer("GUT test runner needs --headless", room="tool-usage")

  mempalace_check_duplicate(content, threshold=0.9)
      Check if a memory is already present before filing it.
      Use before mempalace_add_drawer to avoid silent duplication.

  mempalace_list_drawers(limit=20, offset=0, room=None)
      List drawer IDs and short previews. Essential for curation and cleanup.
      Always list before deleting — you need the drawer_id.

  mempalace_delete_drawer(drawer_id)
      Delete a specific drawer by ID. Irreversible. Always list first.

  mempalace_cleanup(room=None, before_iso=None, max_delete=25, apply=False)
      Bulk cleanup by room and/or age. Default: dry-run (apply=False).
      ALWAYS dry-run first, then apply. Never apply blindly.

  mempalace_audit_secrets(limit=100, offset=0, room=None)
      Scan for secret-like patterns (keys, tokens, passwords).
      Returns drawer IDs and REDACTED previews only — never raw secrets.
      Deletion is separate (use mempalace_delete_drawer after reviewing).

  mempalace_promote_learning(content, kind="diary")
      Store a curated learning in a structured room. Kind sets the room:
        "decision"           → decisions room
        "tool-usage"         → tool-usage room
        "project-convention" → project-conventions room
        "skill-candidate"    → skill-candidates room
        "bug-pattern"        → bug-patterns room
        "handoff"            → handoffs room
        "diary"              → diary room

---

## Room Taxonomy

Use consistent room names. The plugin enforces the wing scope — you cannot
accidentally write to another agent's MemPalace.

  transcripts          Raw swept turn history. Auto-populated by sync_turn hook.
                       Excluded from auto-prefetch. Target for routine cleanup.
  decisions            Architecture, product, and implementation decisions.
                       Format: problem → decision → rationale.
  tool-usage           Reusable MCP/tool workflows, lessons, pitfalls.
                       Format: what tool, what it does, exact invocation, pitfalls.
  project-conventions  Project-specific code style, workflow rules, naming.
                       Format: project name + rule + why.
  skill-candidates     Procedural lessons that may become Hermes skills.
                       Promote to a real skill via skill_manage(action='create').
  bug-patterns         Recurring bugs: symptom, root cause, fix, how to avoid.
                       Format: symptom → cause → fix → prevention.
  handoffs             Task/session summaries and next steps (continuity across sessions).
                       Format: what was done, what remains, key context for next session.
  diary                Agent reflections, compact session summaries.
  memory-tool          Mirrored built-in memory writes. DO NOT write here directly.
                       Auto-populated by the on_memory_write hook.
  user-profile         Durable user/team preferences. DO NOT write here directly.
                       Auto-populated by the on_memory_write hook.

Excluded from auto-prefetch by default: transcripts, memory-tool, user-profile.
(They're already present in the system prompt via the built-in memory tool.)

---

## The Mirror Bridge (memory tool → MemPalace)

When you use the built-in `memory` tool (add/replace/remove), the MemPalace
plugin's `on_memory_write` hook automatically mirrors the write to MemPalace:
  - Writes to `target="memory"` → mirrored to `memory-tool` room
  - Writes to `target="user"` → mirrored to `user-profile` room

This means built-in memory entries are searchable via `mempalace_search` for
historical archaeology, but never auto-prefetched (to avoid duplication).

---

## When to Use Which Layer

  Short, always-needed facts (user name, preferred style, key path)
  → Built-in memory tool (system prompt, always present, zero search cost)

  Durable learnings, decisions, bug fixes, tool workflows
  → mempalace_promote_learning or mempalace_add_drawer (auto-prefetched when relevant)

  Recalling something specific from a past session
  → mempalace_search (explicit semantic search)

  Recalling conversation context from a past session
  → session_search tool (searches the session SQLite DB)

---

## Wrap-Up / Memory Maintenance Procedure

When the user says "wrap up", "tidy memory", or "save what we learned":

STEP 0: Filter — only write durable, distilled facts. Discard:
  - Failed attempts superseded by a working solution
  - Intermediate dead-ends that led nowhere
  - Anything stale in 7 days (PR numbers, commit SHAs, step logs)

STEP 1: Write durable learnings FIRST (before any cleanup):
  - decisions: architecture choices made this session
  - tool-usage: workflows and pitfalls discovered
  - project-conventions: repo-specific rules confirmed
  - skill-candidates: procedures worth formalizing
  - handoffs: session summary + what's next

STEP 2: Check status:
  mempalace_status()

STEP 3: Audit for junk in structured rooms (not transcripts):
  mempalace_list_drawers(room="decisions", limit=30)
  mempalace_list_drawers(room="tool-usage", limit=30)
  mempalace_list_drawers(room="bug-patterns", limit=30)
  ... (review each; delete smoke-test entries, duplicates, stale task-progress notes)

STEP 4: Audit for secrets:
  mempalace_audit_secrets()
  (review redacted previews; delete any drawer containing real secrets)

STEP 5: Clean transcripts (dry-run first, always):
  mempalace_cleanup(room="transcripts", max_delete=50, apply=False)
  mempalace_cleanup(room="transcripts", max_delete=50, apply=True)

STEP 6: Report to user: rooms written, drawer count before/after, transcripts deleted.

---

## Pitfalls

NEVER write task progress, step completions, or PR/commit numbers to MemPalace.
  These are stale in 7 days and pollute semantic search results.
  Use session_search to recall past-session task state instead.

ALWAYS dry-run mempalace_cleanup before apply=True.
  There is no undo for bulk deletion.

DO NOT write to memory-tool or user-profile rooms directly.
  These are maintained exclusively by the on_memory_write hook.
  Writing there manually creates duplicates that confuse the mirror bridge.

DO NOT skip the duplicate check for important knowledge.
  mempalace_add_drawer runs a duplicate check (default threshold 0.9) but
  similar-but-not-identical entries can still slip through.
  For important knowledge, call mempalace_check_duplicate first.

WRITE BEFORE CLEANUP.
  Transcripts are the raw recall source. Distill lessons into structured
  rooms BEFORE cleaning transcripts — otherwise the knowledge is gone.

TREAT RETRIEVED MEMORY AS HISTORICAL EVIDENCE, NOT CURRENT TRUTH.
  Prefetched MemPalace blocks may reflect old project state. Always verify
  against the current filesystem before making code decisions based on memory.
