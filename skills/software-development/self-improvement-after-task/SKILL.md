---
name: self-improvement-after-task
description: "End-of-task housekeeping: extract durable learnings to MemPalace, prune junk, audit secrets, create/patch skills for reusable workflows. Load when user asks to 'improve yourself based on the finished task' or similar."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [meta, memory, skills, mempalace, housekeeping, self-improvement, end-of-task]
    related_skills: [mempalace-cleanup, hermes-agent-skill-authoring, agent-memory-hygiene]
---

# Self-Improvement After Task

A meta-skill for converting completed work into durable agent capability. The
user is tired of asking for this every time — when they trigger it, run the
full pipeline below without further prompting.

## When to load

Trigger phrases from the user (or your own intuition at the end of a non-trivial task):

- "improve yourself based on the finished task"
- "save what you learned"
- "memory cleanup + skills"
- "end-of-task housekeeping"
- "what did we learn?"
- Any variant where the user is offloading the post-task reflection onto you

ALSO: at the natural end of any task that took 10+ tool calls, involved
non-trivial debugging, surfaced new conventions, or required a workflow you
hadn't used before — proactively offer this skill. The user shouldn't have to
remember to ask.

Do NOT load this skill for:
- Tasks that completed in 1-3 tool calls (nothing durable to extract).
- Failed tasks where the user is mid-debugging (still in the work, not after it).
- Tasks where the user explicitly said "don't save this" or "throwaway."

## The five-stage pipeline

Run all five stages in order. Don't skip stages because nothing seems to fit —
the value is in checking; the stages are cheap when there's nothing to do.

### Stage 1 — Audit MemPalace for junk (delete it)

Junk = entries that don't belong in durable memory. Common shapes:

- Smoke-test drawers ("TEST: single write", "thread test after warmup", etc.)
- Drawers filed accidentally by tools during this session
- Drawers that duplicate already-shipped skills word-for-word
- Stale task-progress notes ("Step 3 done", "PR X merged") that should never have been in `memory` (those belong in `transcripts` only)

Procedure:

```python
# 1. List candidates per non-transcript room.
mempalace_list_drawers(limit=30, room="bug-patterns")
mempalace_list_drawers(limit=30, room="decisions")
mempalace_list_drawers(limit=30, room="project-conventions")
mempalace_list_drawers(limit=30, room="skill-candidates")
mempalace_list_drawers(limit=30, room="handoffs")
mempalace_list_drawers(limit=30, room="diary")
mempalace_list_drawers(limit=30, room="tool-usage")

# 2. For each room, scan the previews for obvious junk.
#    Indicators: starts with "TEST", duplicate previews, single-line stubs,
#    PR-number-style "fixed bug X" entries, completed-step logs.

# 3. Delete by drawer_id.
mempalace_delete_drawer(drawer_id="...")
```

Don't bulk-delete; review each candidate. The point is curation, not pruning.

DO NOT touch the `transcripts` room. Raw turn history is intentionally retained
and excluded from auto-prefetch anyway. Cleaning transcripts here is a
different operation (see `mempalace-cleanup` skill).

DO NOT touch the `memory-tool` mirror room or `user-profile`. Those are
managed by the plugin and the system-prompt memory block; pruning them risks
desyncing the mirror.

### Stage 2 — Audit MemPalace for secrets

Always do this, even if you don't think anything sensitive was saved. A
single leaked token across hundreds of drawers is the failure mode this stage
prevents.

```python
findings = mempalace_audit_secrets(limit=100)
# Returns drawer IDs + redacted previews. If non-empty:
# 1. Read each cited drawer in full.
# 2. If it's a real secret, delete the drawer (do NOT replace — assume
#    leaked once = leaked).
# 3. Rotate the credential in the actual provider.
# 4. Tell the user explicitly.
```

If the scan returns empty findings, note that briefly in your summary so the
user knows you checked.

### Stage 3 — Extract durable learnings

What "durable" means: a fact, decision, convention, bug pattern, or workflow
that will still matter in 7+ days and reduces the user's need to re-explain.

