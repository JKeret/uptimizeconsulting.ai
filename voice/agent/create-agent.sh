#!/usr/bin/env bash
#
# create-agent.sh -- create or update the "Ava" ElevenLabs Conversational AI
# agent (Uptimize Consulting inbound intake line) from agent/agent-config.json.
#
# Ported from lanefit/agent/create-agent.sh (doc-verified 2026-07-15) --
# same endpoints, same auth, same create-vs-update-via-.agent-id shape, same
# _doc_verification-stripping. See agent-config.json's own "_doc_verification"
# key for what's confirmed vs. still-open pending a live API response
# (data_collection's wrapper key, and whether a per-agent
# platform_settings.post_call_webhook.webhook_url is honored vs. needing to be
# set via the workspace-wide Settings page instead:
# https://elevenlabs.io/app/agents/settings -- that page is the fallback if
# this script's webhook_url is rejected or silently ignored by a live 200).
#
#   - https://elevenlabs.io/docs/api-reference/agents/create
#       POST https://api.elevenlabs.io/v1/convai/agents/create, auth via
#       "xi-api-key" header, JSON body containing conversation_config +
#       platform_settings (+ optional top-level "name").
#   - https://elevenlabs.io/docs/api-reference/agents/update
#       PATCH https://api.elevenlabs.io/v1/convai/agents/{agent_id}, same auth
#       header and body shape as create.
#
# Usage:
#   ELEVENLABS_API_KEY=xi-... ./voice/agent/create-agent.sh
#
# Behavior:
#   - Missing ELEVENLABS_API_KEY -> print an error and exit 1 (this is the
#     only runnable path today; real create/update calls are gated on a live
#     key -- see the "WHEN THE KEY ARRIVES" checklist at the top of
#     test-calls.md).
#   - If voice/agent/.agent-id already exists, PATCH the existing agent.
#   - Otherwise POST a new agent and save the returned id to
#     voice/agent/.agent-id.
#   - The top-level "_doc_verification" key in agent-config.json is local
#     documentation only (JSON has no comment syntax); it is stripped via jq
#     before anything goes over the wire, so the API never sees it.
#   - Both branches validate the HTTP status (2xx) and exit 1 with the
#     response body on failure.
#   - Prints the agent id on success.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/agent-config.json"
AGENT_ID_FILE="${SCRIPT_DIR}/.agent-id"
API_BASE="https://api.elevenlabs.io/v1/convai/agents"

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "Error: ELEVENLABS_API_KEY environment variable is not set." >&2
  echo "Set it and re-run, e.g.:" >&2
  echo "  ELEVENLABS_API_KEY=xi-your-key-here $0" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Error: config file not found at ${CONFIG_FILE}" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required (used to strip the _doc_verification key from the wire payload)." >&2
  exit 1
fi

if grep -q '"voice_id": "VOICE_ID_TBD"' "${CONFIG_FILE}"; then
  echo "Warning: agent-config.json still has the VOICE_ID_TBD placeholder." >&2
  echo "  Pick a real voice in the ElevenLabs dashboard first (see test-calls.md's" >&2
  echo "  WHEN THE KEY ARRIVES checklist) -- proceeding anyway will create/update" >&2
  echo "  the agent with an invalid voice_id." >&2
fi

# The wire payload must not contain local documentation/marker keys.
PAYLOAD="$(jq 'del(._doc_verification)' "${CONFIG_FILE}")"

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "${RESPONSE_FILE}"' EXIT

if [[ -f "${AGENT_ID_FILE}" ]]; then
  AGENT_ID="$(cat "${AGENT_ID_FILE}")"
  echo "Existing agent id found (${AGENT_ID}); updating via PATCH..." >&2
  HTTP_CODE="$(curl -sS -o "${RESPONSE_FILE}" -w '%{http_code}' -X PATCH "${API_BASE}/${AGENT_ID}" \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
    -H "Content-Type: application/json" \
    --data-binary "${PAYLOAD}")"

  if [[ "${HTTP_CODE}" != 2* ]]; then
    echo "Error: PATCH failed with HTTP ${HTTP_CODE}:" >&2
    cat "${RESPONSE_FILE}" >&2
    exit 1
  fi
else
  echo "No existing agent id found; creating a new agent via POST..." >&2
  HTTP_CODE="$(curl -sS -o "${RESPONSE_FILE}" -w '%{http_code}' -X POST "${API_BASE}/create" \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
    -H "Content-Type: application/json" \
    --data-binary "${PAYLOAD}")"

  if [[ "${HTTP_CODE}" != 2* ]]; then
    echo "Error: create failed with HTTP ${HTTP_CODE}:" >&2
    cat "${RESPONSE_FILE}" >&2
    exit 1
  fi

  AGENT_ID="$(jq -r '.agent_id // empty' "${RESPONSE_FILE}")"

  if [[ -z "${AGENT_ID}" ]]; then
    echo "Error: HTTP ${HTTP_CODE} but could not parse agent_id from response:" >&2
    cat "${RESPONSE_FILE}" >&2
    exit 1
  fi

  printf '%s' "${AGENT_ID}" > "${AGENT_ID_FILE}"
fi

echo "Agent id: ${AGENT_ID}"
cat "${RESPONSE_FILE}"
echo
