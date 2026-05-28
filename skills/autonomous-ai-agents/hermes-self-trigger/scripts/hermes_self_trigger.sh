#!/bin/bash
# hermes_self_trigger.sh
# Trigger a full Hermes LLM cycle via the API server.
# Usage: ./hermes_self_trigger.sh "YOUR PROMPT" [session_id]
#
# The triggered agent runs in the full gateway context:
# - Full MemPalace prefetch
# - Full MCP tools (mcp-steroid, mcp-index, mcp-debugger if configured)
# - Full user profile and memory
# - All configured skills
#
# Requirements:
# - Hermes gateway must be running with api_server platform enabled
# - API_SERVER_PORT defaults to 8642

set -euo pipefail

PROMPT="${1:-}"
SESSION_ID="${2:-}"
API_PORT="${API_SERVER_PORT:-8642}"
API_HOST="${API_SERVER_HOST:-127.0.0.1}"
KEY_FILE="${HERMES_HOME:-$HOME/.hermes}/api_server.key"
API_URL="http://${API_HOST}:${API_PORT}/v1/chat/completions"

if [ -z "$PROMPT" ]; then
  echo "Usage: $0 \"PROMPT\" [session_id]" >&2
  exit 1
fi

# Build auth header if key exists
AUTH_HEADER=""
if [ -f "$KEY_FILE" ]; then
  API_KEY=$(cat "$KEY_FILE")
  AUTH_HEADER="-H \"Authorization: Bearer $API_KEY\""
fi

# Build request body
if [ -n "$SESSION_ID" ]; then
  BODY=$(python3 -c "
import json, sys
prompt = sys.argv[1]
sid = sys.argv[2]
print(json.dumps({'messages': [{'role': 'user', 'content': prompt}], 'session_id': sid}))
" "$PROMPT" "$SESSION_ID")
else
  BODY=$(python3 -c "
import json, sys
prompt = sys.argv[1]
print(json.dumps({'messages': [{'role': 'user', 'content': prompt}]}))
" "$PROMPT")
fi

echo "Triggering Hermes LLM cycle at $API_URL ..." >&2
if [ -f "$KEY_FILE" ]; then
  RESPONSE=$(curl -sf "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $(cat "$KEY_FILE")" \
    -d "$BODY")
else
  RESPONSE=$(curl -sf "$API_URL" \
    -H "Content-Type: application/json" \
    -d "$BODY")
fi

# Extract the response text (OpenAI format)
echo "$RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
choices = data.get('choices', [])
if choices:
    print(choices[0].get('message', {}).get('content', ''))
else:
    print(json.dumps(data))
"