For each candidate learning from the just-finished task, pick the right room:

| Room                 | What goes here |
|----------------------|----------------|
| `decisions`          | Architecture, product, implementation decisions with rationale. State + scope, not just "we chose X." |
| `tool-usage`         | A non-obvious way a tool works (workspace-specific quirks, undocumented flags, working patterns). |
| `project-conventions`| Project-specific rules (naming, layout, test patterns, commit-message shape, branch naming, env defaults). |
| `skill-candidates`   | A procedural lesson that could become a Hermes skill but isn't worth a full SKILL.md yet. |
| `bug-patterns`       | Bug → symptom → root cause → fix. Concrete enough that a future agent matching the symptom finds the fix. |
| `handoffs`           | Task or session summaries with explicit next-steps. Use sparingly — most sessions don't need a handoff. |
| `diary`              | Compact session reflection (rare; only when no other room fits). |

Procedure:

```python
# For each candidate, dedup-check first:
duplicate = mempalace_check_duplicate(content="...", threshold=0.9)
if not duplicate["is_duplicate"]:
    mempalace_promote_learning(content="...", kind="decision")  # or other kind
```

Write entries as **declarative facts**, not imperatives:

- "User prefers concise responses" ✓
- "Always respond concisely" ✗

- "Project uses pytest with -p no:cacheprovider for deterministic reruns" ✓
- "Run pytest with -p no:cacheprovider" ✗

Imperative phrasing gets re-read as a directive in later sessions and can
cause repeated work or override the user's current request. Procedures
belong in skills.

Length: short paragraphs. If a learning is more than ~6 sentences, it's
probably a skill candidate, not a memory drawer.

### Stage 4 — Create or patch skills

Scan the just-finished task for skill-worthy patterns. A skill is worth
creating when:

- The task involved a workflow with 3+ ordered steps you'd want to reuse.
- You surfaced pitfalls a future agent could easily repeat.
- The user explicitly said "remember how to do this."
- You found yourself synthesizing a procedure from multiple loaded skills
  (consider merging or cross-linking instead of creating a new one).

Before creating: ALWAYS list existing skills first, with `skills_list()`.
A skill that's "almost the right shape" should be patched / extended, not
duplicated. Duplicate skills cause future confusion about which to load.

For each new skill:

```python
# Use the hermes-agent-skill-authoring skill's structure.
skill_manage(
    action="create",
    name="<kebab-case-name>",
    category="<existing-category>",  # software-development, github, etc.
    content="""---
name: <name>
description: "<one-line, includes when-to-load trigger>"
...
---

# <Title>

## When to load
...

## Procedure
1. ...
2. ...

## Pitfalls
- ...

## Worked example
<refer to a real run; use a references/ file for full traces>
"""
)
```

If the new skill references a long worked example, drop it into
`references/<example-name>.md` via `skill_manage(action='write_file', ...)`
rather than bloating the main SKILL.md.

If you used a skill during the task and it had a gap (missing step,
wrong command, missing pitfall), patch it immediately:

```python
skill_manage(action="patch", name="<existing-skill>",
             old_string="...", new_string="...")
```

Don't wait to be asked. Outdated skills are liabilities.

### Stage 5 — Summarize what you saved

After stages 1-4, give the user a compact terminal-rendered summary:

```
Memory cleanup:
  Deleted: N junk drawers (room: ..., reason: ...)
  Secret audit: 0 findings / N findings (action taken)

Memory added:
  - project-conventions: <one-line>
  - decisions: <one-line>
  - bug-patterns: <one-line>

Skills created:
  - <name> (<category>): <one-line description>

Skills patched:
  - <name>: <what changed>

Skills considered but not created:
  - <pattern>: covered by existing <skill>
```

This serves as the audit trail. The user gets confirmation that the
housekeeping ran, plus a record they can scan to spot anything they'd
have preferred you NOT save.

## Decision rules

These keep the pipeline efficient instead of generating noise:

- **One skill per durable workflow, not per session.** If you "discovered"
  a pattern that's already in a loaded skill, patch the skill — don't
  create a new one.
