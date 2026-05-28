---
name: hermes-ide-mcp-tools
description: "Use mcp-steroid, mcp-index, and mcp-debugger — three IntelliJ-backed MCP servers that give Hermes full IDE control: semantic code navigation, live debugging, refactoring, and IDE automation. Load for any task involving an open IntelliJ/IDEA project."
version: 1.0.0
author: Hermes Agent (Nous Research)
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [intellij, mcp, ide, mcp-steroid, mcp-index, mcp-debugger, code-navigation, debugging, refactoring]
    related_skills: [native-mcp]
---

# Hermes IDE MCP Tools

Three MCP servers expose the live IntelliJ IDE to Hermes agents. When
connected, they replace grep/find/read-file for code work: they speak PSI
(the IDE's parsed syntax tree), use the IDE's live index, and keep VFS/PSI
consistent across edits.

These servers are HTTP MCP servers — they require a running IntelliJ instance.
They are configured in `~/.hermes/config.yaml` under `mcp_servers` and loaded
via Hermes's native MCP client.

---

## Server Map

  mcp-index     Indexed code search and navigation
                Typical HTTP URL: http://127.0.0.1:29170/index-mcp/streamable-http
                Tool prefix in Hermes: mcp_mcp_index_ide_*

  mcp-debugger  Real debug sessions (DAP-style)
                Typical HTTP URL: http://127.0.0.1:29190/debugger-mcp/streamable-http
                Tool prefix in Hermes: mcp_mcp_debugger_*

  mcp-steroid   Full IDE control via Kotlin execution
                Typical HTTP URL: http://localhost:6315/mcp
                Tool prefix in Hermes: mcp_mcp_steroid_*

Tool names in Hermes normalize hyphens to underscores. The server key in
config.yaml may use hyphens (e.g. "mcp-index"), but the tool names will be
mcp_mcp_index_ide_find_class etc.

---

## Checking Tool Availability

Before any IDE work, verify the servers are connected:

  mcp_mcp_index_ide_index_status()
  # isDumbMode: false + isIndexing: false = ready

If tools are missing after a /reload-mcp, the gateway may have hit a timing
race. Verify the ports are still listening, then send /reload-mcp again:

  # Check ports (adjust numbers to your actual config)
  ss -tlnp | grep -E "6315|29170|29190"
  # All three should show LISTEN

---

## mcp-index — Fast Semantic Code Search

Use FIRST for any code navigation or search task. Much faster and semantically
richer than terminal grep — it uses the IDE's live FTS5 index.

### Key Tools

  ide_find_class(query, scope="project_files", project_path=...)
      Find classes/interfaces by name. Supports camelCase ("USvc" → "UserService"),
      substring, and wildcards ("User*Impl").

  ide_find_file(query, scope="project_files", project_path=...)
      Find files by name glob. Also works as a fast directory listing.

  ide_find_references(file, line, column, project_path=...)
  ide_find_references(language="Java", symbol="com.example.Foo#bar", project_path=...)
      All usages of a symbol across the project. Returns file, line, context, type.

  ide_find_definition(file, line, column, project_path=...)
      Go-to-definition for any symbol. Returns file path, line, code preview.

  ide_find_implementations(file, line, column, project_path=...)
      Concrete implementations of an interface or abstract class/method.

  ide_type_hierarchy(className="com.example.Foo", project_path=...)
      Full inheritance tree — supertypes up, subtypes down.

  ide_call_hierarchy(file, line, column, direction="callers", project_path=...)
      Callers (who calls this) or callees (what this calls). Depth up to 5.

  ide_search_text(query, filePattern="*.kt", context="code", project_path=...)
      Regex or exact text search with file and context filters.
      context: "code", "comments", "strings", or "all".

  ide_diagnostics(file=..., includeBuildErrors=True, project_path=...)
      Errors, warnings, intentions, build output, test results.

  ide_index_status(project_path=...)
      Check if indexing is in progress. If isDumbMode=true: wait and retry.

  ide_sync_files(paths=[...], project_path=...)
      Force VFS refresh after files written by terminal/patch tools.
      CALL THIS after every external edit before the next semantic query.

### Pitfalls (mcp-index)

  Multiple projects open simultaneously:
    Any call without project_path returns "multiple_projects_open" error.
    ALWAYS pass the full absolute path: project_path="/absolute/path/to/project"

  Stale index after external edits:
    Files written by terminal, patch, or write_file bypass the IDE's VFS.
    Call ide_sync_files(paths=[...]) before any subsequent semantic query
    (find_references, find_implementations, call_hierarchy, etc.).

  isDumbMode = true:
    The IDE is indexing. All index-based tools return empty or stale results.
    Call ide_index_status() and wait until isDumbMode=false before proceeding.

  Pagination:
    Large codebases return nextCursor. Pass it back for subsequent pages.

---

## mcp-debugger — Real Debug Sessions

Full DAP-style debugging: breakpoints, stepping, variable inspection,
expression evaluation.

### Standard Workflow

  1. list_run_configurations(project_path=...)
        Discover available run/debug configs.

  2. start_debug_session(configuration_name="...", project_path=...)
        Launch the debugger. Returns session_id.

  3. set_breakpoint(file_path="...", line=N, project_path=...)
        Set a breakpoint. Optional: condition, log_message, suspend_policy.
        suspend_policy="none" + log_message="x={x}" = non-stopping tracepoint.

  4. resume_execution(project_path=...)
        Run until next breakpoint or exception.

  5. wait_for_pause(timeout=30, project_path=...)
        Block until paused. Use instead of polling get_debug_session_status.
        Pass breakpoint_ids=[...] to auto-resume on non-matching pauses.

  6. get_debug_session_status(project_path=...)
        Current location, variables, stack, source context.

  7. get_variables(frame_index=0, project_path=...)
  8. evaluate_expression(expression="...", project_path=...)
        Inspect state. evaluate_expression can call methods in Java/Kotlin/Python/JS.
        Limited in native languages (Rust/C++/Go) — variable inspection works,
        method calls may not.

  9. step_over / step_into / step_out
  10. select_stack_frame(frame_index=N) — inspect caller's variables
  11. stop_debug_session — clean up always

### Tips

  wait_for_pause is the key tool — always use it after resume/step instead of
  polling. It blocks until the session actually pauses.

  list_run_configurations first — never guess config names.

  Conditional breakpoints: set_breakpoint(condition="count > 10") — only
  suspends when the expression is true.

  set_variable — modify state mid-debug to test fixes without restarting.

---

## mcp-steroid — Full IDE Automation

The most powerful server. Executes Kotlin code against the live IntelliJ JVM:
PSI manipulation, refactoring, build triggers, SDK registration, anything the
IDE API supports.

### Before Every mcp-steroid Task

  1. Call steroid_list_projects() to get the correct project_name string.
     Never guess it. Project names returned here are the only valid values.

  2. Call ide_index_status() via mcp-index to confirm isDumbMode=false.
     steroid_execute_code blocks when the Kotlin compiler queue is occupied
     (indexing, Gradle sync, previous timed-out script still queued).

### The Three Core Tools

  steroid_apply_patch (preferred for edits)
      Atomic multi-file literal-text edits. No Kotlin compilation overhead.
      Pre-flight validates every old_string is unique before any edit lands.
      All-or-nothing: if any hunk fails, nothing changes.
      Use for: 2+ file edits, refactoring patterns, bulk replacements.

      {
        "project_name": "my-project",
        "task_id": "fix-123",
        "hunks": [
          {"file_path": "/abs/path/A.kt", "old_string": "...", "new_string": "..."},
          {"file_path": "/abs/path/B.kt", "old_string": "...", "new_string": "..."}
        ]
      }

  steroid_execute_code (for IDE API work)
      Run arbitrary Kotlin in the IDE JVM. Full IntelliJ API access.
      The script body is a suspend function — never use runBlocking.
      Always end with println(...) — bare expressions print nothing.

      DEFAULT TIMEOUT: pass timeout=30 for regular scripts.
      Long operations: Gradle sync → timeout=600, build → timeout=120,
      tests → timeout=300.

      Threading: required every script, the IDE forgets context between calls.

        readAction { }           — any PSI read, FilenameIndex, reference search
        writeAction { }          — VFS writes (VfsUtil.saveText)
        writeIntentReadAction { } — refactoring processors (.run())

      Example — read and edit a file:
        val vf = findProjectFile("src/main/kotlin/Foo.kt")!!
        val text = String(vf.contentsToByteArray(), vf.charset)
        val updated = text.replace("OLD", "NEW")
        check(updated != text) { "no match" }
        writeAction { VfsUtil.saveText(vf, updated) }
        println("done")

      Example — find files by extension:
        val files = readAction {
          FilenameIndex.getAllFilesByExt(project, "kt", projectScope())
            .filter { it.path.contains("/main/kotlin/") }
            .map { it.path }
        }
        println(files.joinToString("\n"))

      Example — compile check after edits:
        import com.intellij.task.ProjectTaskManager
        import org.jetbrains.concurrency.await
        val result = ProjectTaskManager.getInstance(project).buildAllModules().await()
        println("errors=${result.hasErrors()}, aborted=${result.isAborted()}")

  steroid_take_screenshot + steroid_input (visual control)
      Screenshot captures the IDE + saves screenshot-tree.md (accessibility tree)
      and screenshot-meta.json alongside the image.
      grep screenshot-tree.md to find UI element positions without pixel-guessing:
        grep -i "button\|configure\|SDK" screenshot-tree.md

      steroid_input sends keyboard/mouse events:
        sequence: "press:CTRL+P, type:MyClass, delay:500"

### Decision Table: Which Tool for Which Task

  Find files by name or extension    → ide_find_file or readAction { FilenameIndex }
  Search text inside files           → ide_search_text (IDE index, not grep)
  Find all references to a symbol    → ide_find_references
  Read file content                  → findProjectFile + contentsToByteArray
  Edit 1 site in 1 file              → steroid_execute_code with .replace()
  Edit 2+ sites or 2+ files          → steroid_apply_patch (atomic, faster)
  Refactoring (rename, move, delete) → steroid_execute_code with processor
  Compile check                      → steroid_execute_code with ProjectTaskManager
  Run/Debug a config                 → mcp-debugger start_debug_session
  Inspect variables at a breakpoint  → mcp-debugger get_variables / evaluate_expression
  Trigger IDE action by ID           → steroid_action_discovery then steroid_execute_code

### steroid_execute_code Pitfalls

  Script ends with a bare expression → nothing printed.
  Always end with println(...) or printJson(...).

  readAction missing → "Read access is allowed from inside read-action only" crash.
  Add readAction { } around EVERY PSI/FilenameIndex/ReferencesSearch call.
  The IDE does not carry read-action context between script invocations.

  Timeout ~30s with "compiler blocked" error:
    Check ide_index_status() — if isDumbMode=true, wait for indexing to finish.
    If multiple scripts timed out in a row: wait 30-60s for the compiler queue
    to drain, then send a minimal ping: println("ping: ${System.currentTimeMillis()}")
    If even the ping times out: ask the user to restart IntelliJ from the GUI.

  java.io.File / Files.walk / ProcessBuilder banned inside execute_code:
    Use FilenameIndex and findProjectFile instead of filesystem APIs.
    Use terminal() for shell commands — don't spawn processes from inside steroid.

  VFS stale after steroid_apply_patch or external edits:
    Call ide_sync_files() via mcp-index before any subsequent semantic query.
    steroid_execute_code auto-refreshes VFS before and after each run, but
    mcp-index tools won't see changes until an explicit sync.

  Two projects open simultaneously:
    steroid_list_projects() returns all open project names.
    Pass the correct project_name to every call — never omit it.

### Fetching Skill Guides for Complex IDE Work

For advanced operations, fetch the skill guide before writing code:

  steroid_fetch_resource(uri="mcp-steroid://prompt/skill", project_name="...")
  steroid_fetch_resource(uri="mcp-steroid://skill/coding-with-intellij", project_name="...")
  steroid_fetch_resource(uri="mcp-steroid://skill/coding-with-intellij-psi", project_name="...")

---

## Configuration in ~/.hermes/config.yaml

The three servers are HTTP MCP servers. Example config:

  mcp_servers:
    mcp-index:
      transport: streamable_http
      url: http://127.0.0.1:29170/index-mcp/streamable-http
    mcp-debugger:
      transport: streamable_http
      url: http://127.0.0.1:29190/debugger-mcp/streamable-http
    mcp-steroid:
      transport: streamable_http
      url: http://localhost:6315/mcp

After adding/changing this config, send /reload-mcp in the Hermes chat.
If the reload misses servers (timing race), send /reload-mcp a second time.

---

## After IntelliJ Restart

When IntelliJ restarts (update, crash, manual restart):
  1. Wait for the MCP server ports to come up:
       until curl -sf http://localhost:6315/mcp > /dev/null 2>&1; do sleep 2; done
  2. Send /reload-mcp in Hermes to reconnect all three servers.
  3. If the first reload misses any (timing race), send /reload-mcp again.
  4. Verify: ide_index_status() returns isDumbMode=false before IDE work.
