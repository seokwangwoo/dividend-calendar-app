#!/usr/bin/env bash
# run-collect-disclosures.sh
# TDnet 공시 수집 실행
#
# 사용법:
#   ./scripts/run-collect-disclosures.sh [mode] [limit]
#
# mode: recent | today | yesterday (기본: recent)
# limit: 가져올 공시 개수 (기본: 300)
#
# 예시:
#   ./scripts/run-collect-disclosures.sh
#   ./scripts/run-collect-disclosures.sh today 500

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="${1:-recent}"
LIMIT="${2:-300}"

PAYLOAD=$(jq -n --arg mode "$MODE" --argjson limit "$LIMIT" '{mode: $mode, limit: $limit, format: "json2"}')

echo "Collecting disclosures: mode=${MODE}, limit=${LIMIT}"
"${SCRIPT_DIR}/invoke-function.sh" collect-disclosures "$PAYLOAD"
