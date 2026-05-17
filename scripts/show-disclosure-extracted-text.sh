#!/usr/bin/env bash
# show-disclosure-extracted-text.sh
# ticker 기준으로 disclosures.extracted_text를 조회/출력합니다.
#
# 사용법:
#   ./scripts/show-disclosure-extracted-text.sh <ticker> [limit]
#
# 예시:
#   ./scripts/show-disclosure-extracted-text.sh 9433
#   ./scripts/show-disclosure-extracted-text.sh 9433 1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: .env.local not found at ${ENV_FILE}" >&2
  exit 1
fi

while IFS='=' read -r key value; do
  [[ -z "${key}" || "${key}" =~ ^# ]] && continue
  export "${key}=${value//\"/}"
done < "${ENV_FILE}"

TICKER="${1:-}"
LIMIT="${2:-5}"

if [[ -z "${TICKER}" ]]; then
  echo "Usage: $0 <ticker> [limit]" >&2
  echo "Example: $0 9433 1" >&2
  exit 1
fi

if ! [[ "${LIMIT}" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: limit must be a positive integer" >&2
  exit 1
fi

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ -z "${SUPABASE_URL}" || -z "${SERVICE_ROLE_KEY}" ]]; then
  echo "ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local" >&2
  exit 1
fi

NORMALIZED_TICKER="$(printf '%s' "${TICKER}" | tr '[:lower:]' '[:upper:]' | xargs)"
REST_URL="${SUPABASE_URL%/}/rest/v1/disclosures"

RESPONSE="$(
  curl -sS -G "${REST_URL}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Accept: application/json" \
    --data-urlencode "select=id,title,published_at,parse_status,extracted_text,stocks!inner(ticker,name)" \
    --data-urlencode "stocks.ticker=eq.${NORMALIZED_TICKER}" \
    --data-urlencode "extracted_text=not.is.null" \
    --data-urlencode "order=published_at.desc" \
    --data-urlencode "limit=${LIMIT}"
)"

MATCH_COUNT="$(
  printf '%s' "${RESPONSE}" | jq '[.[] | select((.extracted_text // "") | gsub("^\\s+|\\s+$"; "") | length > 0)] | length'
)"

if [[ "${MATCH_COUNT}" == "0" ]]; then
  echo "No disclosures with non-empty extracted_text found for ticker=${NORMALIZED_TICKER}"
  exit 0
fi

printf '%s' "${RESPONSE}" | jq -r '
  map(select((.extracted_text // "") | gsub("^\\s+|\\s+$"; "") | length > 0))
  | .[]
  | [
      "================================================================",
      "ticker: " + (.stocks.ticker // "-"),
      "name: " + (.stocks.name // "-"),
      "id: " + (.id // "-"),
      "published_at: " + (.published_at // "-"),
      "parse_status: " + (.parse_status // "-"),
      "title: " + (.title // "-"),
      "----------------------------------------------------------------",
      (.extracted_text // ""),
      ""
    ]
  | join("\n")
'
