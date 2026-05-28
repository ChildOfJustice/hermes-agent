---
name: hermes-self-trigger
description: "Trigger a new full Hermes LLM cycle from inside a session, cron job, background script, or external process. Covers all three verified methods: API server POST, hermes -z subprocess, and background process watch-notification injection."
version: 1.0.0
author: Hermes Agent (Nous Research)
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [autonomous, self-trigger, background, scheduling, night-agent, api-server, full-llm-cycle]
    related_skills: [hermes-cron-autonomous-agents, mcp-junie-delegation]
---

# Hermes Self-Trigger

How to make Hermes trigger a new FULL LLM cycle for itself — with full memory,
full MCP, and full session context — not just a stripped cron subagent.

This answers the question: "How can Hermes (or a background script or cron job)
kick off a new full Hermes session that has everything the main agent has?"

---

## Background: Why This Matters

Standard cron jobs (`cronjob` tool) create a blank-slate subagent:
  - NO MemPalace prefetch
  - NO MCP servers (mcp-index, mcp-steroid, mcp-debugger)
  - NO conversation history
  - NO user profile in context

A "full LLM cycle" means the same Hermes process that runs when the user
sends a Telegram message: full gateway session, full memory, full MCP tools.

---

## The Three Mechanisms

### Method 1 — API Server POST (PRIMARY — best for scripts and cron jobs)

The Hermes gateway runs an aiohttp HTTP server at `127.0.0.1:8642` (configurable
via `API_SERVER_PORT` env / `api_server.host`/`api_server.port` config).

Endpoint: `POST /v1/chat/completions`
Format: OpenAI Chat Completions JSON

```bash
# Minimal trigger — starts a fresh full LLM session, delivers result back
curl -s http://127.0.0.1:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "YOUR PROMPT HERE"}]}'
```

To continue an existing session (agent has full history + memory):
```bash
curl -s http://127.0.0.1:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Hermes-Session-Id: <session_id>" \
  -d '{"messages": [{"role": "user", "content": "YOUR PROMPT"}]}'
```

To trigger and have the result delivered to Telegram (or current platform):
  - The API server creates a new session scoped to the API_SERVER platform.
  - Use the send_message tool inside the prompt to deliver results back.
  - Or use the gateway's `deliver` mechanism from cron (see Method 3).

AUTHENTICATION: If `API_SERVER_KEY` is configured (check `~/.hermes/.env` or
config), add the header: `-H "Authorization: Bearer <key>"`
If `HERMES_API_SERVER_AUTO_KEY=1` is set, a key is auto-generated at
`~/.hermes/api_server.key`. Read it: `cat ~/.hermes/api_server.key`

Full async run (non-blocking, with SSE event stream):
```bash
# Start run — returns run_id
RUN=$(curl -s -X POST http://127.0.0.1:8642/v1/runs \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "YOUR PROMPT"}]}')
RUN_ID=$(echo $RUN | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Stream events
curl -s "http://127.0.0.1:8642/v1/runs/$RUN_ID/events"

# Or poll status
curl -s "http://127.0.0.1:8642/v1/runs/$RUN_ID"
```

IMPORTANT: The API_SERVER platform must be enabled in `~/.hermes/config.yaml`:
```yaml
platforms:
  api_server:
    enabled: true
    # host: 127.0.0.1   # default
    # port: 8642         # default
```

### Method 2 — hermes -z Subprocess (CLI mode only / gateway not running)

`hermes -z "PROMPT"` runs a one-shot full agent with all tools and memory loaded.
Use this when the gateway is NOT running and you want a full cycle from a script.

```bash
# Full LLM call, outputs final response to stdout
hermes -z "YOUR PROMPT HERE"

# With specific model/provider
hermes -z "YOUR PROMPT" --model claude-sonnet-4 --provider anthropic

# With specific toolsets
hermes -z "YOUR PROMPT" --toolsets terminal,file,web
```

What -z gets:
  - Full config, memory, skills, AGENTS.md loaded from CWD
  - All tools the profile has access to
  - Auto-approves all tool calls (HERMES_YOLO_MODE=1)
  - Session is ephemeral (no --continue support)
  - Stdout is ONLY the final response (no spinner, no banner)

