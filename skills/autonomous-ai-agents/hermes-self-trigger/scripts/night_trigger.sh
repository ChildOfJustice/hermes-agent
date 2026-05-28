#!/bin/bash
# night_trigger.sh
# Scheduled night agent trigger — runs as a no_agent cron job.
# Checks for pending work and fires a full Hermes LLM cycle via API server.
#
# Deploy as a no_agent cron job:
#   schedule: "0 3 * * *"  (3am every night)
#   no_agent: true
#   script: scripts/night_trigger.sh
#
# The script produces stdout ONLY when there's something to trigger.
# Hermes delivers non-empty stdout as a message per no_agent delivery semantics.

set -uo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
WORK_FLAG="$HERMES_HOME/night_work_flag"
API_PORT="${API_SERVER_PORT:-8642}"
API_HOST="${API_SERVER_HOST:-127.0.0.1}"
KEY_FILE="$HERMES_HOME/api_server.key"
API_URL="http://${API_HOST}:${API_PORT}/v1/chat/completions"

# Check if gateway API server is reachable
if ! curl -sf "http://${API_HOST}:${API_PORT}/health" > /dev/null 2>&1; then
  # Silent exit — gateway not running, nothing to do
  exit 0
fi

# Check for pending work flag (set by user or agent earlier)
PENDING=""
if [ -f "$WORK_FLAG" ]; then
  PENDING=$(cat "$WORK_FLAG")
  rm -f "$WORK_FLAG"  # Consume the flag
fi

# Fall back to MemPalace TODO check via hermes -z (light check)
if [ -z "$PENDING" ]; then
  PENDING=$(hermes -z "Search MemPalace decisions room for items with status [TODO] that are safe for autonomous work (no user decisions needed, no balance changes, no UI changes, no multiplayer). Return ONLY the task name and one-line description if found, or NOTHING if nothing safe is available." 2>/dev/null | grep -v "^$" | head -3)
fi

if [ -z "$PENDING" ]; then
  # Silent — nothing to do
  exit 0
fi

# Build the prompt for the full LLM cycle
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
PROMPT="NIGHT AGENT TRIGGER — $TIMESTAMP

Autonomous work requested:
$PENDING

Instructions:
1. Search MemPalace decisions room for the task. Confirm it is safe to do autonomously (no design decisions, no balance changes, bounded scope).
2. If safe: implement the minimal correct change. No debug prints.
3. Run tests if applicable. Commit with: git commit -m 'chore(night-agent): <description>'
4. Never git push. Never create new branches.
5. Send a report to the user via Telegram using the send_message tool.

Report format:
Night Agent Report ($TIMESTAMP)
Task done: <one line>
Files changed: <list>
Commit: <git log --oneline -1>
Why chosen: <reason>

If nothing was safe to do, report that clearly and suggest one concrete next step."

# Build JSON body
BODY=$(python3 -c "
import json, sys
print(json.dumps({'messages': [{'role': 'user', 'content': sys.argv[1]}]}))
" "$PROMPT")

# Fire the full LLM cycle
if [ -f "$KEY_FILE" ]; then
  curl -sf "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $(cat "$KEY_FILE")" \
    -d "$BODY" > /dev/null 2>&1 &
else
  curl -sf "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$BODY" > /dev/null 2>&1 &
fi

echo "Night agent triggered at $TIMESTAMP. Work: $PENDING"
