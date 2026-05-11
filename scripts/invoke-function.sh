#!/usr/bin/env bash
# invoke-function.sh
# 범용 Edge Function 호출 스크립트
#
# 사용법:
#   ./scripts/invoke-function.sh <function-name> [json-payload]
#
# 예시:
#   ./scripts/invoke-function.sh process-jobs '{"batch_size":10}'
#   ./scripts/invoke-function.sh collect-disclosures

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env.local not found at ${ENV_FILE}" >&2
  exit 1
fi

# Source .env.local (ignore empty lines and comments)
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  export "$key=${value//\"/}"
done < "$ENV_FILE"

FUNCTION_NAME="${1:-}"
PAYLOAD="${2:-{}}"

if [[ -z "$FUNCTION_NAME" ]]; then
  echo "Usage: $0 <function-name> [json-payload]" >&2
  echo "Example: $0 process-jobs '{\"batch_size\":10}'" >&2
  exit 1
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ -z "$SUPABASE_URL" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local" >&2
  exit 1
fi

ENDPOINT="${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}"

echo "→ Invoking: ${FUNCTION_NAME}"
echo "→ Payload: ${PAYLOAD}"
echo "→ Endpoint: ${ENDPOINT}"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${ENDPOINT}" \
  -H "Authorization: Bearer sb_publishable_e9qIiFlG_ThCGVkZCxBeDw_vGTcL-9s" \
  -H 'apikey: sb_publishable_e9qIiFlG_ThCGVkZCxBeDw_vGTcL-9s' \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}")

BODY=$(echo "$RESPONSE" | sed '$d')
STATUS=$(echo "$RESPONSE" | tail -n1)

echo "← HTTP ${STATUS}"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

if [[ "$STATUS" -ge 400 ]]; then
  exit 1
fi