What -z does NOT get vs gateway:
  - No existing session history / conversation continuity
  - No MCP servers that require the gateway to be running
    (HTTP MCP servers like mcp-index, mcp-steroid are unreachable
     unless they're already running and the gateway MCP config is loaded)
  - Output goes to stdout only — no Telegram/Discord delivery

PITFALL (nested hermes -z in background): If you call `hermes -z` from inside
a background script while the main Hermes gateway is running, the subprocess
spawns a second AIAgent in the same JVM/Python process space. This can cause
memory collisions. Prefer Method 1 (API server) when the gateway is running.

### Method 3 — Background Process + notify_on_complete (trigger from current session)

The most natural pattern when you're in an active Hermes session:

1. Start a background script with `terminal(background=True, notify_on_complete=True)`
2. The script does its work (monitors Junie, waits for a condition, etc.)
3. When the script exits, the gateway calls `_inject_watch_notification()` internally,
   which creates a synthetic `MessageEvent(internal=True)` and routes it through the
   full `GatewayRunner._handle_message()` pipeline — a genuine full LLM cycle.
4. The agent runs with full memory, MCP, and the script's stdout as context.

```python
# Example: background monitor that triggers agent when something completes
terminal(
    command="my_monitoring_script.sh",
    background=True,
    notify_on_complete=True
)
```

This is the mechanism behind `notify_on_complete` — it IS a full LLM cycle,
not a cron subagent. The agent that wakes up is the same gateway agent with
everything loaded.

LIMITATION: Only works from inside an active gateway session. The notification
goes back to the same session/chat where `terminal()` was called.

---

## Self-Scheduling Pattern (Night Agent / Autonomous Loop)

To have Hermes autonomously decide to wake up and do work at night, combine:

1. A NO_AGENT cron job (pure shell, no LLM) that checks a condition:
```python
cronjob(
    action='create',
    no_agent=True,
    schedule='0 3 * * *',   # 3am every night
    script='scripts/night_trigger.sh'
)
```

2. The script checks the condition and POSTs to the API server:
```bash
#!/bin/bash
# night_trigger.sh
# Check if there's pending work
PENDING=$(cat ~/.hermes/night_work_flag 2>/dev/null)
if [ -n "$PENDING" ]; then
  PROMPT="It is now $(date). You have pending autonomous work: $PENDING. 
  Check MemPalace decisions room for TODO items, pick one safe task, 
  implement it, commit, and report back."
  
  curl -s http://127.0.0.1:8642/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $(cat ~/.hermes/api_server.key 2>/dev/null)" \
    -d "{\"messages\": [{\"role\": \"user\", \"content\": $(echo $PROMPT | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}]}"
fi
```

3. Or more simply: use a FULL LLM cron job (not no_agent) with the `deliver='origin'`
   pattern for the prompt and let the agent itself POST to the API server for
   heavyweight work that needs full MCP tools. The cron agent acts as the trigger
   coordinator, while the actual work runs via the API server in the gateway process.

---

## Choosing the Right Method

| Situation | Method | Notes |
|---|---|---|
| Gateway running, need full MCP (mcp-steroid etc.) | API Server (1) | Best option, full gateway context |
| No gateway, script-only, want full tools | hermes -z (2) | MCP HTTP servers unreachable |
| Inside active session, triggered by subprocess | notify_on_complete (3) | Most natural in-session trigger |
| Scheduled autonomous night work | no_agent cron + API POST | Cron checks, API triggers |
| Watch Junie task completion, then do full work | monitor script + notify_on_complete (3) | See mcp-junie-delegation skill |

---

## Critical Limitation: Cron Jobs Are NOT Full Gateway Agents

Cron jobs (created via the `cronjob` tool) build their own `AIAgent` inside
`cron/scheduler.py` with `skip_memory=True` and no MCP connections. They are
isolated subprocesses of the scheduler thread, not the gateway agent.

To get a full gateway agent from a cron job: use Method 1 (POST to API server)
from inside the cron job's script or prompt.

Example cron prompt that triggers a full gateway cycle:
```
Check if there is any urgent night work queued in ~/.hermes/night_work_flag.
If yes, POST to http://127.0.0.1:8642/v1/chat/completions with the work
as a user message. Include authorization if ~/.hermes/api_server.key exists.
Report what you triggered (or "nothing to do") as the cron output.
```

---

## Pitfalls

- API_SERVER must be enabled in config. Check with: `hermes config get platforms`.
- If API_SERVER_KEY is set, all POST requests require `Authorization: Bearer <key>`.
  Auto-key is stored at `~/.hermes/api_server.key` if `HERMES_API_SERVER_AUTO_KEY=1`.
- Nested hermes -z calls from inside a running gateway can cause core dumps.
  Always prefer Method 1 when the gateway is running.
- notify_on_complete works only if the gateway is alive when the script exits.
  If the gateway restarts between script start and exit, the notification is lost.
- The API server creates sessions scoped to `Platform.API_SERVER`. These don't
  automatically deliver to Telegram. Use `send_message` tool in the prompt to
  relay results, or configure `deliver` in a paired cron job.
- A full gateway LLM cycle via the API server counts against your API quota just
  like a user-initiated message. Don't trigger in tight loops.
