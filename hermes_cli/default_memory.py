"""Default MEMORY.md seed written into HERMES_HOME on first run.

Teaches the agent about the two-layer memory system from day one so it
uses MemPalace correctly without first having to discover it by accident.
Compact by design — leaves ~1400 chars for the agent's own accumulated facts.
"""

DEFAULT_MEMORY_MD = (
    "Long-term memory: if MemPalace plugin is active, use mempalace_* tools "
    "(mempalace_search, mempalace_add_drawer, mempalace_promote_learning, "
    "mempalace_status, mempalace_list_drawers, mempalace_delete_drawer, "
    "mempalace_cleanup, mempalace_audit_secrets, mempalace_check_duplicate). "
    "Rooms: decisions, tool-usage, project-conventions, bug-patterns, handoffs, "
    "skill-candidates, diary, transcripts. "
    "Auto-prefetch injects <memory-context> blocks before each turn. "
    "Load skill hermes-mempalace-guide for full usage guide.\n"
    "\u00a7\n"
    "Memory rules: built-in memory (this file) = always-on system prompt, "
    "max 2200 chars, declarative facts only. "
    "MemPalace = semantic long-term store, auto-prefetched. "
    "session_search = recall past conversation context. "
    "Procedures belong in skills not memory. "
    "Never save task progress/PR numbers/commit SHAs here."
)
