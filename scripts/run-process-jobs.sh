#!/usr/bin/env bash
# run-process-jobs.sh
# 대기 중인 파싱/처리 작업 실행
#
# 사용법:
#   ./scripts/run-process-jobs.sh [batch_size]
#
# 예시:
#   ./scripts/run-process-jobs.sh
#   ./scripts/run-process-jobs.sh 10

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BATCH_SIZE="${1:-5}"

PAYLOAD=$(jq -n --argjson bs "$BATCH_SIZE" '{batch_size: $bs}')

echo "Processing jobs with batch_size=${BATCH_SIZE}"
"${SCRIPT_DIR}/invoke-function.sh" process-jobs "$PAYLOAD"