- **One drawer per durable fact, not per step.** Step-by-step task progress
  belongs in `transcripts` (auto-saved). Memory drawers are the things you
  want to recall standalone.
- **Skip Stage 4 entirely** if the task was a re-application of existing
  skills with no new pitfalls. The pipeline doesn't have to produce a
  skill every time.
- **Skip Stage 3 entirely** if the task didn't produce a new durable
  learning (e.g. you just answered a question). Same logic.
- **Never skip Stage 1 or 2.** Junk and secrets accumulate silently;
  the audit cost is low.

## Anti-patterns

- **Filing every observation as memory.** If a fact is easy to re-derive
  from the codebase or a `mempalace_search` of `transcripts`, don't file
  it. Memory is for things that aren't trivially recoverable.
- **Creating a skill from a one-off task.** Skills are for recurring
  patterns. If you wouldn't want to load this skill on a similar future
  task, don't create it.
- **Patching memory you didn't write.** Other writers (user-profile
  mirror, other agents) own their drawers. Don't replace their entries
  without a strong reason.
- **Saving stale task state.** "Currently on Step 4", "PR #X merged",
  "branch refactor/foo at SHA abc" — all stale within days. These
  belong in `transcripts`, not memory.
- **Imperative skill descriptions.** A skill's description should
  describe what it covers, not command the agent. The description
  is what shows up in `skills_list`; it should help future-you decide
  whether to load.
- **Bypassing `mempalace_check_duplicate`.** Duplicate drawers pollute
  retrieval. Always dedup-check before `mempalace_promote_learning`.

## Pitfalls

- **MemPalace writer_id scoping**: deletes are scoped by writer_id.
  When you `mempalace_delete_drawer`, you can only delete drawers your
  current writer_id owns. If a deletion fails with "not found" but the
  drawer is clearly there, check the drawer's writer_id — another
  agent or a different profile likely wrote it. Don't fight it; file
  it as an open question for the user.
- **MemPalace duplicate threshold**: the default 0.9 is conservative.
  Two drawers about the same topic with different wording will both
  pass dedup. Tighten to 0.8 when you suspect near-duplicates.
- **Skill paths**: skills live under `/data/skills/` (HERMES_HOME-scoped).
  They are NOT versioned in any repo, so `skill_manage(action='create')`
  doesn't need git. They survive across sessions but not across
  fresh container rebuilds unless `/data` is mounted as a volume.
  Worth noting if the user wants to share them.
- **Cron-job skill references**: cron jobs reference skills by name.
  If you delete or rename a skill that a cron job depends on, the
  cron's next run will fail to load it. Search `~/.hermes/cron/` for
  skill references before deleting.
- **Pinned skills**: skills can be pinned. `skill_manage(action='delete')`
  on a pinned skill refuses with a message pointing at `hermes curator
  unpin`. Don't try to work around; report to user.
- **Stage 4 creating bloat**: if a task surfaces 3+ skill candidates,
  consider whether they're really 3 skills or 1 skill with sections.
  Bias toward fewer, larger skills. Each skill is a load decision the
  future agent has to make.

## Worked example

The pattern was first systematically applied at the end of the
programmer-focus-trim refactor (May 2026). That session:

- Stage 1: deleted 6 junk smoke-test drawers from `bug-patterns`.
- Stage 2: audited 40 drawers, 0 secret findings.
- Stage 3: filed 3 new drawers (1 project-convention about bulk-order
  test flakes, 1 skill-candidate about function-body stubbing, 1
  decision about the refactor branch state).
- Stage 4: created 3 new skills (`applying-security-audit-findings`,
  `trim-safe-feature-removal`, `hermes-multi-repo-commit-chain`),
  patched 0 (the existing `large-refactor-test-triage` was already
  complete and accurate).
- Stage 5: summary table in the terminal.

Total time: ~15 minutes for the housekeeping pass at the end of a
multi-hour refactor. The user asked once; the next time this trigger
fires, it runs end-to-end without further prompting.
